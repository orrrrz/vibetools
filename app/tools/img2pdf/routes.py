from flask import Blueprint, render_template, request, jsonify, send_file
import os
import uuid
import tempfile
from PIL import Image
import img2pdf
import io
import logging
import shutil
from . import img2pdf_bp

# Configure logger
logger = logging.getLogger(__name__)

# Temporary directory for uploads
TEMP_DIR = os.path.join(tempfile.gettempdir(), 'img2pdf_uploads')
if not os.path.exists(TEMP_DIR):
    os.makedirs(TEMP_DIR)

# Session storage
SESSIONS = {}

@img2pdf_bp.route('/')
def index():
    return render_template('img2pdf/index.html')

@img2pdf_bp.route('/api/upload', methods=['POST'])
def upload_image():
    if 'images' not in request.files:
        return jsonify({'error': 'No images provided'}), 400
    
    images = request.files.getlist('images')
    
    if not images:
        return jsonify({'error': 'No images provided'}), 400
    
    # Generate a session id and directory for this batch of images
    session_id = str(uuid.uuid4())
    session_dir = os.path.join(TEMP_DIR, session_id)
    os.makedirs(session_dir)
    
    SESSIONS[session_id] = {
        'images': [],
        'directory': session_dir
    }
    
    image_data = []
    for img_file in images:
        try:
            # Save image to the temporary directory
            img_id = str(uuid.uuid4())
            img_path = os.path.join(session_dir, f"{img_id}_{img_file.filename}")
            img_file.save(img_path)
            
            # Open the image to get its properties
            with Image.open(img_path) as img:
                img_info = {
                    'id': img_id,
                    'name': img_file.filename,
                    'path': img_path,
                    'size': f"{img.width}x{img.height}"
                }
                SESSIONS[session_id]['images'].append(img_info)
                
                # Add to response
                image_data.append({
                    'id': img_id,
                    'name': img_file.filename,
                    'size': f"{img.width}x{img.height}"
                })
        except Exception as e:
            logger.error(f"Error processing image {img_file.filename}: {str(e)}")
            return jsonify({'error': f'Error processing image {img_file.filename}: {str(e)}'}), 400
    
    return jsonify({
        'success': True,
        'session_id': session_id,
        'images': image_data
    })

@img2pdf_bp.route('/api/generate', methods=['POST'])
def generate_pdf():
    data = request.get_json()
    session_id = data.get('session_id')
    
    if not session_id or session_id not in SESSIONS:
        return jsonify({'error': 'Invalid session ID'}), 400
    
    session = SESSIONS[session_id]
    if not session['images']:
        return jsonify({'error': 'No images found for this session'}), 400
    
    try:
        # Create a PDF file
        pdf_path = os.path.join(session['directory'], 'output.pdf')
        
        # Get the image paths
        image_paths = [img_info['path'] for img_info in session['images']]
        
        # Create PDF using img2pdf
        with open(pdf_path, "wb") as f:
            f.write(img2pdf.convert(image_paths))
        
        # Store the PDF path in the session
        session['pdf_path'] = pdf_path
        
        return jsonify({
            'success': True,
            'session_id': session_id
        })
    except Exception as e:
        import traceback
        logger.error(f"Error generating PDF: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': f'Error generating PDF: {str(e)}'}), 500

@img2pdf_bp.route('/api/download/<session_id>')
def download_pdf(session_id):
    if not session_id or session_id not in SESSIONS:
        return jsonify({'error': 'Invalid session ID'}), 400
    
    session = SESSIONS[session_id]
    if 'pdf_path' not in session:
        return jsonify({'error': 'PDF not found for this session'}), 404
    
    try:
        # Return the PDF file
        return send_file(session['pdf_path'], 
                         as_attachment=True, 
                         download_name=session_id + '.pdf')
    except Exception as e:
        logger.error(f"Error downloading PDF: {str(e)}")
        return jsonify({'error': f'Error downloading PDF: {str(e)}'}), 500

@img2pdf_bp.route('/api/cleanup', methods=['POST'])
def cleanup():
    data = request.get_json()
    session_id = data.get('session_id')
    
    if session_id and session_id in SESSIONS:
        try:
            # Remove session directory and all its contents
            session_dir = SESSIONS[session_id]['directory']
            if os.path.exists(session_dir):
                shutil.rmtree(session_dir)
            
            # Remove session data
            del SESSIONS[session_id]
        except Exception as e:
            logger.error(f"Error cleaning up session {session_id}: {str(e)}")
    
    return jsonify({'success': True}) 