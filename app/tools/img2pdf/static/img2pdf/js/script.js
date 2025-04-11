document.addEventListener('DOMContentLoaded', function() {
    // Elements
    const uploadForm = document.getElementById('uploadForm');
    const imageInput = document.getElementById('imageInput');
    const progressContainer = document.getElementById('progressContainer');
    const uploadProgress = document.getElementById('uploadProgress');
    const imagePreviewContainer = document.getElementById('imagePreviewContainer');
    const imagePreview = document.getElementById('imagePreview');
    const generatePdfBtn = document.getElementById('generatePdfBtn');
    const pdfResultContainer = document.getElementById('pdfResultContainer');
    const downloadPdfBtn = document.getElementById('downloadPdfBtn');
    const errorContainer = document.getElementById('errorContainer');
    const errorMessage = document.getElementById('errorMessage');
    
    // Session data
    let currentSessionId = null;
    let currentPdfPath = null;
    
    // Event listeners
    uploadForm.addEventListener('submit', handleUpload);
    generatePdfBtn.addEventListener('click', generatePdf);
    imageInput.addEventListener('change', validateImages);
    
    // Add drag and drop support
    const inputContainer = imageInput.parentElement;
    inputContainer.classList.add('drag-drop-zone');
    
    inputContainer.addEventListener('dragover', function(e) {
        e.preventDefault();
        inputContainer.classList.add('dragover');
    });
    
    inputContainer.addEventListener('dragleave', function() {
        inputContainer.classList.remove('dragover');
    });
    
    inputContainer.addEventListener('drop', function(e) {
        e.preventDefault();
        inputContainer.classList.remove('dragover');
        imageInput.files = e.dataTransfer.files;
        validateImages();
    });
    
    // Validate selected images
    function validateImages() {
        const files = imageInput.files;
        
        if (files.length === 0) {
            showError('请选择至少一张图片');
            return false;
        }
        
        // Check if all files are images
        for (let i = 0; i < files.length; i++) {
            if (!files[i].type.startsWith('image/')) {
                showError(`文件 "${files[i].name}" 不是有效的图片格式`);
                return false;
            }
        }
        
        return true;
    }
    
    // Handle image upload
    function handleUpload(e) {
        e.preventDefault();
        
        if (!validateImages()) {
            return;
        }
        
        // Clear previous previews and errors
        imagePreview.innerHTML = '';
        hideError();
        hideElement(pdfResultContainer);
        
        const formData = new FormData(uploadForm);
        
        // Show progress
        showElement(progressContainer);
        uploadProgress.style.width = '0%';
        uploadProgress.textContent = '0%';
        
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', function(e) {
            if (e.lengthComputable) {
                const percentComplete = Math.round((e.loaded / e.total) * 100);
                uploadProgress.style.width = percentComplete + '%';
                uploadProgress.textContent = percentComplete + '%';
                uploadProgress.setAttribute('aria-valuenow', percentComplete);
            }
        });
        
        xhr.addEventListener('load', function() {
            hideElement(progressContainer);
            
            if (xhr.status === 200) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    
                    if (response.success) {
                        currentSessionId = response.session_id;
                        displayImagePreviews(response.images);
                    } else {
                        showError(response.error || '上传失败');
                    }
                } catch (e) {
                    showError('解析服务器响应失败');
                }
            } else {
                try {
                    const response = JSON.parse(xhr.responseText);
                    showError(response.error || '上传失败');
                } catch (e) {
                    showError('上传失败: ' + xhr.statusText);
                }
            }
        });
        
        xhr.addEventListener('error', function() {
            hideElement(progressContainer);
            showError('网络错误，请重试');
        });
        
        xhr.open('POST', '/tools/img2pdf/api/upload');
        xhr.send(formData);
    }
    
    // Display image previews
    function displayImagePreviews(images) {
        if (!images || images.length === 0) {
            return;
        }
        
        images.forEach(function(img, index) {
            const col = document.createElement('div');
            col.className = 'col-md-3 col-sm-6';
            
            const previewItem = document.createElement('div');
            previewItem.className = 'image-preview-item';
            previewItem.dataset.id = img.id;
            
            // Create image reader to display preview
            const fileReader = new FileReader();
            fileReader.onload = function(e) {
                previewItem.innerHTML = `
                    <div class="image-preview-overlay">
                        <span class="image-preview-remove" title="移除">&times;</span>
                    </div>
                    <img src="${e.target.result}" alt="${img.name}" class="img-fluid">
                    <div class="image-preview-caption">${img.name}</div>
                `;
                
                // Add remove functionality
                const removeBtn = previewItem.querySelector('.image-preview-remove');
                removeBtn.addEventListener('click', function() {
                    col.remove();
                    
                    // Check if there are any images left
                    if (imagePreview.children.length === 0) {
                        hideElement(imagePreviewContainer);
                    }
                });
            };
            
            // Get the file from the input
            fileReader.readAsDataURL(imageInput.files[index]);
            
            col.appendChild(previewItem);
            imagePreview.appendChild(col);
        });
        
        showElement(imagePreviewContainer);
    }
    
    // Generate PDF
    function generatePdf() {
        if (!currentSessionId) {
            showError('没有可用的图片，请先上传');
            return;
        }
        
        if (imagePreview.children.length === 0) {
            showError('没有可用的图片，请先上传');
            return;
        }
        
        // Disable button and show loading
        generatePdfBtn.disabled = true;
        generatePdfBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 生成中...';
        
        fetch('/tools/img2pdf/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                session_id: currentSessionId
            })
        })
        .then(response => response.json())
        .then(data => {
            generatePdfBtn.disabled = false;
            generatePdfBtn.textContent = '生成PDF';
            
            if (data.success) {
                // Set download link using session ID
                downloadPdfBtn.href = `/tools/img2pdf/api/download/${currentSessionId}`;
                showElement(pdfResultContainer);
                
                // Add event to clean up after download
                downloadPdfBtn.addEventListener('click', function() {
                    // Schedule cleanup after download starts
                    setTimeout(function() {
                        cleanup();
                    }, 3000);
                });
            } else {
                showError(data.error || 'PDF生成失败');
            }
        })
        .catch(error => {
            generatePdfBtn.disabled = false;
            generatePdfBtn.textContent = '生成PDF';
            showError('PDF生成失败: ' + error.message);
        });
    }
    
    // Clean up resources
    function cleanup() {
        if (!currentSessionId) {
            return;
        }
        
        fetch('/img2pdf/api/cleanup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                session_id: currentSessionId
            })
        })
        .then(() => {
            currentSessionId = null;
        })
        .catch(error => {
            console.error('Cleanup error:', error);
        });
    }
    
    // Helper functions
    function showError(msg) {
        errorMessage.textContent = msg;
        showElement(errorContainer);
    }
    
    function hideError() {
        hideElement(errorContainer);
    }
    
    function showElement(el) {
        el.classList.remove('d-none');
    }
    
    function hideElement(el) {
        el.classList.add('d-none');
    }
    
    // Handle page unload to clean up
    window.addEventListener('beforeunload', cleanup);
}); 