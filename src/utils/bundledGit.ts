import * as path from "path"
import * as fs from "fs"
import { execFile } from "child_process"
import { promisify } from "util"

const execFileAsync = promisify(execFile)

// Bundled portable Git (Windows only).
//
// Costrict ships the official git-for-windows *self-extracting* archive
// (PortableGit-<ver>-64-bit.7z.exe) under:
//   assets/git/win32-x64/<installer>.exe
//
// The installer is NOT pre-extracted at build time. Instead it is expanded at
// runtime (on first use) into the extension's globalStorage, so the checkpoints
// feature works even when the user has no system `git` installed and no network
// access. This keeps the vsix small (the compressed SFX) while still requiring
// zero setup from the end user.
const SFX_REL_DIR = path.join("assets", "git", "win32-x64")
const SFX_NAME_RE = /^PortableGit-.*-64-bit\.7z\.exe$/i

// Runtime extraction target, inside globalStorage (per-extension, persistent).
const EXTRACT_REL_DIR = path.join("git", "portable")
const EXTRACT_MARKER = ".costrict-git-extracted"

// Candidate locations of the real git binary inside the extracted tree.
// `cmd/git.exe` is the official wrapper that sets up PATH/libexec for the
// portable build, so it is preferred; the other two are fallbacks.
const GIT_EXE_CANDIDATES = ["cmd/git.exe", "bin/git.exe", "mingw64/bin/git.exe"]

let cachedGitPath: string | undefined
let extractInFlight: Promise<string | undefined> | undefined

function findInstaller(extensionPath: string): string | undefined {
	const dir = path.join(extensionPath, SFX_REL_DIR)
	let entries: fs.Dirent[]
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true })
	} catch {
		return undefined
	}
	const hit = entries.find((e) => e.isFile() && SFX_NAME_RE.test(e.name))
	return hit ? path.join(dir, hit.name) : undefined
}

function resolveGitExe(extractDir: string): string | undefined {
	for (const rel of GIT_EXE_CANDIDATES) {
		const p = path.join(extractDir, rel)
		if (fs.existsSync(p)) {
			return p
		}
	}
	return undefined
}

async function extractInstaller(installer: string, extractDir: string): Promise<void> {
	// git-for-windows PortableGit is a 7-Zip self-extracting archive.
	// Silent mode is:  <installer> -y -o"<targetDir>"
	//  -y            : answer "yes" to all prompts (overwrite, etc.)
	//  -o"<dir>"     : output directory. The quotes are required because
	//                  globalStorage paths normally contain spaces (e.g.
	//                  "Code - Insiders\..."), and the 7-Zip parser strips the
	//                  surrounding quotes.
	//
	// IMPORTANT: `shell: true` is required. With the default `shell: false`,
	// Node's Windows spawner re-escapes the embedded double quotes into
	// `-o\"<dir>\"`, which 7-Zip cannot parse and fails with exit code 1.
	// Going through `cmd /c` lets the shell strip the outer quotes so 7-Zip
	// receives the intended `-o"<dir>"`.
	fs.mkdirSync(extractDir, { recursive: true })
	await execFileAsync(installer, ["-y", `-o"${extractDir}"`], { windowsHide: true, shell: true, timeout: 600_000 })
}

/**
 * Resolves the path to the bundled portable Git binary, extracting the
 * self-extracting installer on first use. Returns `undefined` when no bundled
 * binary is available (non-Windows, the installer was not shipped, or
 * extraction failed), in which case callers should fall back to the system
 * `git` found on PATH.
 *
 * The resolved path is cached, and concurrent callers share a single in-flight
 * extraction, so this is safe to call on every checkpoint initialization.
 */
export async function getBundledGitBinaryPath(
	extensionPath: string | undefined,
	globalStorageDir: string | undefined,
): Promise<string | undefined> {
	if (process.platform !== "win32") {
		return undefined
	}

	if (cachedGitPath && fs.existsSync(cachedGitPath)) {
		return cachedGitPath
	}

	if (extractInFlight) {
		return extractInFlight
	}

	if (!extensionPath || !globalStorageDir) {
		return undefined
	}

	const installer = findInstaller(extensionPath)
	if (!installer) {
		return undefined
	}

	const extractDir = path.join(globalStorageDir, EXTRACT_REL_DIR)
	const marker = path.join(extractDir, EXTRACT_MARKER)

	// Already extracted in a previous session?
	const existing = resolveGitExe(extractDir)
	if (existing && fs.existsSync(marker)) {
		cachedGitPath = existing
		return existing
	}

	extractInFlight = (async () => {
		try {
			await extractInstaller(installer, extractDir)
			const gitExe = resolveGitExe(extractDir)
			if (!gitExe) {
				throw new Error("bundled Git self-extractor produced no git.exe")
			}
			fs.writeFileSync(marker, new Date().toISOString())
			cachedGitPath = gitExe
			return gitExe
		} catch (err) {
			console.error("[bundledGit] extraction failed:", (err as Error)?.message ?? err)
			return undefined
		} finally {
			extractInFlight = undefined
		}
	})()

	return extractInFlight
}
