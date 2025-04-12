// Wait for the DOM to be fully loaded before running the script
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    // Forms and Inputs
    const uploadForm = document.getElementById('upload-form');
    const imageUpload = document.getElementById('image-upload');
    const resizeWidth = document.getElementById('resize-width');
    const resizeHeight = document.getElementById('resize-height');
    const formatSelect = document.getElementById('format-select');

    // Buttons
    const downloadBtn = document.getElementById('download-btn');
    const resizeBtn = document.getElementById('resize-btn');
    const rotateLeft = document.getElementById('rotate-left');
    const rotateRight = document.getElementById('rotate-right');
    const flipHorizontal = document.getElementById('flip-horizontal');
    const flipVertical = document.getElementById('flip-vertical');
    const grayscaleBtn = document.getElementById('grayscale-btn');
    const convertFormatBtn = document.getElementById('convert-format-btn');

    // Display Areas
    const imagePreview = document.getElementById('image-preview');
    const uploadPrompt = document.getElementById('upload-prompt');
    const imageInfo = document.getElementById('image-info');

    // Modals and Error Message Elements
    const loadingModalElement = document.getElementById('loadingModal'); // Reference to the loading modal container
    const errorModalElement = document.getElementById('errorModal');     // Reference to the error modal container
    const errorMessage = document.getElementById('error-message');       // Span inside the error modal to show the message
    // Note: Modal close buttons in the HTML use onclick. For better practice, add IDs and attach listeners here.

    // --- State Variable ---
    let currentImage = null; // Stores data about the currently loaded/edited image

    // --- Initialization ---
    init();

    /**
     * Initializes the application by setting up event listeners
     * and disabling operation buttons initially.
     */
    function init() {
        // Set up event listeners for user interactions
        uploadForm.addEventListener('submit', handleUpload);
        downloadBtn.addEventListener('click', handleDownload);
        resizeBtn.addEventListener('click', handleResize);
        rotateLeft.addEventListener('click', () => handleRotate(-90));
        rotateRight.addEventListener('click', () => handleRotate(90));
        flipHorizontal.addEventListener('click', () => handleFlip('horizontal'));
        flipVertical.addEventListener('click', () => handleFlip('vertical'));
        grayscaleBtn.addEventListener('click', handleGrayscale);
        convertFormatBtn.addEventListener('click', handleFormatConversion);

        // Disable operation buttons until an image is loaded
        toggleOperationButtons(false);

        // Add listeners for modal close buttons (if they had IDs)
        // Example: document.getElementById('errorModalCloseBtn')?.addEventListener('click', hideError);
        // Since the HTML uses onclick, this step is skipped for now.
    }

    // --- Modal Handling Functions (Tailwind CSS based) ---

    /**
     * Shows the loading modal by removing the 'hidden' class.
     */
    function showLoading() {
        if (loadingModalElement) {
            loadingModalElement.classList.remove('hidden');
        }
    }

    /**
     * Hides the loading modal by adding the 'hidden' class.
     */
    function hideLoading() {
        if (loadingModalElement) {
            loadingModalElement.classList.add('hidden');
        }
    }

    /**
     * Shows the error modal with a specific message.
     * @param {string} message - The error message to display.
     */
    function showError(message) {
        if (errorMessage && errorModalElement) {
            errorMessage.textContent = message; // Set the error text
            errorModalElement.classList.remove('hidden'); // Show the modal
        } else {
            console.error("Error modal elements not found. Message:", message);
            alert("发生错误: " + message); // Fallback alert
        }
    }

    /**
     * Hides the error modal.
     * Can be called when starting a new operation or explicitly by a close button.
     */
    function hideError() {
        if (errorModalElement) {
            errorModalElement.classList.add('hidden');
        }
    }


    // --- UI Update Functions ---

    /**
     * Enables or disables all image operation buttons and inputs.
     * @param {boolean} enabled - True to enable, false to disable.
     */
    function toggleOperationButtons(enabled) {
        const buttons = [
            downloadBtn, resizeBtn, rotateLeft, rotateRight,
            flipHorizontal, flipVertical, grayscaleBtn, convertFormatBtn
        ];
        const inputs = [resizeWidth, resizeHeight, formatSelect];

        buttons.forEach(btn => {
            if (btn) btn.disabled = !enabled;
        });

        inputs.forEach(input => {
            if (input) input.disabled = !enabled;
        });
    }

    /**
     * Displays the image in the preview area and hides the initial prompt.
     * Uses Tailwind's 'hidden' class.
     * @param {string} url - The URL of the image to display.
     */
    function showImage(url) {
        if (imagePreview && uploadPrompt) {
            imagePreview.src = url;
            imagePreview.classList.remove('hidden'); // Show the image element
            uploadPrompt.classList.add('hidden');    // Hide the prompt element
        }
    }

    /**
     * Updates the image information section with details.
     * Generates an HTML table with Tailwind CSS classes.
     * @param {object} data - The image data object from the backend.
     */
    function updateImageInfo(data) {
        if (!imageInfo || !data) return;

        // Basic Tailwind table styling
        let infoHtml = '<table class="w-full text-left text-sm">';
        infoHtml += '<tbody class="divide-y divide-gray-200">'; // Add lines between rows
        infoHtml += `<tr class="hover:bg-gray-50"><td class="py-1 pr-2 font-medium text-gray-600">名称:</td><td class="py-1 text-gray-800 break-all">${data.originalName || data.filename}</td></tr>`;
        infoHtml += `<tr class="hover:bg-gray-50"><td class="py-1 pr-2 font-medium text-gray-600">尺寸:</td><td class="py-1 text-gray-800">${data.width} × ${data.height}</td></tr>`;
        infoHtml += `<tr class="hover:bg-gray-50"><td class="py-1 pr-2 font-medium text-gray-600">格式:</td><td class="py-1 text-gray-800">${(data.format || '').toUpperCase()}</td></tr>`;
        infoHtml += '</tbody></table>';

        imageInfo.innerHTML = infoHtml;
    }


    // --- Event Handlers ---

    /**
     * Handles the form submission for image upload.
     * Sends the image file to the backend API.
     * @param {Event} e - The form submission event.
     */
    async function handleUpload(e) {
        e.preventDefault(); // Prevent default form submission

        if (!imageUpload || !imageUpload.files || imageUpload.files.length === 0) {
            showError('请选择要上传的图片');
            return;
        }
        const file = imageUpload.files[0];

        hideError(); // Hide any previous errors
        showLoading(); // Show loading indicator

        const formData = new FormData();
        formData.append('image', file); // 'image' should match backend expectation

        try {
            const response = await fetch('/tools/image_converter/api/upload', {
                method: 'POST',
                body: formData
            });

            // Check if the response status indicates success
            if (!response.ok) {
                 // Try to parse error message from backend if available
                 let errorMsg = `HTTP 错误! 状态: ${response.status}`;
                 try {
                     const errorData = await response.json();
                     errorMsg = errorData.error || errorMsg;
                 } catch (parseError) {
                     // Ignore if response is not JSON
                 }
                 throw new Error(errorMsg);
            }

            const data = await response.json();

            if (data.success) {
                currentImage = data; // Store image data
                showImage(data.url); // Display the uploaded image
                updateImageInfo(data); // Show image details
                toggleOperationButtons(true); // Enable editing buttons
            } else {
                showError(data.error || '上传图片失败');
            }
        } catch (error) {
            console.error('上传图片时出错:', error);
            showError('上传图片时发生错误: ' + error.message);
            toggleOperationButtons(false); // Disable buttons on error
        } finally {
            hideLoading(); // Hide loading indicator regardless of outcome
        }
    }

    /**
     * Handles the click event for the download button.
     * Triggers a download of the current image URL.
     */
    function handleDownload() {
        if (!currentImage || !currentImage.url) {
            showError("没有可供下载的图片。");
            return;
        }

        // Create a temporary link element to trigger the download
        const link = document.createElement('a');
        link.href = currentImage.url;
        // Suggest a filename for the download
        link.download = `edited_${currentImage.originalName || 'image.' + currentImage.format}`;
        document.body.appendChild(link); // Append to body (required for Firefox)
        link.click(); // Simulate a click
        document.body.removeChild(link); // Clean up the link
    }

    /**
     * Handles the click event for the resize button.
     * Validates input and calls applyImageOperation.
     */
    async function handleResize() {
        if (!currentImage) return;
        hideError();

        const width = parseInt(resizeWidth.value);
        const height = parseInt(resizeHeight.value);

        if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
            showError('请输入有效的宽度和高度值');
            return;
        }

        await applyImageOperation([{ type: 'resize', width, height }]);
    }

    /**
     * Handles the click event for rotate buttons.
     * @param {number} angle - The angle to rotate (-90 or 90).
     */
    async function handleRotate(angle) {
        if (!currentImage) return;
        hideError();
        await applyImageOperation([{ type: 'rotate', angle }]);
    }

    /**
     * Handles the click event for flip buttons.
     * @param {string} direction - 'horizontal' or 'vertical'.
     */
    async function handleFlip(direction) {
        if (!currentImage) return;
        hideError();
        await applyImageOperation([{ type: 'flip', direction }]);
    }

    /**
     * Handles the click event for the grayscale button.
     */
    async function handleGrayscale() {
        if (!currentImage) return;
        hideError();
        await applyImageOperation([{ type: 'grayscale' }]);
    }

    /**
     * Handles the click event for the format conversion button.
     */
    async function handleFormatConversion() {
        if (!currentImage) return;
        hideError();
        const format = formatSelect.value;
        await applyImageOperation([], format); // Send empty operations array, just specify format
    }


    // --- Backend Interaction ---

    /**
     * Sends image editing operations to the backend API.
     * @param {Array<object>} operations - An array of operation objects.
     * @param {string|null} format - The target format (optional, defaults to current format).
     */
    async function applyImageOperation(operations, format = null) {
        if (!currentImage || !currentImage.filename) {
             showError("无法应用操作：缺少图片信息。");
             return;
        }

        showLoading(); // Show loading indicator

        try {
            const response = await fetch('/tools/image_converter/api/edit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filename: currentImage.filename, // Send current filename to identify image
                    operations: operations,
                    format: format || currentImage.format // Target format
                })
            });

             if (!response.ok) {
                 let errorMsg = `HTTP 错误! 状态: ${response.status}`;
                 try {
                     const errorData = await response.json();
                     errorMsg = errorData.error || errorMsg;
                 } catch (parseError) { /* Ignore */ }
                 throw new Error(errorMsg);
            }

            const data = await response.json();

            if (data.success) {
                currentImage = data; // Update state with new image data
                // Add cache-busting query parameter to force image reload
                showImage(data.url + '?t=' + new Date().getTime());
                updateImageInfo(data); // Update displayed info

                document.getElementById('download-btn').classList.remove('hidden');
            } else {
                showError(data.error || '处理图片失败');
            }
        } catch (error) {
            console.error('处理图片时出错:', error);
            showError('处理图片时发生错误: ' + error.message);
        } finally {
            hideLoading(); // Hide loading indicator
        }
    }

}); // End of DOMContentLoaded listener
