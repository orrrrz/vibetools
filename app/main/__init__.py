from flask import Blueprint

main = Blueprint('main', __name__)

from . import routes # <--- 检查这行导入是否在 Blueprint 定义之后