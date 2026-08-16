# OpenWebUI RAG MCP Server 快速开始指南

## 项目概述

本项目是一个 MCP (Model Context Protocol) Server，用于将 OpenWebUI 的知识库（RAG）能力暴露给外部 AI Agent。

## 功能特性

✅ 4 个核心 MCP 工具：

- `openwebui_list_knowledge_bases` - 列出可访问的知识库
- `openwebui_search_knowledge` - 在知识库中进行语义搜索
- `openwebui_get_knowledge_detail` - 获取知识库详情
- `openwebui_list_documents` - 列出知识库中的文档

✅ 灵活的认证方式：

- HTTP Header（推荐）
- 工具参数传递
- 环境变量默认 Token

✅ 支持 Docker 部署

## 快速开始

### 1. 安装依赖

```bash
cd openwebui-rag-mcp-server
pip install -r requirements.txt
```

### 2. 配置环境变量

```bash
# 复制示例配置
cp .env.example .env

# 编辑配置文件
# Windows: notepad .env
# Linux/Mac: nano .env
```

关键配置项：

```env
# OpenWebUI 服务地址（根据实际部署修改）
OPENWEBUI_BASE_URL=http://127.0.0.1:8080

# 认证方式
OPENWEBUI_AUTH_STYLE=bearer
ALLOW_TOKEN_IN_TOOL_ARGUMENT=true

# 服务端口
HOST=0.0.0.0
PORT=8765
```

### 3. 启动服务

```bash
python run.py
```

服务将在 `http://0.0.0.0:8765` 启动。

### 4. 验证服务

```bash
# 检查健康状态
curl http://localhost:8765/health
```

## MCP Client 配置

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

## 使用示例

### 示例 1: 列出知识库

```python
# 在 MCP Client 中调用
result = await session.call_tool(
    "openwebui_list_knowledge_bases",
    arguments={}
)
```

### 示例 2: 搜索知识库

```python
# 在所有知识库中搜索
result = await session.call_tool(
    "openwebui_search_knowledge",
    arguments={
        "query": "API 接口文档",
        "top_k": 5
    }
)

# 在指定知识库中搜索
result = await session.call_tool(
    "openwebui_search_knowledge",
    arguments={
        "query": "API 接口文档",
        "knowledge_name": "技术文档",
        "top_k": 5
    }
)

# 在指定文档中搜索
result = await session.call_tool(
    "openwebui_search_knowledge",
    arguments={
        "query": "API 接口文档",
        "knowledge_name": "技术文档",
        "document_name": "api-docs.md",
        "top_k": 5
    }
)
```

### 示例 3: 获取知识库详情

```python
result = await session.call_tool(
    "openwebui_get_knowledge_detail",
    arguments={
        "knowledge_id": "kb-123"
    }
)
```

### 示例 4: 列出文档

```python
result = await session.call_tool(
    "openwebui_list_documents",
    arguments={
        "knowledge_id": "kb-123"
    }
)
```

## Docker 部署

### 方式一: Docker Compose（推荐）

```bash
# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

### 方式二: Docker

```bash
# 构建镜像
docker build -t openwebui-mcp-server .

# 运行容器
docker run -d \
  --name openwebui-mcp-server \
  -p 8765:8765 \
  -e OPENWEBUI_BASE_URL=http://open-webui:8080 \
  -e OPENWEBUI_AUTH_STYLE=bearer \
  -e ALLOW_TOKEN_IN_TOOL_ARGUMENT=true \
  openwebui-mcp-server
```

## 测试

运行测试脚本：

```bash
# 先确保 MCP Server 已启动
python run.py

# 在另一个终端运行测试
python test_client.py
```

## 常见问题

### 1. 无法连接到 OpenWebUI

**问题**: 连接 OpenWebUI 失败

**解决**:

- 检查 `OPENWEBUI_BASE_URL` 配置是否正确
- 确保 OpenWebUI 服务正在运行
- 检查网络连通性: `curl http://your-openwebui-host:8080`

### 2. 认证失败

**问题**: 401 Unauthorized

**解决**:

- 检查 Token 是否有效
- 确认 `OPENWEBUI_AUTH_STYLE` 配置正确
- 在 OpenWebUI Web 界面重新生成 API Token

### 3. 权限不足

**问题**: 无法访问某些知识库

**解决**:

- 确保使用的 Token 对应的用户有权限访问目标知识库
- 在 OpenWebUI 中检查用户的知识库权限设置

### 4. API 路径不匹配

**问题**: 404 Not Found

**解决**:

- 检查 OpenWebUI 版本，确认 API 路径
- 修改 `OPENWEBUI_SEARCH_PATHS` 等配置项

## 项目结构

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
├── run.py                  # 启动脚本
├── test_client.py          # 测试脚本
├── README.md               # 详细文档
└── QUICKSTART.md           # 快速开始指南（本文件）
```

## 下一步

- 阅读 [README.md](README.md) 了解详细配置和 API 说明
- 根据实际需求修改配置
- 集成到你的 AI Agent 中

## 支持

如有问题，请提交 Issue 或联系开发者。
