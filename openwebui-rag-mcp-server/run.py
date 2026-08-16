#!/usr/bin/env python3
"""
OpenWebUI RAG MCP Server 启动脚本

使用方法：
    python run.py

启动流程：
1. 将项目根目录添加到 Python 路径
2. 导入 server 模块的 main 函数
3. 启动 Uvicorn 服务器，监听配置的 HOST:PORT
"""

import sys
import os

# 添加项目根目录到 Python 路径
# 确保可以正确导入 src 包
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from src.server import main

if __name__ == "__main__":
    # 启动 MCP Server
    main()
