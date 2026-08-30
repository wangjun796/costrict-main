/**
 * FIM (Fill-In-the-Middle) completion module.
 *
 * This module provides a pure TypeScript implementation that replaces the
 * completion-agent Go service. It handles:
 *
 * - Prompt preprocessing (FIM marker assembly, token-based truncation)
 * - HTTP requests to completion model servers (StarCoder, OpenAI-compatible)
 * - Response postprocessing (overlap removal, repetition filtering)
 *
 * Usage:
 * ```typescript
 * import { requestFimCompletion } from "./fim"
 *
 * const result = await requestFimCompletion(
 *   promptOptions,
 *   config,
 *   completionId,
 *   abortSignal
 * )
 * ```
 */

export { requestFimCompletion, getCompletionModelConfig, type FimCompletionResult } from "./completionEngine"
export { preprocessPrompt, buildStopSequences, type PreprocessedPrompt } from "./preprocess"
export { postprocessCompletion, stripSpecialTokens } from "./postprocess"
export {
	type CompletionModelConfig,
	type FimMarkers,
	FIM_MARKERS,
	FIM_EOS_TOKENS,
	DEFAULT_COMPLETION_MODEL_CONFIG,
} from "./types"
