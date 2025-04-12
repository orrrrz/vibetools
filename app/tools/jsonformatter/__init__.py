from flask import Blueprint
jsonformatter_bp = Blueprint('jsonformatter', __name__,
                                 template_folder='templates',
                                 static_folder='static',
                                 static_url_path='static') 

from . import routes 
