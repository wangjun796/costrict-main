import {
	InlineCompletionItemProvider,
	InlineCompletionItem,
	InlineCompletionTriggerKind,
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
import { CompletionTrace, isCompletionDebugEnabled } from "./fim/debug"
import type { CompletionPosition } from "./core/completionProvider"

export class InlineCompletionProvider implements InlineCompletionItemProvider {
	private completionProvider: CompletionProvider
	private disposables: Disposable[] = []
	private ide: IDE
	private recentlyEditedTracker: RecentlyEditedTracker
	private recentlyVisitedRanges: RecentlyVisitedRangesService
	private completionStatusBar: CompletionStatusBar
	/**
	 * 编辑器"近因事件"环形缓冲：窗口失焦 / 切换编辑器 / 文档被改 / 选择变化 /
	 * provider 被触发。补全被取消时把最近几条事件打进日志，用来回答
	 * 「到底是哪个动作杀掉了在飞请求」。扩展 API 拿不到窗口内部面板级焦点，
	 * 只能用这些信号逼近。
	 */
	private recentEditorEvents: { at: number; text: string }[] = []
	/**
	 * [DEBUG] 是否已经用「直接写入编辑器」的方式验证过补全结果。
	 * 只在 fim.debug 开启时才会被 _debugInsertCompletion 置位；只插入一次，
	 * 避免插入触发新一轮补全又插入，形成死循环。
	 */
	private debugInsertedCompletion = false

	private pushEditorEvent(text: string): void {
		this.recentEditorEvents.push({ at: Date.now(), text })
		if (this.recentEditorEvents.length > 12) {
			this.recentEditorEvents.shift()
		}
	}

	/** 最近 n 条事件，渲染成 `text(-123ms)` 形式（相对 now 的毫秒差）。 */
	private recentEventsSummary(n = 4): string {
		const now = Date.now()
		const tail = this.recentEditorEvents.slice(-n)
		return tail.map((ev) => `${ev.text}(-${Math.max(0, now - ev.at)}ms)`).join(" ") || "none"
	}

	private _setupEditorEventProbe(): void {
		this.disposables.push(
			vscode.window.onDidChangeWindowState((s) => this.pushEditorEvent(`windowFocus=${s.focused}`)),
			vscode.window.onDidChangeActiveTextEditor((e) =>
				this.pushEditorEvent(`activeEditor=${e ? vscode.workspace.asRelativePath(e.document.uri) : "none"}`),
			),
			vscode.workspace.onDidChangeTextDocument((e) =>
				this.pushEditorEvent(
					`edit ${vscode.workspace.asRelativePath(e.document.uri)} v${e.document.version} x${e.contentChanges.length}`,
				),
			),
		)
	}

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
		this._setupEditorEventProbe()
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
				const kind =
					event.kind === vscode.TextEditorSelectionChangeKind.Keyboard
						? "keyboard"
						: event.kind === vscode.TextEditorSelectionChangeKind.Mouse
							? "mouse"
							: event.kind === vscode.TextEditorSelectionChangeKind.Command
								? "command"
								: "unknown"
				const first = event.selections[0]
				this.pushEditorEvent(`select kind=${kind}${first ? ` -> ${first.active.line}:${first.active.character}` : ""}`)
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
		const startVersion = document.version
		const startPos = `${position.line}:${position.character}`
		token.onCancellationRequested(() => {
			const editor = vscode.window.activeTextEditor
			const sameDoc = editor?.document.uri.toString() === document.uri.toString()
			const active = sameDoc ? editor!.selection.active : undefined
			const cursorMoved =
				!!active && (active.line !== position.line || active.character !== position.character)
			const docChanged = document.version !== startVersion
			// VS Code 的 CancellationToken 在很多与光标无关的事件下也会触发：
			//   - 窗口失焦 / 聚焦（鼠标移到其它窗口、Alt-Tab）
			//   - 视图滚动、面板展开/折叠
			//   - 鼠标 hover、状态栏交互
			// 这些事件不应打断仍在飞的补全请求 —— 否则本地 CPU 慢模型在「永不超时」
			// 模式下永远也拿不到结果。只有真正影响补全有效性的变化（光标移动 / 文档被改 /
			// 切到其它编辑器）才需要取消。
			if (!cursorMoved && !docChanged && sameDoc) {
				this.pushEditorEvent("token-cancelled (ignored: same pos/doc/editor)")
				return
			}
			const nowPos = active ? `${active.line}:${active.character}` : "other-editor"
			abortController.abort(
				`VS Code cancelled the provider invocation (start ${startPos} v${startVersion} -> now ${nowPos} v${document.version}, windowFocused=${vscode.window.state.focused}) recentEvents: ${this.recentEventsSummary()}`,
			)
		})

		this.pushEditorEvent(
			`trigger kind=${context.triggerKind === InlineCompletionTriggerKind.Invoke ? "manual" : "auto"} suggestInfo=${!!context.selectedCompletionInfo} at ${position.line}:${position.character}`,
		)

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
		// 当用户开启「打印补全调试跟踪」（fim.debug）时，把补全结果直接写入编辑器，
		// 绕过 VS Code 对过期 ghost text 的丢弃，直观验证补全逻辑。平时这里只是一次
		// 布尔判断（带 1s 缓存），零开销。
		// 插入已改变文档版本，直接 return，避免再返回过期的 ghost item 造成双写。
		if (isCompletionDebugEnabled()) {
			await this._debugInsertCompletion(result.completion)
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

	/**
	 * [DEBUG] 把补全结果直接写入当前光标位置，绕过 VS Code 对「过期 ghost text」
	 * 的丢弃。无论请求等了多久（永不超时模式下甚至几分钟），只要补全文本回来了
	 * 就落盘到编辑器里，用于直观验证补全逻辑本身是否 OK。
	 *
	 * 双重门控：调用方（provideInlineCompletionItems）与方法内部都会检查
	 * fim.debug 开关；只执行一次（debugInsertedCompletion 置位），避免插入触发
	 * 新一轮补全又插入形成死循环。
	 */
	private async _debugInsertCompletion(text: string): Promise<void> {
		if (this.debugInsertedCompletion || !isCompletionDebugEnabled()) {
			return
		}
		this.debugInsertedCompletion = true
		const editor = vscode.window.activeTextEditor
		if (!editor) {
			return
		}
		const pos = editor.selection.active
		await editor.edit((editBuilder) => {
			editBuilder.insert(pos, text)
		})
		vscode.window.showInformationMessage(`[DEBUG] 补全已插入 ${text.length} 字符（验证补全逻辑 OK）`)
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
