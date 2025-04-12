// Wait for the DOM to be fully loaded before running the script
document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Element References ---
    const editor = document.getElementById('editor');
    const preview = document.getElementById('preview');
    const docTitle = document.getElementById('doc-title');
    const saveBtn = document.getElementById('save-doc');
    const newBtn = document.getElementById('new-doc');
    const documentList = document.getElementById('document-list')?.querySelector('.py-1[role="none"]'); // Target inner div for appending links
    const aiContinueBtn = document.getElementById('ai-continue');
    const aiPolishBtn = document.getElementById('ai-polish');
    const imgToBase64Btn = document.getElementById('img-to-base64');
    const imageModalElement = document.getElementById('imageModal'); // Reference to the modal container
    const imageUrlInput = document.getElementById('image-url');
    const convertImageBtn = document.getElementById('convert-image');
    const modalCloseButtons = document.querySelectorAll('.modal-close-button'); // Get all modal close buttons

    // Menu DOM elements
    const toggleFoldBtn = document.getElementById('toggle-fold');
    const toggleModeBtn = document.getElementById('toggle-mode');
    const copyMarkdownBtn = document.getElementById('copy-markdown');
    const copyHtmlBtn = document.getElementById('copy-html');
    const themeListItems = document.querySelectorAll('#theme-list a[data-theme]'); // More specific selector
    const highlightThemeLink = document.getElementById('highlight-theme'); // Link tag for highlight.js theme

    // --- State Variables ---
    let currentDocId = null;
    let saveTimeout = null; // Timeout ID for auto-save debounce
    let lastSavedContent = ''; // Track content to prevent unnecessary saves
    let isFolded = false; // State for folding UI elements (requires CSS)
    let isImmersiveMode = false; // State for immersive mode (requires CSS)
    let currentTheme = 'github'; // Default theme
    let editorHasFocus = false; // Track editor focus for scrolling logic

    // --- Initialization ---
    init();

    /**
     * Initializes the application:
     * - Sets up event listeners for buttons and inputs.
     * - Loads the initial document list.
     * - Creates a new (or sample) document.
     * - Enables custom editor scrolling.
     * - Sets initial editor focus.
     */
    function init() {
        // --- Event Listeners ---
        if (editor) editor.addEventListener('input', handleEditorInput);
        if (saveBtn) saveBtn.addEventListener('click', handleSaveClick);
        if (newBtn) newBtn.addEventListener('click', handleNewClick);
        if (aiContinueBtn) aiContinueBtn.addEventListener('click', handleAiContinueClick);
        if (aiPolishBtn) aiPolishBtn.addEventListener('click', handleAiPolishClick);
        if (imgToBase64Btn) imgToBase64Btn.addEventListener('click', handleImgToBase64Click);
        if (convertImageBtn) convertImageBtn.addEventListener('click', handleConvertImageClick);
        if (toggleFoldBtn) toggleFoldBtn.addEventListener('click', toggleFold);
        if (toggleModeBtn) toggleModeBtn.addEventListener('click', toggleEditMode);
        if (copyMarkdownBtn) copyMarkdownBtn.addEventListener('click', copyMarkdownSource);
        if (copyHtmlBtn) copyHtmlBtn.addEventListener('click', copyHtmlContent);

        // Theme selector event listeners
        themeListItems.forEach(item => {
            item.addEventListener('click', handleThemeChange);
        });

        // Modal close button listeners
        modalCloseButtons.forEach(button => {
            button.addEventListener('click', handleModalClose);
        });

        // Dropdown functionality (Currently relies on Tailwind group-hover in HTML)
        // Remove Bootstrap-specific submenu JS as it's incompatible.
        // For click-to-toggle dropdowns, custom JS targeting the Tailwind structure would be needed here.
        console.log("Dropdowns rely on hover via Tailwind CSS. Implement custom JS for click-to-toggle if needed.");

        // --- Initial Setup ---
        createNewDocument(); // Load sample or blank document
        loadDocumentList(); // Fetch existing documents
        enableEditorScrolling(); // Setup custom scroll behavior
        if (editor) editor.focus(); // Set initial focus to the editor

        // Apply initial theme (ensure body class matches default)
        changeTheme(currentTheme, true); // Pass true to skip removing class on init
    }

    // --- Core Editor and Rendering ---

    /**
     * Handles input events in the editor textarea.
     * Renders the Markdown preview and triggers auto-save.
     */
    function handleEditorInput() {
        renderMarkdown(editor.value);
        autoSave();
    }

    /**
     * Configures marked.js library options for parsing Markdown.
     * Enables GitHub Flavored Markdown (GFM), breaks, and syntax highlighting.
     */
    marked.setOptions({
        highlight: function(code, lang) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        },
        breaks: true, // Convert single line breaks to <br>
        gfm: true,    // Enable GitHub Flavored Markdown (tables, strikethrough, etc.)
    });

    /**
     * Protects LaTeX blocks ($$...$$ and $...$) from being processed by marked.js
     * by replacing them with placeholders.
     * @param {string} text - The raw Markdown text.
     * @returns {{text: string, blocks: Array<object>}} - Text with placeholders and the list of replaced blocks.
     */
    function protectLatex(text) {
        let blocks = [];
        let index = 0;
        // Replace display math $$...$$
        text = text.replace(/\$\$([\s\S]*?)\$\$/g, (match) => {
            const placeholder = `%%LATEX_BLOCK_${index}%%`;
            blocks.push({ placeholder, content: match });
            index++;
            return placeholder;
        });
        // Replace inline math $...$ (avoiding single $ signs)
        text = text.replace(/(^|\s|\()\$([^\$\n]+?)\$($|\s|\.|\,|\?|\!|\))/g, (match, pre, content, post) => {
             const placeholder = `%%LATEX_INLINE_${index}%%`;
             // Reconstruct the original match including surrounding chars/spaces if needed
             const originalContent = `$${content}$`;
             blocks.push({ placeholder, content: originalContent });
             index++;
             // Return placeholder wrapped by the original surrounding characters/space
             return `${pre}${placeholder}${post}`;
        });
        return { text, blocks };
    }

    /**
     * Restores the original LaTeX content into the HTML after Markdown parsing.
     * @param {string} html - The HTML output from marked.js.
     * @param {Array<object>} blocks - The list of replaced LaTeX blocks.
     * @returns {string} - HTML with LaTeX content restored.
     */
    function restoreLatex(html, blocks) {
        blocks.forEach(block => {
            // Use a function in replace to handle potential special characters in placeholder
            html = html.replace(block.placeholder, () => block.content);
        });
        return html;
    }

    /**
     * Renders the Markdown text to HTML, including Table of Contents,
     * syntax highlighting, and LaTeX rendering.
     * @param {string} markdownText - The Markdown content to render.
     */
    function renderMarkdown(markdownText) {
        if (!preview) return; // Exit if preview element doesn't exist

        // --- Table of Contents (TOC) Generation ---
        const tocRegex = /\[TOC\]/gi; // Case-insensitive TOC tag
        let tocHtml = '';
        if (tocRegex.test(markdownText)) {
            const headings = [];
            // Regex to find headings (level 1-6)
            const headingRegex = /^(#{1,6})\s+(.+)$/gm;
            let tempText = markdownText; // Work on a copy for regex exec
            let match;

            while ((match = headingRegex.exec(tempText)) !== null) {
                const level = match[1].length;
                const text = match[2].trim();
                // Generate a simple slug for linking
                const slug = text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
                headings.push({ level, text, slug });
            }

            // Build the TOC HTML list structure
            if (headings.length > 0) {
                tocHtml = '<div class="toc p-4 mb-4 bg-gray-50 rounded border">\n<p class="font-semibold mb-2">Table of Contents</p>\n<ul class="list-none pl-0">\n';
                let currentLevel = 0;
                headings.forEach(heading => {
                    if (heading.level > currentLevel) {
                        tocHtml += '<ul class="list-none pl-4">\n'.repeat(heading.level - currentLevel);
                    } else if (heading.level < currentLevel) {
                        tocHtml += '</ul>\n'.repeat(currentLevel - heading.level);
                    }
                    tocHtml += `<li class="py-0.5"><a href="#${heading.slug}" class="text-blue-600 hover:underline">${heading.text}</a></li>\n`;
                    currentLevel = heading.level;
                });
                tocHtml += '</ul>\n'.repeat(currentLevel); // Close remaining levels
                tocHtml += '</div>\n';
            }
            // Replace [TOC] tag(s) with generated HTML
             markdownText = markdownText.replace(tocRegex, tocHtml);
        }

        // --- Markdown Parsing with LaTeX Protection ---
        const { text: protectedText, blocks } = protectLatex(markdownText);
        let html = marked.parse(protectedText);
        html = restoreLatex(html, blocks);

        preview.innerHTML = html; // Update the preview pane

        // --- KaTeX Rendering ---
        try {
            renderMathInElement(preview, {
                delimiters: [
                    { left: '$$', right: '$$', display: true },
                    { left: '$', right: '$', display: false },
                    { left: '\\(', right: '\\)', display: false },
                    { left: '\\[', right: '\\]', display: true }
                ],
                throwOnError: false, // Don't stop rendering on error
                output: 'html',      // Output HTML (not MathML)
                trust: true,         // Allow certain commands like \htmlClass
                strict: false        // Less strict parsing
            });
        } catch (error) {
            console.error('Error rendering LaTeX with KaTeX:', error);
        }

        // --- Add IDs to Headings for TOC Links ---
        const headingElements = preview.querySelectorAll('h1, h2, h3, h4, h5, h6');
        headingElements.forEach(heading => {
            if (!heading.id) { // Only add ID if one doesn't exist
                 const slug = (heading.textContent || '').trim().toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/\s+/g, '-');
                 if (slug) heading.id = slug;
            }
        });

        // --- Apply Syntax Highlighting ---
        // Note: Marked.js's highlight option handles this during parse
        // If manual highlighting is needed after KaTeX:
        // preview.querySelectorAll('pre code').forEach((block) => {
        //     hljs.highlightElement(block);
        // });
    }

    // --- Auto-completion ---
    /**
     * Handles keydown events in the editor for auto-completion
     * of code blocks (```) and LaTeX display math ($$).
     * @param {KeyboardEvent} e - The keydown event.
     */
    editor.addEventListener('keydown', (e) => {
        const cursorPos = editor.selectionStart;
        const textBeforeCursor = editor.value.substring(0, cursorPos);
        const textAfterCursor = editor.value.substring(cursorPos);

        // Auto-complete code blocks (```)
        if (e.key === '`' && textBeforeCursor.endsWith('``')) {
            // Check if not already inside a code block
            const codeBlocksBefore = (textBeforeCursor.match(/```/g) || []).length;
            if (codeBlocksBefore % 2 === 0) { // If count is even, we are outside
                e.preventDefault();
                const updatedText = textBeforeCursor + '`\n\n```' + textAfterCursor;
                editor.value = updatedText;
                editor.selectionStart = editor.selectionEnd = cursorPos + 2; // Place cursor inside
                renderMarkdown(editor.value); // Update preview
            }
        }

        // Auto-complete LaTeX blocks ($$)
        if (e.key === '$' && textBeforeCursor.endsWith('$')) {
             // Check if not already inside a $$ block
            const latexBlocksBefore = (textBeforeCursor.match(/\$\$/g) || []).length;
             if (latexBlocksBefore % 2 === 0) {
                e.preventDefault();
                const updatedText = textBeforeCursor + '$\n\n$$' + textAfterCursor;
                editor.value = updatedText;
                editor.selectionStart = editor.selectionEnd = cursorPos + 2; // Place cursor inside
                renderMarkdown(editor.value); // Update preview
            }
        }
    });

    // --- Document Management ---

    /**
     * Triggers the auto-save mechanism with debouncing.
     */
    function autoSave() {
        if (saveTimeout) {
            clearTimeout(saveTimeout); // Clear previous timeout
        }

        // Only save if content has actually changed
        if (!editor || editor.value === lastSavedContent) {
            return;
        }

        // Indicate saving visually (requires CSS for .saving class)
        if (saveBtn) {
            saveBtn.classList.remove('saved'); // Remove saved state if present
            saveBtn.classList.add('saving');
            saveBtn.textContent = 'Saving...';
        }

        // Debounce save operation
        saveTimeout = setTimeout(() => {
            saveDocument().then(success => {
                if (success && saveBtn) {
                    saveBtn.classList.remove('saving');
                    saveBtn.classList.add('saved'); // Indicate saved state (requires CSS)
                    saveBtn.textContent = 'Saved';

                    // Reset button text after a short delay
                    setTimeout(() => {
                        if (saveBtn) {
                             saveBtn.classList.remove('saved');
                             saveBtn.textContent = 'Save';
                        }
                    }, 2000);
                } else if (saveBtn) {
                    // If save failed, revert button text
                    saveBtn.classList.remove('saving');
                    saveBtn.textContent = 'Save';
                    // Optionally show an error indicator
                }
            });
        }, 1500); // Wait 1.5 seconds after last input before saving
    }

    /**
     * Saves the current document (title and content) to the server.
     * @returns {Promise<boolean>} - True if save was successful, false otherwise.
     */
    async function saveDocument() {
        if (!editor || !docTitle) return false;

        try {
            const response = await fetch('/markdown/api/save', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: currentDocId, // Send null for new documents
                    title: docTitle.value || 'Untitled Document',
                    content: editor.value
                })
            });

            if (!response.ok) {
                 // Try to get error message from response
                 let errorMsg = `Save failed with status: ${response.status}`;
                 try {
                     const errorData = await response.json();
                     errorMsg = errorData.error || errorMsg;
                 } catch(e) { /* Ignore if response not JSON */ }
                 throw new Error(errorMsg);
            }

            const data = await response.json();

            if (data.success) {
                const wasNewDocument = !currentDocId;
                currentDocId = data.id; // Update with ID from backend (important for new docs)
                lastSavedContent = editor.value; // Update last saved state
                docTitle.value = data.title; // Update title in case backend modified it

                // If it was a new document, refresh the list to include it
                if (wasNewDocument) {
                    loadDocumentList();
                }
                console.log("Document saved successfully. ID:", currentDocId);
                return true;
            } else {
                 showError(data.error || 'Failed to save document.');
                 return false;
            }
        } catch (error) {
            console.error('Error saving document:', error);
            showError('Error saving document: ' + error.message);
            return false;
        }
    }

    /**
     * Loads the list of saved documents from the server and populates the dropdown.
     */
    async function loadDocumentList() {
        if (!documentList) return; // Exit if dropdown list element doesn't exist

        try {
            const response = await fetch('/markdown/api/documents');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const documents = await response.json();

            documentList.innerHTML = ''; // Clear existing list items

            if (!documents || documents.length === 0) {
                documentList.innerHTML = '<span class="block px-4 py-2 text-sm text-gray-500">No documents found</span>';
                return;
            }

            // Populate dropdown with document links (using Tailwind classes)
            documents.forEach(doc => {
                const link = document.createElement('a');
                link.href = '#';
                link.className = 'block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900'; // Tailwind classes
                link.textContent = doc.title || 'Untitled';
                link.dataset.docId = doc.id; // Store ID for loading
                link.setAttribute('role', 'menuitem');

                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    loadDocument(doc.id);
                    // Optional: Close dropdown after selection (needs JS for dropdowns)
                });

                documentList.appendChild(link); // Append the link directly
            });
        } catch (error) {
            console.error('Error loading document list:', error);
            if (documentList) documentList.innerHTML = '<span class="block px-4 py-2 text-sm text-red-600">Error loading documents</span>';
        }
    }

    /**
     * Loads the content of a specific document by its ID.
     * @param {string} id - The ID of the document to load.
     */
    async function loadDocument(id) {
        if (!id || !editor || !docTitle) return;

        console.log(`Loading document with ID: ${id}`);
        showLoading(); // Show loading indicator while fetching

        try {
            const response = await fetch(`/markdown/api/document/${id}`);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const doc = await response.json();

            if (doc) {
                currentDocId = doc.id;
                docTitle.value = doc.title;
                editor.value = doc.content;
                lastSavedContent = doc.content; // Update last saved state
                renderMarkdown(doc.content); // Render the loaded content
                console.log("Document loaded:", doc.title);
            } else {
                 throw new Error("Document not found or invalid response.");
            }
        } catch (error) {
            console.error('Error loading document:', error);
            showError('Error loading document: ' + error.message);
            // Optionally reset to a new document state on load failure
            // createNewDocument();
        } finally {
             hideLoading();
        }
    }

    /**
     * Resets the editor to a new, empty state or loads sample content.
     */
    function createNewDocument() {
        if (!editor || !docTitle || !preview) return;

        // Check if current content is unsaved before resetting
        if (currentDocId && editor.value !== lastSavedContent) {
            if (!confirm("You have unsaved changes. Are you sure you want to create a new document?")) {
                return; // Abort if user cancels
            }
        }

        currentDocId = null; // Reset document ID
        lastSavedContent = ''; // Reset saved state

        // Load sample content only if window.sampleContent exists and editor is initially empty
        if (window.sampleContent && editor.value === '') {
            editor.value = window.sampleContent;
            docTitle.value = 'Markdown示例文档';
            lastSavedContent = editor.value; // Treat sample as "saved" initially
        } else {
            // Otherwise, start fresh
            editor.value = '';
            docTitle.value = 'Untitled Document';
        }

        renderMarkdown(editor.value); // Render initial content (blank or sample)
        console.log("New document created.");
    }

    // --- Image to Base64 ---

    /**
     * Handles the click event for the "Image to Base64" button.
     * Shows the image URL input modal.
     * @param {Event} e - The click event.
     */
    function handleImgToBase64Click(e) {
        e.preventDefault();
        if (imageUrlInput) imageUrlInput.value = ''; // Clear previous URL
        showImageModal();
    }

    /**
     * Handles the click event for the "Convert" button in the image modal.
     * Takes the URL, calls the conversion API, and inserts the result.
     */
    async function handleConvertImageClick() {
        if (!imageUrlInput || !editor) return;
        const url = imageUrlInput.value.trim();

        if (url) {
            showLoading(); // Show loading while converting
            try {
                const success = await convertImageToBase64(url);
                if (success) {
                    hideImageModal(); // Close modal on success
                } else {
                    // Error shown within convertImageToBase64
                }
            } catch (error) {
                 // Error handling done within convertImageToBase64
            } finally {
                 hideLoading();
            }
        } else {
            showError('Please enter a valid image URL.'); // Show error in modal if possible, else alert
            alert('Please enter a valid image URL.');
        }
    }

    /**
     * Sends an image URL to the backend to get its Base64 representation.
     * Inserts the Base64 data URL into the editor as Markdown image syntax.
     * @param {string} url - The URL of the image to convert.
     * @returns {Promise<boolean>} - True if conversion and insertion were successful.
     */
    async function convertImageToBase64(url) {
        if (!editor) return false;
        try {
            const response = await fetch('/markdown/api/image-to-base64', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageUrl: url })
            });

             if (!response.ok) {
                 let errorMsg = `Image conversion failed: ${response.status}`;
                 try { const errorData = await response.json(); errorMsg = errorData.error || errorMsg; } catch(e) {}
                 throw new Error(errorMsg);
             }

            const data = await response.json();

            if (data.success && data.dataUrl) {
                const cursorPos = editor.selectionStart;
                const textBefore = editor.value.substring(0, cursorPos);
                const textAfter = editor.value.substring(cursorPos);

                const markdownImage = `![Image](${data.dataUrl})`; // Basic alt text
                editor.value = textBefore + markdownImage + textAfter;

                renderMarkdown(editor.value); // Update preview

                // Set cursor position after the inserted markdown
                editor.selectionStart = editor.selectionEnd = cursorPos + markdownImage.length;
                editor.focus(); // Bring focus back to editor
                return true;
            } else {
                showError(data.error || 'Failed to convert image.');
                return false;
            }
        } catch (error) {
            console.error('Error converting image:', error);
            showError('Error converting image: ' + error.message);
            return false;
        }
    }

    // --- AI Feature Placeholders ---

    /** Placeholder function for AI continuation feature. */
    async function requestAIContinuation() {
        const position = editor.selectionStart || editor.value.length;
        const content = editor.value.substring(0, position);
        console.log("Requesting AI continuation based on content up to cursor:", content);
        showError('AI continuation feature not implemented yet. This would connect to an AI API.');
        alert('AI continuation feature not implemented yet.');
    }

    /** Placeholder function for AI polish feature. */
    async function requestAIPolish() {
        let content = '';
        if (editor.selectionStart !== editor.selectionEnd) {
            content = editor.value.substring(editor.selectionStart, editor.selectionEnd);
        } else {
            content = editor.value;
        }
        if (!content) {
             showError("Please select text or write content to polish.");
             return;
        }
        console.log("Requesting AI polish for content:", content);
        showError('AI polish feature not implemented yet. This would connect to an AI API.');
        alert('AI polish feature not implemented yet.');
    }

    // --- UI Toggles and Actions ---

    /** Toggles a 'folded' class on the body (requires CSS). */
    function toggleFold() {
        isFolded = !isFolded;
        document.body.classList.toggle('folded', isFolded);
        console.log("Fold toggled:", isFolded);
        // Add CSS rules for `.folded` to hide/show elements as needed.
    }

    /** Toggles an 'immersive-mode' class on the body (requires CSS). */
    function toggleEditMode() {
        isImmersiveMode = !isImmersiveMode;
        document.body.classList.toggle('immersive-mode', isImmersiveMode);
        console.log("Immersive mode toggled:", isImmersiveMode);
        // Add CSS rules for `.immersive-mode` to hide/show elements (like preview pane).
        // Example: document.getElementById('preview-container')?.classList.toggle('hidden', isImmersiveMode);
    }

    /** Copies the raw Markdown source to the clipboard. */
    function copyMarkdownSource() {
        if (!editor) return;
        navigator.clipboard.writeText(editor.value)
            .then(() => showTemporaryFeedback(copyMarkdownBtn, 'Copied!'))
            .catch(err => {
                console.error('Failed to copy Markdown: ', err);
                showError("Failed to copy Markdown.");
            });
    }

    /** Copies the rendered HTML content from the preview pane to the clipboard. */
    function copyHtmlContent() {
        if (!preview) return;
        navigator.clipboard.writeText(preview.innerHTML)
            .then(() => showTemporaryFeedback(copyHtmlBtn, 'Copied!'))
            .catch(err => {
                console.error('Failed to copy HTML: ', err);
                showError("Failed to copy HTML.");
            });
    }

    /**
     * Changes the editor/preview theme.
     * Updates body class and highlight.js theme link.
     * @param {string} theme - The name of the theme (e.g., 'github', 'dark').
     * @param {boolean} [isInitial=false] - Flag to skip removing class on initial load.
     */
    function changeTheme(theme, isInitial = false) {
        if (!theme) return;

        // Update body class for general theme styling
        if (!isInitial) {
             document.body.classList.remove(`theme-${currentTheme}`);
        }
        currentTheme = theme;
        document.body.classList.add(`theme-${currentTheme}`);
        console.log("Theme changed to:", currentTheme);
        // Add CSS rules for `.theme-dark`, `.theme-solarized`, etc. to style the editor/preview.

        // Update highlight.js theme dynamically
        if (highlightThemeLink) {
            // Map theme name to highlight.js CSS file name (adjust paths/names as needed)
            let cssFile = 'github.min.css'; // Default
            if (theme === 'dark') cssFile = 'github-dark.min.css'; // Example dark theme
            else if (theme === 'solarized') cssFile = 'solarized-light.min.css'; // Example
            else if (theme === 'nord') cssFile = 'nord.min.css'; // Example
            // Add more mappings as needed

            highlightThemeLink.href = `https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.7.0/styles/${cssFile}`;
        }

        // Update active state in dropdown menu
        themeListItems.forEach(item => {
            item.classList.toggle('active', item.getAttribute('data-theme') === theme);
             // Maybe add font-bold or bg-gray-100 for active state in Tailwind
             item.classList.toggle('font-semibold', item.getAttribute('data-theme') === theme);
        });
    }

    // --- Event Handler Wrappers ---
    // These wrappers prevent default actions and call the main logic.

    function handleSaveClick(e) { e.preventDefault(); saveDocument(); }
    function handleNewClick(e) { e.preventDefault(); createNewDocument(); }
    function handleAiContinueClick(e) { e.preventDefault(); requestAIContinuation(); }
    function handleAiPolishClick(e) { e.preventDefault(); requestAIPolish(); }
    function handleThemeChange(e) {
        e.preventDefault();
        const theme = e.target.getAttribute('data-theme');
        if (theme) changeTheme(theme);
    }
    function handleModalClose(e) {
        const modalId = e.target.dataset.modalId;
        if (modalId) {
            const modalElement = document.getElementById(modalId);
            if (modalElement) {
                 modalElement.classList.add('hidden');
            }
        }
    }


    // --- Utility Functions ---

    /**
     * Shows temporary text feedback on a button.
     * @param {HTMLElement} buttonElement - The button to update.
     * @param {string} feedbackText - The temporary text (e.g., "Copied!").
     * @param {number} [duration=2000] - How long to show the feedback in ms.
     */
    function showTemporaryFeedback(buttonElement, feedbackText, duration = 2000) {
        if (!buttonElement) return;
        const originalText = buttonElement.textContent;
        buttonElement.textContent = feedbackText;
        setTimeout(() => {
            if (buttonElement.textContent === feedbackText) { // Avoid race condition if clicked again quickly
                 buttonElement.textContent = originalText;
            }
        }, duration);
    }

    /**
     * Enables custom scrolling behavior for the editor, especially when it doesn't have focus.
     */
    function enableEditorScrolling() {
        if (!editor) return;

        const editorContainer = document.getElementById('editor-container');

        // Custom wheel scroll when editor doesn't have focus
        editor.addEventListener('wheel', function(e) {
            if (!editorHasFocus) {
                e.preventDefault(); // Prevent page scroll only if editor isn't focused
                // Manually scroll the editor textarea
                editor.scrollTop += (e.deltaY > 0) ? 40 : -40; // Adjust scroll amount as needed
            }
        }, { passive: false }); // Need passive: false to preventDefault

        // Track focus state
        editor.addEventListener('focus', () => { editorHasFocus = true; });
        editor.addEventListener('blur', () => { editorHasFocus = false; });

        // Allow clicking in the container (outside textarea) to focus the editor
        if (editorContainer) {
            editorContainer.addEventListener('click', (e) => {
                // If click is directly on container or editor itself
                if (e.target === editorContainer || e.target === editor) {
                    editor.focus();
                }
            });
        }

        // Ensure keyboard navigation keys work as expected for scrolling
        editor.addEventListener('keydown', (e) => {
            if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].includes(e.key)) {
                // Allow default browser behavior for these keys, which handles scrolling
                editorHasFocus = true; // Assume focus for keyboard nav
            }
        });
    }

     /** Shows the Image URL modal */
     function showImageModal() {
        if (imageModalElement) {
            imageModalElement.classList.remove('hidden');
        }
     }

     /** Hides the Image URL modal */
     function hideImageModal() {
         if (imageModalElement) {
            imageModalElement.classList.add('hidden');
        }
     }

}); // End of DOMContentLoaded listener

