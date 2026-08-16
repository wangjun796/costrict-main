#!/usr/bin/env python3
"""
MCP Client 测试脚本
用于验证 MCP Server 是否正常工作
"""

import asyncio
import json
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from mcp.client.sse import sse_client


async def test_sse_connection():
    """测试 SSE 连接"""
    print("=" * 60)
    print("测试 SSE 连接")
    print("=" * 60)
    
    # SSE 连接配置
    url = "http://localhost:8765/sse"
    headers = {
        "Authorization": "Bearer your_test_token_here"  # 替换为实际 Token
    }
    
    try:
        async with sse_client(url=url, headers=headers) as (read_stream, write_stream):
            async with ClientSession(read_stream, write_stream) as session:
                # 初始化会话
                await session.initialize()
                print("✓ SSE 连接成功")
                
                # 列出可用工具
                tools = await session.list_tools()
                print(f"✓ 可用工具数量: {len(tools.tools)}")
                
                for tool in tools.tools:
                    print(f"  - {tool.name}: {tool.description}")
                
                return True
                
    except Exception as e:
        print(f"✗ SSE 连接失败: {e}")
        return False


async def test_list_knowledge_bases():
    """测试列出知识库"""
    print("\n" + "=" * 60)
    print("测试列出知识库")
    print("=" * 60)
    
    url = "http://localhost:8765/sse"
    headers = {
        "Authorization": "Bearer your_test_token_here"  # 替换为实际 Token
    }
    
    try:
        async with sse_client(url=url, headers=headers) as (read_stream, write_stream):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()
                
                # 调用列出知识库工具
                result = await session.call_tool(
                    "openwebui_list_knowledge_bases",
                    arguments={}
                )
                
                print("✓ 调用成功")
                print(json.dumps(json.loads(result.content[0].text), indent=2, ensure_ascii=False))
                
                return True
                
    except Exception as e:
        print(f"✗ 调用失败: {e}")
        return False


async def test_search_knowledge():
    """测试搜索知识库"""
    print("\n" + "=" * 60)
    print("测试搜索知识库")
    print("=" * 60)
    
    url = "http://localhost:8765/sse"
    headers = {
        "Authorization": "Bearer your_test_token_here"  # 替换为实际 Token
    }
    
    try:
        async with sse_client(url=url, headers=headers) as (read_stream, write_stream):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()
                
                # 调用搜索工具
                result = await session.call_tool(
                    "openwebui_search_knowledge",
                    arguments={
                        "query": "测试查询",
                        "top_k": 3
                    }
                )
                
                print("✓ 调用成功")
                print(json.dumps(json.loads(result.content[0].text), indent=2, ensure_ascii=False))
                
                return True
                
    except Exception as e:
        print(f"✗ 调用失败: {e}")
        return False


async def main():
    """主测试函数"""
    print("OpenWebUI RAG MCP Server 测试")
    print("=" * 60)
    
    # 测试 1: SSE 连接
    success1 = await test_sse_connection()
    
    if not success1:
        print("\n✗ SSE 连接失败，请检查 MCP Server 是否启动")
        print("启动命令: python run.py")
        return
    
    # 测试 2: 列出知识库
    success2 = await test_list_knowledge_bases()
    
    # 测试 3: 搜索知识库
    success3 = await test_search_knowledge()
    
    print("\n" + "=" * 60)
    print("测试完成")
    print("=" * 60)
    print(f"SSE 连接: {'✓' if success1 else '✗'}")
    print(f"列出知识库: {'✓' if success2 else '✗'}")
    print(f"搜索知识库: {'✓' if success3 else '✗'}")


if __name__ == "__main__":
    asyncio.run(main())
