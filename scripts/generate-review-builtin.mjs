/**
 * Download builtin review skills from GitHub repos and generate
 * bundled-skills directory with multi-locale support.
 *
 * Strategy:
 * 1. If local bundled-skills/ already has complete skill files (index.json +
 *    SKILL.md for both en/zh-CN locales), skip remote download entirely.
 * 2. Otherwise, try to download from the remote repo.
 * 3. If remote is unreachable and no cache exists, generate a minimal index
 *    and continue the build.
 *
 * Usage: node scripts/generate-review-builtin.mjs
 */

import * as fs from "fs/promises"
import * as path from "path"
import { fileURLToPath } from "url"
import { spawnSync } from "child_process"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, "..")

const bundledSkillsDir = path.join(projectRoot, "src", "bundled-skills")
const indexFilePath = path.join(bundledSkillsDir, "index.json")

const REPO = "wangjun796/costrict"
const BRANCH = "main"
const CLONE_URL = `https://github.com/${REPO}.git`

// Skills that must exist locally for the "local mode" fast path
const REQUIRED_SKILLS = ["review", "security-review"]
const REQUIRED_LOCALES = ["en", "zh-CN"]

function git(...args) {
	const result = spawnSync("git", args, { encoding: "utf-8" })
	return {
		ok: result.status === 0,
		stdout: result.stdout?.trim() ?? "",
		stderr: result.stderr?.trim() ?? "",
	}
}

function lsRemoteSha() {
	const ref = `refs/heads/${BRANCH}`
	const result = git("ls-remote", "--heads", CLONE_URL, ref)
	if (!result.ok || !result.stdout) return null
	const sha = result.stdout.split("\t")[0] ?? ""
	return sha.length >= 40 ? sha : null
}

async function readCachedSha() {
	try {
		const content = await fs.readFile(indexFilePath, "utf-8")
		const index = JSON.parse(content)
		return index.commitSha ?? null
	} catch {
		return null
	}
}

async function walk(dir, base = "") {
	try {
		const entries = await fs.readdir(dir, { withFileTypes: true })
		const files = []
		for (const entry of entries) {
			const fullPath = path.join(dir, entry.name)
			const relativePath = base ? `${base}/${entry.name}` : entry.name
			if (entry.isDirectory()) {
				files.push(...(await walk(fullPath, relativePath)))
			} else {
				files.push(relativePath)
			}
		}
		return files
	} catch {
		return []
	}
}

function collectLocales(index) {
	const localeSet = new Set()
	for (const skill of index.skills) {
		for (const locale of Object.keys(skill.path)) localeSet.add(locale)
	}
	return [...localeSet].sort()
}

const EXCLUDED_BUNDLED_SKILL_FILES = new Set([
	"php_deserialization.md",
	"java_practical.md",
])

async function removeExcludedBundledSkillFiles(dir = bundledSkillsDir) {
	for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
		const entryPath = path.join(dir, entry.name)
		if (entry.isDirectory()) {
			await removeExcludedBundledSkillFiles(entryPath)
		} else if (EXCLUDED_BUNDLED_SKILL_FILES.has(entry.name)) {
			await fs.rm(entryPath)
			console.log(`   ⚠ Removed excluded file: ${entryPath}`)
		}
	}
}

async function getExtensionVersion() {
	try {
		const packagePath = path.join(projectRoot, "src", "package.json")
		const content = await fs.readFile(packagePath, "utf-8")
		const pkg = JSON.parse(content)
		return pkg.version || "0.0.0"
	} catch {
		return "0.0.0"
	}
}

/**
 * Check if local bundled-skills/ has all required skill files.
 * Returns true if index.json exists and every (locale, skill) pair has a SKILL.md.
 */
async function hasCompleteLocalSkills() {
	try {
		await fs.access(indexFilePath)
		for (const locale of REQUIRED_LOCALES) {
			for (const skill of REQUIRED_SKILLS) {
				const skillMdPath = path.join(bundledSkillsDir, locale, skill, "SKILL.md")
				await fs.access(skillMdPath)
			}
		}
		return true
	} catch {
		return false
	}
}

/**
 * Clone repo and copy each locale's skill resources into bundled-skills/{locale}/...
 */
async function cloneAndCopy(cloneDir, index) {
	const locales = collectLocales(index)

	// Clean stale locale directories (skip .clone work directory)
	for (const entry of await fs.readdir(bundledSkillsDir).catch(() => [])) {
		if (entry === ".clone" || entry === "index.json") continue
		const entryPath = path.join(bundledSkillsDir, entry)
		const stat = await fs.stat(entryPath).catch(() => null)
		if (stat?.isDirectory()) {
			await fs.rm(entryPath, { recursive: true, force: true })
		}
	}
	for (const locale of locales) {
		for (const skill of index.skills) {
			const skillMdPath = skill.path[locale]
			if (!skillMdPath) continue

			const srcDir = path.join(cloneDir, path.dirname(skillMdPath))
			// "en/skills/security-review/SKILL.md" -> "security-review"
			const skillName = path.basename(path.dirname(skillMdPath))
			const outputDir = path.join(bundledSkillsDir, locale, skillName)

			await fs.rm(outputDir, { recursive: true, force: true })
			await fs.cp(srcDir, outputDir, { recursive: true })

			// Remove files that are flagged by VS Marketplace
			await removeExcludedBundledSkillFiles(outputDir)

			// Verify SKILL.md exists
			const skillMd = path.join(outputDir, "SKILL.md")
			try {
				await fs.access(skillMd)
			} catch {
				throw new Error(`Skill (${locale}/${skillName}) missing SKILL.md at ${skillMdPath}`)
			}

			const fileCount = (await walk(outputDir)).length
			console.log(`   ✓ ${locale}/skills/${skillName}: ${fileCount} files`)
		}
	}

	await fs.rm(cloneDir, { recursive: true, force: true })
	await fs.rm(cloneDir, { recursive: true, force: true })
}

async function generateIndexJson(commitSha) {
	const extensionVersion = await getExtensionVersion()

	// Discover locales and skills from bundled directory
	const locales = []
	const skillNames = []

	const entries = await fs.readdir(bundledSkillsDir).catch(() => [])
	for (const entry of entries) {
		const entryPath = path.join(bundledSkillsDir, entry)
		const stat = await fs.stat(entryPath).catch(() => null)
		if (!stat?.isDirectory() || entry.startsWith(".")) continue
		locales.push(entry)

		// Discover skill names from first locale
		if (locales.length === 1) {
			const skillDirs = await fs.readdir(entryPath).catch(() => [])
			for (const name of skillDirs) {
				const skillPath = path.join(entryPath, name)
				const skillStat = await fs.stat(skillPath).catch(() => null)
				if (skillStat?.isDirectory()) {
					skillNames.push(name)
				}
			}
		}
	}

	const indexContent = {
		version: extensionVersion,
		commitSha,
		locales,
		skills: skillNames.map((name) => ({
			name,
			repo: REPO,
			branch: BRANCH,
		})),
	}

	await fs.writeFile(indexFilePath, JSON.stringify(indexContent, null, 2), "utf-8")
	console.log(`✓ Generated ${indexFilePath}`)
}

async function main() {
	console.log("\n CoStrict - Downloading Builtin Review Skills\n")

	await fs.mkdir(bundledSkillsDir, { recursive: true })

	// Fast path: if local skills are complete, skip remote download entirely
	if (await hasCompleteLocalSkills()) {
		console.log("✓ Local bundled-skills directory is complete, skipping remote download")
		console.log(`✓ Using local skills from: ${bundledSkillsDir}`)

		let commitSha = "local"
		try {
			const content = await fs.readFile(indexFilePath, "utf-8")
			const index = JSON.parse(content)
			commitSha = index.commitSha || "local"
		} catch {
			// index.json missing — will be regenerated below
		}

		await removeExcludedBundledSkillFiles()
		await generateIndexJson(commitSha)

		console.log(`✓ Bundled skills directory: ${bundledSkillsDir}`)
		console.log("\n Run 'pnpm bundle' or 'pnpm vsix' to build the extension\n")
		return
	}

	// Slow path: try remote download
	const remoteSha = lsRemoteSha()
	const cachedSha = await readCachedSha()
	const hasCachedFiles = (await walk(bundledSkillsDir)).length > 0

	let commitSha

	if (!remoteSha) {
		// Remote repo is inaccessible (SSH key missing, private repo, network issue, etc.)
		if (hasCachedFiles && cachedSha) {
			console.warn("   Cannot reach remote repo, using cached resources")
			commitSha = cachedSha
		} else {
			// No remote access and no cache — generate a minimal index and continue
			console.warn("   Cannot reach remote repo and no cache available, generating minimal index")
			commitSha = "no-remote-access"
			await fs.writeFile(
				indexFilePath,
				JSON.stringify({ version: await getExtensionVersion(), commitSha, locales: [], skills: [] }, null, 2),
				"utf-8",
			)
			console.log(`✓ Generated minimal ${indexFilePath}`)
			console.log("\n💡 Review skills are unavailable. Run 'pnpm bundle' or 'pnpm vsix' to build the extension\n")
			process.exit(0)
		}
	} else {
		console.log(`Remote commit: ${remoteSha.slice(0, 7)}`)
		commitSha = remoteSha

		if (cachedSha === remoteSha && hasCachedFiles) {
			console.log("✓ All resources up to date, skipping download")
		} else {
			if (cachedSha) {
				console.log(`Cached ${cachedSha.slice(0, 7)} → remote ${remoteSha.slice(0, 7)}, updating`)
			}
			const cloneDir = path.join(bundledSkillsDir, ".clone")
			try {
				console.log(`   git clone --depth 1 ${CLONE_URL}`)
				await fs.rm(cloneDir, { recursive: true, force: true })
				const cloneResult = git("clone", "--depth", "1", "--branch", BRANCH, CLONE_URL, cloneDir)
				if (!cloneResult.ok) {
					throw new Error(`git clone failed: ${cloneResult.stderr}`)
				}
				const raw = await fs.readFile(path.join(cloneDir, "index.json"), "utf-8")
				const index = JSON.parse(raw)
				await cloneAndCopy(cloneDir, index)
				console.log(`\n✓ All resources updated (commit ${remoteSha.slice(0, 7)})`)
			} catch (err) {
				console.error(`  ✗ Download failed: ${err}`)
				if (!hasCachedFiles) {
					throw new Error("Download failed and no cache available")
				}
				console.warn("  ⚠ Using cached resources")
				commitSha = cachedSha ?? remoteSha
			} finally {
				await fs.rm(path.join(bundledSkillsDir, ".clone"), { recursive: true, force: true }).catch(() => { })
			}
		}
	}

	await removeExcludedBundledSkillFiles()
	await generateIndexJson(commitSha)

	console.log(`✓ Bundled skills directory: ${bundledSkillsDir}`)
	console.log("\n💡 Run 'pnpm bundle' or 'pnpm vsix' to build the extension\n")
}

main()
	.then(() => {
		process.exit(0)
	})
	.catch((error) => {
		console.error("Fatal error:", error)
		process.exit(1)
	})
