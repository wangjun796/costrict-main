import React from "react"

import { render, screen } from "@/utils/test-utils"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ChatRowContent } from "../ChatRow"

// Mock vscode API
const mockPostMessage = vi.fn()
vi.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: (msg: unknown) => mockPostMessage(msg),
	},
}))

// Mock i18n
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const map: Record<string, string> = {
				"chat:apiRequest.streaming": "API请求...",
				"chat:performance.firstToken": "首Token",
				"chat:performance.totalDuration": "总耗时",
				"chat:performance.tokensPerSecond": "每秒Token",
			}
			return map[key] ?? key
		},
		i18n: { exists: () => true },
	}),
	Trans: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
	initReactI18next: { type: "3rdParty", init: () => {} },
}))

// Mock extension state context
let mockDeveloperMode = false
let mockShowSpeedInfo = true

vi.mock("@src/context/ExtensionStateContext", () => ({
	useExtensionState: () => ({
		mcpServers: [],
		alwaysAllowMcp: false,
		currentCheckpoint: null,
		mode: "code",
		apiConfiguration: {},
		clineMessages: [],
		currentTaskItem: undefined,
		showSpeedInfo: mockShowSpeedInfo,
		developerMode: mockDeveloperMode,
	}),
}))

// Mock useSelectedModel hook
vi.mock("@src/components/ui/hooks/useSelectedModel", () => ({
	useSelectedModel: () => ({ info: { supportsImages: true } }),
}))

const queryClient = new QueryClient()

function renderChatRow(message: any) {
	return render(
		<QueryClientProvider client={queryClient}>
			<ChatRowContent
				message={message}
				isExpanded={false}
				isLast={true}
				isStreaming={false}
				onToggleExpand={() => {}}
				onSuggestionClick={() => {}}
				onBatchFileResponse={() => {}}
				onFollowUpUnmount={() => {}}
				isFollowUpAnswered={false}
			/>
		</QueryClientProvider>,
	)
}

describe("ChatRow - api request speed info", () => {
	beforeEach(() => {
		mockPostMessage.mockClear()
		mockDeveloperMode = false
		mockShowSpeedInfo = true
	})

	const speedMessage = {
		ts: Date.now(),
		type: "say" as const,
		say: "api_req_started" as const,
		text: JSON.stringify({
			requestIdTimestamp: 1000,
			responseIdTimestamp: 2500,
			responseEndTimestamp: 5500,
			completionTokens: 120,
		}),
	}

	it("hides speed metrics when developerMode is false", () => {
		renderChatRow(speedMessage)

		expect(screen.queryByText(/首Token/)).toBeNull()
		expect(screen.queryByText(/总耗时/)).toBeNull()
		expect(screen.queryByText(/每秒Token/)).toBeNull()
	})

	it("shows speed metrics when developerMode is true", () => {
		mockDeveloperMode = true
		renderChatRow(speedMessage)

		expect(screen.getByText(/首Token/)).toBeInTheDocument()
		expect(screen.getByText(/总耗时/)).toBeInTheDocument()
		expect(screen.getByText(/每秒Token/)).toBeInTheDocument()
	})
})
