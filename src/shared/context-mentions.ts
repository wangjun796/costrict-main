/*
Mention regex:
- **Purpose**:
  - To identify and highlight specific mentions in text that start with '@'.
  - These mentions can be file paths, URLs, or the exact word 'problems'.
  - Ensures that trailing punctuation marks (like commas, periods, etc.) are not included in the match, allowing punctuation to follow the mention without being part of it.
  - Restricts @ parsing to line-start or after whitespace to avoid accidental loading from pasted logs.

- **Regex Breakdown**:
  - `(?:^|\s)`:
	- **Non-Capturing Group (`(?:...)`)**: Groups the alternatives without capturing them.
	- **Line Start or Whitespace (`^|\s`)**: The @ must be at the start of a line or preceded by whitespace.
  
  - `(?<!\\)@`:
	- **Negative Lookbehind (`(?<!\\)`)**: Ensures the @ is not escaped with a backslash.
	- **@**: The mention must start with the '@' symbol.
  
  - `((?:\/|\w+:\/\/)[^\s]+?|problems\b|git-changes\b)`:
	- **Capturing Group (`(...)`)**: Captures the part of the string that matches one of the specified patterns.
	- `(?:\/|\w+:\/\/)`:
	  - **Non-Capturing Group (`(?:...)`)**: Groups the alternatives without capturing them for back-referencing.
	  - `\/`:
		- **Slash (`/`)**: Indicates that the mention is a file or folder path starting with a '/'.
	  - `|`: Logical OR.
	  - `\w+:\/\/`:
	    - **Protocol (`\w+://`)**: Matches URLs that start with a word character sequence followed by '://', such as 'http://', 'https://', 'ftp://', etc.
	- `(?:[^\s\\]|\\ )+?`:
	  - **Non-Capturing Group (`(?:...)`)**: Groups the alternatives without capturing them.
	  - **Non-Whitespace and Non-Backslash (`[^\s\\]`)**: Matches any character that is not whitespace or a backslash.
	  - **OR (`|`)**: Logical OR.
	  - **Escaped Space (`\\ `)**: Matches a backslash followed by a space (an escaped space).
	  - **Non-Greedy (`+?`)**: Ensures the smallest possible match, preventing the inclusion of trailing punctuation.
	- `|`: Logical OR.
	- `problems\b`:
	  - **Exact Word ('problems')**: Matches the exact word 'problems'.
	  - **Word Boundary (`\b`)**: Ensures that 'problems' is matched as a whole word and not as part of another word (e.g., 'problematic').
		- `|`: Logical OR.
    - `terminal\b`:
      - **Exact Word ('terminal')**: Matches the exact word 'terminal'.
      - **Word Boundary (`\b`)**: Ensures that 'terminal' is matched as a whole word and not as part of another word (e.g., 'terminals').
  - `(?=[.,;:!?]?(?=[\s\r\n]|$))`:
	- **Positive Lookahead (`(?=...)`)**: Ensures that the match is followed by specific patterns without including them in the match.
	- `[.,;:!?]?`:
	  - **Optional Punctuation (`[.,;:!?]?`)**: Matches zero or one of the specified punctuation marks.
	- `(?=[\s\r\n]|$)`:
	  - **Nested Positive Lookahead (`(?=[\s\r\n]|$)`)**: Ensures that the punctuation (if present) is followed by a whitespace character, a line break, or the end of the string.
  
- **Summary**:
  - The regex effectively matches:
	- Mentions that are file or folder paths starting with '/' and containing any non-whitespace characters (including periods within the path).
	- File paths can include spaces if they are escaped with a backslash (e.g., `@/path/to/file\ with\ spaces.txt`).
	- URLs that start with a protocol (like 'http://') followed by any non-whitespace characters (including query parameters).
	- The exact word 'problems'.
	- The exact word 'git-changes'.
    - The exact word 'terminal'.
  - It ensures that any trailing punctuation marks (such as ',', '.', '!', etc.) are not included in the matched mention, allowing the punctuation to follow the mention naturally in the text.
  - **NEW**: The @ symbol must be at the start of a line or preceded by whitespace to prevent accidental matches in pasted logs.

- **Global Regex**:
  - `mentionRegexGlobal`: Creates a global version of the `mentionRegex` to find all matches within a given string.

*/
export const mentionRegex =
	/(?:^|(?<=\s))(?<!\\)@((?:\/|\w+:\/\/)(?:[^\s\\]|\\ )+?|[a-f0-9]{7,40}\b|problems\b|git-changes\b|terminal\b)(?=[.,;:!?]?(?=[\s\r\n]|$))/
export const mentionRegexGlobal = new RegExp(mentionRegex.source, "g")

// Regex to match command mentions like /command-name anywhere in text
export const commandRegexGlobal = /(?:^|\s)\/([a-zA-Z0-9_\.-]+)(?=\s|$)/g

export interface MentionSuggestion {
	type: "file" | "folder" | "git" | "problems"
	label: string
	description?: string
	value: string
	icon?: string
}

export interface GitMentionSuggestion extends MentionSuggestion {
	type: "git"
	hash: string
	shortHash: string
	subject: string
	author: string
	date: string
}

export function formatGitSuggestion(commit: {
	hash: string
	shortHash: string
	subject: string
	author: string
	date: string
}): GitMentionSuggestion {
	return {
		type: "git",
		label: commit.subject,
		description: `${commit.shortHash} by ${commit.author} on ${commit.date}`,
		value: commit.hash,
		icon: "$(git-commit)", // VSCode git commit icon
		hash: commit.hash,
		shortHash: commit.shortHash,
		subject: commit.subject,
		author: commit.author,
		date: commit.date,
	}
}

// Helper function to unescape paths with backslash-escaped spaces
export function unescapeSpaces(path: string): string {
	return path.replace(/\\ /g, " ")
}

/*
 * Knowledge base (@kb://) mention reference format:
 *
 *   Final mention:    kb://知识库名            (pure names; ids live in the host-side registry)
 *                     kb://知识库名/文件名
 *   With metadata:    kb://知识库名[knowledgeId|collectionId]  (fallback when a name can't be parsed)
 *   Drill-down query: kb://知识库名/过滤词      (transient, while browsing the file list)
 *
 * The webview registers selection metadata (knowledge/file/collection ids) via
 * "registerKnowledgeRef"; menus and the chat input display pure names only.
 * The extension host resolves pure-name mentions through that registry first,
 * then falls back to a REST name lookup.
 */

export interface ParsedKnowledgeRef {
	/** Full reference as typed (the part after "kb://") */
	raw: string
	knowledgeName: string
	/** Document name for final mentions */
	fileName?: string
	/** Trailing filter text while drilling down (after the "/") */
	fileFilter?: string
	/** OpenWebUI knowledge base id */
	knowledgeId?: string
	/** Vector collection id (collection_name) */
	collectionId?: string
	/** OpenWebUI file/document id */
	fileId?: string
}

const KNOWLEDGE_REF_PARTS = /^((?:[^[\]|\\]|\\ )*)\[([^\[\]]*)\](?:\/(.*))?$/

export function parseKnowledgeRef(reference: string): ParsedKnowledgeRef {
	const match = reference.match(KNOWLEDGE_REF_PARTS)
	const ids = match ? match[2].split("|") : []

	let namePart: string
	let trailing: string | undefined
	if (match) {
		namePart = match[1]
		trailing = match[3]
	} else {
		const slashIndex = reference.indexOf("/")
		namePart = slashIndex >= 0 ? reference.slice(0, slashIndex) : reference
		trailing = slashIndex >= 0 ? reference.slice(slashIndex + 1) : undefined
	}

	let knowledgeName = namePart
	let fileName: string | undefined
	const slashIndex = namePart.indexOf("/")
	if (slashIndex >= 0) {
		knowledgeName = namePart.slice(0, slashIndex)
		fileName = namePart.slice(slashIndex + 1)
	}

	let knowledgeId: string | undefined
	let collectionId: string | undefined
	let fileId: string | undefined
	if (ids.length >= 3) {
		fileId = ids[0] || undefined
		knowledgeId = ids[1] || undefined
		collectionId = ids[2] || undefined
	} else if (ids.length === 2) {
		knowledgeId = ids[0] || undefined
		collectionId = ids[1] || undefined
	} else if (ids.length === 1) {
		knowledgeId = ids[0] || undefined
	}

	return {
		raw: reference,
		knowledgeName: unescapeSpaces(knowledgeName),
		fileName: fileName !== undefined ? unescapeSpaces(fileName) : undefined,
		fileFilter: trailing !== undefined ? unescapeSpaces(trailing) : undefined,
		knowledgeId,
		collectionId,
		fileId,
	}
}

export interface EncodeKnowledgeRefInput {
	knowledgeName: string
	fileName?: string
	knowledgeId?: string
	collectionId?: string
	fileId?: string
}

/**
 * Builds the reference (without the "kb://" prefix). Falls back to a plain
 * name-only reference when a name contains characters that would break parsing.
 */
export function encodeKnowledgeRef(input: EncodeKnowledgeRefInput): string {
	const safe = (value: string) => !/[[\]|/\s]/.test(value)
	if (!safe(input.knowledgeName) || (input.fileName && !safe(input.fileName))) {
		return input.fileName ? `${input.knowledgeName}/${input.fileName}` : input.knowledgeName
	}

	const ids = input.fileName
		? [input.fileId, input.knowledgeId, input.collectionId]
		: [input.knowledgeId, input.collectionId]

	const base = input.fileName ? `${input.knowledgeName}/${input.fileName}` : input.knowledgeName
	if (ids.every((id) => !id)) {
		return base
	}
	return `${base}[${ids.map((id) => id ?? "").join("|")}]`
}
