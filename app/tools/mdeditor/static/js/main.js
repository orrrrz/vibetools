document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const editor = document.getElementById('editor');
    const preview = document.getElementById('preview');
    const docTitle = document.getElementById('doc-title');
    const saveBtn = document.getElementById('save-doc');
    const newBtn = document.getElementById('new-doc');
    const documentList = document.getElementById('document-list');
    const aiContinueBtn = document.getElementById('ai-continue');
    const aiPolishBtn = document.getElementById('ai-polish');
    const imgToBase64Btn = document.getElementById('img-to-base64');
    const imageModal = new bootstrap.Modal(document.getElementById('imageModal'));
    const imageUrlInput = document.getElementById('image-url');
    const convertImageBtn = document.getElementById('convert-image');
    
    // Menu DOM elements
    const toggleFoldBtn = document.getElementById('toggle-fold');
    const toggleModeBtn = document.getElementById('toggle-mode');
    const copyMarkdownBtn = document.getElementById('copy-markdown');
    const copyHtmlBtn = document.getElementById('copy-html');
    const themeListItems = document.querySelectorAll('#theme-list .dropdown-item');
    
    // Initialize dropdown submenus
    document.querySelectorAll('.dropdown-submenu a.dropdown-toggle').forEach(element => {
        element.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            const parentDropdown = this.closest('.dropdown-menu');
            const submenu = this.nextElementSibling;
            
            // Close all other dropdowns
            document.querySelectorAll('.dropdown-menu').forEach(dropdown => {
                if (dropdown !== parentDropdown && dropdown !== submenu) {
                    dropdown.classList.remove('show');
                }
            });
            
            // Toggle this submenu
            submenu.classList.toggle('show');
        });
    });
    
    // Close submenus when clicking outside
    document.addEventListener('click', function(e) {
        document.querySelectorAll('.dropdown-submenu .dropdown-menu.show').forEach(dropdown => {
            dropdown.classList.remove('show');
        });
    });
    
    // State
    let currentDocId = null;
    let saveTimeout = null;
    let lastSavedContent = '';
    let isFolded = false;
    let isImmersiveMode = false;
    let currentTheme = 'github';
    let editorHasFocus = false;
    
    // 确保编辑器可以滚动，即使没有改变光标位置
    function enableEditorScrolling() {
        // 使编辑器可滚动，无论是否有焦点
        editor.addEventListener('wheel', function(e) {
            if (!editorHasFocus) {
                // 防止默认滚动行为
                e.preventDefault();
                
                // 手动控制滚动
                editor.scrollTop += (e.deltaY > 0) ? 40 : -40;
            }
        });
        
        // 监听编辑器获取焦点和失去焦点的事件
        editor.addEventListener('focus', function() {
            editorHasFocus = true;
        });
        
        editor.addEventListener('blur', function() {
            editorHasFocus = false;
        });
        
        // 为编辑器添加一个点击事件，以使其即使在点击没有文本的地方也能获得焦点
        document.getElementById('editor-container').addEventListener('click', function(e) {
            if (e.target === this || e.target === editor) {
                editor.focus();
            }
        });
        
        // 添加键盘导航支持
        editor.addEventListener('keydown', function(e) {
            // 处理方向键，确保滚动正常工作
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || 
                e.key === 'PageDown' || e.key === 'PageUp' ||
                e.key === 'Home' || e.key === 'End') {
                // 让浏览器默认行为处理滚动
                // 不需要额外处理
            }
        });
    }
    
    // Initialize marked.js for Markdown rendering
    marked.setOptions({
        highlight: function(code, lang) {
            if (lang && hljs.getLanguage(lang)) {
                return hljs.highlight(code, { language: lang }).value;
            }
            return hljs.highlightAuto(code).value;
        },
        breaks: true,
        gfm: true
    });
    
    // 保护LaTeX内容不被Markdown处理
    function protectLatex(text) {
        // 暂时替换掉LaTeX区域以避免Markdown处理它们
        let blocks = [];
        let index = 0;
        
        // 替换行间公式: $$...$$
        text = text.replace(/\$\$([\s\S]*?)\$\$/g, function(match) {
            const placeholder = `%%LATEX_BLOCK_${index}%%`;
            blocks.push({ placeholder, content: match });
            index++;
            return placeholder;
        });
        
        // 替换行内公式: $...$
        text = text.replace(/\$([^\$\n]+?)\$/g, function(match) {
            const placeholder = `%%LATEX_INLINE_${index}%%`;
            blocks.push({ placeholder, content: match });
            index++;
            return placeholder;
        });
        
        return { text, blocks };
    }
    
    // 还原LaTeX内容
    function restoreLatex(html, blocks) {
        blocks.forEach(block => {
            html = html.replace(block.placeholder, block.content);
        });
        return html;
    }
    
    // Function to render Markdown with LaTeX support
    function renderMarkdown(markdownText) {
        // Process the table of contents
        const tocRegex = /\[TOC\]/g;
        if (tocRegex.test(markdownText)) {
            const headings = [];
            const headingRegex = /^(#{1,6})\s+(.+)$/gm;
            let match;
            
            while ((match = headingRegex.exec(markdownText)) !== null) {
                const level = match[1].length;
                const text = match[2];
                const slug = text.toLowerCase().replace(/[^\w]+/g, '-');
                headings.push({ level, text, slug });
            }
            
            let toc = '<div class="toc">\n<ul>\n';
            let prevLevel = 0;
            
            headings.forEach(heading => {
                if (heading.level > prevLevel) {
                    toc += '<ul>\n';
                } else if (heading.level < prevLevel) {
                    const diff = prevLevel - heading.level;
                    toc += '</ul>\n'.repeat(diff);
                }
                
                toc += `<li><a href="#${heading.slug}">${heading.text}</a></li>\n`;
                prevLevel = heading.level;
            });
            
            toc += '</ul>\n</div>';
            markdownText = markdownText.replace(tocRegex, toc);
        }
        
        // 保护LaTeX内容
        const { text: protectedText, blocks } = protectLatex(markdownText);
        
        // Render the Markdown
        let html = marked.parse(protectedText);
        
        // 恢复LaTeX内容
        html = restoreLatex(html, blocks);
        
        preview.innerHTML = html;
        
        // 处理LaTeX公式
        try {
            const katexOptions = {
                delimiters: [
                    {left: '$$', right: '$$', display: true},
                    {left: '$', right: '$', display: false},
                    {left: '\\(', right: '\\)', display: false},
                    {left: '\\[', right: '\\]', display: true}
                ],
                throwOnError: false,
                output: 'html',
                trust: true,
                strict: false
            };
            
            // 使用原生方法处理公式
            const displayMath = preview.querySelectorAll('p');
            displayMath.forEach(element => {
                const text = element.innerHTML;
                // 检查是否包含未渲染的LaTeX块
                if (text.match(/\$\$([\s\S]*?)\$\$/)) {
                    try {
                        renderMathInElement(element, katexOptions);
                    } catch (e) {
                        console.error('Error rendering display math:', e);
                    }
                }
            });
            
            // 处理整个文档的剩余公式
            renderMathInElement(preview, katexOptions);
        } catch (error) {
            console.error('Error rendering LaTeX:', error);
        }
        
        // Add IDs to headings for TOC links
        const headingElements = preview.querySelectorAll('h1, h2, h3, h4, h5, h6');
        headingElements.forEach(heading => {
            const slug = heading.textContent.toLowerCase().replace(/[^\w]+/g, '-');
            heading.id = slug;
        });
    }
    
    // Auto-complete for code blocks and LaTeX
    editor.addEventListener('keydown', (e) => {
        // Check for backtick (`) key or $ key
        if (e.key === '`' || e.key === '$') {
            const cursorPos = editor.selectionStart;
            const textBeforeCursor = editor.value.substring(0, cursorPos);
            const textAfterCursor = editor.value.substring(cursorPos);
            
            // Auto-complete code blocks (```)
            if (e.key === '`' && textBeforeCursor.endsWith('``')) {
                // Check if we're not already inside a code block
                const codeBlocksBeforeCursor = (textBeforeCursor.match(/```/g) || []).length;
                if (codeBlocksBeforeCursor % 2 === 0) {
                    e.preventDefault();
                    // Insert opening ``` and closing ```
                    const updatedText = textBeforeCursor + '`\n\n```' + textAfterCursor;
                    editor.value = updatedText;
                    // Set cursor position between the code blocks
                    editor.selectionStart = cursorPos + 2;
                    editor.selectionEnd = cursorPos + 2;
                    renderMarkdown(editor.value);
                }
            }
            
            // Auto-complete LaTeX blocks ($$)
            if (e.key === '$' && textBeforeCursor.endsWith('$')) {
                // Check if we're not already inside a LaTeX block
                const latexBlocksBeforeCursor = (textBeforeCursor.match(/\$\$/g) || []).length;
                if (latexBlocksBeforeCursor % 2 === 0) {
                    e.preventDefault();
                    // Insert opening $$ and closing $$
                    const updatedText = textBeforeCursor + '$\n\n$$' + textAfterCursor;
                    editor.value = updatedText;
                    // Set cursor position between the LaTeX blocks
                    editor.selectionStart = cursorPos + 2;
                    editor.selectionEnd = cursorPos + 2;
                    renderMarkdown(editor.value);
                }
            }
        }
    });
    
    // Auto-save function
    function autoSave() {
        if (saveTimeout) {
            clearTimeout(saveTimeout);
        }
        
        if (editor.value === lastSavedContent) {
            return;
        }
        
        saveBtn.classList.add('saving');
        saveBtn.textContent = 'Saving...';
        
        saveTimeout = setTimeout(() => {
            saveDocument().then(() => {
                saveBtn.classList.remove('saving');
                saveBtn.classList.add('saved');
                saveBtn.textContent = 'Saved';
                
                setTimeout(() => {
                    saveBtn.classList.remove('saved');
                    saveBtn.textContent = 'Save';
                }, 2000);
            });
        }, 1000);
    }
    
    // Save document to server
    async function saveDocument() {
        try {
            const response = await fetch('/markdown/api/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    id: currentDocId,
                    title: docTitle.value || 'Untitled',
                    content: editor.value
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                currentDocId = data.id;
                lastSavedContent = editor.value;
                
                if (!currentDocId) {
                    loadDocumentList();
                }
                
                return true;
            }
        } catch (error) {
            console.error('Error saving document:', error);
        }
        
        return false;
    }
    
    // Load document list from server
    async function loadDocumentList() {
        try {
            const response = await fetch('/markdown/api/documents');
            const documents = await response.json();
            
            documentList.innerHTML = '';
            
            if (documents.length === 0) {
                documentList.innerHTML = '<li><a class="dropdown-item" href="#">No documents</a></li>';
                return;
            }
            
            documents.forEach(doc => {
                const listItem = document.createElement('li');
                const link = document.createElement('a');
                link.classList.add('dropdown-item');
                link.href = '#';
                link.textContent = doc.title;
                link.dataset.docId = doc.id;
                
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    loadDocument(doc.id);
                });
                
                listItem.appendChild(link);
                documentList.appendChild(listItem);
            });
        } catch (error) {
            console.error('Error loading document list:', error);
        }
    }
    
    // Load a specific document
    async function loadDocument(id) {
        try {
            const response = await fetch(`/markdown/api/document/${id}`);
            const document = await response.json();
            
            if (document) {
                currentDocId = document.id;
                docTitle.value = document.title;
                editor.value = document.content;
                lastSavedContent = document.content;
                renderMarkdown(document.content);
            }
        } catch (error) {
            console.error('Error loading document:', error);
        }
    }
    
    // Create new document
    function createNewDocument() {
        if (window.sampleContent && !currentDocId) {
            // Load sample content for first-time users
            editor.value = window.sampleContent;
            docTitle.value = 'Markdown示例文档';
        } else {
            editor.value = '';
            docTitle.value = 'Untitled';
        }
        preview.innerHTML = '';
        currentDocId = null;
        lastSavedContent = '';
        
        // Render the content if sample content was loaded
        if (editor.value) {
            renderMarkdown(editor.value);
        }
    }
    
    // Convert image to base64
    async function convertImageToBase64(url) {
        try {
            const response = await fetch('/markdown/api/image-to-base64', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    imageUrl: url
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                const cursorPos = editor.selectionStart;
                const textBeforeCursor = editor.value.substring(0, cursorPos);
                const textAfterCursor = editor.value.substring(cursorPos);
                
                // Insert the Markdown image syntax at cursor position
                const markdownImage = `![image](${data.dataUrl})`;
                editor.value = textBeforeCursor + markdownImage + textAfterCursor;
                
                // Update the preview
                renderMarkdown(editor.value);
                
                // Move cursor after the inserted image
                editor.selectionStart = cursorPos + markdownImage.length;
                editor.selectionEnd = cursorPos + markdownImage.length;
                
                return true;
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error) {
            console.error('Error converting image:', error);
            alert('Error: Failed to convert image');
        }
        
        return false;
    }
    
    // AI continue/polish functions (placeholders for now)
    async function requestAIContinuation() {
        const position = editor.selectionStart || editor.value.length;
        const content = editor.value.substring(0, position);
        
        // Placeholder for actual AI API call
        alert('AI continuation feature not implemented yet. This would be connected to an AI service API.');
    }
    
    async function requestAIPolish() {
        // Get selected text or all text
        let content = '';
        if (editor.selectionStart !== editor.selectionEnd) {
            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            content = editor.value.substring(start, end);
        } else {
            content = editor.value;
        }
        
        // Placeholder for actual AI API call
        alert('AI polish feature not implemented yet. This would be connected to an AI service API.');
    }
    
    // Toggle fold/unfold function
    function toggleFold() {
        isFolded = !isFolded;
        document.body.classList.toggle('folded', isFolded);
    }
    
    // Toggle edit mode function
    function toggleEditMode() {
        isImmersiveMode = !isImmersiveMode;
        document.body.classList.toggle('immersive-mode', isImmersiveMode);
    }
    
    // Copy markdown source function
    function copyMarkdownSource() {
        navigator.clipboard.writeText(editor.value)
            .then(() => {
                const originalText = copyMarkdownBtn.textContent;
                copyMarkdownBtn.textContent = 'Copied!';
                setTimeout(() => {
                    copyMarkdownBtn.textContent = originalText;
                }, 2000);
            })
            .catch(err => {
                console.error('Failed to copy text: ', err);
            });
    }
    
    // Copy HTML content function
    function copyHtmlContent() {
        navigator.clipboard.writeText(preview.innerHTML)
            .then(() => {
                const originalText = copyHtmlBtn.textContent;
                copyHtmlBtn.textContent = 'Copied!';
                setTimeout(() => {
                    copyHtmlBtn.textContent = originalText;
                }, 2000);
            })
            .catch(err => {
                console.error('Failed to copy HTML: ', err);
            });
    }
    
    // Change theme function
    function changeTheme(theme) {
        // Remove previous theme class
        document.body.classList.remove(`theme-${currentTheme}`);
        
        // Add new theme class
        currentTheme = theme;
        document.body.classList.add(`theme-${currentTheme}`);
        
        // Update active state in dropdown
        themeListItems.forEach(item => {
            item.classList.toggle('active', item.getAttribute('data-theme') === theme);
        });
    }
    
    // Event listeners for menu items
    toggleFoldBtn.addEventListener('click', toggleFold);
    toggleModeBtn.addEventListener('click', toggleEditMode);
    copyMarkdownBtn.addEventListener('click', copyMarkdownSource);
    copyHtmlBtn.addEventListener('click', copyHtmlContent);
    
    // Theme selector event listeners
    themeListItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const theme = e.target.getAttribute('data-theme');
            changeTheme(theme);
        });
    });
    
    // Event listeners
    editor.addEventListener('input', () => {
        renderMarkdown(editor.value);
        autoSave();
    });
    
    saveBtn.addEventListener('click', (e) => {
        e.preventDefault();
        saveDocument();
    });
    
    newBtn.addEventListener('click', (e) => {
        e.preventDefault();
        createNewDocument();
    });
    
    aiContinueBtn.addEventListener('click', (e) => {
        e.preventDefault();
        requestAIContinuation();
    });
    
    aiPolishBtn.addEventListener('click', (e) => {
        e.preventDefault();
        requestAIPolish();
    });
    
    imgToBase64Btn.addEventListener('click', (e) => {
        e.preventDefault();
        imageUrlInput.value = '';
        imageModal.show();
    });
    
    convertImageBtn.addEventListener('click', () => {
        const url = imageUrlInput.value.trim();
        if (url) {
            convertImageToBase64(url)
                .then(success => {
                    if (success) {
                        imageModal.hide();
                    } else {
                        alert('Failed to convert image. Please check the URL and try again.');
                    }
                });
        } else {
            alert('Please enter a valid image URL.');
        }
    });
    
    // Initialize
    createNewDocument();
    loadDocumentList();
    enableEditorScrolling();
    
    // 设置初始焦点，使编辑器可以立即滚动
    editor.focus();
}); 