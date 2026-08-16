"""
配置管理模块
负责从环境变量加载和管理所有配置项

配置来源：
- 环境变量（优先）
- .env 文件（通过 python-dotenv 加载）
- 默认值

配置分类：
1. OpenWebUI 服务配置：BASE_URL、API路径、超时时间等
2. MCP Server 配置：监听地址、端口、日志级别等
3. 认证配置：Token 来源、Gateway Token 等
"""

import os
from typing import List


# =========================
# 环境变量读取辅助函数
# =========================

def env_bool(name: str, default: bool = False) -> bool:
    """
    从环境变量读取布尔值
    
    Args:
        name: 环境变量名称
        default: 默认值
        
    Returns:
        布尔值
        
    支持的 true 值：1, true, yes, on（不区分大小写）
    """
    val = os.getenv(name)
    if val is None:
        return default
    return val.strip().lower() in ("1", "true", "yes", "on")


def env_list(name: str, default: str, separator: str = ",") -> List[str]:
    """
    从环境变量读取列表
    
    Args:
        name: 环境变量名称
        default: 默认值（逗号分隔的字符串）
        separator: 分隔符，默认逗号
        
    Returns:
        字符串列表
        
    示例：
        OPENWEBUI_SEARCH_PATHS=/api/v1/retrieval/query,/api/v2/search
        -> ["/api/v1/retrieval/query", "/api/v2/search"]
    """
    val = os.getenv(name, default)
    return [item.strip() for item in val.split(separator) if item.strip()]


# =========================
# OpenWebUI 服务配置
# =========================

OPENWEBUI_BASE_URL = os.getenv(
    "OPENWEBUI_BASE_URL",
    "http://127.0.0.1:8080"
).rstrip("/")

# OpenWebUI 检索接口路径（支持多个候选路径，兼容不同版本）
OPENWEBUI_SEARCH_PATHS = env_list(
    "OPENWEBUI_SEARCH_PATHS",
    "/api/v1/retrieval/query"
)

# OpenWebUI 知识库列表接口路径
# 注意：实际 API 是 /api/v1/knowledge/search，但保留其他路径以兼容不同版本
OPENWEBUI_KNOWLEDGE_LIST_PATHS = env_list(
    "OPENWEBUI_KNOWLEDGE_LIST_PATHS",
    "/api/v1/knowledge/search,/api/v1/knowledge/list,/api/v1/knowledge"
)

# OpenWebUI 知识库详情接口路径模板
OPENWEBUI_KNOWLEDGE_DETAIL_PATH = os.getenv(
    "OPENWEBUI_KNOWLEDGE_DETAIL_PATH",
    "/api/v1/knowledge/{id}"
)

# OpenWebUI 文档列表接口路径模板
# 注意：实际 API 是 /files 而不是 /documents
OPENWEBUI_DOCUMENTS_PATH = os.getenv(
    "OPENWEBUI_DOCUMENTS_PATH",
    "/api/v1/knowledge/{id}/files"
)

# 请求超时时间（秒）
OPENWEBUI_TIMEOUT = float(os.getenv("OPENWEBUI_TIMEOUT", "120"))

# 认证头风格：bearer 或 x-api-key
OPENWEBUI_AUTH_STYLE = os.getenv("OPENWEBUI_AUTH_STYLE", "bearer").lower()

# 默认 token（单用户场景，生产环境不建议配置）
DEFAULT_OPENWEBUI_TOKEN = os.getenv("DEFAULT_OPENWEBUI_TOKEN") or None

# =========================
# MCP Server 配置
# =========================

# 是否允许在工具参数中传递 user_token
ALLOW_TOKEN_IN_TOOL_ARGUMENT = env_bool("ALLOW_TOKEN_IN_TOOL_ARGUMENT", True)

# 最大返回片段数
MAX_TOP_K = int(os.getenv("MAX_TOP_K", "20"))

# MCP Server 监听地址和端口
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8765"))

# 日志级别
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

# MCP Gateway Token（可选，用于保护 MCP Server 本身）
MCP_GATEWAY_TOKEN = os.getenv("MCP_GATEWAY_TOKEN") or None
