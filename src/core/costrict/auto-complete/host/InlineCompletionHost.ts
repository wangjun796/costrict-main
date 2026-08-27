/**
 * Narrowed host interface for the inline completion / autocomplete subsystem.
 *
 * Decouples autocomplete code from the full ClineProvider so that the provider
 * can later be replaced, removed, or reconfigured without touching the
 * completion business logic.
 */
import type { Experiments } from "@roo-code/types"

export interface InlineCompletionHost {
	/** Write a message to the host's log / output channel. */
	log(message: string): void

	/** Resolve the currently configured API provider identifier (e.g. "costrict"). */
	getApiProvider(): Promise<string | undefined>

	/** Read the current experiments state (used to gate experimental completion features). */
	getExperiments(): Promise<Experiments>
}
