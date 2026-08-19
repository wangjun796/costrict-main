"""
MCP 工具实现
定义 OpenWebUI 知识库相关的 MCP 工具

暴露的工具：
1. openwebui_list_knowledge_bases - 列出所有知识库
2. openwebui_search_knowledge - 语义检索知识库内容
3. openwebui_get_knowledge_detail - 获取知识库详情
4. openwebui_list_documents - 列出知识库中的文档
5. openwebui_ask_knowledge - 引用知识库/文件后提问（新增）

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
            ),
            types.Tool(
                name="openwebui_ask_knowledge",
                description=(
                    "引用 OpenWebUI 知识库或指定文件进行提问。"
                    "先在指定知识库/文件中检索与问题相关的内容，然后返回检索结果供 LLM 参考回答。"
                    "支持同时引用多个知识库或多个文件。"
                ),
                inputSchema={
                    "type": "object",
                    "properties": {
                        "question": {
                            "type": "string",
                            "description": "要提问的问题"
                        },
                        "knowledge_names": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "可选：引用的知识库名称列表（如 ['数学', '语文']）"
                        },
                        "knowledge_ids": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "可选：引用的知识库 ID 列表"
                        },
                        "document_names": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "可选：引用的文件名称列表（如 ['文质彬彬.docx', '萤窗小集.pdf']）"
                        },
                        "top_k": {
                            "type": "integer",
                            "description": "每个知识库返回的片段数量",
                            "default": 5,
                            "minimum": 1,
                            "maximum": config.MAX_TOP_K
                        },
                        "user_token": {
                            "type": "string",
                            "description": "可选：OpenWebUI API Key"
                        }
                    },
                    "required": ["question"]
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
            elif name == "openwebui_ask_knowledge":
                result = await handle_ask_knowledge(token, arguments)
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


# =========================
# 引用知识库提问（新增）
# =========================

async def handle_ask_knowledge(
    token: str,
    arguments: Dict[str, Any]
) -> Dict[str, Any]:
    """
    处理引用知识库/文件后提问

    流程：
    1. 收集所有引用的知识库（按名称或 ID）
    2. 收集所有引用的文件名称
    3. 对每个知识库分别检索，按文件过滤
    4. 汇总所有结果返回

    Args:
        token: OpenWebUI Token
        arguments: 工具参数
            - question: 问题
            - knowledge_names: 知识库名称列表
            - knowledge_ids: 知识库 ID 列表
            - document_names: 文件名称列表
            - top_k: 每个知识库返回片段数
    """
    question = arguments.get("question", "")
    if not question or not str(question).strip():
        raise ValueError("question 不能为空")

    knowledge_names = arguments.get("knowledge_names") or []
    knowledge_ids = arguments.get("knowledge_ids") or []
    document_names = arguments.get("document_names") or []
    top_k = arguments.get("top_k", 5)

    # 如果既没有指定知识库也没有指定文件，则全局检索
    if not knowledge_names and not knowledge_ids and not document_names:
        raise ValueError(
            "必须指定 knowledge_names、knowledge_ids 或 document_names 中的至少一个"
        )

    # 收集所有需要检索的知识库（去重）
    all_knowledge_ids = set(knowledge_ids)
    all_knowledge_names = list(knowledge_names)

    # 如果指定了文件但没有指定知识库，需要先找到文件所属的知识库
    if document_names and not knowledge_names and not knowledge_ids:
        kb_list = await openwebui_client.list_knowledge_bases(token)
        for kb in kb_list["knowledge_bases"]:
            all_knowledge_ids.add(kb["id"])

    # 将知识库名称转换为 ID
    if all_knowledge_names:
        kb_list = await openwebui_client.list_knowledge_bases(token)
        for name in all_knowledge_names:
            matched = None
            for kb in kb_list["knowledge_bases"]:
                if kb["name"] == name:
                    matched = kb
                    break
            if matched:
                all_knowledge_ids.add(matched["id"])
            else:
                raise ValueError(f"未找到知识库: {name}")

    # 对每个知识库分别检索
    all_chunks = []
    kb_results = []

    for kb_id in all_knowledge_ids:
        # 获取知识库名称（用于返回）
        kb_name = None
        kb_list = await openwebui_client.list_knowledge_bases(token)
        for kb in kb_list["knowledge_bases"]:
            if kb["id"] == kb_id:
                kb_name = kb["name"]
                break

        # 构建检索 payload
        payload = {
            "query": question,
            "top_k": top_k * 2 if document_names else top_k,
            "collection_names": [kb_id],
        }

        # 调用检索 API
        data = await openwebui_client.try_post_paths(
            config.OPENWEBUI_SEARCH_PATHS,
            token,
            payload
        )

        chunks = openwebui_client.normalize_chunks(data)

        # 按文件过滤
        if document_names:
            filtered = []
            for chunk in chunks:
                source = chunk.get("source", "")
                metadata = chunk.get("metadata", {})
                file_name = metadata.get("file_name", "")

                for doc_name in document_names:
                    if doc_name.lower() in source.lower() or \
                       doc_name.lower() in file_name.lower():
                        filtered.append(chunk)
                        break
            chunks = filtered[:top_k]
        else:
            chunks = chunks[:top_k]

        # 添加知识库信息
        for chunk in chunks:
            chunk["knowledge_id"] = kb_id
            chunk["knowledge_name"] = kb_name

        all_chunks.extend(chunks)
        kb_results.append({
            "knowledge_id": kb_id,
            "knowledge_name": kb_name,
            "chunk_count": len(chunks)
        })

    return {
        "question": question,
        "referenced_knowledge_bases": kb_results,
        "referenced_documents": document_names if document_names else None,
        "chunks": all_chunks,
        "total": len(all_chunks)
    }
