document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const jsonInput = document.getElementById('jsonInput');
    const jsonOutput = document.getElementById('jsonOutput');
    const clearButton = document.getElementById('clearButton');
    const expandAllButton = document.getElementById('expandAllButton');
    const collapseAllButton = document.getElementById('collapseAllButton');
    const copyButton = document.getElementById('copyButton');
    const statusMessage = document.getElementById('statusMessage');
    
    // Sample JSON data
    const sampleData = {
        "name": "JSON 格式化工具",
        "version": "1.0.0",
        "description": "一个简单易用的 JSON 格式化工具",
        "features": [
            "实时格式化",
            "节点折叠/展开",
            "一键复制"
        ],
        "settings": {
            "theme": "light",
            "indentation": 2,
            "collapseByDefault": false
        },
        "author": {
            "name": "氛围工具店",
            "website": "https://example.com"
        },
        "isOpenSource": true,
        "lastUpdated": "2025-04-12"
    };
    
    // Set sample data in the input
    jsonInput.value = JSON.stringify(sampleData, null, 2);
    
    // Format the initial JSON
    formatJSON();
    
    // Add event listeners
    jsonInput.addEventListener('input', debounce(formatJSON, 300));
    clearButton.addEventListener('click', clearInput);
    expandAllButton.addEventListener('click', expandAll);
    collapseAllButton.addEventListener('click', collapseAll);
    copyButton.addEventListener('click', copyToClipboard);
    
    // Format JSON function
    function formatJSON() {
        const inputValue = jsonInput.value.trim();
        
        if (!inputValue) {
            jsonOutput.innerHTML = '<div class="text-gray-400">在左侧输入 JSON 以查看格式化结果...</div>';
            hideStatusMessage();
            return;
        }
        
        try {
            // Parse JSON to check validity
            const parsedJSON = JSON.parse(inputValue);
            // Convert JSON to HTML tree structure
            jsonOutput.innerHTML = createJSONTree(parsedJSON);
            // Add event listeners to collapsible elements
            addCollapsibleListeners();
            hideStatusMessage();
        } catch (error) {
            // Show error message
            jsonOutput.innerHTML = '<div class="text-gray-400">等待有效的 JSON 输入...</div>';
            showStatusMessage('错误：' + error.message, 'error');
        }
    }
    
    // Create JSON tree HTML structure
    function createJSONTree(data) {
        function buildHTMLTree(obj, isRoot = true) {
            let html = isRoot ? '<ul class="json-tree">' : '<ul>';
            
            if (Array.isArray(obj)) {
                // Array handling
                html += `<li><span class="collapsible json-bracket">[</span><div class="collapsible-content">`;
                
                obj.forEach((item, index) => {
                    html += '<li>';
                    
                    if (typeof item === 'object' && item !== null) {
                        html += buildHTMLTree(item, false);
                    } else {
                        html += formatValue(item);
                    }
                    
                    html += (index < obj.length - 1) ? '<span class="json-comma">,</span>' : '';
                    html += '</li>';
                });
                
                html += `</div><span class="json-bracket">]</span></li>`;
            } else if (typeof obj === 'object' && obj !== null) {
                // Object handling
                html += `<li><span class="collapsible json-brace">{</span><div class="collapsible-content">`;
                
                const keys = Object.keys(obj);
                keys.forEach((key, index) => {
                    const value = obj[key];
                    
                    html += '<li>';
                    html += `<span class="json-key">"${escapeHTML(key)}"</span><span class="json-colon">: </span>`;
                    
                    if (typeof value === 'object' && value !== null) {
                        html += buildHTMLTree(value, false);
                    } else {
                        html += formatValue(value);
                    }
                    
                    html += (index < keys.length - 1) ? '<span class="json-comma">,</span>' : '';
                    html += '</li>';
                });
                
                html += `</div><span class="json-brace">}</span></li>`;
            } else {
                // Primitive value
                html += `<li>${formatValue(obj)}</li>`;
            }
            
            html += '</ul>';
            return html;
        }
        
        return buildHTMLTree(data);
    }
    
    // Format value based on its type
    function formatValue(value) {
        if (value === null) {
            return '<span class="json-null">null</span>';
        }
        
        switch (typeof value) {
            case 'string':
                return `<span class="json-string">"${escapeHTML(value)}"</span>`;
            case 'number':
                return `<span class="json-number">${value}</span>`;
            case 'boolean':
                return `<span class="json-boolean">${value}</span>`;
            default:
                return `<span>${escapeHTML(String(value))}</span>`;
        }
    }
    
    // Escape HTML special characters
    function escapeHTML(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
    
    // Add event listeners to collapsible elements
    function addCollapsibleListeners() {
        const collapsibles = document.querySelectorAll('.collapsible');
        
        collapsibles.forEach(item => {
            item.addEventListener('click', function(e) {
                e.stopPropagation();
                this.classList.toggle('collapsed');
                const content = this.nextElementSibling;
                content.classList.toggle('collapsed');
            });
        });
    }
    
    // Expand all nodes
    function expandAll() {
        const collapsibles = document.querySelectorAll('.collapsible.collapsed');
        const contents = document.querySelectorAll('.collapsible-content.collapsed');
        
        collapsibles.forEach(item => item.classList.remove('collapsed'));
        contents.forEach(item => item.classList.remove('collapsed'));
        
        showStatusMessage('已展开所有节点', 'success');
    }
    
    // Collapse all nodes
    function collapseAll() {
        const collapsibles = document.querySelectorAll('.collapsible:not(.collapsed)');
        const contents = document.querySelectorAll('.collapsible-content:not(.collapsed)');
        
        collapsibles.forEach(item => item.classList.add('collapsed'));
        contents.forEach(item => item.classList.add('collapsed'));
        
        showStatusMessage('已折叠所有节点', 'success');
    }
    
    // Copy formatted JSON to clipboard
    function copyToClipboard() {
        try {
            const formattedJSON = JSON.stringify(JSON.parse(jsonInput.value), null, 2);
            navigator.clipboard.writeText(formattedJSON).then(() => {
                showStatusMessage('已复制到剪贴板', 'success');
            });
        } catch (error) {
            showStatusMessage('复制失败：' + error.message, 'error');
        }
    }
    
    // Clear input
    function clearInput() {
        jsonInput.value = '';
        jsonOutput.innerHTML = '<div class="text-gray-400">在左侧输入 JSON 以查看格式化结果...</div>';
        hideStatusMessage();
    }
    
    // Show status message
    function showStatusMessage(message, type) {
        statusMessage.textContent = message;
        statusMessage.className = 'status-message';
        statusMessage.classList.add(type);
        statusMessage.classList.remove('hidden');
        
        // Auto hide after 3 seconds
        setTimeout(hideStatusMessage, 3000);
    }
    
    // Hide status message
    function hideStatusMessage() {
        statusMessage.classList.add('hidden');
    }
    
    // Debounce function for performance
    function debounce(func, delay) {
        let timeout;
        return function() {
            const context = this;
            const args = arguments;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), delay);
        };
    }
});