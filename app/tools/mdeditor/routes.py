from flask import Blueprint, render_template, request, jsonify
from .import mdeditor_bp

@mdeditor_bp.route('/')
def index():
    print(f"mdeditor.root")
    return render_template('mdeditor/index.html')