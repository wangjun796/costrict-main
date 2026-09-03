#!/usr/bin/env node
// @ts-nocheck
/**
 * Downloads the official Cppcheck Windows x64 build and produces a minimal
 * portable CLI bundle under:
 *   src/assets/cppcheck/win32-x64/
 *
 * The official Windows binary is distributed as an MSI installer
 * (cppcheck-<ver>-x64-Setup.msi). This script:
 *   1. Resolves the latest (or pinned) cppcheck release from the official
 *      GitHub repo (cppcheck-opensource/cppcheck) and downloads the MSI.
 *   2. Extracts it with `msiexec /a` (administrative install — no elevation,
 *      no install step; files land under <tmp>/PFiles/Cppcheck).
 *   3. Copies ONLY the CLI + data files needed by cppcheck.exe into the assets
 *      dir (the Qt GUI binaries cppcheckgui.exe / Qt6*.dll and online-help.*
 *      are intentionally dropped to keep the bundle ~18 MB).
 *
 * Costrict ships this bundle inside the extension for C/C++ code review (see
 * src/utils/bundledCppcheck.ts). It is NOT committed to git (large binary —
 * same policy as src/assets/git/, which is ignored by .gitignore and packaged
 * into the vsix via src/.vscodeignore).
 *
 * Windows only: on non-Windows platforms this script is a no-op (the bundled
 * binary is Windows-specific; other platforms use the system `cppcheck`).
 *
 * Usage:
 *   node scripts/download-portable-cppcheck.mjs [--force]
 *   node scripts/download-portable-cppcheck.mjs --from-msi <path-to-msi>
 *
 * The version is pinned to the default below; set CPPCHECK_VERSION to override
 * (e.g. CPPCHECK_VERSION=2.21.0 node scripts/download-portable-cppcheck.mjs).
 * Use --from-msi to skip the download and build from an MSI you obtained
 * manually (e.g. when GitHub/SourceForge are unreachable).
 */
import * as fs from "fs"
import * as path from "path"
import * as os from "os"
import { spawnSync } from "child_process"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..") // repo root
const OUT_DIR = path.join(ROOT, "src", "assets", "cppcheck", "win32-x64")

const REPO = "cppcheck-opensource/cppcheck"
const VERSION = process.env.CPPCHECK_VERSION || "2.21.0"
const FORCE = process.argv.includes("--force")

// Official Windows MSI asset, e.g. "cppcheck-2.21.0-x64-Setup.msi".
const MSI_NAME_RE = /^cppcheck-.+-x64-Setup\.msi$/i

// Top-level files to keep from the extracted PFiles/Cppcheck dir.
const CORE_FILES = [
	"cppcheck.exe",
	"cppcheck-core.dll",
	"libcrypto-3-x64.dll",
	"libssl-3-x64.dll",
	"GPLv3.txt",
	"authors.txt",
	"simplecpp-license.txt",
	"tinyxml2-license.txt",
	"picojson-license.txt",
]

// Data dirs copied verbatim. `platforms/` contains both the embedded-target XML
// definitions (avr8, msp430, pic, arm, riscv ...) and Qt platform DLLs — we copy
// only the *.xml files below.
const DATA_DIRS = ["cfg", "addons"]

// VC++ runtime DLLs shipped in the MSI's System64 folder (needed on machines
// without the Visual C++ Redistributable installed).
const SYS64_DLL_RE = /^(concrt140|msvcp140|vccorlib140|vcruntime140).*\.dll$/i

async function download(url, dest) {
	console.log(`[download-portable-cppcheck] Downloading ${url}`)
	const res = await fetch(url, {
		headers: { "User-Agent": "costrict-download-script" },
	})
	if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
	const buf = Buffer.from(await res.arrayBuffer())
	fs.writeFileSync(dest, buf)
	console.log(`[download-portable-cppcheck] Saved ${(buf.length / 1024 / 1024).toFixed(1)} MB to ${dest}`)
}

function rmrf(p) {
	fs.rmSync(p, { recursive: true, force: true })
}

function copyFile(src, dst) {
	fs.mkdirSync(path.dirname(dst), { recursive: true })
	fs.copyFileSync(src, dst)
}

function walk(dir) {
	const out = []
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) out.push(...walk(full))
		else out.push(full)
	}
	return out
}

/**
 * Extract the MSI via an administrative install (`msiexec /a`).
 *
 * IMPORTANT: pass every argument through spawnSync's argv array — do NOT build
 * a shell command string. Through a shell, the TARGETDIR backslashes / trailing
 * path get mangled and msiexec fails with error 1603. The argv array bypasses
 * shell quoting entirely.
 */
function extractMsi(msiPath, extractDir) {
	console.log("[download-portable-cppcheck] Extracting MSI via msiexec /a ...")
	const r = spawnSync("msiexec", ["/a", msiPath, "/qn", "/norestart", `TARGETDIR=${extractDir}`], {
		windowsHide: true,
		encoding: "utf-8",
	})
	if (r.status !== 0) {
		throw new Error(`msiexec /a failed (exit ${r.status}): ${(r.stderr || "").slice(0, 500)}`)
	}
}

async function main() {
	if (process.platform !== "win32") {
		console.log(
			"[download-portable-cppcheck] Skipped: bundled cppcheck is Windows-only. On this platform C/C++ review uses the system `cppcheck`.",
		)
		return
	}

	// --from-msi <path>: skip download, build from a user-provided MSI.
	const fromMsiIdx = process.argv.indexOf("--from-msi")
	const fromMsi = fromMsiIdx !== -1 ? process.argv[fromMsiIdx + 1] : undefined

	const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "cppcheck-dl-"))
	try {
		fs.mkdirSync(OUT_DIR, { recursive: true })
		if (fs.existsSync(path.join(OUT_DIR, "cppcheck.exe")) && !FORCE && !fromMsi) {
			console.log(
				`[download-portable-cppcheck] Bundle already present at ${OUT_DIR} (use --force to re-download).`,
			)
			return
		}

		// 1. Obtain the MSI (download from GitHub releases, or reuse a local one).
		let msiPath = fromMsi
		if (!msiPath) {
			const release = await getRelease()
			const asset = (release.assets || []).find((a) => MSI_NAME_RE.test(a.name))
			if (!asset) {
				throw new Error(`No "*-x64-Setup.msi" asset in release ${release.tag_name}`)
			}
			msiPath = path.join(tmpDir, asset.name)
			await download(asset.browser_download_url, msiPath)
		} else {
			if (!fs.existsSync(msiPath)) throw new Error(`--from-msi file not found: ${msiPath}`)
			console.log(`[download-portable-cppcheck] Building from local MSI: ${msiPath}`)
		}

		// 2. Extract.
		const extractDir = path.join(tmpDir, "extracted")
		extractMsi(msiPath, extractDir)

		const cppcheckSrc = path.join(extractDir, "PFiles", "Cppcheck")
		const sys64Src = path.join(extractDir, "PFiles", "System64")
		if (!fs.existsSync(path.join(cppcheckSrc, "cppcheck.exe"))) {
			throw new Error(`Extracted MSI has no cppcheck.exe under ${cppcheckSrc}`)
		}

		// 3. Build the minimal CLI bundle.
		rmrf(OUT_DIR)
		fs.mkdirSync(OUT_DIR, { recursive: true })

		for (const f of CORE_FILES) {
			copyFile(path.join(cppcheckSrc, f), path.join(OUT_DIR, f))
		}

		// cfg/ and addons/ (Python addons: misra.py, naming.py, y2038.py, ...)
		for (const dir of DATA_DIRS) {
			fs.cpSync(path.join(cppcheckSrc, dir), path.join(OUT_DIR, dir), { recursive: true })
		}

		// platforms/ — only the *.xml target definitions (skip Qt qwindows.dll).
		const platformsOut = path.join(OUT_DIR, "platforms")
		fs.mkdirSync(platformsOut, { recursive: true })
		for (const f of fs.readdirSync(path.join(cppcheckSrc, "platforms"))) {
			if (f.toLowerCase().endsWith(".xml")) {
				copyFile(path.join(cppcheckSrc, "platforms", f), path.join(platformsOut, f))
			}
		}

		// VC++ runtime DLLs from System64 (present when extracted by msiexec).
		if (fs.existsSync(sys64Src)) {
			for (const f of fs.readdirSync(sys64Src)) {
				if (SYS64_DLL_RE.test(f)) {
					copyFile(path.join(sys64Src, f), path.join(OUT_DIR, f))
				}
			}
		}

		const fileCount = walk(OUT_DIR).length
		console.log(
			`[download-portable-cppcheck] Done. ${fileCount} files ready at ${OUT_DIR} (CLI-only cppcheck).`,
		)
	} finally {
		if (!fromMsi) rmrf(tmpDir)
		else rmrf(path.join(tmpDir, "extracted"))
	}
}

/**
 * Resolve the release JSON: latest by default, or /releases/tags/<ver> when
 * CPPCHECK_VERSION is pinned.
 */
async function getRelease() {
	const url =
		VERSION === "latest"
			? `https://api.github.com/repos/${REPO}/releases/latest`
			: `https://api.github.com/repos/${REPO}/releases/tags/${VERSION}`
	console.log(`[download-portable-cppcheck] Resolving release ${VERSION} from GitHub ...`)
	const res = await fetch(url, {
		headers: { "User-Agent": "costrict-download-script", Accept: "application/vnd.github+json" },
	})
	if (!res.ok) throw new Error(`HTTP ${res.status} resolving ${url}`)
	return res.json()
}

main().catch((e) => {
	console.error("[download-portable-cppcheck] FAILED:", e.message)
	process.exit(1)
})
