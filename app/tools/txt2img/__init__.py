from flask import Blueprint
txt2img_bp = Blueprint('txt2img', __name__,
                                 template_folder='templates',
                                 static_folder='static',
                                 static_url_path='static') 

from . import routes 
