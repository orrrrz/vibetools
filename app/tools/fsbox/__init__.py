from flask import Blueprint
fsbox_bp = Blueprint('fsbox', __name__,
                                 template_folder='templates',
                                 static_folder='static',
                                 static_url_path='static') 

from . import routes 
