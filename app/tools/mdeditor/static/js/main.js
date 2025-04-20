document.addEventListener('DOMContentLoaded', function() {
    // DOM 元素
    const editor = document.getElementById('editor');
    const preview = document.getElementById('preview');
    const docTitle = document.getElementById('doc-title');
    const saveStatus = document.getElementById('save-status');
    const btnNew = document.getElementById('btn-new');
    const btnImport = document.getElementById('btn-import');
    const btnExport = document.getElementById('btn-export');
    const btnCopy = document.getElementById('btn-copy');
    const importDialog = document.getElementById('import-dialog');
    const fileInput = document.getElementById('file-input');
    const btnImportCancel = document.getElementById('btn-import-cancel');
    const btnImportConfirm = document.getElementById('btn-import-confirm');
    
    // 当前文档信息
    let currentDoc = {
        id: generateId(),
        title: '未命名文档',
        content: '',
        lastSaved: new Date()
    };
    
    // 初始化编辑器
    initEditor();
    
    // 配置 Marked 解析器
    configureMarked();
    
    // 加载上次编辑的文档
    loadLastDocument();
    
    // 渲染初始内容
    renderPreview();
    
    // 事件监听
    editor.addEventListener('input', function() {
        renderPreview();
        saveDocument();
        // 重置复制按钮状态
        if (btnCopy) {
            btnCopy.title = '复制HTML内容';
            btnCopy.innerHTML = '<i class="fa-regular fa-copy"></i>';
        }
    });
    
    docTitle.addEventListener('input', function() {
        currentDoc.title = docTitle.value;
        saveDocument();
    });
    
    btnNew.addEventListener('click', createNewDocument);
    btnImport.addEventListener('click', showImportDialog);
    btnExport.addEventListener('click', exportDocument);
    btnImportCancel.addEventListener('click', hideImportDialog);
    btnImportConfirm.addEventListener('click', importDocument);
    
    // 添加复制按钮事件监听
    btnCopy.addEventListener('click', async function() {
        try {
            // 创建一个临时容器来存放内容
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = preview.innerHTML;
            
            // 创建一个 ClipboardItem 对象
            const clipboardItem = new ClipboardItem({
                'text/plain': new Blob([tempDiv.innerText], { type: 'text/plain' }),
                'text/html': new Blob([preview.innerHTML], { type: 'text/html' })
            });
            
            // 使用新的 Clipboard API 复制内容
            await navigator.clipboard.write([clipboardItem]);
            
            // 显示临时提示
            const originalTitle = this.title;
            const originalIcon = this.innerHTML;
            this.title = '已复制！';
            this.innerHTML = '<i class="fa-solid fa-check"></i>';
            
            setTimeout(() => {
                this.title = originalTitle;
                this.innerHTML = originalIcon;
            }, 2000);
        } catch (err) {
            console.error('复制失败:', err);
            this.title = '复制失败';
            setTimeout(() => {
                this.title = '复制HTML内容';
            }, 2000);
        }
    });
    
    // 函数定义
    function initEditor() {
        // 设置编辑器的tab行为
        editor.addEventListener('keydown', function(e) {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = this.selectionStart;
                const end = this.selectionEnd;
                
                this.value = this.value.substring(0, start) + '    ' + this.value.substring(end);
                this.selectionStart = this.selectionEnd = start + 4;
            }
        });
    }
    
    function configureMarked() {
        // 配置 Marked 解析器
        marked.setOptions({
            breaks: true,
            gfm: true,
            highlight: function(code, lang) {
                if (hljs.getLanguage(lang)) {
                    return hljs.highlight(code, { language: lang }).value;
                }
                return hljs.highlightAuto(code).value;
            }
        });
        
        // 自定义渲染器以处理LaTeX公式
        const renderer = new marked.Renderer();
        const originalText = renderer.text;
        
        // 重写text方法，处理行内公式
        renderer.text = function(text) {
            // 使用正则表达式查找所有形如 $...$ 的部分（行内公式）
            return text.replace(/\$(.+?)\$/g, function(_, formula) {
                try {
                    return katex.renderToString(formula, { 
                        throwOnError: false,
                        displayMode: false
                    });
                } catch (e) {
                    return `<span class="katex-error" title="${e}">${formula}</span>`;
                }
            });
        };
        
        // 重写paragraph方法，处理块级公式
        const originalParagraph = renderer.paragraph;
        renderer.paragraph = function(text) {
            // 块级公式 $$...$$
            if (text.startsWith('$$') && text.endsWith('$$')) {
                const formula = text.slice(2, -2).trim();
                try {
                    return katex.renderToString(formula, {
                        throwOnError: false,
                        displayMode: true
                    });
                } catch (e) {
                    return `<div class="katex-error" title="${e}">${formula}</div>`;
                }
            }
            return originalParagraph.call(this, text);
        };
        
        marked.use({ renderer });
    }
    
    function renderPreview() {
        // 使用 Marked 渲染 Markdown
        preview.innerHTML = marked.parse(editor.value);
        
        // 应用代码高亮
        document.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
            
            // 添加复制按钮
            const copyButton = document.createElement('button');
            copyButton.className = 'copy-button';
            copyButton.textContent = '复制';
            copyButton.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(block.textContent);
                    copyButton.textContent = '已复制';
                    copyButton.classList.add('copied');
                    setTimeout(() => {
                        copyButton.textContent = '复制';
                        copyButton.classList.remove('copied');
                    }, 2000);
                } catch (err) {
                    console.error('复制失败:', err);
                }
            });
            block.parentElement.appendChild(copyButton);
        });
        
        // 渲染块级数学公式
        renderMathInElement(preview, {
            delimiters: [
                {left: '$$', right: '$$', display: true}
            ],
            throwOnError: false
        });
    }
    
    function loadLastDocument() {
        // 从localStorage加载最近编辑的文档
        const lastDocId = localStorage.getItem('mdeditor_last_doc_id');
        
        if (lastDocId) {
            const docData = localStorage.getItem(`mdeditor_doc_${lastDocId}`);
            if (docData) {
                try {
                    currentDoc = JSON.parse(docData);
                    editor.value = currentDoc.content;
                    docTitle.value = currentDoc.title;
                } catch (e) {
                    console.error('Failed to load document', e);
                    createNewDocument();
                }
            } else {
                createNewDocument();
            }
        } else {
            // 如果没有最近编辑的文档，创建示例文档
            createExampleDocument();
        }
    }
    
    function createExampleDocument() {
        const exampleContent = `# 欢迎使用梁记 Markdown 编辑器

这是一个简单的示例文档，帮助您了解编辑器的功能。

## 基本 Markdown 语法

您可以使用 **粗体**、*斜体* 或 ~~删除线~~ 来格式化文本。

### 列表

无序列表:
- 项目 1
- 项目 2
- 项目 3

有序列表:
1. 第一项
2. 第二项
3. 第三项

## 代码高亮

\`\`\`python
def hello_world():
    print("Hello, Markdown!")
    
# 这是一个Python代码示例
for i in range(10):
    print(f"Count: {i}")
\`\`\`

## 数学公式支持

行内公式: $E = mc^2$

块级公式:

$$
\\frac{d}{dx}\\left( \\int_{a}^{x} f(t)\\,dt\\right) = f(x)
$$

$$
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
$$

## 表格

| 名称 | 价格 |
|------|------|
| 苹果 | ¥5   |
| 香蕉 | ¥3   |
| 橙子 | ¥4   |

## 引用

> 这是一段引用文字。
> 
> 引用可以有多个段落。

---

开始您的创作吧！`;

        currentDoc = {
            id: generateId(),
            title: '欢迎使用示例',
            content: exampleContent,
            lastSaved: new Date()
        };
        
        editor.value = currentDoc.content;
        docTitle.value = currentDoc.title;
        saveDocument();
    }
    
    function saveDocument() {
        // 保存当前文档到localStorage
        currentDoc.content = editor.value;
        currentDoc.lastSaved = new Date();
        
        localStorage.setItem(`mdeditor_doc_${currentDoc.id}`, JSON.stringify(currentDoc));
        localStorage.setItem('mdeditor_last_doc_id', currentDoc.id);
        
        // 更新保存状态
        saveStatus.textContent = '已保存';
        saveStatus.classList.remove('text-yellow-500');
        saveStatus.classList.add('text-green-500');
        
        // 2秒后恢复状态
        setTimeout(() => {
            saveStatus.textContent = '已保存';
            saveStatus.classList.remove('text-green-500');
            saveStatus.classList.add('text-gray-500');
        }, 2000);
    }
    
    function createNewDocument() {
        if (editor.value.trim() !== '' && 
            !confirm('创建新文档将丢失当前未保存的更改，确定继续吗？')) {
            return;
        }
        
        currentDoc = {
            id: generateId(),
            title: '未命名文档',
            content: '',
            lastSaved: new Date()
        };
        
        editor.value = '';
        docTitle.value = currentDoc.title;
        renderPreview();
        saveDocument();
    }
    
    function showImportDialog() {
        importDialog.classList.remove('hidden');
    }
    
    function hideImportDialog() {
        importDialog.classList.add('hidden');
        fileInput.value = ''; // 清空文件输入
    }
    
    function importDocument() {
        const file = fileInput.files[0];
        
        if (!file) {
            alert('请选择要导入的文件');
            return;
        }
        
        if (editor.value.trim() !== '' && 
            !confirm('导入文件将替换当前内容，确定继续吗？')) {
            hideImportDialog();
            return;
        }
        
        const reader = new FileReader();
        
        reader.onload = function(e) {
            const content = e.target.result;
            
            // 创建新文档
            currentDoc = {
                id: generateId(),
                title: file.name.replace(/\.(md|markdown|txt)$/i, ''),
                content: content,
                lastSaved: new Date()
            };
            
            editor.value = content;
            docTitle.value = currentDoc.title;
            renderPreview();
            saveDocument();
            hideImportDialog();
        };
        
        reader.onerror = function() {
            alert('读取文件时发生错误');
            hideImportDialog();
        };
        
        reader.readAsText(file);
    }
    
    function exportDocument() {
        const content = editor.value;
        const title = docTitle.value || '未命名文档';
        const filename = `${title}.md`;
        
        // 创建一个Blob对象
        const blob = new Blob([content], { type: 'text/markdown' });
        
        // 创建下载链接
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        
        // 模拟点击下载
        document.body.appendChild(a);
        a.click();
        
        // 清理
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 0);
    }
    
    function generateId() {
        // 生成简单的唯一ID
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    }
    
    // 自动保存定时器 (每30秒)
    setInterval(saveDocument, 30000);
});