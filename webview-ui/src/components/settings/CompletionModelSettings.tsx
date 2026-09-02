import React, { useState } from "react"
import { VSCodeTextField, VSCodeDropdown, VSCodeOption, VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { SectionHeader } from "./SectionHeader"
import { Section } from "./Section"
import { TemperatureControl } from "./TemperatureControl"

interface CompletionModelSettingsProps {
	fimEnabled: boolean
	fimApiUrl: string
	fimModelName: string
	fimApiKey: string
	fimPreset: string
	fimMaxPrefixTokens: number
	fimMaxSuffixTokens: number
	fimMaxOutputTokens: number
	fimTemperature: number | null
	fimTopP: number
	fimTopK: number
	fimRepetitionPenalty: number | null
	fimDoSample: boolean
	fimStopSequences: string[]
	fimTimeoutMs: number
	fimDebounceMs: number
	fimDebug: boolean
	// Custom FIM markers (used when fimPreset === "custom")
	fimCustomMarkerBegin: string
	fimCustomMarkerHole: string
	fimCustomMarkerEnd: string
	onFimEnabledChange: (enabled: boolean) => void
	onFimApiUrlChange: (url: string) => void
	onFimModelNameChange: (name: string) => void
	onFimApiKeyChange: (key: string) => void
	onFimPresetChange: (preset: string) => void
	onFimMaxPrefixTokensChange: (tokens: number) => void
	onFimMaxSuffixTokensChange: (tokens: number) => void
	onFimMaxOutputTokensChange: (tokens: number) => void
	onFimTemperatureChange: (temp: number | null) => void
	onFimTopPChange: (topP: number) => void
	onFimTopKChange: (topK: number) => void
	onFimRepetitionPenaltyChange: (penalty: number | null) => void
	onFimDoSampleChange: (doSample: boolean) => void
	onFimStopSequencesChange: (stops: string[]) => void
	onFimTimeoutMsChange: (ms: number) => void
	onFimDebounceMsChange: (ms: number) => void
	onFimDebugChange: (enabled: boolean) => void
	onFimCustomMarkerBeginChange: (marker: string) => void
	onFimCustomMarkerHoleChange: (marker: string) => void
	onFimCustomMarkerEndChange: (marker: string) => void
}

// 常用代码补全模型。优先让用户从下拉选择，
// 选不到时再用 "Custom" 兜底手工输入。
const FIM_MODEL_OPTIONS: Array<{ value: string; label: string }> = [
	{ value: "bigcode/starcoder2-3b", label: "StarCoder2 3B" },
	{ value: "bigcode/starcoder2-7b", label: "StarCoder2 7B" },
	{ value: "bigcode/starcoder2-15b", label: "StarCoder2 15B" },
	{ value: "deepseek-ai/deepseek-coder-1.3b-base", label: "DeepSeek-Coder 1.3B" },
	{ value: "deepseek-ai/deepseek-coder-6.7b-base", label: "DeepSeek-Coder 6.7B" },
	{ value: "deepseek-ai/deepseek-coder-33b-base", label: "DeepSeek-Coder 33B" },
	{ value: "codellama/CodeLlama-7b-hf", label: "CodeLlama 7B" },
	{ value: "codellama/CodeLlama-13b-hf", label: "CodeLlama 13B" },
	{ value: "Qwen/Qwen2.5-Coder-1.5B", label: "Qwen2.5-Coder 1.5B" },
	{ value: "Qwen/Qwen2.5-Coder-7B", label: "Qwen2.5-Coder 7B" },
]
const FIM_MODEL_CUSTOM = "__custom__"

// Model name → default FIM preset mapping.
// When user picks a known model from the dropdown, fimPreset auto-syncs.
const MODEL_TO_PRESET: Record<string, string> = {
	"bigcode/starcoder2-3b": "starcoder",
	"bigcode/starcoder2-7b": "starcoder",
	"bigcode/starcoder2-15b": "starcoder",
	"deepseek-ai/deepseek-coder-1.3b-base": "deepseek",
	"deepseek-ai/deepseek-coder-6.7b-base": "deepseek",
	"deepseek-ai/deepseek-coder-33b-base": "deepseek",
	"codellama/CodeLlama-7b-hf": "codellama",
	"codellama/CodeLlama-13b-hf": "codellama",
	"Qwen/Qwen2.5-Coder-1.5B": "qwen",
	"Qwen/Qwen2.5-Coder-7B": "qwen",
}

export const CompletionModelSettings: React.FC<CompletionModelSettingsProps> = ({
	fimEnabled,
	fimApiUrl,
	fimModelName,
	fimApiKey,
	fimPreset,
	fimMaxPrefixTokens,
	fimMaxSuffixTokens,
	fimMaxOutputTokens,
	fimTemperature,
	fimTopP,
	fimTopK,
	fimRepetitionPenalty,
	fimDoSample,
	fimStopSequences,
	fimTimeoutMs,
	fimDebounceMs,
	fimDebug,
	fimCustomMarkerBegin,
	fimCustomMarkerHole,
	fimCustomMarkerEnd,
	onFimEnabledChange,
	onFimApiUrlChange,
	onFimModelNameChange,
	onFimApiKeyChange,
	onFimPresetChange,
	onFimMaxPrefixTokensChange,
	onFimMaxSuffixTokensChange,
	onFimMaxOutputTokensChange,
	onFimTemperatureChange,
	onFimTopPChange,
	onFimTopKChange,
	onFimRepetitionPenaltyChange,
	onFimDoSampleChange,
	onFimStopSequencesChange,
	onFimTimeoutMsChange,
	onFimDebounceMsChange,
	onFimDebugChange,
	onFimCustomMarkerBeginChange,
	onFimCustomMarkerHoleChange,
	onFimCustomMarkerEndChange,
}) => {
	const { t } = useAppTranslation()

	const stopSequencesText = fimStopSequences.join(", ")

	// 当前模型名不在预设列表中即视为自定义，下拉切到 Custom 并显示文本输入。
	const isFimModelCustom = !FIM_MODEL_OPTIONS.some((m) => m.value === fimModelName)
	const dropdownValue = isFimModelCustom ? FIM_MODEL_CUSTOM : fimModelName

	// Collapsible advanced settings — collapsed by default for a clean config UI
	const [advancedOpen, setAdvancedOpen] = useState(false)

	return (
		<div>
			<SectionHeader description={t("settings:completionModel.description")}>
				{t("settings:completionModel.title")}
			</SectionHeader>

			<Section>
				{/* Enable/Disable */}
				<div className="flex items-center gap-2">
					<VSCodeCheckbox checked={fimEnabled} onChange={(e: any) => onFimEnabledChange(e.target.checked)}>
						<label className="block font-medium">{t("settings:completionModel.enabled")}</label>
					</VSCodeCheckbox>
				</div>

				{fimEnabled && (
					<>
						{/* API URL */}
						<div className="flex flex-col gap-1">
							<label className="text-sm font-medium">{t("settings:completionModel.apiUrl")}</label>
							<VSCodeTextField
								value={fimApiUrl}
								placeholder="http://localhost:8000"
								onInput={(e: any) => onFimApiUrlChange(e.target.value)}
							/>
							<div className="text-xs text-vscode-descriptionForeground">
								{t("settings:completionModel.apiUrlHint")}
							</div>
						</div>

						{/* Model Name — auto-links fimPreset when a known model is selected */}
						<div className="flex flex-col gap-1">
							<label className="text-sm font-medium">{t("settings:completionModel.modelName")}</label>
							<VSCodeDropdown
								value={dropdownValue}
								onChange={(e: any) => {
									const v = e.target.value
									if (v === FIM_MODEL_CUSTOM) {
										if (dropdownValue !== FIM_MODEL_CUSTOM) {
											onFimModelNameChange("")
										}
									} else {
										onFimModelNameChange(v)
										// Auto-sync preset when a known model is selected
										const autoPreset = MODEL_TO_PRESET[v]
										if (autoPreset) {
											onFimPresetChange(autoPreset)
										}
									}
								}}>
								{FIM_MODEL_OPTIONS.map((m) => (
									<VSCodeOption key={m.value} value={m.value}>
										{m.label}
									</VSCodeOption>
								))}
								<VSCodeOption value={FIM_MODEL_CUSTOM}>Custom (input manually)</VSCodeOption>
							</VSCodeDropdown>
							{dropdownValue === FIM_MODEL_CUSTOM && (
								<VSCodeTextField
									value={fimModelName}
									placeholder="bigcode/starcoder2-7b"
									onInput={(e: any) => onFimModelNameChange(e.target.value)}
								/>
							)}
						</div>

						{/* API Key */}
						<div className="flex flex-col gap-1">
							<label className="text-sm font-medium">{t("settings:completionModel.apiKey")}</label>
							<VSCodeTextField
								value={fimApiKey}
								type="password"
								placeholder="(optional)"
								onInput={(e: any) => onFimApiKeyChange(e.target.value)}
							/>
						</div>

						{/* Advanced Settings — collapsed by default for a clean config UI */}
						<div className="flex flex-col gap-1 mt-2">
							<button
								type="button"
								className="text-left text-sm text-vscode-textLink hover:underline cursor-pointer flex items-center gap-1"
								onClick={() => setAdvancedOpen((v) => !v)}>
								<span
									className={`inline-block transition-transform ${advancedOpen ? "rotate-90" : ""}`}>
									▶
								</span>
								{advancedOpen ? "收起扩展配置" : "扩展配置"}
							</button>

							{advancedOpen && (
								<div className="flex flex-col gap-3 mt-2 pl-4 border-l border-vscode-panelBorder">
									{/* FIM Preset (marker format) */}
									<div className="flex flex-col gap-1">
										<label className="text-sm font-medium">
											{t("settings:completionModel.fimPreset")}
										</label>
										<VSCodeDropdown
											value={fimPreset}
											onChange={(e: any) => onFimPresetChange(e.target.value)}>
											<VSCodeOption value="starcoder">StarCoder</VSCodeOption>
											<VSCodeOption value="deepseek">DeepSeek-Coder</VSCodeOption>
											<VSCodeOption value="codellama">CodeLlama</VSCodeOption>
											<VSCodeOption value="qwen">Qwen-Coder</VSCodeOption>
											<VSCodeOption value="custom">Custom</VSCodeOption>
										</VSCodeDropdown>
									</div>

									{/* Custom FIM markers (only when fimPreset === "custom") */}
									{fimPreset === "custom" && (
										<>
											<div className="flex flex-col gap-1">
												<label className="text-sm font-medium">前缀标记 (Prefix Marker)</label>
												<VSCodeTextField
													value={fimCustomMarkerBegin}
													placeholder="<fim_prefix>"
													onInput={(e: any) => onFimCustomMarkerBeginChange(e.target.value)}
												/>
												<div className="text-xs text-vscode-descriptionForeground">
													放在 prefix 之前的特殊 token。例如 StarCoder 使用
													&lt;fim_prefix&gt;。
												</div>
											</div>
											<div className="flex flex-col gap-1">
												<label className="text-sm font-medium">后缀标记 (Suffix Marker)</label>
												<VSCodeTextField
													value={fimCustomMarkerHole}
													placeholder="<fim_suffix>"
													onInput={(e: any) => onFimCustomMarkerHoleChange(e.target.value)}
												/>
												<div className="text-xs text-vscode-descriptionForeground">
													放在 suffix 之前的特殊 token。例如 StarCoder 使用
													&lt;fim_suffix&gt;。
												</div>
											</div>
											<div className="flex flex-col gap-1">
												<label className="text-sm font-medium">中间标记 (Middle Marker)</label>
												<VSCodeTextField
													value={fimCustomMarkerEnd}
													placeholder="<fim_middle>"
													onInput={(e: any) => onFimCustomMarkerEndChange(e.target.value)}
												/>
												<div className="text-xs text-vscode-descriptionForeground">
													放在 suffix 之后的特殊 token（开始生成补全）。例如 StarCoder 使用
													&lt;fim_middle&gt;。
												</div>
											</div>
										</>
									)}

									{/* Token Limits */}
									<div className="grid grid-cols-3 gap-3">
										<div className="flex flex-col gap-1">
											<label className="text-sm font-medium">
												{t("settings:completionModel.maxPrefixTokens")}
											</label>
											<VSCodeTextField
												type="text"
												inputMode="numeric"
												value={String(fimMaxPrefixTokens)}
												onInput={(e: any) => onFimMaxPrefixTokensChange(Number(e.target.value))}
											/>
										</div>
										<div className="flex flex-col gap-1">
											<label className="text-sm font-medium">
												{t("settings:completionModel.maxSuffixTokens")}
											</label>
											<VSCodeTextField
												type="text"
												inputMode="numeric"
												value={String(fimMaxSuffixTokens)}
												onInput={(e: any) => onFimMaxSuffixTokensChange(Number(e.target.value))}
											/>
										</div>
										<div className="flex flex-col gap-1">
											<label className="text-sm font-medium">
												{t("settings:completionModel.maxOutputTokens")}
											</label>
											<VSCodeTextField
												type="text"
												inputMode="numeric"
												value={String(fimMaxOutputTokens)}
												onInput={(e: any) => onFimMaxOutputTokensChange(Number(e.target.value))}
											/>
										</div>
									</div>

									{/* Temperature */}
									<div className="flex flex-col gap-1">
										<label className="text-sm font-medium">
											{t("settings:completionModel.temperature")}
										</label>
										<TemperatureControl
											value={fimTemperature}
											onChange={(v) => onFimTemperatureChange(v ?? null)}
											maxValue={2}
											defaultValue={0.1}
										/>
									</div>

									{/* Top P */}
									<div className="flex flex-col gap-1">
										<label className="text-sm font-medium">
											{t("settings:completionModel.topP")}
										</label>
										<VSCodeTextField
											type="text"
											inputMode="decimal"
											value={String(fimTopP)}
											onInput={(e: any) => onFimTopPChange(Number(e.target.value))}
										/>
									</div>

									{/* Top K */}
									<div className="flex flex-col gap-1">
										<label className="text-sm font-medium">
											{t("settings:completionModel.topK")}
										</label>
										<VSCodeTextField
											type="text"
											inputMode="numeric"
											value={String(fimTopK)}
											onInput={(e: any) => onFimTopKChange(Number(e.target.value))}
										/>
										<div className="text-xs text-vscode-descriptionForeground">
											{t("settings:completionModel.topKHint")}
										</div>
									</div>

									{/* Repetition Penalty */}
									<div className="flex flex-col gap-1">
										<label className="text-sm font-medium">
											{t("settings:completionModel.repetitionPenalty")}
										</label>
										<VSCodeTextField
											type="text"
											inputMode="decimal"
											value={fimRepetitionPenalty == null ? "" : String(fimRepetitionPenalty)}
											placeholder="1.0"
											onInput={(e: any) => {
												const raw = e.target.value
												onFimRepetitionPenaltyChange(raw === "" ? null : Number(raw))
											}}
										/>
										<div className="text-xs text-vscode-descriptionForeground">
											{t("settings:completionModel.repetitionPenaltyHint")}
										</div>
									</div>

									{/* Do Sample */}
									<div className="flex items-center gap-2">
										<VSCodeCheckbox
											checked={fimDoSample}
											onChange={(e: any) => onFimDoSampleChange(e.target.checked)}>
											<label className="block font-medium">
												{t("settings:completionModel.doSample")}
											</label>
										</VSCodeCheckbox>
									</div>

									{/* Stop Sequences */}
									<div className="flex flex-col gap-1">
										<label className="text-sm font-medium">
											{t("settings:completionModel.stopSequences")}
										</label>
										<VSCodeTextField
											value={stopSequencesText}
											placeholder=""
											onInput={(e: any) => {
												const raw = e.target.value
												onFimStopSequencesChange(
													raw
														.split(",")
														.map((s: string) => s.trim())
														.filter((s: string) => s.length > 0),
												)
											}}
										/>
										<div className="text-xs text-vscode-descriptionForeground">
											{t("settings:completionModel.stopSequencesHint")}
										</div>
									</div>

									{/* Timeout */}
									<div className="flex flex-col gap-1">
										<label className="text-sm font-medium">
											{t("settings:completionModel.timeout")}
										</label>
										<VSCodeTextField
											type="text"
											inputMode="numeric"
											value={String(fimTimeoutMs)}
											onInput={(e: any) => onFimTimeoutMsChange(Number(e.target.value))}
										/>
										<div className="text-xs text-vscode-descriptionForeground">
											{t("settings:completionModel.timeoutHint")}
										</div>
									</div>

									{/* Debounce */}
									<div className="flex flex-col gap-1">
										<label className="text-sm font-medium">
											{t("settings:completionModel.debounce")}
										</label>
										<VSCodeTextField
											type="text"
											inputMode="numeric"
											value={String(fimDebounceMs)}
											onInput={(e: any) => onFimDebounceMsChange(Number(e.target.value))}
										/>
										<div className="text-xs text-vscode-descriptionForeground">
											{t("settings:completionModel.debounceHint")}
										</div>
									</div>

									{/* Debug trace */}
									<div className="flex items-center gap-2">
										<VSCodeCheckbox
											checked={fimDebug}
											onChange={(e: any) => onFimDebugChange(e.target.checked)}>
											<label className="block font-medium">
												{t("settings:completionModel.debug")}
											</label>
										</VSCodeCheckbox>
									</div>
									<div className="text-xs text-vscode-descriptionForeground -mt-1">
										{t("settings:completionModel.debugHint")}
									</div>
								</div>
							)}
						</div>
					</>
				)}
			</Section>
		</div>
	)
}
