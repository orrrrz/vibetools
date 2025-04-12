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
import datetime # For logging timestamps if needed
import time # For background cleanup logic

# --- Register the HEIF opener with Pillow ---
try:
    pillow_heif.register_heif_opener()
    logging.info("Successfully registered HEIF opener.")
except Exception as e:
    # Log the error, but allow the app to continue if HEIF isn't strictly required
    # or if pillow-heif might not be installed everywhere.
    logging.error(f"Failed to register HEIF opener: {e}. HEIC/HEIF support may be unavailable.", exc_info=True)
    # If HEIF support is critical, you might want to raise an error here:
    # raise RuntimeError("HEIF support could not be initialized.") from e

# --- Flask Blueprint Setup ---
# Replace with your actual Blueprint initialization
# Example: from . import img2pdf_bp
# Mock Blueprint for standalone execution/testing:
from . import img2pdf_bp
# --- End Mock Blueprint ---


# --- Configure Logging ---
# Use a more detailed format, especially useful for debugging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - [%(funcName)s:%(lineno)d] - %(message)s'
)
logger = logging.getLogger(__name__) # Get logger for this module

# --- Constants ---
MAX_DIMENSION = 2048 # Maximum width or height allowed for resizing
SESSION_CLEANUP_DELAY = 3600 # Seconds before an inactive session is eligible for cleanup (e.g., 1 hour)

# --- Determine Temporary Directory ---
# Tries to create a specific uploads directory relative to the project root.
# Adjust the path traversal ('..') based on your project structure.
try:
    current_file_dir = os.path.dirname(os.path.abspath(__file__))
    # Example: If this file is in 'project/app/routes/img2pdf_routes.py'
    # Go up 3 levels to get to 'project/' then down to 'uploads/img2pdf/images'
    project_root = os.path.abspath(os.path.join(current_file_dir, '..', '..', '..')) # ADJUST AS NEEDED
    TEMP_DIR = os.path.join(project_root, 'uploads', 'img2pdf', 'images')
    logger.info(f"Calculated TEMP_DIR based on __file__: {TEMP_DIR}")
except NameError:
    # Fallback if __file__ is not defined (e.g., interactive session, some test setups)
    TEMP_DIR = os.path.abspath(os.path.join('.', 'uploads', 'img2pdf', 'images'))
    logger.warning(f"Could not determine TEMP_DIR precisely using __file__, using relative path: {TEMP_DIR}")

# --- Ensure Temporary Directory Exists ---
if not os.path.exists(TEMP_DIR):
    try:
        # exist_ok=True prevents error if directory already exists (e.g., race condition)
        os.makedirs(TEMP_DIR, exist_ok=True)
        logger.info(f"Created temporary directory: {TEMP_DIR}")
    except OSError as e:
        logger.error(f"CRITICAL: Failed to create temporary directory {TEMP_DIR}: {e}. Check permissions.", exc_info=True)
        # Fallback to system temp could be an option, but might have security implications
        # TEMP_DIR = tempfile.gettempdir()
        # logger.warning(f"Falling back to system temp directory: {TEMP_DIR}")
        # Depending on requirements, might be better to halt application startup
        raise RuntimeError(f"Could not create required directory {TEMP_DIR}") from e
else:
     logger.info(f"Temporary directory exists: {TEMP_DIR}")


# --- Session Storage ---
# WARNING: In-memory dictionary is NOT suitable for production.
# It doesn't scale, isn't persistent, and won't work with multiple server processes/workers.
# Use Redis, Memcached, a database, or a distributed cache in production.
SESSIONS = {} # Stores { session_id: {'images': [], 'directory': path, 'pdf_path': path, 'last_accessed': timestamp} }

# --- Helper Function to Update Session Timestamp ---
def touch_session(session_id):
    if session_id in SESSIONS:
        SESSIONS[session_id]['last_accessed'] = time.time()

# --- Routes ---

@img2pdf_bp.route('/')
def index():
    """Serves the main HTML page for the image to PDF tool."""
    try:
        # Ensure 'img2pdf/index.html' is findable by Flask's template loader
        # relative to the blueprint's template folder or the app's main template folder.
        return render_template('img2pdf/index.html')
    except Exception as e:
         # Log the full error trace for debugging
         logger.error(f"Error rendering template 'img2pdf/index.html': {e}", exc_info=True)
         # Provide a user-friendly error message
         return "Error loading the page. Please contact support or check server logs.", 500


@img2pdf_bp.route('/api/upload', methods=['POST'])
def upload_image():
    """Handles image uploads, processing (resize, convert), and session creation."""
    # Check if the post request has the file part
    if 'images' not in request.files:
        logger.warning("Upload attempt failed: 'images' part missing in request.files.")
        return jsonify({'error': 'No images part in the request'}), 400

    # Get list of uploaded files
    uploaded_files = request.files.getlist('images')

    # Filter out any potential empty file inputs (where user didn't select a file)
    images_to_process = [img for img in uploaded_files if img.filename]

    if not images_to_process:
        logger.warning("Upload attempt failed: 'images' field present, but no files were selected.")
        return jsonify({'error': 'No image files selected for upload'}), 400

    # --- Create a new session for this upload batch ---
    session_id = str(uuid.uuid4())
    session_dir = os.path.join(TEMP_DIR, session_id)
    try:
        os.makedirs(session_dir)
        logger.info(f"[{session_id}] Created session directory: {session_dir}")
    except OSError as e:
        logger.error(f"[{session_id}] Failed to create session directory {session_dir}: {e}", exc_info=True)
        return jsonify({'error': 'Server error: Could not create temporary storage directory'}), 500

    # Initialize session data
    SESSIONS[session_id] = {
        'images': [],           # List to store info about each processed image
        'directory': session_dir, # Path to the session's temporary directory
        'pdf_path': None,       # Path to the generated PDF (once created)
        'last_accessed': time.time() # Timestamp for cleanup purposes
    }
    logger.info(f"[{session_id}] Initialized new session.")

    image_data_response = [] # List of image details to send back to the client
    # List to keep track of file paths created IN THIS REQUEST for potential cleanup if error occurs mid-batch
    processed_files_this_request = []

    # --- Process each uploaded image file ---
    for i, img_file_storage in enumerate(images_to_process):
        original_filename = img_file_storage.filename
        log_prefix = f"[{session_id}][Image {i+1}/{len(images_to_process)}: '{original_filename}']"
        logger.info(f"{log_prefix} Starting processing.")

        img_object = None # Pillow Image object for the original uploaded image
        img_to_save = None # Pillow Image object for the final version to be saved (potentially resized/converted)
        final_save_path = None # Full path where the processed image will be saved

        try:
            # --- Sanitize filename and create unique base name ---
            base, ext = os.path.splitext(original_filename)
            # Replace potentially problematic characters in the base name
            safe_base = "".join(c if c.isalnum() or c in ['_', '-'] else '_' for c in base)
            safe_ext = ext.lower() if ext else '' # Ensure extension is lowercase
            # Generate a unique filename using UUID to prevent collisions
            unique_filename_base = f"{uuid.uuid4()}_{safe_base}"

            # --- Open image using Pillow ---
            # Reading directly from the stream avoids saving the original file unnecessarily
            img_file_storage.stream.seek(0) # Ensure stream is at the beginning
            img_object = Image.open(img_file_storage.stream)

            # Load image data into memory. This can catch some corrupted files early.
            img_object.load()

            original_width, original_height = img_object.size
            original_mode = img_object.mode
            detected_format = img_object.format # Format detected by Pillow
            logger.info(f"{log_prefix} Opened. Original Size: {original_width}x{original_height}, Mode: {original_mode}, Detected Format: {detected_format}")

            # Start with the loaded image object as the one to potentially save
            img_to_save = img_object

            # --- Resizing Logic ---
            current_width, current_height = original_width, original_height
            max_dim = max(current_width, current_height)
            if max_dim > MAX_DIMENSION:
                scale_factor = MAX_DIMENSION / max_dim
                new_width = int(current_width * scale_factor)
                new_height = int(current_height * scale_factor)
                logger.info(f"{log_prefix} Resizing from {current_width}x{current_height} to {new_width}x{new_height}")

                # Determine resampling filter (use LANCZOS for quality, fallback for older Pillow)
                try:
                    resampling_filter = Image.Resampling.LANCZOS
                except AttributeError:
                    resampling_filter = Image.ANTIALIAS # Fallback for Pillow < 9.1.0

                resized_img = img_to_save.resize((new_width, new_height), resampling_filter)

                # Close the previous image object if a new one was created by resize
                if img_to_save is not resized_img:
                    logger.debug(f"{log_prefix} Closing pre-resize image object.")
                    img_to_save.close()

                img_to_save = resized_img # Update reference to the resized image
                current_width, current_height = new_width, new_height # Update dimensions for metadata
                logger.info(f"{log_prefix} Resized successfully.")
            else:
                 logger.info(f"{log_prefix} No resizing needed (dimensions within limit).")

            # --- Determine Target Format and Handle Mode Conversions ---
            current_mode = img_to_save.mode # Mode of the (potentially resized) image
            target_format = None # Target format for saving (e.g., 'JPEG', 'PNG')
            final_ext_override = None # Use this if conversion changes the file extension

            # 1. Handle HEIC/HEIF: Convert to JPEG for wider compatibility in PDFs
            #    (img2pdf might handle HEIC directly if libheif is installed, but converting ensures it)
            if detected_format in ['HEIF', 'HEIC']:
                logger.info(f"{log_prefix} Detected HEIC/HEIF. Planning conversion to JPEG.")
                target_format = 'JPEG'
                final_ext_override = ".jpg"
            # 2. Handle Uncommon Extensions: Convert to PNG as a safe, widely supported format
            elif safe_ext not in ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp']:
                 logger.warning(f"{log_prefix} Original file has uncommon extension '{safe_ext}'. Planning conversion to PNG.")
                 target_format = 'PNG'
                 final_ext_override = ".png"
            # 3. Determine if mode conversion is needed for the intended format
            else:
                # Generally, try to keep the original common format unless mode dictates otherwise
                # Use detected format if available, otherwise guess from extension or default to PNG
                if detected_format and detected_format.upper() in ['JPEG', 'PNG', 'GIF', 'BMP', 'TIFF', 'WEBP']:
                     target_format = detected_format.upper()
                elif safe_ext in ['.jpg', '.jpeg']:
                     target_format = 'JPEG'
                elif safe_ext == '.png':
                     target_format = 'PNG'
                # Add more elif for other extensions if needed
                else:
                     logger.warning(f"{log_prefix} Could not determine reliable target format from detected='{detected_format}', ext='{safe_ext}'. Defaulting to PNG.")
                     target_format = 'PNG'
                     final_ext_override = ".png" # Ensure extension matches if defaulting

                # Check if the current mode is incompatible with the target format
                if target_format == 'JPEG' and current_mode not in ('RGB', 'L', 'CMYK'):
                    logger.info(f"{log_prefix} Mode '{current_mode}' is incompatible with JPEG target. Planning conversion.")
                    # Conversion logic below will handle this.
                elif target_format == 'BMP' and current_mode not in ('RGB', 'L', 'P', 'RGBA'): # BMP supports limited modes
                    logger.info(f"{log_prefix} Mode '{current_mode}' may be incompatible with BMP target. Planning conversion to RGB.")
                    # Conversion logic below will handle this.
                # Add checks for other formats if necessary

            # --- Perform Mode Conversion if Required ---
            # Conversion is needed if:
            # a) Target format is JPEG and source has transparency (RGBA, LA, P with transparency).
            # b) Target format requires a specific mode (like RGB) and source is different.
            # c) We explicitly decided to convert (e.g., HEIC -> JPEG).

            needs_flattening = target_format == 'JPEG' and current_mode in ('RGBA', 'LA', 'P')
            # Check if conversion to RGB is needed (excluding cases already handled by flattening)
            needs_rgb_conversion = not needs_flattening and \
                                   ((target_format == 'JPEG' and current_mode not in ('RGB', 'L', 'CMYK')) or \
                                    (target_format == 'BMP' and current_mode not in ('RGB', 'L', 'P', 'RGBA')) or \
                                    (final_ext_override and current_mode not in ('RGB', 'L', 'RGBA', 'LA', 'P'))) # If changing format, ensure basic compatibility

            if needs_flattening:
                # Flatten image with transparency onto a white background for JPEG
                logger.info(f"{log_prefix} Flattening mode '{current_mode}' onto white background for {target_format} saving.")
                flattened_img = None
                try:
                    # Create a new RGB image with a white background
                    bg = Image.new("RGB", img_to_save.size, (255, 255, 255))
                    # Paste the image onto the background. Pillow's paste handles the alpha mask correctly.
                    bg.paste(img_to_save, (0, 0), img_to_save)
                    flattened_img = bg # Keep reference to the new object
                    logger.info(f"{log_prefix} Successfully flattened image to RGB.")

                    # Close the previous image object (the one with transparency)
                    logger.debug(f"{log_prefix} Closing pre-flattening image object.")
                    img_to_save.close()
                    img_to_save = flattened_img # Update reference to the flattened image
                    current_mode = img_to_save.mode # Update mode tracker

                except Exception as flatten_err:
                    logger.error(f"{log_prefix} Error during flattening: {flatten_err}. Attempting fallback convert('RGB').", exc_info=True)
                    # Clean up background image if created but not used
                    if 'bg' in locals() and flattened_img is not bg:
                        try: bg.close()
                        except Exception: pass
                    # Fallback: Simple conversion to RGB (might use black background for transparency)
                    try:
                        logger.warning(f"{log_prefix} Falling back to simple convert('RGB').")
                        converted_img = img_to_save.convert('RGB')
                        logger.debug(f"{log_prefix} Closing pre-fallback-conversion image object.")
                        img_to_save.close()
                        img_to_save = converted_img
                        current_mode = img_to_save.mode
                        logger.info(f"{log_prefix} Fallback convert('RGB') successful.")
                    except Exception as convert_err:
                         logger.error(f"{log_prefix} Fallback convert('RGB') also failed: {convert_err}", exc_info=True)
                         # Re-raise the error to be caught by the main handler for this image
                         raise convert_err

            elif needs_rgb_conversion:
                # Convert modes like CMYK, YCbCr, etc., to RGB if necessary for the target format
                logger.info(f"{log_prefix} Converting mode '{current_mode}' to RGB for {target_format or 'saving'}.")
                try:
                    converted_img = img_to_save.convert('RGB')
                    logger.debug(f"{log_prefix} Closing pre-RGB-conversion image object.")
                    img_to_save.close()
                    img_to_save = converted_img
                    current_mode = img_to_save.mode # Update mode tracker
                    logger.info(f"{log_prefix} Successfully converted to mode '{current_mode}'.")
                except Exception as convert_err:
                    logger.error(f"{log_prefix} Failed to convert mode '{current_mode}' to RGB: {convert_err}", exc_info=True)
                    # Re-raise the error
                    raise convert_err

            # --- Determine Final Save Path and Options ---
            final_extension = final_ext_override if final_ext_override else safe_ext
            # Ensure there's a valid extension, default to .png if missing or problematic
            if not final_extension or final_extension == '.':
                 final_extension = ".png"
                 target_format = 'PNG' # Make sure format matches extension
                 logger.warning(f"{log_prefix} No valid extension found, defaulting to '.png' and PNG format.")

            final_save_path = os.path.join(session_dir, f"{unique_filename_base}{final_extension}")

            # Prepare options for Pillow's save method
            save_options = {}
            if target_format:
                 # Pillow expects format identifiers in uppercase
                 save_options['format'] = target_format.upper()

            # Set quality for JPEG
            if save_options.get('format') == 'JPEG':
                save_options['quality'] = 90 # Good balance of quality and size
                logger.info(f"{log_prefix} Setting JPEG quality to 90.")
                # Add other options like optimize=True, progressive=True if desired
                # save_options['optimize'] = True
                # save_options['progressive'] = True

            # --- Save the Final Processed Image ---
            final_mode_to_save = img_to_save.mode
            logger.info(f"{log_prefix} Final check before saving:")
            logger.info(f"  - Original Mode: {original_mode}, Final Mode: {final_mode_to_save}")
            logger.info(f"  - Target Format: {save_options.get('format', 'Implicit from extension')}")
            logger.info(f"  - Save Path: {final_save_path}")
            logger.info(f"  - Save Options: {save_options}")

            # Save the image (which might be original, resized, flattened, or converted)
            img_to_save.save(final_save_path, **save_options)

            logger.info(f"{log_prefix} Successfully saved final image to {final_save_path}")
            processed_files_this_request.append(final_save_path) # Track successfully saved file

            # --- Store Image Information in Session ---
            img_id = str(uuid.uuid4()) # Unique ID for this image within the session
            final_width, final_height = img_to_save.size # Get dimensions of the saved image
            img_info = {
                'id': img_id,
                'name': original_filename, # Display original name to the user
                'path': final_save_path,  # Store the path to the ACTUAL saved file
                'size': f"{final_width}x{final_height}" # Store final dimensions
            }
            SESSIONS[session_id]['images'].append(img_info)
            logger.info(f"{log_prefix} Stored info for image ID {img_id}. Path: {final_save_path}")

            # --- Prepare Data for JSON Response to Client ---
            image_data_response.append({
                'id': img_id,
                'name': original_filename,
                'size': f"{final_width}x{final_height}" # Send final dimensions
            })

        except pillow_heif.HeifError as he:
             # Specific error for HEIF processing issues
             logger.error(f"{log_prefix} HEIF Error: {str(he)}. Check libheif installation.", exc_info=True)
             # Clean up the entire session attempt as HEIF support might be broken
             if session_id in SESSIONS: del SESSIONS[session_id]
             if os.path.exists(session_dir): shutil.rmtree(session_dir)
             return jsonify({'error': f'Error processing HEIC/HEIF image "{original_filename}". Is libheif installed correctly? Details: {str(he)}'}), 400 # Bad request likely due to format/library issue
        except Image.DecompressionBombError as db_err:
             # Pillow's protection against potential DoS attacks
             logger.error(f"{log_prefix} Decompression Bomb Error: {str(db_err)}", exc_info=True)
             return jsonify({'error': f'Image "{original_filename}" is too large or could be a decompression bomb. Processing aborted.'}), 413 # Payload too large
        except Exception as e:
            # Catch all other exceptions during processing of this single image
            logger.error(f"{log_prefix} Unexpected error during processing: {str(e)}", exc_info=True)
            # Don't abort the whole batch, just report error for this image?
            # Or abort the whole batch? Let's abort the batch for simplicity.
            # Clean up any files created *during this request* and the session dir
            logger.error(f"[{session_id}] Aborting batch due to error on '{original_filename}'. Cleaning up.")
            for fp in processed_files_this_request:
                if os.path.exists(fp):
                    try: os.remove(fp)
                    except OSError: logger.warning(f"[{session_id}] Failed to remove file during error cleanup: {fp}")
            if session_id in SESSIONS: del SESSIONS[session_id] # Remove session data
            if os.path.exists(session_dir): shutil.rmtree(session_dir) # Remove session dir
            return jsonify({'error': f'Server error processing image "{original_filename}": {str(e)}'}), 500 # Internal server error
        finally:
            # --- Ensure Pillow image objects are closed ---
            # It's crucial to close images, especially when working with streams or large files.
            if img_to_save:
                try:
                    img_to_save.close()
                    logger.debug(f"{log_prefix} Closed final image object (img_to_save).")
                except Exception as close_err:
                     logger.warning(f"{log_prefix} Error closing final image object: {close_err}")
            # Close original img_object if it's different from img_to_save and wasn't closed earlier
            if img_object and img_object is not img_to_save:
                 try:
                     img_object.close()
                     logger.debug(f"{log_prefix} Closed original image object (img_object).")
                 except Exception as close_err:
                     logger.warning(f"{log_prefix} Error closing original image object: {close_err}")

    # --- End of loop for processing images ---

    # Check if any images were successfully processed
    if not image_data_response:
         logger.warning(f"[{session_id}] No images were successfully processed in this batch.")
         # Clean up the session directory and data if no images succeeded
         if os.path.exists(session_dir):
             shutil.rmtree(session_dir)
             logger.info(f"[{session_id}] Removed session directory as no images were processed.")
         if session_id in SESSIONS:
            del SESSIONS[session_id]
            logger.info(f"[{session_id}] Removed session data as no images were processed.")
         # Return an error to the client
         return jsonify({'error': 'No images could be processed successfully. Please check file formats or server logs.'}), 400

    # Log the final list of image paths stored for the session before returning success
    if session_id in SESSIONS:
        final_session_paths = [img.get('path', 'Missing path!') for img in SESSIONS[session_id].get('images', [])]
        logger.info(f"[{session_id}] Successfully processed {len(image_data_response)} images. Final paths stored in session: {final_session_paths}")
    else:
        # This shouldn't happen if processing succeeded, but log if it does
        logger.error(f"[{session_id}] Session data missing unexpectedly after processing loop completion!")

    # Return success response to the client
    return jsonify({
        'success': True,
        'session_id': session_id,
        'images': image_data_response # List of {id, name, size} for the UI
    })


@img2pdf_bp.route('/api/generate', methods=['POST'])
def generate_pdf():
    """Generates the PDF from processed images stored in the session."""
    data = request.get_json()
    if not data:
        logger.warning("Generate PDF request received without JSON data.")
        return jsonify({'error': 'No JSON data received'}), 400

    session_id = data.get('session_id')
    if not session_id:
        logger.warning("Generate PDF request missing 'session_id' in JSON data.")
        return jsonify({'error': 'Missing session ID'}), 400

    log_prefix = f"[{session_id}]" # Prefix for logs related to this session

    # --- Validate Session ---
    if session_id not in SESSIONS:
        logger.warning(f"{log_prefix} Generate PDF request for invalid/unknown session ID.")
        return jsonify({'error': 'Invalid or expired session ID'}), 404 # Not Found

    session = SESSIONS[session_id]
    touch_session(session_id) # Update last accessed time

    session_images = session.get('images')
    if not session_images:
        logger.warning(f"{log_prefix} Generate PDF request for session with no associated images.")
        return jsonify({'error': 'No images found for this session. Please upload images first.'}), 400

    session_dir = session.get('directory')
    if not session_dir or not os.path.isdir(session_dir):
         logger.error(f"{log_prefix} Session directory '{session_dir}' is missing or invalid during PDF generation!")
         # This indicates a server-side inconsistency
         return jsonify({'error': 'Server error: Session storage is inconsistent. Please try again.'}), 500

    # --- Prepare for PDF Generation ---
    pdf_filename = f'img2pdf_output_{session_id[:8]}.pdf' # Create a unique PDF filename
    pdf_path = os.path.join(session_dir, pdf_filename)
    logger.info(f"{log_prefix} Starting PDF generation. Output path: {pdf_path}")

    # --- Get Image Paths and Validate Existence ---
    # Retrieve paths in the order they were added (assuming UI allows reordering if needed)
    image_paths_from_session = [img_info.get('path') for img_info in session_images]

    valid_image_paths = []
    missing_or_invalid_files = []
    for i, p in enumerate(image_paths_from_session):
        img_name = session_images[i].get('name', f'Image {i+1}')
        if p and os.path.exists(p) and os.path.isfile(p):
            valid_image_paths.append(p)
            logger.debug(f"{log_prefix} Image path validated: '{p}' (for '{img_name}')")
        else:
            missing_or_invalid_files.append(f"'{p or 'Missing path data'}' (for '{img_name}')")
            logger.error(f"{log_prefix} Image path validation FAILED: '{p or 'Missing path data'}' (for '{img_name}') not found or not a file.")

    # Check if any valid images remain
    if not valid_image_paths:
         logger.error(f"{log_prefix} No valid source image files found for PDF generation after validation. Missing/Invalid: {missing_or_invalid_files}")
         return jsonify({'error': 'Source image files could not be found. They might have been cleaned up prematurely or failed processing. Please try uploading again.'}), 500 # Internal error state

    # Log if some files were missing but proceeding with valid ones
    if missing_or_invalid_files:
         logger.warning(f"{log_prefix} Some image paths were invalid or missing: {missing_or_invalid_files}. Proceeding with {len(valid_image_paths)} valid paths.")
         # Depending on requirements, you might want to return an error here instead.

    # --- Log the exact list of files being passed to img2pdf ---
    logger.info(f"{log_prefix} Generating PDF '{pdf_filename}' using the following {len(valid_image_paths)} image files:")
    for valid_p in valid_image_paths:
        logger.info(f"  - {valid_p}")

    # --- Create PDF using img2pdf ---
    try:
        # The core conversion step
        pdf_bytes = img2pdf.convert(valid_image_paths)

        # Write the generated PDF bytes to the file
        with open(pdf_path, "wb") as f:
            f.write(pdf_bytes)

        # Store the generated PDF path in the session data
        session['pdf_path'] = pdf_path
        logger.info(f"{log_prefix} Successfully generated PDF ({len(pdf_bytes)} bytes) at {pdf_path}")

        # Return success response to the client
        return jsonify({
            'success': True,
            'session_id': session_id,
            'pdf_filename': pdf_filename # Send filename for potential display/download link
        })

    except img2pdf.PdfTooLargeError as pdf_err:
        # Handle error if the generated PDF exceeds size limits (img2pdf internal check)
        logger.error(f"{log_prefix} Error generating PDF: PDF size limit exceeded. {str(pdf_err)}")
        # Clean up the potentially partially created (or oversized) PDF file
        if os.path.exists(pdf_path):
            try: os.remove(pdf_path)
            except OSError as rm_err: logger.error(f"{log_prefix} Failed to remove oversized PDF '{pdf_path}': {rm_err}")
        session['pdf_path'] = None # Ensure pdf_path is cleared in session
        return jsonify({'error': f'Error generating PDF: The resulting PDF is too large. Try using fewer or smaller dimension images. Details: {str(pdf_err)}'}), 413 # Payload Too Large

    except Exception as e:
        # Handle any other errors during PDF generation
        logger.error(f"{log_prefix} Unexpected error during PDF generation: {str(e)}", exc_info=True)
        # Clean up any partially created PDF file
        if os.path.exists(pdf_path):
             try: os.remove(pdf_path)
             except OSError as rm_err: logger.error(f"{log_prefix} Failed to remove partially generated PDF '{pdf_path}' after error: {rm_err}")
        session['pdf_path'] = None # Ensure pdf_path is cleared
        return jsonify({'error': f'An unexpected error occurred while generating the PDF: {str(e)}'}), 500


@img2pdf_bp.route('/api/download/<session_id>')
def download_pdf(session_id):
    """Serves the generated PDF file for download and cleans up the session."""
    log_prefix = f"[{session_id}]"
    logger.info(f"{log_prefix} Download request received.")

    # --- Validate Session and PDF Existence ---
    if not session_id or session_id not in SESSIONS:
        logger.warning(f"{log_prefix} Download request for invalid/unknown session ID.")
        # Use 404 Not Found for invalid session/resource
        return jsonify({'error': 'Invalid or expired session ID. The download link may have expired.'}), 404

    session = SESSIONS[session_id]
    # No need to touch session here, download is the final action

    pdf_path = session.get('pdf_path')
    session_dir = session.get('directory') # Needed for cleanup

    if not pdf_path or not os.path.exists(pdf_path):
        logger.warning(f"{log_prefix} PDF download requested, but PDF path '{pdf_path}' not found or invalid.")
        # Check if PDF generation failed or if file was cleaned up prematurely
        return jsonify({'error': 'PDF not generated or found for this session. Please try generating the PDF again.'}), 404

    # --- Prepare and Send File ---
    try:
        # Generate a user-friendly download filename
        download_name = f"img2pdf_converted_{session_id[:8]}.pdf"
        logger.info(f"{log_prefix} Initiating PDF download. File: '{pdf_path}', Download Name: '{download_name}'")

        # Use Flask's send_file for efficient file serving
        # IMPORTANT: Cleanup should happen *after* the file is successfully sent.
        # Using response.call_on_close or Flask's @after_this_request is preferred.

        response = send_file(
            pdf_path,
            as_attachment=True, # Trigger browser download dialog
            download_name=download_name,
            mimetype='application/pdf'
        )

        # --- Define Cleanup Logic ---
        # This function will be called after the response is sent (or if sending fails partway)
        def cleanup_session_data_after_download():
            # Use local variables captured from the outer scope
            session_to_clean = session_id
            dir_to_clean = session_dir
            log_prefix_cleanup = f"[{session_to_clean}]"
            logger.info(f"{log_prefix_cleanup} Post-download cleanup triggered.")
            try:
                # 1. Remove session data from the global dictionary
                if session_to_clean in SESSIONS:
                    logger.info(f"{log_prefix_cleanup} Removing session data from memory.")
                    del SESSIONS[session_to_clean]
                else:
                     logger.warning(f"{log_prefix_cleanup} Session data already removed before post-download cleanup could run.")

                # 2. Remove the session directory from the filesystem
                if dir_to_clean and os.path.exists(dir_to_clean):
                    logger.info(f"{log_prefix_cleanup} Removing session directory: {dir_to_clean}")
                    try:
                        shutil.rmtree(dir_to_clean)
                        logger.info(f"{log_prefix_cleanup} Successfully removed directory {dir_to_clean}.")
                    except OSError as rm_err:
                         logger.error(f"{log_prefix_cleanup} Error removing session directory {dir_to_clean}: {rm_err}", exc_info=True)
                elif dir_to_clean:
                    logger.warning(f"{log_prefix_cleanup} Session directory {dir_to_clean} not found during post-download cleanup (might have been cleaned up already).")
                else:
                    logger.warning(f"{log_prefix_cleanup} No session directory path found in session data during cleanup.")

            except Exception as e:
                 # Catch any unexpected errors during cleanup itself
                 logger.error(f"{log_prefix_cleanup} Unexpected error during post-download cleanup: {e}", exc_info=True)

        # --- Register Cleanup ---
        # response.call_on_close is generally reliable but can depend on WSGI server.
        # Flask's @after_this_request is another option but requires structuring differently.
        if hasattr(response, 'call_on_close') and callable(response.call_on_close):
             response.call_on_close(cleanup_session_data_after_download)
             logger.info(f"{log_prefix} Registered post-download cleanup function via response.call_on_close.")
        else:
             # If call_on_close isn't available, cleanup won't happen automatically here.
             # Rely on explicit /api/cleanup or background task.
             logger.warning(f"{log_prefix} response.call_on_close not available/callable. Automatic cleanup after download might not occur.")

        return response

    except Exception as e:
        # Handle errors during the preparation or sending of the file
        logger.error(f"{log_prefix} Error occurred while trying to send PDF file '{pdf_path}': {str(e)}", exc_info=True)
        # Don't cleanup here, as the session might still be valid if download failed early
        return jsonify({'error': f'Server error while preparing PDF for download: {str(e)}'}), 500


@img2pdf_bp.route('/api/cleanup', methods=['POST'])
def cleanup_session():
    """Explicit API endpoint for the client to request cleanup of a session."""
    data = request.get_json()
    session_id = data.get('session_id') if data else None

    if not session_id:
        logger.warning("Explicit cleanup request received without 'session_id'.")
        # Return success as there's nothing specific to clean
        return jsonify({'success': True, 'message': 'No session ID provided.'})

    log_prefix = f"[{session_id}]"
    logger.info(f"{log_prefix} Explicit cleanup request received.")

    # --- Perform Cleanup ---
    # Use the same logic as post-download cleanup for consistency
    session_dir = None
    session_existed = False
    try:
        if session_id in SESSIONS:
            session_existed = True
            # Retrieve directory path *before* deleting session data
            session_dir = SESSIONS[session_id].get('directory')
            logger.info(f"{log_prefix} Removing session data from memory (explicit cleanup).")
            del SESSIONS[session_id]
        else:
            logger.info(f"{log_prefix} Explicit cleanup requested for non-existent or already cleaned session.")
            # Attempt cleanup based on session_id anyway, dir might be orphaned
            session_dir = os.path.join(TEMP_DIR, session_id)


        # Remove the directory if path exists
        if session_dir and os.path.exists(session_dir) and os.path.isdir(session_dir):
             logger.info(f"{log_prefix} Removing session directory: {session_dir} (explicit cleanup).")
             try:
                 shutil.rmtree(session_dir)
                 logger.info(f"{log_prefix} Successfully removed directory {session_dir}.")
             except OSError as rm_err:
                  logger.error(f"{log_prefix} Error removing session directory {session_dir} during explicit cleanup: {rm_err}", exc_info=True)
                  # Return success to client, but log the server-side issue
                  return jsonify({'success': True, 'message': 'Cleanup completed (encountered directory removal error - check server logs).'})
        elif session_existed and session_dir:
             logger.warning(f"{log_prefix} Session directory {session_dir} not found during explicit cleanup (might have been removed previously).")
        elif not session_existed and os.path.exists(session_dir):
             logger.warning(f"{log_prefix} Found orphaned directory for non-existent session: {session_dir}. Removing.")
             try:
                 shutil.rmtree(session_dir)
                 logger.info(f"{log_prefix} Successfully removed orphaned directory {session_dir}.")
             except OSError as rm_err:
                 logger.error(f"{log_prefix} Error removing orphaned directory {session_dir}: {rm_err}", exc_info=True)


    except KeyError:
         # Race condition: session removed between check and delete
         logger.warning(f"{log_prefix} Session data disappeared during explicit cleanup attempt (race condition?).")
         # Still try to remove directory if path was known or can be derived
         if session_dir and os.path.exists(session_dir):
              logger.warning(f"{log_prefix} Attempting directory removal after KeyError: {session_dir}")
              try: shutil.rmtree(session_dir)
              except Exception as e_inner: logger.error(f"{log_prefix} Error removing directory {session_dir} after KeyError: {str(e_inner)}")
    except Exception as e:
        logger.error(f"{log_prefix} Unexpected error during explicit cleanup: {str(e)}", exc_info=True)
        # Return success to client, as cleanup is best-effort on server
        return jsonify({'success': True, 'message': f'Cleanup attempted but encountered server error: {e}'})

    # Always return success from the client's perspective for explicit cleanup
    return jsonify({'success': True, 'message': 'Cleanup process completed.'})


# --- Optional: Background Cleanup Task (Example using APScheduler) ---
# Needs: pip install APScheduler
# Uncomment and adapt if needed. Ensure it's initialized correctly with your Flask app.

# from apscheduler.schedulers.background import BackgroundScheduler
# import atexit

# def cleanup_old_sessions_job():
#     """Scans TEMP_DIR and SESSIONS for old entries and removes them."""
#     cutoff_time = time.time() - SESSION_CLEANUP_DELAY
#     logger.info(f"[Scheduler] Running background cleanup for sessions older than {datetime.datetime.fromtimestamp(cutoff_time)}...")
#
#     cleaned_sessions = 0
#     cleaned_dirs = 0
#     errors = 0
#
#     # --- Clean based on SESSIONS data (more reliable if available) ---
#     session_ids_to_remove = []
#     # Iterate over a copy of keys to allow deletion during iteration
#     for session_id, session_data in list(SESSIONS.items()):
#         try:
#             last_accessed = session_data.get('last_accessed', 0)
#             if last_accessed < cutoff_time:
#                 logger.info(f"[Scheduler][{session_id}] Session timed out (last access: {datetime.datetime.fromtimestamp(last_accessed)}). Marking for removal.")
#                 session_ids_to_remove.append(session_id)
#             # else: logger.debug(f"[Scheduler][{session_id}] Session is recent, skipping.")
#         except Exception as e:
#             logger.error(f"[Scheduler][{session_id}] Error checking session timestamp: {e}", exc_info=True)
#             errors += 1
#
#     # Perform removal outside the iteration loop
#     for session_id in session_ids_to_remove:
#         try:
#             session_dir = SESSIONS[session_id].get('directory')
#             del SESSIONS[session_id] # Remove from memory
#             cleaned_sessions += 1
#             logger.info(f"[Scheduler][{session_id}] Removed session data from memory.")
#             if session_dir and os.path.exists(session_dir):
#                 try:
#                     shutil.rmtree(session_dir)
#                     logger.info(f"[Scheduler][{session_id}] Removed session directory: {session_dir}")
#                     cleaned_dirs += 1
#                 except OSError as rm_err:
#                     logger.error(f"[Scheduler][{session_id}] Error removing directory {session_dir}: {rm_err}", exc_info=True)
#                     errors += 1
#             elif session_dir:
#                  logger.warning(f"[Scheduler][{session_id}] Session directory {session_dir} not found during scheduled cleanup.")
#         except KeyError:
#             logger.warning(f"[Scheduler][{session_id}] Session already removed before scheduled cleanup action.")
#         except Exception as e:
#             logger.error(f"[Scheduler][{session_id}] Error during scheduled removal: {e}", exc_info=True)
#             errors += 1
#
#     # --- Optional: Scan TEMP_DIR for orphaned directories (less precise) ---
#     # This can catch directories left behind if the server crashed before cleanup
#     try:
#         for item_name in os.listdir(TEMP_DIR):
#             item_path = os.path.join(TEMP_DIR, item_name)
#             # Check if it looks like a session ID and is a directory
#             if os.path.isdir(item_path) and len(item_name) == 36: # Basic check for UUID format
#                 # Check if session still exists in memory (maybe it's active)
#                 if item_name not in SESSIONS:
#                     try:
#                         dir_mtime = os.path.getmtime(item_path)
#                         if dir_mtime < cutoff_time:
#                             logger.warning(f"[Scheduler][{item_name}] Found orphaned directory older than cutoff. Removing: {item_path}")
#                             shutil.rmtree(item_path)
#                             cleaned_dirs += 1
#                         # else: logger.debug(f"[Scheduler][{item_name}] Found orphaned directory, but it's recent. Skipping.")
#                     except FileNotFoundError:
#                         pass # Directory might have been removed by another process/request
#                     except Exception as e:
#                         logger.error(f"[Scheduler][{item_name}] Error checking/removing orphaned directory {item_path}: {e}", exc_info=True)
#                         errors += 1
#     except Exception as e:
#         logger.error(f"[Scheduler] Error scanning TEMP_DIR for orphans: {e}", exc_info=True)
#         errors += 1
#
#     logger.info(f"[Scheduler] Background cleanup finished. Removed {cleaned_sessions} session data entries, {cleaned_dirs} directories. Encountered {errors} errors.")

# def start_scheduler():
#     """Initializes and starts the background cleanup scheduler."""
#     scheduler = BackgroundScheduler(daemon=True)
#     # Schedule the cleanup job to run periodically (e.g., every 30 minutes)
#     scheduler.add_job(cleanup_old_sessions_job, 'interval', minutes=30)
#     try:
#         scheduler.start()
#         logger.info("Background session cleanup scheduler started successfully.")
#     except Exception as e:
#         logger.error(f"Failed to start background scheduler: {e}", exc_info=True)
#         return # Don't register shutdown hook if start failed
#
#     # Ensure the scheduler shuts down gracefully when the Flask app exits
#     atexit.register(lambda: scheduler.shutdown())

# --- Initialize Scheduler (if using) ---
# Call this function once when your Flask application starts.
# For example, in your app factory or main script:
# if __name__ == '__main__' and not app.debug: # Don't run scheduler in debug mode usually
#    start_scheduler()
# Or if using an app factory:
# def create_app():
#     app = Flask(__name__)
#     # ... configure app ...
#     app.register_blueprint(img2pdf_bp, url_prefix='/img2pdf') # Example registration
#     if not app.debug or os.environ.get('WERKZEUG_RUN_MAIN') == 'true':
#          with app.app_context(): # Ensure context if needed by scheduler job
#              start_scheduler()
#     return app

