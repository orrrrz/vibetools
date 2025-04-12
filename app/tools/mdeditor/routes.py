from flask import Blueprint, render_template, request, jsonify, send_file
from .services import StorageService
import io
import json
from .import mdeditor_bp

storage_service = StorageService()

@mdeditor_bp.route('/')
def index():
    return render_template('mdeditor/index.html')

@mdeditor_bp.route('/api/save', methods=['POST'])
def save_document():
    try:
        data = request.get_json()
        doc_id = data.get('id') or storage_service.generate_id()
        title = data.get('title', 'Untitled')
        content = data.get('content', '')
        
        doc = storage_service.format_doc(doc_id, title, content)
        return jsonify({"success": True, "id": doc_id, "title": title})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@mdeditor_bp.route('/api/export', methods=['POST'])
def export_document():
    try:
        data = request.get_json()
        content = data.get('content', '')
        title = data.get('title', 'untitled')
        
        # Create file in memory
        file_content = io.StringIO()
        file_content.write(content)
        file_content.seek(0)
        
        return send_file(
            io.BytesIO(file_content.read().encode('utf-8')),
            mimetype='text/markdown',
            as_attachment=True,
            download_name=f"{title}.md"
        )
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

@mdeditor_bp.route('/api/import', methods=['POST'])
def import_document():
    try:
        if 'file' not in request.files:
            return jsonify({"success": False, "error": "No file provided"}), 400
            
        file = request.files['file']
        if file.filename == '':
            return jsonify({"success": False, "error": "No file selected"}), 400
            
        content = file.read().decode('utf-8')
        doc_id = storage_service.generate_id()
        title = file.filename.rsplit('.', 1)[0]
        
        return jsonify({
            "success": True,
            "id": doc_id,
            "title": title,
            "content": content
        })
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500