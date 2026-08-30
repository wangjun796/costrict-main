/**
 * FIM prompt preprocessing logic.
 *
 * Implements the same preprocessing as completion-agent's Go code:
 * - FIM prompt assembly with markers
 * - Token-based truncation of prefix/suffix/context
 * - Stop word preparation
 */

import { FimMarkers, CompletionModelConfig, FIM_MARKERS, FIM_EOS_TOKENS } from "./types"
import { PromptOptions } from "../types"

/**
 * Get the FIM markers for the current configuration
 */
export function getFimMarkers(config: CompletionModelConfig): FimMarkers {
	if (config.fimPreset === "custom") {
		return config.customMarkers
	}
	return FIM_MARKERS[config.fimPreset] || FIM_MARKERS.starcoder
}

/**
 * Build the FIM prompt string from prefix, suffix, and optional context
 *
 * Format: FimBegin + codeContext + "\n" + prefix + FimHole + suffix + FimEnd
 *
 * This matches the completion-agent's getFimPrompt() logic.
 */
export function buildFimPrompt(prefix: string, suffix: string, codeContext: string, markers: FimMarkers): string {
	const contextPart = codeContext ? codeContext + "\n" : ""
	return markers.begin + contextPart + prefix + markers.hole + suffix + markers.end
}

/**
 * Estimate token count using character-based approximation.
 *
 * Real tokenization requires the model's tokenizer (e.g. tiktoken, sentencepiece).
 * For preprocessing, we use a rough estimate: ~4 chars per token for code.
 * This is sufficient for truncation decisions.
 */
function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4)
}

/**
 * Truncate text to approximately maxTokens tokens (character-based estimate).
 * Preserves complete lines to avoid breaking syntax.
 */
function truncateToTokens(text: string, maxTokens: number): string {
	const maxChars = maxTokens * 4
	if (text.length <= maxChars) {
		return text
	}

	// Truncate and snap to line boundary
	const truncated = text.substring(0, maxChars)
	const lastNewline = truncated.lastIndexOf("\n")
	if (lastNewline > 0) {
		return truncated.substring(0, lastNewline + 1)
	}
	return truncated
}

/**
 * Preprocess the prompt: truncate prefix/suffix/context to fit model limits.
 *
 * This implements the same logic as completion-agent's truncatePrompt():
 * - If prefix alone exceeds maxPrefix, truncate prefix and discard context
 * - Otherwise, truncate context to make room for prefix
 * - Truncate suffix to maxSuffix
 */
export interface PreprocessedPrompt {
	prompt: string
	prefix: string
	suffix: string
	codeContext: string
}

export function preprocessPrompt(promptOptions: PromptOptions, config: CompletionModelConfig): PreprocessedPrompt {
	const markers = getFimMarkers(config)

	let prefix = promptOptions.prefix
	let suffix = promptOptions.suffix
	let codeContext = promptOptions.import_content

	// Build context from additional sources
	const contextParts: string[] = []
	if (codeContext) {
		contextParts.push(codeContext)
	}
	if (promptOptions.ast_context) {
		contextParts.push(promptOptions.ast_context)
	}
	codeContext = contextParts.join("\n")

	const prefixTokens = estimateTokens(prefix)
	const suffixTokens = estimateTokens(suffix)
	const contextTokens = estimateTokens(codeContext)

	// Truncate prefix + context to fit maxPrefixTokens
	if (prefixTokens + contextTokens > config.maxPrefixTokens) {
		const needCut = prefixTokens + contextTokens - config.maxPrefixTokens

		if (prefixTokens >= config.maxPrefixTokens) {
			// Prefix alone is too long: truncate prefix, discard context
			prefix = truncateToTokens(prefix, config.maxPrefixTokens)
			// Remove first incomplete line
			const firstNewline = prefix.indexOf("\n")
			if (firstNewline > 0 && !prefix.startsWith("\n")) {
				prefix = prefix.substring(firstNewline + 1)
			}
			codeContext = ""
		} else {
			// Truncate context to make room
			const contextMaxTokens = config.maxPrefixTokens - prefixTokens
			codeContext = truncateToTokens(codeContext, contextMaxTokens)
		}
	}

	// Truncate suffix to maxSuffixTokens
	if (suffixTokens > config.maxSuffixTokens) {
		suffix = truncateToTokens(suffix, config.maxSuffixTokens)
		// Remove last incomplete line
		const lines = suffix.split("\n")
		if (lines.length > 1 && !lines[lines.length - 1].endsWith("\n")) {
			lines.pop()
		}
		suffix = lines.join("\n")
	}

	const prompt = buildFimPrompt(prefix, suffix, codeContext, markers)

	return { prompt, prefix, suffix, codeContext }
}

/**
 * Build stop sequences for the completion request.
 *
 * Combines:
 * - User-configured stop sequences
 * - Default FIM end-of-sentence marker
 * - Multi-line stops when suffix is empty (prevent over-generation)
 */
export function buildStopSequences(config: CompletionModelConfig, suffix: string): string[] {
	const stops = new Set<string>()

	// Add configured stop sequences
	for (const stop of config.stopSequences) {
		if (stop) {
			stops.add(stop)
		}
	}

	// Default FIM end marker, selected per model family. StarCoder/StarCoder2
	// (GPT-2 lineage) use "<|endoftext|>", DeepSeek-Coder uses
	// "<｜end▁of▁sentence｜>", CodeLlama uses "</s>". Using the wrong token here
	// makes the model keep generating past its natural endpoint.
	const eosToken = config.fimPreset === "custom" ? undefined : FIM_EOS_TOKENS[config.fimPreset]
	if (eosToken) {
		stops.add(eosToken)
	} else {
		// Unknown/custom preset: fall back to the StarCoder GPT-2 EOS token.
		stops.add("<|endoftext|>")
	}

	// If suffix is empty or whitespace-only, add multi-line stops
	// to prevent the model from generating too much
	if (!suffix || suffix.trim() === "") {
		stops.add("\n\n")
		stops.add("\n\n\n")
	}

	return Array.from(stops)
}
