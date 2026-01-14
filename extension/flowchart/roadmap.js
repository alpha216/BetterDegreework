let nodeIdCounter = 0;
let globalClassInfo = {};
let takenCourses = new Set();

async function loadRoadmap() {
    // Check if data is sent via postMessage
    if (window.__dw_flowchart_data) {
        const data = window.__dw_flowchart_data;
        globalClassInfo = data.classInfo || {};
        collectTakenCourses(data.classes);
        renderRoadmap(data.classes, data.classInfo);
        setupPopup();
        return;
    }
    try {
        const response = await fetch('dw.json');
        const data = await response.json();
        globalClassInfo = data.classInfo || {};
        collectTakenCourses(data.classes);
        renderRoadmap(data.classes, data.classInfo);
        setupPopup();
    } catch (error) {
        document.getElementById('sections-container').innerHTML = 
            '<div class="loading">Error loading roadmap data</div>';
        console.error('Error loading roadmap:', error);
    }
}

// Listen for data sent from extension content script
window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'DW_FLOWCHART_DATA') {
        window.__dw_flowchart_data = event.data.classinfo;
        loadRoadmap();
    }
});

function collectTakenCourses(classes) {
    function traverse(obj) {
        if (!obj || typeof obj !== 'object') return;
        if (obj.taken) {
            obj.taken.forEach(c => takenCourses.add(c));
        }
        for (const key in obj) {
            traverse(obj[key]);
        }
    }
    traverse(classes);
}

function setupPopup() {
    const overlay = document.getElementById('popup-overlay');
    const closeBtn = document.getElementById('popup-close');

    closeBtn.addEventListener('click', () => {
        overlay.classList.remove('active');
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.classList.remove('active');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            overlay.classList.remove('active');
        }
    });
}

function showCoursePopup(courseCode) {
    const info = globalClassInfo[courseCode];
    const overlay = document.getElementById('popup-overlay');
    const codeEl = document.getElementById('popup-code');
    const titleEl = document.getElementById('popup-title');
    const prereqList = document.getElementById('prereq-list');

    codeEl.textContent = courseCode;
    titleEl.textContent = info ? info.name : 'Course information not available';
    prereqList.innerHTML = '';

    if (info && info.prerequisites) {
        // Handle new array format: [[OR group], [OR group], ...] with AND between groups
        if (Array.isArray(info.prerequisites)) {
            if (info.prerequisites.length === 0) {
                prereqList.innerHTML = '<li class="no-prereqs">No prerequisites required</li>';
            } else {
                info.prerequisites.forEach((orGroup, groupIndex) => {
                    // Add AND separator between groups
                    if (groupIndex > 0) {
                        const andSeparator = document.createElement('li');
                        andSeparator.className = 'prereq-separator';
                        andSeparator.innerHTML = '<span class="separator-text">AND</span>';
                        prereqList.appendChild(andSeparator);
                    }

                    // Create OR group container
                    const groupContainer = document.createElement('li');
                    groupContainer.className = 'prereq-group';
                    
                    orGroup.forEach((prereqObj, idx) => {
                        const prereqCode = Object.keys(prereqObj)[0];
                        const data = prereqObj[prereqCode];
                        const isTaken = takenCourses.has(prereqCode);
                        
                        const prereqInfo = globalClassInfo[prereqCode];
                        const prereqName = prereqInfo ? prereqInfo.name : '';

                        const prereqItem = document.createElement('div');
                        prereqItem.className = `prereq-item ${isTaken ? 'prereq-taken' : ''}`;
                        prereqItem.innerHTML = `
                            <span class="prereq-code">${prereqCode}</span>
                            ${prereqName ? `<span style="flex:1;color:#666;font-size:11px">${prereqName}</span>` : ''}
                            ${data.minimumGrade ? `<span class="prereq-grade">Min: ${data.minimumGrade}</span>` : ''}
                        `;
                        groupContainer.appendChild(prereqItem);

                        // Add OR separator within group
                        if (idx < orGroup.length - 1) {
                            const orSeparator = document.createElement('div');
                            orSeparator.className = 'or-separator';
                            orSeparator.textContent = 'OR';
                            groupContainer.appendChild(orSeparator);
                        }
                    });

                    prereqList.appendChild(groupContainer);
                });
            }
        } else {
            // Handle old object format for backward compatibility
            const prereqs = Object.entries(info.prerequisites).filter(([code]) => code !== '');
            
            if (prereqs.length === 0) {
                prereqList.innerHTML = '<li class="no-prereqs">No prerequisites required</li>';
            } else {
                prereqs.forEach(([prereqCode, data]) => {
                    const li = document.createElement('li');
                    const isTaken = takenCourses.has(prereqCode);
                    li.className = `prereq-item ${isTaken ? 'prereq-taken' : ''}`;
                    
                    const prereqInfo = globalClassInfo[prereqCode];
                    const prereqName = prereqInfo ? prereqInfo.name : '';
                    
                    li.innerHTML = `
                        <span class="prereq-code">${prereqCode}</span>
                        ${prereqName ? `<span style="flex:1;color:#666;font-size:11px">${prereqName}</span>` : ''}
                        ${data.minimumGrade ? `<span class="prereq-grade">Min: ${data.minimumGrade}</span>` : ''}
                    `;
                    prereqList.appendChild(li);
                });
            }
        }
    } else {
        prereqList.innerHTML = '<li class="no-prereqs">No prerequisite information available</li>';
    }

    overlay.classList.add('active');
}

function processNode(obj, title, classInfo) {
    if (obj === null) return null;
    if (typeof obj !== 'object') return null;

    const id = nodeIdCounter++;

    // Leaf node with courses
    if (obj.taken || obj.available) {
        return {
            id,
            title: title,
            taken: obj.taken || [],
            available: obj.available || [],
            children: []
        };
    }

    const keys = Object.keys(obj).filter(k => obj[k] !== null);
    
    // Single child - merge titles
    if (keys.length === 1) {
        const childKey = keys[0];
        const childObj = obj[childKey];
        
        if (childObj && typeof childObj === 'object' && !childObj.taken && !childObj.available) {
            const mergedTitle = title ? `${title}\n${childKey}` : childKey;
            return processNode(childObj, mergedTitle, classInfo);
        } else {
            const mergedTitle = title ? `${title}\n${childKey}` : childKey;
            const child = processNode(childObj, '', classInfo);
            if (child) {
                child.title = mergedTitle;
                return child;
            }
            return {
                id,
                title: mergedTitle,
                taken: childObj?.taken || [],
                available: childObj?.available || [],
                children: []
            };
        }
    }

    // Multiple children
    const children = [];
    for (const key of keys) {
        const child = processNode(obj[key], key, classInfo);
        if (child) children.push(child);
    }

    return {
        id,
        title: title,
        taken: [],
        available: [],
        children
    };
}

function getCourseName(code, classInfo) {
    return classInfo && classInfo[code] ? classInfo[code].name : '';
}

// Get all prerequisite codes for a course (flattened from all OR groups)
function getPrerequisiteCodes(courseCode) {
    const info = globalClassInfo[courseCode];
    if (!info || !info.prerequisites || !Array.isArray(info.prerequisites)) return [];
    
    const prereqCodes = [];
    info.prerequisites.forEach(orGroup => {
        orGroup.forEach(prereqObj => {
            const code = Object.keys(prereqObj)[0];
            if (code) prereqCodes.push(code);
        });
    });
    return prereqCodes;
}

// Check if a node is a category block (has children or multiple courses with a title)
function isCategoryBlock(node) {
    if (!node) return false;
    // It's a category if it has children (nested structure)
    if (node.children && node.children.length > 0) return true;
    // It's a category if it has multiple courses with a title (like "Select 9 Hours...")
    if (node.title && (node.taken.length + node.available.length) > 1) return true;
    return false;
}

// Check if a node is a leaf course (single course, no children)
function isLeafCourse(node) {
    if (!node) return false;
    const courseCount = (node.taken?.length || 0) + (node.available?.length || 0);
    return courseCount === 1 && (!node.children || node.children.length === 0);
}

// Get the course code from a leaf node
function getLeafCourseCode(node) {
    if (node.taken && node.taken.length > 0) return node.taken[0];
    if (node.available && node.available.length > 0) return node.available[0];
    return null;
}

// Reorganize a category block that has multiple courses in taken/available arrays
// Converts them to child nodes and applies prerequisite chaining
function reorganizeCategoryWithMultipleCourses(categoryNode) {
    const allCodes = [...(categoryNode.taken || []), ...(categoryNode.available || [])];
    const takenSet = new Set(categoryNode.taken || []);
    
    // Convert each course to a leaf node
    const courseNodes = allCodes.map(code => ({
        id: nodeIdCounter++,
        title: '',
        taken: takenSet.has(code) ? [code] : [],
        available: takenSet.has(code) ? [] : [code],
        children: []
    }));
    
    // Build prerequisite tree for these courses
    const courseCodes = new Set(allCodes);
    const nodeMap = new Map();
    
    courseNodes.forEach(node => {
        const code = getLeafCourseCode(node);
        if (code) {
            nodeMap.set(code, {
                node: node,
                children: [],
                hasParent: false
            });
        }
    });
    
    // For each course, find if any prerequisite exists in this category
    courseNodes.forEach(courseNode => {
        const code = getLeafCourseCode(courseNode);
        if (!code) return;
        
        const prereqs = getPrerequisiteCodes(code);
        
        // Find the first prerequisite that exists in this category
        for (const prereqCode of prereqs) {
            if (courseCodes.has(prereqCode) && prereqCode !== code) {
                const parentEntry = nodeMap.get(prereqCode);
                const childEntry = nodeMap.get(code);
                if (parentEntry && childEntry && !childEntry.hasParent) {
                    parentEntry.children.push(childEntry);
                    childEntry.hasParent = true;
                    break;
                }
            }
        }
    });
    
    // Build tree structure
    function buildNodeTree(entry) {
        const node = { ...entry.node };
        if (entry.children.length > 0) {
            node.children = entry.children.map(childEntry => buildNodeTree(childEntry));
        }
        return node;
    }
    
    // Get root nodes
    const rootNodes = [];
    nodeMap.forEach(entry => {
        if (!entry.hasParent) {
            rootNodes.push(buildNodeTree(entry));
        }
    });
    
    // Return category with reorganized children, clearing taken/available
    return {
        id: categoryNode.id,
        title: categoryNode.title,
        taken: [],
        available: [],
        children: rootNodes
    };
}

// Reorganize children by prerequisites while preserving category blocks
function reorganizeChildrenByPrereqs(children) {
    if (!children || children.length === 0) return children;
    
    // Separate leaf courses from category blocks
    const leafCourses = [];
    const categoryBlocks = [];
    
    children.forEach(child => {
        if (isCategoryBlock(child)) {
            // Check if this category has multiple courses in taken/available (not children)
            const hasMultipleCourses = (child.taken.length + child.available.length) > 1;
            
            if (hasMultipleCourses && child.children.length === 0) {
                // Convert courses in taken/available to children and reorganize them
                const reorganizedCategory = reorganizeCategoryWithMultipleCourses(child);
                categoryBlocks.push(reorganizedCategory);
            } else {
                // Recursively reorganize within category blocks that have children
                const reorganizedCategory = {
                    ...child,
                    children: reorganizeChildrenByPrereqs(child.children)
                };
                categoryBlocks.push(reorganizedCategory);
            }
        } else if (isLeafCourse(child)) {
            leafCourses.push(child);
        } else {
            // Unknown type, keep as category
            categoryBlocks.push(child);
        }
    });
    
    // Build prerequisite tree for leaf courses only
    const courseCodes = new Set(leafCourses.map(node => getLeafCourseCode(node)).filter(c => c));
    const nodeMap = new Map();
    
    leafCourses.forEach(node => {
        const code = getLeafCourseCode(node);
        if (code) {
            nodeMap.set(code, {
                node: node,
                children: [],
                hasParent: false
            });
        }
    });
    
    // For each leaf course, find if any prerequisite exists in this group
    leafCourses.forEach(leafNode => {
        const code = getLeafCourseCode(leafNode);
        if (!code) return;
        
        const prereqs = getPrerequisiteCodes(code);
        
        // Find the first prerequisite that exists in this group
        for (const prereqCode of prereqs) {
            if (courseCodes.has(prereqCode) && prereqCode !== code) {
                const parentEntry = nodeMap.get(prereqCode);
                const childEntry = nodeMap.get(code);
                if (parentEntry && childEntry && !childEntry.hasParent) {
                    parentEntry.children.push(childEntry);
                    childEntry.hasParent = true;
                    break; // Only attach to first matching prereq
                }
            }
        }
    });
    
    // Convert back to node format, building the tree structure
    function buildNodeTree(entry) {
        const node = { ...entry.node };
        if (entry.children.length > 0) {
            node.children = entry.children.map(childEntry => buildNodeTree(childEntry));
        }
        return node;
    }
    
    // Get root nodes (courses without parents in this group)
    const rootNodes = [];
    nodeMap.forEach(entry => {
        if (!entry.hasParent) {
            rootNodes.push(buildNodeTree(entry));
        }
    });
    
    // Return reorganized leaf courses followed by category blocks
    return [...rootNodes, ...categoryBlocks];
}

// Check if prerequisites are satisfied for a course
function arePrerequisitesMet(courseCode) {
    const info = globalClassInfo[courseCode];
    if (!info || !info.prerequisites) return true; // No prerequisites = can take
    
    // Handle array format: [[OR group], [OR group], ...] with AND between groups
    if (Array.isArray(info.prerequisites)) {
        if (info.prerequisites.length === 0) return true;
        
        // All AND groups must be satisfied
        return info.prerequisites.every(orGroup => {
            // At least one course in the OR group must be taken
            return orGroup.some(prereqObj => {
                const prereqCode = Object.keys(prereqObj)[0];
                return takenCourses.has(prereqCode);
            });
        });
    } else {
        // Handle old object format
        const prereqs = Object.keys(info.prerequisites).filter(code => code !== '');
        if (prereqs.length === 0) return true;
        return prereqs.every(prereqCode => takenCourses.has(prereqCode));
    }
}

// Get node class based on status
function getNodeClass(code, isTaken) {
    if (isTaken) return 'node-taken';
    if (arePrerequisitesMet(code)) return 'node-available';
    return 'node-locked';
}

// Create tooltip element for a course
function createTooltip(courseCode) {
    const info = globalClassInfo[courseCode];
    const tooltip = document.createElement('div');
    tooltip.className = 'course-tooltip';
    
    // Title
    const title = document.createElement('div');
    title.className = 'tooltip-title';
    title.textContent = info ? info.name : courseCode;
    tooltip.appendChild(title);
    
    // Prerequisites section
    const prereqTitle = document.createElement('div');
    prereqTitle.className = 'tooltip-prereqs-title';
    prereqTitle.textContent = 'Prerequisites';
    tooltip.appendChild(prereqTitle);
    
    if (info && info.prerequisites && Array.isArray(info.prerequisites) && info.prerequisites.length > 0) {
        info.prerequisites.forEach((orGroup, groupIndex) => {
            // Add AND separator between groups
            if (groupIndex > 0) {
                const andSep = document.createElement('div');
                andSep.className = 'tooltip-and-separator';
                andSep.textContent = 'AND';
                tooltip.appendChild(andSep);
            }
            
            orGroup.forEach((prereqObj, idx) => {
                const prereqCode = Object.keys(prereqObj)[0];
                if (!prereqCode) return;
                
                const isTaken = takenCourses.has(prereqCode);
                const prereqInfo = globalClassInfo[prereqCode];
                
                const item = document.createElement('div');
                item.className = `tooltip-prereq-item ${isTaken ? 'taken' : 'not-taken'}`;
                item.textContent = `${prereqCode}${prereqInfo ? ' - ' + prereqInfo.name : ''}`;
                tooltip.appendChild(item);
                
                // Add OR text if not last in group
                if (idx < orGroup.length - 1) {
                    const orText = document.createElement('div');
                    orText.className = 'tooltip-or-text';
                    orText.textContent = 'or';
                    tooltip.appendChild(orText);
                }
            });
        });
    } else {
        const noPrereqs = document.createElement('div');
        noPrereqs.className = 'tooltip-no-prereqs';
        noPrereqs.textContent = 'No prerequisites required';
        tooltip.appendChild(noPrereqs);
    }
    
    return tooltip;
}

// Add hover tooltip to a node content element
function addTooltipListeners(contentEl, courseCode) {
    let tooltip = null;
    let hideTimeout = null;
    
    contentEl.addEventListener('mouseenter', () => {
        clearTimeout(hideTimeout);
        if (!tooltip) {
            tooltip = createTooltip(courseCode);
            contentEl.appendChild(tooltip);
        }
        tooltip.classList.add('visible');
    });
    
    contentEl.addEventListener('mouseleave', () => {
        hideTimeout = setTimeout(() => {
            if (tooltip) {
                tooltip.classList.remove('visible');
            }
        }, 100);
    });
}

function createNodeElement(node, classInfo, parentId = null) {
    const container = document.createElement('div');
    container.className = 'horizontal-group';

    const nodeDiv = document.createElement('div');
    nodeDiv.className = 'node';
    nodeDiv.dataset.nodeId = node.id;
    if (parentId !== null) nodeDiv.dataset.parentId = parentId;

    const content = document.createElement('div');
    
    // Determine node type and create content
    if (node.taken.length > 0 || node.available.length > 0) {
        const allCodes = [...node.taken, ...node.available];
        const isTaken = node.taken.length > 0;
        
        // Check if multiple courses - split into parent label + child courses
        if (allCodes.length > 1 && node.title) {
            // Create a section/label node for the title
            content.className = 'node-content node-section';
            const parts = node.title.split('\n');
            const titleSpan = document.createElement('span');
            titleSpan.className = 'node-code';
            titleSpan.textContent = parts[parts.length - 1];
            content.appendChild(titleSpan);
            
            if (parts.length > 1) {
                const subtitleSpan = document.createElement('span');
                subtitleSpan.className = 'node-name';
                subtitleSpan.textContent = parts.slice(0, -1).join(' > ');
                content.appendChild(subtitleSpan);
            }

            nodeDiv.appendChild(content);
            container.appendChild(nodeDiv);

            // Create children container for individual courses
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'children-container';
            
            allCodes.forEach(code => {
                const courseIsTaken = node.taken.includes(code);
                const childContainer = document.createElement('div');
                childContainer.className = 'horizontal-group';

                const childNodeDiv = document.createElement('div');
                childNodeDiv.className = 'node';
                childNodeDiv.dataset.nodeId = nodeIdCounter++;
                childNodeDiv.dataset.parentId = node.id;

                const childContent = document.createElement('div');
                childContent.className = `node-content clickable ${getNodeClass(code, courseIsTaken)}`;
                childContent.dataset.courseCodes = code;

                const codeSpan = document.createElement('span');
                codeSpan.className = 'node-code';
                codeSpan.textContent = code;
                childContent.appendChild(codeSpan);

                const courseName = getCourseName(code, classInfo);
                if (courseName) {
                    const nameSpan = document.createElement('span');
                    nameSpan.className = 'node-name';
                    nameSpan.textContent = courseName;
                    childContent.appendChild(nameSpan);
                }

                childContent.addEventListener('click', () => {
                    showCoursePopup(code);
                });

                // Add hover tooltip
                addTooltipListeners(childContent, code);

                childNodeDiv.appendChild(childContent);
                childContainer.appendChild(childNodeDiv);
                childrenContainer.appendChild(childContainer);
            });

            container.appendChild(childrenContainer);
            return container;
        }
        
        // Single course - display normally
        const singleCode = allCodes[0];
        content.className = `node-content clickable ${getNodeClass(singleCode, isTaken)}`;
        
        // Store course codes for click handler
        content.dataset.courseCodes = allCodes.join(',');
        
        const codeSpan = document.createElement('span');
        codeSpan.className = 'node-code';
        codeSpan.textContent = allCodes.join(', ');
        content.appendChild(codeSpan);

        let displayName = '';
        if (node.title) {
            displayName = node.title.split('\n').pop(); // Get last part of merged title
        } else {
            displayName = getCourseName(allCodes[0], classInfo);
        }
        
        if (displayName) {
            const nameSpan = document.createElement('span');
            nameSpan.className = 'node-name';
            nameSpan.textContent = displayName;
            content.appendChild(nameSpan);
        }

        // Add click handler
        content.addEventListener('click', () => {
            showCoursePopup(allCodes[0]);
        });

        // Add hover tooltip
        addTooltipListeners(content, allCodes[0]);
    } else {
        content.className = 'node-content node-section';
        const parts = node.title.split('\n');
        const titleSpan = document.createElement('span');
        titleSpan.className = 'node-code';
        titleSpan.textContent = parts[parts.length - 1]; // Show last merged part as main
        content.appendChild(titleSpan);
        
        if (parts.length > 1) {
            const subtitleSpan = document.createElement('span');
            subtitleSpan.className = 'node-name';
            subtitleSpan.textContent = parts.slice(0, -1).join(' > ');
            content.appendChild(subtitleSpan);
        }
    }

    nodeDiv.appendChild(content);
    container.appendChild(nodeDiv);

    // Add children
    if (node.children.length > 0) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'children-container';
        
        node.children.forEach(child => {
            const childEl = createNodeElement(child, classInfo, node.id);
            childrenContainer.appendChild(childEl);
        });
        
        container.appendChild(childrenContainer);
    }

    return container;
}

function renderRoadmap(classes, classInfo) {
    const container = document.getElementById('sections-container');
    container.innerHTML = '';

    for (const [sectionName, sectionData] of Object.entries(classes)) {
        if (sectionData === null) continue;

        const section = document.createElement('div');
        section.className = 'section';

        const row = document.createElement('div');
        row.className = 'section-row';

        // Section root
        const rootDiv = document.createElement('div');
        rootDiv.className = 'section-root';
        const rootTitle = document.createElement('div');
        rootTitle.className = 'section-title';
        rootTitle.textContent = sectionName;
        rootTitle.dataset.nodeId = nodeIdCounter++;
        rootDiv.appendChild(rootTitle);

        // Process and render branches
        const processed = processNode(sectionData, '', classInfo);
        // Reorganize by prerequisites while preserving category blocks
        if (processed && processed.children.length > 0) {
            processed.children = reorganizeChildrenByPrereqs(processed.children);
        }

        let branchContainer = null;
        let hasChildren = processed && processed.children.length > 0;
        if (hasChildren) {
            branchContainer = document.createElement('div');
            branchContainer.className = 'branch-container';
            processed.children.forEach(child => {
                const childEl = createNodeElement(child, classInfo, rootTitle.dataset.nodeId);
                branchContainer.appendChild(childEl);
            });
            row.appendChild(branchContainer);
        } else if (processed && (processed.taken.length > 0 || processed.available.length > 0)) {
            branchContainer = document.createElement('div');
            branchContainer.className = 'branch-container';
            const childEl = createNodeElement(processed, classInfo, rootTitle.dataset.nodeId);
            branchContainer.appendChild(childEl);
            row.appendChild(branchContainer);
        }

        // Center the rootDiv vertically relative to the branchContainer
        // Only if there are children (branchContainer exists)
        if (branchContainer) {
            // Use flexbox for row
            row.style.display = 'flex';
            row.style.alignItems = 'flex-start';
            // rootDiv should not stretch
            rootDiv.style.display = 'flex';
            rootDiv.style.flexDirection = 'column';
            rootDiv.style.justifyContent = 'flex-start';
            // After branchContainer is rendered, center rootDiv
            setTimeout(() => {
                const branchRect = branchContainer.getBoundingClientRect();
                const rowRect = row.getBoundingClientRect();
                const rootRect = rootDiv.getBoundingClientRect();
                // Calculate offset to center rootDiv vertically to branchContainer
                const branchHeight = branchRect.height;
                const rootHeight = rootRect.height;
                // The offset needed to center rootDiv
                let offset = branchRect.top - rowRect.top + (branchHeight - rootHeight) / 2;
                if (offset < 0) offset = 0;
                rootDiv.style.marginTop = offset + 'px';
            }, 0);
        }

        row.insertBefore(rootDiv, row.firstChild);
        section.appendChild(row);
        container.appendChild(section);
    }

    // Draw connections after DOM is ready
    requestAnimationFrame(() => {
        requestAnimationFrame(drawConnections);
    });
}

function drawConnections() {
    const svg = document.getElementById('connections-svg');
    const container = document.getElementById('roadmap-container');
    
    svg.setAttribute('width', container.scrollWidth);
    svg.setAttribute('height', container.scrollHeight);
    svg.innerHTML = '';

    // Find all nodes with parents
    const nodes = document.querySelectorAll('[data-parent-id]');
    
    nodes.forEach(node => {
        const parentId = node.dataset.parentId;
        if (!parentId) return;

        const parent = document.querySelector(`[data-node-id="${parentId}"]`);
        if (!parent) return;

        const parentRect = parent.getBoundingClientRect();
        const nodeRect = node.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        // Calculate positions relative to container
        const x1 = parentRect.right - containerRect.left;
        const y1 = parentRect.top + parentRect.height / 2 - containerRect.top;
        const x2 = nodeRect.left - containerRect.left;
        const y2 = nodeRect.top + nodeRect.height / 2 - containerRect.top;

        // Create curved bezier path
        const controlX1 = x1 + (x2 - x1) * 0.4;
        const controlX2 = x1 + (x2 - x1) * 0.6;
        
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const d = `M ${x1} ${y1} C ${controlX1} ${y1}, ${controlX2} ${y2}, ${x2} ${y2}`;
        
        path.setAttribute('d', d);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#ccc');
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('stroke-linecap', 'round');
        
        svg.appendChild(path);
    });
}

// Redraw on resize
window.addEventListener('resize', () => {
    requestAnimationFrame(drawConnections);
});

// window.addEventListener('DOMContentLoaded', loadRoadmap);
