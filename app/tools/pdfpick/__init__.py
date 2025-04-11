from flask import Blueprint
pdfpick_bp = Blueprint('pdfpick', __name__,
                                 template_folder='templates',
                                 static_folder='static',
                                 static_url_path='static') 

from . import routes 
