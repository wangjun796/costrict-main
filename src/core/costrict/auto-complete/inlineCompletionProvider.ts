import {
	InlineCompletionItemProvider,
	InlineCompletionItem,
	TextDocument,
	Position,
	Range,
	InlineCompletionContext,
	CancellationToken,
	ExtensionContext,
	Disposable,
	InlineCompletionList,
	SelectedCompletionInfo,
} from "vscode"
import * as vscode from "vscode"
import { v7 as uuidv7 } from "uuid"
import { CompletionProvider, AutoCompleteInput, CompletionErrorHandler } from "./core/completionProvider"
import { CompletionStatusBar } from "./statusBar"
import type { InlineCompletionHost } from "./host"
import { extractPrefixSuffix, getDependencyImports } from "./utils"
import { getWorkspacePath, toRelativePath } from "../../../utils/path"
import { AutocompleteOutcome, CalculateHideScore } from "./types"
import { LangSetting, LangSwitch } from "../base/common/lang-util"
import { RecentlyEditedTracker } from "./context/recentlyEditedTracker"
import { RecentlyVisitedRangesService } from "./context/recentlyVisitedRangesService"
import { getAstContext } from "./context/astContextProvider"
import { VsCodeIde } from "./core/VSCodeIde"
import { IDE } from "./types/ide"
import { getAllSnippets } from "./snippets"
import { openedFilesLruCache } from "./utils/openedFilesLruCache"
import { EXPERIMENT_IDS, experiments as experimentsUtil } from "../../../shared/experiments"
import { TelemetryService } from "@roo-code/telemetry"
import { CodeCompletionError } from "../telemetry"
import { TextAcceptanceAction } from "./utils/autocompleteLoggingService"
import { Package } from "shared/package"
import { CompletionTrace } from "./fim/debug"
import type { CompletionPosition } from "./core/completionProvider"

export class InlineCompletionProvider implements InlineCompletionItemProvider {
	private completionProvider: CompletionProvider
	private disposables: Disposable[] = []
	private ide: IDE
	private recentlyEditedTracker: RecentlyEditedTracker
	private recentlyVisitedRanges: RecentlyVisitedRangesService
	private completionStatusBar: CompletionStatusBar

	constructor(
		private readonly context: ExtensionContext,
		private readonly host: InlineCompletionHost,
	) {
		this.ide = new VsCodeIde(context)
		this.recentlyEditedTracker = new RecentlyEditedTracker(this.ide)
		this.recentlyVisitedRanges = new RecentlyVisitedRangesService(this.ide)
		this.completionStatusBar = CompletionStatusBar.getInstance()
		const onError: CompletionErrorHandler = (error) => {
			this.host.log(`[Completion Error]: ${error}`)
			TelemetryService.instance.captureError(`TabCompletion_${CodeCompletionError.ApiError}`)
			this.completionStatusBar.fail(error as any)
		}
		this.completionProvider = new CompletionProvider(onError, () => this.host.isCostrictLoggedIn())
		this._setupActiveTextEditorChangeListener()
		this._setupCursorMoveCancellation()
	}

	/**
	 * 光标位置发生变化时取消上一次未完成的补全。
	 *
	 * 补全结果只对触发它的那个光标位置有意义；一旦光标移动，旧请求即使返回
	 * 也不应该再被显示（在「永不超时」模式下尤其重要，否则慢请求会把过期
	 * 结果插到新位置上）。
	 */
	private _setupCursorMoveCancellation(): void {
		this.disposables.push(
			vscode.window.onDidChangeTextEditorSelection((event) => {
				// 多光标场景下不做补全，也不需要取消逻辑
				if (event.selections.length !== 1) {
					return
				}
				const active = event.selections[0].active
				const position: CompletionPosition = {
					uri: event.textEditor.document.uri.toString(),
					line: active.line,
					character: active.character,
				}
				// 光标没动说明这个事件只是当前请求自身的产物，不能取消自己
				if (!this.completionProvider.isPositionChanged(position)) {
					return
				}
				this.completionProvider.cancelInflight("-", `cursor moved to ${active.line}:${active.character}`)
			}),
		)
	}

	public async provideInlineCompletionItems(
		document: TextDocument,
		position: Position,
		context: InlineCompletionContext,
		token: CancellationToken,
	): Promise<InlineCompletionItem[] | InlineCompletionList> {
		// 用 completionId 的前半段做 gate 阶段的日志关联（此时还没生成 id）
		const trace = new CompletionTrace("gate")
		const abortController = new AbortController()
		const signal = abortController.signal
		token.onCancellationRequested(() => {
			abortController.abort()
		})

		trace.step("gate", "provider triggered", {
			file: document.uri.toString(true),
			pos: `${position.line}:${position.character}`,
			language: document.languageId,
			triggerKind: context.triggerKind,
		})

		if (!(await this.isProviderSupported())) {
			trace.end("gate", "provider not supported (apiProvider)")
			this.completionStatusBar.notSupport()
			return []
		}
		if (document.uri.scheme === "vscode-scm") {
			trace.end("gate", "scm document, skipped")
			return []
		}

		const editor = vscode.window.activeTextEditor
		if (!editor) {
			trace.end("gate", "no active editor")
			return []
		}
		// Don't autocomplete with multi-cursor
		if (editor && editor.selections.length > 1) {
			trace.end("gate", "multi-cursor, skipped")
			return []
		}

		const selectedCompletionInfo = context.selectedCompletionInfo

		// This code checks if there is a selected completion suggestion in the given context and ensures that it is valid
		// To improve the accuracy of suggestions it checks if the user has typed at least 4 characters
		// This helps refine and filter out irrelevant autocomplete options
		if (selectedCompletionInfo) {
			const { text, range } = selectedCompletionInfo
			const typedText = document.getText(range)

			const typedLength = range.end.character - range.start.character

			if (typedLength < 4) {
				trace.end("gate", "typed length < 4")
				return []
			}

			if (!text.startsWith(typedText)) {
				trace.end("gate", "selected completion info mismatch")
				return []
			}
		}

		this.completionStatusBar.loading()
		let triggerMode = "auto"
		if (this.context.workspaceState.get("shortCutKeys") === true) {
			triggerMode = "manual"
			this.context.workspaceState.update("shortCutKeys", false)
		}
		if (!this.isCompletionAllowed(triggerMode, document.languageId)) {
			trace.end("gate", "completion not allowed", { triggerMode, language: document.languageId })
			this.completionStatusBar.noSuggest()
			return []
		}

		const input = await this._prepareInput(document, position)

		// _prepareInput 是异步的（剪贴板 / AST / 最近编辑范围），期间光标可能
		// 已经移动，此时这份输入已经失效，直接丢弃，避免把过期结果插到新位置。
		if (signal.aborted || this._hasCursorMoved(document, position)) {
			trace.end("gate", "cursor moved while preparing input")
			return []
		}

		const result = await this.completionProvider.provideInlineCompletionItems(input, signal)

		if (!result || !result.completion) {
			trace.end("result", "no completion produced")
			this.completionStatusBar.noSuggest()
			return []
		}
		this.host.log(`[Completions]: ${JSON.stringify(result)}`)
		const willDisplay = this.willDisplay(document, selectedCompletionInfo, signal, result)
		if (!willDisplay) {
			trace.end("result", "willDisplay() rejected the completion", { reason: "aborted or prefix mismatch" })
			return []
		}
		this.completionProvider.markDisplayed(result.completionId, result)

		this.completionStatusBar.complete()
		const autocompleteItem = new InlineCompletionItem(result.completion, new Range(position, position), {
			title: "Log Autocomplete Outcome",
			command: `${Package.commandIDPrefix}-completion.logAutocompleteOutcome`,
			arguments: [result.completionId, this.completionProvider],
		})
		trace.end("result", "returning inline completion item", { len: result.completion.length })
		// 返回 InlineCompletionItem
		return [autocompleteItem]
	}

	/**
	 * 判断编辑器当前光标是否已经离开了本次补全触发时的位置。
	 */
	private _hasCursorMoved(document: TextDocument, position: Position): boolean {
		const editor = vscode.window.activeTextEditor
		if (!editor) {
			return true
		}
		if (editor.document.uri.toString() !== document.uri.toString()) {
			return true
		}
		const active = editor.selection.active
		return active.line !== position.line || active.character !== position.character
	}
	private async _prepareInput(document: TextDocument, position: Position): Promise<AutoCompleteInput> {
		const completionId = uuidv7()
		const { prefix, suffix } = extractPrefixSuffix(document, position)
		const projectPath = getWorkspacePath()
		const calculateHideScore = await this._calculateHideScore(document, position)
		const relativePath = toRelativePath(document.uri.fsPath, projectPath)
		const importContent = getDependencyImports(relativePath, document.getText())
		// AST 跨文件上下文扩充：仅在用户开启「AST 上下文扩充」实验选项时计算并注入，
		// 避免每次补全请求都触发 tree-sitter 解析与文件 IO 开销。
		const experimentsConfig = await this.host.getExperiments()
		const astContextExpansionEnabled =
			experimentsUtil.isEnabled(experimentsConfig, EXPERIMENT_IDS.AST_CONTEXT_EXPANSION) ?? false
		const astContext = astContextExpansionEnabled
			? await getAstContext(document.uri.fsPath, document.getText())
			: ""
		const filepath = document.uri.toString()
		const recentlyVisitedRanges = this.recentlyVisitedRanges.getSnippets()
		const recentlyEditedRanges = await this.recentlyEditedTracker.getRecentlyEditedRanges()
		const lastCompletedCompletion = this.completionProvider.getLastCompletedCompletion()
		const {
			recentlyEditedRangeSnippets,
			recentlyVisitedRangesSnippets,
			clipboardSnippets,
			recentlyOpenedFileSnippets,
		} = await getAllSnippets({
			recentlyEditedRanges,
			recentlyVisitedRanges,
			filepath,
			ide: this.ide,
		})
		return {
			completionId,
			languageId: document.languageId,
			position: {
				uri: document.uri.toString(),
				line: position.line,
				character: position.character,
			},
			promptOptions: {
				prefix,
				suffix,
				project_path: projectPath,
				file_project_path: relativePath,
				import_content: importContent.join("\n"),
				ast_context: astContext,
				recently_edited_ranges: recentlyEditedRangeSnippets,
				recently_visited_ranges: recentlyVisitedRangesSnippets,
				clipboard_content: clipboardSnippets,
				recently_opened_files: recentlyOpenedFileSnippets,
			},
			calculateHideScore,
			previousCompletionId: lastCompletedCompletion?.outcome.completionId ?? "",
			filepath: relativePath,
		}
	}
	private async _calculateHideScore(document: TextDocument, position: Position): Promise<CalculateHideScore> {
		const lastCompletedCompletion = this.completionProvider.getLastCompletedCompletion()
		return {
			is_whitespace_after_cursor: this._isWhitespaceAfterCursor(document, position),
			document_length: document.getText().length,
			prompt_end_pos: document.offsetAt(position),
			previous_label: lastCompletedCompletion?.action === TextAcceptanceAction.ACCEPTED ? 1 : 0,
			previous_label_timestamp: lastCompletedCompletion?.completedAt ?? 0,
		}
	}

	/**
	 * 检查光标后是否全为空白字符
	 */
	private _isWhitespaceAfterCursor(document: TextDocument, position: Position): boolean {
		const lineText = document.lineAt(position.line).text
		const textAfterCursor = lineText.substring(position.character)
		return textAfterCursor.trim() === ""
	}
	/**
	 * 判断是否允许代码补全
	 * @param triggerMode 触发模式: "auto" | "manual"
	 * @param language 编程语言标识
	 * @returns 是否允许补全
	 */
	private isCompletionAllowed(triggerMode: string, language: string): boolean {
		// 全局禁用时直接返回
		if (!LangSetting.completionEnabled) {
			return false
		}

		const langSwitch = LangSetting.getCompletionDisable(language)

		// 不支持的语言直接禁用
		if (langSwitch === LangSwitch.Unsupported) {
			return false
		}

		// 自动模式下需检查语言开关，手动模式强制允许
		return triggerMode !== "auto" || langSwitch !== LangSwitch.Disabled
	}

	private async isProviderSupported(): Promise<boolean> {
		const apiProvider = await this.host.getApiProvider()
		return apiProvider !== "costrictx"
	}

	private _setupActiveTextEditorChangeListener(): void {
		this.ide.onDidChangeActiveTextEditor((fileUri) => {
			openedFilesLruCache.set(fileUri, fileUri)
		})
	}
	willDisplay(
		document: TextDocument,
		selectedCompletionInfo: SelectedCompletionInfo | undefined,
		abortSignal: AbortSignal,
		outcome: AutocompleteOutcome,
	): boolean {
		if (selectedCompletionInfo) {
			const { text } = selectedCompletionInfo
			if (!outcome.completion.startsWith(text)) {
				return false
			}
		}

		if (abortSignal.aborted) {
			return false
		}

		return true
	}
	public dispose(): void {
		Disposable.from(...this.disposables).dispose()
		this.recentlyEditedTracker.dispose()
		this.recentlyVisitedRanges.dispose()
	}
}
