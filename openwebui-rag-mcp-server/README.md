# OpenWebUI RAG MCP Server

将 OpenWebUI 的知识库（RAG）能力通过 MCP 协议暴露给外部 Agent，让 Agent 能够查询和检索 OpenWebUI 中的知识库内容。

## 功能特性

- ✅ **知识库列表查询** - 获取用户有权限访问的所有知识库
- ✅ **知识库内容检索** - 基于语义搜索知识库内容
- ✅ **知识库详情查询** - 获取指定知识库的详细信息
- ✅ **文档列表查询** - 获取知识库中的所有文档
- ✅ **灵活的认证方式** - 支持 HTTP Header、工具参数、环境变量三种认证方式
- ✅ **权限管理** - 完全基于 OpenWebUI 的用户权限系统
- ✅ **Docker 支持** - 提供 Docker 和 Docker Compose 部署方式

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env` 并修改配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# OpenWebUI 服务地址
OPENWEBUI_BASE_URL=http://127.0.0.1:8080

# 认证配置
OPENWEBUI_AUTH_STYLE=bearer
ALLOW_TOKEN_IN_TOOL_ARGUMENT=true

# MCP Server 配置
HOST=0.0.0.0
PORT=8765
LOG_LEVEL=INFO
```

### 3. 启动服务

```bash
python -m src.server
```

服务将在 `http://0.0.0.0:8765` 启动。

## MCP 工具说明

本 Server 提供 4 个 MCP 工具：

### 1. openwebui_list_knowledge_bases

列出当前用户有权限访问的所有知识库。

**参数：**

- `user_token` (可选) - OpenWebUI API Token

**返回示例：**

```json
{
	"knowledge_bases": [
		{
			"id": "kb-123",
			"name": "技术文档",
			"description": "公司技术文档库",
			"collection_name": "tech-docs",
			"document_count": 42,
			"created_at": "2024-01-15T10:30:00Z"
		}
	],
	"total": 1
}
```

### 2. openwebui_search_knowledge

在知识库中进行语义搜索。

**参数：**

- `query` (必填) - 搜索查询文本
- `knowledge_name` (可选) - 按知识库名称过滤
- `knowledge_id` (可选) - 按知识库 ID 过滤
- `collection_name` (可选) - 按集合名称过滤
- `document_name` (可选) - 按文档名称过滤
- `top_k` (可选) - 返回结果数量，默认 5
- `user_token` (可选) - OpenWebUI API Token

**返回示例：**

```json
{
	"query": "API 接口",
	"chunks": [
		{
			"rank": 1,
			"score": 0.95,
			"source": "api-docs.md",
			"content": "API 接口文档说明...",
			"metadata": {
				"document_id": "doc-456",
				"knowledge_base_id": "kb-123"
			}
		}
	],
	"total": 1
}
```

### 3. openwebui_get_knowledge_detail

获取指定知识库的详细信息。

**参数：**

- `knowledge_id` (必填) - 知识库 ID
- `knowledge_name` (可选) - 知识库名称（二选一）
- `user_token` (可选) - OpenWebUI API Token

**返回示例：**

```json
{
	"id": "kb-123",
	"name": "技术文档",
	"description": "公司技术文档库",
	"collection_name": "tech-docs",
	"document_count": 42,
	"created_at": "2024-01-15T10:30:00Z",
	"metadata": {}
}
```

### 4. openwebui_list_documents

列出指定知识库中的所有文档。

**参数：**

- `knowledge_id` (必填) - 知识库 ID
- `knowledge_name` (可选) - 知识库名称（二选一）
- `user_token` (可选) - OpenWebUI API Token

**返回示例：**

```json
{
	"documents": [
		{
			"id": "doc-456",
			"filename": "api-docs.md",
			"size": 15234,
			"created_at": "2024-01-15T10:30:00Z"
		}
	],
	"total": 1
}
```

## 认证方式

支持三种认证方式（按优先级）：

### 1. HTTP Header（推荐）

MCP Client 在请求头中传递 Token：

```
Authorization: Bearer your_openwebui_token
```

或

```
X-OpenWebUI-Token: your_openwebui_token
```

### 2. 工具参数

在工具调用时传递 `user_token` 参数：

```json
{
	"query": "搜索内容",
	"user_token": "your_openwebui_token"
}
```

需要在配置中启用：

```env
ALLOW_TOKEN_IN_TOOL_ARGUMENT=true
```

### 3. 环境变量默认 Token

在 `.env` 中配置默认 Token：

```env
DEFAULT_OPENWEBUI_TOKEN=your_openwebui_token
```

⚠️ **注意**：这种方式所有请求都会使用同一个 Token，不适合多用户场景。

## 完整配置说明

| 配置项                            | 说明                       | 默认值                                     |
| --------------------------------- | -------------------------- | ------------------------------------------ |
| `OPENWEBUI_BASE_URL`              | OpenWebUI 服务地址         | `http://127.0.0.1:8080`                    |
| `OPENWEBUI_SEARCH_PATHS`          | 搜索 API 路径              | `/api/v1/retrieval/query`                  |
| `OPENWEBUI_KNOWLEDGE_LIST_PATHS`  | 知识库列表 API 路径        | `/api/v1/knowledge/list,/api/v1/knowledge` |
| `OPENWEBUI_KNOWLEDGE_DETAIL_PATH` | 知识库详情 API 路径        | `/api/v1/knowledge/{id}`                   |
| `OPENWEBUI_DOCUMENTS_PATH`        | 文档列表 API 路径          | `/api/v1/knowledge/{id}/documents`         |
| `OPENWEBUI_AUTH_STYLE`            | 认证方式                   | `bearer`                                   |
| `ALLOW_TOKEN_IN_TOOL_ARGUMENT`    | 是否允许工具参数传递 Token | `true`                                     |
| `DEFAULT_OPENWEBUI_TOKEN`         | 默认 Token（可选）         | -                                          |
| `HOST`                            | 服务监听地址               | `0.0.0.0`                                  |
| `PORT`                            | 服务端口                   | `8765`                                     |
| `LOG_LEVEL`                       | 日志级别                   | `INFO`                                     |
| `MAX_TOP_K`                       | 最大返回结果数             | `20`                                       |
| `MCP_GATEWAY_TOKEN`               | MCP Gateway Token（可选）  | -                                          |

## Docker 部署

### 方式一：使用 Docker Compose（推荐）

```bash
docker-compose up -d
```

### 方式二：使用 Docker

1. 构建镜像：

```bash
docker build -t openwebui-mcp-server .
```

2. 运行容器：

```bash
docker run -d \
  --name openwebui-mcp-server \
  -p 8765:8765 \
  -e OPENWEBUI_BASE_URL=http://open-webui:8080 \
  -e OPENWEBUI_AUTH_STYLE=bearer \
  -e ALLOW_TOKEN_IN_TOOL_ARGUMENT=true \
  openwebui-mcp-server
```

## MCP Client 配置示例

### Cursor

在 Cursor 的 MCP 配置文件中添加：

```json
{
	"mcpServers": {
		"openwebui-rag": {
			"url": "http://localhost:8765/sse",
			"headers": {
				"Authorization": "Bearer your_openwebui_token"
			}
		}
	}
}
```

### Claude Desktop

在 Claude Desktop 的配置文件中添加：

```json
{
	"mcpServers": {
		"openwebui-rag": {
			"command": "python",
			"args": ["-m", "src.server"],
			"env": {
				"OPENWEBUI_BASE_URL": "http://127.0.0.1:8080",
				"DEFAULT_OPENWEBUI_TOKEN": "your_openwebui_token"
			}
		}
	}
}
```

## 开发指南

### 项目结构

```
openwebui-rag-mcp-server/
├── src/
│   ├── __init__.py          # 包初始化
│   ├── server.py            # MCP Server 主入口
│   ├── tools.py             # MCP 工具定义
│   ├── openwebui_client.py  # OpenWebUI API 客户端
│   ├── auth.py              # 认证处理
│   └── config.py            # 配置管理
├── Dockerfile               # Docker 构建文件
├── docker-compose.yml       # Docker Compose 配置
├── requirements.txt         # Python 依赖
├── .env.example            # 环境变量示例
└── README.md               # 项目说明
```

### 添加新工具

在 `src/tools.py` 中添加新的工具定义：

```python
@server.tool()
async def new_tool(query: str, user_token: Optional[str] = None) -> str:
    """新工具说明"""
    # 实现逻辑
    return "结果"
```

### 运行测试

```bash
# 安装测试依赖
pip install pytest pytest-asyncio

# 运行测试
pytest
```

## 常见问题

### 1. 无法连接到 OpenWebUI

检查 `OPENWEBUI_BASE_URL` 配置是否正确，确保 OpenWebUI 服务正在运行。

### 2. 认证失败

检查 Token 是否有效，可以通过 OpenWebUI Web 界面重新生成 API Token。

### 3. 权限不足

确保使用的 Token 对应的用户有权限访问目标知识库。

### 4. API 路径不匹配

如果 OpenWebUI 版本不同，API 路径可能不同。检查并修改 `OPENWEBUI_SEARCH_PATHS` 等配置。

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
