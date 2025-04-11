from flask import Blueprint

color_picker_bp = Blueprint('color_picker', __name__,
                            template_folder='templates',
                            static_folder='static',
                            static_url_path='static')

from . import routes