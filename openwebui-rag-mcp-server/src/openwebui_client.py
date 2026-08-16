"""
OpenWebUI API 客户端
负责与 OpenWebUI 服务进行 HTTP 通信

核心功能：
1. 封装与 OpenWebUI 的 HTTP 交互
2. 支持多路径尝试（兼容不同版本）
3. 数据标准化处理（统一不同版本的返回格式）
4. 知识库相关 API 调用

主要 API：
- list_knowledge_bases: 获取知识库列表
- get_knowledge_detail: 获取知识库详情
- list_documents: 获取知识库中的文档列表
- search_knowledge: 语义检索知识库
"""

import asyncio
import json
import logging
from typing import Any, Dict, List, Optional, Union

import httpx
from contextlib import asynccontextmanager

from . import config
from .auth import mask_token


logger = logging.getLogger("openwebui-mcp")


class OpenWebUIError(Exception):
    """
    OpenWebUI API 错误
    
    用于封装 OpenWebUI API 返回的错误，包含状态码和错误消息
    """
    
    def __init__(self, status_code: int, message: str):
        """
        Args:
            status_code: HTTP 状态码
            message: 错误消息
        """
        self.status_code = status_code
        self.message = message
        super().__init__(f"OpenWebUI API {status_code}: {message[:1000]}")


# 全局 HTTP 客户端实例
# 在应用启动时创建，关闭时销毁
http_client: Optional[httpx.AsyncClient] = None


@asynccontextmanager
async def lifespan(app):
    """
    应用生命周期管理
    
    在 Starlette 应用启动时创建 HTTP 客户端，关闭时销毁
    确保 http_client 在整个应用生命周期内可用
    
    Args:
        app: Starlette 应用实例（由框架自动传入）
    """
    global http_client
    # 创建异步 HTTP 客户端
    # timeout: 请求超时时间（秒）
    # follow_redirects: 自动跟随重定向
    http_client = httpx.AsyncClient(
        timeout=config.OPENWEBUI_TIMEOUT,
        follow_redirects=True
    )
    logger.info(
        "OpenWebUI MCP Server started. base_url=%s",
        config.OPENWEBUI_BASE_URL
    )
    yield  # 应用运行期间保持客户端可用
    # 应用关闭时清理客户端
    if http_client:
        await http_client.aclose()


# =========================
# 通用 HTTP 请求
# =========================

async def openwebui_request(
    method: str,
    path: str,
    token: str,
    json_body: Optional[Dict[str, Any]] = None,
    params: Optional[Dict[str, Any]] = None,
) -> Any:
    """
    发送 HTTP 请求到 OpenWebUI API
    
    Args:
        method: HTTP 方法（GET, POST 等）
        path: API 路径
        token: OpenWebUI Token
        json_body: JSON 请求体
        params: URL 查询参数
        
    Returns:
        API 响应数据
        
    Raises:
        OpenWebUIError: API 请求失败
    """
    if http_client is None:
        raise RuntimeError("HTTP client 未初始化")

    # 构建请求头
    headers = {
        "Accept": "application/json",
    }

    # 添加认证头
    if config.OPENWEBUI_AUTH_STYLE == "x-api-key":
        headers["X-API-Key"] = token
    else:
        headers["Authorization"] = f"Bearer {token}"

    url = config.OPENWEBUI_BASE_URL + path

    logger.debug(
        "OpenWebUI request: %s %s token=%s",
        method,
        url,
        mask_token(token)
    )

    try:
        resp = await http_client.request(
            method,
            url,
            headers=headers,
            json=json_body,
            params=params,
        )
    except httpx.RequestError as exc:
        raise OpenWebUIError(
            502,
            f"无法连接 OpenWebUI: {exc}"
        ) from exc

    if resp.status_code >= 400:
        raise OpenWebUIError(resp.status_code, resp.text)

    try:
        return resp.json()
    except ValueError:
        return {"raw_text": resp.text}


async def try_post_paths(
    paths: List[str],
    token: str,
    payload: Dict[str, Any]
) -> Any:
    """
    尝试多个 POST 路径（兼容不同版本的 OpenWebUI）
    
    Args:
        paths: API 路径列表
        token: OpenWebUI Token
        payload: 请求体
        
    Returns:
        API 响应数据
    """
    last_error: Optional[Exception] = None

    for path in paths:
        try:
            return await openwebui_request(
                "POST",
                path,
                token,
                json_body=payload
            )
        except OpenWebUIError as exc:
            if exc.status_code in (404, 405):
                last_error = exc
                continue
            raise

    if last_error:
        raise last_error

    raise OpenWebUIError(500, "没有可用的 OpenWebUI API path")


async def try_get_paths(paths: List[str], token: str) -> Any:
    """
    尝试多个 GET 路径（兼容不同版本的 OpenWebUI）
    
    Args:
        paths: API 路径列表
        token: OpenWebUI Token
        
    Returns:
        API 响应数据
    """
    last_error: Optional[Exception] = None

    for path in paths:
        try:
            return await openwebui_request("GET", path, token)
        except OpenWebUIError as exc:
            if exc.status_code in (404, 405):
                last_error = exc
                continue
            raise

    if last_error:
        raise last_error

    raise OpenWebUIError(500, "没有可用的 OpenWebUI API path")


# =========================
# 数据提取和标准化
# =========================

def first_key(d: Dict[str, Any], keys: List[str]) -> Any:
    """从字典中按优先级获取第一个存在的键值"""
    for k in keys:
        if k in d and d[k] not in (None, ""):
            return d[k]
    return None


def extract_list(data: Any, keys: List[str]) -> List[Any]:
    """
    从 OpenWebUI 返回中提取列表（兼容不同版本的字段名）
    """
    if isinstance(data, list):
        return data

    if isinstance(data, dict):
        for key in keys:
            if key in data:
                return extract_list(data[key], keys)

        if "data" in data and isinstance(data["data"], (dict, list)):
            return extract_list(data["data"], keys)

    if data is None:
        return []

    return [data]


def normalize_chunks(data: Any) -> List[Dict[str, Any]]:
    """
    将 OpenWebUI 检索结果转换成统一结构
    """
    raw_items = extract_list(
        data,
        ["results", "documents", "chunks", "items", "records", "hits"],
    )

    normalized = []

    for idx, item in enumerate(raw_items):
        if isinstance(item, dict):
            # 提取内容
            content = first_key(
                item,
                ["content", "text", "page_content", "chunk", "document"],
            )

            if content is None:
                content = json.dumps(item, ensure_ascii=False)
            elif not isinstance(content, str):
                content = json.dumps(content, ensure_ascii=False)

            # 提取元数据
            metadata = item.get("metadata") or item.get("meta") or {}

            # 提取相似度分数
            score = first_key(item, ["score", "similarity", "distance"])

            # 提取来源文档
            source = first_key(
                item,
                ["source", "file_name", "filename", "document_name", "title"],
            )

            if not source and isinstance(metadata, dict):
                source = first_key(
                    metadata,
                    ["source", "file_name", "filename", "title"],
                )

            normalized.append(
                {
                    "rank": idx + 1,
                    "score": score,
                    "source": source,
                    "content": content,
                    "metadata": metadata,
                    "raw": item,
                }
            )
        else:
            normalized.append(
                {
                    "rank": idx + 1,
                    "content": str(item),
                }
            )

    return normalized


# =========================
# 知识库 API
# =========================

async def list_knowledge_bases(token: str) -> Dict[str, Any]:
    """
    获取知识库列表
    
    Args:
        token: OpenWebUI Token
        
    Returns:
        知识库列表
    """
    data = await try_get_paths(
        config.OPENWEBUI_KNOWLEDGE_LIST_PATHS,
        token
    )

    items = extract_list(
        data,
        ["items", "knowledge", "data", "results"]
    )

    simplified = []

    for item in items:
        if isinstance(item, dict):
            simplified.append(
                {
                    "id": first_key(item, ["id", "_id"]),
                    "name": first_key(item, ["name", "title"]),
                    "description": first_key(item, ["description"]),
                    "collection_name": first_key(
                        item,
                        ["collection_name", "collectionName", "collection"],
                    ),
                    "document_count": first_key(item, ["document_count", "doc_count"]),
                    "created_at": first_key(item, ["created_at", "created", "timestamp"]),
                    "raw": item,
                }
            )
        else:
            simplified.append({"raw": str(item)})

    return {
        "knowledge_bases": simplified,
        "raw": data,
    }


async def get_knowledge_detail(
    token: str,
    knowledge_id: str
) -> Dict[str, Any]:
    """
    获取知识库详情
    
    Args:
        token: OpenWebUI Token
        knowledge_id: 知识库 ID
        
    Returns:
        知识库详情
    """
    path = config.OPENWEBUI_KNOWLEDGE_DETAIL_PATH.format(id=knowledge_id)
    data = await openwebui_request("GET", path, token)
    
    return {
        "id": first_key(data, ["id", "_id"]),
        "name": first_key(data, ["name", "title"]),
        "description": first_key(data, ["description"]),
        "collection_name": first_key(
            data,
            ["collection_name", "collectionName", "collection"],
        ),
        "document_count": first_key(data, ["document_count", "doc_count"]),
        "created_at": first_key(data, ["created_at", "created", "timestamp"]),
        "metadata": data.get("metadata", {}),
        "raw": data,
    }


async def list_documents(
    token: str,
    knowledge_id: str
) -> Dict[str, Any]:
    """
    获取知识库中的文档列表
    
    Args:
        token: OpenWebUI Token
        knowledge_id: 知识库 ID
        
    Returns:
        文档列表
    """
    path = config.OPENWEBUI_DOCUMENTS_PATH.format(id=knowledge_id)
    data = await openwebui_request("GET", path, token)
    
    items = extract_list(
        data,
        ["items", "documents", "data", "results"]
    )

    simplified = []

    for item in items:
        if isinstance(item, dict):
            simplified.append(
                {
                    "id": first_key(item, ["id", "_id"]),
                    "filename": first_key(item, ["filename", "file_name", "name"]),
                    "size": first_key(item, ["size", "file_size"]),
                    "created_at": first_key(item, ["created_at", "created", "timestamp"]),
                    "raw": item,
                }
            )
        else:
            simplified.append({"raw": str(item)})

    return {
        "documents": simplified,
        "raw": data,
    }


async def search_knowledge(
    token: str,
    query: str,
    collection_names: Optional[List[str]] = None,
    top_k: int = 5,
) -> Dict[str, Any]:
    """
    检索知识库
    
    Args:
        token: OpenWebUI Token
        query: 查询问题或关键词
        collection_names: 知识库 collection_name 列表（可选）
        top_k: 返回片段数量
        
    Returns:
        检索结果
    """
    if not query or not str(query).strip():
        raise ValueError("query 不能为空")

    top_k = max(1, min(int(top_k or 5), config.MAX_TOP_K))

    # 构建请求体
    payload = {
        "query": query,
        "top_k": top_k,
    }

    if collection_names:
        payload["collection_names"] = collection_names

    # 调用检索 API
    data = await try_post_paths(
        config.OPENWEBUI_SEARCH_PATHS,
        token,
        payload
    )

    return {
        "query": query,
        "chunks": normalize_chunks(data),
        "raw": data,
    }


# =========================
# 名称转换辅助函数
# =========================

async def resolve_collection_name(
    token: str,
    knowledge_name: Optional[str] = None,
    knowledge_id: Optional[str] = None,
    collection_name: Optional[str] = None,
) -> Optional[List[str]]:
    """
    将知识库名称/ID 转换为 collection_name
    
    Args:
        token: OpenWebUI Token
        knowledge_name: 知识库名称（支持逗号分隔的多个名称）
        knowledge_id: 知识库 ID
        collection_name: 直接指定的 collection_name
        
    Returns:
        collection_name 列表，如果都为 None 则返回 None
    """
    # 如果直接传了 collection_name，直接返回
    if collection_name:
        return [collection_name]
    
    # 否则需要查询列表做转换
    kb_list = await list_knowledge_bases(token)
    knowledge_bases = kb_list["knowledge_bases"]
    
    result = []
    
    # 处理 knowledge_name（支持逗号分隔）
    if knowledge_name:
        names = [n.strip() for n in knowledge_name.split(",")]
        for name in names:
            matched = None
            for kb in knowledge_bases:
                if kb["name"] == name:
                    matched = kb
                    break
            
            if matched:
                if matched.get("collection_name"):
                    result.append(matched["collection_name"])
                else:
                    raise ValueError(
                        f"知识库 '{name}' 没有 collection_name 字段"
                    )
            else:
                raise ValueError(f"未找到知识库: {name}")
    
    # 处理 knowledge_id
    if knowledge_id:
        matched = None
        for kb in knowledge_bases:
            if kb["id"] == knowledge_id:
                matched = kb
                break
        
        if matched:
            if matched.get("collection_name"):
                result.append(matched["collection_name"])
            else:
                raise ValueError(
                    f"知识库 ID '{knowledge_id}' 没有 collection_name 字段"
                )
        else:
            raise ValueError(f"未找到知识库 ID: {knowledge_id}")
    
    return result if result else None


def filter_by_document_name(
    chunks: List[Dict[str, Any]],
    document_name: str
) -> List[Dict[str, Any]]:
    """
    按文档名过滤检索结果
    
    Args:
        chunks: 检索结果片段列表
        document_name: 文档名称
        
    Returns:
        过滤后的片段列表
    """
    filtered = []
    
    for chunk in chunks:
        # 检查 source 字段
        source = chunk.get("source", "")
        metadata = chunk.get("metadata", {})
        file_name = metadata.get("file_name", "")
        
        # 模糊匹配（不区分大小写）
        if document_name.lower() in source.lower() or \
           document_name.lower() in file_name.lower():
            filtered.append(chunk)
    
    return filtered
