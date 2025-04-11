from flask import Blueprint, render_template, request, jsonify, send_file
from .import mindmap_bp

@mindmap_bp.route('/')
def index():
    return render_template('mindmap/index.html')
