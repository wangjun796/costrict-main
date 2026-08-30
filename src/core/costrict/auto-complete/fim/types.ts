/**
 * Configuration types for the FIM (Fill-In-the-Middle) code completion model.
 *
 * These settings control how the completion model is called, including
 * the API endpoint, FIM token markers, and generation parameters.
 */

/** FIM token markers for different model formats */
export interface FimMarkers {
	/** Token that marks the beginning of the FIM prompt (e.g. "<fim_prefix>") */
	begin: string
	/** Token that separates prefix from suffix (e.g. "<fim_suffix>") */
	hole: string
	/** Token that marks the end of the FIM prompt (e.g. "<fim_middle>") */
	end: string
}

/** Predefined FIM marker sets for common models */
export const FIM_MARKERS: Record<string, FimMarkers> = {
	// StarCoder / StarCoder2 format
	starcoder: {
		begin: "<fim_prefix>",
		hole: "<fim_suffix>",
		end: "<fim_middle>",
	},
	// DeepSeek-Coder format
	deepseek: {
		begin: "<｜fim▁begin｜>",
		hole: "<｜fim▁hole｜>",
		end: "<｜fim▁end｜>",
	},
	// CodeLlama format
	codellama: {
		begin: "<PRE>",
		hole: "<SUF>",
		end: "<MID>",
	},
	// Qwen-Coder format
	qwen: {
		begin: "<fim_prefix>",
		hole: "<fim_suffix>",
		end: "<fim_middle>",
	},
}

/**
 * End-of-sequence (EOS) tokens per model family.
 *
 * Each family terminates generation with a different special token. Using the
 * wrong one as a stop sequence means the model keeps generating past its
 * natural endpoint (or the server errors out). StarCoder/StarCoder2 (GPT-2
 * lineage) uses "<|endoftext|>", DeepSeek-Coder uses the sentencepiece-style
 * "<｜end▁of▁sentence｜>", and CodeLlama uses "</s>".
 */
export const FIM_EOS_TOKENS: Record<string, string> = {
	starcoder: "<|endoftext|>",
	deepseek: "<｜end▁of▁sentence｜>",
	codellama: "</s>",
	qwen: "<|endoftext|>",
}

/** Completion model configuration */
export interface CompletionModelConfig {
	/** Whether FIM completion via custom model is enabled */
	enabled: boolean
	/** API base URL of the completion model server (e.g. "http://192.168.1.100:8000") */
	apiUrl: string
	/** Model name to request (e.g. "bigcode/starcoder2-7b") */
	modelName: string
	/** API key for authentication (optional, sent as Bearer token) */
	apiKey: string
	/** FIM marker preset name or "custom" */
	fimPreset: string
	/** Custom FIM markers (used when fimPreset === "custom") */
	customMarkers: FimMarkers
	/** Maximum tokens for prefix (truncated if exceeded) */
	maxPrefixTokens: number
	/** Maximum tokens for suffix (truncated if exceeded) */
	maxSuffixTokens: number
	/** Maximum output tokens */
	maxOutputTokens: number
	/** Sampling temperature (0-2, null = use model default) */
	temperature: number | null
	/** Top-p sampling (0-1, 0 = disabled) */
	topP: number
	/** Top-k sampling (0 = disabled / use server default) */
	topK: number
	/** Repetition penalty (1.0 = no penalty; null = use model default) */
	repetitionPenalty: number | null
	/** Whether to sample (false = greedy decoding) */
	doSample: boolean
	/** Stop sequences */
	stopSequences: string[]
	/**
	 * Request timeout in milliseconds.
	 *
	 * `0` (or any value <= 0) means "never time out" — useful when debugging
	 * against a slow local/CPU-only model server. Cancellation then relies
	 * solely on the caller (debounce, cursor move, new request, VS Code
	 * CancellationToken).
	 */
	timeoutMs: number
	/**
	 * Debounce delay in milliseconds before a completion request is sent.
	 *
	 * Typing fast produces one provider call per keystroke; the debounce
	 * collapses them into a single request. `0` disables debouncing.
	 */
	debounceMs: number
	/** Whether to print stage-by-stage debug traces for the completion pipeline */
	debug: boolean
}

/** Default configuration values */
export const DEFAULT_COMPLETION_MODEL_CONFIG: CompletionModelConfig = {
	enabled: true,
	apiUrl: "http://127.0.0.1:11434/api/generate",
	modelName: "deepseek-coder:1.3b",
	apiKey: "",
	fimPreset: "deepseek",
	customMarkers: {
		begin: "<fim_prefix>",
		hole: "<fim_suffix>",
		end: "<fim_middle>",
	},
	maxPrefixTokens: 2048,
	maxSuffixTokens: 512,
	maxOutputTokens: 256,
	temperature: 0.1,
	topP: 0.95,
	topK: 50,
	repetitionPenalty: 1.0,
	doSample: true,
	stopSequences: [],
	timeoutMs: 3000,
	debounceMs: 300,
	debug: false,
}
