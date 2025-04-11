document.addEventListener('DOMContentLoaded', function() {
    // Elements
    const uploadForm = document.getElementById('uploadForm');
    const pdfInput = document.getElementById('pdfInput');
    const uploadBtn = document.getElementById('uploadBtn');
    const progressContainer = document.getElementById('progressContainer');
    const uploadProgress = document.getElementById('uploadProgress');
    const pdfInfoContainer = document.getElementById('pdfInfoContainer');
    const pdfInfo = document.getElementById('pdfInfo');
    const pageRanges = document.getElementById('pageRanges');
    const pageList = document.getElementById('pageList');
    const extractBtn = document.getElementById('extractBtn');
    const resultContainer = document.getElementById('resultContainer');
    const resultInfo = document.getElementById('resultInfo');
    const downloadBtn = document.getElementById('downloadBtn');
    const errorContainer = document.getElementById('errorContainer');
    const errorMessage = document.getElementById('errorMessage');
    
    // Session data
    let currentSessionId = null;
    let currentPageCount = 0;
    
    // Event listeners
    uploadForm.addEventListener('submit', handleUpload);
    extractBtn.addEventListener('click', extractPages);
    pdfInput.addEventListener('change', validatePDF);
    
    // Add drag and drop support
    const inputContainer = pdfInput.parentElement;
    inputContainer.classList.add('drop-zone');
    
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
        pdfInput.files = e.dataTransfer.files;
        validatePDF();
    });
    
    // Validate PDF file
    function validatePDF() {
        const file = pdfInput.files[0];
        
        if (!file) {
            showError('请选择PDF文件');
            return false;
        }
        
        // Check if it's a PDF
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            showError('请上传PDF格式的文件');
            return false;
        }
        
        return true;
    }
    
    // Handle PDF upload
    function handleUpload(e) {
        e.preventDefault();
        
        if (!validatePDF()) {
            return;
        }
        
        // Reset UI
        hideElement(pdfInfoContainer);
        hideElement(resultContainer);
        hideError();
        
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
                        currentPageCount = response.page_count;
                        
                        // Display PDF info
                        pdfInfo.innerHTML = `
                            <strong>文件名:</strong> ${response.filename}<br>
                            <strong>页数:</strong> ${response.page_count}
                        `;
                        
                        showElement(pdfInfoContainer);
                        
                        // Clean form inputs
                        pageRanges.value = '';
                        pageList.value = '';
                        
                        // Focus on the first input field
                        pageRanges.focus();
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
        
        xhr.open('POST', '/tools/pdfpick/api/upload');
        xhr.send(formData);
    }
    
    // Extract pages from PDF
    function extractPages() {
        if (!currentSessionId) {
            showError('请先上传PDF文件');
            return;
        }
        
        // Validate inputs
        const rangesText = pageRanges.value.trim();
        const listText = pageList.value.trim();
        
        if (!rangesText && !listText) {
            showError('请至少指定一个页面范围或单页列表');
            pageRanges.classList.add('has-error');
            pageList.classList.add('has-error');
            return;
        }
        
        // Remove error styling
        pageRanges.classList.remove('has-error');
        pageList.classList.remove('has-error');
        
        // Process page ranges
        let pageRangesArray = [];
        if (rangesText) {
            pageRangesArray = rangesText.split(',').map(range => range.trim()).filter(range => range);
            
            // Validate each range
            for (const range of pageRangesArray) {
                if (!range.match(/^\d+-\d+$/)) {
                    showError(`无效的页面范围格式: "${range}". 正确格式应为 "起始页-结束页"`);
                    pageRanges.classList.add('has-error');
                    return;
                }
                
                const [start, end] = range.split('-').map(Number);
                
                if (start > end) {
                    showError(`无效的页面范围: "${range}". 起始页不能大于结束页`);
                    pageRanges.classList.add('has-error');
                    return;
                }
                
                if (start < 1 || end > currentPageCount) {
                    showError(`页面范围 "${range}" 超出了PDF的页数范围 (1-${currentPageCount})`);
                    pageRanges.classList.add('has-error');
                    return;
                }
            }
        }
        
        // Process page list
        let pageListArray = [];
        if (listText) {
            pageListArray = listText.split(',').map(page => page.trim()).filter(page => page);
            
            // Validate each page number
            for (const page of pageListArray) {
                if (!page.match(/^\d+$/)) {
                    showError(`无效的页码: "${page}". 页码必须是数字`);
                    pageList.classList.add('has-error');
                    return;
                }
                
                const pageNum = Number(page);
                
                if (pageNum < 1 || pageNum > currentPageCount) {
                    showError(`页码 "${page}" 超出了PDF的页数范围 (1-${currentPageCount})`);
                    pageList.classList.add('has-error');
                    return;
                }
            }
        }
        
        // Hide previous results and errors
        hideElement(resultContainer);
        hideError();
        
        // Disable button and show loading
        extractBtn.disabled = true;
        extractBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 提取中...';
        
        // Send extraction request
        fetch('/tools/pdfpick/api/extract', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                session_id: currentSessionId,
                page_ranges: pageRangesArray,
                page_list: pageListArray.map(Number)
            })
        })
        .then(response => response.json())
        .then(data => {
            extractBtn.disabled = false;
            extractBtn.textContent = '提取页面';
            
            if (data.success) {
                // Set result info and download link
                resultInfo.textContent = `成功提取了 ${data.extracted_pages} 个页面。`;
                downloadBtn.href = `/tools/pdfpick/api/download/${currentSessionId}`;
                showElement(resultContainer);
                
                // Add event to clean up after download
                downloadBtn.addEventListener('click', function() {
                    // Schedule cleanup after download starts
                    setTimeout(function() {
                        cleanup();
                    }, 3000);
                });
            } else {
                showError(data.error || 'PDF页面提取失败');
            }
        })
        .catch(error => {
            extractBtn.disabled = false;
            extractBtn.textContent = '提取页面';
            showError('提取PDF页面时出错: ' + error.message);
        });
    }
    
    // Clean up resources
    function cleanup() {
        if (!currentSessionId) {
            return;
        }
        
        fetch('/tools/pdfpick/api/cleanup', {
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