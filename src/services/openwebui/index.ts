/**
 * OpenWebUI knowledge base API client.
 *
 * Used by the @kb:// context mention feature. All requests authenticate with
 * the user's OpenWebUI token (Authorization: Bearer) so permissions are
 * enforced by OpenWebUI itself.
 *
 * API paths mirror the ones validated by the standalone
 * `openwebui-rag-mcp-server` project, with fallbacks for version differences.
 */

/** Retrieval strategy for @kb:// mentions. */
export type KnowledgeRetrievalMode =
	| "direct" // Host calls the REST API and injects results into the prompt (works for all models)
	| "mcp" // Host generates MCP tool-call instructions; the LLM decides when/how to call (requires tool-calling capability)

export interface OpenWebUIConfig {
	baseUrl: string
	token: string
	/** Optional route override for the knowledge base list query (path or absolute URL) */
	knowledgeListUrl?: string
	/** Optional route override for the file list query; supports "{id}" / "{knowledgeId}" placeholders */
	knowledgeFilesUrl?: string
	/** Retrieval strategy for @kb:// mentions. Defaults to "direct". */
	retrievalMode?: KnowledgeRetrievalMode
}

export interface OpenWebUIKnowledgeBase {
	id: string
	name: string
	description?: string
	collectionName?: string
}

export interface OpenWebUIKnowledgeFile {
	id: string
	name: string
	size?: number
}

export interface OpenWebUIChunk {
	content: string
	source?: string
	score?: number
}

const REQUEST_TIMEOUT_MS = 15_000

const KNOWLEDGE_LIST_PATHS = [
	"/api/v1/knowledge/search?page=1",
	"/api/v1/knowledge/",
	"/api/v1/knowledge",
	"/api/v1/knowledge/list",
]

const RETRIEVAL_QUERY_PATHS = ["/api/v1/retrieval/query", "/api/v1/retrieval/query/"]

export class OpenWebUIError extends Error {
	constructor(
		public readonly status: number,
		message: string,
	) {
		super(message)
		this.name = "OpenWebUIError"
	}
}

function normalizeBaseUrl(baseUrl: string): string {
	return baseUrl.replace(/\/+$/, "")
}

/**
 * Resolves a configured route (path like "/api/v1/knowledge/" or an absolute
 * URL) into a requestable URL against the service base URL.
 */
function resolveRoute(config: OpenWebUIConfig, route: string): string {
	const trimmed = route.trim()
	if (/^https?:\/\//i.test(trimmed)) {
		return trimmed
	}
	return normalizeBaseUrl(config.baseUrl) + (trimmed.startsWith("/") ? trimmed : `/${trimmed}`)
}

async function request(
	config: OpenWebUIConfig,
	method: "GET" | "POST",
	pathOrUrl: string,
	body?: unknown,
): Promise<unknown> {
	const controller = new AbortController()
	const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

	const url = /^https?:\/\//i.test(pathOrUrl) ? pathOrUrl : normalizeBaseUrl(config.baseUrl) + pathOrUrl

	try {
		const response = await fetch(url, {
			method,
			headers: {
				Accept: "application/json",
				Authorization: `Bearer ${config.token}`,
				...(body !== undefined ? { "Content-Type": "application/json" } : {}),
			},
			body: body !== undefined ? JSON.stringify(body) : undefined,
			signal: controller.signal,
		})

		if (response.status >= 400) {
			const text = await response.text().catch(() => "")
			throw new OpenWebUIError(response.status, text || response.statusText)
		}

		const text = await response.text()
		if (!text) {
			return undefined
		}

		try {
			return JSON.parse(text)
		} catch {
			return { raw_text: text }
		}
	} catch (error) {
		if (error instanceof OpenWebUIError) {
			throw error
		}
		const message = error instanceof Error ? error.message : String(error)
		throw new OpenWebUIError(502, `Cannot reach OpenWebUI: ${message}`)
	} finally {
		clearTimeout(timeout)
	}
}

async function tryPaths(
	config: OpenWebUIConfig,
	method: "GET" | "POST",
	paths: string[],
	body?: unknown,
): Promise<unknown> {
	let lastError: OpenWebUIError | undefined

	for (const path of paths) {
		try {
			return await request(config, method, path, body)
		} catch (error) {
			if (error instanceof OpenWebUIError && [403, 404, 405].includes(error.status)) {
				lastError = error
				continue
			}
			throw error
		}
	}

	throw lastError ?? new OpenWebUIError(500, "No usable OpenWebUI API path")
}

function firstString(source: Record<string, unknown>, keys: string[]): string | undefined {
	for (const key of keys) {
		const value = source[key]
		if (typeof value === "string" && value.length > 0) {
			return value
		}
	}
	return undefined
}

function extractList(data: unknown, keys: string[]): unknown[] {
	if (Array.isArray(data)) {
		return data
	}
	if (data && typeof data === "object") {
		const record = data as Record<string, unknown>
		for (const key of keys) {
			if (key in record) {
				const extracted = extractList(record[key], keys)
				if (extracted.length > 0) {
					return extracted
				}
			}
		}
	}
	return []
}

export async function listKnowledgeBases(config: OpenWebUIConfig): Promise<OpenWebUIKnowledgeBase[]> {
	let data: unknown
	if (config.knowledgeListUrl?.trim()) {
		// Try the configured route first; fall back to the default paths when it
		// fails (e.g. 403 for API tokens on older list endpoints).
		try {
			data = await request(config, "GET", resolveRoute(config, config.knowledgeListUrl))
		} catch (error) {
			if (error instanceof OpenWebUIError && [403, 404, 405].includes(error.status)) {
				data = await tryPaths(config, "GET", KNOWLEDGE_LIST_PATHS)
			} else {
				throw error
			}
		}
	} else {
		data = await tryPaths(config, "GET", KNOWLEDGE_LIST_PATHS)
	}
	const items = extractList(data, ["items", "knowledge", "data", "results"])

	const bases: OpenWebUIKnowledgeBase[] = []
	for (const item of items) {
		if (!item || typeof item !== "object") {
			continue
		}
		const record = item as Record<string, unknown>
		const name = firstString(record, ["name", "title"])
		const id = firstString(record, ["id", "_id"])
		if (!name || !id) {
			continue
		}
		bases.push({
			id,
			name,
			description: firstString(record, ["description"]),
			collectionName: firstString(record, ["collection_name", "collectionName", "collection"]),
		})
	}
	return bases
}

export async function findKnowledgeBase(
	config: OpenWebUIConfig,
	name: string,
): Promise<OpenWebUIKnowledgeBase | undefined> {
	const bases = await listKnowledgeBases(config)
	return bases.find((base) => base.name === name)
}

export async function listKnowledgeFiles(
	config: OpenWebUIConfig,
	knowledgeId: string,
): Promise<OpenWebUIKnowledgeFile[]> {
	let url: string
	if (config.knowledgeFilesUrl?.trim()) {
		const encodedId = encodeURIComponent(knowledgeId)
		url = resolveRoute(
			config,
			config.knowledgeFilesUrl.replace(/\{knowledgeId\}/g, encodedId).replace(/\{id\}/g, encodedId),
		)
	} else {
		url = `/api/v1/knowledge/${encodeURIComponent(knowledgeId)}/files`
	}
	const data = await request(config, "GET", url)
	const items = extractList(data, ["items", "documents", "data", "results", "files"])

	const files: OpenWebUIKnowledgeFile[] = []
	for (const item of items) {
		if (!item || typeof item !== "object") {
			continue
		}
		const record = item as Record<string, unknown>
		const name = firstString(record, ["filename", "file_name", "name", "title"])
		if (!name) {
			continue
		}
		const id = firstString(record, ["id", "_id"])
		files.push({
			id: id ?? name,
			name,
			size: typeof record["size"] === "number" ? record["size"] : undefined,
		})
	}
	return files
}

interface RetrievalResultChunk {
	content?: unknown
	text?: unknown
	document?: unknown
	metadata?: unknown
	source?: unknown
	file_name?: unknown
	score?: unknown
	distance?: unknown
}

export async function queryKnowledge(
	config: OpenWebUIConfig,
	options: {
		query: string
		collectionName?: string
		topK?: number
	},
): Promise<OpenWebUIChunk[]> {
	const topK = Math.max(1, Math.min(options.topK ?? 8, 20))
	const body: Record<string, unknown> = {
		query: options.query,
		top_k: topK,
	}
	if (options.collectionName) {
		// OpenWebUI versions differ on the accepted field name; send both.
		body["collection_name"] = options.collectionName
		body["collection_names"] = [options.collectionName]
	}

	const data = await tryPaths(config, "POST", RETRIEVAL_QUERY_PATHS, body)
	const items = extractList(data, ["results", "documents", "chunks", "items", "records", "hits"])

	const chunks: OpenWebUIChunk[] = []
	for (const item of items) {
		if (!item || typeof item !== "object") {
			continue
		}
		const record = item as RetrievalResultChunk

		let content: string | undefined
		for (const key of ["content", "text", "document"] as const) {
			const value = record[key]
			if (typeof value === "string" && value.length > 0) {
				content = value
				break
			}
		}
		if (content === undefined) {
			content = JSON.stringify(item)
		}

		const metadata =
			record.metadata && typeof record.metadata === "object"
				? (record.metadata as Record<string, unknown>)
				: undefined

		const source =
			(typeof record.source === "string" && record.source) ||
			(typeof record.file_name === "string" && record.file_name) ||
			(metadata && typeof metadata["source"] === "string" && metadata["source"]) ||
			(metadata && typeof metadata["file_name"] === "string" && metadata["file_name"]) ||
			undefined

		const score =
			typeof record.score === "number"
				? record.score
				: typeof record.distance === "number"
					? record.distance
					: undefined

		chunks.push({ content, source, score })
	}
	return chunks
}
