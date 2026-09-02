#!/usr/bin/env node
// @ts-nocheck
/**
 * Downloads the official git-for-windows PORTABLE (self-extracting) build of Git
 * into:
 *   src/assets/git/win32-x64/PortableGit-<ver>-64-bit.7z.exe
 *
 * Costrict ships this 7-Zip self-extracting archive inside the extension. It is
 * NOT extracted here — at runtime the checkpoints feature expands it into the
 * extension's globalStorage (see src/utils/bundledGit.ts), so the checkpoints
 * feature works without the user installing Git and without network access.
 *
 * Windows only: on non-Windows platforms this script is a no-op (the bundled
 * binary is Windows-specific; checkpoints there still use the system `git`).
 *
 * Usage:
 *   node scripts/download-portable-git.mjs [--force]
 *
 * The latest git-for-windows release is used by default. Set GIT_VERSION to a
 * specific release tag (e.g. v2.47.1) to pin a version. Any recent 2.4x build
 * supports both Windows 10 and Windows 11.
 */
import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..") // repo root
const OUT_DIR = path.join(ROOT, "src", "assets", "git", "win32-x64")

// The portable self-extracting archive we bundle. Matching is intentionally
// lenient (covers both stable and prerelease asset names, e.g.
// "PortableGit-2.47.1-64-bit.7z.exe" and
// "PortableGit-prerelease-2.55.0.windows.5-22--64-bit.7z.exe").
const SFX_NAME_RE = /^PortableGit-.*-64-bit\.7z\.exe$/i

const FORCE = process.argv.includes("--force")

async function getLatestRelease() {
	const res = await fetch("https://api.github.com/repos/git-for-windows/git/releases/latest", {
		headers: { "User-Agent": "costrict-download-script" },
	})
	if (!res.ok) throw new Error(`HTTP ${res.status}`)
	return res.json()
}

async function download(url, dest) {
	console.log(`[download-portable-git] Downloading ${url}`)
	const res = await fetch(url)
	if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
	const buf = Buffer.from(await res.arrayBuffer())
	fs.writeFileSync(dest, buf)
	console.log(`[download-portable-git] Saved ${buf.length} bytes to ${dest}`)
}

async function main() {
	if (process.platform !== "win32") {
		console.log(
			"[download-portable-git] Skipped: bundled Git is Windows-only. On this platform checkpoints use the system `git`.",
		)
		return
	}

	fs.mkdirSync(OUT_DIR, { recursive: true })

	// Find the SFX asset in the latest release.
	const release = await getLatestRelease()
	const asset = (release.assets || []).find((a) => SFX_NAME_RE.test(a.name))
	if (!asset) {
		throw new Error(`No PortableGit 7z self-extracting asset found in release ${release.tag_name}`)
	}

	const dest = path.join(OUT_DIR, asset.name)
	if (!FORCE && fs.existsSync(dest)) {
		console.log(`[download-portable-git] Already present at ${dest} (use --force to re-download).`)
		return
	}

	await download(asset.browser_download_url, dest)
	console.log(`[download-portable-git] Done. Bundled Git installer is ready at ${dest}`)
	console.log("[download-portable-git] It will be extracted into globalStorage on first use by the checkpoints feature.")
}

main().catch((e) => {
	console.error("[download-portable-git] FAILED:", e.message)
	process.exit(1)
})
