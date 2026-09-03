import React from "react"

import { render, screen } from "@/utils/test-utils"
import { ReasoningBlock } from "../ReasoningBlock"

// Mock i18n
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, params?: Record<string, unknown>) => {
			if (key === "chat:reasoning.seconds") return `${params?.count} 秒`
			if (key === "chat:reasoning.thinking") return "思考"
			return key
		},
	}),
	initReactI18next: { type: "3rdParty", init: () => {} },
}))

// Mock extension state context
let mockDeveloperMode = false

vi.mock("@src/context/ExtensionStateContext", () => ({
	useExtensionState: () => ({
		reasoningBlockCollapsed: true,
		developerMode: mockDeveloperMode,
	}),
}))

describe("ReasoningBlock - elapsed timer", () => {
	beforeEach(() => {
		mockDeveloperMode = false
	})

	it("hides elapsed seconds when developerMode is false", () => {
		render(<ReasoningBlock content="" ts={Date.now()} isStreaming={true} isLast={true} />)

		expect(screen.queryByText(/秒/)).toBeNull()
	})

	it("shows elapsed seconds when developerMode is true", () => {
		mockDeveloperMode = true
		render(<ReasoningBlock content="" ts={Date.now()} isStreaming={true} isLast={true} />)

		expect(screen.getByText(/秒/)).toBeInTheDocument()
	})
})
