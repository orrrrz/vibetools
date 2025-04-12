document.addEventListener('DOMContentLoaded', function() {
    // Elements (keep existing ones)
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

    // Session data (keep existing ones)
    let currentSessionId = null;
    // let currentPdfPath = null; // This variable wasn't used, maybe remove?

    // Event listeners (keep existing ones)
    uploadForm.addEventListener('submit', handleUpload);
    generatePdfBtn.addEventListener('click', generatePdf);
    imageInput.addEventListener('change', handleFileSelection); // Renamed for clarity

    // Add drag and drop support (keep existing code)
    const inputContainer = imageInput.parentElement;
    inputContainer.classList.add('drag-drop-zone'); // Assuming this class exists in your CSS

    inputContainer.addEventListener('dragover', function(e) {
        e.preventDefault();
        inputContainer.classList.add('dragover'); // Assuming this class exists
    });

    inputContainer.addEventListener('dragleave', function() {
        inputContainer.classList.remove('dragover'); // Assuming this class exists
    });

    inputContainer.addEventListener('drop', function(e) {
        e.preventDefault();
        inputContainer.classList.remove('dragover'); // Assuming this class exists
        imageInput.files = e.dataTransfer.files;
        handleFileSelection(); // Call the handler after drop
    });

    // --- NEW: Handle file selection and trigger validation/preview ---
    function handleFileSelection() {
        if (validateImages()) {
             // Clear previous previews immediately when new files are selected/dropped
            imagePreview.innerHTML = '';
            hideError();
            hideElement(pdfResultContainer);
            hideElement(progressContainer); // Hide progress if a new selection happens
            // Proceed to display previews for the newly selected valid files
            displayImagePreviews();
        } else {
            // Validation failed, clear previews and potentially disable upload/generate
            imagePreview.innerHTML = '';
            hideElement(imagePreviewContainer);
             hideElement(pdfResultContainer);
             generatePdfBtn.disabled = true; // Disable generation if validation fails
        }
    }


    // --- MODIFIED: Validate selected images, allowing HEIC/HEIF ---
    function validateImages() {
        const files = imageInput.files;

        if (!files || files.length === 0) {
            // Don't show error yet, might just be clearing selection.
            // Let handleFileSelection manage UI visibility.
            return false; // Indicate no valid files
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp', 'image/heic', 'image/heif'];

        for (let i = 0; i < files.length; i++) {
            const fileType = files[i].type.toLowerCase();
            // Allow empty type for HEIC on some systems, rely on extension check later if needed
            const isAllowedType = allowedTypes.includes(fileType) || fileType === '' || fileType === 'application/octet-stream';
            const isAllowedExtension = /\.(jpe?g|png|gif|bmp|webp|heic|heif)$/i.test(files[i].name);

            if (!isAllowedType && !isAllowedExtension) {
                 // Check both MIME type and extension
                 showError(`文件 "${files[i].name}" 不是支持的图片格式 (JPG, PNG, GIF, BMP, WebP, HEIC, HEIF)`);
                 imageInput.value = ''; // Clear the invalid selection
                 return false;
            }
        }
        hideError(); // Clear any previous error if validation passes
        return true; // All files are potentially valid image types
    }

    // --- MODIFIED: Handle image upload (no major changes needed here) ---
    function handleUpload(e) {
        e.preventDefault();

        // Re-validate before upload, although handleFileSelection should prevent this state
        if (!validateImages() || imageInput.files.length === 0) {
             showError('请先选择有效的图片文件。');
            return;
        }

        // Don't clear previews here, they should already be displayed by handleFileSelection
        hideError();
        hideElement(pdfResultContainer);

        const formData = new FormData(uploadForm);
        // Important: Ensure the backend can handle HEIC/HEIF files now!

        // Show progress
        showElement(progressContainer);
        uploadProgress.style.width = '0%';
        uploadProgress.textContent = '0%';
        uploadProgress.setAttribute('aria-valuenow', 0);

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
            // Keep progress bar visible briefly on completion? Optional.
            // hideElement(progressContainer); // Maybe hide with a slight delay or on success only

            if (xhr.status === 200) {
                try {
                    const response = JSON.parse(xhr.responseText);

                    if (response.success) {
                        currentSessionId = response.session_id;
                        // Previews are already shown. Maybe update status or enable Generate button.
                        // We don't get image previews back from the upload response anymore.
                        // The previews shown are client-side only.
                        // Enable the generate button after successful upload.
                        generatePdfBtn.disabled = false;
                        showElement(generatePdfBtn.closest('.mt-6')); // Show the button container
                         hideElement(progressContainer); // Hide progress on success
                    } else {
                        showError(response.error || '上传失败');
                         hideElement(progressContainer); // Hide progress on error
                         generatePdfBtn.disabled = true; // Disable generation on upload error
                    }
                } catch (e) {
                    showError('解析服务器响应失败');
                     hideElement(progressContainer);
                     generatePdfBtn.disabled = true;
                }
            } else {
                 hideElement(progressContainer);
                 generatePdfBtn.disabled = true;
                try {
                    const response = JSON.parse(xhr.responseText);
                    showError(response.error || `上传失败: ${xhr.statusText} (${xhr.status})`);
                } catch (e) {
                    showError(`上传失败: ${xhr.statusText} (${xhr.status})`);
                }
            }
        });

        xhr.addEventListener('error', function() {
            hideElement(progressContainer);
            showError('网络错误，请重试');
             generatePdfBtn.disabled = true;
        });

        xhr.open('POST', '/tools/img2pdf/api/upload'); // Ensure this endpoint can handle HEIC
        xhr.send(formData);
    }

    // --- SIGNIFICANTLY MODIFIED: Display image previews (handles standard + HEIC) ---
// --- SIGNIFICANTLY MODIFIED: Display image previews (handles standard + HEIC) ---
function displayImagePreviews() {
    const files = imageInput.files;
    imagePreview.innerHTML = ''; // Clear existing previews first

    if (!files || files.length === 0) {
        hideElement(imagePreviewContainer);
         hideElement(generatePdfBtn.closest('.mt-6'));
        return;
    }

    let previewFileCount = 0;

    Array.from(files).forEach((file, index) => {
        const fileType = file.type.toLowerCase();
        const isHeic = fileType === 'image/heic' || fileType === 'image/heif' || /\.(heic|heif)$/i.test(file.name);
        const isStandardImage = file.type.startsWith('image/') && !isHeic;

        // --- Create Preview Structure ---
        const col = document.createElement('div');
        // *** MODIFICATION HERE: Added overflow-hidden and rounded-md ***
        col.className = 'relative group aspect-square overflow-hidden rounded-md'; // Added overflow-hidden

        const previewItem = document.createElement('div');
        previewItem.className = 'image-preview-item w-full h-full'; // Item fills the column
        // previewItem.dataset.id = index;

         // --- Placeholder ---
         // Make placeholder respect rounded corners of parent
        previewItem.innerHTML = `
            <div class="absolute inset-0 flex items-center justify-center bg-gray-200"> 
                <span class="text-gray-500 text-xs">加载中...</span>
            </div>
            <div class="image-preview-caption text-xs truncate absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white p-1 hidden group-hover:block">${file.name}</div>
             <button class="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity z-10 image-preview-remove" title="移除">&times;</button>
        `;
        col.appendChild(previewItem);
        imagePreview.appendChild(col);
        previewFileCount++;

        // Function to update preview with image/error
        const updatePreview = (imgSrc, errorMsg = null) => {
            if (errorMsg) {
                previewItem.innerHTML = `
                    <div class="absolute inset-0 flex flex-col items-center justify-center bg-red-100 border border-red-300 text-red-700 p-1"> {/* Removed rounded-md */}
                         <span class="text-xs text-center font-semibold">无法预览</span>
                         <span class="text-xxs text-center truncate w-full" title="${file.name}">${file.name}</span>
                         <span class="text-xxs text-center mt-1">${errorMsg}</span>
                    </div>
                     <button class="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-100 transition-opacity z-10 image-preview-remove" title="移除">&times;</button>
                `;
            } else {
                previewItem.innerHTML = `
                    <img src="${imgSrc}" alt="${file.name}"
                         class="w-full h-full object-cover"> 
<div class="image-preview-caption text-xs text-black truncate absolute bottom-0 left-0 right-0 bg-transparent text-white p-1 hidden group-hover:block">${file.name}</div>
                     <button class="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity z-10 image-preview-remove" title="移除">&times;</button>
                `;
            }
            // Re-attach remove listener
             const removeBtn = previewItem.querySelector('.image-preview-remove');
             if (removeBtn) {
                 removeBtn.addEventListener('click', (e) => {
                     e.stopPropagation();
                     removePreviewItem(col, file);
                 });
             }
        };

        // --- Handle Image Display (logic remains the same) ---
        if (isStandardImage) {
            // ... (FileReader logic)
             const reader = new FileReader();
            reader.onload = function(e) {
                updatePreview(e.target.result);
            }
            reader.onerror = function() {
                updatePreview(null, '读取错误');
            }
            reader.readAsDataURL(file);
        } else if (isHeic && typeof heic2any === 'function') {
            // ... (heic2any logic)
             heic2any({ /* ... options ... */ blob: file, toType: "image/jpeg", quality: 0.7 })
            .then(conversionResult => {
                const objectURL = URL.createObjectURL(conversionResult);
                updatePreview(objectURL);
            })
            .catch(err => {
                console.error(`HEIC conversion failed for ${file.name}:`, err);
                updatePreview(null, 'HEIC转换失败');
            });
        } else if (isHeic && typeof heic2any !== 'function') {
             console.error('heic2any library is not loaded.');
             updatePreview(null, 'HEIC库未加载');
         }
        else {
            updatePreview(null, '不支持的类型');
        }
    });

    // Show/hide containers (logic remains the same)
    if (previewFileCount > 0) {
       // ... show containers ...
        showElement(imagePreviewContainer);
        showElement(generatePdfBtn.closest('.mt-6'));
        generatePdfBtn.disabled = true;
        document.getElementById('uploadBtn').disabled = false;
    } else {
        // ... hide containers ...
         hideElement(imagePreviewContainer);
         hideElement(generatePdfBtn.closest('.mt-6'));
         document.getElementById('uploadBtn').disabled = true;
    }
} // End of displayImagePreviews

     // --- NEW: Function to remove a specific preview item ---
     function removePreviewItem(itemElement, fileToRemove) {
         // Find the index of the file to remove in the original FileList
         const currentFiles = Array.from(imageInput.files);
         const indexToRemove = currentFiles.findIndex(file => file === fileToRemove);

         if (indexToRemove !== -1) {
             // Create a new FileList without the removed file
             const newFilesList = new DataTransfer();
             currentFiles.forEach((file, index) => {
                 if (index !== indexToRemove) {
                     newFilesList.items.add(file);
                 }
             });

             // Update the input's files property
             imageInput.files = newFilesList.files;

             // Remove the visual element
             itemElement.remove();

             // Update UI state (check if any previews left)
             if (imagePreview.children.length === 0) {
                 hideElement(imagePreviewContainer);
                 hideElement(generatePdfBtn.closest('.mt-6'));
                 // Disable upload button if no files left
                 document.getElementById('uploadBtn').disabled = true;
                 generatePdfBtn.disabled = true; // Also disable generate button
             } else {
                 // Re-enable upload button if files remain
                 document.getElementById('uploadBtn').disabled = false;
                 // Keep generate button disabled until upload is successful
                  generatePdfBtn.disabled = !currentSessionId; // Enable only if already uploaded
             }
         } else {
              console.error("Could not find file to remove in input list.");
              // Fallback: Just remove the element anyway
              itemElement.remove();
               if (imagePreview.children.length === 0) {
                 hideElement(imagePreviewContainer);
                 hideElement(generatePdfBtn.closest('.mt-6'));
                  document.getElementById('uploadBtn').disabled = true;
                  generatePdfBtn.disabled = true;
             }
         }
     }


    // --- MODIFIED: Generate PDF (Ensure button state is managed) ---
    function generatePdf() {
        // Check based on previews shown, not just session ID,
        // as user might have removed all images after upload.
        if (imagePreview.children.length === 0) {
            showError('没有可用的图片，请先上传并确保有图片保留在预览中。');
            return;
        }
        if (!currentSessionId) {
             showError('图片尚未成功上传或会话已过期，请重新上传。');
             return;
        }


        // Disable button and show loading
        generatePdfBtn.disabled = true;
        generatePdfBtn.innerHTML = '<span class="spinner-border spinner-border-sm animate-spin mr-1" role="status" aria-hidden="true"></span> 生成中...'; // Added Tailwind spin

        fetch('/tools/img2pdf/api/generate', { // Ensure this endpoint exists and works
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            // Send the session ID *and* potentially the list of *currently visible* image IDs/names
            // if the backend needs to know which images to include (in case some were removed client-side after upload)
            // For simplicity now, we assume the backend uses all images associated with the session ID.
            body: JSON.stringify({
                session_id: currentSessionId
                // Optional: Send current image identifiers if needed
                // image_ids: Array.from(imagePreview.querySelectorAll('.image-preview-item')).map(item => item.dataset.id)
            })
        })
        .then(response => {
            if (!response.ok) {
                // Try to parse error from JSON response body
                return response.json().then(errData => {
                    throw new Error(errData.error || `服务器错误: ${response.statusText} (${response.status})`);
                }).catch(() => {
                    // If parsing fails, throw generic error
                    throw new Error(`服务器错误: ${response.statusText} (${response.status})`);
                });
            }
            return response.json();
        })
        .then(data => {
             // Re-enable button ONLY on success or expected failure
             generatePdfBtn.disabled = false; // Re-enable before checking success
            generatePdfBtn.innerHTML = '生成PDF'; // Restore text

            if (data.success) {
                // Set download link using session ID
                downloadPdfBtn.href = `/tools/img2pdf/api/download/${currentSessionId}`; // Ensure this endpoint works
                showElement(pdfResultContainer);
                hideError(); // Hide previous errors on success

                // No automatic cleanup - let user download first.
                // downloadPdfBtn.onclick = () => { setTimeout(cleanup, 3000); }; // Example if cleanup is needed
            } else {
                showError(data.error || 'PDF生成失败');
                 hideElement(pdfResultContainer); // Hide result container on error
                 generatePdfBtn.disabled = false; // Ensure button is enabled on failure
            }
        })
        .catch(error => {
            console.error("Generate PDF Error:", error);
            generatePdfBtn.disabled = false; // Re-enable button on network/fetch error
            generatePdfBtn.innerHTML = '生成PDF'; // Restore text
            showError('PDF生成失败: ' + error.message);
             hideElement(pdfResultContainer); // Hide result container on error
        });
    }


    // Helper functions (Keep existing, ensure they use 'hidden')
    function showError(msg) {
        errorMessage.textContent = msg;
        showElement(errorContainer);
         // Scroll to error message? Optional.
         // errorContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function hideError() {
        hideElement(errorContainer);
    }

    function showElement(el) {
        if (el) {
            el.classList.remove('hidden');
        } else {
            // console.warn("Attempted to show a null element.");
        }
    }

    function hideElement(el) {
        if (el) {
            el.classList.add('hidden');
        } else {
            // console.warn("Attempted to hide a null element.");
        }
    }

     // Optional: Cleanup function if needed (e.g., call API to delete server files)
     // function cleanup() {
     //     if (currentSessionId) {
     //         console.log("Cleaning up session:", currentSessionId);
     //         fetch('/tools/img2pdf/api/cleanup', { // Needs a backend endpoint
     //             method: 'POST',
     //             headers: { 'Content-Type': 'application/json' },
     //             body: JSON.stringify({ session_id: currentSessionId })
     //         }).catch(err => console.error("Cleanup failed:", err));
     //         currentSessionId = null; // Reset session ID locally
     //     }
     //     // Reset UI elements if necessary
     //     imageInput.value = ''; // Clear file input
     //     imagePreview.innerHTML = '';
     //     hideElement(imagePreviewContainer);
     //     hideElement(pdfResultContainer);
     //     hideElement(progressContainer);
     //     hideError();
     //     generatePdfBtn.disabled = true;
     //     document.getElementById('uploadBtn').disabled = true;
     // }

    // Initial state setup
     hideElement(progressContainer);
     hideElement(imagePreviewContainer);
     hideElement(pdfResultContainer);
     hideElement(errorContainer);
     hideElement(generatePdfBtn.closest('.mt-6')); // Hide generate button initially
     document.getElementById('uploadBtn').disabled = true; // Disable upload initially
     generatePdfBtn.disabled = true; // Disable generate initially

});