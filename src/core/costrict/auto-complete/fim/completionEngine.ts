/**
 * FIM completion engine - replaces completion-agent Go service with pure TS implementation.
 *
 * This module handles:
 * 1. Prompt preprocessing (FIM marker assembly, truncation)
 * 2. HTTP request to the completion model server (e.g. StarCoder)
 * 3. Response postprocessing (overlap removal, repetition filtering)
 */

import * as vscode from "vscode"
import { CompletionModelConfig } from "./types"
import { preprocessPrompt, buildStopSequences, getFimMarkers } from "./preprocess"
import { postprocessCompletion } from "./postprocess"
import { PromptOptions } from "../types"
import { configCompletion } from "../../base/common/constant"
import { CompletionTrace, completionDebug, completionError, completionWarn } from "./debug"

/**
 * Why a request stopped. Distinguishing these matters: a timeout means the
 * model server is too slow (raise `fim.timeoutMs` or set it to 0), while an
 * external abort means the user kept typing / moved the cursor (normal).
 */
type AbortReason = "timeout" | "external" | "unknown"

/**
 * Wire an external AbortSignal into an internal AbortController and arm an
 * optional timeout.
 *
 * @returns the controller, a `clear()` to disarm timers/listeners, and a
 *          getter telling which side triggered the abort.
 */
function setupAbort(timeoutMs: number, signal?: AbortSignal) {
	const controller = new AbortController()
	let timedOut = false
	let externalAborted = false

	// timeoutMs <= 0 means "never time out" (debug / slow local models).
	const timeoutId =
		timeoutMs > 0
			? setTimeout(() => {
					timedOut = true
					controller.abort()
				}, timeoutMs)
			: undefined

	const onExternalAbort = () => {
		externalAborted = true
		controller.abort(signal?.reason)
	}
	if (signal?.aborted) {
		// "abort" events already fired before we attached.
		onExternalAbort()
	} else {
		signal?.addEventListener("abort", onExternalAbort, { once: true })
	}

	const getReason = (): AbortReason => {
		if (timedOut) {
			return "timeout"
		}
		if (externalAborted || signal?.aborted) {
			return "external"
		}
		return "unknown"
	}

	const clear = () => {
		if (timeoutId) {
			clearTimeout(timeoutId)
		}
		signal?.removeEventListener("abort", onExternalAbort)
	}

	return { controller, clear, getReason, timeoutMs }
}

/** Build a human-readable abort message so the logs say *why* it stopped. */
function describeAbort(
	reason: AbortReason,
	timeoutMs: number,
	elapsedMs: number,
	externalDetail?: string,
): string {
	if (reason === "timeout") {
		return `request timed out after ${timeoutMs}ms (elapsed ${elapsedMs}ms) - raise fim.timeoutMs, or set it to 0 for no timeout`
	}
	if (reason === "external") {
		return externalDetail
			? `request cancelled by caller: ${externalDetail} (elapsed ${elapsedMs}ms)`
			: "request cancelled by caller (typing / cursor move / new request)"
	}
	return `request aborted (unknown reason, elapsed ${elapsedMs}ms)`
}

/** Extract a human-readable abort reason passed via AbortController.abort(reason). */
function externalAbortDetail(signal?: AbortSignal): string | undefined {
	return typeof signal?.reason === "string" ? signal.reason : undefined
}

/** StarCoder-compatible completion request body */
interface StarCoderCompletionRequest {
	inputs: string
	parameters: {
		max_new_tokens: number
		temperature?: number
		top_p?: number
		top_k?: number
		repetition_penalty?: number
		stop: string[]
		do_sample: boolean
		return_full_text: boolean
	}
}

/** Result from the FIM completion engine */
export interface FimCompletionResult {
	text: string
	prefix: string
	suffix: string
	completionId: string
}

/**
 * Heuristic Ollama detection: the apiUrl port is 11434 (Ollama's default).
 *
 * Ollama serves a native fill-in-the-middle endpoint at POST /api/generate that
 * accepts independent `prompt` and `suffix` fields and inserts the correct FIM
 * special tokens internally. Sending literal FIM marker strings (the way the
 * generic TGI/OpenAI-compat path does) does NOT enter FIM mode for Ollama, so
 * we route to /api/generate whenever the URL points at an Ollama server.
 */
function isOllamaApi(apiUrl: string): boolean {
	try {
		const u = new URL(apiUrl)
		return u.port === "11434"
	} catch {
		return false
	}
}

/**
 * Derive the origin (scheme + host + port) of an apiUrl, stripping any path.
 * e.g. "http://localhost:11434/v1" -> "http://localhost:11434".
 */
function getApiOrigin(apiUrl: string): string {
	const trimmed = apiUrl.replace(/\/+$/, "")
	const m = trimmed.match(/^(https?:\/\/[^/]+)/)
	return m ? m[1] : trimmed
}

/**
 * Send a FIM completion request to an Ollama server using its native
 * /api/generate endpoint (prompt + suffix). Returns the generated text or null.
 *
 * Compared to the generic TGI/OpenAI-compat path, this lets Ollama assemble
 * the model-family-specific FIM special tokens itself instead of us sending
 * literal marker strings, which the tokenizer would otherwise treat as plain
 * text and break FIM mode.
 */
async function sendOllamaCompletion(
	config: CompletionModelConfig,
	prompt: string,
	suffix: string,
	stopSequences: string[],
	completionId: string,
	signal?: AbortSignal,
): Promise<string | null> {
	const url = `${getApiOrigin(config.apiUrl)}/api/generate`
	const trace = new CompletionTrace(completionId)

	// Send one /api/generate request. Returns:
	//  - the generated text (string) on success
	//  - null on error / abort / unexpected shape
	//  - "INSERT_UNSUPPORTED" when Ollama rejects the `suffix` field because the
	//    model lacks the `insert` capability (e.g. deepseek-coder:1.3b).
	const postOnce = async (p: string, s: string): Promise<string | null | "INSERT_UNSUPPORTED"> => {
		trace.step("http:ollama", "POST started", {
			url,
			model: config.modelName,
			timeoutMs: config.timeoutMs,
			promptLen: p.length,
			suffixLen: s.length,
		})

		const { controller, clear, getReason } = setupAbort(config.timeoutMs, signal)

		try {
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
				"X-Request-ID": completionId,
			}
			if (config.apiKey) {
				headers["Authorization"] = `Bearer ${config.apiKey}`
			}

			const options: Record<string, unknown> = {
				num_predict: config.maxOutputTokens,
				stop: stopSequences,
			}
			// Ollama has no do_sample; temperature 0 = greedy.
			options.temperature = config.doSample ? (config.temperature ?? 0.1) : 0
			if (config.topP > 0) {
				options.top_p = config.topP
			}
			if (config.topK > 0) {
				options.top_k = config.topK
			}
			if (config.repetitionPenalty != null) {
				options.repeat_penalty = config.repetitionPenalty
			}

			const body = JSON.stringify({
				model: config.modelName,
				prompt: p,
				suffix: s,
				stream: false,
				// starcoder2 是 base 代码模型，没有 chat 模板。raw=true 跳过 Ollama
				// 的默认模板包装，直接用 prompt，与独立验证脚本（raw=true）行为一致。
				raw: true,
				options,
			})

			const response = await fetch(url, {
				method: "POST",
				headers,
				body,
				signal: controller.signal,
			})

			trace.step("http:ollama", "response received", { status: response.status })

			if (!response.ok) {
				const errorText = await response.text().catch(() => "unknown error")
				// Ollama 模型未声明 insert 能力（如 deepseek-coder:1.3b）时，带 suffix
				// 的 /api/generate 会返回 400 "does not support insert"。这种情况下改用
				// “把 FIM 标记直接拼进 prompt、不再传 suffix” 的方式，配合 raw:true
				// 让模型自己按 FIM 标记填空。
				if (response.status === 400 && s.length > 0 && /does not support insert/i.test(errorText)) {
					// 这不是致命错误：原生 insert 模式走不通，自动回退到「内嵌 FIM 标记 +
					// raw:true + 去掉 suffix」的方式（见下方第 2 步）。所以日志里可能看到这条
					// 提示而补全依然成功——补全来自成功的回退重试，而非第一次 insert 尝试。
					completionWarn(
						completionId,
						"http:ollama",
						"model lacks native insert capability - falling back to embedded FIM markers (raw prompt)",
						{ model: config.modelName },
					)
					return "INSERT_UNSUPPORTED"
				}
				completionError(completionId, "http:ollama", `request failed: ${response.status} ${errorText}`, { url })
				return null
			}

			const data = await response.json()
			if (typeof data?.response === "string") {
				trace.step("http:ollama", "response parsed", {
					len: data.response.length,
					evalCount: data.eval_count,
					evalDurationMs:
						data.eval_duration != null ? Math.round((data.eval_duration as number) / 1e6) : undefined,
					totalDurationMs:
						data.total_duration != null ? Math.round((data.total_duration as number) / 1e6) : undefined,
				})
				return data.response
			}
			completionWarn(completionId, "http:ollama", "unexpected response shape (no string `response` field)", {
				url,
				keys: Object.keys(data ?? {}),
			})
			return null
		} catch (error) {
			// fetch rejects with the raw abort reason when abort(reason) carries a
			// custom value, so `error` may be a plain string instead of an AbortError.
			if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
				completionWarn(
					completionId,
					"http:ollama",
					describeAbort(getReason(), config.timeoutMs, trace.elapsed(), externalAbortDetail(signal)),
				)
				return null
			}
			completionError(completionId, "http:ollama", "request error", {
				url,
				error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
				cause: (error as any)?.cause ? String((error as any).cause) : undefined,
			})
			return null
		} finally {
			clear()
		}
	}

	// 1. 优先用 Ollama 原生的 insert 能力（需要模型支持，starcoder2 /
	//    deepseek-coder-v2 / codellama 等均支持）。suffix 为空时不需要 insert。
	const native = await postOnce(prompt, suffix)
	if (native !== "INSERT_UNSUPPORTED") {
		return native
	}

	// 2. 兜底：模型不支持 insert 时，把 FIM 标记直接拼进 prompt 并去掉 suffix 字段。
	//    配合 raw:true，Ollama 不会套模板，模型会读到自己家族的 FIM 特殊 token 并填空。
	//    重试前检查 signal 是否已被取消（第一次尝试耗时较长，signal 可能已被外部取消）。
	if (signal?.aborted) {
		trace.step("http:ollama", "signal aborted before fallback retry, skipping")
		return null
	}
	const markers = getFimMarkers(config)
	const fimPrompt = `${markers.begin}${prompt}${markers.hole}${suffix}${markers.end}`
	trace.step("http:ollama", "native insert unsupported, retrying with embedded FIM markers", {
		preset: config.fimPreset,
		fimPromptLen: fimPrompt.length,
	})
	const fallback = await postOnce(fimPrompt, "")
	return fallback === "INSERT_UNSUPPORTED" ? null : fallback
}

/**
 * Send a FIM completion request to the configured model server.
 *
 * This replaces the completion-agent Go service with a direct TS implementation.
 * The request format is compatible with StarCoder's text-generation-inference API
 * and other OpenAI-compatible servers.
 */
export async function requestFimCompletion(
	promptOptions: PromptOptions,
	config: CompletionModelConfig,
	completionId: string,
	signal?: AbortSignal,
): Promise<FimCompletionResult | null> {
	const trace = new CompletionTrace(completionId)

	if (!config.apiUrl) {
		completionWarn(completionId, "route:fim", "no fim.apiUrl configured - skipping completion")
		return null
	}

	// 1. Preprocess: truncation + (for TGI/OpenAI-compat) FIM marker assembly
	const { prompt, prefix, suffix, codeContext } = preprocessPrompt(promptOptions, config)
	trace.step("preprocess", "prompt assembled", {
		promptLen: prompt.length,
		prefixLen: prefix.length,
		suffixLen: suffix.length,
		contextLen: codeContext.length,
		preset: config.fimPreset,
		model: config.modelName,
	})

	// 2. Build stop sequences
	const stopSequences = buildStopSequences(config, suffix)
	trace.step("preprocess", "stop sequences built", { stop: stopSequences })

	// 3. Make HTTP request. For Ollama (apiUrl port 11434), use the native
	//    /api/generate endpoint with prompt + suffix so Ollama assembles the
	//    model-specific FIM special tokens itself. Otherwise fall back to the
	//    pre-assembled FIM prompt via the generic TGI/OpenAI-compat path.
	const useOllama = isOllamaApi(config.apiUrl)
	trace.step("http", useOllama ? "using Ollama /api/generate" : "using generic TGI/OpenAI-compat path", {
		apiUrl: config.apiUrl,
		timeoutMs: config.timeoutMs,
	})

	if (signal?.aborted) {
		completionWarn(completionId, "http", "aborted before sending request")
		return null
	}

	const result = useOllama
		? await sendOllamaCompletion(config, codeContext + prefix, suffix, stopSequences, completionId, signal)
		: await sendCompletionRequest(config, prompt, stopSequences, completionId, signal)

	if (!result) {
		trace.end("http", "no completion returned")
		return null
	}

	trace.step("postprocess", "raw completion received", { rawLen: result.length })

	// 4. Postprocess: remove overlaps, filter repetition
	const processedText = postprocessCompletion(result, prefix, suffix)

	if (!processedText) {
		completionWarn(completionId, "postprocess", "completion filtered out (empty after cleanup)", {
			raw: result.slice(0, 120),
		})
		return null
	}

	trace.end("postprocess", "completion ready", { len: processedText.length })

	return {
		text: processedText,
		prefix,
		suffix,
		completionId,
	}
}

/**
 * Send the actual HTTP request to the completion model server.
 *
 * Supports two request formats:
 * 1. StarCoder text-generation-inference format (default)
 * 2. OpenAI-compatible format (when apiUrl contains "/v1/completions")
 */
/**
 * Candidate endpoints to try for a completion request. Each entry carries the
 * request/response format so the same code path can reach both TGI-native and
 * OpenAI-compatible servers without requiring the user to configure the exact
 * route.
 */
interface CompletionEndpoint {
	url: string
	isOpenAIFormat: boolean
}

/**
 * Derive the endpoint(s) to POST to, based on the configured apiUrl.
 *
 * - Explicit "/v1/completions" or "/v1/chat/completions" -> OpenAI, as-is.
 * - Explicit "/generate" -> TGI native, as-is.
 * - Ends with "/v1" (e.g. http://host:8000/v1) -> OpenAI "/v1/completions".
 * - Bare host (no recognizable route) -> try TGI "/generate" first (legacy
 *   behavior), then fall back to OpenAI "/v1/completions" so OpenAI-compatible
 *   servers (Ollama, LM Studio, vLLM, llama.cpp) also work.
 */
function buildCompletionEndpoints(apiUrl: string): CompletionEndpoint[] {
	const base = apiUrl.replace(/\/+$/, "")

	if (apiUrl.includes("/v1/completions") || apiUrl.includes("/v1/chat/completions")) {
		return [{ url: base, isOpenAIFormat: true }]
	}

	if (/\/generate$/.test(base)) {
		return [{ url: base, isOpenAIFormat: false }]
	}

	if (/\/v1$/.test(base)) {
		return [{ url: `${base}/completions`, isOpenAIFormat: true }]
	}

	return [
		{ url: `${base}/generate`, isOpenAIFormat: false },
		{ url: `${base}/v1/completions`, isOpenAIFormat: true },
	]
}

/**
 * Send the actual HTTP request to the completion model server.
 *
 * Supports two request formats:
 * 1. StarCoder text-generation-inference format (default)
 * 2. OpenAI-compatible format
 */
async function sendCompletionRequest(
	config: CompletionModelConfig,
	prompt: string,
	stopSequences: string[],
	completionId: string,
	signal?: AbortSignal,
): Promise<string | null> {
	const endpoints = buildCompletionEndpoints(config.apiUrl)
	completionDebug(completionId, "http:generic", "endpoint candidates", { endpoints: endpoints.map((e) => e.url) })

	for (const endpoint of endpoints) {
		if (signal?.aborted) {
			completionWarn(completionId, "http:generic", "cancelled before trying " + endpoint.url)
			return null
		}

		const result = await postCompletionRequest(
			endpoint.url,
			endpoint.isOpenAIFormat,
			config,
			prompt,
			stopSequences,
			completionId,
			signal,
		)

		if (result === "aborted") {
			return null
		}

		if (result !== null) {
			return result
		}

		completionDebug(completionId, "http:generic", "endpoint returned nothing, trying next", {
			url: endpoint.url,
		})
	}

	completionDebug(completionId, "http:generic", "all endpoint candidates failed")
	return null
}

/**
 * Perform a single completion POST and parse the response.
 *
 * Returns the generated text, "aborted" if the request was cancelled/timed out,
 * or null if the request failed or returned an unexpected shape.
 */
async function postCompletionRequest(
	url: string,
	isOpenAIFormat: boolean,
	config: CompletionModelConfig,
	prompt: string,
	stopSequences: string[],
	completionId: string,
	signal?: AbortSignal,
): Promise<string | "aborted" | null> {
	const trace = new CompletionTrace(completionId)
	const { controller, clear, getReason } = setupAbort(config.timeoutMs, signal)

	trace.step("http:generic", "POST started", { url, format: isOpenAIFormat ? "openai" : "tgi" })

	try {
		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			"X-Request-ID": completionId,
		}

		if (config.apiKey) {
			headers["Authorization"] = `Bearer ${config.apiKey}`
		}

		let body: string

		if (isOpenAIFormat) {
			// OpenAI-compatible format (vLLM / TGI / llama.cpp expose /v1/completions)
			const requestBody: Record<string, unknown> = {
				model: config.modelName,
				prompt,
				max_tokens: config.maxOutputTokens,
				temperature: config.temperature ?? 0.1,
				top_p: config.topP,
				stop: stopSequences,
			}
			if (config.topK > 0) {
				requestBody.top_k = config.topK
			}
			if (config.repetitionPenalty != null) {
				requestBody.repetition_penalty = config.repetitionPenalty
			}
			body = JSON.stringify(requestBody)
		} else {
			// StarCoder text-generation-inference (TGI) native /generate format
			const parameters: StarCoderCompletionRequest["parameters"] = {
				max_new_tokens: config.maxOutputTokens,
				stop: stopSequences,
				do_sample: config.doSample,
				return_full_text: false,
			}
			if (config.temperature != null) {
				parameters.temperature = config.temperature
			}
			if (config.topP > 0) {
				parameters.top_p = config.topP
			}
			if (config.topK > 0) {
				parameters.top_k = config.topK
			}
			if (config.repetitionPenalty != null) {
				parameters.repetition_penalty = config.repetitionPenalty
			}
			const requestBody: StarCoderCompletionRequest = {
				inputs: prompt,
				parameters,
			}
			body = JSON.stringify(requestBody)
		}

		const response = await fetch(url, {
			method: "POST",
			headers,
			body,
			signal: controller.signal,
		})

		trace.step("http:generic", "response received", { status: response.status })

		if (!response.ok) {
			const errorText = await response.text().catch(() => "unknown error")
			completionError(completionId, "http:generic", `request failed: ${response.status} ${errorText}`, {
				url,
			})
			return null
		}

		const data = await response.json()

		// Parse response based on format
		if (isOpenAIFormat) {
			// OpenAI format: { choices: [{ text: "..." }] }
			const choices = data?.choices
			if (Array.isArray(choices) && choices.length > 0) {
				trace.step("http:generic", "response parsed", { len: choices[0].text?.length ?? 0 })
				return choices[0].text || null
			}
		} else {
			// StarCoder format: { generated_text: "..." }
			if (data?.generated_text) {
				trace.step("http:generic", "response parsed", { len: data.generated_text.length })
				return data.generated_text
			}
		}

		completionWarn(completionId, "http:generic", "unexpected response shape", {
			url,
			keys: Object.keys(data ?? {}),
		})
		return null
	} catch (error) {
		// See the note in the Ollama path: a custom abort reason makes fetch reject
		// with that raw value instead of an AbortError.
		if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
			completionWarn(
				completionId,
				"http:generic",
				describeAbort(getReason(), config.timeoutMs, trace.elapsed(), externalAbortDetail(signal)),
			)
			return "aborted"
		}
		completionError(completionId, "http:generic", "request error", {
			url,
			error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
			cause: (error as any)?.cause ? String((error as any).cause) : undefined,
		})
		return null
	} finally {
		clear()
	}
}

/**
 * Get the current completion model configuration from VS Code settings.
 *
 * Reads from the "IntelligentCodeCompletion" configuration section.
 */
export function getCompletionModelConfig(): CompletionModelConfig {
	const config = vscode.workspace.getConfiguration(configCompletion)

	return {
		enabled: config.get<boolean>("fim.enabled", true),
		apiUrl: config.get<string>("fim.apiUrl", "http://127.0.0.1:11434/api/generate"),
		modelName: config.get<string>("fim.modelName", "deepseek-coder:1.3b"),
		apiKey: config.get<string>("fim.apiKey", ""),
		fimPreset: config.get<string>("fim.fimPreset", "deepseek"),
		customMarkers: {
			begin: config.get<string>("fim.customMarkers.begin", "<fim_prefix>"),
			hole: config.get<string>("fim.customMarkers.hole", "<fim_suffix>"),
			end: config.get<string>("fim.customMarkers.end", "<fim_middle>"),
		},
		maxPrefixTokens: config.get<number>("fim.maxPrefixTokens", 2048),
		maxSuffixTokens: config.get<number>("fim.maxSuffixTokens", 512),
		maxOutputTokens: config.get<number>("fim.maxOutputTokens", 256),
		temperature: config.get<number | null>("fim.temperature", 0.1),
		topP: config.get<number>("fim.topP", 0.95),
		topK: config.get<number>("fim.topK", 50),
		repetitionPenalty: config.get<number | null>("fim.repetitionPenalty", 1.0),
		doSample: config.get<boolean>("fim.doSample", true),
		stopSequences: config.get<string[]>("fim.stopSequences", []),
		timeoutMs: config.get<number>("fim.timeoutMs", 3000),
		debounceMs: config.get<number>("fim.debounceMs", 300),
		debug: config.get<boolean>("fim.debug", false),
	}
}
