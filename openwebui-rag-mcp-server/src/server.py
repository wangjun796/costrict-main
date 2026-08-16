"""
MCP Server 主入口
负责初始化 MCP Server 并启动 SSE 传输层

架构说明：
- 使用 Starlette 作为 ASGI 框架
- 使用 SSE (Server-Sent Events) 作为 MCP 传输协议
- 支持多个端点：/sse, /mcp, /messages/
- 集成 OpenWebUI 客户端生命周期管理

端点说明：
- /health: 健康检查
- /sse: SSE 连接端点（MCP Client 连接）
- /mcp: SSE 连接端点（别名，兼容不同客户端）
- /messages/: MCP 消息回调端点
"""

import logging
import os

import uvicorn
from starlette.applications import Starlette
from starlette.routing import Route, Mount
from starlette.requests import Request
from starlette.responses import JSONResponse, PlainTextResponse

from mcp.server import Server
from mcp.server.sse import SseServerTransport

from . import config
from .auth import (
    auth_token_var,
    check_gateway_token,
    extract_openwebui_token,
    mask_token
)
from .openwebui_client import lifespan
from .tools import register_tools


# =========================
# 日志配置
# =========================
logging.basicConfig(
    level=config.LOG_LEVEL,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("openwebui-mcp")


# =========================
# MCP Server 初始化
# =========================
# 创建 MCP Server 实例，名称用于标识
mcp_server = Server("openwebui-rag-mcp-server")

# 注册所有 MCP 工具（在 tools.py 中定义）
register_tools(mcp_server)

# 创建 SSE 传输层
# /messages/ 是 MCP 协议要求的消息回调路径
sse = SseServerTransport("/messages/")


# =========================
# HTTP 路由处理
# =========================

async def handle_sse(request: Request):
    """
    处理 SSE 连接

    1. 检查 Gateway Token（如果配置了）
    2. 提取 OpenWebUI Token
    3. 建立 SSE 连接
    4. 运行 MCP Server
    """
    # 检查 Gateway Token
    if not check_gateway_token(request.headers):
        return PlainTextResponse(
            "invalid MCP gateway token",
            status_code=401
        )

    # 提取 OpenWebUI Token
    token = extract_openwebui_token(request.headers)
    token_handle = auth_token_var.set(token)

    logger.info(
        "MCP SSE connected. openwebui_token=%s",
        mask_token(token)
    )

    try:
        async with sse.connect_sse(
            request.scope, request.receive, request._send
        ) as streams:
            await mcp_server.run(
                streams[0],
                streams[1],
                mcp_server.create_initialization_options(),
            )
    except Exception:
        logger.exception("SSE session error")
    finally:
        auth_token_var.reset(token_handle)


async def health(request: Request):
    """健康检查端点"""
    return JSONResponse(
        {
            "status": "ok",
            "openwebui_base_url": config.OPENWEBUI_BASE_URL,
            "search_paths": config.OPENWEBUI_SEARCH_PATHS,
            "knowledge_list_paths": config.OPENWEBUI_KNOWLEDGE_LIST_PATHS,
            "allow_token_in_argument": config.ALLOW_TOKEN_IN_TOOL_ARGUMENT,
            "max_top_k": config.MAX_TOP_K,
        }
    )


# =========================
# 创建 Starlette 应用
# =========================

app = Starlette(
    debug=False,
    routes=[
        Route("/health", health),
        
        # SSE 端点（两个别名，兼容不同 MCP Client 配置）
        Route("/sse", endpoint=handle_sse),
        Route("/mcp", endpoint=handle_sse),
        
        # MCP SSE transport 的 message 回调地址
        Route("/messages/", endpoint=sse.handle_post_message, methods=["POST"]),
    ],
    lifespan=lifespan,
)


# =========================
# 启动入口
# =========================

def main():
    """启动 MCP Server"""
    logger.info(f"Starting OpenWebUI RAG MCP Server on {config.HOST}:{config.PORT}")
    logger.info(f"OpenWebUI Base URL: {config.OPENWEBUI_BASE_URL}")
    logger.info(f"Allow token in tool arguments: {config.ALLOW_TOKEN_IN_TOOL_ARGUMENT}")
    
    uvicorn.run(
        app,
        host=config.HOST,
        port=config.PORT,
        log_level=config.LOG_LEVEL.lower()
    )


if __name__ == "__main__":
    main()
