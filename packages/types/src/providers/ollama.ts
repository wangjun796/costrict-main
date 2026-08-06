import type { ModelInfo } from "../model.js"

// Ollama
// https://ollama.com/models
export const ollamaDefaultModelId = "qwen/qwen3.7-coder"
export const ollamaDefaultModelInfo: ModelInfo = {
	maxTokens: 4096,
	contextWindow: 200_000,
	supportsImages: true,
	supportsPromptCache: true,
	inputPrice: 0,
	outputPrice: 0,
	cacheWritesPrice: 0,
	cacheReadsPrice: 0,
	description: "Ollama hosted models",
}
