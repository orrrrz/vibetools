from flask import Blueprint
sqlformatter_bp = Blueprint('sqlformatter', __name__,
                                 template_folder='templates',
                                 static_folder='static',
                                 static_url_path='static') 

from . import routes 
