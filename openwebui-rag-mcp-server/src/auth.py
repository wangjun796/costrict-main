"""
认证处理模块
负责从 HTTP Header 或工具参数中提取 OpenWebUI Token

认证流程：
1. MCP Client 通过 HTTP Header 传递 Token（推荐）
   - X-OpenWebUI-Token: <token>
   - Authorization: Bearer <token>
2. 或者在工具调用参数中传递 user_token（需配置允许）
3. 最后回退到环境变量 DEFAULT_OPENWEBUI_TOKEN

安全机制：
- ContextVar 用于在异步请求中隔离 Token
- 支持 Gateway Token 保护 MCP Server 本身
- Token 脱敏处理用于日志输出
"""

from typing import Any, Dict, Optional
from contextvars import ContextVar

from . import config


# =========================
# ContextVar：异步上下文中的 Token 传递
# =========================
# ContextVar 是 Python 3.7+ 引入的异步安全上下文变量
# 每个异步请求都有独立的上下文，避免并发请求间的 Token 污染
auth_token_var: ContextVar[Optional[str]] = ContextVar(
    "openwebui_token",  # 变量名称，用于调试
    default=None  # 默认值
)


def mask_token(token: Optional[str]) -> str:
    """
    对 token 进行脱敏处理，用于日志输出
    """
    if not token:
        return "<none>"
    if len(token) <= 12:
        return "***"
    return token[:6] + "***" + token[-4:]


def extract_bearer(headers) -> Optional[str]:
    """
    从 Authorization Header 中提取 Bearer Token
    """
    auth = headers.get("authorization")
    if not auth:
        return None
    auth = auth.strip()
    if auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return None


def check_gateway_token(headers) -> bool:
    """
    检查 MCP Gateway Token 是否有效
    如果配置了 MCP_GATEWAY_TOKEN，则要求 MCP Client 传 X-MCP-Token
    """
    if not config.MCP_GATEWAY_TOKEN:
        return True
    supplied = headers.get("x-mcp-token")
    return supplied == config.MCP_GATEWAY_TOKEN


def extract_openwebui_token(headers) -> Optional[str]:
    """
    从 HTTP Header 中提取 OpenWebUI Token
    
    优先级：
    1. X-OpenWebUI-Token
    2. Authorization: Bearer xxx
    3. DEFAULT_OPENWEBUI_TOKEN（环境变量）
    """
    # 优先读取 X-OpenWebUI-Token
    token = headers.get("x-openwebui-token")
    if token:
        return token.strip()

    # 其次读取 Authorization: Bearer
    token = extract_bearer(headers)
    if token:
        return token

    # 最后回退到默认 token
    return config.DEFAULT_OPENWEBUI_TOKEN


async def resolve_token(arguments: Dict[str, Any]) -> str:
    """
    工具调用时解析 OpenWebUI token
    
    优先级：
    1. tool arguments 里的 user_token/openwebui_token/token
    2. HTTP Header 里的 token（通过 ContextVar 传递）
    3. DEFAULT_OPENWEBUI_TOKEN
    
    Args:
        arguments: 工具调用参数
        
    Returns:
        OpenWebUI Token
        
    Raises:
        PermissionError: 如果没有找到有效的 token
    """
    # 尝试从工具参数中获取 token
    arg_token = (
        arguments.get("user_token")
        or arguments.get("openwebui_token")
        or arguments.get("token")
    )

    if arg_token:
        if not config.ALLOW_TOKEN_IN_TOOL_ARGUMENT:
            raise PermissionError(
                "不允许在工具参数中传递 OpenWebUI token，请通过 HTTP Header 传递。"
            )
        return str(arg_token).strip()

    # 从 ContextVar 中获取（HTTP Header 传递的 token）
    token = auth_token_var.get() or config.DEFAULT_OPENWEBUI_TOKEN
    
    if not token:
        raise PermissionError(
            "缺少 OpenWebUI 用户凭证。请在 MCP HTTP 头中传 "
            "Authorization: Bearer <OpenWebUI API Key>，"
            "或 X-OpenWebUI-Token: <OpenWebUI API Key>。"
        )
    
    return token
