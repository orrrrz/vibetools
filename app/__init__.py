from flask import Flask, render_template
from config import config

# 如果需要数据库等扩展，在这里初始化
# from flask_sqlalchemy import SQLAlchemy
# db = SQLAlchemy()

def create_app(config_name):
    app = Flask(__name__)
    app.config.from_object(config[config_name])
    config[config_name].init_app(app)

    # 初始化扩展
    # db.init_app(app)

    # 注册主蓝图
    from .main import main as main_blueprint
    app.register_blueprint(main_blueprint)

    # 注册工具蓝图 - 为每个工具设置 URL 前缀
    # 示例：后端工具
    from .tools.simple_calculator import simple_calculator_bp
    app.register_blueprint(simple_calculator_bp, url_prefix='/tools/simple-calculator')

    # 示例：纯前端工具
    from .tools.color_picker import color_picker_bp
    app.register_blueprint(color_picker_bp, url_prefix='/tools/color-picker')

    from .tools.image_converter import image_converter_bp
    app.register_blueprint(image_converter_bp, url_prefix='/tools/image_converter')


    from .tools.mindmap import mindmap_bp
    app.register_blueprint(mindmap_bp, url_prefix='/tools/mindmap')

    from .tools.img2pdf import img2pdf_bp
    app.register_blueprint(img2pdf_bp, url_prefix='/tools/img2pdf')

    # 注册其他工具蓝图...

    # 注册全局错误处理 (可选，也可以在蓝图内定义)
    @app.errorhandler(404)
    def page_not_found(e):
        return render_template('errors/404.html'), 404

    @app.errorhandler(500)
    def internal_server_error(e):
        return render_template('errors/500.html'), 500

    return app