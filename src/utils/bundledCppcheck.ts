import * as path from "path"
import * as fs from "fs"

// Bundled portable cppcheck (Windows only).
//
// Costrict ships the official cppcheck Windows build (extracted from the
// cppcheck-<ver>-x64-Setup.msi administrative install) under:
//   assets/cppcheck/win32-x64/
//
// Unlike the bundled portable Git (which is a 7-Zip SFX expanded at runtime),
// cppcheck is stored pre-extracted and flat: `cppcheck.exe`, its DLLs
// (cppcheck-core.dll, OpenSSL, VC++ runtime), and the data folders `cfg/`,
// `platforms/` and `addons/`. No runtime extraction is required.
//
// The resolver returns the path to `cppcheck.exe` so callers (and the C/C++
// code-review flow) can invoke it via subprocess. It falls back to `undefined`
// when the binary was not shipped (non-Windows or excluded build), in which
// case callers should fall back to a system `cppcheck` on PATH.
const CPPCHECK_REL_DIR = path.join("assets", "cppcheck", "win32-x64")

// Data folders that must live alongside cppcheck.exe for accurate results.
// `platforms/` carries embedded targets (avr8, msp430, pic, arm32/64, riscv32/64)
// used by `--platform=...`; `cfg/` carries library configurations that suppress
// false positives; `addons/` carries Python addons (misra.py, naming.py, etc.).
const CPPCHECK_DATA_DIRS = ["cfg", "platforms", "addons"]

export interface CppcheckInfo {
	/** Absolute path to cppcheck.exe, or undefined when not available. */
	binPath: string | undefined
	/** Absolute path to the bundled root dir containing cfg/platforms/addons. */
	rootDir: string | undefined
	/** Version string reported by `cppcheck --version` (if already resolved). */
	version?: string
}

/**
 * Resolve the bundled cppcheck binary and its data directory.
 *
 * Returns an object with `binPath`/`rootDir` set when the bundled binary is
 * present; otherwise both are `undefined`. This is synchronous and cheap, so it
 * is safe to call per review.
 */
export function getBundledCppcheck(extensionPath: string | undefined): CppcheckInfo {
	if (process.platform !== "win32" || !extensionPath) {
		return { binPath: undefined, rootDir: undefined }
	}

	const rootDir = path.join(extensionPath, CPPCHECK_REL_DIR)
	const binPath = path.join(rootDir, "cppcheck.exe")
	if (!fs.existsSync(binPath)) {
		return { binPath: undefined, rootDir: undefined }
	}
	return { binPath, rootDir }
}

/**
 * Build the recommended cppcheck CLI arguments for a C/C++ code review.
 *
 * These flags are tuned for embedded / safety-oriented review:
 * - `--enable=all` turns on error, warning, style, performance and portability.
 * - `--inconclusive` surfaces likely (not just certain) defects.
 * - `--std=...` / `--platform=...` pin language standard and target ABI so that
 *   integer-width and endianness assumptions are checked realistically.
 * - `--inline-suppr`/`--suppress=missingIncludeSystem` cut noise.
 *
 * @param opts.targets  Source files/directories to analyze.
 * @param opts.std      C/C++ standard (c89..c23, c++03..c++23). Default "c11".
 * @param opts.platform Embedded target platform (avr8, msp430, pic8, arm32-wchar_t4,
 *                      riscv32, ...). Leave undefined to use the host platform.
 * @param opts.cpp      Treat inputs as C++ (default: infer from file extension).
 */
export function buildCppcheckReviewArgs(opts: {
	targets: string[]
	std?: string
	platform?: string
	cpp?: boolean
}): string[] {
	const args: string[] = [
		"--enable=all",
		"--inconclusive",
		"--inline-suppr",
		"--suppress=missingIncludeSystem",
		"--quiet",
	]

	const std = opts.std ?? (opts.cpp ? "c++17" : "c11")
	args.push(`--std=${std}`)
	if (opts.cpp) {
		args.push("--language=c++")
	} else {
		args.push("--language=c")
	}
	if (opts.platform) {
		args.push(`--platform=${opts.platform}`)
	}

	args.push(...opts.targets)
	return args
}

/**
 * Return a human-readable explanation of the bundled cppcheck data folders,
 * useful for logging / diagnostics.
 */
export function describeCppcheckDataDirs(rootDir: string): string {
	const present = CPPCHECK_DATA_DIRS.filter((d) => fs.existsSync(path.join(rootDir, d)))
	return present.length === CPPCHECK_DATA_DIRS.length
		? `all data dirs present (${present.join(", ")})`
		: `missing data dirs: ${CPPCHECK_DATA_DIRS.filter((d) => !present.includes(d)).join(", ") || "none"}`
}
