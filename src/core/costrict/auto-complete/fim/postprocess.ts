/**
 * FIM completion postprocessing logic.
 *
 * Implements the same postprocessing as completion-agent's pruners:
 * - Remove prefix/suffix overlap
 * - Cut single-line completions
 * - Filter extreme repetition
 * - Remove syntax errors (basic bracket matching)
 */

/**
 * Remove any prefix text that appears at the start of the completion.
 *
 * The model sometimes repeats the last few characters of the prefix.
 * This function strips that overlap.
 */
export function removePrefixOverlap(completion: string, prefix: string): string {
	if (!prefix || !completion) {
		return completion
	}

	// Check if completion starts with the last N chars of prefix
	const maxOverlap = Math.min(prefix.length, completion.length, 50)

	for (let i = maxOverlap; i > 0; i--) {
		const prefixEnd = prefix.substring(prefix.length - i)
		if (completion.startsWith(prefixEnd)) {
			return completion.substring(i)
		}
	}

	return completion
}

/**
 * Remove any suffix text that appears at the end of the completion.
 *
 * The model sometimes includes the first few characters of the suffix.
 */
export function removeSuffixOverlap(completion: string, suffix: string): string {
	if (!suffix || !completion) {
		return completion
	}

	const maxOverlap = Math.min(suffix.length, completion.length, 50)

	for (let i = maxOverlap; i > 0; i--) {
		const suffixStart = suffix.substring(0, i)
		if (completion.endsWith(suffixStart)) {
			return completion.substring(0, completion.length - i)
		}
	}

	return completion
}

/**
 * Detect and remove extreme repetition in the completion.
 *
 * If the completion contains a substring repeated 3+ times consecutively,
 * truncate at the second occurrence.
 */
export function removeExtremeRepetition(completion: string): string {
	// Check for repeated lines
	const lines = completion.split("\n")
	if (lines.length < 6) {
		return completion
	}

	// Look for 3+ consecutive identical lines
	let repeatStart = -1
	let repeatLength = 0

	for (let i = 0; i < lines.length - 2; i++) {
		if (lines[i] === lines[i + 1] && lines[i + 1] === lines[i + 2] && lines[i].trim().length > 0) {
			repeatStart = i
			repeatLength = 3
			// Count how many more repetitions
			for (let j = i + 3; j < lines.length; j++) {
				if (lines[j] === lines[i]) {
					repeatLength++
				} else {
					break
				}
			}
			break
		}
	}

	if (repeatStart >= 0) {
		return lines.slice(0, repeatStart + 2).join("\n")
	}

	return completion
}

/**
 * Basic bracket matching validation.
 *
 * If the completion has unbalanced brackets, it's likely a syntax error.
 * This is a simplified check - real syntax validation would require a parser.
 */
export function hasBalancedBrackets(text: string): boolean {
	const stack: string[] = []
	const pairs: Record<string, string> = {
		")": "(",
		"]": "[",
		"}": "{",
	}

	for (const char of text) {
		if (char === "(" || char === "[" || char === "{") {
			stack.push(char)
		} else if (char === ")" || char === "]" || char === "}") {
			if (stack.length === 0 || stack[stack.length - 1] !== pairs[char]) {
				return false
			}
			stack.pop()
		}
	}

	return stack.length === 0
}

/**
 * Strip leftover special tokens (EOS and FIM markers) from the completion.
 *
 * Depending on the server, the generated text may still contain the EOS token
 * (e.g. "<|endoftext|>") or FIM markers. These must never leak into the editor.
 */
export function stripSpecialTokens(completion: string): string {
	let result = completion

	const tokens = [
		"<|endoftext|>",
		"<｜end▁of▁sentence｜>",
		"<fim_prefix>",
		"<fim_suffix>",
		"<fim_middle>",
		"<｜f#fim_prefix#｜>",
		"<｜fim▁begin｜>",
		"<｜fimhole｜>",
		"<｜fimend｜>",
		"<PRE>",
		"<SUF>",
		"<MID>",
		"</s>",
	]

	for (const token of tokens) {
		result = result.split(token).join("")
	}

	return result
}

/**
 * Postprocess the completion text.
 *
 * Applies all postprocessing steps in order:
 * 1. Strip special tokens (EOS / FIM markers)
 * 2. Remove prefix overlap
 * 3. Remove suffix overlap
 * 4. Remove extreme repetition
 * 5. Trim whitespace
 * 6. Validate bracket balance (optional, returns empty if unbalanced)
 */
export function postprocessCompletion(
	completion: string,
	prefix: string,
	suffix: string,
	validateBrackets = false,
): string {
	if (!completion) {
		return ""
	}

	let result = completion

	// Strip special tokens
	result = stripSpecialTokens(result)

	// Remove overlaps
	result = removePrefixOverlap(result, prefix)
	result = removeSuffixOverlap(result, suffix)

	// Remove repetition
	result = removeExtremeRepetition(result)

	// Trim
	result = result.trim()

	// Optional bracket validation
	if (validateBrackets && !hasBalancedBrackets(result)) {
		return ""
	}

	return result
}
