/**
 * AST-based cross-file context provider for FIM autocomplete.
 *
 * Uses Tree-sitter to parse the current file's imports, resolve them to
 * workspace files, and extract compact "skeleton" definitions (signatures,
 * class stubs, interface declarations) from those files.
 *
 * The extracted skeletons are injected into the FIM prompt as structured
 * context, giving the completion model compiler-level understanding of
 * external dependencies without bloating the token budget.
 */
import * as path from "path"
import * as fs from "fs/promises"
import { parseSourceCodeDefinitionsForFile } from "../../../../services/tree-sitter"
import { getDependencyImports } from "../utils"
import { getWorkspacePath } from "../../../../utils/path"

/** Maximum total characters of AST context to include in the prompt */
const MAX_AST_CONTEXT_CHARS = 2000

/** Maximum number of imported files to resolve per completion request */
const MAX_IMPORTED_FILES = 5

/** Timeout per file parse (ms) */
const PARSE_TIMEOUT_MS = 80

interface ImportSymbol {
	/** The symbol name being imported (e.g. "User", "calculate_tax") */
	name: string
	/** The module path it's imported from (e.g. "./models/user") */
	modulePath: string
	/** Whether this is a default import */
	isDefault: boolean
}

/**
 * Parse import statements from the current file to extract symbol names
 * and their source module paths.
 */
function parseImportSymbols(filePath: string, fileContent: string): ImportSymbol[] {
	const imports = getDependencyImports(filePath, fileContent)
	const symbols: ImportSymbol[] = []

	for (const line of imports) {
		const ext = filePath.split(".").pop()?.toLowerCase()

		if (ext === "py") {
			// from module.path import Symbol1, Symbol2
			const fromMatch = line.match(/^from\s+([\w.]+)\s+import\s+(.+)$/)
			if (fromMatch) {
				const modulePath = fromMatch[1]
				const names = fromMatch[2].split(",").map((s) =>
					s
						.trim()
						.split(/\s+as\s+/)[0]
						.trim(),
				)
				for (const name of names) {
					if (name && name !== "*") {
						symbols.push({ name, modulePath, isDefault: false })
					}
				}
				continue
			}
			// import module.path
			const importMatch = line.match(/^import\s+([\w.]+)$/)
			if (importMatch) {
				const modulePath = importMatch[1]
				const name = modulePath.split(".").pop()!
				symbols.push({ name, modulePath, isDefault: true })
			}
		} else if (ext === "ts" || ext === "tsx" || ext === "js" || ext === "jsx") {
			// import { Symbol1, Symbol2 } from './module'
			const namedMatch = line.match(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/)
			if (namedMatch) {
				const modulePath = namedMatch[2]
				const names = namedMatch[1].split(",").map((s) =>
					s
						.trim()
						.split(/\s+as\s+/)[0]
						.trim(),
				)
				for (const name of names) {
					if (name) {
						symbols.push({ name, modulePath, isDefault: false })
					}
				}
				continue
			}
			// import Symbol from './module'
			const defaultMatch = line.match(/^import\s+(\w+)\s+from\s+['"]([^'"]+)['"]/)
			if (defaultMatch) {
				symbols.push({ name: defaultMatch[1], modulePath: defaultMatch[2], isDefault: true })
			}
			// import * as Name from './module'
			const namespaceMatch = line.match(/^import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/)
			if (namespaceMatch) {
				symbols.push({ name: namespaceMatch[1], modulePath: namespaceMatch[2], isDefault: true })
			}
		} else if (ext === "go") {
			// import "package/path"  or  "package/path" inside import block
			const goMatch = line.match(/^import\s+"?([\w./-]+)"?$/)
			if (goMatch) {
				const modulePath = goMatch[1]
				const name = modulePath.split("/").pop()!
				symbols.push({ name, modulePath, isDefault: true })
			}
		} else if (ext === "java") {
			// import com.example.MyClass;
			const javaMatch = line.match(/^import\s+([\w.]+);$/)
			if (javaMatch) {
				const modulePath = javaMatch[1]
				const name = modulePath.split(".").pop()!
				symbols.push({ name, modulePath, isDefault: true })
			}
		} else if (ext === "rs") {
			// use crate::module::Symbol;
			const rsMatch = line.match(/^use\s+([\w:]+);$/)
			if (rsMatch) {
				const modulePath = rsMatch[1]
				const name = modulePath.split("::").pop()!
				symbols.push({ name, modulePath, isDefault: false })
			}
		} else if (ext === "c" || ext === "cpp" || ext === "h" || ext === "hpp") {
			// #include "myheader.h" or #include <myheader.h>
			const includeMatch = line.match(/^#include\s+[<"]([^>"]+)[>"]$/)
			if (includeMatch) {
				const modulePath = includeMatch[1]
				const name = path.basename(modulePath, path.extname(modulePath))
				symbols.push({ name, modulePath, isDefault: true })
			}
		}
	}

	return symbols
}

/**
 * Resolve a module path to an actual file path in the workspace.
 * Tries common extensions and index files.
 */
async function resolveModulePath(
	modulePath: string,
	currentFileDir: string,
	workspaceRoot: string,
): Promise<string | null> {
	const candidates: string[] = []

	// Relative import: resolve from current file's directory
	if (modulePath.startsWith(".") || modulePath.startsWith("/")) {
		const base = path.resolve(currentFileDir, modulePath)
		candidates.push(base)
	} else {
		// Try relative to workspace root (for Python packages, TS path aliases, etc.)
		const base = path.resolve(workspaceRoot, modulePath)
		candidates.push(base)
	}

	const extensions = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs", ".java", ""]
	const indexFiles = ["/index.ts", "/index.tsx", "/index.js", "/index.jsx", "/__init__.py", ""]

	for (const base of candidates) {
		// Direct file match
		for (const ext of extensions) {
			const filePath = base + ext
			try {
				await fs.access(filePath)
				return filePath
			} catch {
				// not found, try next
			}
		}
		// Index file match
		for (const idx of indexFiles) {
			for (const ext of extensions) {
				const filePath = base + idx + ext
				try {
					await fs.access(filePath)
					return filePath
				} catch {
					// not found, try next
				}
			}
		}
	}

	return null
}

/**
 * Extract compact AST-based context from files imported by the current file.
 *
 * Returns a formatted string containing skeleton definitions (signatures,
 * class stubs, interfaces) from the imported files, suitable for injection
 * into the FIM prompt prefix.
 *
 * @param currentFilePath - Absolute path of the file being edited
 * @param currentFileContent - Full text content of the file being edited
 * @returns Formatted AST context string, or empty string if nothing found
 */
export async function getAstContext(currentFilePath: string, currentFileContent: string): Promise<string> {
	try {
		const workspaceRoot = getWorkspacePath()
		const currentFileDir = path.dirname(currentFilePath)

		// Step 1: Parse import symbols from current file
		const importSymbols = parseImportSymbols(currentFilePath, currentFileContent)
		if (importSymbols.length === 0) {
			return ""
		}

		// Step 2: Collect unique module paths (deduplicate)
		const uniqueModules = new Map<string, ImportSymbol[]>()
		for (const sym of importSymbols) {
			const existing = uniqueModules.get(sym.modulePath) || []
			existing.push(sym)
			uniqueModules.set(sym.modulePath, existing)
		}

		// Step 3: Resolve and extract definitions from imported files
		const contextParts: string[] = []
		let totalChars = 0

		const resolvePromises = [...uniqueModules.entries()]
			.slice(0, MAX_IMPORTED_FILES)
			.map(async ([modulePath, symbols]) => {
				const resolvedPath = await resolveModulePath(modulePath, currentFileDir, workspaceRoot)
				if (!resolvedPath) return null

				// Parse with timeout
				const definitionPromise = parseSourceCodeDefinitionsForFile(resolvedPath)
				const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), PARSE_TIMEOUT_MS))
				const definitions = await Promise.race([definitionPromise, timeoutPromise])

				if (!definitions) return null

				// For languages where symbol names match definition names (Python, TypeScript, etc.),
				// filter to only include matching definitions. For Go/C/C++, include all definitions
				// since package/header names don't match internal type names.
				const currentExt = currentFilePath.split(".").pop()?.toLowerCase()
				const shouldFilterBySymbol = !["go", "c", "cpp", "h", "hpp"].includes(currentExt || "")

				let filteredLines = definitions
				if (shouldFilterBySymbol) {
					// For namespace imports (isDefault=true), include all definitions
					// since the user is importing the entire module namespace
					const isNamespaceImport = symbols.every((s) => s.isDefault)
					if (!isNamespaceImport) {
						filteredLines = definitions
							.split("\n")
							.filter((line) => {
								if (line.startsWith("# ")) return true
								return symbols.some((sym) => line.includes(sym.name))
							})
							.join("\n")
					}
				}

				if (!filteredLines.trim()) return null

				return { modulePath, definitions: filteredLines }
			})

		const results = await Promise.all(resolvePromises)

		for (const result of results) {
			if (!result) continue
			const header = `// From: ${result.modulePath}\n`
			const block = header + result.definitions
			if (totalChars + block.length > MAX_AST_CONTEXT_CHARS) {
				// Truncate to fit budget
				const remaining = MAX_AST_CONTEXT_CHARS - totalChars
				if (remaining > 50) {
					contextParts.push(block.substring(0, remaining))
				}
				break
			}
			contextParts.push(block)
			totalChars += block.length
		}

		return contextParts.join("\n\n")
	} catch (error) {
		// Silently fail — AST context is a best-effort enhancement
		return ""
	}
}
