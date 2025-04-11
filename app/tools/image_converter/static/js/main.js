document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const uploadForm = document.getElementById('upload-form');
    const imageUpload = document.getElementById('image-upload');
    const imagePreview = document.getElementById('image-preview');
    const uploadPrompt = document.getElementById('upload-prompt');
    const imageInfo = document.getElementById('image-info');
    const downloadBtn = document.getElementById('download-btn');
    const resizeBtn = document.getElementById('resize-btn');
    const resizeWidth = document.getElementById('resize-width');
    const resizeHeight = document.getElementById('resize-height');
    const rotateLeft = document.getElementById('rotate-left');
    const rotateRight = document.getElementById('rotate-right');
    const flipHorizontal = document.getElementById('flip-horizontal');
    const flipVertical = document.getElementById('flip-vertical');
    const grayscaleBtn = document.getElementById('grayscale-btn');
    const formatSelect = document.getElementById('format-select');
    const convertFormatBtn = document.getElementById('convert-format-btn');
    
    // Get loading modal DOM element
    const loadingModalElement = document.getElementById('loadingModal');
    // Create a direct reference to the Bootstrap modal object
    let loadingModal = null;
    
    const errorModalElement = document.getElementById('errorModal');
    let errorModal = null;
    
    const errorMessage = document.getElementById('error-message');

    // State
    let currentImage = null;
    
    // Initialize the application
    init();
    
    function init() {
        // Initialize Bootstrap modals
        loadingModal = new bootstrap.Modal(loadingModalElement);
        errorModal = new bootstrap.Modal(errorModalElement);
        
        // Set up event listeners
        uploadForm.addEventListener('submit', handleUpload);
        downloadBtn.addEventListener('click', handleDownload);
        resizeBtn.addEventListener('click', handleResize);
        rotateLeft.addEventListener('click', () => handleRotate(-90));
        rotateRight.addEventListener('click', () => handleRotate(90));
        flipHorizontal.addEventListener('click', () => handleFlip('horizontal'));
        flipVertical.addEventListener('click', () => handleFlip('vertical'));
        grayscaleBtn.addEventListener('click', handleGrayscale);
        convertFormatBtn.addEventListener('click', handleFormatConversion);
        
        // Disable operation buttons initially
        toggleOperationButtons(false);
    }
    
    // Function to show loading modal
    function showLoading() {
        // Make sure any existing modal is hidden first
        hideLoading();
        // Then show the modal
        loadingModal.show();
        
        // Safety timeout to ensure modal closes after 10 seconds
        setTimeout(() => {
            hideLoading();
        }, 10000);
    }
    
    // Function to hide loading modal
    function hideLoading() {
        try {
            // Try the Bootstrap way
            loadingModal.hide();
            
            // Also try manual DOM manipulation
            loadingModalElement.classList.remove('show');
            loadingModalElement.setAttribute('aria-hidden', 'true');
            loadingModalElement.setAttribute('style', 'display: none;');
            
            // Remove backdrop
            const backdrops = document.querySelectorAll('.modal-backdrop');
            backdrops.forEach(backdrop => {
                backdrop.parentNode.removeChild(backdrop);
            });
            
            // Remove modal open class from body
            document.body.classList.remove('modal-open');
            document.body.style.removeProperty('overflow');
            document.body.style.removeProperty('padding-right');
        } catch (error) {
            console.error('Error hiding modal:', error);
        }
    }
    
    // Enable or disable operation buttons
    function toggleOperationButtons(enabled) {
        const buttons = [
            downloadBtn, resizeBtn, rotateLeft, rotateRight,
            flipHorizontal, flipVertical, grayscaleBtn, convertFormatBtn
        ];
        
        buttons.forEach(btn => {
            btn.disabled = !enabled;
        });
        
        [resizeWidth, resizeHeight, formatSelect].forEach(input => {
            input.disabled = !enabled;
        });
    }
    
    // Handle image upload
    async function handleUpload(e) {
        e.preventDefault();
        
        const file = imageUpload.files[0];
        if (!file) {
            showError('Please select an image to upload');
            return;
        }
        
        // Show loading modal
        showLoading();
        
        // Create FormData and append file
        const formData = new FormData();
        formData.append('image', file);
        
        try {
            console.log('Sending upload request to /tools/image_converter/api/upload');
            const response = await fetch('/tools/image_converter/api/upload', {
                method: 'POST',
                body: formData
            });
            
            console.log('Response status:', response.status);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Response data:', data);
            
            if (data.success) {
                // Update current image data
                currentImage = data;
                
                // Update UI
                showImage(data.url);
                updateImageInfo(data);
                toggleOperationButtons(true);
            } else {
                showError(data.error || 'Failed to upload image');
            }
        } catch (error) {
            console.error('Error uploading image:', error);
            showError('An error occurred while uploading the image: ' + error.message);
        } finally {
            console.log('Upload completed, hiding loading modal');
            hideLoading();
        }
    }
    
    // Show image in the preview
    function showImage(url) {
        imagePreview.src = url;
        imagePreview.classList.remove('d-none');
        uploadPrompt.classList.add('d-none');
    }
    
    // Update image information
    function updateImageInfo(data) {
        let infoHtml = '<table class="table table-sm">';
        infoHtml += `<tr><td>Name:</td><td>${data.originalName || data.filename}</td></tr>`;
        infoHtml += `<tr><td>Dimensions:</td><td>${data.width} × ${data.height}</td></tr>`;
        infoHtml += `<tr><td>Format:</td><td>${data.format.toUpperCase()}</td></tr>`;
        infoHtml += '</table>';
        
        imageInfo.innerHTML = infoHtml;
    }
    
    // Handle image resizing
    async function handleResize() {
        if (!currentImage) return;
        
        const width = parseInt(resizeWidth.value);
        const height = parseInt(resizeHeight.value);
        
        if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
            showError('Please enter valid width and height values');
            return;
        }
        
        await applyImageOperation([{
            type: 'resize',
            width,
            height
        }]);
    }
    
    // Handle image rotation
    async function handleRotate(angle) {
        if (!currentImage) return;
        
        await applyImageOperation([{
            type: 'rotate',
            angle
        }]);
    }
    
    // Handle image flipping
    async function handleFlip(direction) {
        if (!currentImage) return;
        
        await applyImageOperation([{
            type: 'flip',
            direction
        }]);
    }
    
    // Handle grayscale conversion
    async function handleGrayscale() {
        if (!currentImage) return;
        
        await applyImageOperation([{
            type: 'grayscale'
        }]);
    }
    
    // Handle format conversion
    async function handleFormatConversion() {
        if (!currentImage) return;
        
        const format = formatSelect.value;
        
        await applyImageOperation([], format);
    }
    
    // Apply image operation
    async function applyImageOperation(operations, format = null) {
        if (!currentImage) return;
        
        // Show loading modal
        showLoading();
        
        try {
            const response = await fetch('/tools/image_converter/api/edit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filename: currentImage.filename,
                    operations,
                    format: format || currentImage.format
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Update current image data
                currentImage = data;
                
                // Update UI with a cache-busting URL to force reload
                showImage(data.url + '?t=' + new Date().getTime());
                updateImageInfo(data);
            } else {
                showError(data.error || 'Failed to process image');
            }
        } catch (error) {
            console.error('Error processing image:', error);
            showError('An error occurred while processing the image');
        } finally {
            hideLoading();
        }
    }
    
    // Handle image download
    function handleDownload() {
        if (!currentImage) return;
        
        // Create a temporary anchor and trigger download
        const link = document.createElement('a');
        link.href = currentImage.url;
        link.download = `edited_${currentImage.originalName || 'image.' + currentImage.format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    // Show error message
    function showError(message) {
        errorMessage.textContent = message;
        errorModal.show();
    }
}); 