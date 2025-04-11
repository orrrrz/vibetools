from flask import Blueprint, render_template, request, jsonify, url_for, send_from_directory
from werkzeug.utils import secure_filename
import os
import uuid
from PIL import Image, ImageOps
from datetime import datetime
import io
import imghdr
import base64
import logging
from . import image_converter_bp

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Create upload directory with absolute path
UPLOAD_FOLDER = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'uploads/image_converter/images'))
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}

os.makedirs(UPLOAD_FOLDER, exist_ok=True)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@image_converter_bp.route('/')
def index():
    return render_template('image_converter/index.html')

@image_converter_bp.route('/api/upload', methods=['POST'])
def upload_image():
    logging.info("Upload request received")
    
    if 'image' not in request.files:
        logging.error("No file part in request")
        return jsonify({'success': False, 'error': 'No file part'}), 400
    
    file = request.files['image']
    logging.info(f"File received: {file.filename}")
    
    if file.filename == '':
        logging.error("No selected file")
        return jsonify({'success': False, 'error': 'No selected file'}), 400
    
    if file and allowed_file(file.filename):
        try:
            filename = secure_filename(file.filename)
            unique_filename = f"{uuid.uuid4()}_{filename}"
            filepath = os.path.join(UPLOAD_FOLDER, unique_filename)
            logging.info(f"Saving file to {filepath}")
            file.save(filepath)
            
            # Get image info
            with Image.open(filepath) as img:
                width, height = img.size
                format = img.format.lower()
            
            response_data = {
                'success': True, 
                'filename': unique_filename,
                'originalName': filename,
                'width': width,
                'height': height,
                'format': format,
                'url': f"/tools/image_converter/api/images/{unique_filename}"
            }
            logging.info(f"Upload successful: {response_data}")
            return jsonify(response_data)
        except Exception as e:
            logging.exception(f"Error during upload: {str(e)}")
            return jsonify({'success': False, 'error': f'Error during upload: {str(e)}'}), 500
    
    logging.error(f"File type not allowed: {file.filename}")
    return jsonify({'success': False, 'error': 'File type not allowed'}), 400

@image_converter_bp.route('/api/images/<filename>')
def get_image(filename):
    logging.info(f"Attempting to serve image: {filename} from {UPLOAD_FOLDER}")
    if not os.path.exists(os.path.join(UPLOAD_FOLDER, filename)):
        logging.error(f"File not found: {os.path.join(UPLOAD_FOLDER, filename)}")
        return jsonify({'error': 'File not found'}), 404
    return send_from_directory(UPLOAD_FOLDER, filename)

@image_converter_bp.route('/api/edit', methods=['POST'])
def edit_image():
    data = request.json
    filename = data.get('filename')
    operations = data.get('operations', [])
    output_format = data.get('format', 'jpeg').lower()
    
    if not filename:
        return jsonify({'success': False, 'error': 'No filename provided'}), 400
    
    filepath = os.path.join(UPLOAD_FOLDER, filename)
    
    if not os.path.exists(filepath):
        return jsonify({'success': False, 'error': 'File not found'}), 404
    
    try:
        img = Image.open(filepath)
        
        for op in operations:
            op_type = op.get('type')
            
            if op_type == 'resize':
                width = op.get('width')
                height = op.get('height')
                if width and height:
                    img = img.resize((int(width), int(height)), Image.LANCZOS)
            
            elif op_type == 'crop':
                left = op.get('left', 0)
                top = op.get('top', 0)
                right = op.get('right', img.width)
                bottom = op.get('bottom', img.height)
                img = img.crop((int(left), int(top), int(right), int(bottom)))
            
            elif op_type == 'rotate':
                angle = op.get('angle', 0)
                img = img.rotate(float(angle), expand=True)
            
            elif op_type == 'flip':
                direction = op.get('direction', 'horizontal')
                if direction == 'horizontal':
                    img = ImageOps.mirror(img)
                elif direction == 'vertical':
                    img = ImageOps.flip(img)
            
            elif op_type == 'grayscale':
                img = ImageOps.grayscale(img)
        
        # Extract the original filename without any previous 'edited_' prefixes
        original_filename = filename
        # Remove any existing "edited_UUID_" prefixes
        while original_filename.startswith("edited_"):
            # Find the second underscore (after the UUID)
            second_underscore = original_filename.find("_", 7)
            if second_underscore > 0:
                original_filename = original_filename[second_underscore+1:]
            else:
                break
                
        # Create a new clean filename
        edited_filename = f"edited_{uuid.uuid4()}_{original_filename}"
        edited_filepath = os.path.join(UPLOAD_FOLDER, edited_filename)
        
        # Make sure the output format is valid
        if output_format not in ALLOWED_EXTENSIONS:
            output_format = 'jpeg'
        
        # Save using the requested format
        img.save(edited_filepath, format=output_format.upper())
        
        # Get image info for the edited image
        with Image.open(edited_filepath) as edited_img:
            width, height = edited_img.size
        
        return jsonify({
            'success': True,
            'filename': edited_filename,
            'width': width,
            'height': height,
            'format': output_format,
            'url': f"/tools/image_converter/api/images/{edited_filename}"
        })
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500