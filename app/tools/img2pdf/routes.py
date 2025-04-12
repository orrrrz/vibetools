# -*- coding: utf-8 -*-
from flask import Blueprint, render_template, request, jsonify, send_file
import os
import uuid
import tempfile
from PIL import Image # Import Pillow's Image module
import img2pdf
import io
import logging
import shutil
import pillow_heif # Import the library

# Register the HEIF opener with Pillow
pillow_heif.register_heif_opener()

# Assuming your Blueprint is initialized like this:
# img2pdf_bp = Blueprint('img2pdf', __name__, template_folder='templates')
# Replace with your actual Blueprint initialization if different
# Example initialization (adjust as needed):
from . import img2pdf_bp # Import your Blueprint instance


# Configure logger
logging.basicConfig(level=logging.INFO) # Setup basic logging
logger = logging.getLogger(__name__)

# --- Constants ---
MAX_DIMENSION = 2048 # Maximum width or height allowed

# Determine TEMP_DIR relative to the current file's directory
# Goes up three levels from routes/img2pdf_routes.py to the project root, then into uploads/img2pdf/images
# Adjust the number of '..' if your file structure is different
try:
    current_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.abspath(os.path.join(current_dir, '..', '..', '..')) # Adjust if needed
    TEMP_DIR = os.path.join(project_root, 'uploads', 'img2pdf', 'images')
except NameError:
    # Fallback if __file__ is not defined (e.g., interactive session)
    TEMP_DIR = os.path.abspath(os.path.join('.', 'uploads', 'img2pdf', 'images'))
    logger.warning(f"Could not determine TEMP_DIR precisely using __file__, using relative path: {TEMP_DIR}")


if not os.path.exists(TEMP_DIR):
    os.makedirs(TEMP_DIR, exist_ok=True)
    logger.info(f"Created temporary directory: {TEMP_DIR}")
else:
     logger.info(f"Temporary directory exists: {TEMP_DIR}")


# Session storage (In-memory - replace for production)
SESSIONS = {}

@img2pdf_bp.route('/')
def index():
    # Ensure the template path is correct relative to your Flask app structure
    # If img2pdf_bp uses 'templates' folder, it should look for 'img2pdf/index.html' there.
    try:
        return render_template('img2pdf/index.html')
    except Exception as e:
         # Log the error if template rendering fails
         logger.error(f"Error rendering template img2pdf/index.html: {e}", exc_info=True)
         # Provide a simple error message or fallback
         return "Error loading the page. Please check server logs.", 500


@img2pdf_bp.route('/api/upload', methods=['POST'])
def upload_image():
    if 'images' not in request.files:
        logger.warning("Upload attempt with no 'images' field in request.files")
        return jsonify({'error': 'No images part in the request'}), 400

    images = request.files.getlist('images')

    # Filter out empty file objects
    images = [img for img in images if img.filename]

    if not images:
        logger.warning("Upload attempt with 'images' field, but no files selected.")
        return jsonify({'error': 'No image files selected for upload'}), 400

    session_id = str(uuid.uuid4())
    session_dir = os.path.join(TEMP_DIR, session_id)
    try:
        os.makedirs(session_dir)
        logger.info(f"Created session directory: {session_dir}")
    except OSError as e:
        logger.error(f"Failed to create session directory {session_dir}: {e}", exc_info=True)
        return jsonify({'error': 'Server error: Could not create storage directory'}), 500


    SESSIONS[session_id] = {
        'images': [],
        'directory': session_dir,
        'pdf_path': None
    }

    image_data_response = [] # Data to send back to the client
    processed_files_paths = [] # Keep track of successfully saved file paths for potential cleanup

    for img_file in images:
        original_filename = img_file.filename
        # Basic filename sanitization (replace non-alphanumeric/underscore/hyphen/dot with underscore)
        base, ext = os.path.splitext(original_filename)
        safe_base = "".join(c if c.isalnum() or c in ['_', '-'] else '_' for c in base)
        # Ensure extension starts with a dot, handle cases like ".jpeg" vs "jpeg"
        safe_ext = ext.lower() if ext else ''
        safe_filename_base = f"{uuid.uuid4()}_{safe_base}" # Use UUID to prevent collisions

        # We will determine the final extension after processing (e.g., HEIC -> JPG)
        # Let's set a preliminary path, it might change
        # Use a placeholder extension initially, or derive from original, but be ready to change it.
        temp_preliminary_filename = f"{safe_filename_base}{safe_ext}"
        img_save_path = os.path.join(session_dir, temp_preliminary_filename)

        img_object = None # Initialize img_object to None
        try:
            # --- Open image using Pillow (supports HEIC via pillow-heif) ---
            # Open directly from the stream to avoid saving original if it needs resize/conversion
            img_object = Image.open(img_file.stream)

            # Ensure image data is loaded (helps with some formats/operations)
            img_object.load()

            original_width, original_height = img_object.size
            width, height = original_width, original_height # Current dimensions
            logger.info(f"Processing image: {original_filename} (Original size: {width}x{height})")

            # --- Check for resizing ---
            max_dim = max(width, height)
            resized = False
            if max_dim > MAX_DIMENSION:
                scale_factor = MAX_DIMENSION / max_dim
                new_width = int(width * scale_factor)
                new_height = int(height * scale_factor)

                # Determine resampling filter (handle older Pillow versions)
                try:
                    resampling_filter = Image.Resampling.LANCZOS
                except AttributeError:
                    resampling_filter = Image.ANTIALIAS # Fallback for older Pillow

                logger.info(f"Resizing image {original_filename} from {width}x{height} to {new_width}x{new_height}")
                resized_img = img_object.resize((new_width, new_height), resampling_filter)

                # Close the original image object before replacing the variable if needed
                # Though Pillow handles this internally often, explicit close can be safer with streams
                try:
                    img_object.close()
                except Exception: pass # Ignore close errors

                img_object = resized_img # Replace with the resized version
                width, height = new_width, new_height # Update dimensions for metadata
                resized = True

            # --- Handle saving: Convert HEIC/HEIF to JPEG ---
            save_format = img_object.format # Get format detected by Pillow
            final_save_path = img_save_path # Start with the preliminary path
            final_ext = safe_ext

            if save_format in ['HEIF', 'HEIC']:
                logger.warning(f"Original image {original_filename} is HEIC/HEIF. Converting to JPEG.")
                final_ext = ".jpg"
                final_save_path = os.path.join(session_dir, f"{safe_filename_base}{final_ext}")
                save_options = {'format': 'JPEG', 'quality': 90} # Good quality JPEG
                # Ensure image is in a mode compatible with JPEG (e.g., RGB)
                if img_object.mode in ('RGBA', 'LA', 'P'):
                    logger.info(f"Converting image {original_filename} mode from {img_object.mode} to RGB for JPEG saving.")
                    # Create a white background image
                    bg = Image.new("RGB", img_object.size, (255, 255, 255))
                    # Paste the image (with alpha) onto the background
                    try:
                         # Use alpha mask if available
                         bg.paste(img_object, mask=img_object.split()[-1] if 'A' in img_object.mode else None)
                         img_object = bg
                    except IndexError: # Handle cases where split might fail (e.g., mode P without alpha?)
                         img_object = img_object.convert('RGB')

                elif img_object.mode != 'RGB':
                    img_object = img_object.convert('RGB')

            elif safe_ext.lower() not in ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff']:
                 # If original extension is not a standard web/image format, default to PNG for safety
                 logger.warning(f"Original image {original_filename} has uncommon extension '{safe_ext}'. Saving as PNG.")
                 final_ext = ".png"
                 final_save_path = os.path.join(session_dir, f"{safe_filename_base}{final_ext}")
                 save_options = {'format': 'PNG'}
            else:
                 # Keep original format if common and not HEIC
                 final_save_path = os.path.join(session_dir, f"{safe_filename_base}{safe_ext}")
                 # Let Pillow infer format from extension, or pass explicitly if needed
                 save_options = {} # Let Pillow decide based on path extension


            # --- Save the final image (original, resized, or converted) ---
            logger.info(f"Saving final image to: {final_save_path}")
            img_object.save(final_save_path, **save_options)
            processed_files_paths.append(final_save_path) # Add successfully saved path

            # --- Store image info for the session ---
            img_id = str(uuid.uuid4()) # Generate ID after successful processing/saving
            img_info = {
                'id': img_id,
                'name': original_filename, # Show original name to user
                'path': final_save_path,  # Store the ACTUAL path saved
                'size': f"{width}x{height}" # Store final dimensions
            }
            SESSIONS[session_id]['images'].append(img_info)

            # --- Prepare data for JSON response ---
            image_data_response.append({
                'id': img_id,
                'name': original_filename,
                'size': f"{width}x{height}" # Final dimensions
            })

        except pillow_heif.HeifError as he:
             logger.error(f"HEIF Error processing image {original_filename}: {str(he)}", exc_info=True)
             # Clean up already saved files for this failed request
             for fp in processed_files_paths:
                 if os.path.exists(fp): os.remove(fp)
             if os.path.exists(session_dir): shutil.rmtree(session_dir)
             if session_id in SESSIONS: del SESSIONS[session_id]
             return jsonify({'error': f'Error processing HEIC image {original_filename}. Is libheif installed? Details: {str(he)}'}), 400
        except Exception as e:
            logger.error(f"Error processing image {original_filename}: {str(e)}", exc_info=True)
             # Clean up already saved files for this failed request
            for fp in processed_files_paths:
                 if os.path.exists(fp): os.remove(fp)
            if os.path.exists(session_dir): shutil.rmtree(session_dir)
            if session_id in SESSIONS: del SESSIONS[session_id]
            return jsonify({'error': f'Error processing image {original_filename}: {str(e)}'}), 400
        finally:
            # Ensure the Pillow image object is closed
            if img_object:
                try:
                    img_object.close()
                except Exception as close_err:
                     logger.warning(f"Error closing image object for {original_filename}: {close_err}")


    # Check if after processing, any images were actually added successfully
    if not image_data_response:
         logger.warning(f"Session {session_id}: No images could be processed successfully.")
         if os.path.exists(session_dir):
             shutil.rmtree(session_dir)
         if session_id in SESSIONS:
            del SESSIONS[session_id]
         return jsonify({'error': 'No images could be processed successfully.'}), 400

    logger.info(f"Successfully processed {len(image_data_response)} images for session {session_id}.")
    return jsonify({
        'success': True,
        'session_id': session_id,
        'images': image_data_response
    })

# --- Keep other routes (/api/generate, /api/download, /api/cleanup) as they were ---
# They rely on the 'path' stored in SESSIONS, which now points to the
# potentially resized and format-converted image file.

@img2pdf_bp.route('/api/generate', methods=['POST'])
def generate_pdf():
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No JSON data received'}), 400

    session_id = data.get('session_id')

    if not session_id or session_id not in SESSIONS:
        logger.warning(f"Generate PDF request with invalid/unknown session ID: {session_id}")
        return jsonify({'error': 'Invalid session ID'}), 400

    session = SESSIONS[session_id]
    if not session.get('images'): # Check if 'images' key exists and is not empty
        logger.warning(f"Generate PDF request for session {session_id} with no images.")
        return jsonify({'error': 'No images found for this session'}), 400

    pdf_path = None # Initialize pdf_path to ensure it exists in case of early exit
    try:
        # Create a PDF file path within the session directory
        pdf_path = os.path.join(session['directory'], f'{session_id}_output.pdf')

        # Get the image paths IN THE ORDER they were added (or allow reordering later)
        # The paths should now point to the processed (resized/converted) images
        image_paths = [img_info['path'] for img_info in session['images']]

        # Check if paths actually exist before conversion
        valid_image_paths = [p for p in image_paths if p and os.path.exists(p)] # Added check for None/empty path
        if not valid_image_paths:
             logger.error(f"Session {session_id}: No valid source image files found for PDF generation.")
             return jsonify({'error': 'Source image files not found. They may have been cleaned up or failed processing.'}), 500

        if len(valid_image_paths) != len(image_paths):
             # Log which files were missing
             missing_files = set(image_paths) - set(valid_image_paths)
             logger.warning(f"Session {session_id}: Some image paths were invalid or missing: {missing_files}. Proceeding with valid paths: {valid_image_paths}")
             image_paths = valid_image_paths # Use only the valid paths

        # Create PDF using img2pdf
        logger.info(f"Generating PDF for session {session_id} with images: {image_paths} -> {pdf_path}")
        with open(pdf_path, "wb") as f:
            # img2pdf uses Pillow internally if available, so it benefits from pillow-heif for reading
            # and should handle the formats we saved (JPG, PNG etc.)
            f.write(img2pdf.convert(image_paths))

        # Store the PDF path in the session
        session['pdf_path'] = pdf_path
        logger.info(f"Successfully generated PDF for session {session_id} at {pdf_path}")

        return jsonify({
            'success': True,
            'session_id': session_id,
            'pdf_filename': os.path.basename(pdf_path)
        })
    except img2pdf.PdfTooLargeError as pdf_err:
        logger.error(f"Error generating PDF for session {session_id}: PDF size limit exceeded. {str(pdf_err)}")
        if pdf_path and os.path.exists(pdf_path):
            os.remove(pdf_path)
        session['pdf_path'] = None
        return jsonify({'error': f'Error generating PDF: The resulting PDF is too large. Try fewer or smaller images. {str(pdf_err)}'}), 500
    except Exception as e:
        import traceback
        logger.error(f"Error generating PDF for session {session_id}: {str(e)}", exc_info=True)
        traceback.print_exc()
        if pdf_path and os.path.exists(pdf_path):
            os.remove(pdf_path)
        session['pdf_path'] = None
        return jsonify({'error': f'Error generating PDF: {str(e)}'}), 500


@img2pdf_bp.route('/api/download/<session_id>')
def download_pdf(session_id):
    if not session_id or session_id not in SESSIONS:
        logger.warning(f"Download request for invalid/unknown session ID: {session_id}")
        return jsonify({'error': 'Invalid or expired session ID'}), 404

    session = SESSIONS[session_id]
    pdf_path = session.get('pdf_path')
    session_dir = session.get('directory') # Get directory for cleanup

    if not pdf_path or not os.path.exists(pdf_path):
        logger.warning(f"PDF download requested for session {session_id}, but PDF path '{pdf_path}' not found or invalid.")
        return jsonify({'error': 'PDF not generated or found for this session'}), 404

    try:
        download_name = f"converted_images_{session_id[:8]}.pdf"
        logger.info(f"Initiating download for session {session_id}, file: {pdf_path}, download name: {download_name}")

        # Use a wrapper function or context manager for cleanup might be more reliable
        # than @response.call_on_close in all environments.
        # For simplicity, we'll try call_on_close first.

        response = send_file(pdf_path,
                             as_attachment=True,
                             download_name=download_name,
                             mimetype='application/pdf')

        # Define cleanup logic
        def cleanup_session_data():
            try:
                if session_id in SESSIONS:
                    logger.info(f"Cleaning up session {session_id} after download response sent.")
                    # Retrieve directory again inside closure just in case SESSIONS changed? No, use captured session_dir.
                    local_session_dir = session_dir
                    # Remove session data first
                    del SESSIONS[session_id]
                    # Then remove the directory
                    if local_session_dir and os.path.exists(local_session_dir):
                        shutil.rmtree(local_session_dir)
                        logger.info(f"Removed directory {local_session_dir} for session {session_id}.")
                    elif local_session_dir:
                        logger.warning(f"Session directory {local_session_dir} for {session_id} not found during post-download cleanup.")

            except KeyError:
                 logger.warning(f"Session {session_id} already removed before post-download cleanup attempt.")
            except Exception as e:
                 logger.error(f"Error during post-download cleanup for session {session_id}: {e}", exc_info=True)

        # Register the cleanup function to be called when the response is closed
        # Note: Reliability depends on WSGI server and environment (e.g., gevent/eventlet)
        response.call_on_close(cleanup_session_data)

        return response

    except Exception as e:
        logger.error(f"Error sending PDF file for session {session_id}: {str(e)}", exc_info=True)
        return jsonify({'error': f'Server error while preparing download: {str(e)}'}), 500


@img2pdf_bp.route('/api/cleanup', methods=['POST'])
def cleanup():
    # This endpoint allows the client to explicitly request cleanup,
    # e.g., if they close the window before downloading.
    data = request.get_json()
    session_id = data.get('session_id') if data else None

    if session_id and session_id in SESSIONS:
        session_dir = None
        try:
            # Retrieve directory before deleting session data
            session_dir = SESSIONS[session_id].get('directory')

            logger.info(f"Explicit cleanup requested for session {session_id}.")
            # Remove session data first
            del SESSIONS[session_id]
            logger.info(f"Removed session data for {session_id}")

            # Then remove the directory if it exists
            if session_dir and os.path.exists(session_dir):
                shutil.rmtree(session_dir)
                logger.info(f"Removed directory {session_dir} for session {session_id}")
            elif session_dir:
                 logger.warning(f"Session directory {session_dir} for {session_id} not found during explicit cleanup.")

        except KeyError:
             logger.warning(f"Session {session_id} already removed before explicit cleanup attempt.")
             # If session_dir was retrieved before KeyError and exists, try removing it
             if session_dir and os.path.exists(session_dir):
                  try:
                      shutil.rmtree(session_dir)
                      logger.info(f"Removed directory {session_dir} after KeyError on session data (explicit cleanup).")
                  except Exception as e_inner:
                      logger.error(f"Error removing directory {session_dir} after KeyError for session {session_id} (explicit cleanup): {str(e_inner)}")

        except Exception as e:
            logger.error(f"Error during explicit cleanup for session {session_id}: {str(e)}", exc_info=True)
            # Still return success to client, as cleanup is best-effort server-side.
    elif session_id:
        logger.info(f"Explicit cleanup requested for non-existent or already cleaned session: {session_id}")
    else:
        logger.warning("Cleanup endpoint called without a session_id.")


    # Always return success from cleanup endpoint from client perspective
    return jsonify({'success': True})

# --- Optional: Background cleanup ---
# Consider adding a scheduled task (e.g., using APScheduler) to periodically scan TEMP_DIR
# and remove session directories older than a certain time (e.g., 1 hour) to prevent
# abandoned sessions from consuming disk space. This is more robust than relying solely
# on post-download or explicit cleanup.