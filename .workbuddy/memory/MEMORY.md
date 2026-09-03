# Costrict 项目长期记忆

## Mode 可见性/可用性机制（重要，易踩坑）

- `ModeConfig.apiProvider`（mode.ts 里大量设为 "costrict"）**不是**硬开关，仅被 `filterModesByCostrictCodeMode` 读取。
- `src/shared/modes.ts` 的 `filterModesByCostrictCodeMode` 逻辑：
    - `apiProvider === "costrict"` 分支：完全忽略 `mode.apiProvider`，改为按 `costrictCodeModeGroup` + `costrictCodeMode` 过滤。
    - `apiProvider !== "costrict"` 分支：才执行 `!mode.apiProvider || mode.apiProvider === apiProvider`。
- 真正运行任务取 mode 用 `getModeBySlug`/`getModeConfig`（ClineProvider.ts），**不过滤** apiProvider；`isProviderAllowedForCostrictCodeMode` 恒返回 true。
- 结论：mode 的 `apiProvider:"costrict"` 字段基本是冗余元数据；真正控制可见/可用的是 `apiConfiguration.apiProvider==="costrict"` + 各 mode 的 `costrictCodeModeGroup` + 当前 `costrictCodeMode`（vibe/strict/plan/raw）。
- 默认 `apiProvider` 是 `"openrouter"`（packages/types/src/global-settings.ts:384），不是 costrict。

## 对话中技术遥测与 developerMode 的关联

- `TaskHeader` 的 ContextWindowProgress（上下文窗口百分比/进度条）已关联 `developerMode`：默认关闭时不显示。
- `ChatRow` 的 API 请求速度指标（首 Token、总耗时、每秒 Token）已关联 `developerMode`。
- `ReasoningBlock` 的思考耗时（秒数）已关联 `developerMode`；思考提示文案仍保留。
- 相关测试：`TaskHeader.spec.tsx`、`ChatRow.speed-info.spec.tsx`、`ReasoningBlock.spec.tsx`。
- 关键原则：developerMode 控制技术遥测（tokens/cache/cost/size/context window/API 耗时/思考时间等）是否可见；折叠态/展开态都需一致门控——上次只接 ContextWindowProgress，导致 tokens/cache/cost/size 行在 developerMode=false 时仍显示，用户提了反馈后补齐。

## 内置便携二进制工具的约定（bundled tools）

- 便携工具统一放 `src/assets/<tool>/win32-x64/`，配套 `src/utils/bundled<Tool>.ts` 解析器（镜像 `bundledGit.ts`），并在 `src/.vscodeignore` 加 `!assets/<tool>/**` 才会打进 VSIX。
- 已有：`git`（7-Zip SFX，运行期解压到 globalStorage）；`cppcheck` 2.21.0（扁平存储，无需解压，供 C/C++ review 调用）。
- 解析器从 `src/extension.ts` 入口 import（否则 knip 报死代码）。git 是启动时预热解压；cppcheck 只是打日志。
- 提取 MSI 便携化时用 Python `subprocess.run(["msiexec","/a",msi,"/qn","TARGETDIR="+dir])` 传列表，别在 git bash 里直接拼 `msiexec //a ... TARGETDIR=...\`（`\r\n`/反斜杠会污染路径报 1603）。
