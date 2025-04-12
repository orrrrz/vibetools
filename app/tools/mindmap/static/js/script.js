/**
 * Web Mind Map Editor Script
 *
 * Handles node creation, editing, deletion, dragging, and connections.
 * Uses LeaderLine library for drawing connectors.
 */
document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('mindmap-container');
    const addChildBtn = document.getElementById('add-child-btn');
    const addSiblingBtn = document.getElementById('add-sibling-btn');
    const deleteNodeBtn = document.getElementById('delete-node-btn');

    let nodes = {}; // Store node data { id: { element: DOMElement, parentId: string|null, childrenIds: string[], text: string, line: LeaderLine|null } }
    let lines = {}; // Store line objects { lineId: LeaderLine }
    let selectedNodeId = null;
    let nodeIdCounter = 0;
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let draggedNodeId = null;
    let currentScale = 1; // For potential zooming
    let panX = 0; // For panning
    let panY = 0; // For panning
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;

    // --- Initialization ---

    function initMindMap() {
        // Clear existing nodes and lines if any (for potential reset)
        container.innerHTML = '';
        nodes = {};
        lines = {};
        nodeIdCounter = 0;
        selectedNodeId = null;
        updateButtonStates();

        // Create the central topic
        createNode(null, '中心主题', container.offsetWidth / 2, container.offsetHeight / 2, ['central-topic']);
        // Automatically select the root node initially
        if (nodeIdCounter > 0) {
             selectNode('node-1');
        }
    }

    // --- Node Management ---

    /**
     * Creates a new mind map node.
     * @param {string|null} parentId - The ID of the parent node, or null for the root.
     * @param {string} text - The initial text content of the node.
     * @param {number} x - The initial horizontal position (absolute).
     * @param {number} y - The initial vertical position (absolute).
     * @param {string[]} [classes=[]] - Additional CSS classes for the node.
     * @returns {string} The ID of the newly created node.
     */
    function createNode(parentId, text, x, y, classes = []) {
        nodeIdCounter++;
        const nodeId = `node-${nodeIdCounter}`;

        const nodeElement = document.createElement('div');
        nodeElement.id = nodeId;
        nodeElement.className = 'mindmap-node';
        classes.forEach(cls => nodeElement.classList.add(cls)); // Add specific classes
        nodeElement.textContent = text;
        nodeElement.style.left = `${x}px`;
        nodeElement.style.top = `${y}px`;
        nodeElement.style.transform = 'translate(-50%, -50%)'; // Center the node
        nodeElement.draggable = true; // Make it draggable
        nodeElement.setAttribute('tabindex', 0); // Make it focusable

        container.appendChild(nodeElement);

        // Store node data
        nodes[nodeId] = {
            element: nodeElement,
            parentId: parentId,
            childrenIds: [],
            text: text,
            line: null, // Will store the LeaderLine object connecting to the parent
            level: parentId ? nodes[parentId].level + 1 : 0 // Calculate level
        };

        // Update parent's children list
        if (parentId && nodes[parentId]) {
            nodes[parentId].childrenIds.push(nodeId);
            // Apply level-based styling
            applyNodeStyle(nodeElement, nodes[nodeId].level);
        } else {
             applyNodeStyle(nodeElement, 0); // Root node style
        }


        // Add event listeners
        addNodeEventListeners(nodeElement, nodeId);

        // Draw line to parent if applicable
        if (parentId) {
            createLine(parentId, nodeId);
        }

        // Select the newly created node
        selectNode(nodeId);

        return nodeId;
    }

    /**
     * Applies CSS classes based on the node's level in the hierarchy.
     * @param {HTMLElement} nodeElement - The DOM element of the node.
     * @param {number} level - The level of the node (0 for root).
     */
    function applyNodeStyle(nodeElement, level) {
        // Remove previous level styles
        nodeElement.classList.remove('central-topic', 'main-topic', 'sub-topic');

        if (level === 0) {
            nodeElement.classList.add('central-topic');
        } else if (level === 1) {
            nodeElement.classList.add('main-topic');
        } else {
            nodeElement.classList.add('sub-topic');
        }
    }


    /**
     * Deletes a node and all its descendants.
     * @param {string} nodeId - The ID of the node to delete.
     */
    function deleteNode(nodeId) {
        if (!nodeId || !nodes[nodeId] || nodes[nodeId].level === 0) { // Cannot delete root
            console.warn("Cannot delete root node or invalid node ID:", nodeId);
            return;
        }

        const nodeData = nodes[nodeId];

        // Recursively delete children first
        // Create a copy of childrenIds because the array might be modified during iteration elsewhere
        const childrenToDelete = [...nodeData.childrenIds];
        childrenToDelete.forEach(childId => {
            deleteNode(childId); // Recursive call
        });

        // Remove the line connecting to the parent
        if (nodeData.line) {
            try {
                nodeData.line.remove();
            } catch (e) { console.error("Error removing line:", e); }
        }

        // Remove the node element from the DOM
        nodeData.element.remove();

        // Remove the node from the parent's childrenIds list
        const parentData = nodes[nodeData.parentId];
        if (parentData) {
            const index = parentData.childrenIds.indexOf(nodeId);
            if (index > -1) {
                parentData.childrenIds.splice(index, 1);
            }
        }

        // Remove the node data from the main nodes object
        delete nodes[nodeId];

        // If the deleted node was selected, deselect
        if (selectedNodeId === nodeId) {
            selectNode(nodeData.parentId); // Select parent after deletion
        }
        updateButtonStates(); // Update button states after deletion
    }

    /**
     * Makes a node's text editable.
     * @param {string} nodeId - The ID of the node to edit.
     */
    function editTextNode(nodeId) {
        if (!nodeId || !nodes[nodeId]) return;
        const nodeElement = nodes[nodeId].element;

        // Prevent editing if already editing
        if (nodeElement.isContentEditable) return;

        nodeElement.contentEditable = true;
        nodeElement.focus(); // Focus the element
        document.execCommand('selectAll', false, null); // Select all text

        // Add a temporary blur listener to save changes
        const saveOnBlur = () => {
            nodeElement.contentEditable = false;
            nodes[nodeId].text = nodeElement.textContent.trim() || "未命名"; // Update stored text, provide default if empty
            nodeElement.textContent = nodes[nodeId].text; // Ensure display matches stored text
            updateLines(nodeId); // Update lines in case size changed
            nodeElement.removeEventListener('blur', saveOnBlur);
            nodeElement.removeEventListener('keydown', handleEditKeyDown);
        };

        // Add a keydown listener to save on Enter, cancel on Escape
        const handleEditKeyDown = (event) => {
            if (event.key === 'Enter') {
                event.preventDefault(); // Prevent new line
                nodeElement.blur(); // Trigger save
            } else if (event.key === 'Escape') {
                nodeElement.textContent = nodes[nodeId].text; // Revert changes
                nodeElement.blur(); // Trigger save cancellation (blur handles cleanup)
            }
        };

        nodeElement.addEventListener('blur', saveOnBlur);
        nodeElement.addEventListener('keydown', handleEditKeyDown);
    }

    /**
     * Selects a node, highlighting it and updating controls.
     * @param {string | null} nodeId - The ID of the node to select, or null to deselect all.
     */
    function selectNode(nodeId) {
        // Deselect previous node
        if (selectedNodeId && nodes[selectedNodeId]) {
            nodes[selectedNodeId].element.classList.remove('selected');
        }

        // Select new node
        if (nodeId && nodes[nodeId]) {
            nodes[nodeId].element.classList.add('selected');
            selectedNodeId = nodeId;
        } else {
            selectedNodeId = null;
        }
        updateButtonStates();
    }

    /**
     * Updates the enabled/disabled state of control buttons based on selection.
     */
    function updateButtonStates() {
        const canAddChild = selectedNodeId !== null;
        const canAddSibling = selectedNodeId !== null && nodes[selectedNodeId]?.parentId !== null; // Can add sibling if not root
        const canDelete = selectedNodeId !== null && nodes[selectedNodeId]?.parentId !== null; // Can delete if not root

        addChildBtn.disabled = !canAddChild;
        addSiblingBtn.disabled = !canAddSibling;
        deleteNodeBtn.disabled = !canDelete;
    }


    // --- Line Management (using LeaderLine) ---

    /**
     * Creates a LeaderLine connector between two nodes.
     * @param {string} startNodeId - The ID of the starting node (parent).
     * @param {string} endNodeId - The ID of the ending node (child).
     */
    function createLine(startNodeId, endNodeId) {
        if (!nodes[startNodeId] || !nodes[endNodeId]) return;

        const startElement = nodes[startNodeId].element;
        const endElement = nodes[endNodeId].element;
        const endNodeData = nodes[endNodeId];

        // Determine line style based on child's level
        let lineOptions = {
            // start: startElement, // LeaderLine will determine best anchor points
            // end: endElement,
            color: '#9ca3af', // Default gray-400
            size: 2,
            path: 'fluid', // Smooth curve, 'straight', 'arc', 'fluid', 'magnet', 'grid'
            startSocket: 'auto',
            endSocket: 'auto',
            // startPlug: 'disc', // Optional: add a dot at the start
            // endPlug: 'arrow1' // Optional: add an arrow at the end
            outline: false, // Improves performance slightly
            // dash: { animation: true } // Optional animation
        };

        // Apply specific styles based on the level of the *child* node
        if (endNodeData.level === 1) {
            lineOptions.color = '#60a5fa'; // blue-400 for main topics
            lineOptions.size = 2.5;
        } else if (endNodeData.level > 1) {
             lineOptions.color = '#a5b4fc'; // indigo-300 for sub-topics
             lineOptions.size = 2;
        }


        try {
            // Remove existing line if any (e.g., if reparenting)
             if (endNodeData.line) {
                endNodeData.line.remove();
             }

            const line = new LeaderLine(startElement, endElement, lineOptions);

            // Add CSS class for potential global styling via CSS
             if (endNodeData.level === 1) {
                line.setOptions({className: 'leader-line main-connection'});
             } else if (endNodeData.level > 1) {
                 line.setOptions({className: 'leader-line sub-connection'});
             } else {
                 line.setOptions({className: 'leader-line'});
             }


            // Store the line reference in the child node's data
            endNodeData.line = line;

        } catch (e) {
            console.error("Failed to create LeaderLine:", e);
        }
    }

    /**
     * Updates all lines connected to a given node.
     * @param {string} nodeId - The ID of the node whose lines need updating.
     */
    function updateLines(nodeId) {
        if (!nodes[nodeId]) return;

        // Update the line connecting this node to its parent
        if (nodes[nodeId].line) {
            try {
                nodes[nodeId].line.position();
            } catch (e) { console.warn("Could not update line to parent:", e); }
        }

        // Update lines connecting this node to its children
        nodes[nodeId].childrenIds.forEach(childId => {
            if (nodes[childId] && nodes[childId].line) {
                 try {
                    nodes[childId].line.position();
                 } catch (e) { console.warn("Could not update line to child:", e); }
            }
        });
    }

    /**
     * Updates the position of all lines on the map.
     * Should be called after drag, pan, or zoom.
     */
    function updateAllLines() {
        Object.values(nodes).forEach(nodeData => {
            if (nodeData.line) {
                try {
                    nodeData.line.position();
                } catch (e) {
                    // Ignore errors if line was removed or element doesn't exist
                }
            }
        });
    }

    // --- Event Handlers ---

    /**
     * Adds necessary event listeners to a node element.
     * @param {HTMLElement} nodeElement - The DOM element of the node.
     * @param {string} nodeId - The ID of the node.
     */
    function addNodeEventListeners(nodeElement, nodeId) {
        // Click: Select the node
        nodeElement.addEventListener('click', (event) => {
            event.stopPropagation(); // Prevent triggering container click
            selectNode(nodeId);
        });

        // Double Click: Edit the node text
        nodeElement.addEventListener('dblclick', (event) => {
            event.stopPropagation();
            editTextNode(nodeId);
        });

        // --- Drag and Drop Handlers ---
        nodeElement.addEventListener('dragstart', (event) => {
            // event.preventDefault(); // Prevent default unless needed
             if (nodeElement.isContentEditable) {
                 event.preventDefault(); // Don't drag while editing
                 return;
             }
            event.stopPropagation();
            isDragging = true;
            draggedNodeId = nodeId;
            nodeElement.classList.add('dragging');

            // Calculate offset from the top-left corner of the node to the mouse pointer
            const rect = nodeElement.getBoundingClientRect();
            // Adjust offset based on container's current pan and scale
            dragOffsetX = (event.clientX / currentScale) - (rect.left / currentScale + panX);
            dragOffsetY = (event.clientY / currentScale) - (rect.top / currentScale + panY);


            // Optional: Use a custom ghost image or hide the default one
            // event.dataTransfer.setData('text/plain', nodeId); // Necessary for Firefox
             // Create a transparent ghost image
             const ghost = nodeElement.cloneNode(true);
             ghost.classList.add('dragging-ghost');
             document.body.appendChild(ghost);
             event.dataTransfer.setDragImage(ghost, 0, 0);
             // Clean up the ghost image after the drag operation ends
             setTimeout(() => document.body.removeChild(ghost), 0);

            event.dataTransfer.effectAllowed = 'move';
        });

        nodeElement.addEventListener('dragend', (event) => {
            event.stopPropagation();
             if (!isDragging || !draggedNodeId) return; // Ensure drag actually started

            const draggedElement = nodes[draggedNodeId]?.element;
             if (draggedElement) {
                draggedElement.classList.remove('dragging');
             }

            isDragging = false;
            draggedNodeId = null;
            // updateAllLines(); // Update lines after drag ends (already done in dragover)
        });

         // Prevent default dragover behavior to allow drop
        nodeElement.addEventListener('dragover', (event) => {
             event.preventDefault();
             event.dataTransfer.dropEffect = 'move'; // Indicate moving is possible
        });

        // Optional: Handle dropping onto another node (for reparenting - more complex)
        nodeElement.addEventListener('drop', (event) => {
            event.preventDefault();
            event.stopPropagation();
            // Implement reparenting logic here if desired
            console.log(`Node ${draggedNodeId} dropped onto ${nodeId}`);
            // Example: changeParent(draggedNodeId, nodeId);
        });

         // Keyboard navigation/actions
         nodeElement.addEventListener('keydown', (event) => {
            if (nodeElement.isContentEditable) return; // Don't interfere with editing

            switch (event.key) {
                case 'Enter': // Edit node on Enter
                     event.preventDefault();
                     editTextNode(nodeId);
                     break;
                 case 'Delete': // Delete node on Delete key
                 case 'Backspace': // Also allow Backspace for deletion
                     event.preventDefault();
                     if (nodes[nodeId]?.parentId) { // Don't delete root node via key
                         deleteNode(nodeId);
                     }
                     break;
                 case 'Insert': // Add child node on Insert key
                 case 'Tab': // Also use Tab to add child
                     event.preventDefault();
                     handleAddChild();
                     break;
                 // Add more keyboard shortcuts (e.g., arrow keys for navigation)
             }
         });
    }

    // --- Container Event Handlers (Panning, Dragging Nodes) ---

    container.addEventListener('dragover', (event) => {
        event.preventDefault(); // MUST prevent default to allow dropping
        if (isDragging && draggedNodeId && nodes[draggedNodeId]) {
            const nodeElement = nodes[draggedNodeId].element;
            // Calculate new position based on mouse coordinates, offset, pan, and scale
            // ClientX/Y are relative to the viewport
            // We need coordinates relative to the container's top-left (0,0)
            const containerRect = container.getBoundingClientRect();

            // Calculate mouse position relative to the container, considering scroll and pan
            let newX = (event.clientX - containerRect.left) / currentScale - panX / currentScale;
            let newY = (event.clientY - containerRect.top) / currentScale - panY / currentScale;


            // Apply the drag offset
            newX -= dragOffsetX;
            newY -= dragOffsetY;


            // Update the node's visual position (important: use px)
            // We position relative to the container's internal coordinate system
            nodeElement.style.left = `${newX + container.offsetWidth / 2}px`; // Adjust relative to center if needed
            nodeElement.style.top = `${newY + container.offsetHeight / 2}px`; // Adjust relative to center if needed


            // Update lines connected to the dragged node in real-time
            updateLines(draggedNodeId);
        }
    });

     container.addEventListener('drop', (event) => {
         event.preventDefault(); // Prevent default drop behavior (e.g., opening file)
         // This handles dropping onto the container background (not onto another node)
         // The dragend event on the node handles cleanup.
         // Position is already set during dragover.
         if (isDragging && draggedNodeId) {
             console.log(`Node ${draggedNodeId} dropped onto container background.`);
             // Potentially save the final position here if needed
         }
     });


    container.addEventListener('click', (event) => {
        // Click on container background deselects any node
        if (event.target === container) {
            selectNode(null);
        }
    });

    // --- Panning Logic ---
    container.addEventListener('mousedown', (event) => {
        // Only pan with left mouse button if not clicking on a node
        if (event.button === 0 && event.target === container) {
            isPanning = true;
            panStartX = event.clientX - panX; // Store initial mouse position relative to current pan
            panStartY = event.clientY - panY;
            container.style.cursor = 'grabbing'; // Change cursor
        }
    });

    container.addEventListener('mousemove', (event) => {
        if (isPanning) {
            // Calculate new pan values based on mouse movement
            panX = event.clientX - panStartX;
            panY = event.clientY - panStartY;
            // Apply the pan transform to the container
            container.style.transform = `translate(${panX}px, ${panY}px) scale(${currentScale})`;
            // Update all lines during panning
            // Debounce or throttle this if performance suffers
             updateAllLines();
        }
    });

    container.addEventListener('mouseup', (event) => {
        if (isPanning) {
            isPanning = false;
            container.style.cursor = 'grab'; // Restore cursor
        }
    });

    container.addEventListener('mouseleave', (event) => {
        // Stop panning if mouse leaves the container while dragging
        if (isPanning) {
            isPanning = false;
            container.style.cursor = 'grab';
        }
    });

    // --- Zooming Logic (Basic Example) ---
    // container.addEventListener('wheel', (event) => {
    //     event.preventDefault(); // Prevent page scroll

    //     const scaleAmount = 0.1;
    //     const containerRect = container.getBoundingClientRect();
    //     // Calculate mouse position relative to the container's top-left corner
    //     const mouseX = event.clientX - containerRect.left;
    //     const mouseY = event.clientY - containerRect.top;

    //     // Determine the direction of scroll
    //     const direction = event.deltaY < 0 ? 1 : -1; // 1 for zoom in, -1 for zoom out

    //     // Calculate the new scale
    //     const newScale = Math.max(0.2, Math.min(3, currentScale + direction * scaleAmount)); // Clamp scale

    //     // Calculate the point to zoom into/out from (relative to container's untransformed origin)
    //     const worldX = (mouseX - panX) / currentScale;
    //     const worldY = (mouseY - panY) / currentScale;

    //     // Calculate the new pan values to keep the mouse point stationary relative to the content
    //     panX = mouseX - worldX * newScale;
    //     panY = mouseY - worldY * newScale;

    //     currentScale = newScale;

    //     // Apply the combined transform
    //     container.style.transformOrigin = `0 0`; // Ensure scaling originates from top-left
    //     container.style.transform = `translate(${panX}px, ${panY}px) scale(${currentScale})`;

    //     // Update all lines after zoom
    //     updateAllLines();
    // });


    // --- Button Click Handlers ---

    function handleAddChild() {
        if (!selectedNodeId || !nodes[selectedNodeId]) return;

        const parentNode = nodes[selectedNodeId];
        const parentElement = parentNode.element;
        const parentRect = parentElement.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        // Calculate position relative to the container's internal coordinate system
        const parentX = parseFloat(parentElement.style.left);
        const parentY = parseFloat(parentElement.style.top);


        // Simple positioning: place new child below the parent
        // Adjust offsets as needed for better layout
        const newX = parentX; // Align horizontally initially
        const newY = parentY + 100; // Place below

        const newNodeId = createNode(selectedNodeId, '新节点', newX, newY);

        // Optional: Implement auto-layout logic here for better positioning
         // autoLayout(selectedNodeId);

         updateLines(selectedNodeId); // Update parent lines
         updateLines(newNodeId); // Update new node's line
         updateAllLines(); // Redraw all lines for good measure

    }

    function handleAddSibling() {
         if (!selectedNodeId || !nodes[selectedNodeId] || !nodes[selectedNodeId].parentId) return; // Must have a parent

         const siblingNode = nodes[selectedNodeId];
         const parentId = siblingNode.parentId;
         const parentNode = nodes[parentId];
         const parentElement = parentNode.element; // Parent element for positioning reference

         // Calculate position relative to the container
         const siblingX = parseFloat(siblingNode.element.style.left);
         const siblingY = parseFloat(siblingNode.element.style.top);

         // Simple positioning: place new sibling next to the selected one
         const newX = siblingX + siblingNode.element.offsetWidth + 30; // Place to the right
         const newY = siblingY; // Align vertically

         const newNodeId = createNode(parentId, '新节点', newX, newY);

         // Optional: Implement auto-layout logic here
         // autoLayout(parentId);

         updateLines(parentId); // Update parent lines
         updateLines(newNodeId); // Update new node's line
         updateAllLines();
    }

    function handleDelete() {
        if (!selectedNodeId || !nodes[selectedNodeId] || !nodes[selectedNodeId].parentId) return; // Cannot delete root
        deleteNode(selectedNodeId);
    }

    addChildBtn.addEventListener('click', handleAddChild);
    addSiblingBtn.addEventListener('click', handleAddSibling);
    deleteNodeBtn.addEventListener('click', handleDelete);

    // --- Auto Layout (Placeholder - Very Basic) ---
    // function autoLayout(startNodeId) {
    //     // This is a very complex topic. A real implementation would involve
    //     // algorithms like Reingold-Tilford or force-directed layouts.
    //     // This placeholder just slightly adjusts direct children.
    //     if (!nodes[startNodeId] || !nodes[startNodeId].childrenIds.length) return;

    //     const children = nodes[startNodeId].childrenIds;
    //     const parentElement = nodes[startNodeId].element;
    //     const parentX = parseFloat(parentElement.style.left);
    //     const parentY = parseFloat(parentElement.style.top);
    //     const spacingY = 80;
    //     const spacingX = 150;
    //     const isRoot = nodes[startNodeId].level === 0;

    //     children.forEach((childId, index) => {
    //         const childElement = nodes[childId].element;
    //         let newX, newY;

    //         if (isRoot) {
    //             // Arrange around root (example: simple horizontal)
    //             const angle = (index / children.length) * 2 * Math.PI;
    //             newX = parentX + Math.cos(angle) * spacingX * 1.5;
    //             newY = parentY + Math.sin(angle) * spacingY * 1.5;

    //         } else {
    //             // Arrange children vertically below parent (simple)
    //             newX = parentX + spacingX; // To the right
    //             newY = parentY + (index - (children.length - 1) / 2) * spacingY; // Spread vertically
    //         }

    //         childElement.style.left = `${newX}px`;
    //         childElement.style.top = `${newY}px`;
    //         updateLines(childId); // Update line for this child
    //         // Recursively layout grandchildren if needed
    //         // autoLayout(childId);
    //     });
    //      updateAllLines(); // Update all lines after layout adjustments
    // }


    // --- Global Event Listeners ---
     window.addEventListener('resize', () => {
        // Adjust layout or redraw lines on window resize if necessary
         updateAllLines();
     });

    // --- Initial Setup ---
    initMindMap();

}); // End DOMContentLoaded
