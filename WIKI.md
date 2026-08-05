# ssdAgent �ֿ� Wiki

> ��ҵ���࿪���� AI ���ܻ�� �� VS Code ��չ

---

## Ŀ¼

1. [��Ŀ����](#��Ŀ����)
2. [����ջ](#����ջ)
3. [Monorepo �ܹ�](#monorepo-�ܹ�)
4. [Ŀ¼�ṹ](#Ŀ¼�ṹ)
5. [����ģ�����](#����ģ�����)
6. [����ϵͳ](#����ϵͳ)
7. [��������](#��������)
8. [���ʻ� (i18n)](#���ʻ�-i18n)
9. [����](#����)
10. [Git ������](#git-������)
11. [���������ٲ�](#���������ٲ�)
12. [�ؼ��ļ�����](#�ؼ��ļ�����)

---

## ��Ŀ����

**ssdAgent**��ԭ�� CoStrict����һ�� VS Code AI ���������չ���ṩ��

- **AI �Ի�ʽ���**��ͨ����������� LLM ��������ɴ������ɡ��޸ġ���������
- **��ģʽ����**��Vibe����Χ��̣���Plan���ƻ��ƶ�����Spec������������ơ������⣩
- **�� LLM �ṩ��֧��**��Anthropic��OpenAI��Google Gemini��Ollama��LM Studio �� 30+ �ṩ��
- **MCP Э��֧��**��Model Context Protocol ���߼���
- **�������**��AI �����Ĵ������Ͱ�ȫ���
- **���ܲ�ȫ**���������벹ȫ
- **������**��֧�����ģ�����/���壩��Ӣ��

### ������Ϣ

| ��Ŀ           | ֵ                                 |
| ------------- | --------------------------------- |
| ��չ����       | `sdd`                             |
| ������        | `dmt`                             |
| �汾           | `1.0.0`                           |
| VS Code ��Ͱ汾 | `^1.93.1`                         |
| Node.js ��Ͱ汾 | `>=20.19.2`                       |
| ��������      | `pnpm@10.8.1`                     |
| �ֿ�           | `https://github.com/dmt/ssdAgent` |

---

## ����ջ

### ��ˣ�Extension Host��

| ����                          | �汾     | ��;                                                 |
| ----------------------------- | ------- | --------------------------------------------------- |
| **TypeScript**                | 5.8.3   | ��Ҫ��������                                         |
| **esbuild**                   | 0.25.0  | ��� bundler���������������������� `extension.js`    |
| **@anthropic-ai/sdk**         | ^0.37.0 | Anthropic API �ͻ���                                 |
| **openai**                    | ^5.12.2 | OpenAI API �ͻ���                                    |
| **@modelcontextprotocol/sdk** | ^1.13.3 | MCP Э�� SDK                                         |
| **@ai-sdk/\***                | ���     | Vercel AI SDK �ṩ�̣�Google��Mistral��xAI��Bedrock �ȣ� |
| **i18next**                   | ^25.0.0 | ���ʻ����                                            |
| **zod**                       | 3.25.76 | ������֤�����Ͱ�ȫ                                     |
| **axios**                     | ^1.12.0 | HTTP ����                                           |
| **tiktoken**                  | ^1.0.21 | Token ����                                          |
| **tree-sitter-wasms**         | ^0.1.12 | �����﷨����                                          |
| **simple-git**                | ^3.27.0 | Git ����                                            |
| **@qdrant/js-client-rest**    | ^1.14.0 | �������ݿ⣨����������                                 |
| **ollama**                    | ^0.5.17 | Ollama ����ģ��                                      |
| **@lmstudio/sdk**             | ^1.1.1  | LM Studio ����                                      |
| **workerpool**                | ^9.2.0  | �����̳߳�                                             |
| **@node-ipc/node-ipc**        | 11.0.3  | ���̼�ͨ��                                              |

### ǰ�ˣ�Webview UI��

| ����                        | �汾               | ��;            |
| --------------------------- | ----------------- | -------------- |
| **React**                   | ^18.3.1           | UI ���         |
| **Vite**                    | 6.3.6             | ��������       |
| **Tailwind CSS**            | ^4.0.0            | CSS ���        |
| **i18next + react-i18next** | ^25.0.0 / ^15.4.1 | ���ʻ�          |
| **@radix-ui/react-\***      | ���               | ���ϰ� UI ����� |
| **@tanstack/react-query**   | ^5.68.0           | ���ݻ�ȡ�ͻ���    |
| **react-markdown**          | ^9.0.3            | Markdown ��Ⱦ   |
| **shiki**                   | ^3.2.1            | �����﷨����     |
| **mermaid**                 | ^11.4.1           | ͼ����Ⱦ         |
| **lucide-react**            | ^0.518.0          | ͼ���           |
| **katex**                   | ^0.16.11          | ��ѧ��ʽ��Ⱦ      |
| **cmdk**                    | ^1.0.0            | �������        |
| **react-virtuoso**          | ^4.14.1           | �����б�        |
| **zod**                     | ^3.25.61          | ������֤        |

### ��������

| ����                | ��;                  |
| ------------------- | -------------------- |
| **Turbo**           | Monorepo ������źͻ��� |
| **ESLint**          | ������               |
| **Prettier**        | �����ʽ��             |
| **Vitest**          | ���Կ��               |
| **Husky**           | Git Hooks ����       |
| **lint-staged**     | �ݴ��ļ����            |
| **@vscode/vsce**    | VS Code ��չ���       |
| **ovsx**            | Open VSX ����        |
| **@changesets/cli** | �汾������ CHANGELOG  |

---

## Monorepo �ܹ�

### ����������

```
costrict-main/
������ src/                    # VS Code ��չ���壨Extension Host��
���� webview-ui/             # Webview ǰ�� UI��React + Vite��
������ apps/                   # Ӧ�ã����У�
������ packages/               # ������
��   ������ types/              # ���Ͷ��壨@roo-code/types��
��   ������ core/               # �����߼���@roo-code/core��
��   ������ cloud/              # �Ʒ���@roo-code/cloud��
��   ������ ipc/                # ���̼�ͨ�ţ�@roo-code/ipc��
��   ������ logger/             # ��־��@roo-code/logger��
��   ������ telemetry/          # ң�⣨@roo-code/telemetry��
��   ������ build/              # �������ߣ�@roo-code/build��
��   ������ config-eslint/      # ESLint ����
��   ������ config-typescript/  # TypeScript ����
��   ������ vscode-shim/        # VS Code API shim
��   ������ evals/              # ��������
������ scripts/                # �����ͷ����ű�
������ patches/                # pnpm patches
������ .husky/                 # Git Hooks
������ turbo.json              # Turbo ����
������ pnpm-workspace.yaml     # ����������
������ package.json            # �� package.json
```

### ��������ϵ

```
src (sdd)
������ @roo-code/types        �� ���Ͷ���
������ @roo-code/core         �� �����߼�������ע��ȣ�
������ @roo-code/cloud        �� �Ʒ��񼯳�
������ @roo-code/ipc          �� ���̼�ͨ��
������ @roo-code/logger       �� ��־
������ @roo-code/telemetry    �� ң��
������ webview-ui             �� ǰ�� UI��ͨ�� dist ���룩

webview-ui (@roo-code/vscode-webview)
������ @roo-code/types        �� ���Ͷ���
���� ����ǰ������

packages/types (@roo-code/types)
������ �����Ͷ��壬������ʱ����
```

---

## Ŀ¼�ṹ

### `src/` �� Extension Host

```
src/
������ extension.ts              # ��չ�������
������ esbuild.mjs               # esbuild �������
������ package.json              # ��չ���ã�commands, views, keybindings �ȣ�
������ package.nls*.json         # ���ʻ��ַ���
��
������ api/                      # LLM API ��
��   ������ index.ts              # API ��ڣ��ṩ�̹���
��   ������ providers/            # �� LLM �ṩ��ʵ��
��   ��   ������ anthropic.ts      # Anthropic Claude
��   ��   ������ openai.ts         # OpenAI
��   ��   ������ costrict.ts       # CoStrict ���� API
��   ��   ������ bedrock.ts        # AWS Bedrock
��   ��   ������ gemini.ts         # Google Gemini
��   ��   ������ openrouter.ts     # OpenRouter
��   ��   ������ ollama.ts         # Ollama ����
��   ��   ������ lm-studio.ts      # LM Studio
��   ��   ������ mistral.ts        # Mistral
��   ��   ������ xai.ts            # xAI (Grok)
��   ��   ������ deepseek.ts       # DeepSeek
��   ��   ������ vscode-lm.ts      # VS Code Language Model API
��   ��   ������ claude-code.ts    # Claude Code CLI
��   ��   ������ openai-codex.ts   # OpenAI Codex
��   ��   ���� ...               # 30+ �ṩ��
��   ������ transform/            # ��Ϣת��
��
������ core/                     # ����ҵ���߼�
��   ������ task/
��   ��   ������ Task.ts           # ���������ࣨ209KB������ļ���
��   ������ tools/                # AI ����ʵ��
��   ��   ������ EditTool.ts       # �༭�ļ�
��   ��   ������ ReadFileTool.ts   # ��ȡ�ļ�
��   ��   ������ WriteToFileTool.ts # д���ļ�
��   ��   ������ ExecuteCommandTool.ts # ִ������
��   ��   ������ ApplyPatchTool.ts # Ӧ�ò���
��   ��   ������ SearchFilesTool.ts # �����ļ�
��   ��   ������ UseMcpToolTool.ts # MCP ���ߵ���
��   ��   ������ ...               # 30+ ����
��   ������ webview/
��   ��   ���� ClineProvider.ts  # Webview ͨ�ź���
��   ������ config/               # ���ù���
��   ������ context/              # �����Ĺ���
��   ������ context-management/   # �����Ĵ��ڹ���
��   ������ prompts/              # ϵͳ��ʾ��
��   ������ costrict/             # CoStrict ���й���
��   ��   ������ auth/             # ��֤
��   ��   ������ auto-complete/    # ���ܲ�ȫ
��   ��   ������ code-review/      # �������
��   ��   ������ commit/           # �ύ��Ϣ����
��   ��   ���� workflow/         # ������
��   ������ cs-cloud/             # Cloud UI ģʽ
��   ������ diff/                 # Diff ����
��   ������ ignore/               # �ļ�����
��   ������ mentions/             # @�ἰ����
��   ������ message-manager/      # ��Ϣ����
��   ���� checkpoints/          # ����/����
��
������ services/                 # �����
��   ������ mcp/                  # MCP ����������
��   ������ code-index/           # ��������������������
��   ������ tree-sitter/          # �﷨������
��   ������ ripgrep/              # �ļ�����
��   ������ skills/               # Skills ����
��   ������ marketplace/          # ��չ�г�
��   ������ search/               # ��������
��   ������ checkpoints/          # �������
��
������ integrations/             # �ⲿ����
��   ������ editor/               # �༭�����ɣ�Diff View �ȣ�
��   ������ terminal/             # �ն˼���
��   ������ claude-code/          # Claude Code ����
��   ������ openai-codex/         # OpenAI Codex ����
��   ������ diagnostics/          # ��ϼ���
��   ������ workspace/            # ����������
��
���� shared/                   # ��������
��   ������ modes.ts              # ����ģʽ����
��   ������ package.ts            # ����Ϣ
��   ������ language.ts           # ���Դ���
��
������ i18n/                     # ��˹��ʻ�
��   ������ setup.ts              # i18n ��ʼ��
��   ������ locales/              # �����ļ�
��
������ assets/                   # ��̬��Դ
    ������ images/               # ͼ���ͼƬ
    ������ costrict/             # CoStrict ��Դ
    ������ codicons/             # VS Code ͼ��
    ���� vscode-material-icons/ # ����ͼ��
```

### `webview-ui/` �� ǰ�� UI

```
webview-ui/
������ index.html                # Webview HTML ���
������ vite.config.ts            # Vite ��������
������ tailwind.config.ts        # Tailwind ����
��
������ src/
��   ������ main.tsx              # React ���
��   ������ App.tsx               # ��Ӧ�����
��   ��
��   ������ components/
��   ��   ������ chat/             # �������
��   ��   ��   ������ ChatView.tsx  # ��������ͼ
��   ��   ��   ������ ChatRow.tsx   # ��Ϣ�����
��   ��   ��   ������ ChatInput.tsx # �����
��   ��   ��   ������ ...
��   ��   ������ settings/         # ���ý���
��   ��   ��   ������ SettingsView.tsx
��   ��   ������ welcome/          # ��ӭ����
��   ��   ��   ������ WelcomeViewProvider.tsx
��   ��   ������ marketplace/      # ��չ�г�
��   ��   ������ mcp/              # MCP ����
��   ��   ������ modes/            # ģʽѡ��
��   ��   ������ history/          # ��ʷ��¼
��   ��   ������ code-review/      # ������� UI
��   ��   ������ cloud/            # Cloud UI
��   ��   ������ worktrees/        # Git Worktrees
��   ��   ������ human-relay/      # �˹��м�
��   ��   ������ ui/               # ͨ�� UI ���
��   ��   ������ common/           # �������
��   ��
��   ������ i18n/                 # ǰ�˹��ʻ�
��   ��   ������ setup.ts          # i18n ��ʼ��
��   ��   ������ locales/          # �������ļ���en/zh-CN/zh-TW��
��   ��   ������ costrict-i18n/    # CoStrict ר�÷���
��   ��
��   ������ lib/                  # ���߿�
��   ������ hooks/                # React Hooks
��   ������ context/              # React Context
��   ������ services/             # ǰ�˷���
��   ������ utils/                # ���ߺ���
��   ��   ������ context-mentions.ts # @�ἰ����
��   ������ assets/               # ǰ�˾�̬��Դ
��       ������ logo.svg          # Ӧ��ͼ��
��
������ build/                    # ����������ɣ�
```

---

## ����ģ�����

### 1. ��չ��������

```
extension.ts activate()
    ������ ��ʼ�����Ƶ��
    ������ �޸� axios keepAlive
    ������ ע�� custom tool registry
    ������ Ǩ�����ã�migrateSettings��
    ������ ���� i18n
    ������ ��ʼ�� ContextProxy
    ������ ���� ClineProvider��Webview ���ģ�
    ������ ע����������
    ������ ��ʼ�� MCP Server Manager
    ���� ע�� CodeLens / Decorations
```

### 2. Webview ͨ�żܹ�

```
��������������������������������������         postMessage         ����������������������������������������
��  Extension Host  �� ?��������������������������������������������? ��   Webview UI     ��
��  (Node.js)       ��     VS Code Webview API   ��   (React)        ��
��                  ��                           ��                  ��
��  ClineProvider   ��                           ��  App.tsx         ��
��  Task            ��                           ��  ChatView.tsx    ��
��  API Providers   ��                           ��  SettingsView    ��
��������������������������������������                           ����������������������������������������
```

### 3. ����ִ�����̣�Task.ts��

```
�û����� �� ClineProvider �� Task
    ������ ���������б���build-tools.ts��
    ������ ������Ϣ�� LLM��API Provider��
    ������ �������ߵ���
    ������ ִ�й��ߣ�EditTool, ReadFileTool, ExecuteCommandTool �ȣ�
    ������ �������߽��
    ������ ѭ��ֱ���������
    ������ ���ؽ�����û�
```

### 4. API �ṩ�̼ܹ�

```
api/index.ts (API ����)
    ������ ���� apiProvider �ֶδ�����Ӧ�� Handler
        ������ AnthropicHandler      �� anthropic.ts
        ������ OpenAIHandler         �� openai.ts
        ������ CostrictHandler       �� costrict.ts
        ������ GeminiHandler         �� gemini.ts
        ������ BedrockHandler        �� bedrock.ts
        ������ OpenRouterHandler     �� openrouter.ts
        ������ OllamaHandler         �� native-ollama.ts
        ������ LMStudioHandler       �� lm-studio.ts
        ������ ... 30+ �ṩ��
```

### 5. ����ϵͳ��Tools��

| ����                      | ����          |
| ------------------------- | ------------- |
| `EditTool`                | ��ȷ�༭�ļ�����  |
| `ApplyPatchTool`          | Ӧ�� diff ���� |
| `ReadFileTool`            | ��ȡ�ļ�����    |
| `WriteToFileTool`         | д���ļ�        |
| `ExecuteCommandTool`      | ִ���ն�����    |
| `SearchFilesTool`         | �����ļ�       |
| `CodebaseSearchTool`      | ������������� |
| `UseMcpToolTool`          | ���� MCP ���� |
| `AskFollowupQuestionTool` | ���û�����     |
| `AttemptCompletionTool`   | �����������   |
| `UpdateTodoListTool`      | ���´����б�    |
| `SwitchModeTool`          | �л�����ģʽ     |
| `SequentialThinking`      | ˳��˼��        |
| `GenerateImageTool`       | ����ͼƬ        |
| `SkillTool`               | ���� Skills   |

### 6. ����ģʽ

| ģʽ       | ˵��                                                |
| -------- | -------------------------------------------------- |
| **Vibe** | ��Χ��̣����������������ɽ������                       |
| **Plan** | �����̣���ѭ���ƻ��ƶ����ֲ�ʵʩ������                     |
| **Spec** | �����̣���ѭ������������ơ��������������У�����޸������� |

---

## ����ϵͳ

### ����������

```
pnpm build
    ��
    ������ Turbo ����
    ��   ������ @roo-code/types#build    (tsup �������)
    ��   ������ @roo-code/vscode-webview#build  (Vite ����ǰ��)
    ��   ������ sdd#build                (esbuild �����չ)
    ��
    ������ ����
        ������ packages/types/dist/     (���Ͷ���)
        ������ src/webview-ui/build/    (ǰ�˲���)
        ������ src/dist/extension.js    (��չ���ļ���17MB)
```

### ������̣�VSIX��

```
pnpm vsix
    ��
    ������ scripts/generate-review-builtin.mjs  (���� review skill)
    ������ turbo bundle
    ��   ������ esbuild.mjs                      (��� extension.js)
    ��   ������ copyPaths: README, CHANGELOG, LICENSE
    ��   ������ copyPaths: 911 �� material icons
    ��   ������ copyWasms: tiktoken, tree-sitter (40+ WASM �ļ�)
    ��   ������ copyLocales: 21 + 18 �������ļ�
    ��   ������ copyFiles: Cloud UI (��ѡ)
    ��
    ������ vsce package --no-dependencies
        ������ bin/sdd-1.0.0.vsix (21.8 MB)
```

### �ؼ�����

| �ļ�                         | ����                                                      |
| --------------------------- | --------------------------------------------------------- |
| `turbo.json`                | ������š�������ԡ���������                                  |
| `src/esbuild.mjs`           | esbuild ������ã�external: vscode, esbuild, global-agent�� |
| `webview-ui/vite.config.ts` | Vite �������ã�chunkSizeWarningLimit: 2000��               |
| `pnpm-workspace.yaml`       | ���������塢�������ǡ�patches                               |

---

## ��������

### ����׼��

```bash
# 1. ��װ����
pnpm install

# 2. ��������ģʽ�������أ�
pnpm dev          # ���� Vite dev server
# ���� VS Code �а� F5 ��������
```

### ��������

```bash
# ����
pnpm build                    # ȫ������
pnpm bundle                   # ��������� review skill ���ɣ�
pnpm vsix                     # ���Ϊ VSIX ���Զ���װ

# ��������
pnpm lint                     # ESLint ���
pnpm check-types              # TypeScript ���ͼ��
pnpm format                   # Prettier ��ʽ��
pnpm test                     # ���в���

# ����
pnpm clean                    # ������������

# ������װ����
pnpm install:vsix             # ��װ���� �� ���� �� ��� �� ��װ�� VS Code
```

### ����

- **Extension Host**��VS Code �а� `F5`��ʹ�� `launch.json` ����
- **Webview UI**��`cd webview-ui && pnpm dev`��Vite dev server ������
- **���Ƶ��**��VS Code �в鿴 "ssdAgent" ���Ƶ��

---

## ���ʻ� (i18n)

### �ܹ�

```
i18n/
���� src/i18n/                 # ��ˣ�Extension Host��
��   ������ setup.ts              # i18next ��ʼ��
��   ������ locales/{lang}/       # �����ļ���JSON namespace��
��
������ webview-ui/src/i18n/      # ǰ�ˣ�Webview UI��
    ������ setup.ts              # i18next + react-i18next ��ʼ��
    ������ locales/{lang}/       # �������ļ�
    ��   ������ en/
    ��   ������ zh-CN/
    ��   ���� zh-TW/
    ������ costrict-i18n/locales/{lang}/  # CoStrict ר�÷���
```

### ֧������

| ���Դ��� | ����     |
| ------- | -------- |
| `en`    | Ӣ��      |
| `zh-CN` | �������� |
| `zh-TW` | �������� |

### ���������ռ�

�����ļ�������ģ���Ϊ��� namespace��

- `chat` �� �������
- `settings` �� ���ý���
- `welcome` �� ��ӭ����
- `common` �� ͨ���ı�
- `mcp` �� MCP ���
- `cloud` �� Cloud ���
- `account` �� �˻����
- `worktrees` �� Git Worktrees

### ʹ�÷�ʽ

```typescript
// ���
import { t } from "../i18n"
t("chat:text.rooSaid")

// ǰ��
import { useTranslation } from "react-i18next"
const { t } = useTranslation()
t("chat:text.llmSaid")
```

---

## ����

### ���Կ��

| ����                          | ��;                |
| ----------------------------- | ------------------ |
| **Vitest**                    | ��Ԫ���Ժͼ��ɲ���     |
| **@testing-library/react**    | React �������      |
| **@testing-library/jest-dom** | DOM ����           |
| **nock**                      | HTTP ���� mock     |
| **@vscode/test-electron**     | VS Code ��չ���ɲ��� |

### ����λ��

```
src/**/__tests__/           # ��˲���
webview-ui/src/**/__tests__/ # ǰ�˲���
packages/types/src/__tests__/ # ���Ͱ�����
```

### ���в���

```bash
pnpm test                   # �������в���
pnpm test -- --watch        # ����ģʽ
```

---

## Git ������

### Git Hooks��Husky��

#### pre-commit

```bash
1. ��ֱֹ���ύ�� main ��֧
2. lint-staged: ���ݴ��ļ�ִ�� prettier --write
3. pnpm lint: ȫ��Ŀ ESLint ��飨max-warnings=0��
```

#### pre-push

```bash
1. ��ֱֹ�����͵� main ��֧
2. pnpm check-types: TypeScript ���ͼ��
3. (��ѡ) pnpm test: �� RUN_TESTS_ON_PUSH=true ʱ���в���
4. ����Ƿ���δ������ changeset
```

### ���� Hooks�����Ƽ���

```bash
git commit --no-verify      # ���� pre-commit
git push --no-verify        # ���� pre-push
```

### �汾����

ʹ�� `@changesets/cli` �����汾��

```bash
pnpm changeset              # ���� changeset
pnpm changeset:version      # �汾���� + ���� CHANGELOG
```

---

## ���������ٲ�

| ����                          | ˵��                               |
| ----------------------------- | --------------------------------- |
| `pnpm install`                | ��װ����                           |
| `pnpm build`                  | ȫ������                           |
| `pnpm bundle`                 | ������� review skill��            |
| `pnpm vsix`                   | ��� VSIX ����װ                    |
| `pnpm lint`                   | ESLint ���                        |
| `pnpm check-types`            | TypeScript ���ͼ��                 |
| `pnpm test`                   | ���в���                           |
| `pnpm format`                 | Prettier ��ʽ��                    |
| `pnpm clean`                  | ������������                      |
| `pnpm install:vsix`           | ������װ���̣��������������������װ�� |
| `cd webview-ui && pnpm dev`   | ���� Webview ����������           |
| `cd src && pnpm watch:bundle` | ����ģʽ�����չ                      |
| `cd src && pnpm watch:tsc`    | ����ģʽ���ͼ��                      |

---

## �ؼ��ļ�����

| �ļ�                                                                                                        | ˵��                                                   |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| [extension.ts](file:///f:/AIPlugins/costrict-main/src/extension.ts)                                        | ��չ�������                                            |
| [src/package.json](file:///f:/AIPlugins/costrict-main/src/package.json)                                    | ��չ���ã�commands, views, keybindings, configuration�� |
| [src/esbuild.mjs](file:///f:/AIPlugins/costrict-main/src/esbuild.mjs)                                      | esbuild �������                                       |
| [webview-ui/vite.config.ts](file:///f:/AIPlugins/costrict-main/webview-ui/vite.config.ts)                  | Vite ��������                                         |
| [turbo.json](file:///f:/AIPlugins/costrict-main/turbo.json)                                                | Turbo �������                                         |
| [pnpm-workspace.yaml](file:///f:/AIPlugins/costrict-main/pnpm-workspace.yaml)                              | ����������                                            |
| [ClineProvider.ts](file:///f:/AIPlugins/costrict-main/src/core/webview/ClineProvider.ts)                   | Webview ͨ�ź���                                         |
| [Task.ts](file:///f:/AIPlugins/costrict-main/src/core/task/Task.ts)                                        | ����������                                            |
| [modes.ts](file:///f:/AIPlugins/costrict-main/src/shared/modes.ts)                                         | ����ģʽ����                                            |
| [App.tsx](file:///f:/AIPlugins/costrict-main/webview-ui/src/App.tsx)                                       | ǰ����Ӧ��                                              |
| [ChatView.tsx](file:///f:/AIPlugins/costrict-main/webview-ui/src/components/chat/ChatView.tsx)             | �������                                               |
| [SettingsView.tsx](file:///f:/AIPlugins/costrict-main/webview-ui/src/components/settings/SettingsView.tsx) | ���ý���                                               |
| [api/index.ts](file:///f:/AIPlugins/costrict-main/src/api/index.ts)                                        | API �ṩ�̹���                                            |
| [i18n/setup.ts](file:///f:/AIPlugins/costrict-main/src/i18n/setup.ts)                                      | ��� i18n ��ʼ��                                        |
| [webview-ui/src/i18n/setup.ts](file:///f:/AIPlugins/costrict-main/webview-ui/src/i18n/setup.ts)            | ǰ�� i18n ��ʼ��                                        |
| [scripts/install-vsix.js](file:///f:/AIPlugins/costrict-main/scripts/install-vsix.js)                      | VSIX ��װ�ű�                                           |

---

## ע������

### �ļ�����

���� JSON �ļ����뱣�� **UTF-8 ����**���޸� i18n �ļ�ʱ���ر�ע�⣬������뱻ת��Ϊ GBK ���¹���ʧ�ܡ�

### VSIX �������

- `package.json` �е�ͼ������� **PNG ��ʽ**����֧�� SVG
- Webview UI �п���ʹ�� SVG
- ��������ͨ�� esbuild bundle �� `extension.js`������Ҫ `node_modules`

### �ⲿ������

esbuild �������ⲿ����ģ�飨���� bundle����

- `vscode` �� �� VS Code ����ʱ�ṩ
- `esbuild` �� ������ʱʹ��
- `global-agent` �� ��̬ patch Node.js ģ��
