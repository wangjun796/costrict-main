import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the tree-sitter service
vi.mock("../../../../../services/tree-sitter", () => ({
	parseSourceCodeDefinitionsForFile: vi.fn(),
}))

// Mock the path utility
vi.mock("../../../../../utils/path", () => ({
	getWorkspacePath: vi.fn(() => "/workspace/project"),
}))

// Mock fs/promises - must match namespace import pattern
vi.mock("fs/promises", () => ({
	access: vi.fn(),
}))

import { getAstContext } from "../astContextProvider"
import { parseSourceCodeDefinitionsForFile } from "../../../../../services/tree-sitter"
import * as fs from "fs/promises"

const mockParse = parseSourceCodeDefinitionsForFile as ReturnType<typeof vi.fn>
const mockAccess = vi.mocked(fs.access)

describe("astContextProvider", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("getAstContext", () => {
		it("should return empty string when no imports are found", async () => {
			const result = await getAstContext("/workspace/project/src/main.py", "x = 1\ny = 2\n")
			expect(result).toBe("")
			expect(mockParse).not.toHaveBeenCalled()
		})

		it("should return empty string for unsupported file extensions", async () => {
			const result = await getAstContext("/workspace/project/src/main.txt", "import foo\n")
			expect(result).toBe("")
		})

		it("should resolve Python from-imports and extract matching definitions", async () => {
			const content = "from models.user import User, calculate_tax\n\nuser = User(1)\n"

			mockAccess.mockImplementation(async () => undefined)
			mockParse.mockImplementation(
				async () =>
					"# user.py\n4--10 | class User:\n12--15 | def calculate_tax(self, rate: float) -> float:\n20--25 | def helper():\n",
			)

			const result = await getAstContext("/workspace/project/src/main.py", content)

			expect(result).toContain("From: models.user")
			expect(result).toContain("class User:")
			expect(result).toContain("def calculate_tax")
			expect(result).not.toContain("def helper()")
		})

		it("should resolve TypeScript named imports", async () => {
			const content =
				"import { UserService, ApiResponse } from './services/api'\n\nconst svc = new UserService()\n"

			mockAccess.mockImplementation(async () => undefined)
			mockParse.mockImplementation(
				async () =>
					"# api.ts\n5--12 | class UserService {\n15--20 | class ApiResponse {\n25--30 | class InternalHelper {\n",
			)

			const result = await getAstContext("/workspace/project/src/main.ts", content)

			expect(result).toContain("From: ./services/api")
			expect(result).toContain("class UserService")
			expect(result).toContain("class ApiResponse")
			expect(result).not.toContain("InternalHelper")
		})

		it("should resolve TypeScript default imports", async () => {
			const content = "import Config from './config'\n\nconst c = Config.get()\n"

			mockAccess.mockImplementation(async () => undefined)
			mockParse.mockImplementation(async () => "# config.ts\n3--8 | class Config {\n")

			const result = await getAstContext("/workspace/project/src/main.ts", content)
			expect(result).toContain("class Config")
		})

		it("should resolve TypeScript namespace imports", async () => {
			const content = "import * as Utils from './utils'\n\nUtils.format()\n"

			mockAccess.mockImplementation(async () => undefined)
			mockParse.mockImplementation(async () => "# utils.ts\n2--5 | function format(s: string): string {\n")

			const result = await getAstContext("/workspace/project/src/main.ts", content)
			expect(result).toContain("function format")
		})

		it("should handle Go imports", async () => {
			const content = 'import "github.com/example/models"\n\nfunc main() {\n'

			mockAccess.mockImplementation(async () => undefined)
			mockParse.mockImplementation(async () => "# models.go\n5--10 | type User struct {\n")

			const result = await getAstContext("/workspace/project/main.go", content)
			expect(result).toContain("type User struct")
		})

		it("should handle Java imports", async () => {
			const content = "import com.example.UserService;\n\npublic class Main {\n"

			mockAccess.mockImplementation(async () => undefined)
			mockParse.mockImplementation(async () => "# UserService.java\n10--20 | public class UserService {\n")

			const result = await getAstContext("/workspace/project/src/Main.java", content)
			expect(result).toContain("public class UserService")
		})

		it("should handle Rust use statements", async () => {
			const content = "use crate::models::User;\n\nfn main() {\n"

			mockAccess.mockImplementation(async () => undefined)
			mockParse.mockImplementation(async () => "# models.rs\n5--12 | pub struct User {\n")

			const result = await getAstContext("/workspace/project/src/main.rs", content)
			expect(result).toContain("pub struct User")
		})

		it("should deduplicate imports from the same module", async () => {
			const content = "from models.user import User\nfrom models.user import calculate_tax\n\nuser = User(1)\n"

			mockAccess.mockImplementation(async () => undefined)
			mockParse.mockImplementation(
				async () => "# user.py\n4--10 | class User:\n12--15 | def calculate_tax(self, rate: float) -> float:\n",
			)

			const result = await getAstContext("/workspace/project/src/main.py", content)

			expect(mockParse).toHaveBeenCalledTimes(1)
			expect(result).toContain("class User:")
			expect(result).toContain("def calculate_tax")
		})

		it("should handle file resolution failure gracefully", async () => {
			const content = "from nonexistent import Foo\n\nx = Foo()\n"

			mockAccess.mockImplementation(async () => {
				throw new Error("ENOENT")
			})

			const result = await getAstContext("/workspace/project/src/main.py", content)
			expect(result).toBe("")
		})

		it("should handle tree-sitter parse failure gracefully", async () => {
			const content = "from models.user import User\n\nx = User()\n"

			mockAccess.mockImplementation(async () => undefined)
			mockParse.mockImplementation(async () => null)

			const result = await getAstContext("/workspace/project/src/main.py", content)
			expect(result).toBe("")
		})

		it("should respect the 2000 character budget limit", async () => {
			const content = "from models.a import A\nfrom models.b import B\n\nx = A()\n"

			mockAccess.mockImplementation(async () => undefined)
			let callCount = 0
			mockParse.mockImplementation(async () => {
				callCount++
				if (callCount === 1) {
					return "# a.py\n" + "1--50 | " + "x".repeat(100) + "\n"
				}
				return "# b.py\n1--5 | class B:\n"
			})

			const result = await getAstContext("/workspace/project/src/main.py", content)
			expect(result.length).toBeLessThanOrEqual(2000)
		})

		it("should handle parse timeout gracefully", async () => {
			const content = "from models.slow import Slow\n\nx = Slow()\n"

			mockAccess.mockImplementation(async () => undefined)
			mockParse.mockImplementation(
				() => new Promise((resolve) => setTimeout(() => resolve("# slow.py\n1--5 | class Slow:\n"), 200)),
			)

			const result = await getAstContext("/workspace/project/src/main.py", content)
			expect(result).toBe("")
		})

		it("should handle C/C++ includes", async () => {
			const content = '#include "myheader.h"\n\nint main() {\n'

			mockAccess.mockImplementation(async () => undefined)
			mockParse.mockImplementation(async () => "# myheader.h\n3--8 | struct MyStruct {\n")

			const result = await getAstContext("/workspace/project/src/main.c", content)
			expect(result).toContain("struct MyStruct")
		})

		it("should handle multiple imports from different modules", async () => {
			const content = "from models.user import User\nfrom services.auth import AuthService\n\nuser = User(1)\n"

			mockAccess.mockImplementation(async () => undefined)
			let callCount = 0
			mockParse.mockImplementation(async () => {
				callCount++
				if (callCount === 1) {
					return "# user.py\n4--10 | class User:\n"
				}
				return "# auth.py\n5--12 | class AuthService:\n"
			})

			const result = await getAstContext("/workspace/project/src/main.py", content)

			expect(result).toContain("class User")
			expect(result).toContain("class AuthService")
			expect(mockParse).toHaveBeenCalledTimes(2)
		})
	})
})
