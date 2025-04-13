# Assuming your blueprint is defined in __init__.py or similar
# from . import txt2img_bp # Use this if txt2img_bp is defined in __init__.py
from flask import Blueprint, render_template

# If the blueprint isn't defined elsewhere, define it here for this example
# Make sure the blueprint name 'txt2img' matches the one used in url_for
from . import txt2img_bp

@txt2img_bp.route('/')
def index():
    """Renders the Xiaohongshu Image Generator tool page."""
    return render_template('txt2img/index.html',
                           page_title="小红书图片生成工具 - 氛围工具店",
                           header_title="氛围工具店",
                           subheader_title=" / 小红书图片生成",
                           content_title="小红书图片生成器")

# Make sure to register this blueprint in your main Flask app factory or app instance
# Example in your main app file (e.g., app.py or factory function):
# from .txt2img import routes as txt2img_routes
# app.register_blueprint(txt2img_routes.txt2img_bp, url_prefix='/tools/txt2img')
# Adjust url_prefix as needed for your site structure