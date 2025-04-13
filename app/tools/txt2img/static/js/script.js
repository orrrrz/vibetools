document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('imageCanvas');
    const ctx = canvas.getContext('2d');
    const canvasContainer = document.getElementById('canvas-container');

    // --- Control Elements ---
    const canvasWidthInput = document.getElementById('canvas-width');
    const canvasHeightInput = document.getElementById('canvas-height');
    const bgColorInput = document.getElementById('bg-color');
    const bgImageUpload = document.getElementById('bg-image-upload');
    const clearBgImageBtn = document.getElementById('clear-bg-image');
    const textInput = document.getElementById('text-input');
    const addTextBtn = document.getElementById('add-text-btn');
    const textPropertiesDiv = document.getElementById('text-properties');
    const editTextContentInput = document.getElementById('edit-text-content');
    const fontFamilySelect = document.getElementById('font-family');
    const fontSizeInput = document.getElementById('font-size');
    const fontColorInput = document.getElementById('font-color');
    const deleteTextBtn = document.getElementById('delete-text-btn');
    const exportBtns = document.querySelectorAll('.export-btn');
    const aspectRatioBtns = document.querySelectorAll('.aspect-ratio-btn');

    // --- State Variables ---
    // Initialize dimensions from inputs
    let canvasWidth = parseInt(canvasWidthInput.value, 10) || 750; // Default on invalid
    let canvasHeight = parseInt(canvasHeightInput.value, 10) || 1000;
    let bgColor = bgColorInput.value;
    let bgImage = null; // Store the Image object for background
    let textElements = []; // Array to store text objects { text, x, y, font, size, color, width, height }
    let selectedTextIndex = -1; // Index of the selected text element
    let isDragging = false;
    let dragStartX, dragStartY;
    let textOffsetX, textOffsetY; // Offset from text top-left to mouse click

    // --- Initialization ---
    function initializeCanvas() {
        // Store current state if needed (e.g., selected index)
        const previouslySelected = selectedTextIndex;

        // Apply dimensions to canvas ELEMENT attributes
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        // Update container style for visual scaling
        updateCanvasContainerStyle();

        // Redraw everything (background, image, text)
        // Canvas context state (font, fillStyle etc.) is reset when dimensions change,
        // so redrawCanvas needs to set them all correctly.
        redrawCanvas();

        // Restore selection state if any text was selected
        if (previouslySelected !== -1 && previouslySelected < textElements.length) {
            selectText(previouslySelected, false); // Select without showing properties again unnecessarily
        } else {
             deselectText(false); // Deselect without redraw if nothing was selected
        }

        console.log(`Canvas initialized/resized to ${canvasWidth}x${canvasHeight}`);
    }

    function updateCanvasContainerStyle() {
        // Set container aspect ratio for proper scaling in layout
        canvasContainer.style.aspectRatio = `${canvasWidth} / ${canvasHeight}`;
        console.log(`Container aspect ratio set to: ${canvasWidth} / ${canvasHeight}`);
    }

    // --- Drawing ---
    function redrawCanvas() {
        console.log('Redrawing canvas. Text elements:', textElements.length);
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw background color
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw background image if exists and loaded
        if (bgImage && bgImage.complete && bgImage.naturalWidth !== 0) { // Check if loaded and valid
             console.log('Drawing bgImage:', bgImage.src);
            // Default: cover the canvas, maintain aspect ratio, center
            const canvasAspect = canvas.width / canvas.height;
            const imgAspect = bgImage.naturalWidth / bgImage.naturalHeight; // Use naturalWidth/Height
            let drawWidth, drawHeight, drawX, drawY;

            if (imgAspect > canvasAspect) { // Image wider than canvas ratio
                drawHeight = canvas.height;
                drawWidth = bgImage.naturalWidth * (drawHeight / bgImage.naturalHeight);
                drawX = (canvas.width - drawWidth) / 2;
                drawY = 0;
            } else { // Image taller than or equal to canvas ratio
                drawWidth = canvas.width;
                drawHeight = bgImage.naturalHeight * (drawWidth / bgImage.naturalWidth);
                drawX = 0;
                drawY = (canvas.height - drawHeight) / 2;
            }
             ctx.drawImage(bgImage, drawX, drawY, drawWidth, drawHeight);
        } else if (bgImage) {
            console.log('bgImage exists but not ready or invalid', bgImage.complete, bgImage.naturalWidth);
        }


        // Draw text elements
        textElements.forEach((textEl, index) => {
            // IMPORTANT: Reset context properties for each text element
            ctx.font = `${textEl.size}px ${textEl.font}`;
            ctx.fillStyle = textEl.color;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';

            console.log(`Drawing text: "${textEl.text}" at (${textEl.x}, ${textEl.y}) with font: ${ctx.font} color: ${ctx.fillStyle}`);

            // Measure text for bounding box
            const metrics = ctx.measureText(textEl.text);
            // Note: Actual bounding box calculation is complex. Approximation:
            textEl.width = metrics.width;
            textEl.height = textEl.size * 1.2; // Approximation factor

            // Draw text
            ctx.fillText(textEl.text, textEl.x, textEl.y);

            // Draw selection box if selected
            if (index === selectedTextIndex) {
                console.log(`Drawing selection box for index ${index}`);
                ctx.strokeStyle = 'rgba(0, 0, 255, 0.7)';
                ctx.lineWidth = 1;
                ctx.strokeRect(textEl.x - 2, textEl.y - 2, textEl.width + 4, textEl.height + 4); // Padding
            }
        });
        console.log('Redraw complete.');
    }

    // --- Text Manipulation ---
    function addText() {
        const text = textInput.value.trim();
        if (!text) return;

        const newText = {
            text: text,
            // Place new text somewhat centrally, considering potential size
            x: Math.max(10, (canvas.width - ctx.measureText(text).width) / 2),
            y: Math.max(10, (canvas.height - parseInt(fontSizeInput.value, 10)) / 2),
            font: fontFamilySelect.value,
            size: parseInt(fontSizeInput.value, 10),
            color: fontColorInput.value,
            width: 0,
            height: 0
        };

        textElements.push(newText);
        textInput.value = ''; // Clear input
        selectText(textElements.length - 1); // Select the newly added text and redraw
    }

    function updateSelectedTextProperties() {
        if (selectedTextIndex === -1 || selectedTextIndex >= textElements.length) return;

        const selectedText = textElements[selectedTextIndex];
        selectedText.text = editTextContentInput.value;
        selectedText.font = fontFamilySelect.value;
        selectedText.size = parseInt(fontSizeInput.value, 10);
        selectedText.color = fontColorInput.value;

        redrawCanvas(); // Redraw to reflect changes
    }

    function deleteSelectedText() {
        if (selectedTextIndex !== -1 && selectedTextIndex < textElements.length) {
            textElements.splice(selectedTextIndex, 1);
            deselectText(); // Deselect and redraw
        }
    }

    // Added 'shouldRedraw' parameter to avoid redundant redraws sometimes
    function selectText(index, showProperties = true, shouldRedraw = true) {
        if (index >= 0 && index < textElements.length) {
            selectedTextIndex = index;
            const selectedText = textElements[index];
            // Update controls
            if (showProperties) {
                editTextContentInput.value = selectedText.text;
                fontFamilySelect.value = selectedText.font;
                fontSizeInput.value = selectedText.size;
                fontColorInput.value = selectedText.color;
                textPropertiesDiv.classList.remove('hidden');
            }
        } else {
            deselectText(false); // Don't redraw if index is invalid
        }
        if (shouldRedraw) {
            redrawCanvas();
        }
    }

    function deselectText(shouldRedraw = true) {
        selectedTextIndex = -1;
        textPropertiesDiv.classList.add('hidden');
        if (shouldRedraw) {
            redrawCanvas();
        }
    }


    // --- Event Handlers ---

    // Canvas Size Change from Input Fields
    function handleSizeInputChange() {
        let newWidth = parseInt(canvasWidthInput.value, 10);
        let newHeight = parseInt(canvasHeightInput.value, 10);

        // Basic validation
        if (isNaN(newWidth) || newWidth <= 0) newWidth = canvasWidth; // Revert if invalid
        if (isNaN(newHeight) || newHeight <= 0) newHeight = canvasHeight; // Revert if invalid

        canvasWidth = newWidth;
        canvasHeight = newHeight;
        canvasWidthInput.value = canvasWidth; // Ensure input reflects actual value
        canvasHeightInput.value = canvasHeight;

        clearActiveAspectRatio(); // Input change overrides aspect ratio selection
        initializeCanvas(); // Resize and redraw
    }
    canvasWidthInput.addEventListener('change', handleSizeInputChange);
    canvasHeightInput.addEventListener('change', handleSizeInputChange);

    // Aspect Ratio Buttons
    aspectRatioBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Use current width as the basis for calculation
            let baseWidth = parseInt(canvasWidthInput.value, 10);
            if (isNaN(baseWidth) || baseWidth <= 0) baseWidth = 750; // Default if input is invalid

            const ratio = btn.id.split('-').slice(1).join(':').split(':'); // e.g., "aspect-3-4" -> ["3", "4"]
            const aspect = parseInt(ratio[0], 10) / parseInt(ratio[1], 10);

            // Keep width constant, adjust height
            canvasWidth = baseWidth;
            canvasHeight = Math.round(baseWidth / aspect);

            // --- FIX 1: Update input fields ---
            canvasWidthInput.value = canvasWidth;
            canvasHeightInput.value = canvasHeight;

            // Highlight active button
            aspectRatioBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Resize canvas element attributes and redraw content
            initializeCanvas();
        });
    });

    function clearActiveAspectRatio() {
         aspectRatioBtns.forEach(b => b.classList.remove('active'));
    }

    // Background Color Change
    bgColorInput.addEventListener('input', () => {
        bgColor = bgColorInput.value;
        redrawCanvas(); // Only need redraw, not full initialize
    });

    // Background Image Upload
    bgImageUpload.addEventListener('change', (event) => {
        const file = event.target.files[0];
        console.log('File selected:', file);
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                 console.log('FileReader loaded. Result length:', e.target.result.length);
                // Create a new Image object *every time* a file is loaded
                bgImage = new Image();
                bgImage.onload = () => {
                    console.log('bgImage successfully loaded:', bgImage.naturalWidth, 'x', bgImage.naturalHeight);
                    redrawCanvas(); // Redraw canvas now that the image is ready
                };
                bgImage.onerror = (error) => {
                    console.error("Error loading background image:", error);
                    alert("无法加载背景图片，请检查文件是否有效。");
                    bgImage = null; // Reset on error
                    redrawCanvas(); // Redraw without the failed image
                }
                bgImage.src = e.target.result; // Set src AFTER defining onload/onerror
                 console.log('bgImage src set.');
                 // --- FIX 3: Reset file input value later ---
                 // Moved reset inside reader.onload to avoid potential issues
                 bgImageUpload.value = '';
            }
             reader.onerror = (error) => {
                console.error("FileReader error:", error);
                alert("读取文件时出错。");
                bgImageUpload.value = ''; // Reset input on reader error too
            };
            reader.readAsDataURL(file);
        } else {
             bgImageUpload.value = ''; // Reset if no file selected (e.g., user cancels)
        }
    });


    // Clear Background Image
    clearBgImageBtn.addEventListener('click', () => {
        bgImage = null;
        bgImageUpload.value = ''; // Clear the file input visually
        redrawCanvas();
        console.log('Background image cleared.');
    });

    // Add Text Button
    addTextBtn.addEventListener('click', addText);

    // Text Property Changes (while text is selected)
    editTextContentInput.addEventListener('input', updateSelectedTextProperties);
    fontFamilySelect.addEventListener('change', updateSelectedTextProperties);
    fontSizeInput.addEventListener('change', updateSelectedTextProperties);
    fontColorInput.addEventListener('input', updateSelectedTextProperties);

    // Delete Text Button
    deleteTextBtn.addEventListener('click', deleteSelectedText);

    // --- Canvas Interaction (Click, Drag) ---
    function getMousePos(canvas, evt) {
        const rect = canvas.getBoundingClientRect();
        // Adjust for canvas scaling if CSS size differs from attribute size
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (evt.clientX - rect.left) * scaleX,
            y: (evt.clientY - rect.top) * scaleY
        };
    }

    function isPointInText(x, y, textEl) {
        // Use calculated width/height for hit detection
        return x >= textEl.x && x <= textEl.x + textEl.width &&
               y >= textEl.y && y <= textEl.y + textEl.height;
    }

    canvas.addEventListener('mousedown', (e) => {
        const mousePos = getMousePos(canvas, e);
        isDragging = false; // Reset dragging state

        // Check if clicking on existing text (iterate backwards to select topmost)
        let clickedTextIndex = -1;
        for (let i = textElements.length - 1; i >= 0; i--) {
            if (isPointInText(mousePos.x, mousePos.y, textElements[i])) {
                clickedTextIndex = i;
                break;
            }
        }

        if (clickedTextIndex !== -1) {
            // Don't redraw here, selectText will do it
            selectText(clickedTextIndex, true, false); // Select, show props, but defer redraw
            isDragging = true;
            dragStartX = mousePos.x;
            dragStartY = mousePos.y;
            textOffsetX = mousePos.x - textElements[selectedTextIndex].x;
            textOffsetY = mousePos.y - textElements[selectedTextIndex].y;
            canvas.style.cursor = 'move';
            redrawCanvas(); // Redraw now to show selection immediately
        } else {
            deselectText(); // This redraws
            canvas.style.cursor = 'default';
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        const mousePos = getMousePos(canvas, e);

        if (isDragging && selectedTextIndex !== -1 && selectedTextIndex < textElements.length) {
            const selectedText = textElements[selectedTextIndex];
            selectedText.x = mousePos.x - textOffsetX;
            selectedText.y = mousePos.y - textOffsetY;
            redrawCanvas(); // Redraw continuously while dragging
        } else {
             // Change cursor if hovering over text, only if not dragging
            let hoveringText = false;
            if (!isDragging) {
                for (let i = textElements.length - 1; i >= 0; i--) {
                    if (isPointInText(mousePos.x, mousePos.y, textElements[i])) {
                        hoveringText = true;
                        break;
                    }
                }
                 canvas.style.cursor = hoveringText ? 'move' : 'default';
            }
        }
    });

    canvas.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            // Update cursor based on final position
             const mousePos = getMousePos(canvas, event); // Need event here
             let hoveringText = false;
             for (let i = textElements.length - 1; i >= 0; i--) {
                 if (isPointInText(mousePos.x, mousePos.y, textElements[i])) {
                     hoveringText = true;
                     break;
                 }
             }
             canvas.style.cursor = hoveringText ? 'move' : 'default';
        }
    });

    canvas.addEventListener('mouseleave', () => {
        // Stop dragging if mouse leaves canvas
        if (isDragging) {
            isDragging = false;
             canvas.style.cursor = 'default';
        }
    });


    // --- Export ---
    exportBtns.forEach(button => {
        button.addEventListener('click', () => {
            console.log(`Exporting as ${button.dataset.format}...`);
            // Temporarily deselect text for clean export
            const originallySelected = selectedTextIndex;
            if (selectedTextIndex !== -1) {
                 // Deselect without redrawing immediately
                 selectedTextIndex = -1;
                 // Don't hide properties div yet, just remove selection state
            }

            // Ensure canvas is drawn cleanly without selection box
             redrawCanvas(); // Redraw one last time without any selection box

            const format = button.dataset.format; // 'png', 'jpeg', 'webp'
            const mimeType = `image/${format}`;
            const filename = `xiaohongshu-image.${format}`;

            let dataURL;
            try {
                 if (format === 'jpeg') {
                    // Create a temporary canvas ONLY if background isn't fully opaque or image exists
                    // For simplicity, always redraw with bg color for JPG export to ensure no transparency issues
                    console.log('Creating temporary canvas for JPG export.');
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = canvas.width;
                    tempCanvas.height = canvas.height;
                    const tempCtx = tempCanvas.getContext('2d');
                    tempCtx.fillStyle = bgColor; // Ensure background color
                    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                    tempCtx.drawImage(canvas, 0, 0); // Draw the original canvas content on top
                    dataURL = tempCanvas.toDataURL(mimeType, 0.92); // Quality 0.92 for JPG
                } else {
                    dataURL = canvas.toDataURL(mimeType);
                }
                 console.log(`Data URL created (length: ${dataURL.length})`);

                 // Trigger download
                 const link = document.createElement('a');
                 link.href = dataURL;
                 link.download = filename;
                 document.body.appendChild(link); // Required for Firefox
                 link.click();
                 document.body.removeChild(link);
                 console.log('Download triggered.');

            } catch (error) {
                 console.error(`Error during ${format} export:`, error);
                 alert(`导出 ${format.toUpperCase()} 图片时出错: ${error.message}`);
            }


            // Restore selection state AFTER export and download trigger
            if (originallySelected !== -1) {
                 console.log(`Restoring selection to index ${originallySelected}`);
                 // Reselect the text element, redraw will happen inside selectText
                 selectText(originallySelected, true); // Show properties again
            } else {
                 // If nothing was selected, ensure the view is correct (e.g. if redraw failed during export try)
                 redrawCanvas();
            }
        });
    });

    // --- Initial Setup ---
    initializeCanvas(); // Initial setup of canvas size and drawing
    console.log('Xiaohongshu Image Tool Initialized.');
});