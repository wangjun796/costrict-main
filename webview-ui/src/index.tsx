import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import App from "./App"
import "../node_modules/@vscode/codicons/dist/codicon.css"

import { getHighlighter } from "./utils/highlighter"

// Initialize Shiki early to hide initialization latency (async)
getHighlighter().catch((error: Error) => console.error("Failed to initialize Shiki highlighter:", error))

// Global handler for unhandled promise rejections.
// In VS Code Webview, ServiceWorker registration always fails with InvalidStateError.
// Some third-party libs may not handle this gracefully, causing unhandled rejections.
window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
	const reason = event.reason
	const message = reason instanceof Error ? reason.message : String(reason)
	if (
		message.includes("service worker") ||
		message.includes("ServiceWorker") ||
		message.includes("InvalidStateError")
	) {
		// Suppress ServiceWorker-related rejections — they are expected in VS Code Webview
		// and do not affect plugin functionality.
		event.preventDefault()
		console.warn("[ssdAgent] Suppressed expected ServiceWorker rejection:", message)
	}
})

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<App />
	</StrictMode>,
)
