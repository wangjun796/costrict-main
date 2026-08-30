/**
 * Debug tracing for the code-completion (FIM) pipeline.
 *
 * The pipeline spans many stages (gate checks -> login routing -> preprocessing
 * -> HTTP request -> parsing -> postprocessing -> cache -> display) and a
 * failure in any of them silently produces "no suggestion". This module gives
 * every stage a tagged, timed log line so the failing step can be identified
 * from the Extension Host output alone.
 *
 * Tracing is opt-in via the `IntelligentCodeCompletion.fim.debug` setting so
 * normal usage stays quiet (CPU-only local models are slow enough already).
 */

import * as vscode from "vscode"

import { Logger } from "../../base/common/log-util"
import { configCompletion } from "../../base/common/constant"

/** How long the "is debug enabled" result is cached, to avoid hammering the configuration service. */
const CACHE_TTL_MS = 1000

let cachedEnabled: boolean | undefined
let cachedAt = 0

const isTestEnv = process.env.NODE_ENV === "test"

/**
 * Resolve whether completion debug tracing is enabled, caching briefly so log
 * calls made in a tight loop don't repeatedly hit the configuration service.
 */
export function isCompletionDebugEnabled(): boolean {
	const now = Date.now()
	if (cachedEnabled === undefined || now - cachedAt > CACHE_TTL_MS) {
		cachedAt = now
		cachedEnabled = vscode.workspace.getConfiguration(configCompletion).get<boolean>("fim.debug", false)
	}
	return cachedEnabled
}

function emit(level: "log" | "warn" | "error", parts: unknown[]): void {
	if (isTestEnv) {
		return
	}

	switch (level) {
		case "error":
			Logger.error(...parts)
			break
		case "warn":
			Logger.warn(...parts)
			break
		default:
			Logger.log(...parts)
	}
}

function formatDetail(detail?: Record<string, unknown>): string {
	if (!detail || Object.keys(detail).length === 0) {
		return ""
	}

	const rendered = Object.entries(detail).map(([key, value]) => {
		let text: string
		if (typeof value === "string") {
			// Long prompt/prefix dumps would flood the output channel.
			text =
				value.length > 120
					? `${JSON.stringify(value.slice(0, 120))}...(len=${value.length})`
					: JSON.stringify(value)
		} else if (value === undefined) {
			text = "undefined"
		} else {
			try {
				text = JSON.stringify(value)
			} catch {
				text = String(value)
			}
		}
		return `${key}=${text}`
	})

	return ` ${rendered.join(" ")}`
}

/**
 * Emit a debug line, gated by the `fim.debug` setting.
 *
 * @param completionId Correlates every line belonging to one completion request.
 * @param stage Short stage name, e.g. "gate", "route", "preprocess", "http".
 */
export function completionDebug(
	completionId: string,
	stage: string,
	message: string,
	detail?: Record<string, unknown>,
): void {
	if (!isCompletionDebugEnabled()) {
		return
	}
	emit("log", [`[Completion ${completionId}][${stage}] ${message}${formatDetail(detail)}`])
}

/** Always-visible variant for failures that must never be silent. */
export function completionWarn(
	completionId: string,
	stage: string,
	message: string,
	detail?: Record<string, unknown>,
): void {
	emit("warn", [`[Completion ${completionId}][${stage}] ${message}${formatDetail(detail)}`])
}

/** Always-visible variant for errors. */
export function completionError(
	completionId: string,
	stage: string,
	message: string,
	detail?: Record<string, unknown>,
): void {
	emit("error", [`[Completion ${completionId}][${stage}] ${message}${formatDetail(detail)}`])
}

/**
 * Per-request stopwatch that prints each stage with an absolute elapsed time
 * (since request start) and a delta (since the previous stage), making it
 * obvious which step is slow versus which step never runs.
 */
export class CompletionTrace {
	private readonly startedAt = Date.now()
	private lastAt = this.startedAt
	private finished = false

	constructor(private readonly completionId: string) {}

	/** Record that the pipeline reached `stage`. */
	step(stage: string, message: string, detail?: Record<string, unknown>): void {
		if (!isCompletionDebugEnabled()) {
			return
		}

		const now = Date.now()
		const total = now - this.startedAt
		const delta = now - this.lastAt
		this.lastAt = now

		emit("log", [
			`[Completion ${this.completionId}][${stage}] +${delta}ms (total ${total}ms) ${message}${formatDetail(detail)}`,
		])
	}

	/** Record the terminal stage; later `step` calls are ignored. */
	end(stage: string, message: string, detail?: Record<string, unknown>): void {
		if (this.finished) {
			return
		}
		this.finished = true
		this.step(stage, message, detail)
	}

	/** Milliseconds elapsed since the trace was created. */
	elapsed(): number {
		return Date.now() - this.startedAt
	}
}
