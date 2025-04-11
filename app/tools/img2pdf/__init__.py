from flask import Blueprint

# 定义蓝图，指定模板和静态文件夹相对于本文件的位置
# static_url_path 定义了静态文件的 URL 路径，它会基于注册时的 url_prefix
img2pdf_bp = Blueprint('img2pdf', __name__,
                                 template_folder='templates',
                                 static_folder='static',
                                 static_url_path='static') # 注意: 这里是相对于 url_prefix 的路径

from . import routes # 导入路由，确保蓝图实例化后导入

