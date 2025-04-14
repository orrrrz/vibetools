document.addEventListener('DOMContentLoaded', () => {
    // --- Element References ---
    const canvas = document.getElementById('imageCanvas');
    const ctx = canvas.getContext('2d');
    const canvasContainer = document.getElementById('canvas-container');
    const canvasWidthInput = document.getElementById('canvas-width');
    const canvasHeightInput = document.getElementById('canvas-height');
    const bgColorInput = document.getElementById('bg-color');
    const bgImageUpload = document.getElementById('bg-image-upload');
    const bgImageFilenameSpan = document.getElementById('bg-image-filename');
    const clearBgImageBtn = document.getElementById('clear-bg-image');
    const textInput = document.getElementById('text-input');
    const addTextBtn = document.getElementById('add-text-btn');
    // Text Properties Elements
    const textPropertiesDiv = document.getElementById('text-properties');
    const editTextContentInput = document.getElementById('edit-text-content');
    const fontFamilySelect = document.getElementById('font-family');
    const fontSizeInput = document.getElementById('font-size');
    const fontColorInput = document.getElementById('font-color');
    const deleteTextBtn = document.getElementById('delete-text-btn');
    // Stroke Elements
    const enableStrokeCheckbox = document.getElementById('enable-stroke');
    const strokeDetailsDiv = document.getElementById('stroke-details');
    const strokeWidthInput = document.getElementById('stroke-width');
    const strokeColorInput = document.getElementById('stroke-color');
    // Shadow Elements
    const enableShadowCheckbox = document.getElementById('enable-shadow');
    const shadowDetailsDiv = document.getElementById('shadow-details');
    const shadowColorInput = document.getElementById('shadow-color');
    const shadowBlurInput = document.getElementById('shadow-blur');
    const shadowOffsetXInput = document.getElementById('shadow-offset-x');
    const shadowOffsetYInput = document.getElementById('shadow-offset-y');
    // Export & Aspect Ratio Buttons
    const exportBtns = document.querySelectorAll('.export-btn');
    const aspectRatioBtns = document.querySelectorAll('.aspect-ratio-btn');

    // --- State Variables ---
    let canvasWidth = parseInt(canvasWidthInput.value, 10) || 750;
    let canvasHeight = parseInt(canvasHeightInput.value, 10) || 1000;
    let bgColor = bgColorInput.value;
    let bgImage = null; // Store the Image object for background
    // Updated text element structure
    let textElements = []; // { text, x, y, font, size, color, width, height, hasStroke, strokeWidth, strokeColor, hasShadow, shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY }
    let selectedTextIndex = -1; // Index of the selected text element
    let isDragging = false; // Flag for active dragging state
    let dragStartX, dragStartY; // Initial position of drag start
    let textOffsetX, textOffsetY; // Offset from text top-left corner to mouse/touch point
    // Store event listener references for proper removal during drag
    let dragMoveListener = null;
    let dragEndListener = null;

    // --- Default Art Text Values ---
    const defaultArtText = {
        hasStroke: false,
        strokeWidth: 1,
        strokeColor: '#FFFFFF', // Default stroke color (e.g., white)
        hasShadow: false,
        shadowColor: '#000000', // Default shadow color (e.g., black)
        shadowBlur: 0,
        shadowOffsetX: 2, // Slight default offset if enabled
        shadowOffsetY: 2,
    };

    // --- Initialization & Drawing ---

    /**
     * Initializes or resizes the canvas element and redraws content.
     */
    function initializeCanvas() {
        console.log("Initializing/Resizing Canvas..."); // Keep this log
        const previouslySelected = selectedTextIndex; // Preserve selection state

        // Set canvas element dimensions (clears canvas and resets context state)
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        // Update the container's CSS for visual scaling
        updateCanvasContainerStyle();

        // Redraw all elements onto the newly sized canvas
        redrawCanvas();

        // Restore selection if an element was selected before resizing
        if (previouslySelected !== -1 && previouslySelected < textElements.length) {
            selectText(previouslySelected, false); // Reselect without showing properties again
        } else {
             deselectText(false); // Ensure no selection state if nothing was selected
        }
        console.log(`Canvas initialized/resized to ${canvasWidth}x${canvasHeight}`);
    }

    /**
     * Updates the canvas container's aspect-ratio style for layout scaling.
     */
    function updateCanvasContainerStyle() {
        canvasContainer.style.aspectRatio = `${canvasWidth} / ${canvasHeight}`;
    }

    /**
     * Clears and redraws the entire canvas content (background, image, text with effects).
     */
    function redrawCanvas() {
        // Clear the canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw background color
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw background image if it exists and is loaded
        if (bgImage && bgImage.complete && bgImage.naturalWidth !== 0) {
            // Calculate drawing dimensions to cover canvas while maintaining aspect ratio
            const canvasAspect = canvas.width / canvas.height;
            const imgAspect = bgImage.naturalWidth / bgImage.naturalHeight;
            let drawWidth, drawHeight, drawX, drawY;

            if (imgAspect > canvasAspect) { // Image wider than canvas ratio
                drawHeight = canvas.height;
                drawWidth = bgImage.naturalWidth * (drawHeight / bgImage.naturalHeight);
                drawX = (canvas.width - drawWidth) / 2; // Center horizontally
                drawY = 0;
            } else { // Image taller than or equal to canvas ratio
                drawWidth = canvas.width;
                drawHeight = bgImage.naturalHeight * (drawWidth / bgImage.naturalWidth);
                drawX = 0;
                drawY = (canvas.height - drawHeight) / 2; // Center vertically
            }
             ctx.drawImage(bgImage, drawX, drawY, drawWidth, drawHeight);
        }

        // Draw text elements
        textElements.forEach((textEl, index) => {
            // --- Apply Shadow (if enabled) ---
            // Reset shadow from previous element FIRST
            ctx.shadowColor = 'transparent'; // Use transparent instead of null
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            if (textEl.hasShadow) {
                ctx.shadowColor = textEl.shadowColor;
                ctx.shadowBlur = textEl.shadowBlur;
                ctx.shadowOffsetX = textEl.shadowOffsetX;
                ctx.shadowOffsetY = textEl.shadowOffsetY;
            }

            // --- Set Font and Fill Color ---
            ctx.font = `${textEl.size}px ${textEl.font}`;
            ctx.fillStyle = textEl.color;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top'; // Use top baseline for consistent positioning

            // --- Draw Text Fill ---
            ctx.fillText(textEl.text, textEl.x, textEl.y);

            // --- Draw Text Stroke (if enabled) ---
            if (textEl.hasStroke && textEl.strokeWidth > 0) {
                ctx.strokeStyle = textEl.strokeColor;
                ctx.lineWidth = textEl.strokeWidth;
                ctx.strokeText(textEl.text, textEl.x, textEl.y);
            }

             // --- Reset Shadow AFTER drawing fill and stroke ---
             // Important to avoid shadow affecting selection box or other elements
             ctx.shadowColor = 'transparent';
             ctx.shadowBlur = 0;
             ctx.shadowOffsetX = 0;
             ctx.shadowOffsetY = 0;

            // --- Calculate Bounding Box (after drawing) ---
            // Measurement doesn't include stroke/shadow, so do it based on font/text only
            // Recalculate font in case shadow settings affected it (though unlikely)
            ctx.font = `${textEl.size}px ${textEl.font}`;
            const metrics = ctx.measureText(textEl.text);
            textEl.width = metrics.width;
            // Approximate height based on font size (more accurate methods are complex)
            textEl.height = textEl.size * 1.2;

            // --- Draw Selection Box (if selected) ---
            // Drawn WITHOUT shadow
            if (index === selectedTextIndex) {
                ctx.strokeStyle = 'rgba(0, 0, 255, 0.7)';
                ctx.lineWidth = 1; // Ensure line width is reset for selection box
                // Consider stroke width/shadow offsets for selection box? Maybe later.
                ctx.strokeRect(textEl.x - 2, textEl.y - 2, textEl.width + 4, textEl.height + 4); // Add padding
            }
        });
    }

    // --- Text Manipulation ---

    /**
     * Adds a new text element with default basic and art text properties.
     */
    function addText() {
        console.log("Adding Text..."); // Keep this log
        const text = textInput.value.trim();
        if (!text) return; // Do nothing if input is empty

        // Temporarily set font to measure width for centering
        const tempFont = `${parseInt(fontSizeInput.value, 10)}px ${fontFamilySelect.value}`;
        ctx.font = tempFont;
        const textWidth = ctx.measureText(text).width;

        // Create new text object, merging basic and default art properties
        const newText = {
            text: text,
            // Initial position roughly centered
            x: Math.max(10, (canvas.width - textWidth) / 2),
            y: Math.max(10, (canvas.height - parseInt(fontSizeInput.value, 10)) / 2),
            font: fontFamilySelect.value, // Use current font selection
            size: parseInt(fontSizeInput.value, 10), // Use current size
            color: fontColorInput.value, // Use current color
            width: 0, // Will be calculated on redraw
            height: 0, // Will be calculated on redraw
            ...defaultArtText // Spread default art text values
        };

        // Add to array and clear input
        textElements.push(newText);
        textInput.value = '';
        // Select the newly added text (this will also trigger redraw)
        selectText(textElements.length - 1);
    }

    /**
     * Updates the properties of the currently selected text element based on ALL controls (basic + art text).
     */
    function updateSelectedTextProperties() {
        // Ensure a valid text element is selected
        if (selectedTextIndex === -1 || selectedTextIndex >= textElements.length) return;

        const selectedText = textElements[selectedTextIndex];

        // Update basic properties
        selectedText.text = editTextContentInput.value;
        selectedText.font = fontFamilySelect.value;
        selectedText.size = parseInt(fontSizeInput.value, 10);
        selectedText.color = fontColorInput.value;

        // Update stroke properties
        selectedText.hasStroke = enableStrokeCheckbox.checked;
        selectedText.strokeWidth = parseFloat(strokeWidthInput.value) || 0;
        selectedText.strokeColor = strokeColorInput.value;

        // Update shadow properties
        selectedText.hasShadow = enableShadowCheckbox.checked;
        selectedText.shadowColor = shadowColorInput.value;
        selectedText.shadowBlur = parseInt(shadowBlurInput.value, 10) || 0;
        selectedText.shadowOffsetX = parseInt(shadowOffsetXInput.value, 10) || 0;
        selectedText.shadowOffsetY = parseInt(shadowOffsetYInput.value, 10) || 0;

        // console.log("Updating properties for index:", selectedTextIndex, selectedText); // Debug
        redrawCanvas(); // Redraw with updated properties
    }

    /**
     * Deletes the currently selected text element.
     */
    function deleteSelectedText() {
         // Ensure a valid text element is selected
         if (selectedTextIndex !== -1 && selectedTextIndex < textElements.length) {
            textElements.splice(selectedTextIndex, 1); // Remove from array
            deselectText(); // Deselect and redraw
        }
     }

    /**
     * Selects a text element by its index, updates ALL controls (basic + art text), and redraws.
     * @param {number} index - Index of the text element to select.
     * @param {boolean} [showProperties=true] - Whether to update and show the property controls.
     * @param {boolean} [shouldRedraw=true] - Whether to redraw the canvas.
     */
    function selectText(index, showProperties = true, shouldRedraw = true) {
         if (index >= 0 && index < textElements.length) {
            selectedTextIndex = index; // Update state
            const selectedText = textElements[index];

            // Update controls if requested
            if (showProperties) {
                // Update basic controls
                editTextContentInput.value = selectedText.text;
                fontFamilySelect.value = selectedText.font;
                fontSizeInput.value = selectedText.size;
                fontColorInput.value = selectedText.color;

                // Update stroke controls
                enableStrokeCheckbox.checked = selectedText.hasStroke;
                strokeWidthInput.value = selectedText.strokeWidth;
                strokeColorInput.value = selectedText.strokeColor;
                // Toggle stroke details visibility
                strokeDetailsDiv.classList.toggle('control-hidden', !selectedText.hasStroke);

                // Update shadow controls
                enableShadowCheckbox.checked = selectedText.hasShadow;
                shadowColorInput.value = selectedText.shadowColor;
                shadowBlurInput.value = selectedText.shadowBlur;
                shadowOffsetXInput.value = selectedText.shadowOffsetX;
                shadowOffsetYInput.value = selectedText.shadowOffsetY;
                // Toggle shadow details visibility
                shadowDetailsDiv.classList.toggle('control-hidden', !selectedText.hasShadow);

                // Show the entire properties section
                textPropertiesDiv.classList.remove('hidden'); // Show controls
            }
        } else {
             console.warn("selectText called with invalid index:", index);
             deselectText(false); // Deselect state without redrawing
             return;
        }
        // Redraw to show selection highlight if requested
        if (shouldRedraw) {
            redrawCanvas();
        }
     }

    /**
     * Deselects any currently selected text element, hides property controls, and redraws.
     * @param {boolean} [shouldRedraw=true] - Whether to redraw the canvas.
     */
    function deselectText(shouldRedraw = true) {
         selectedTextIndex = -1; // Reset state
        textPropertiesDiv.classList.add('hidden'); // Hide the whole section
        // Also hide details sections just in case
        strokeDetailsDiv.classList.add('control-hidden');
        shadowDetailsDiv.classList.add('control-hidden');
        if (shouldRedraw) {
            redrawCanvas();
        }
     }

    // --- Event Handlers (Non-Drag) ---

    /**
     * Handles changes from the width/height number input fields.
     */
    function handleSizeInputChange() {
        console.log("Handling Size Input Change..."); // Keep this log
        let newWidth = parseInt(canvasWidthInput.value, 10);
        let newHeight = parseInt(canvasHeightInput.value, 10);

        // Basic validation, revert to current value if invalid
        if (isNaN(newWidth) || newWidth <= 0) newWidth = canvasWidth;
        if (isNaN(newHeight) || newHeight <= 0) newHeight = canvasHeight;

        // Update state and input field values
        canvasWidth = newWidth;
        canvasHeight = newHeight;
        canvasWidthInput.value = canvasWidth;
        canvasHeightInput.value = canvasHeight;

        clearActiveAspectRatio(); // Manual input overrides aspect ratio buttons
        initializeCanvas(); // Trigger canvas resize and redraw
    }
    // Attach listeners to number inputs
    canvasWidthInput.addEventListener('change', handleSizeInputChange);
    canvasHeightInput.addEventListener('change', handleSizeInputChange);

    // Attach listeners to aspect ratio buttons
    aspectRatioBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            console.log(`Aspect ratio button ${btn.id} clicked`); // Keep this log
            let baseWidth = parseInt(canvasWidthInput.value, 10);
            if (isNaN(baseWidth) || baseWidth <= 0) baseWidth = 750; // Use default if input is bad

            // Calculate new height based on selected ratio and current width
            const ratio = btn.id.split('-').slice(1).join(':').split(':');
            const aspect = parseInt(ratio[0], 10) / parseInt(ratio[1], 10);
            canvasWidth = baseWidth;
            canvasHeight = Math.round(baseWidth / aspect);

            // Update input fields
            canvasWidthInput.value = canvasWidth;
            canvasHeightInput.value = canvasHeight;

            // Update button styles
            aspectRatioBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Trigger canvas resize and redraw
            initializeCanvas();
        });
    });

    /**
     * Removes the 'active' class from all aspect ratio buttons.
     */
    function clearActiveAspectRatio() {
         aspectRatioBtns.forEach(b => b.classList.remove('active'));
    }

    // Handle background color changes
    bgColorInput.addEventListener('input', () => {
        bgColor = bgColorInput.value;
        redrawCanvas(); // Only need to redraw, not reinitialize
    });

    // Handle background image uploads
    bgImageUpload.addEventListener('change', (event) => {
        const file = event.target.files[0];
        console.log('File selected:', file ? file.name : 'None');
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                console.log('FileReader loaded.');
                // Create a new Image object for the background
                bgImage = new Image();
                bgImage.onload = () => {
                    console.log('Background image loaded successfully.');
                    bgImageFilenameSpan.textContent = file.name; // Show filename
                    clearBgImageBtn.disabled = false; // Enable clear button
                    redrawCanvas(); // Redraw with the new background image
                };
                bgImage.onerror = (error) => {
                    console.error("Error loading background image:", error);
                    alert("无法加载背景图片，请检查文件是否有效。(Error loading background image. Please check if the file is valid.)");
                    bgImage = null; // Reset image object
                    bgImageFilenameSpan.textContent = '';
                    clearBgImageBtn.disabled = true;
                    redrawCanvas(); // Redraw without the failed image
                }
                // Set the src AFTER defining onload/onerror
                bgImage.src = e.target.result;
                // Reset the file input value to allow uploading the same file again
                bgImageUpload.value = '';
            }
             reader.onerror = (error) => {
                console.error("FileReader error:", error);
                alert("读取文件时出错。(Error reading file.)");
                bgImageUpload.value = '';
                bgImageFilenameSpan.textContent = '';
                 clearBgImageBtn.disabled = true;
            };
            // Read the file as a Data URL
            reader.readAsDataURL(file);
        } else {
             // Handle case where user cancels file selection
             bgImageUpload.value = '';
             // Don't clear filename if an image might already be loaded
             // bgImageFilenameSpan.textContent = '';
        }
    });

    // Handle clearing the background image
    clearBgImageBtn.addEventListener('click', () => {
        console.log("Clearing background image..."); // Keep this log
        bgImage = null; // Remove image object
        bgImageUpload.value = ''; // Clear file input
        bgImageFilenameSpan.textContent = ''; // Clear filename display
        clearBgImageBtn.disabled = true; // Disable button
        redrawCanvas(); // Redraw without background image
    });

    // Attach listener to Add Text button
    addTextBtn.addEventListener('click', addText);

    // --- Setup Listeners for Art Text Controls ---

    // Basic Properties (already set up)
    editTextContentInput.addEventListener('input', updateSelectedTextProperties);
    fontFamilySelect.addEventListener('change', updateSelectedTextProperties);
    fontSizeInput.addEventListener('change', updateSelectedTextProperties);
    fontColorInput.addEventListener('input', updateSelectedTextProperties);
    deleteTextBtn.addEventListener('click', deleteSelectedText);

    // Stroke Controls
    enableStrokeCheckbox.addEventListener('change', () => {
        strokeDetailsDiv.classList.toggle('control-hidden', !enableStrokeCheckbox.checked);
        updateSelectedTextProperties(); // Update state and redraw
    });
    strokeWidthInput.addEventListener('input', updateSelectedTextProperties);
    strokeColorInput.addEventListener('input', updateSelectedTextProperties);

    // Shadow Controls
    enableShadowCheckbox.addEventListener('change', () => {
        shadowDetailsDiv.classList.toggle('control-hidden', !enableShadowCheckbox.checked);
        updateSelectedTextProperties(); // Update state and redraw
    });
    shadowColorInput.addEventListener('input', updateSelectedTextProperties);
    shadowBlurInput.addEventListener('input', updateSelectedTextProperties);
    shadowOffsetXInput.addEventListener('input', updateSelectedTextProperties);
    shadowOffsetYInput.addEventListener('input', updateSelectedTextProperties);


    // --- Canvas Interaction (Unified Mouse & Touch Dragging) ---

    /**
     * Calculates the event position relative to the canvas, accounting for scaling.
     * @param {Event} evt - The mouse or touch event.
     * @returns {{x: number, y: number} | null} - The coordinates relative to the canvas, or null if invalid.
     */
    function getEventPos(canvas, evt) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        let clientX, clientY;

        // Get coordinates from touch or mouse event
        if (evt.touches && evt.touches.length > 0) {
            clientX = evt.touches[0].clientX;
            clientY = evt.touches[0].clientY;
        } else if (evt.changedTouches && evt.changedTouches.length > 0) {
             // Use changedTouches for touchend events
             clientX = evt.changedTouches[0].clientX;
             clientY = evt.changedTouches[0].clientY;
        } else if (evt.clientX !== undefined && evt.clientY !== undefined) {
            clientX = evt.clientX;
            clientY = evt.clientY;
        } else {
             console.warn("Could not get valid client coordinates from event:", evt);
             return null; // Return null if coordinates are unavailable
        }

        // Calculate position relative to the canvas
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    /**
     * Checks if a point (x, y) is within the bounding box of a text element.
     * @param {number} x - The x-coordinate.
     * @param {number} y - The y-coordinate.
     * @param {object} textEl - The text element object.
     * @returns {boolean} - True if the point is inside the text element's box.
     */
    function isPointInText(x, y, textEl) {
        // Use the calculated width/height for hit detection
        return x >= textEl.x && x <= textEl.x + textEl.width &&
               y >= textEl.y && y <= textEl.y + textEl.height;
    }

    /**
     * Handles the start of a drag operation (mousedown or touchstart on canvas).
     * @param {Event} event - The mousedown or touchstart event.
     */
    function handleDragStart(event) {
        const startPos = getEventPos(canvas, event);
        if (!startPos) return; // Exit if we couldn't get coordinates

        isDragging = false; // Reset dragging flag

        // Check if the event occurred on an existing text element (iterate backwards for top-most)
        let clickedTextIndex = -1;
        for (let i = textElements.length - 1; i >= 0; i--) {
            if (isPointInText(startPos.x, startPos.y, textElements[i])) {
                clickedTextIndex = i;
                break;
            }
        }

        // If a text element was clicked/touched
        if (clickedTextIndex !== -1) {
            console.log("Drag Start on text index:", clickedTextIndex); // Keep this log
            // Prevent default actions like text selection or page scroll *if* dragging starts on text
             if (event.cancelable) event.preventDefault();

            // Select the text element (defer redraw)
            selectText(clickedTextIndex, true, false);

            // Set dragging state and calculate offset
            isDragging = true;
            dragStartX = startPos.x;
            dragStartY = startPos.y;
            // Ensure selectedTextIndex is valid before accessing element
            if (selectedTextIndex !== -1 && selectedTextIndex < textElements.length) {
                 textOffsetX = startPos.x - textElements[selectedTextIndex].x;
                 textOffsetY = startPos.y - textElements[selectedTextIndex].y;
                 canvas.style.cursor = 'move'; // Set cursor for visual feedback

                 // Attach move/end listeners globally to track movement anywhere
                 attachDragListeners();

                 // Redraw now to show the selection highlight
                 redrawCanvas();
            } else {
                 // Should not happen if selectText worked, but safety check
                 console.error("DragStart Error: selectedTextIndex invalid after selection.");
                 isDragging = false; // Abort drag if state is inconsistent
            }
        } else {
            // Clicked/touched on the background, deselect any selected text
            deselectText(); // This will redraw
            canvas.style.cursor = 'default';
        }
    }

    /**
     * Handles the drag movement (mousemove or touchmove).
     * @param {Event} event - The mousemove or touchmove event.
     */
    function handleDragMove(event) {
        // Only proceed if dragging is active and a valid text element is selected
        if (!isDragging || selectedTextIndex === -1 || selectedTextIndex >= textElements.length) {
             return;
         }

        // Prevent default scroll/zoom during text drag on touch devices
        if (event.cancelable) {
             event.preventDefault();
        }

        // Get current pointer position
        const movePos = getEventPos(canvas, event);
         if (!movePos) return; // Exit if coordinates are invalid

        // Update the selected text element's position based on drag offset
        const selectedText = textElements[selectedTextIndex];
        selectedText.x = movePos.x - textOffsetX;
        selectedText.y = movePos.y - textOffsetY;

        // Redraw the canvas to show the updated position
        redrawCanvas();
    }

    /**
     * Handles the end of a drag operation (mouseup, touchend, touchcancel).
     * @param {Event} event - The mouseup, touchend, or touchcancel event.
     */
    function handleDragEnd(event) {
        // Only proceed if dragging was active
        if (!isDragging) {
            return;
        }
        console.log("Drag End"); // Keep this log

        isDragging = false; // Reset dragging flag FIRST
        detachDragListeners(); // THEN remove global listeners
        canvas.style.cursor = 'default'; // Reset cursor

        // Optional: Redraw one last time to ensure clean state, though last move usually suffices
        redrawCanvas();
    }

    // Define listener functions references for correct removal
    const dragMoveHandler = (event) => handleDragMove(event);
    const dragEndHandler = (event) => handleDragEnd(event);

    /**
     * Attaches global event listeners to the document for tracking drag movements and end events.
     */
    function attachDragListeners() {
        console.log("Attaching global drag listeners..."); // Keep this log
        // Ensure no old listeners are lingering (safety check)
        detachDragListeners();

        // Store references to the handlers being attached
        dragMoveListener = dragMoveHandler;
        dragEndListener = dragEndHandler;

        // Attach listeners to the document
        // Use passive: false for move listeners to allow preventDefault()
        document.addEventListener('mousemove', dragMoveListener, { passive: false });
        document.addEventListener('touchmove', dragMoveListener, { passive: false });
        document.addEventListener('mouseup', dragEndListener);
        document.addEventListener('touchend', dragEndListener);
        document.addEventListener('touchcancel', dragEndListener); // Handle interruptions
    }

    /**
     * Removes the global event listeners attached during a drag operation.
     */
    function detachDragListeners() {
        // console.log("Detaching global drag listeners..."); // Can be noisy
        // Remove move listeners if they exist
        if (dragMoveListener) {
            document.removeEventListener('mousemove', dragMoveListener);
            document.removeEventListener('touchmove', dragMoveListener);
            dragMoveListener = null; // Clear reference
        }
        // Remove end listeners if they exist
         if (dragEndListener) {
             document.removeEventListener('mouseup', dragEndListener);
             document.removeEventListener('touchend', dragEndListener);
             document.removeEventListener('touchcancel', dragEndListener);
             dragEndListener = null; // Clear reference
         }
    }

    // Attach initial drag start listeners to the canvas element
    canvas.addEventListener('mousedown', handleDragStart);
    // Use passive: false for touchstart to allow preventDefault() if drag starts on text
    canvas.addEventListener('touchstart', handleDragStart, { passive: false });


    // --- Export ---

    // Attach listeners to export buttons
    exportBtns.forEach(button => {
        button.addEventListener('click', () => {
            console.log(`Exporting as ${button.dataset.format}...`); // Keep this log
            const originallySelected = selectedTextIndex; // Store selection state

            // Temporarily deselect text *state* for a clean export image (without selection box)
            if (selectedTextIndex !== -1) {
                 selectedTextIndex = -1;
            }

            // Redraw canvas one last time without the selection box
             redrawCanvas();

            const format = button.dataset.format; // 'png', 'jpeg', 'webp'
            const mimeType = `image/${format}`;
            const filename = `xiaohongshu-image.${format}`;
            let dataURL;

            try {
                 // Handle JPEG transparency: redraw on a temporary canvas with background color
                 if (format === 'jpeg') {
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = canvas.width;
                    tempCanvas.height = canvas.height;
                    const tempCtx = tempCanvas.getContext('2d');
                    // Fill with background color first
                    tempCtx.fillStyle = bgColor;
                    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                    // Draw existing canvas content (including potential bg image) on top
                    tempCtx.drawImage(canvas, 0, 0);
                    // Export from temporary canvas with quality setting
                    dataURL = tempCanvas.toDataURL(mimeType, 0.92); // Adjust quality 0.0 to 1.0
                } else {
                    // Export directly for formats supporting transparency (PNG, WebP)
                    dataURL = canvas.toDataURL(mimeType);
                }

                 // Trigger download using a temporary link
                 const link = document.createElement('a');
                 link.href = dataURL;
                 link.download = filename;
                 document.body.appendChild(link); // Append for Firefox compatibility
                 link.click(); // Simulate click
                 document.body.removeChild(link); // Clean up the link
                 console.log('Download triggered.');

            } catch (error) {
                 console.error(`Error during ${format} export:`, error);
                 alert(`导出 ${format.toUpperCase()} 图片时出错。(Error exporting ${format.toUpperCase()} image): ${error.message}`);
            }

            // Restore selection state AFTER export attempt
            if (originallySelected !== -1) {
                 // Reselect the text element (this will also redraw with selection box)
                 selectText(originallySelected, true);
            } else {
                 // If nothing was selected, ensure canvas is still in correct state
                 redrawCanvas();
            }
        });
    });

    // --- Initial Setup ---
    initializeCanvas(); // Initial setup of canvas size and drawing
    console.log('Xiaohongshu Image Tool Initialized (with Art Text).');

}); // End DOMContentLoaded