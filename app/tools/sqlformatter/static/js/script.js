document.addEventListener('DOMContentLoaded', function() {
    // Initialize CodeMirror for input
    const sqlInput = CodeMirror.fromTextArea(document.getElementById('sql-input'), {
        mode: 'text/x-sql',
        theme: 'dracula',
        lineNumbers: true,
        indentWithTabs: true,
        smartIndent: true,
        lineWrapping: true,
        matchBrackets: true,
        autofocus: true,
        tabSize: 2
    });

    // Initialize CodeMirror for output (read-only)
    const sqlOutput = CodeMirror.fromTextArea(document.getElementById('sql-output'), {
        mode: 'text/x-sql',
        theme: 'dracula',
        lineNumbers: true,
        readOnly: true,
        lineWrapping: true,
        matchBrackets: true,
        tabSize: 2
    });

    // Get DOM elements
    const dialectSelector = document.getElementById('dialect-selector');
    const copyButton = document.getElementById('copy-button');
    
    // Sample SQL statement to show on initial load
    const sampleSQL = `SELECT 
    u.id, u.name, u.email, 
    p.title as project_title, 
    COUNT(t.id) as total_tasks,
    SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed_tasks
FROM users u
JOIN projects p ON u.id = p.user_id
LEFT JOIN tasks t ON p.id = t.project_id
WHERE u.active = TRUE AND p.deleted_at IS NULL
GROUP BY u.id, u.name, u.email, p.title
HAVING COUNT(t.id) > 0
ORDER BY u.name ASC, p.title ASC;`;

    // Set initial value
    sqlInput.setValue(sampleSQL);
    
    // Format the SQL and update output
    function formatSQL() {
        try {
            const sql = sqlInput.getValue();
            const dialect = dialectSelector.value;
            
            // Format the SQL using sql-formatter library
            const formatted = sqlFormatter.format(sql, {
                language: dialect, // 'sql', 'mysql', 'postgresql', etc.
                uppercase: true, // Uppercase keywords
                linesBetweenQueries: 2, // Add extra line breaks between queries
                indentStyle: '  ', // Two spaces for indentation
            });
            
            // Update the output
            sqlOutput.setValue(formatted);
        } catch (error) {
            console.error('Error formatting SQL:', error);
            sqlOutput.setValue('Error formatting SQL: ' + error.message);
        }
    }
    
    // Format on initial load
    formatSQL();
    
    // Add event listeners
    sqlInput.on('change', formatSQL);
    dialectSelector.addEventListener('change', formatSQL);
    
    // Copy to clipboard functionality
    copyButton.addEventListener('click', function() {
        // Get formatted SQL
        const formattedSQL = sqlOutput.getValue();
        
        // Use Clipboard API
        navigator.clipboard.writeText(formattedSQL).then(function() {
            // Visual feedback for copy success
            copyButton.classList.add('copied');
            
            // Change text temporarily
            const spanElement = copyButton.querySelector('span');
            const originalText = spanElement.textContent;
            spanElement.textContent = '已复制!';
            
            // Reset after a delay
            setTimeout(function() {
                copyButton.classList.remove('copied');
                spanElement.textContent = originalText;
            }, 2000);
        }).catch(function(err) {
            console.error('Could not copy text: ', err);
            
            // Fallback method using textarea
            const textarea = document.createElement('textarea');
            textarea.value = formattedSQL;
            textarea.style.position = 'fixed';  // Prevent scrolling to the bottom
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            
            try {
                document.execCommand('copy');
                // Visual feedback
                copyButton.classList.add('copied');
                const spanElement = copyButton.querySelector('span');
                const originalText = spanElement.textContent;
                spanElement.textContent = '已复制!';
                
                setTimeout(function() {
                    copyButton.classList.remove('copied');
                    spanElement.textContent = originalText;
                }, 2000);
            } catch (err) {
                console.error('Fallback: Could not copy text: ', err);
            }
            
            document.body.removeChild(textarea);
        });
    });
    
    // Resize CodeMirror instances when window is resized
    function refreshEditors() {
        sqlInput.refresh();
        sqlOutput.refresh();
    }
    
    window.addEventListener('resize', refreshEditors);
    
    // Make sure editors are properly sized after DOM is fully loaded
    setTimeout(refreshEditors, 100);
    
    // Also refresh when any parent element changes size
    if (window.ResizeObserver) {
        const containerElement = document.querySelector('.sql-formatter-container');
        const resizeObserver = new ResizeObserver(refreshEditors);
        resizeObserver.observe(containerElement);
    }
});