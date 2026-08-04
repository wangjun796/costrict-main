const { execSync } = require("child_process")
const fs = require("fs")

// detect nightly flag
const isNightly = process.argv.includes("--nightly")

// detect editor command from args or default to "code"
const editorArg = process.argv.find((arg) => arg.startsWith("--editor="))
const defaultEditor = editorArg ? editorArg.split("=")[1] : "code"

function main() {
	try {
		let name, version, publisher

		if (isNightly) {
			// For nightly, read the nightly-specific package.json and get publisher from src
			const nightlyPackageJson = JSON.parse(
				fs.readFileSync("./apps/vscode-nightly/package.nightly.json", "utf-8"),
			)
			const srcPackageJson = JSON.parse(fs.readFileSync("./src/package.json", "utf-8"))
			name = nightlyPackageJson.name
			version = nightlyPackageJson.version
			publisher = srcPackageJson.publisher
		} else {
			const packageJson = JSON.parse(fs.readFileSync("./src/package.json", "utf-8"))
			name = packageJson.name
			version = packageJson.version
			publisher = packageJson.publisher
		}

		const vsixFileName = `./bin/${name}-${version}.vsix`
		const extensionId = `${publisher}.${name}`
		const buildType = isNightly ? "Nightly" : "Regular"

		console.log(`\n? ssdAgent VSIX Installer (${buildType})`)
		console.log("========================")
		console.log("\nThis script will:")
		console.log("1. Uninstall any existing version of the ssdAgent extension")
		console.log("2. Install the newly built VSIX package")
		console.log(`\nExtension: ${extensionId}`)
		console.log(`VSIX file: ${vsixFileName}`)

		// Use editor command from args or default to "code"
		let editorCommand = defaultEditor
		if (editorArg) {
			editorCommand = editorArg.split("=")[1]
		}

		console.log(`\nProceeding with installation using '${editorCommand}' command...`)

		try {
			execSync(`${editorCommand} --uninstall-extension ${extensionId}`, { stdio: "inherit" })
		} catch (e) {
			console.log("Extension not installed, skipping uninstall step")
		}

		if (!fs.existsSync(vsixFileName)) {
			console.error(`\n? VSIX file not found: ${vsixFileName}`)
			console.error("Make sure the build completed successfully")
			process.exit(1)
		}

		execSync(`${editorCommand} --install-extension ${vsixFileName}`, { stdio: "inherit" })

		console.log(`\n? Successfully installed extension from ${vsixFileName}`)
		console.log("\n??  IMPORTANT: You need to restart VS Code for the changes to take effect.")
		console.log("   Please close and reopen VS Code to use the updated extension.\n")
	} catch (error) {
		console.error("\n? Failed to install extension:", error.message)
		process.exit(1)
	}
}

main()
