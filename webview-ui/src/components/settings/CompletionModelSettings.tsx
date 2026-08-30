import React from "react"
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
}

// 常用 FIM（fill-in-the-middle）代码补全模型。优先让用户从下拉选择，
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
}) => {
	const { t } = useAppTranslation()

	const stopSequencesText = fimStopSequences.join(", ")

	// 当前模型名不在预设列表中即视为自定义，下拉切到 Custom 并显示文本输入。
	const isFimModelCustom = !FIM_MODEL_OPTIONS.some((m) => m.value === fimModelName)
	const dropdownValue = isFimModelCustom ? FIM_MODEL_CUSTOM : fimModelName

	return (
		<div>
			<SectionHeader description={t("settings:completionModel.description")}>
				{t("settings:completionModel.title")}
			</SectionHeader>

			<Section>
				{/* Enable/Disable FIM */}
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

						{/* Model Name */}
						<div className="flex flex-col gap-1">
							<label className="text-sm font-medium">{t("settings:completionModel.modelName")}</label>
							<VSCodeDropdown
								value={dropdownValue}
								onChange={(e: any) => {
									const v = e.target.value
									if (v === FIM_MODEL_CUSTOM) {
										// 从预设切到 Custom 时清空，避免文本框残留旧模型名造成误导
										if (dropdownValue !== FIM_MODEL_CUSTOM) {
											onFimModelNameChange("")
										}
									} else {
										onFimModelNameChange(v)
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

						{/* FIM Preset */}
						<div className="flex flex-col gap-1">
							<label className="text-sm font-medium">{t("settings:completionModel.fimPreset")}</label>
							<VSCodeDropdown value={fimPreset} onChange={(e: any) => onFimPresetChange(e.target.value)}>
								<VSCodeOption value="starcoder">StarCoder</VSCodeOption>
								<VSCodeOption value="deepseek">DeepSeek-Coder</VSCodeOption>
								<VSCodeOption value="codellama">CodeLlama</VSCodeOption>
								<VSCodeOption value="qwen">Qwen-Coder</VSCodeOption>
								<VSCodeOption value="custom">Custom</VSCodeOption>
							</VSCodeDropdown>
						</div>

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
							<label className="text-sm font-medium">{t("settings:completionModel.temperature")}</label>
							<TemperatureControl
								value={fimTemperature}
								onChange={(v) => onFimTemperatureChange(v ?? null)}
								maxValue={2}
								defaultValue={0.1}
							/>
						</div>

						{/* Top P */}
						<div className="flex flex-col gap-1">
							<label className="text-sm font-medium">{t("settings:completionModel.topP")}</label>
							<VSCodeTextField
								type="text"
								inputMode="decimal"
								value={String(fimTopP)}
								onInput={(e: any) => onFimTopPChange(Number(e.target.value))}
							/>
						</div>

						{/* Top K */}
						<div className="flex flex-col gap-1">
							<label className="text-sm font-medium">{t("settings:completionModel.topK")}</label>
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
								<label className="block font-medium">{t("settings:completionModel.doSample")}</label>
							</VSCodeCheckbox>
						</div>

						{/* Stop Sequences */}
						<div className="flex flex-col gap-1">
							<label className="text-sm font-medium">{t("settings:completionModel.stopSequences")}</label>
							<VSCodeTextField
								value={stopSequencesText}
								placeholder="<|endoftext|>"
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
							<label className="text-sm font-medium">{t("settings:completionModel.timeout")}</label>
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
							<label className="text-sm font-medium">{t("settings:completionModel.debounce")}</label>
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
								<label className="block font-medium">{t("settings:completionModel.debug")}</label>
							</VSCodeCheckbox>
						</div>
						<div className="text-xs text-vscode-descriptionForeground -mt-1">
							{t("settings:completionModel.debugHint")}
						</div>
					</>
				)}
			</Section>
		</div>
	)
}
