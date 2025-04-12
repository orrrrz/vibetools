from flask import Blueprint, render_template, request, jsonify, send_file
import os
import uuid
import tempfile
from PIL import Image
import img2pdf
import io
import logging
import shutil
import pillow_heif # Import the library

# Register the HEIF opener with Pillow
# This allows Image.open() to handle .heic/.heif files
pillow_heif.register_heif_opener() 

from . import img2pdf_bp # Assuming this is how your Blueprint is initialized relative to the file

# Configure logger
logger = logging.getLogger(__name__)

# Temporary directory for uploads
# Consider making TEMP_DIR more robust or configurable
TEMP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'uploads/img2pdf/images'))
if not os.path.exists(TEMP_DIR):
    # Use exist_ok=True to avoid race conditions if multiple processes start simultaneously
    os.makedirs(TEMP_DIR, exist_ok=True) 

# Session storage (Consider using a more persistent/scalable solution for production)
SESSIONS = {}

@img2pdf_bp.route('/')
def index():
    return render_template('img2pdf/index.html')

@img2pdf_bp.route('/api/upload', methods=['POST'])
def upload_image():
    if 'images' not in request.files:
        return jsonify({'error': 'No images provided'}), 400
    
    images = request.files.getlist('images')
    
    # Filter out empty file objects if any (e.g., if no file was selected in a field)
    images = [img for img in images if img.filename]
    
    if not images:
        return jsonify({'error': 'No valid images provided'}), 400
    
    # Generate a session id and directory for this batch of images
    session_id = str(uuid.uuid4())
    session_dir = os.path.join(TEMP_DIR, session_id)
    os.makedirs(session_dir)
    
    SESSIONS[session_id] = {
        'images': [],
        'directory': session_dir,
        'pdf_path': None # Initialize pdf_path
    }
    
    image_data = []
    processed_files = [] # Keep track of successfully saved files for potential cleanup on error

    for img_file in images:
        # Sanitize filename slightly (optional, but good practice)
        original_filename = img_file.filename
        base, ext = os.path.splitext(original_filename)
        # Simple sanitization: replace spaces, keep alphanumeric, underscore, hyphen, dot
        safe_base = "".join(c if c.isalnum() or c in ['_', '-'] else '_' for c in base)
        safe_filename = f"{safe_base}{ext}"
        
        img_id = str(uuid.uuid4())
        img_path = os.path.join(session_dir, f"{img_id}_{safe_filename}")
        
        try:
            # Save image to the temporary directory
            img_file.save(img_path)
            processed_files.append(img_path) # Add to list before attempting to open

            # Open the image using Pillow (now supports HEIC) to get its properties
            # Use a try-finally block to ensure the file handle is closed
            img = None 
            try:
                img = Image.open(img_path)
                # Ensure image data is loaded if needed, especially for formats like HEIC
                # which might be lazily loaded. Getting size usually suffices.
                width, height = img.size 
                
                img_info = {
                    'id': img_id,
                    'name': original_filename, # Show original name to user
                    'path': img_path,
                    'size': f"{width}x{height}"
                }
                SESSIONS[session_id]['images'].append(img_info)
                
                # Add to response
                image_data.append({
                    'id': img_id,
                    'name': original_filename,
                    'size': f"{width}x{height}"
                })
            finally:
                 if img:
                    img.close() # Explicitly close the image file handle

        except pillow_heif.HeifError as he:
             logger.error(f"HEIF Error processing image {original_filename}: {str(he)}")
             # Clean up already saved files for this failed request
             for fp in processed_files:
                 if os.path.exists(fp):
                     os.remove(fp)
             if os.path.exists(session_dir):
                 shutil.rmtree(session_dir) # Remove session dir if upload fails mid-way
             if session_id in SESSIONS:
                 del SESSIONS[session_id] # Clean up session data
             return jsonify({'error': f'Error processing HEIC image {original_filename}: Is libheif installed correctly? {str(he)}'}), 400
        except Exception as e:
            logger.error(f"Error processing image {original_filename}: {str(e)}")
            # Clean up already saved files for this failed request
            for fp in processed_files:
                 if os.path.exists(fp):
                     os.remove(fp)
            if os.path.exists(session_dir):
                 shutil.rmtree(session_dir) # Remove session dir if upload fails mid-way
            if session_id in SESSIONS:
                 del SESSIONS[session_id] # Clean up session data
            return jsonify({'error': f'Error processing image {original_filename}: {str(e)}'}), 400
            
    # Check if after processing, any images were actually added successfully
    if not image_data:
         # This case might occur if all images failed processing
         if os.path.exists(session_dir):
             shutil.rmtree(session_dir)
         if session_id in SESSIONS:
            del SESSIONS[session_id]
         return jsonify({'error': 'No images could be processed successfully.'}), 400

    return jsonify({
        'success': True,
        'session_id': session_id,
        'images': image_data
    })

@img2pdf_bp.route('/api/generate', methods=['POST'])
def generate_pdf():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No JSON data received'}), 400
        
    session_id = data.get('session_id')
    
    if not session_id or session_id not in SESSIONS:
        return jsonify({'error': 'Invalid session ID'}), 400
    
    session = SESSIONS[session_id]
    if not session.get('images'): # Check if 'images' key exists and is not empty
        return jsonify({'error': 'No images found for this session'}), 400
    
    try:
        # Create a PDF file path
        pdf_path = os.path.join(session['directory'], f'{session_id}_output.pdf')
        
        # Get the image paths IN THE ORDER they were added (or allow reordering later)
        image_paths = [img_info['path'] for img_info in session['images']]

        # Check if paths actually exist before conversion
        valid_image_paths = [p for p in image_paths if os.path.exists(p)]
        if not valid_image_paths:
             return jsonify({'error': 'Source image files not found.'}), 500
        if len(valid_image_paths) != len(image_paths):
             logger.warning(f"Session {session_id}: Some image paths were invalid.")
             # Decide whether to proceed with valid paths or fail
             # Proceeding with valid paths for robustness:
             image_paths = valid_image_paths

        # Create PDF using img2pdf
        # img2pdf uses Pillow internally if available, so it should benefit from pillow-heif
        with open(pdf_path, "wb") as f:
            f.write(img2pdf.convert(image_paths))
        
        # Store the PDF path in the session
        session['pdf_path'] = pdf_path
        
        return jsonify({
            'success': True,
            'session_id': session_id,
            # Optionally return pdf filename or a download hint
            'pdf_filename': os.path.basename(pdf_path) 
        })
    except img2pdf.PdfTooLargeError as pdf_err:
        logger.error(f"Error generating PDF for session {session_id}: PDF size limit exceeded. {str(pdf_err)}")
        # Clean up potentially partially created PDF
        if os.path.exists(pdf_path):
            os.remove(pdf_path)
        session['pdf_path'] = None # Ensure pdf_path is cleared
        return jsonify({'error': f'Error generating PDF: The resulting PDF is too large. {str(pdf_err)}'}), 500
    except Exception as e:
        import traceback
        logger.error(f"Error generating PDF for session {session_id}: {str(e)}")
        traceback.print_exc()
         # Clean up potentially partially created PDF
        if 'pdf_path' in locals() and os.path.exists(pdf_path):
            os.remove(pdf_path)
        session['pdf_path'] = None # Ensure pdf_path is cleared
        return jsonify({'error': f'Error generating PDF: {str(e)}'}), 500

@img2pdf_bp.route('/api/download/<session_id>')
def download_pdf(session_id):
    if not session_id or session_id not in SESSIONS:
        # Use 404 Not Found for invalid/expired sessions trying to download
        return jsonify({'error': 'Invalid or expired session ID'}), 404 
    
    session = SESSIONS[session_id]
    
    # Use session.get('pdf_path') for safer access
    pdf_path = session.get('pdf_path') 
    
    if not pdf_path or not os.path.exists(pdf_path):
        # PDF might not have been generated yet, or was cleaned up
        logger.warning(f"PDF download requested for session {session_id}, but PDF path '{pdf_path}' not found or invalid.")
        return jsonify({'error': 'PDF not generated or found for this session'}), 404
    
    try:
        # Generate a user-friendly download name
        session_dir = SESSIONS[session_id].get('directory')
        download_name = f"converted_images_{session_id[:8]}.pdf"
        
        # Return the PDF file
        response = send_file(pdf_path, 
                             as_attachment=True, 
                             download_name=download_name,
                             mimetype='application/pdf')

        # 在这里添加一个回调，当文件发送完成后执行清理
        # 注意: @response.call_on_close 在某些部署环境（如 gevent/eventlet）下可能不完全可靠
        # 或者使用 try...finally 结构（如果 send_file 引发异常则不清理）
        # 更简单的做法可能是在 send_file 成功返回 *之后* 清理，但这假设 send_file 是同步完成的。

        # 尝试在响应发送后清理（可能需要测试可靠性）
        @response.call_on_close
        def process_cleanup():
             try:
                 if session_id in SESSIONS:
                     logger.info(f"Cleaning up session {session_id} after download.")
                     if session_dir and os.path.exists(session_dir):
                          shutil.rmtree(session_dir)
                          logger.info(f"Removed directory {session_dir} for session {session_id} after download.")
                     del SESSIONS[session_id]
             except Exception as e:
                 logger.error(f"Error during post-download cleanup for session {session_id}: {e}")

        return response
    except Exception as e:
        logger.error(f"Error sending PDF file for session {session_id}: {str(e)}")
        return jsonify({'error': f'Server error while preparing download: {str(e)}'}), 500

@img2pdf_bp.route('/api/cleanup', methods=['POST'])
def cleanup():
    data = request.get_json()
    session_id = data.get('session_id') if data else None # Handle case where data is None
    
    if session_id and session_id in SESSIONS:
        session_dir = None
        try:
            # Retrieve directory before deleting session data
            session_dir = SESSIONS[session_id].get('directory') 
            
            # Remove session data first
            del SESSIONS[session_id]
            logger.info(f"Removed session data for {session_id}")

            # Then remove the directory if it exists
            if session_dir and os.path.exists(session_dir):
                shutil.rmtree(session_dir)
                logger.info(f"Removed directory {session_dir} for session {session_id}")
            elif session_dir:
                 logger.warning(f"Session directory {session_dir} for {session_id} not found during cleanup.")

        except KeyError:
             logger.warning(f"Session {session_id} already removed before cleanup attempt.")
             # If session_dir was retrieved before KeyError and exists, try removing it
             if session_dir and os.path.exists(session_dir):
                  try:
                      shutil.rmtree(session_dir)
                      logger.info(f"Removed directory {session_dir} after KeyError on session data.")
                  except Exception as e_inner:
                      logger.error(f"Error removing directory {session_dir} after KeyError for session {session_id}: {str(e_inner)}")

        except Exception as e:
            logger.error(f"Error during cleanup for session {session_id}: {str(e)}")
            # Avoid returning error to client for cleanup issues, just log it
    elif session_id:
        logger.info(f"Cleanup requested for non-existent or already cleaned session: {session_id}")
        
    # Always return success from cleanup endpoint from client perspective
    return jsonify({'success': True}) 

# Optional: Add a background task or mechanism to clean up old sessions/files
# For example, using APScheduler or a simple periodic check.