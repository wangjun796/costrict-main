import { Completion } from "openai/resources/completions"
import { settings } from "../../base/common/constant"
import { CalculateHideScore, PromptOptions, AutocompleteOutcome } from "../types"
import { COSTRICT_DEFAULT_HEADERS } from "../../../../shared/headers"
import { getClientId } from "../../../../utils/getClientId"
import { AutocompleteDebouncer } from "../utils/autocompleteDebouncer"
import { AutocompleteLoggingService } from "../utils/autocompleteLoggingService"
import {
	ensureCompletionRuntimeReady,
	readCostrictWellKnownConfig,
	waitForCompletionAgentConfig,
} from "../../runtime-config"
import { TextAcceptanceAction } from "../utils/autocompleteLoggingService"
import { requestFimCompletion, getCompletionModelConfig } from "../fim"
import { CompletionTrace, completionDebug, completionWarn, isCompletionDebugEnabled } from "../fim/debug"

export interface AutoCompleteInput {
	completionId: string
	languageId: string
	promptOptions: PromptOptions
	calculateHideScore: CalculateHideScore
	previousCompletionId: string
	filepath: string
	/**
	 * 光标位置快照（文档 + 行列）。
	 *
	 * 用于「一次只允许一个补全在飞」的判断：当新的补全请求进来、或光标位置
	 * 发生变化时，上一次仍在飞的请求需要被取消（超时设为 0 永不超时时尤其
	 * 重要，否则一个慢请求会一直挂着）。
	 */
	position?: CompletionPosition
}

/** 光标位置快照 */
export interface CompletionPosition {
	uri: string
	line: number
	character: number
}

/** 描述一个正在飞行中的补全请求 */
interface InflightCompletion {
	completionId: string
	position: CompletionPosition | undefined
	controller: AbortController
	startedAt: number
}

const MAX_SUGGESTIONS_HISTORY = 20
/** 默认防抖时长；实际值来自 fim.debounceMs 配置（0 表示不防抖）。 */
const DEFAULT_DEBOUNCE_DELAY_MS = 300
const COMPLETION_RUNTIME_WAIT_MS = 2000
interface FillInAtCursorSuggestion {
	text: string
	prefix: string
	suffix: string
	completionId: string
}
interface ServiceConfig {
	protocol: string
	port: number
}
export type CompletionErrorHandler = (error: unknown) => void
/**
 * Find a matching suggestion from the history based on current prefix and suffix
 * @param prefix - The text before the cursor position
 * @param suffix - The text after the cursor position
 * @param suggestionsHistory - Array of previous suggestions (most recent last)
 * @returns The matching suggestion text, or null if no match found
 */
export function findMatchingSuggestion(
	prefix: string,
	suffix: string,
	suggestionsHistory: FillInAtCursorSuggestion[],
): { text: string; completionId: string } | null {
	// Search from most recent to least recent
	for (let i = suggestionsHistory.length - 1; i >= 0; i--) {
		const fillInAtCursor = suggestionsHistory[i]

		// First, try exact prefix/suffix match
		if (prefix === fillInAtCursor.prefix && suffix === fillInAtCursor.suffix) {
			return { text: fillInAtCursor.text, completionId: fillInAtCursor.completionId }
		}

		// If no exact match, but suggestion is available, check for partial typing
		// The user may have started typing the suggested text
		if (
			fillInAtCursor.text !== "" &&
			prefix.startsWith(fillInAtCursor.prefix) &&
			suffix === fillInAtCursor.suffix
		) {
			// Extract what the user has typed between the original prefix and current position
			const typedContent = prefix.substring(fillInAtCursor.prefix.length)

			// Check if the typed content matches the beginning of the suggestion
			if (fillInAtCursor.text.startsWith(typedContent)) {
				// Return the remaining part of the suggestion (with already-typed portion removed)
				return {
					text: fillInAtCursor.text.substring(typedContent.length),
					completionId: fillInAtCursor.completionId,
				}
			}
		}
	}

	return null
}
export class CompletionProvider {
	private suggestionsHistory: FillInAtCursorSuggestion[] = []
	private debouncer = new AutocompleteDebouncer()
	private loggingService = new AutocompleteLoggingService()
	private serverHostInfo = {
		protocol: "",
		status: "",
		port: "",
	}
	private serverHost: string | undefined
	private readonly onError: CompletionErrorHandler
	/** 当前正在飞行中的补全请求（同时最多一个） */
	private inflight: InflightCompletion | undefined
	constructor(
		onError: CompletionErrorHandler,
		private readonly isCostrictLoggedIn: () => Promise<boolean>,
	) {
		this.onError = onError
		this.serverHost = this._getServerHostConfig()
	}

	private _getServerHostConfig(defaultValue?: ServiceConfig) {
		const { services } = readCostrictWellKnownConfig()
		const service = services.find((item: any) => item.name === "completion-agent")
		const protocol = service?.protocol || defaultValue?.protocol || "http"
		const port = service?.port ?? defaultValue?.port

		if (!port) {
			this.serverHostInfo = {
				protocol: protocol || "",
				status: String(service?.status ?? ""),
				port: "",
			}
			return undefined
		}

		this.serverHostInfo = {
			protocol,
			status: String(service?.status ?? ""),
			port: String(port),
		}
		return `${protocol}://localhost:${port}`
	}

	private async resolveServerHost(): Promise<string> {
		let serverHost = this._getServerHostConfig()
		if (serverHost) {
			this.serverHost = serverHost
			return serverHost
		}

		await ensureCompletionRuntimeReady()
		const service = await waitForCompletionAgentConfig(COMPLETION_RUNTIME_WAIT_MS)
		serverHost = this._getServerHostConfig(
			service?.port
				? {
						protocol: service.protocol || "http",
						port: service.port,
					}
				: undefined,
		)
		if (!serverHost) {
			throw new Error("Completion agent is not ready")
		}

		this.serverHost = serverHost
		return serverHost
	}

	/**
	 * 提供内联补全项
	 * @param input - 补全输入参数
	 * @param token - 可选的外部 AbortSignal（由 VSCode CancellationToken 转换而来）
	 * @returns 补全结果，或 undefined（取消/错误）
	 */
	public async provideInlineCompletionItems(
		input: AutoCompleteInput,
		token?: AbortSignal,
	): Promise<AutocompleteOutcome | undefined> {
		const trace = new CompletionTrace(input.completionId)

		// 1. 单飞：只有当新请求的位置与在飞请求不同时，才取消旧请求。
		//    同位置上的重复触发（窗口失焦/聚焦、滚动、鼠标移开等）不应打断仍在飞的
		//    请求 —— 否则在「永不超时」模式下慢请求永远也跑不完，且结果会被丢弃。
		if (
			this.inflight &&
			this.inflight.position &&
			input.position &&
			!this.isPositionChanged(input.position)
		) {
			// 同位置已有在飞请求：直接返回 undefined，让旧请求在后台跑完并写入缓存；
			// 下次再触发（同位置或光标移动后回来）时就能从缓存里拿到结果，
			// 同时避免重复发起网络请求（model server 不需要被双倍打）。
			trace.step("start", "skip: same position already in-flight, returning undefined (result will appear in cache)")
			return undefined
		}
		this.cancelInflight(input.completionId, "superseded-by-new-request")

		// 2. 取消 loggingService 里残留的历史 controller
		this.loggingService.cancel()

		// 3. 内部 controller：即使调用方传了外部 token，我们也需要一个自己能
		//    触发的取消通道（新请求进来 / 光标移动时用它掐掉旧请求）。
		const controller = new AbortController()
		const signal: AbortSignal = token ? AbortSignal.any([token, controller.signal]) : controller.signal
		this.inflight = {
			completionId: input.completionId,
			position: input.position,
			controller,
			startedAt: Date.now(),
		}

		trace.step("start", "provideInlineCompletionItems", {
			language: input.languageId,
			file: input.filepath,
			pos: input.position ? `${input.position.line}:${input.position.character}` : undefined,
		})

		try {
			// 4. 检查是否已取消
			if (signal.aborted) {
				trace.end("start", "aborted before debounce")
				return undefined
			}

			// 5. Debounce（时长可配，0 表示不防抖）
			const fimConfig = getCompletionModelConfig()
			const debounceMs = fimConfig.debounceMs ?? DEFAULT_DEBOUNCE_DELAY_MS
			trace.step("debounce", `waiting ${debounceMs}ms`)
			const shouldDebounce = await this.debouncer.delayAndShouldDebounce(debounceMs, signal)
			if (shouldDebounce) {
				trace.end("debounce", "debounced (a newer request superseded this one)")
				return undefined
			}

			// 6. 再次检查是否已取消
			if (signal.aborted) {
				trace.end("debounce", "aborted during debounce")
				return undefined
			}

			const startTime = Date.now()
			const { prefix, suffix } = input.promptOptions
			const suggestion = findMatchingSuggestion(prefix, suffix, this.suggestionsHistory)
			let completion: string | undefined = ""
			let completionId: string | undefined = ""
			let cacheHit = false

			if (suggestion != null) {
				completion = suggestion.text
				completionId = suggestion.completionId
				cacheHit = true
				trace.step("cache", "cache hit", { len: completion.length })
			} else {
				trace.step("cache", "cache miss - requesting from model")

			// 7. 发起网络请求
			await this.fetchAndCacheSuggestions(input, signal)

			// 8. 竞态检查
			if (signal.aborted) {
				trace.end("request", "aborted during request")
				return undefined
			}

				const suggestion = findMatchingSuggestion(prefix, suffix, this.suggestionsHistory)
				if (!suggestion) {
					trace.end("request", "model returned no usable suggestion")
					return undefined
				}
				completion = suggestion.text
				completionId = suggestion.completionId
				trace.step("request", "suggestion cached", { len: completion.length })
			}

			// 9. 最终检查是否已取消
			if (signal.aborted) {
				trace.end("result", "aborted before returning result")
				return undefined
			}

			const outcome: AutocompleteOutcome = {
				time: Date.now() - startTime,
				completion,
				completionId,
				cacheHit,
				filepath: input.filepath,
				numLines: completion.split("\n").length,
				language: input.languageId,
			}
			trace.end("result", "returning completion", { len: completion.length, cacheHit })
			return outcome
		} catch (e) {
			// 10. 错误处理
			// 用户继续输入等场景触发的取消是预期行为，不应上报为错误
			if (signal.aborted || (e as any)?.name === "AbortError") {
				trace.end("error", "aborted")
				return undefined
			}
			completionWarn(input.completionId, "error", "completion failed", {
				error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
			})
			this.onError(e)
			return undefined
		} finally {
			// 11. 清理资源
			this.loggingService.deleteAbortController(input.completionId)
			if (this.inflight?.completionId === input.completionId) {
				this.inflight = undefined
			}
		}
	}

	/**
	 * 取消当前正在飞行的补全请求（若存在）。
	 *
	 * 调用时机：
	 * - 新的补全请求进来（保证同时只有一个请求在飞）
	 * - 光标位置发生变化（旧请求的结果已经没有意义）
	 * - provider 被 dispose
	 *
	 * @param reasonId 触发取消的新请求 id（用于日志关联）
	 * @param reason 取消原因（用于日志）
	 */
	public cancelInflight(reasonId: string = "-", reason = "cancelled"): void {
		const inflight = this.inflight
		if (!inflight) {
			return
		}

		this.inflight = undefined
		inflight.controller.abort(reason)
		completionDebug(reasonId, "cancel", `cancelled inflight completion (${reason})`, {
			inflightId: inflight.completionId,
			inflightAgeMs: Date.now() - inflight.startedAt,
			pos: inflight.position ? `${inflight.position.line}:${inflight.position.character}` : undefined,
		})
	}

	/**
	 * 判断在飞请求的目标位置是否已经与给定位置不同。
	 *
	 * 用于区分两种「选择变化」事件：
	 * - 光标真的移动了 -> 旧请求作废，应取消
	 * - 光标没动（例如刚为这个位置发起的请求触发的事件）-> 不该取消
	 */
	public isPositionChanged(position: CompletionPosition): boolean {
		const inflight = this.inflight
		if (!inflight?.position) {
			return false
		}
		return (
			inflight.position.uri !== position.uri ||
			inflight.position.line !== position.line ||
			inflight.position.character !== position.character
		)
	}

	/** 当前在飞的请求 id（没有则为 undefined），用于调试与日志关联。 */
	public getInflightCompletionId(): string | undefined {
		return this.inflight?.completionId
	}

	public updateSuggestions(fillInAtCursor: FillInAtCursorSuggestion): void {
		const isDuplicate = this.suggestionsHistory.some(
			(existing) =>
				existing.text === fillInAtCursor.text &&
				existing.prefix === fillInAtCursor.prefix &&
				existing.suffix === fillInAtCursor.suffix,
		)

		if (isDuplicate) {
			return
		}

		// Add to the end of the array (most recent)
		this.suggestionsHistory.push(fillInAtCursor)

		// Remove oldest if we exceed the limit
		if (this.suggestionsHistory.length > MAX_SUGGESTIONS_HISTORY) {
			this.suggestionsHistory.shift()
		}
	}

	private async fetchAndCacheSuggestions(input: AutoCompleteInput, token: AbortSignal) {
		const trace = new CompletionTrace(input.completionId)

		// 未登录 costrict 时，直接使用用户配置的代码补全模型（FIM）完成补全；
		// 已登录时，保留原有 completion-agent 云端路径作为对比参考。
		const fimConfig = getCompletionModelConfig()
		const isLoggedIn = await this.isCostrictLoggedIn()

		trace.step("route", isLoggedIn ? "logged in -> completion-agent (getFromLLM)" : "not logged in -> FIM model", {
			fimApiUrl: fimConfig.apiUrl || "(empty)",
			fimModel: fimConfig.modelName,
			fimTimeoutMs: fimConfig.timeoutMs,
		})

		let response: { suggestions: FillInAtCursorSuggestion } | null = null

		if (!isLoggedIn) {
			// 未登录：使用配置的补全模型（requestFimCompletion 直接请求模型服务）。
			// 只要配置了 apiUrl 即走 FIM，无需手动开启 fim.enabled 开关。
			if (fimConfig.apiUrl) {
				const fimResult = await requestFimCompletion(input.promptOptions, fimConfig, input.completionId, token)

				if (fimResult) {
					response = {
						suggestions: {
							text: fimResult.text,
							prefix: fimResult.prefix,
							suffix: fimResult.suffix,
							completionId: fimResult.completionId,
						},
					}
				} else {
					trace.end("route", "FIM returned nothing")
				}
			} else {
				completionWarn(
					input.completionId,
					"route",
					"not logged in and fim.apiUrl is empty - configure 代码补全模型 -> API URL to enable FIM",
				)
			}
		} else {
			// 已登录：保留原有 completion-agent 服务路径（对比参考）
			response = await this.getFromLLM(input, token)
		}

		// 竞态检查：更新缓存前检查是否已取消
		if (token.aborted || !response) {
			return
		}

		this.updateSuggestions(response.suggestions)
		trace.step("route", "suggestion stored", { len: response.suggestions.text.length })
	}

	private async getFromLLM(input: AutoCompleteInput, token: AbortSignal) {
		const clientId = getClientId()
		const headers = {
			...COSTRICT_DEFAULT_HEADERS,
			"X-Request-ID": input.completionId,
			"zgsm-client-id": clientId,
		}
		const { prefix, suffix } = input.promptOptions
		const serverHost = await this.resolveServerHost()
		const debug = isCompletionDebugEnabled()
		if (debug) {
			console.log(`[Completion Request ${input.completionId}]: ${serverHost}`)
		}
		const response = await fetch(`${serverHost}/completion-agent/api/v1/completions`, {
			method: "post",
			headers,
			signal: AbortSignal.any([token, AbortSignal.timeout(2000)]),
			body: JSON.stringify({
				model: settings.openai_model,
				temperature: settings.temperature,
				client_id: clientId,
				completion_id: input.completionId,
				language_id: input.languageId,
				calculate_hide_score: input.calculateHideScore,
				prompt_options: input.promptOptions,
				parent_id: input.previousCompletionId,
			}),
		})
		if (!response.ok) {
			if (debug) {
				console.log(`[Completion Request ${input.completionId}]: ${response.statusText}`)
			}
			throw new Error(`Failed to fetch completion: ${input.completionId} ${response.statusText}`)
		}
		const data = await response.json()
		const text = this.acquireCompletionText(data)
		const completionId = this.acquireCompletionId(data)
		return {
			suggestions: {
				text,
				prefix,
				suffix,
				completionId,
			},
		}
	}

	private acquireCompletionText(response: Completion) {
		const choice = response?.choices?.find((c) => c.text?.trim())
		if (!choice?.text) {
			return ""
		}

		let text = choice.text.trim()

		// Since Chinese characters occupy 3 bytes, the plugin may be affected by Max Tokens. When the result is returned, only half of the last Chinese character is returned, resulting in garbled characters.
		// The garbled characters need to be replaced with ''.
		if (text.includes("�")) {
			text = text.replace(/�/g, "")
		}
		return text
	}

	private acquireCompletionId(resp: Completion): string {
		if (!resp || !resp.choices || resp.choices.length === 0 || !resp.id) {
			return ""
		}

		return resp.id
	}

	/**
	 * 取消所有正在进行的请求
	 */
	public cancel(): void {
		this.cancelInflight("-", "provider.cancel()")
		this.loggingService.cancel()
	}
	public accept(completionId: string): void {
		this.loggingService.accept(completionId)
	}
	public markDisplayed(completionId: string, outcome: AutocompleteOutcome): void {
		this.loggingService.markDisplayed(completionId, outcome)
	}
	public getLastCompletedCompletion(): null | {
		outcome: AutocompleteOutcome
		action: TextAcceptanceAction
		completedAt: number
	} {
		const lastCompletedCompletion = this.loggingService.getLastCompletedCompletion()
		if (!lastCompletedCompletion) {
			return null
		}
		return lastCompletedCompletion
	}
}
