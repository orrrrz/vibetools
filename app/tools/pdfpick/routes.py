from flask import Blueprint, render_template, request, jsonify, send_file
import os
import uuid
import tempfile
import logging
import shutil
from PyPDF2 import PdfReader, PdfWriter
from . import pdfpick_bp

# Configure logger
logger = logging.getLogger(__name__)

# Temporary directory for uploads
TEMP_DIR = os.path.join(tempfile.gettempdir(), 'pdfpick_uploads')
if not os.path.exists(TEMP_DIR):
    os.makedirs(TEMP_DIR)

# Session storage
SESSIONS = {}

@pdfpick_bp.route('/')
def index():
    return render_template('pdfpick/index.html')

@pdfpick_bp.route('/api/upload', methods=['POST'])
def upload_pdf():
    if 'pdf' not in request.files:
        return jsonify({'error': '未提供PDF文件'}), 400
    
    pdf_file = request.files['pdf']
    
    if not pdf_file:
        return jsonify({'error': '未提供PDF文件'}), 400
    
    # Check if it's a PDF
    if not pdf_file.filename.lower().endswith('.pdf'):
        return jsonify({'error': '请上传PDF格式的文件'}), 400
    
    # Generate a session id and directory for this upload
    session_id = str(uuid.uuid4())
    session_dir = os.path.join(TEMP_DIR, session_id)
    os.makedirs(session_dir)
    
    try:
        # Save PDF to the temporary directory
        pdf_path = os.path.join(session_dir, f"original_{pdf_file.filename}")
        pdf_file.save(pdf_path)
        
        # Open the PDF to get page count
        with open(pdf_path, "rb") as f:
            pdf = PdfReader(f)
            page_count = len(pdf.pages)
        
        # Store session info
        SESSIONS[session_id] = {
            'pdf_path': pdf_path,
            'filename': pdf_file.filename,
            'page_count': page_count,
            'directory': session_dir
        }
        
        return jsonify({
            'success': True,
            'session_id': session_id,
            'filename': pdf_file.filename,
            'page_count': page_count
        })
    except Exception as e:
        logger.error(f"Error processing PDF: {str(e)}")
        # Clean up
        if os.path.exists(session_dir):
            shutil.rmtree(session_dir)
        if session_id in SESSIONS:
            del SESSIONS[session_id]
            
        return jsonify({'error': f'处理PDF时出错: {str(e)}'}), 500

@pdfpick_bp.route('/api/extract', methods=['POST'])
def extract_pages():
    data = request.get_json()
    session_id = data.get('session_id')
    page_ranges = data.get('page_ranges', [])
    page_list = data.get('page_list', [])
    
    if not session_id or session_id not in SESSIONS:
        return jsonify({'error': '无效的会话ID'}), 400
    
    session = SESSIONS[session_id]
    
    if not page_ranges and not page_list:
        return jsonify({'error': '未指定要提取的页面'}), 400
    
    try:
        # Process page selections
        pages_to_extract = set()
        
        # Process page ranges (like "1-5", "7-9")
        for range_str in page_ranges:
            try:
                start, end = map(int, range_str.split('-'))
                # Adjust for 0-based indexing
                start = max(1, start)  # Ensure minimum page is 1
                end = min(session['page_count'], end)  # Ensure maximum page is within bounds
                
                for page_num in range(start, end + 1):
                    pages_to_extract.add(page_num)
            except Exception as e:
                logger.error(f"Error parsing page range '{range_str}': {str(e)}")
                # Continue with other ranges if one fails
        
        # Process individual pages
        for page_num in page_list:
            try:
                page_num = int(page_num)
                if 1 <= page_num <= session['page_count']:
                    pages_to_extract.add(page_num)
            except Exception as e:
                logger.error(f"Error parsing page number '{page_num}': {str(e)}")
                # Continue with other pages if one fails
        
        if not pages_to_extract:
            return jsonify({'error': '没有有效的页面可提取'}), 400
        
        # Sort the pages to maintain order
        pages_to_extract = sorted(pages_to_extract)
        
        # Create output PDF
        output_path = os.path.join(session['directory'], f"extracted_{session['filename']}")
        
        # Extract pages
        pdf_writer = PdfWriter()
        with open(session['pdf_path'], 'rb') as f:
            pdf_reader = PdfReader(f)
            
            # Add selected pages to the output
            for page_num in pages_to_extract:
                # Adjust for 0-based indexing
                pdf_writer.add_page(pdf_reader.pages[page_num - 1])
        
            # Write the output PDF
            with open(output_path, 'wb') as output_file:
                pdf_writer.write(output_file)
        
        # Store output path in session
        session['output_path'] = output_path
        session['extracted_pages'] = pages_to_extract
        
        return jsonify({
            'success': True,
            'session_id': session_id,
            'extracted_pages': len(pages_to_extract)
        })
    except Exception as e:
        import traceback
        logger.error(f"Error extracting PDF pages: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': f'提取PDF页面时出错: {str(e)}'}), 500

@pdfpick_bp.route('/api/download/<session_id>')
def download_pdf(session_id):
    if not session_id or session_id not in SESSIONS:
        return jsonify({'error': '无效的会话ID'}), 400
    
    session = SESSIONS[session_id]
    if 'output_path' not in session:
        return jsonify({'error': '未找到提取的PDF文件'}), 404
    
    try:
        # Generate a meaningful filename
        base_filename = os.path.splitext(session['filename'])[0]
        download_name = f"{base_filename}_提取页面.pdf"
        
        # Return the PDF file
        return send_file(session['output_path'], 
                         as_attachment=True, 
                         download_name=download_name)
    except Exception as e:
        logger.error(f"Error downloading PDF: {str(e)}")
        return jsonify({'error': f'下载PDF时出错: {str(e)}'}), 500

@pdfpick_bp.route('/api/cleanup', methods=['POST'])
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