"""
MCP 工具实现
定义 OpenWebUI 知识库相关的 MCP 工具

暴露的工具：
1. openwebui_list_knowledge_bases - 列出所有知识库
2. openwebui_search_knowledge - 语义检索知识库内容
3. openwebui_get_knowledge_detail - 获取知识库详情
4. openwebui_list_documents - 列出知识库中的文档

工具调用流程：
1. MCP Client 调用工具
2. 解析 Token（从参数或 HTTP Header）
3. 调用 OpenWebUI API
4. 返回标准化结果
"""

import json
import logging
from typing import Any, Dict, List, Optional

from mcp.server import Server
from mcp import types

from . import config
from .auth import resolve_token
from . import openwebui_client


logger = logging.getLogger("openwebui-mcp")


def register_tools(server: Server):
    """
    注册所有 MCP 工具到 Server
    
    Args:
        server: MCP Server 实例
        
    该函数使用装饰器模式注册工具：
    - @server.list_tools(): 注册工具列表处理器
    - @server.call_tool(): 注册工具调用处理器
    """
    
    @server.list_tools()
    async def handle_list_tools() -> List[types.Tool]:
        """返回可用的工具列表"""
        return [
            types.Tool(
                name="openwebui_list_knowledge_bases",
                description="列出当前用户有权限访问的 OpenWebUI 知识库",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "user_token": {
                            "type": "string",
                            "description": "可选：OpenWebUI API Key。仅当 MCP 客户端无法通过 HTTP 头传递凭证时使用。"
                        }
                    }
                }
            ),
            types.Tool(
                name="openwebui_search_knowledge",
                description="在 OpenWebUI 知识库中进行语义检索。支持按知识库名称、ID 或文档名称进行过滤。",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "要检索的问题或关键词"
                        },
                        "knowledge_name": {
                            "type": "string",
                            "description": "可选：知识库名称（如'公司制度文档'）。支持逗号分隔的多个名称。"
                        },
                        "knowledge_id": {
                            "type": "string",
                            "description": "可选：知识库 ID"
                        },
                        "collection_name": {
                            "type": "string",
                            "description": "可选：直接指定知识库的 collection_name"
                        },
                        "document_name": {
                            "type": "string",
                            "description": "可选：文档名称过滤（如'员工手册.pdf'）"
                        },
                        "top_k": {
                            "type": "integer",
                            "description": "返回片段数量",
                            "default": 5,
                            "minimum": 1,
                            "maximum": config.MAX_TOP_K
                        },
                        "user_token": {
                            "type": "string",
                            "description": "可选：OpenWebUI API Key"
                        }
                    },
                    "required": ["query"]
                }
            ),
            types.Tool(
                name="openwebui_get_knowledge_detail",
                description="获取指定知识库的详细信息",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "knowledge_id": {
                            "type": "string",
                            "description": "知识库 ID"
                        },
                        "knowledge_name": {
                            "type": "string",
                            "description": "可选：知识库名称（如果提供，将自动查找对应的 ID）"
                        },
                        "user_token": {
                            "type": "string",
                            "description": "可选：OpenWebUI API Key"
                        }
                    },
                    "required": ["knowledge_id"]
                }
            ),
            types.Tool(
                name="openwebui_list_documents",
                description="列出指定知识库中的文档",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "knowledge_id": {
                            "type": "string",
                            "description": "知识库 ID"
                        },
                        "knowledge_name": {
                            "type": "string",
                            "description": "可选：知识库名称（如果提供，将自动查找对应的 ID）"
                        },
                        "user_token": {
                            "type": "string",
                            "description": "可选：OpenWebUI API Key"
                        }
                    },
                    "required": ["knowledge_id"]
                }
            )
        ]

    @server.call_tool()
    async def handle_call_tool(
        name: str,
        arguments: Optional[Dict[str, Any]]
    ) -> List[types.TextContent | types.ImageContent | types.EmbeddedResource]:
        """处理工具调用"""
        arguments = arguments or {}

        try:
            # 解析 token
            token = await resolve_token(arguments)

            # 根据工具名称分发处理
            if name == "openwebui_list_knowledge_bases":
                result = await handle_list_knowledge_bases(token)
            elif name == "openwebui_search_knowledge":
                result = await handle_search_knowledge(token, arguments)
            elif name == "openwebui_get_knowledge_detail":
                result = await handle_get_knowledge_detail(token, arguments)
            elif name == "openwebui_list_documents":
                result = await handle_list_documents(token, arguments)
            else:
                return [
                    types.TextContent(
                        type="text",
                        text=f"未知工具: {name}"
                    )
                ]

            return [
                types.TextContent(
                    type="text",
                    text=json.dumps(result, ensure_ascii=False, indent=2)
                )
            ]

        except PermissionError as exc:
            logger.error(f"权限错误: {exc}")
            return [
                types.TextContent(
                    type="text",
                    text=f"权限错误: {exc}"
                )
            ]
        except openwebui_client.OpenWebUIError as exc:
            logger.error(f"OpenWebUI API 错误: {exc}")
            return [
                types.TextContent(
                    type="text",
                    text=f"OpenWebUI API 错误: {exc}"
                )
            ]
        except ValueError as exc:
            logger.error(f"参数错误: {exc}")
            return [
                types.TextContent(
                    type="text",
                    text=f"参数错误: {exc}"
                )
            ]
        except Exception as exc:
            logger.exception(f"工具调用失败: {exc}")
            return [
                types.TextContent(
                    type="text",
                    text=f"工具调用失败: {exc}"
                )
            ]


# =========================
# 工具处理函数
# =========================

async def handle_list_knowledge_bases(token: str) -> Dict[str, Any]:
    """处理列出知识库"""
    result = await openwebui_client.list_knowledge_bases(token)
    
    # 移除 raw 数据，简化返回
    knowledge_bases = []
    for kb in result["knowledge_bases"]:
        knowledge_bases.append({
            "id": kb["id"],
            "name": kb["name"],
            "description": kb.get("description", ""),
            "collection_name": kb.get("collection_name", ""),
            "document_count": kb.get("document_count", 0),
            "created_at": kb.get("created_at", "")
        })
    
    return {
        "knowledge_bases": knowledge_bases,
        "total": len(knowledge_bases)
    }


async def handle_search_knowledge(
    token: str,
    arguments: Dict[str, Any]
) -> Dict[str, Any]:
    """处理检索知识库"""
    query = arguments.get("query", "")
    knowledge_name = arguments.get("knowledge_name")
    knowledge_id = arguments.get("knowledge_id")
    collection_name = arguments.get("collection_name")
    document_name = arguments.get("document_name")
    top_k = arguments.get("top_k", 5)

    # 解析 collection_names
    collection_names = await openwebui_client.resolve_collection_name(
        token=token,
        knowledge_name=knowledge_name,
        knowledge_id=knowledge_id,
        collection_name=collection_name
    )

    # 如果需要按文档过滤，多检索一些
    search_top_k = top_k * 2 if document_name else top_k

    # 执行检索
    result = await openwebui_client.search_knowledge(
        token=token,
        query=query,
        collection_names=collection_names,
        top_k=search_top_k
    )

    chunks = result["chunks"]

    # 按文档名过滤
    if document_name:
        chunks = openwebui_client.filter_by_document_name(chunks, document_name)
        chunks = chunks[:top_k]  # 过滤后截取
    else:
        chunks = chunks[:top_k]

    # 移除 raw 数据，简化返回
    simplified_chunks = []
    for chunk in chunks:
        simplified_chunks.append({
            "rank": chunk["rank"],
            "score": chunk.get("score"),
            "source": chunk.get("source", ""),
            "content": chunk["content"],
            "metadata": chunk.get("metadata", {})
        })

    return {
        "query": query,
        "knowledge_name": knowledge_name,
        "knowledge_id": knowledge_id,
        "collection_name": collection_name,
        "document_name": document_name,
        "chunks": simplified_chunks,
        "total": len(simplified_chunks)
    }


async def handle_get_knowledge_detail(
    token: str,
    arguments: Dict[str, Any]
) -> Dict[str, Any]:
    """处理获取知识库详情"""
    knowledge_id = arguments.get("knowledge_id")
    knowledge_name = arguments.get("knowledge_name")

    # 如果提供了 knowledge_name，需要先查找对应的 ID
    if knowledge_name and not knowledge_id:
        kb_list = await openwebui_client.list_knowledge_bases(token)
        for kb in kb_list["knowledge_bases"]:
            if kb["name"] == knowledge_name:
                knowledge_id = kb["id"]
                break
        
        if not knowledge_id:
            raise ValueError(f"未找到知识库: {knowledge_name}")

    if not knowledge_id:
        raise ValueError("必须提供 knowledge_id 或 knowledge_name")

    result = await openwebui_client.get_knowledge_detail(token, knowledge_id)

    # 移除 raw 数据，简化返回
    return {
        "id": result["id"],
        "name": result["name"],
        "description": result.get("description", ""),
        "collection_name": result.get("collection_name", ""),
        "document_count": result.get("document_count", 0),
        "created_at": result.get("created_at", ""),
        "metadata": result.get("metadata", {})
    }


async def handle_list_documents(
    token: str,
    arguments: Dict[str, Any]
) -> Dict[str, Any]:
    """处理列出文档"""
    knowledge_id = arguments.get("knowledge_id")
    knowledge_name = arguments.get("knowledge_name")

    # 如果提供了 knowledge_name，需要先查找对应的 ID
    if knowledge_name and not knowledge_id:
        kb_list = await openwebui_client.list_knowledge_bases(token)
        for kb in kb_list["knowledge_bases"]:
            if kb["name"] == knowledge_name:
                knowledge_id = kb["id"]
                break
        
        if not knowledge_id:
            raise ValueError(f"未找到知识库: {knowledge_name}")

    if not knowledge_id:
        raise ValueError("必须提供 knowledge_id 或 knowledge_name")

    result = await openwebui_client.list_documents(token, knowledge_id)

    # 移除 raw 数据，简化返回
    documents = []
    for doc in result["documents"]:
        documents.append({
            "id": doc["id"],
            "filename": doc["filename"],
            "size": doc.get("size", 0),
            "created_at": doc.get("created_at", "")
        })

    return {
        "knowledge_id": knowledge_id,
        "documents": documents,
        "total": len(documents)
    }
