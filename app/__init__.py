import os
import json
import importlib # 用于动态导入
import logging  # 引入 logging 模块
from flask import Flask, render_template
from config import config

def _register_tool_blueprints(app: Flask):
    """
    Loads tools configuration from tools.json and dynamically registers
    their blueprints with the Flask application.

    Args:
        app: The Flask application instance.
    """
    # 计算 tools.json 的路径 (假设它在项目根目录, 即 app 目录的上一级)
    json_path = os.path.join(app.config["PROJECT_ROOT"], "app", "tools.json")
    app.logger.info(f"Json path: {json_path}")

    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            tools_list = json.load(f)

        app.logger.info(f"Found {len(tools_list)} tools in {json_path}") # Log number of tools found

        for tool_info in tools_list:
            module_name = tool_info.get('module_name')
            url_prefix = tool_info.get('url')
            tool_name = tool_info.get('name', module_name) # 用于错误消息

            if not module_name or not url_prefix:
                app.logger.warning(f"Skipping tool registration: Missing 'module_name' or 'url' in tools.json entry for '{tool_name}'.")
                continue

            # 遵循约定：蓝图变量名为 <module_name>_bp
            blueprint_variable_name = f"{module_name}_bp"
            # 模块的完整导入路径
            module_import_path = f"app.tools.{module_name}"

            try:
                # 动态导入工具模块
                app.logger.debug(f"Attempting to import module: {module_import_path}")
                tool_module = importlib.import_module(module_import_path)
                # 从模块中获取蓝图实例
                app.logger.debug(f"Attempting to get attribute '{blueprint_variable_name}' from module {module_import_path}")
                blueprint_object = getattr(tool_module, blueprint_variable_name)
                # 注册蓝图
                app.register_blueprint(blueprint_object, url_prefix=url_prefix)
                app.logger.info(f"Successfully registered blueprint for tool '{tool_name}' from {module_import_path} with prefix '{url_prefix}'.")

            except ImportError as e:
                app.logger.error(f"Failed to import module for tool '{tool_name}': {module_import_path}. Error: {e}")
            except AttributeError as e:
                app.logger.error(f"Failed to find blueprint variable '{blueprint_variable_name}' in module {module_import_path} for tool '{tool_name}'. Error: {e}")
            except Exception as e:
                app.logger.error(f"An unexpected error occurred while registering blueprint for tool '{tool_name}' from {module_import_path}. Error: {e}", exc_info=True) # Log traceback

    except FileNotFoundError:
        app.logger.error(f"tools.json not found at {json_path}. No tool blueprints will be registered dynamically.")
    except json.JSONDecodeError:
        app.logger.error(f"Failed to decode tools.json at {json_path}. No tool blueprints will be registered dynamically.")
    except Exception as e:
         app.logger.error(f"An unexpected error occurred while loading tools.json. Error: {e}", exc_info=True) # Log traceback


# --- 应用工厂 ---
def create_app(config_name):
    """Creates and configures the Flask application."""
    app = Flask(__name__)
    app.config.from_object(config[config_name])
    config[config_name].init_app(app)

    # 配置日志记录 (如果尚未配置)
    if not app.debug and not app.testing:
        if app.config.get('LOG_TO_STDOUT'):
            stream_handler = logging.StreamHandler()
            stream_handler.setLevel(logging.INFO)
            app.logger.addHandler(stream_handler)
        else:
            # 可以配置写入文件的 Handler 等
            pass
        app.logger.setLevel(logging.INFO)
        app.logger.info('Application startup')


    # 初始化扩展 (如果需要)
    # from flask_sqlalchemy import SQLAlchemy
    # db = SQLAlchemy()
    # db.init_app(app)

    # --- 注册主蓝图 ---
    from .main import main as main_blueprint
    app.register_blueprint(main_blueprint)
    app.logger.info("Registered main blueprint.")

    # --- 调用辅助函数动态注册工具蓝图 ---
    _register_tool_blueprints(app)

    # --- 注册全局错误处理 ---
    @app.errorhandler(404)
    def page_not_found(e):
        # 确保你有 app/templates/errors/404.html
        try:
            return render_template('errors/404.html'), 404
        except Exception as render_err:
             app.logger.error(f"Error rendering 404 page: {render_err}")
             return "Page Not Found", 404


    @app.errorhandler(500)
    def internal_server_error(e):
         # 确保你有 app/templates/errors/500.html
        try:
            # 记录实际错误到日志
            app.logger.exception("An internal server error occurred")
            return render_template('errors/500.html'), 500
        except Exception as render_err:
            app.logger.error(f"Error rendering 500 page: {render_err}")
            return "Internal Server Error", 500


    # 可以在这里添加日志记录，查看已注册的路由
    # if app.debug:
    #    app.logger.debug(f"Registered URL Map:\n{app.url_map}")

    app.logger.info("Application creation finished.")
    return app