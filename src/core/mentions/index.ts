import fs from "fs/promises"
import * as path from "path"

import * as vscode from "vscode"
import { isBinaryFileWithEncodingDetection } from "../../utils/encoding"

import {
	mentionRegexGlobal,
	commandRegexGlobal,
	unescapeSpaces,
	parseKnowledgeRef,
} from "../../shared/context-mentions"

import { getCommitInfo, getWorkingState } from "../../utils/git"

import { openFile } from "../../integrations/misc/open-file"
import { extractTextFromFileWithMetadata, type ExtractTextResult } from "../../integrations/misc/extract-text"
import { diagnosticsToProblemsString } from "../../integrations/diagnostics"
import { DEFAULT_LINE_LIMIT } from "../prompts/tools/native-tools/read_file"

import { FileContextTracker } from "../context-tracking/FileContextTracker"

import { RooIgnoreController } from "../ignore/RooIgnoreController"
import { getCommand, type Command } from "../../services/command/commands"
import { buildSkillResult, resolveSkillContentForMode, type SkillLookup } from "../../services/skills/skillInvocation"
import type { SkillContent } from "../../shared/skills"
import {
	findKnowledgeBase,
	listKnowledgeBases,
	listKnowledgeFiles,
	queryKnowledge,
	type OpenWebUIConfig,
} from "../../services/openwebui"
import type { KnowledgeReferenceMeta } from "@roo-code/types"

/**
 * Maximum number of files to read from a folder mention.
 * This prevents context window explosion when mentioning large directories.
 */
export const MAX_FOLDER_FILES_TO_READ = 10

/**
 * Maximum total content size (in characters) to read from a folder mention.
 * This is approximately 100KB which should be safe for most context windows.
 */
export const MAX_FOLDER_CONTENT_SIZE = 100_000

/**
 * Maximum total content size (in characters) contributed by file/folder mentions
 * in a single parsed user message. This preserves room for the rest of the prompt
 * while still favoring original source content over summaries.
 */
export const MAX_MENTION_CONTEXT_CHARS = 120_000

interface MentionBudgetEntry {
	path: string
	type: "file" | "folder"
	status: "included" | "omitted"
}

interface MentionBudgetState {
	usedChars: number
	limitChars: number
	entries: MentionBudgetEntry[]
	budgetExceeded: boolean
}
export async function openMention(cwd: string, mention?: string): Promise<void> {
	if (!mention) {
		return
	}

	if (mention.startsWith("/")) {
		// Slice off the leading slash and unescape any spaces in the path
		const relPath = unescapeSpaces(mention.slice(1))
		const absPath = path.resolve(cwd, relPath)
		if (mention.endsWith("/")) {
			vscode.commands.executeCommand("revealInExplorer", vscode.Uri.file(absPath))
		} else {
			openFile(absPath)
		}
	} else if (mention === "problems") {
		vscode.commands.executeCommand("workbench.actions.view.problems")
	} else if (mention === "terminal") {
		vscode.commands.executeCommand("workbench.action.terminal.focus")
	} else if (mention.startsWith("http")) {
		vscode.env.openExternal(vscode.Uri.parse(mention))
	}
}

/**
 * Represents a content block generated from an @ mention.
 * These are returned separately from the user's text to enable
 * proper formatting as distinct message blocks.
 */
export interface MentionContentBlock {
	type:
		| "file"
		| "folder"
		| "url"
		| "diagnostics"
		| "git_changes"
		| "git_commit"
		| "terminal"
		| "command"
		| "knowledge"
	/** Path for file/folder mentions */
	path?: string
	/** The content to display */
	content: string
	/** Metadata about truncation (for files) */
	metadata?: {
		totalLines: number
		returnedLines: number
		wasTruncated: boolean
		linesShown?: [number, number]
	}
}

export interface ParseMentionsResult {
	/** User's text with @ mentions replaced by clean path references */
	text: string
	/** Separate content blocks for each mention (file content, URLs, etc.) */
	contentBlocks: MentionContentBlock[]
	slashCommandHelp?: string
	mode?: string // Mode from the first slash command that has one
}

/**
 * Formats file content to look like a read_file tool result.
 * Includes Gemini-style truncation warning when content is truncated.
 */
function formatFileReadResult(filePath: string, result: ExtractTextResult): string {
	const header = `[read_file for '${filePath}']`

	if (result.wasTruncated && result.linesShown) {
		const [start, end] = result.linesShown
		const nextOffset = end + 1
		return `${header}
IMPORTANT: File content truncated.
Status: Showing lines ${start}-${end} of ${result.totalLines} total lines.
To read more: Use the read_file tool with offset=${nextOffset} and limit=${DEFAULT_LINE_LIMIT}.

File: ${filePath}
${result.content}`
	}

	return `${header}
File: ${filePath}
${result.content}`
}

function createMentionBudgetState(limitChars: number = MAX_MENTION_CONTEXT_CHARS): MentionBudgetState {
	return {
		usedChars: 0,
		limitChars,
		entries: [],
		budgetExceeded: false,
	}
}

function tryAddMentionContentBlock(
	budgetState: MentionBudgetState,
	contentBlocks: MentionContentBlock[],
	block: MentionContentBlock,
): boolean {
	if ((block.type !== "file" && block.type !== "folder") || !block.path) {
		contentBlocks.push(block)
		return true
	}

	const nextSize = block.content.length
	if (budgetState.usedChars + nextSize > budgetState.limitChars) {
		budgetState.entries.push({
			path: block.path,
			type: block.type,
			status: "omitted",
		})
		budgetState.budgetExceeded = true
		return false
	}

	contentBlocks.push(block)
	budgetState.usedChars += nextSize
	budgetState.entries.push({
		path: block.path,
		type: block.type,
		status: "included",
	})
	return true
}

function buildMentionBudgetNotice(budgetState: MentionBudgetState): MentionContentBlock | undefined {
	if (!budgetState.budgetExceeded) {
		return undefined
	}

	const included = budgetState.entries.filter((entry) => entry.status === "included")
	const omitted = budgetState.entries.filter((entry) => entry.status === "omitted")
	if (omitted.length === 0) {
		return undefined
	}

	const formatEntries = (entries: MentionBudgetEntry[]) => entries.map((entry) => `- @${entry.path}`).join("\n")

	const sections = [
		"[mention_budget_notice]",
		"Some @-mentioned file or folder content was omitted to avoid overloading the initial context.",
	]

	if (included.length > 0) {
		sections.push(`\nIncluded within budget:\n${formatEntries(included)}`)
	}

	sections.push(`\nOmitted due to budget:\n${formatEntries(omitted)}`)
	sections.push("\nIf needed, use `read_file` or `list_files` to inspect the omitted paths.")

	return {
		type: "file",
		content: sections.join("\n"),
	}
}

export async function parseMentions(
	text: string,
	cwd: string,
	fileContextTracker?: FileContextTracker,
	rooIgnoreController?: RooIgnoreController,
	showRooIgnoredFiles: boolean = false,
	includeDiagnosticMessages: boolean = true,
	maxDiagnosticMessages: number = 50,
	skillsManager?: SkillLookup,
	currentMode: string = "code",
	language?: string,
	mentionBudgetChars?: number,
	knowledgeConfig?: OpenWebUIConfig,
	knowledgeRefRegistry?: ReadonlyMap<string, KnowledgeReferenceMeta>,
): Promise<ParseMentionsResult> {
	const mentions: Set<string> = new Set()
	const validCommands: Map<string, Command> = new Map()
	const validSkills: Map<string, SkillContent> = new Map()
	const contentBlocks: MentionContentBlock[] = []
	const mentionBudgetState = createMentionBudgetState(mentionBudgetChars)
	let commandMode: string | undefined // Track mode from the first slash command that has one

	// First pass: check which command mentions exist and cache the results
	const commandMatches = Array.from(text.matchAll(commandRegexGlobal))
	const uniqueCommandNames = new Set(commandMatches.map(([, commandName]) => commandName))

	const commandExistenceChecks = await Promise.all(
		Array.from(uniqueCommandNames).map(async (commandName) => {
			try {
				const command = language
					? await getCommand(cwd, commandName, language)
					: await getCommand(cwd, commandName)
				if (command) {
					return { commandName, command, skillContent: null }
				}

				const skillContent = await resolveSkillContentForMode(skillsManager, commandName, currentMode)
				return { commandName, command: undefined, skillContent }
			} catch (error) {
				// If there's an error checking command existence, treat it as non-existent
				return { commandName, command: undefined, skillContent: null }
			}
		}),
	)

	// Store valid commands for later use and capture the first mode found
	for (const { commandName, command, skillContent } of commandExistenceChecks) {
		if (command) {
			validCommands.set(commandName, command)
			// Capture the mode from the first command that has one
			if (!commandMode && command.mode) {
				commandMode = command.mode
			}
			continue
		}

		if (skillContent) {
			validSkills.set(commandName, skillContent)
		}
	}

	// Only replace text for commands that actually exist (keep "see below" for commands)
	let parsedText = text
	for (const [match, commandName] of commandMatches) {
		if (validCommands.has(commandName) || validSkills.has(commandName)) {
			parsedText = parsedText.replace(match, `Command '${commandName}' (see below for command content)`)
		}
	}

	// Second pass: handle regular mentions - replace with clean references
	// Content will be provided as separate blocks that look like read_file results
	parsedText = parsedText.replace(mentionRegexGlobal, (match, mention) => {
		mentions.add(mention)
		if (mention.startsWith("http")) {
			return `'${mention}'`
		} else if (mention.startsWith("kb://")) {
			const ref = parseKnowledgeRef(mention.slice("kb://".length))
			const label = ref.fileName ? `${ref.knowledgeName}/${ref.fileName}` : ref.knowledgeName
			return `Knowledge Base '${label}' (knowledge reference below - you MUST retrieve its content via the OpenWebUI MCP tools before answering)`
		} else if (mention.startsWith("/")) {
			// Clean path reference - no "see below" since we format like tool results
			const mentionPath = mention.slice(1)
			return mentionPath.endsWith("/") ? `'${mentionPath}'` : `'${mentionPath}'`
		} else if (mention === "problems") {
			return `Workspace Problems (see below for diagnostics)`
		} else if (mention === "git-changes") {
			return `Working directory changes (see below for details)`
		} else if (/^[a-f0-9]{7,40}$/.test(mention)) {
			return `Git commit '${mention}' (see below for commit info)`
		} else if (mention === "terminal") {
			return `Terminal Output (see below for output)`
		}
		return match
	})

	for (const mention of mentions) {
		if (mention.startsWith("/")) {
			const mentionPath = mention.slice(1)
			try {
				const fileResult = await getFileOrFolderContentWithMetadata(
					mentionPath,
					cwd,
					rooIgnoreController,
					showRooIgnoredFiles,
					fileContextTracker,
				)
				tryAddMentionContentBlock(mentionBudgetState, contentBlocks, fileResult)
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error)
				tryAddMentionContentBlock(mentionBudgetState, contentBlocks, {
					type: mention.endsWith("/") ? "folder" : "file",
					path: mentionPath,
					content: `[read_file for '${mentionPath}']\nError: ${errorMsg}`,
				})
			}
		} else if (mention === "problems") {
			try {
				const problems = await getWorkspaceProblems(cwd, includeDiagnosticMessages, maxDiagnosticMessages)
				parsedText += `\n\n<workspace_diagnostics>\n${problems}\n</workspace_diagnostics>`
			} catch (error) {
				parsedText += `\n\n<workspace_diagnostics>\nError fetching diagnostics: ${error.message}\n</workspace_diagnostics>`
			}
		} else if (mention === "git-changes") {
			try {
				const workingState = await getWorkingState(cwd)
				parsedText += `\n\n<git_working_state>\n${workingState}\n</git_working_state>`
			} catch (error) {
				parsedText += `\n\n<git_working_state>\nError fetching working state: ${error.message}\n</git_working_state>`
			}
		} else if (/^[a-f0-9]{7,40}$/.test(mention)) {
			try {
				const commitInfo = await getCommitInfo(mention, cwd)
				parsedText += `\n\n<git_commit hash="${mention}">\n${commitInfo}\n</git_commit>`
			} catch (error) {
				parsedText += `\n\n<git_commit hash="${mention}">\nError fetching commit info: ${error.message}\n</git_commit>`
			}
		} else if (mention === "terminal") {
			try {
				const terminalOutput = await getLatestTerminalOutput()
				parsedText += `\n\n<terminal_output>\n${terminalOutput}\n</terminal_output>`
			} catch (error) {
				parsedText += `\n\n<terminal_output>\nError fetching terminal output: ${error.message}\n</terminal_output>`
			}
		} else if (mention.startsWith("kb://")) {
			const queryText = text.replace(mentionRegexGlobal, "").replace(/\s+/g, " ").trim().slice(0, 500)

			try {
				const content = await getKnowledgeMentionContent(
					knowledgeConfig,
					mention,
					queryText,
					knowledgeRefRegistry,
				)
				tryAddMentionContentBlock(mentionBudgetState, contentBlocks, content)
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error)
				contentBlocks.push({
					type: "knowledge",
					path: mention,
					content: `[knowledge_reference for '${mention}']\nError: ${errorMsg}`,
				})
			}
		}
	}

	const mentionBudgetNotice = buildMentionBudgetNotice(mentionBudgetState)
	if (mentionBudgetNotice) {
		contentBlocks.push(mentionBudgetNotice)
	}

	// Process valid command mentions using cached results
	let slashCommandHelp = ""
	for (const [commandName, command] of validCommands) {
		try {
			let commandOutput = ""
			if (command.description) {
				commandOutput += `Description: ${command.description}\n\n`
			}
			commandOutput += command.content
			slashCommandHelp += `\n\n<command name="${commandName}">\n${commandOutput}\n</command>`
		} catch (error) {
			slashCommandHelp += `\n\n<command name="${commandName}">\nError loading command '${commandName}': ${error.message}\n</command>`
		}
	}

	for (const [skillName, skillContent] of validSkills) {
		slashCommandHelp += `\n\n${buildSkillResult(skillName, undefined, skillContent)}`
	}

	return {
		text: parsedText,
		contentBlocks,
		mode: commandMode,
		slashCommandHelp: slashCommandHelp.trim() || undefined,
	}
}

/**
 * Resolves an @kb:// mention into a knowledge reference block that instructs
 * the agent to retrieve the referenced content through the OpenWebUI MCP tools
 * (vector store query) BEFORE answering. The ids embedded in the mention
 * (knowledge id, collection id, file id) are passed straight through so the
 * MCP tools can address the vector store without re-resolving names; when the
 * mention carries no ids, a best-effort name lookup enriches the reference.
 */
async function getKnowledgeMentionContent(
	config: OpenWebUIConfig | undefined,
	mention: string,
	queryText: string,
	knowledgeRefRegistry?: ReadonlyMap<string, KnowledgeReferenceMeta>,
): Promise<MentionContentBlock> {
	const ref = parseKnowledgeRef(mention.slice("kb://".length))

	// Pure-name mentions keep their ids in the host-side selection registry
	// (keyed by the normalized pure reference).
	const registered = knowledgeRefRegistry?.get(`kb://${ref.knowledgeName}${ref.fileName ? `/${ref.fileName}` : ""}`)

	let knowledgeId = ref.knowledgeId ?? registered?.knowledgeId
	let collectionId = ref.collectionId ?? registered?.collectionId
	let fileId = ref.fileId ?? registered?.fileId
	let description: string | undefined
	let documentNames: string[] = []

	// Best-effort enrichment: fill missing ids / metadata via the REST API.
	if (config && (!knowledgeId || !collectionId)) {
		try {
			const base = knowledgeId
				? (await listKnowledgeBases(config)).find((entry) => entry.id === knowledgeId)
				: await findKnowledgeBase(config, ref.knowledgeName)
			if (base) {
				knowledgeId = knowledgeId ?? base.id
				collectionId = collectionId ?? base.collectionName
				description = base.description
			}
		} catch {
			// Enrichment is optional; the ids embedded in the mention are enough.
		}
	}

	if (!knowledgeId && config) {
		try {
			const base = await findKnowledgeBase(config, ref.knowledgeName)
			if (base) {
				knowledgeId = base.id
				collectionId = collectionId ?? base.collectionName
				description = base.description
			}
		} catch {
			// Ignore - the error block below covers the not-found case.
		}
	}

	if (!knowledgeId) {
		return {
			type: "knowledge",
			path: mention,
			content: [
				`[knowledge_reference for '${mention}']`,
				`Error: Knowledge base '${ref.knowledgeName}' could not be resolved${config ? "" : " (OpenWebUI is not configured)"}.`,
			].join("\n"),
		}
	}

	const targetLabel = ref.fileName
		? `document '${ref.fileName}' in knowledge base '${ref.knowledgeName}'`
		: `knowledge base '${ref.knowledgeName}'`

	const lines = [
		`[knowledge_reference for '${mention}']`,
		`Target: ${targetLabel}`,
		`knowledge_id: ${knowledgeId}`,
		collectionId ? `collection_id: ${collectionId}` : undefined,
		ref.fileName ? `document_name: ${ref.fileName}` : undefined,
		fileId ? `document_id: ${fileId}` : undefined,
		description ? `description: ${description}` : undefined,
	]

	if (!ref.fileName) {
		try {
			if (config) {
				documentNames = (await listKnowledgeFiles(config, knowledgeId)).map((file) => file.name)
			}
		} catch {
			// Document list is optional metadata.
		}
		if (documentNames.length > 0) {
			lines.push(`documents (${documentNames.length}): ${documentNames.join(", ")}`)
		}
	}

	const question = (queryText || ref.fileName || ref.knowledgeName).trim()
	const mode = config?.retrievalMode ?? "direct"

	if (mode === "mcp") {
		// MCP 模式：生成 tool-call 指令给有工具调用能力的 LLM。
		// 由 LLM 自行决定何时调、如何调 OpenWebUI MCP 工具。
		// - 引用的是知识库 → 传 knowledge_ids（KB UUID）
		// - 引用的是某篇文档 → 传 knowledge_ids + document_names
		//   （openwebui-rag-mcp-server 的 handle_ask_knowledge 不支持 file_ids，
		//    只能按文件名称过滤；见 openwebui-rag-mcp-server/src/tools.py）
		const fileIdHint = fileId
			? `, file_id="${fileId}" (use as document_names via list_documents if file name lookup fails)`
			: ""
		lines.push(
			"",
			"REQUIRED RETRIEVAL STEP - perform this BEFORE answering the user:",
			`1. Call the OpenWebUI MCP tool \`openwebui_ask_knowledge\` with: question="${question.slice(0, 300)}", knowledge_ids=["${knowledgeId}"]${ref.fileName ? `, document_names=["${ref.fileName}"]${fileIdHint}` : ""}, top_k=5.`,
			`   (Alternative: \`openwebui_search_knowledge\` with query="${question.slice(0, 300)}", knowledge_id="${knowledgeId}"${ref.fileName ? `, document_name="${ref.fileName}"` : ""}, top_k=5.)`,
			"2. Wait for the retrieval results, then assemble your final answer based on the retrieved passages and cite the source document names.",
			"3. If the tools return no passages or are unavailable, tell the user knowledge retrieval failed - do not invent knowledge base content.",
		)
	} else {
		// Direct 模式：host 调 REST API 把结果直接注入到 prompt。
		// 适用于所有模型（即便没有 tool-calling 能力）。
		// - 引用的是知识库 → POST /api/v1/retrieval/query/collection
		//   body: { query, k, collection_name=<KB id>, collection_names=[<KB id>] }
		// - 引用的是某篇文档 → POST /api/v1/retrieval/query/doc
		//   body: { query, k, collection_name="file-{file_id}" }
		if (config) {
			try {
				const chunks = await queryKnowledge(config, {
					query: question.slice(0, 300),
					// 优先按文档检索（更精确），没有 fileId 时回退到知识库级。
					fileId: fileId,
					knowledgeId: fileId ? undefined : knowledgeId,
					topK: 5,
				})

				if (chunks.length > 0) {
					lines.push("", "Retrieved knowledge base passages (use these to answer the user's question):")
					chunks.forEach((chunk, idx) => {
						const sourceLabel = chunk.source ? ` [source: ${chunk.source}]` : ""
						const scoreLabel = chunk.score !== undefined ? ` (score: ${chunk.score.toFixed(3)})` : ""
						lines.push(`--- Passage ${idx + 1}${sourceLabel}${scoreLabel} ---`)
						lines.push(chunk.content)
					})
					lines.push("--- End of retrieved passages ---")
					lines.push("")
					lines.push(
						"Answer the user's question based on the retrieved passages above. Cite the source document names where applicable. If the passages do not contain relevant information, tell the user honestly.",
					)
				} else {
					lines.push(
						"",
						"[Knowledge retrieval returned no results. The knowledge base may not contain relevant information for this question.]",
					)
				}
			} catch (error) {
				const errMsg = error instanceof Error ? error.message : String(error)
				lines.push(
					"",
					`[Knowledge retrieval failed: ${errMsg}. Please check OpenWebUI configuration and MCP server status.]`,
				)
			}
		} else {
			lines.push(
				"",
				"[OpenWebUI is not configured. Please set the OpenWebUI service address and API Token in Settings → Providers to enable knowledge base retrieval.]",
			)
		}
	}

	return {
		type: "knowledge",
		path: mention,
		content: lines.filter((line) => line !== undefined).join("\n"),
	}
}

/**
 * Gets file or folder content and returns it as a MentionContentBlock
 * formatted to look like a read_file tool result.
 */
async function getFileOrFolderContentWithMetadata(
	mentionPath: string,
	cwd: string,
	rooIgnoreController?: any,
	showRooIgnoredFiles: boolean = false,
	fileContextTracker?: FileContextTracker,
): Promise<MentionContentBlock> {
	const unescapedPath = unescapeSpaces(mentionPath)
	const absPath = path.resolve(cwd, unescapedPath)
	const isFolder = mentionPath.endsWith("/")

	try {
		const stats = await fs.stat(absPath)

		if (stats.isFile()) {
			// Avoid trying to include image binary content as text context.
			// Image mentions are handled separately via image attachment flow.
			const isBinary = await isBinaryFileWithEncodingDetection(absPath).catch(() => false)
			if (isBinary) {
				return {
					type: "file",
					path: mentionPath,
					content: `[read_file for '${mentionPath}']\nNote: Binary file omitted from context.`,
				}
			}
			if (rooIgnoreController && !rooIgnoreController.validateAccess(unescapedPath)) {
				return {
					type: "file",
					path: mentionPath,
					content: `[read_file for '${mentionPath}']\nNote: File is ignored by .rooignore.`,
				}
			}
			try {
				const result = await extractTextFromFileWithMetadata(absPath)

				// Track file context
				if (fileContextTracker) {
					await fileContextTracker.trackFileContext(mentionPath, "file_mentioned")
				}

				return {
					type: "file",
					path: mentionPath,
					content: formatFileReadResult(mentionPath, result),
					metadata: {
						totalLines: result.totalLines,
						returnedLines: result.returnedLines,
						wasTruncated: result.wasTruncated,
						linesShown: result.linesShown,
					},
				}
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error)
				return {
					type: "file",
					path: mentionPath,
					content: `[read_file for '${mentionPath}']\nError: ${errorMsg}`,
				}
			}
		} else if (stats.isDirectory()) {
			const entries = await fs.readdir(absPath, { withFileTypes: true })
			let folderListing = ""
			const fileReadResults: string[] = []
			const LOCK_SYMBOL = "🔒"
			// Track limits to prevent context window explosion
			let filesRead = 0
			let totalContentSize = 0
			let limitReached: "files" | "size" | null = null
			let skippedFilesCount = 0
			for (let index = 0; index < entries.length; index++) {
				const entry = entries[index]
				const isLast = index === entries.length - 1
				const linePrefix = isLast ? "└── " : "├── "
				const entryPath = path.join(absPath, entry.name)

				let isIgnored = false
				if (rooIgnoreController) {
					isIgnored = !rooIgnoreController.validateAccess(entryPath)
				}

				if (isIgnored && !showRooIgnoredFiles) {
					continue
				}

				const displayName = isIgnored ? `${LOCK_SYMBOL} ${entry.name}` : entry.name

				if (entry.isFile()) {
					folderListing += `${linePrefix}${displayName}\n`
					if (!isIgnored) {
						// Check if we've hit the file limit
						if (filesRead >= MAX_FOLDER_FILES_TO_READ) {
							if (!limitReached) {
								limitReached = "files"
							}
							skippedFilesCount++
							continue
						}

						// Check if we've hit the content size limit
						if (totalContentSize >= MAX_FOLDER_CONTENT_SIZE) {
							if (!limitReached) {
								limitReached = "size"
							}
							skippedFilesCount++
							continue
						}
						const filePath = path.join(mentionPath, entry.name)
						const absoluteFilePath = path.resolve(absPath, entry.name)
						try {
							const isBinary = await isBinaryFileWithEncodingDetection(absoluteFilePath).catch(
								() => false,
							)
							if (!isBinary) {
								const result = await extractTextFromFileWithMetadata(absoluteFilePath)
								const fileContent = formatFileReadResult(filePath.toPosix(), result)

								// Check if adding this file would exceed the size limit
								if (totalContentSize + fileContent.length > MAX_FOLDER_CONTENT_SIZE) {
									if (!limitReached) {
										limitReached = "size"
									}
									skippedFilesCount++
									continue
								}

								fileReadResults.push(fileContent)
								filesRead++
								totalContentSize += fileContent.length
							}
						} catch (error) {
							// Skip files that can't be read
						}
					}
				} else if (entry.isDirectory()) {
					folderListing += `${linePrefix}${displayName}/\n`
				} else {
					folderListing += `${linePrefix}${displayName}\n`
				}
			}

			// Format folder content similar to read_file output
			let content = `[read_file for folder '${mentionPath}']\nFolder listing:\n${folderListing}`
			if (fileReadResults.length > 0) {
				content += `\n\n--- File Contents ---\n\n${fileReadResults.join("\n\n")}`
			}
			// Add truncation notice if limits were hit
			if (limitReached) {
				const limitMessage =
					limitReached === "files"
						? `\n\n--- Content Truncated ---\nNote: Only ${MAX_FOLDER_FILES_TO_READ} files were read to prevent context window overflow. ${skippedFilesCount} additional file(s) were skipped.\nTo read specific files, use individual @file mentions instead of @folder.`
						: `\n\n--- Content Truncated ---\nNote: Content was limited to approximately ${Math.round(MAX_FOLDER_CONTENT_SIZE / 1000)}KB to prevent context window overflow. ${skippedFilesCount} additional file(s) were skipped.\nTo read specific files, use individual @file mentions instead of @folder.`
				content += limitMessage
			}
			return {
				type: "folder",
				path: mentionPath,
				content,
			}
		} else {
			return {
				type: isFolder ? "folder" : "file",
				path: mentionPath,
				content: `[read_file for '${mentionPath}']\nError: Unable to read (not a file or directory)`,
			}
		}
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error)
		throw new Error(`Failed to access path "${mentionPath}": ${errorMsg}`)
	}
}

async function getWorkspaceProblems(
	cwd: string,
	includeDiagnosticMessages: boolean = true,
	maxDiagnosticMessages: number = 50,
): Promise<string> {
	const diagnostics = vscode.languages.getDiagnostics()
	const result = await diagnosticsToProblemsString(
		diagnostics,
		[vscode.DiagnosticSeverity.Error, vscode.DiagnosticSeverity.Warning],
		cwd,
		includeDiagnosticMessages,
		maxDiagnosticMessages,
	)
	if (!result) {
		return "No errors or warnings detected."
	}
	return result
}

/**
 * Gets the contents of the active terminal
 * @returns The terminal contents as a string
 */
export async function getLatestTerminalOutput(): Promise<string> {
	// Store original clipboard content to restore later
	const originalClipboard = await vscode.env.clipboard.readText()

	try {
		// Select terminal content
		await vscode.commands.executeCommand("workbench.action.terminal.selectAll")

		// Copy selection to clipboard
		await vscode.commands.executeCommand("workbench.action.terminal.copySelection")

		// Clear the selection
		await vscode.commands.executeCommand("workbench.action.terminal.clearSelection")

		// Get terminal contents from clipboard
		let terminalContents = (await vscode.env.clipboard.readText()).trim()

		// Check if there's actually a terminal open
		if (terminalContents === originalClipboard) {
			return ""
		}

		// Clean up command separation
		const lines = terminalContents.split("\n")
		const lastLine = lines.pop()?.trim()

		if (lastLine) {
			let i = lines.length - 1

			while (i >= 0 && !lines[i].trim().startsWith(lastLine)) {
				i--
			}

			terminalContents = lines.slice(Math.max(i, 0)).join("\n")
		}

		return terminalContents
	} finally {
		// Restore original clipboard content
		await vscode.env.clipboard.writeText(originalClipboard)
	}
}

// Export processUserContentMentions from its own file
export { processUserContentMentions } from "./processUserContentMentions"
export type { ProcessUserContentMentionsResult } from "./processUserContentMentions"
