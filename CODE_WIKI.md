# ssdAgent Code Wiki

> **Strict AI Coder for Enterprises** - 企业级 AI 编程助手

---

## 目录

1. [项目概述](#项目概述)
2. [技术栈](#技术栈)
3. [项目架构](#项目架构)
4. [目录结构详解](#目录结构详解)
5. [核心模块](#核心模块)
6. [API 提供者系统](#api-提供者系统)
7. [工具系统](#工具系统)
8. [服务层](#服务层)
9. [共享包](#共享包)
10. [构建与运行](#构建与运行)
11. [开发指南](#开发指南)

---

## 项目概述

### 项目简介

**ssdAgent** 是一个免费、开源的企业级 AI 编程助手，支持私有化部署。它基于 VS Code 扩展架构，提供严格的 AI 代码生成工作流，确保企业开发场景下的代码质量和可控性。

### 核心功能

| 功能                            | 描述                                                               |
| ------------------------------- | ------------------------------------------------------------------ |
| **Strict Mode（严格模式）**     | 标准化 AI 代码生成流程，包含需求分析、架构设计、任务规划和测试生成 |
| **Code Review（代码审查）**     | 基于仓库级 RAG 的代码分析，支持多专家模型验证                      |
| **Code Completion（代码补全）** | 上下文感知的秒级代码生成                                           |
| **Vibe Code（快速编码）**       | 通过自然语言对话实现快速开发                                       |
| **MCP Integration**             | 标准化系统连接，支持 API、数据库和自定义工具                       |
| **Multi-modal（多模态）**       | 支持图像上下文和视觉输入                                           |
| **Skills Support（技能支持）**  | 可扩展的技能系统，用于专门的任务工作流                             |

### 支持平台

- **VS Code** - 主要平台，完整功能支持
- **JetBrains** - 通过插件支持（独立仓库）
- **CLI** - 命令行工具，支持终端使用
- **Web** - Web 界面评估和管理

---

## 技术栈

### 核心技术

| 技术            | 版本       | 用途              |
| --------------- | ---------- | ----------------- |
| **Node.js**     | >= 20.19.2 | 运行时环境        |
| **TypeScript**  | 5.8.3      | 主要开发语言      |
| **pnpm**        | 10.8.1     | 包管理器          |
| **Turbo**       | ^2.5.6     | Monorepo 构建系统 |
| **VS Code API** | ^1.93.1    | 扩展开发框架      |

### 前端技术（Webview）

| 技术               | 版本    | 用途           |
| ------------------ | ------- | -------------- |
| **React**          | ^18.3.1 | UI 框架        |
| **Vite**           | 6.3.6   | 构建工具       |
| **Tailwind CSS**   | ^4.0.0  | 样式框架       |
| **Radix UI**       | 多版本  | 无障碍组件库   |
| **TanStack Query** | ^5.68.0 | 数据获取和缓存 |
| **i18next**        | ^25.0.0 | 国际化         |

### 构建工具

| 工具           | 版本    | 用途         |
| -------------- | ------- | ------------ |
| **esbuild**    | ^0.25.0 | 扩展代码打包 |
| **TypeScript** | 5.8.3   | 类型检查     |
| **ESLint**     | ^9.27.0 | 代码检查     |
| **Prettier**   | ^3.4.2  | 代码格式化   |
| **Vitest**     | 3.2.6   | 单元测试     |

### 关键依赖

| 包名                    | 用途               |
| ----------------------- | ------------------ |
| `@anthropic-ai/sdk`     | Anthropic API 集成 |
| `openai`                | OpenAI API 集成    |
| `@google/generative-ai` | Gemini API 集成    |
| `axios`                 | HTTP 请求          |
| `lodash`                | 工具函数库         |
| `uuid`                  | UUID 生成          |
| `zod`                   | 运行时类型验证     |
| `drizzle-orm`           | 数据库 ORM         |

---

## 项目架构

### 整体架构图

```
┌─────────────────────────────────────────────────────────────┐
│                      ssdAgent Monorepo                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   VS Code    │  │     CLI      │  │   Web Apps   │      │
│  │  Extension   │  │    Tool      │  │  (Evals/UI)  │      │
│  │   (src/)     │  │  (apps/cli)  │  │ (apps/web-*) │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │               │
│         └────────────────┬┴────────────────┘               │
│                          │                                  │
│              ┌───────────┴───────────┐                     │
│              │    Shared Packages    │                     │
│              │     (packages/*)      │                     │
│              └───────────┬───────────┘                     │
│                          │                                  │
│         ┌────────────────┼────────────────┐               │
│         │                │                │               │
│  ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐      │
│  │   @roo-code │  │ @roo-code   │  │ @roo-code   │      │
│  │    /types   │  │   /cloud    │  │    /ipc     │      │
│  └─────────────┘  └─────────────┘  └─────────────┘      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  @roo-code   │  │ @roo-code    │  │ @roo-code    │      │
│  │   /telemetry │  │   /core      │  │   /build     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Webview UI (webview-ui/)                │  │
│  │         React-based VS Code Webview                  │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Monorepo 结构

项目采用 **pnpm workspaces** + **Turbo** 的 Monorepo 架构：

```yaml
# pnpm-workspace.yaml
packages:
    - "src" # VS Code 扩展主目录
    - "webview-ui" # Webview UI
    - "apps/*" # 应用程序
    - "packages/*" # 共享包
```

### 构建流程

```
源码 (TypeScript)
    ↓
TypeScript 编译 (tsc)
    ↓
esbuild 打包 (扩展) / Vite 构建 (Webview)
    ↓
输出到 dist/ 目录
    ↓
VSIX 打包 (vsce)
    ↓
VS Code 扩展 (.vsix)
```

---

## 目录结构详解

### 根目录

```
costrict-main/
├── src/                    # VS Code 扩展主目录
├── webview-ui/             # Webview UI (React)
├── apps/                   # 应用程序
│   ├── cli/               # CLI 工具
│   ├── web-evals/         # 评估 Web 应用
│   ├── web-roo-code/      # Roo Code 网站
│   ├── vscode-e2e/        # E2E 测试
│   └── vscode-nightly/    # Nightly 构建
├── packages/               # 共享包
│   ├── types/             # 类型定义
│   ├── cloud/             # 云服务
│   ├── ipc/               # IPC 通信
│   ├── telemetry/         # 遥测
│   ├── core/              # 核心工具
│   ├── build/             # 构建工具
│   ├── logger/            # 日志
│   └── ...
├── assets/                 # 静态资源
├── scripts/                # 构建脚本
├── .github/                # GitHub 配置
├── package.json            # 根配置
├── pnpm-workspace.yaml     # 工作区配置
├── turbo.json              # Turbo 配置
└── tsconfig.json           # TypeScript 配置
```

### src/ - 扩展主目录

```
src/
├── extension.ts            # 扩展入口点
├── activate/               # 扩展激活逻辑
│   ├── index.ts           # 激活入口
│   ├── registerCommands.ts # 命令注册
│   ├── handleUri.ts       # URI 处理
│   └── handleTask.ts      # 任务处理
├── api/                    # API 提供者系统
│   ├── providers/         # AI 模型提供者
│   │   ├── base-provider.ts
│   │   ├── anthropic.ts
│   │   ├── openai.ts
│   │   ├── gemini.ts
│   │   ├── costrict.ts
│   │   └── ...
│   └── transform/         # 消息格式转换
│       ├── stream.ts
│       ├── openai-format.ts
│       └── ...
├── core/                   # 核心功能
│   ├── task/              # 任务系统
│   │   └── Task.ts
│   ├── tools/             # 工具系统
│   │   ├── BaseTool.ts
│   │   ├── ReadFileTool.ts
│   │   ├── EditFileTool.ts
│   │   └── ...
│   ├── webview/           # Webview 管理
│   │   └── ClineProvider.ts
│   ├── config/            # 配置管理
│   │   └── ContextProxy.ts
│   ├── prompts/           # 提示词系统
│   ├── auto-approval/     # 自动审批
│   └── costrict/          # Costrict 特定功能
├── services/               # 服务层
│   ├── mcp/               # MCP 集成
│   ├── checkpoints/       # 检查点
│   ├── code-index/        # 代码索引
│   ├── search/            # 搜索
│   └── ...
├── shared/                 # 共享工具
├── utils/                  # 工具函数
├── integrations/           # VS Code 集成
│   ├── terminal/          # 终端集成
│   ├── editor/            # 编辑器集成
│   └── theme/             # 主题
├── i18n/                   # 国际化
└── workers/                # Web Workers
```

### webview-ui/ - Webview UI

```
webview-ui/
├── src/
│   ├── index.tsx          # React 入口
│   ├── App.tsx            # 主应用组件
│   ├── components/        # UI 组件
│   ├── i18n/              # 国际化
│   ├── utils/             # 工具函数
│   └── oauth/             # OAuth 处理
├── public/                 # 静态资源
├── index.html             # HTML 模板
├── vite.config.ts         # Vite 配置
└── package.json           # 依赖配置
```

### apps/ - 应用程序

```
apps/
├── cli/                   # CLI 工具
│   ├── src/
│   │   ├── agent/         # Agent 实现
│   │   ├── commands/      # 命令
│   │   ├── lib/           # 库
│   │   └── ui/            # UI 组件
│   └── package.json
├── web-evals/             # 评估 Web 应用
│   ├── src/
│   │   ├── app/           # Next.js 应用
│   │   ├── actions/       # Server Actions
│   │   └── lib/           # 库
│   └── package.json
├── web-roo-code/          # Roo Code 网站
│   ├── src/
│   │   └── app/           # Next.js 应用
│   └── package.json
├── vscode-e2e/            # E2E 测试
│   └── src/
└── vscode-nightly/        # Nightly 构建
    └── esbuild.mjs
```

### packages/ - 共享包

```
packages/
├── types/                 # 类型定义
│   └── src/
│       ├── api.ts         # API 类型
│       ├── task.ts        # 任务类型
│       ├── tool.ts        # 工具类型
│       ├── mcp.ts         # MCP 类型
│       └── ...
├── cloud/                 # 云服务
│   └── src/
│       ├── CloudService.ts
│       ├── CloudAPI.ts
│       └── ...
├── ipc/                   # IPC 通信
│   └── src/
│       ├── ipc-client.ts
│       └── ipc-server.ts
├── telemetry/             # 遥测
│   └── src/
│       └── TelemetryService.ts
├── core/                  # 核心工具
│   └── src/
│       └── custom-tools/
├── build/                 # 构建工具
│   └── src/
│       └── esbuild.ts
└── ...
```

---

## 核心模块

### 1. 扩展入口 (extension.ts)

扩展的主入口文件，负责初始化和激活扩展。

**关键职责：**

- 加载环境变量
- 初始化遥测服务
- 初始化国际化
- 注册命令和视图
- 创建 Webview Provider
- 处理 OAuth 认证
- 管理扩展生命周期

**核心流程：**

```typescript
export async function activate(context: vscode.ExtensionContext) {
	// 1. 初始化日志和输出通道
	outputChannel = createLogger(Package.outputChannel).channel

	// 2. 配置 HTTP 代理
	axios.defaults.httpAgent = new http.Agent({ keepAlive: false })

	// 3. 初始化网络代理
	await initializeNetworkProxy(context, outputChannel)

	// 4. 迁移旧设置
	await migrateSettings(context, outputChannel)

	// 5. 初始化遥测
	TelemetryService.createInstance()

	// 6. 初始化国际化
	initializeI18n(context.globalState.get("language"))

	// 7. 初始化终端
	TerminalRegistry.initialize()

	// 8. 初始化 OAuth
	claudeCodeOAuthManager.initialize(context)
	openAiCodexOAuthManager.initialize(context)

	// 9. 创建 ContextProxy
	const contextProxy = await ContextProxy.getInstance(context)

	// 10. 创建 ClineProvider
	const provider = new ClineProvider(context, outputChannel, "sidebar", contextProxy)

	// 11. 注册 Webview Provider
	vscode.window.registerWebviewViewProvider(ClineProvider.sideBarId, provider)

	// 12. 注册命令
	registerCommands({ context, outputChannel, provider })

	// 13. 激活 Costrict 核心功能
	await CostrictCore.activate(context, provider, outputChannel)

	// 14. 返回 API 实例
	return new API(outputChannel, provider, socketPath, enableLogging)
}
```

### 2. 任务系统 (Task.ts)

任务系统是扩展的核心，负责管理 AI 对话和工具执行。

**主要职责：**

- 管理对话历史
- 处理 API 请求和响应
- 执行工具调用
- 管理任务状态
- 处理错误和重试
- 计算 token 使用量和成本

**核心类：Task**

```typescript
class Task extends EventEmitter {
	// 任务状态
	private taskId: string
	private status: TaskStatus
	private clineMessages: ClineMessage[]
	private apiConversationHistory: Anthropic.Messages.MessageParam[]

	// API 和模型
	private apiHandler: ApiHandler
	private modelInfo: ModelInfo

	// 工具执行
	private toolUsage: ToolUsage[]
	private consecutiveMistakes: number

	// 核心方法
	async startTask(text: string, images?: string[]): Promise<void>
	async resumeTask(): Promise<void>
	async cancelTask(): Promise<void>

	// API 交互
	private async initiateApiRequest(systemPrompt: string): Promise<void>
	private async presentAssistantMessage(): Promise<void>

	// 工具处理
	private async executeTool(toolName: ToolName, params: any): Promise<void>
	private async askApproval(toolName: ToolName, params: any): Promise<boolean>

	// 消息管理
	private async say(say: ClineSay, text?: string, images?: string[]): Promise<void>
	private async ask(ask: ClineAsk, text?: string): Promise<ClineAskResponse>

	// 检查点
	private async checkpointSave(): Promise<void>
	private async checkpointRestore(): Promise<void>
}
```

**任务状态流转：**

```
idle → starting → streaming → tool_executing → waiting_approval → streaming → ... → completed
                                                                                   ↓
                                                                               cancelled/error
```

### 3. 配置管理 (ContextProxy.ts)

配置代理负责管理扩展的所有配置和状态。

**主要职责：**

- 管理 VS Code 全局状态
- 管理 workspace 配置
- 提供配置读写接口
- 处理配置迁移
- 监听配置变更

**核心接口：**

```typescript
class ContextProxy {
	// 获取配置值
	get<T>(key: string): T | undefined
	get<T>(key: string, defaultValue: T): T

	// 设置配置值
	set(key: string, value: any): Promise<void>

	// 批量更新
	update(values: Record<string, any>): Promise<void>

	// 监听变更
	onDidChange(listener: (keys: string[]) => void): Disposable

	// 特定配置访问器
	getProviderSettings(): ProviderSettings
	getCustomModes(): Mode[]
	getGlobalState(): GlobalState
}
```

**配置层级：**

1. **Global State** - 跨 workspace 的全局配置
2. **Workspace State** - 当前 workspace 的配置
3. **Provider Settings** - API 提供者配置
4. **Custom Modes** - 自定义模式配置

### 4. Webview 通信 (ClineProvider.ts)

ClineProvider 负责扩展与 Webview UI 之间的通信。

**主要职责：**

- 注册 Webview Provider
- 处理 Webview 消息
- 发送状态更新到 Webview
- 管理 Webview 生命周期
- 处理用户交互

**消息类型：**

```typescript
// 扩展 → Webview
type ExtensionMessage = {
	type: "state" | "action" | "error"
	state?: ExtensionState
	action?: string
	error?: string
}

// Webview → 扩展
type WebviewMessage = {
	type: "askResponse" | "userMessage" | "settings"
	askResponse?: ClineAskResponse
	text?: string
	settings?: Partial<RooCodeSettings>
}
```

**通信流程：**

```
用户操作 → Webview UI → postMessage → ClineProvider → Task → API
                                                              ↓
用户看到结果 ← Webview UI ← postMessage ← ClineProvider ← Task
```

### 5. 提示词系统 (prompts/)

提示词系统负责生成和管理 AI 的系统提示词。

**目录结构：**

```
prompts/
├── system.ts              # 系统提示词生成
├── responses.ts           # 响应格式化
├── types.ts               # 类型定义
└── sections/              # 提示词部分
    ├── index.ts           # 部分导出
    ├── modes.ts           # 模式相关
    ├── rules.ts           # 规则相关
    └── shell.ts           # Shell 相关
```

**系统提示词组成：**

```typescript
function getSystemPrompt(mode: Mode, customInstructions?: string, environment?: Environment): string {
	return [
		// 1. 基础角色定义
		getRoleSection(),

		// 2. 能力说明
		getCapabilitiesSection(),

		// 3. 工具说明
		getToolsSection(),

		// 4. 规则约束
		getRulesSection(),

		// 5. 模式特定指令
		getModeInstructions(mode),

		// 6. 自定义指令
		customInstructions,

		// 7. 环境信息
		getEnvironmentSection(environment),
	].join("\n\n")
}
```

### 6. 自动审批 (auto-approval/)

自动审批系统根据配置自动批准工具执行，减少用户交互。

**审批规则：**

```typescript
class AutoApprovalHandler {
	async shouldAutoApprove(toolName: ToolName, params: any, settings: AutoApprovalSettings): Promise<boolean> {
		// 1. 检查全局开关
		if (!settings.enabled) return false

		// 2. 检查工具特定规则
		const toolRule = settings.tools[toolName]
		if (!toolRule?.enabled) return false

		// 3. 检查路径匹配
		if (toolRule.pathPatterns) {
			const matches = await this.matchPaths(params, toolRule.pathPatterns)
			if (!matches) return false
		}

		// 4. 检查命令匹配（针对 execute_command）
		if (toolName === "execute_command" && toolRule.commandPatterns) {
			const matches = await this.matchCommands(params, toolRule.commandPatterns)
			if (!matches) return false
		}

		return true
	}
}
```

---

## API 提供者系统

### 架构概述

API 提供者系统采用策略模式，支持多种 AI 模型提供商。

```
┌─────────────────────────────────────────┐
│         ApiHandler (接口)                │
│  - createMessage(): ApiStream           │
│  - getModel(): { id, info }             │
│  - countTokens(): Promise<number>       │
└─────────────────────────────────────────┘
                    ↑
                    │ 实现
        ┌───────────┼───────────┬─────────┬──────────┐
        │           │           │         │          │
   ┌────┴────┐ ┌────┴────┐ ┌───┴───┐ ┌───┴───┐ ┌────┴────┐
   │Anthropic│ │ OpenAI  │ │Gemini │ │Costrict│ │ 其他... │
   │Provider │ │Provider │ │Provider│ │Provider│ │         │
   └─────────┘ └─────────┘ └───────┘ └───────┘ └─────────┘
```

### BaseProvider 基类

所有提供者的基类，提供通用功能。

```typescript
abstract class BaseProvider implements ApiHandler {
	// 抽象方法 - 必须由子类实现
	abstract createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream

	abstract getModel(): { id: string; info: ModelInfo }

	// 通用方法
	protected convertToolsForOpenAI(tools: any[]): any[] {
		// 转换工具格式以适配 OpenAI strict mode
	}

	protected convertToolSchemaForOpenAI(schema: any): any {
		// 转换工具 schema
	}

	async countTokens(content: ContentBlockParam[]): Promise<number> {
		// 默认使用 tiktoken 计算
	}
}
```

### Anthropic Provider

```typescript
class AnthropicProvider extends BaseProvider {
	private client: Anthropic

	constructor(options: ProviderSettings) {
		super()
		this.client = new Anthropic({
			apiKey: options.anthropicApiKey,
			baseURL: options.anthropicBaseUrl,
		})
	}

	async *createMessage(
		systemPrompt: string,
		messages: MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		const stream = this.client.messages.stream({
			model: this.getModel().id,
			max_tokens: metadata?.maxTokens || 8192,
			system: systemPrompt,
			messages,
			tools: metadata?.tools,
			stream: true,
		})

		for await (const chunk of stream) {
			if (chunk.type === "content_block_delta") {
				yield {
					type: "text",
					text: chunk.delta.text,
				}
			} else if (chunk.type === "message_stop") {
				yield { type: "finish" }
			}
		}
	}

	getModel() {
		return {
			id: "claude-3-5-sonnet-20241022",
			info: {
				maxTokens: 8192,
				contextWindow: 200000,
				supportsImages: true,
				supportsPromptCache: true,
			},
		}
	}
}
```

### OpenAI Provider

```typescript
class OpenAIProvider extends BaseProvider {
	private client: OpenAI

	async *createMessage(
		systemPrompt: string,
		messages: MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata,
	): ApiStream {
		// 转换消息格式
		const openaiMessages = this.convertToOpenAIFormat(messages, systemPrompt)

		const stream = await this.client.chat.completions.create({
			model: this.getModel().id,
			messages: openaiMessages,
			tools: this.convertToolsForOpenAI(metadata?.tools),
			stream: true,
		})

		for await (const chunk of stream) {
			const delta = chunk.choices[0]?.delta
			if (delta?.content) {
				yield { type: "text", text: delta.content }
			} else if (delta?.tool_calls) {
				yield { type: "tool_use", toolUse: delta.tool_calls[0] }
			} else if (chunk.choices[0]?.finish_reason) {
				yield { type: "finish" }
			}
		}
	}
}
```

### 消息格式转换

不同提供商使用不同的消息格式，系统通过转换器进行适配。

```typescript
// Anthropic 格式
{
  role: "user",
  content: [
    { type: "text", text: "Hello" },
    { type: "image", source: { ... } }
  ]
}

// OpenAI 格式
{
  role: "user",
  content: [
    { type: "text", text: "Hello" },
    { type: "image_url", image_url: { url: "..." } }
  ]
}

// Gemini 格式
{
  role: "user",
  parts: [
    { text: "Hello" },
    { inline_data: { mime_type: "image/png", data: "..." } }
  ]
}
```

### 支持的提供商

| 提供商        | 类名                   | 模型示例           |
| ------------- | ---------------------- | ------------------ |
| Anthropic     | `AnthropicProvider`    | Claude 3.5 Sonnet  |
| OpenAI        | `OpenAIProvider`       | GPT-4, GPT-4o      |
| Google Gemini | `GeminiProvider`       | Gemini 1.5 Pro     |
| Costrict      | `CostrictProvider`     | Costrict 自有模型  |
| AWS Bedrock   | `BedrockProvider`      | Claude via Bedrock |
| Azure OpenAI  | `OpenAINativeProvider` | Azure GPT-4        |
| OpenRouter    | `OpenRouterProvider`   | 多模型路由         |
| DeepSeek      | `DeepSeekProvider`     | DeepSeek Coder     |
| Mistral       | `MistralProvider`      | Mistral Large      |
| xAI           | `XAIProvider`          | Grok               |
| Ollama        | `OllamaProvider`       | 本地模型           |
| LM Studio     | `LMStudioProvider`     | 本地模型           |

---

## 工具系统

### 架构概述

工具系统采用面向对象的设计，所有工具继承自 `BaseTool` 基类。

```typescript
abstract class BaseTool<TName extends ToolName> {
	abstract readonly name: TName

	abstract execute(params: ToolParams<TName>, task: Task, callbacks: ToolCallbacks): Promise<void>

	async handlePartial(task: Task, block: ToolUse<TName>): Promise<void> {
		// 处理流式部分消息
	}

	protected hasPathStabilized(path: string): boolean {
		// 检查路径是否稳定（用于流式解析）
	}
}
```

### 工具分类

#### 1. 文件操作工具

| 工具                         | 类名              | 功能                 |
| ---------------------------- | ----------------- | -------------------- |
| `read_file`                  | `ReadFileTool`    | 读取文件内容         |
| `write_to_file`              | `WriteToFileTool` | 写入文件             |
| `edit_file`                  | `EditFileTool`    | 编辑文件（搜索替换） |
| `apply_diff`                 | `ApplyDiffTool`   | 应用 diff 变更       |
| `apply_patch`                | `ApplyPatchTool`  | 应用 patch 文件      |
| `list_files`                 | `ListFilesTool`   | 列出目录文件         |
| `list_code_definition_names` | `FileOutlineTool` | 获取代码结构         |

**ReadFileTool 示例：**

```typescript
class ReadFileTool extends BaseTool<"read_file"> {
	readonly name = "read_file"

	async execute(
		params: { path: string; startLine?: number; endLine?: number },
		task: Task,
		callbacks: ToolCallbacks,
	) {
		const { askApproval, handleError, pushToolResult } = callbacks

		// 1. 请求用户批准
		const approved = await askApproval("read_file", params)
		if (!approved) return

		try {
			// 2. 读取文件
			const content = await fs.readFile(params.path, "utf-8")

			// 3. 处理行号范围
			const lines = content.split("\n")
			const start = params.startLine || 0
			const end = params.endLine || lines.length
			const selectedLines = lines.slice(start, end)

			// 4. 返回结果
			pushToolResult(selectedLines.join("\n"))
		} catch (error) {
			handleError(error)
		}
	}
}
```

#### 2. 搜索工具

| 工具           | 类名              | 功能             |
| -------------- | ----------------- | ---------------- |
| `search_files` | `SearchFilesTool` | 正则搜索文件内容 |
| `file_search`  | `FileSearchTool`  | 按文件名搜索     |

**SearchFilesTool 示例：**

```typescript
class SearchFilesTool extends BaseTool<"search_files"> {
	readonly name = "search_files"

	async execute(params: { path: string; regex: string; filePattern?: string }, task: Task, callbacks: ToolCallbacks) {
		const { askApproval, handleError, pushToolResult } = callbacks

		const approved = await askApproval("search_files", params)
		if (!approved) return

		try {
			// 使用 ripgrep 进行搜索
			const results = await ripgrepSearch(params.path, params.regex, params.filePattern)

			pushToolResult(results)
		} catch (error) {
			handleError(error)
		}
	}
}
```

#### 3. 命令执行工具

| 工具              | 类名                 | 功能         |
| ----------------- | -------------------- | ------------ |
| `execute_command` | `ExecuteCommandTool` | 执行终端命令 |

**ExecuteCommandTool 示例：**

```typescript
class ExecuteCommandTool extends BaseTool<"execute_command"> {
	readonly name = "execute_command"

	async execute(params: { command: string; requiresApproval?: boolean }, task: Task, callbacks: ToolCallbacks) {
		const { askApproval, handleError, pushToolResult } = callbacks

		// 1. 检查是否需要批准
		if (params.requiresApproval !== false) {
			const approved = await askApproval("execute_command", params)
			if (!approved) return
		}

		try {
			// 2. 执行命令
			const terminal = await TerminalRegistry.getTerminal()
			const result = await terminal.executeCommand(params.command)

			// 3. 返回结果
			pushToolResult(result.output)
		} catch (error) {
			handleError(error)
		}
	}
}
```

#### 4. MCP 工具

| 工具                  | 类名                    | 功能          |
| --------------------- | ----------------------- | ------------- |
| `use_mcp_tool`        | `UseMcpToolTool`        | 调用 MCP 工具 |
| `access_mcp_resource` | `AccessMcpResourceTool` | 访问 MCP 资源 |

**UseMcpToolTool 示例：**

```typescript
class UseMcpToolTool extends BaseTool<"use_mcp_tool"> {
	readonly name = "use_mcp_tool"

	async execute(
		params: { serverName: string; toolName: string; arguments: any },
		task: Task,
		callbacks: ToolCallbacks,
	) {
		const { askApproval, handleError, pushToolResult } = callbacks

		const approved = await askApproval("use_mcp_tool", params)
		if (!approved) return

		try {
			// 通过 McpHub 调用 MCP 工具
			const mcpHub = McpHub.getInstance()
			const result = await mcpHub.callTool(params.serverName, params.toolName, params.arguments)

			pushToolResult(result)
		} catch (error) {
			handleError(error)
		}
	}
}
```

#### 5. 任务管理工具

| 工具                 | 类名                    | 功能       |
| -------------------- | ----------------------- | ---------- |
| `attempt_completion` | `AttemptCompletionTool` | 完成任务   |
| `new_task`           | `NewTaskTool`           | 创建新任务 |
| `switch_mode`        | `SwitchModeTool`        | 切换模式   |

#### 6. 技能工具

| 工具        | 类名        | 功能     |
| ----------- | ----------- | -------- |
| `use_skill` | `SkillTool` | 使用技能 |

### 工具执行流程

```
1. AI 返回工具调用请求
   ↓
2. Task.presentAssistantMessage() 解析工具调用
   ↓
3. 检查自动审批规则 (AutoApprovalHandler)
   ↓
4. 如需要，请求用户批准 (askApproval)
   ↓
5. 执行工具 (tool.execute)
   ↓
6. 返回结果给 AI (pushToolResult)
   ↓
7. 继续对话循环
```

---

## 服务层

### 1. MCP 服务 (McpHub.ts)

MCP (Model Context Protocol) 服务负责管理与外部 MCP 服务器的连接和通信。

**核心职责：**

- 管理 MCP 服务器连接
- 处理工具调用
- 管理资源访问
- 处理服务器生命周期

```typescript
class McpHub {
	private static instance: McpHub
	private connections: Map<string, McpConnection>

	static getInstance(): McpHub

	async initialize(config: McpConfig): Promise<void>

	async connectToServer(serverConfig: McpServerConfig): Promise<void>

	async callTool(serverName: string, toolName: string, args: any): Promise<any>

	async accessResource(serverName: string, resourceUri: string): Promise<any>

	async listTools(serverName: string): Promise<McpTool[]>

	async listResources(serverName: string): Promise<McpResource[]>

	async disconnect(serverName: string): Promise<void>

	async cleanup(): Promise<void>
}
```

**MCP 配置示例：**

```json
{
	"mcpServers": {
		"filesystem": {
			"command": "npx",
			"args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
		},
		"github": {
			"command": "npx",
			"args": ["-y", "@modelcontextprotocol/server-github"],
			"env": {
				"GITHUB_TOKEN": "xxx"
			}
		}
	}
}
```

### 2. 检查点服务 (checkpoints/)

检查点服务负责保存和恢复工作区状态，支持任务回滚。

**核心类：ShadowCheckpointService**

```typescript
class ShadowCheckpointService {
	// 保存检查点
	async saveCheckpoint(taskId: string, workspacePath: string): Promise<CheckpointId>

	// 恢复检查点
	async restoreCheckpoint(taskId: string, checkpointId: CheckpointId): Promise<void>

	// 列出检查点
	async listCheckpoints(taskId: string): Promise<Checkpoint[]>

	// 删除检查点
	async deleteCheckpoint(taskId: string, checkpointId: CheckpointId): Promise<void>
}
```

**检查点流程：**

```
任务开始 → 创建初始检查点 → 执行操作 → 保存检查点 → ... → 回滚时恢复检查点
```

### 3. 代码索引服务 (code-index/)

代码索引服务负责为仓库建立索引，支持语义搜索。

**核心类：CodeIndexManager**

```typescript
class CodeIndexManager {
	private static instances: Map<string, CodeIndexManager>

	static getInstance(context: ExtensionContext, workspacePath: string): CodeIndexManager

	async initialize(config: ContextProxy): Promise<void>

	// 索引文件
	async indexFile(filePath: string): Promise<void>

	// 语义搜索
	async semanticSearch(query: string, limit?: number): Promise<SearchResult[]>

	// 获取相关代码
	async getRelevantCode(query: string, context: number): Promise<string>

	// 重建索引
	async rebuildIndex(): Promise<void>

	// 清理
	async dispose(): Promise<void>
}
```

### 4. 搜索服务 (search/)

搜索服务提供文件和内容搜索功能。

**file-search.ts**

```typescript
class FileSearchService {
	// 按文件名搜索
	async searchByFilename(workspacePath: string, pattern: string, options?: SearchOptions): Promise<string[]>

	// 按内容搜索
	async searchByContent(workspacePath: string, regex: string, filePattern?: string): Promise<SearchResult[]>

	// 模糊搜索
	async fuzzySearch(workspacePath: string, query: string): Promise<string[]>
}
```

### 5. 终端服务 (terminal/)

终端服务管理与 VS Code 终端的集成。

**TerminalRegistry**

```typescript
class TerminalRegistry {
	private static terminals: Map<number, Terminal>

	static initialize(): void

	static getTerminal(): Promise<Terminal>

	static createTerminal(): Terminal

	static getTerminalById(id: number): Terminal | undefined

	static cleanup(): void
}

class Terminal {
	readonly id: number
	private terminal: vscode.Terminal

	async executeCommand(command: string): Promise<CommandResult>

	async waitForCompletion(): Promise<void>

	dispose(): void
}
```

### 6. 文件列表服务 (glob/)

文件列表服务负责递归遍历目录并过滤文件。

**list-files.ts**

```typescript
async function listFiles(dirPath: string, options?: ListFilesOptions): Promise<string[]>

interface ListFilesOptions {
	recursive?: boolean
	maxDepth?: number
	ignorePatterns?: string[]
	respectGitignore?: boolean
	filePattern?: string
}
```

---

## 共享包

### 1. @roo-code/types

类型定义包，包含所有共享类型。

**主要类型文件：**

| 文件           | 内容                                           |
| -------------- | ---------------------------------------------- |
| `api.ts`       | API 相关类型（ProviderSettings, ModelInfo 等） |
| `task.ts`      | 任务相关类型（Task, ClineMessage 等）          |
| `tool.ts`      | 工具相关类型（ToolName, ToolUse 等）           |
| `mcp.ts`       | MCP 相关类型（McpConfig, McpServer 等）        |
| `cloud.ts`     | 云服务相关类型                                 |
| `ipc.ts`       | IPC 通信类型                                   |
| `telemetry.ts` | 遥测类型                                       |
| `mode.ts`      | 模式相关类型                                   |
| `skills.ts`    | 技能相关类型                                   |

**关键类型示例：**

```typescript
// API 提供者设置
interface ProviderSettings {
	anthropicApiKey?: string
	openaiApiKey?: string
	geminiApiKey?: string
	// ...
}

// 模型信息
interface ModelInfo {
	maxTokens: number
	contextWindow: number
	supportsImages: boolean
	supportsPromptCache: boolean
	inputPrice?: number
	outputPrice?: number
}

// 任务消息
type ClineMessage = {
	ts: number
	type: "say" | "ask" | "completion"
	say?: ClineSay
	ask?: ClineAsk
	text?: string
	images?: string[]
}

// 工具使用
interface ToolUse<TName extends ToolName> {
	tool: TName
	params: ToolParams<TName>
	nativeArgs?: NativeToolArgs[TName]
}
```

### 2. @roo-code/cloud

云服务包，处理与云服务的交互。

**核心类：**

```typescript
class CloudService {
	private static instance: CloudService

	static getInstance(): CloudService

	// 认证
	async login(credentials: Credentials): Promise<AuthResult>
	async logout(): Promise<void>
	async getAuthState(): AuthState

	// API 调用
	async callAPI(endpoint: string, options?: RequestOptions): Promise<any>

	// 事件
	on(event: "auth-state-changed", handler: AuthStateHandler): void
	on(event: "settings-updated", handler: SettingsHandler): void
	on(event: "user-info", handler: UserInfoHandler): void
}

class CloudAPI {
	// 基础 API 调用
	async request<T>(endpoint: string, options?: RequestOptions): Promise<T>

	// 认证相关
	async refreshToken(): Promise<string>
	async validateToken(): Promise<boolean>
}
```

### 3. @roo-code/ipc

IPC 通信包，支持进程间通信。

**核心类：**

```typescript
class IpcClient {
	private socketPath: string

	constructor(socketPath: string)

	async connect(): Promise<void>

	async send(message: IpcMessage): Promise<void>

	onMessage(handler: (message: IpcMessage) => void): void

	async disconnect(): Promise<void>
}

class IpcServer {
	private server: net.Server

	constructor(socketPath: string)

	async start(): Promise<void>

	onConnection(handler: (client: IpcClient) => void): void

	async stop(): Promise<void>
}
```

### 4. @roo-code/telemetry

遥测包，处理数据收集和发送。

**核心类：**

```typescript
class TelemetryService {
	private static instance: TelemetryService
	private clients: TelemetryClient[]

	static createInstance(): TelemetryService

	static get instance(): TelemetryService

	// 注册客户端
	register(client: TelemetryClient): void

	// 记录事件
	async capture(event: TelemetryEvent): Promise<void>

	// 记录属性
	async identify(properties: TelemetryProperties): Promise<void>

	// 关闭
	async shutdown(): Promise<void>
}

interface TelemetryClient {
	capture(event: TelemetryEvent): Promise<void>
	identify(properties: TelemetryProperties): Promise<void>
	shutdown(): Promise<void>
}
```

### 5. @roo-code/core

核心工具包，提供共享功能。

**主要导出：**

```typescript
// 自定义工具注册
export class CustomToolRegistry {
	private tools: Map<string, CustomTool>

	setExtensionPath(path: string): void

	registerTool(tool: CustomTool): void

	getTool(name: string): CustomTool | undefined

	listTools(): CustomTool[]
}

// 工作区工具
export function getWorkspacePath(): string
export function resolveRelativePath(path: string): string

// 任务历史
export function loadTaskHistory(): HistoryItem[]
export function saveTaskHistory(history: HistoryItem[]): void
```

### 6. @roo-code/build

构建工具包，提供构建相关功能。

**主要功能：**

```typescript
// esbuild 配置
export function createEsbuildConfig(options: BuildOptions): esbuild.BuildOptions

// Git 信息
export function getGitInfo(): GitInfo
export function getCommitHash(): string

// 类型定义
export interface BuildOptions {
	entryPoints: string[]
	outfile: string
	platform: "node" | "browser"
	external?: string[]
}
```

---

## 构建与运行

### 环境要求

- **Node.js**: >= 20.19.2
- **pnpm**: 10.8.1
- **VS Code**: >= 1.93.1（开发时）

### 安装依赖

```bash
# 安装所有依赖
pnpm install

# 或运行 bootstrap 脚本
pnpm run install:all
```

### 开发命令

```bash
# 启动开发模式（监听文件变化）
pnpm run watch

# 构建所有包
pnpm run build

# 运行测试
pnpm run test

# 代码检查
pnpm run lint

# 类型检查
pnpm run check-types

# 格式化代码
pnpm run format

# 清理构建产物
pnpm run clean
```

### 构建扩展

```bash
# 构建 VSIX 包
pnpm run vsix

# 构建 Nightly 版本
pnpm run vsix:nightly

# 安装到 VS Code
pnpm run install:vsix
```

### 运行扩展

1. **在 VS Code 中调试**
    - 打开项目
    - 按 F5 启动扩展开发宿主
    - 在新窗口中测试扩展

2. **使用 CLI**

    ```bash
    cd apps/cli
    pnpm run dev
    ```

3. **运行 Web 应用**

    ```bash
    # 评估应用
    cd apps/web-evals
    pnpm run dev

    # Roo Code 网站
    cd apps/web-roo-code
    pnpm run dev
    ```

### 测试

```bash
# 运行所有测试
pnpm run test

# 运行特定包的测试
pnpm --filter @roo-code/types test

# 运行 E2E 测试
cd apps/vscode-e2e
pnpm run test
```

### 发布

```bash
# 创建版本
pnpm run changeset:version

# 发布到 npm
pnpm run npm:publish:types

# 发布到 VS Code Marketplace
pnpm run vsix
# 然后手动上传到 Marketplace
```

---

## 开发指南

### 添加新的 API 提供者

1. **创建提供者类**

```typescript
// src/api/providers/my-provider.ts
import { BaseProvider } from "./base-provider"
import type { ModelInfo } from "@roo-code/types"

export class MyProvider extends BaseProvider {
	async *createMessage(systemPrompt, messages, metadata) {
		// 实现消息创建逻辑
		yield { type: "text", text: "response" }
	}

	getModel(): { id: string; info: ModelInfo } {
		return {
			id: "my-model",
			info: {
				maxTokens: 4096,
				contextWindow: 8192,
				supportsImages: false,
				supportsPromptCache: false,
			},
		}
	}
}
```

2. **注册提供者**

```typescript
// src/api/providers/index.ts
export * from "./my-provider"

// src/api/index.ts
import { MyProvider } from "./providers/my-provider"

export function buildApiHandler(settings: ProviderSettings): ApiHandler {
	if (settings.apiProvider === "my-provider") {
		return new MyProvider(settings)
	}
	// ...
}
```

3. **添加类型定义**

```typescript
// packages/types/src/api.ts
export type ApiProvider = "anthropic" | "openai" | "my-provider" | ...

export interface ProviderSettings {
  myProviderApiKey?: string
  myProviderBaseUrl?: string
}
```

### 添加新的工具

1. **创建工具类**

```typescript
// src/core/tools/MyTool.ts
import { BaseTool } from "./BaseTool"
import type { ToolName } from "@roo-code/types"

export class MyTool extends BaseTool<"my_tool"> {
	readonly name = "my_tool" as const

	async execute(params, task, callbacks) {
		const { askApproval, handleError, pushToolResult } = callbacks

		const approved = await askApproval("my_tool", params)
		if (!approved) return

		try {
			// 实现工具逻辑
			const result = await this.doSomething(params)
			pushToolResult(result)
		} catch (error) {
			handleError(error)
		}
	}
}
```

2. **注册工具**

```typescript
// src/core/tools/index.ts
export * from "./MyTool"

// src/core/task/build-tools.ts
import { MyTool } from "./MyTool"

export function buildTools(): BaseTool[] {
	return [
		new MyTool(),
		// ...
	]
}
```

3. **添加工具类型**

```typescript
// packages/types/src/tool.ts
export type ToolName = "read_file" | "write_to_file" | "my_tool" | ...

// packages/types/src/tool-params.ts
export interface NativeToolArgs {
  my_tool: {
    param1: string
    param2?: number
  }
}
```

### 添加新的 MCP 服务器

1. **配置 MCP 服务器**

```json
// .roomodes 或用户设置
{
	"mcpServers": {
		"my-server": {
			"command": "npx",
			"args": ["-y", "@my/mcp-server"],
			"env": {
				"API_KEY": "xxx"
			}
		}
	}
}
```

2. **使用 MCP 工具**

AI 会自动发现可用的 MCP 工具并通过 `use_mcp_tool` 调用。

### 自定义模式

1. **定义模式**

```typescript
// src/shared/modes.ts
export const customModes: Mode[] = [
	{
		slug: "my-mode",
		name: "My Mode",
		roleDefinition: "You are a specialized assistant for...",
		customInstructions: "Always do X when...",
		groups: ["read", ["edit", { fileRegex: "\\.ts$" }]],
	},
]
```

2. **注册模式**

```typescript
// 在 ContextProxy 中保存
await contextProxy.set("customModes", customModes)
```

### 国际化

1. **添加翻译键**

```json
// src/i18n/locales/en/common.json
{
  "myFeature": {
    "title": "My Feature",
    "description": "This is my feature"
  }
}

// src/i18n/locales/zh-CN/common.json
{
  "myFeature": {
    "title": "我的功能",
    "description": "这是我的功能"
  }
}
```

2. **使用翻译**

```typescript
import { t } from "../../i18n"

const title = t("myFeature.title")
```

### 调试技巧

1. **启用调试日志**

```typescript
// 在 extension.ts 中
outputChannel.appendLine("Debug message")
```

2. **使用 VS Code 调试器**

```json
// .vscode/launch.json
{
	"version": "0.2.0",
	"configurations": [
		{
			"name": "Run Extension",
			"type": "extensionHost",
			"request": "launch",
			"args": ["--extensionDevelopmentPath=${workspaceFolder}"],
			"outFiles": ["${workspaceFolder}/dist/**/*.js"]
		}
	]
}
```

3. **查看 Webview 控制台**

- 在 Webview 中按 Ctrl+Shift+I 打开开发者工具
- 查看 Console 和 Network 标签

---

## 附录

### 关键文件索引

| 文件                                 | 用途         |
| ------------------------------------ | ------------ |
| `src/extension.ts`                   | 扩展入口     |
| `src/core/task/Task.ts`              | 任务系统核心 |
| `src/core/webview/ClineProvider.ts`  | Webview 通信 |
| `src/core/config/ContextProxy.ts`    | 配置管理     |
| `src/api/providers/base-provider.ts` | API 基类     |
| `src/core/tools/BaseTool.ts`         | 工具基类     |
| `src/services/mcp/McpHub.ts`         | MCP 服务     |
| `packages/types/src/index.ts`        | 类型定义入口 |

### 常用命令速查

```bash
# 开发
pnpm install          # 安装依赖
pnpm run watch        # 开发模式
pnpm run build        # 构建
pnpm run test         # 测试

# 扩展
pnpm run vsix         # 打包扩展
pnpm run install:vsix # 安装扩展

# 代码质量
pnpm run lint         # 代码检查
pnpm run format       # 格式化
pnpm run check-types  # 类型检查

# 清理
pnpm run clean        # 清理构建产物
```

### 相关资源

- **官方文档**: https://docs.costrict.ai
- **GitHub**: https://github.com/zgsm-ai/costrict
- **VS Code Marketplace**: https://marketplace.visualstudio.com/items?itemName=zgsm-ai.zgsm
- **问题反馈**: https://github.com/zgsm-ai/costrict/issues

---

_本文档基于项目源码分析生成，最后更新时间：2026-08-15_
