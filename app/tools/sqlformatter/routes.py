from flask import render_template
from . import sqlformatter_bp

@sqlformatter_bp.route('/')
def index():
    """
    Render the SQL formatter tool main page.
    
    Returns:
        flask.Response: The rendered template for the SQL formatter tool.
    """
    return render_template('sqlformatter/index.html', 
                          subheader_title='/ SQL 格式化工具')