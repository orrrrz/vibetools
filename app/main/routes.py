# app/main/routes.py
from flask import render_template
from . import main # <--- 确保导入了在 __init__.py 中定义的 main 蓝图实例
import json
import os

def load_tool_list():
    try:
        json_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'tools.json')
        with open(json_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading tools.json: {e}")
        return []

@main.route('/') # <--- 检查这个路由装饰器是否存在且正确
def index():
    # ... (你的视图函数逻辑) ...
    # 确保这里最终会 return 一个响应，比如 render_template
    try:
        # 假设你的主页模板是 index.html
        tools = load_tool_list()
        tools = [tool for tool in tools if tool.get('enabled', True)]
        return render_template('index.html', tools=tools)
    except Exception as e:
         # 添加错误处理或日志记录会很有帮助
         print(f"Error rendering index.html: {e}")
         # 可以返回一个简单的错误信息，而不是让应用崩溃
         return "Error loading homepage template.", 500