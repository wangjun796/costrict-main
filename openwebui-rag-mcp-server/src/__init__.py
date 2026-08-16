"""
OpenWebUI RAG MCP Server
将 OpenWebUI 知识库能力通过 MCP 协议暴露给外部 Agent

模块结构：
- server: MCP Server 主入口，负责初始化和启动
- config: 配置管理，从环境变量加载配置
- auth: 认证处理，提取和验证 Token
- openwebui_client: OpenWebUI API 客户端，封装 HTTP 请求
- tools: MCP 工具定义和实现
"""

__version__ = "1.0.0"
__author__ = "OpenWebUI MCP Server"

# 导入核心模块
from .server import main, app  # main: 启动函数, app: Starlette 应用实例
from . import config  # 配置管理模块
from . import auth  # 认证处理模块
from . import openwebui_client  # OpenWebUI API 客户端
from . import tools  # MCP 工具定义

# 定义公开 API
__all__ = [
    "main",
    "app",
    "config",
    "auth",
    "openwebui_client",
    "tools",
]
