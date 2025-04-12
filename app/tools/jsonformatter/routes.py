from flask import render_template
from . import jsonformatter_bp

@jsonformatter_bp.route('/')
def index():
    return render_template('jsonformatter/index.html')