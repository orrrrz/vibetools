from flask import render_template
from . import color_picker_bp

@color_picker_bp.route('/')
def index():
    # 渲染纯前端工具的 HTML 页面
    # 所有逻辑都在 color_picker/static/color_picker/script.js 中处理
    return render_template('color_picker/index.html')