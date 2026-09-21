/**
 * Relational Query Plan Visualizer — Interactive SVG Operator DAG & Hotspot Analyzer
 *
 * Two composable views over a normalized DuckDB plan tree:
 *   - renderOperatorCostTable(): ranked, scrollable cost-center table (scales to
 *     any plan size) with inline table-inspect links on scan operators.
 *   - renderPlanView(): interactive SVG DAG with zoom/pan, Fit, a "focus cost
 *     center" action, and collapsible subtrees.
 */

// One distinct hue per relational category so operators are easy to tell
// apart in the cost-center table and the plan DAG. Medium-saturation colours
// chosen to stay legible on the light tool theme.
const OPERATOR_CATEGORIES = {
    JOIN: { color: '#7C3AED', bg: 'rgba(124, 58, 237, 0.12)', label: 'Join', icon: '⋈' },
    FILTER: { color: '#EA580C', bg: 'rgba(234, 88, 12, 0.12)', label: 'Filter', icon: 'σ' },
    AGGREGATE: { color: '#DB2777', bg: 'rgba(219, 39, 119, 0.12)', label: 'Aggregate', icon: 'γ' },
    WINDOW: { color: '#0891B2', bg: 'rgba(8, 145, 178, 0.12)', label: 'Window', icon: '⊞' },
    SCAN: { color: '#16A34A', bg: 'rgba(22, 163, 74, 0.12)', label: 'Table Scan', icon: '⌸' },
    PROJECTION: { color: '#2563EB', bg: 'rgba(37, 99, 235, 0.12)', label: 'Projection', icon: 'π' },
    CTE: { color: '#CA8A04', bg: 'rgba(202, 138, 4, 0.12)', label: 'Recursive CTE', icon: '↻' },
    OTHER: { color: '#64748B', bg: 'rgba(100, 116, 139, 0.12)', label: 'Operator', icon: '⚙' }
};

/**
 * Classifies an operator name into its relational algebra category.
 */
function getOperatorCategory(name = '') {
    const upper = name.toUpperCase();
    if (upper.includes('JOIN') || upper.includes('CROSS_PRODUCT')) return OPERATOR_CATEGORIES.JOIN;
    if (upper.includes('FILTER') || upper.includes('LIMIT')) return OPERATOR_CATEGORIES.FILTER;
    if (upper.includes('AGGREGATE') || upper.includes('GROUP_BY')) return OPERATOR_CATEGORIES.AGGREGATE;
    if (upper.includes('WINDOW')) return OPERATOR_CATEGORIES.WINDOW;
    if (upper.includes('SCAN') || upper.includes('READ_')) return OPERATOR_CATEGORIES.SCAN;
    if (upper.includes('PROJECTION') || upper.includes('REORDER')) return OPERATOR_CATEGORIES.PROJECTION;
    if (upper.includes('CTE') || upper.includes('RECURSIVE')) return OPERATOR_CATEGORIES.CTE;
    return OPERATOR_CATEGORIES.OTHER;
}

/**
 * Normalizes DuckDB EXPLAIN / EXPLAIN ANALYZE output into a structured PlanNode tree.
 *
 * Static `EXPLAIN (FORMAT JSON)` returns the physical plan as an array whose
 * first element IS the root operator. `EXPLAIN ANALYZE` (with
 * `PRAGMA enable_profiling='json'`) instead returns a single query-level
 * bookkeeping OBJECT wrapping the real plan under one or two synthetic nodes
 * (an unnamed query root, and an "EXPLAIN_ANALYZE" operator) - those are
 * stripped by unwrapProfilerRoot() so the DAG always starts at the first real
 * physical operator regardless of which EXPLAIN variant produced the data.
 */
export function parseDuckDBPlan(rawResult) {
    if (!rawResult) return null;

    let planData = rawResult;

    if (Array.isArray(rawResult)) {
        const firstRow = rawResult[0];
        if (firstRow && firstRow.explain_value) {
            try {
                planData = JSON.parse(firstRow.explain_value);
            } catch (e) {
                return parseTextExplain(firstRow.explain_value);
            }
        }
    }

    if (Array.isArray(planData)) {
        planData = planData[0];
    }

    if (!planData || typeof planData !== 'object') {
        return null;
    }

    return unwrapProfilerRoot(normalizeNode(planData));
}

/**
 * Strips DuckDB's synthetic EXPLAIN ANALYZE bookkeeping nodes (the unnamed
 * query root and the "EXPLAIN_ANALYZE" pseudo-operator) so the tree starts
 * at the first real physical operator, matching the shape of a static
 * EXPLAIN plan.
 */
function unwrapProfilerRoot(node) {
    let current = node;
    while (
        current &&
        current.children && current.children.length === 1 &&
        (current.name === 'OPERATOR' || current.name === 'EXPLAIN_ANALYZE' || current.name === 'QUERY')
    ) {
        current = current.children[0];
    }
    return current;
}

function normalizeNode(rawNode, depth = 0) {
    const name = rawNode.name || rawNode.operator_name || rawNode.operator_type || 'OPERATOR';
    const cat = getOperatorCategory(name);

    // Extract extra details
    const extra = rawNode.extra_info || {};
    let extraDetails = '';
    if (typeof extra === 'string') {
        extraDetails = extra;
    } else if (typeof extra === 'object') {
        const parts = [];
        for (const [k, v] of Object.entries(extra)) {
            if (v && typeof v === 'string' && v.trim().length > 0) {
                parts.push(`${k}: ${v}`);
            } else if (Array.isArray(v) && v.length > 0) {
                parts.push(`${k}: ${v.join(', ')}`);
            }
        }
        extraDetails = parts.join('\n');
    }

    // Extract timings & cardinality.
    //
    // IMPORTANT: `operator_cardinality` (this operator's OWN reported output
    // row count) is only ever populated for a handful of operator types
    // (mainly leaf scans) in DuckDB's live profiler - it reads as 0 for the
    // vast majority of non-leaf/pipelined operators (PROJECTION, FILTER,
    // HASH_JOIN, WINDOW, UNION, DELIM_JOIN, ...) REGARDLESS of how many rows
    // actually flowed through them or how long they took. This is a general
    // DuckDB profiler characteristic, not specific to any one operator type.
    //
    // `cumulative_cardinality` (rows that have flowed through the pipeline
    // up to and including this point) IS populated at essentially every
    // node, and is what we use as the primary "rows" metric so the UI never
    // has to show a misleading flat "0" for the majority of operators.
    const cardinality = rawNode.cumulative_cardinality ?? rawNode.operator_cardinality ?? (extra['Estimated Cardinality'] ? parseInt(extra['Estimated Cardinality'], 10) : null);
    const timingMs = rawNode.operator_timing ? rawNode.operator_timing * 1000 : (rawNode.cpu_time ? rawNode.cpu_time * 1000 : null);

    const rawChildren = rawNode.children || [];
    const children = rawChildren.map(c => normalizeNode(c, depth + 1));

    return {
        id: `node_${Math.random().toString(36).substr(2, 9)}`,
        name,
        category: cat,
        extraInfo: extraDetails,
        cardinality,
        timingMs,
        depth,
        children
    };
}

function parseTextExplain(text) {
    return {
        id: 'node_text',
        name: 'PHYSICAL_PLAN',
        category: OPERATOR_CATEGORIES.OTHER,
        extraInfo: text,
        cardinality: null,
        timingMs: null,
        depth: 0,
        children: []
    };
}

/**
 * Flattens all operators in the plan tree for ranking and summary tables.
 */
export function flattenOperators(rootNode) {
    const list = [];
    function traverse(node) {
        if (!node) return;
        list.push(node);
        if (node.children) {
            for (const child of node.children) traverse(child);
        }
    }
    traverse(rootNode);
    return list;
}

/**
 * Analyzes operator costs and cardinality hotspots across the query plan.
 *
 * The cost center is the operator with the greatest measured time. Ties are
 * broken by rows flowed and then depth, so the marker lands on the operator
 * doing the most work rather than an arbitrary first match. A hotspot is
 * marked whenever ANY real timing is present (not only when one operator
 * dominates), so the view always has a single, consistent focus target.
 */
export function analyzeOperatorCosts(rootNode) {
    if (!rootNode) return { totalTimingMs: 0, totalOperators: 0, hotspotNode: null, allOperators: [] };

    const allOps = flattenOperators(rootNode);
    let totalTimingMs = 0;
    let hotspotNode = null;

    for (const op of allOps) {
        if (op.timingMs) totalTimingMs += op.timingMs;
    }

    // Only real, measured timing defines a cost center. Without timings there
    // is no hotspot (the view falls back to "Fit" instead of highlighting an
    // arbitrary high-cardinality node).
    if (totalTimingMs > 0) {
        for (const op of allOps) {
            if (op.timingMs > 0) {
                op.costPct = ((op.timingMs / totalTimingMs) * 100).toFixed(1);
                hotspotNode = pickCostlier(hotspotNode, op);
            }
        }
        if (hotspotNode) hotspotNode.isHotspot = true;
    }

    return {
        totalTimingMs,
        totalOperators: allOps.length,
        hotspotNode,
        allOperators: allOps
    };
}

/**
 * Returns whichever of two operators is the more convincing cost center:
 * greater measured time, then greater rows flowed, then greater depth.
 */
function pickCostlier(current, candidate) {
    if (!current) return candidate;
    if (candidate.timingMs !== current.timingMs) return candidate.timingMs > current.timingMs ? candidate : current;

    const candRows = candidate.cardinality || 0;
    const curRows = current.cardinality || 0;
    if (candRows !== curRows) return candRows > curRows ? candidate : current;

    return candidate.depth > current.depth ? candidate : current;
}

/**
 * Extracts the scanned table name from a leaf scan operator, if any. Used to
 * offer an inline "inspect table" link that opens the table inspector drawer.
 */
export function extractTableName(operator) {
    if (!operator) return null;
    const name = (operator.name || '').toUpperCase();
    if (!name.includes('SCAN') && !name.includes('READ_')) return null;
    const match = (operator.extraInfo || '').match(/Table:\s*([A-Za-z_][\w.]*)/i);
    return match ? match[1] : null;
}

/**
 * Renders the ranked, scrollable operator cost-center table. This is the
 * primary detail view because it scales to plans of any size, unlike a DAG.
 *
 * @param {Object} options
 * @param {Function} [options.onInspectTable] - called with a table name when a
 *        scan operator's inline inspect link is clicked.
 */
export function renderOperatorCostTable(container, rootNode, options = {}) {
    const $container = typeof container === 'string' ? $(container) : $(container);
    if (!rootNode) {
        $container.html('<div class="tool-pane-placeholder">No query plan data available.</div>');
        return;
    }

    const analysis = analyzeOperatorCosts(rootNode);
    const hasTimings = analysis.totalTimingMs > 0;

    // Rank by real timing when available, else by data flow volume, else depth.
    const sortedOps = [...analysis.allOperators].sort((a, b) => {
        if (hasTimings && b.timingMs !== null && a.timingMs !== null) return b.timingMs - a.timingMs;
        if (b.cardinality !== null && a.cardinality !== null) return b.cardinality - a.cardinality;
        return a.depth - b.depth;
    });

    const rowsHtml = sortedOps.map((op, idx) => {
        const cat = op.category || OPERATOR_CATEGORIES.OTHER;
        const rowsStr = op.cardinality !== null ? op.cardinality.toLocaleString() : '-';
        const timeStr = op.timingMs !== null ? `${op.timingMs.toFixed(2)}ms` : '-';
        const expr = op.extraInfo ? op.extraInfo.split('\n')[0] : '';
        const isHot = !!op.isHotspot;
        const tableName = extractTableName(op);
        const inspectBtn = tableName
            ? `<button class="btn-inspect-table" data-table="${escapeHtmlAttr(tableName)}" title="Inspect table ${escapeHtmlAttr(tableName)}">🗄 ${escapeHtml(tableName)}</button>`
            : '';

        return `<tr class="plan-table-row ${isHot ? 'hotspot-row' : ''}">
                <td><span class="rank-badge">${idx + 1}</span></td>
                <td>
                    <span class="op-type-pill" style="color: ${cat.color}; background: ${cat.bg}; border: 1px solid ${cat.color}60;">
                        ${cat.icon} ${op.name}
                    </span>
                    ${isHot ? `<span class="hotspot-badge">🔥 (${op.costPct}%)</span>` : ''}
                    ${inspectBtn}
                </td>
                <td class="num-cell" style="color: ${isHot ? '#DC2626' : '#334155'}; font-weight: 700;">${hasTimings ? timeStr : cat.label}</td>
                <td class="num-cell" style="color: #334155;">${rowsStr}</td>
                <td class="expr-cell" title="${escapeHtmlAttr(op.extraInfo || '')}">${escapeHtml(expr)}</td>
            </tr>
        `;
    }).join('');

    const html = `<div class="plan-table-container">
            <table class="inspector-grid plan-ranking-table">
                <thead>
                    <tr>
                        <th style="width: 6%;">#</th>
                        <th style="width: 30%;">Operator</th>
                        <th style="width: 16%;">${hasTimings ? 'Time' : 'Relational Type'}</th>
                        <th style="width: 18%;" title="Cumulative rows that have flowed through the pipeline up to this point. DuckDB's profiler does not report an isolated output row count for most non-leaf operators, so this is the most reliable 'rows' metric available.">Rows Flow</th>
                        <th style="width: 30%;">Expressions / Join Condition</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>`;

    $container.html(html);

    $container.find('.btn-inspect-table').on('click', function (e) {
        e.stopPropagation();
        if (typeof options.onInspectTable === 'function') {
            options.onInspectTable($(this).data('table'));
        }
    });
}

/**
 * True when a node should be treated as a leaf for layout/rendering because it
 * has no children or its subtree is collapsed.
 */
function nodeHasVisibleChildren(node, collapsed) {
    return node.children && node.children.length > 0 && !(collapsed && collapsed.has(node.id));
}

/**
 * Layout calculation for the hierarchical tree, respecting collapsed subtrees
 * (a collapsed node is laid out as a leaf).
 */
function computeTreeLayout(root, collapsed, nodeWidth = 220, nodeHeight = 85, hGap = 40, vGap = 60) {
    let nextX = 0;

    function layoutSubtree(node, depth) {
        node.depth = depth;
        node.y = depth * (nodeHeight + vGap) + 40;

        if (!nodeHasVisibleChildren(node, collapsed)) {
            node.x = nextX;
            nextX += nodeWidth + hGap;
            return;
        }

        let firstChildX = 0;
        let lastChildX = 0;

        for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            layoutSubtree(child, depth + 1);
            if (i === 0) firstChildX = child.x;
            if (i === node.children.length - 1) lastChildX = child.x;
        }

        node.x = (firstChildX + lastChildX) / 2;
    }

    layoutSubtree(root, 0);

    let minX = Infinity;
    let maxX = -Infinity;
    let maxY = 0;

    function scanBounds(node) {
        minX = Math.min(minX, node.x);
        maxX = Math.max(maxX, node.x + nodeWidth);
        maxY = Math.max(maxY, node.y + nodeHeight);
        if (nodeHasVisibleChildren(node, collapsed)) {
            for (const child of node.children) scanBounds(child);
        }
    }

    scanBounds(root);

    const padding = 40;
    const shiftX = padding - minX;

    function applyShift(node) {
        node.x += shiftX;
        if (nodeHasVisibleChildren(node, collapsed)) {
            for (const child of node.children) applyShift(child);
        }
    }

    applyShift(root);

    return {
        width: (maxX - minX) + padding * 2,
        height: maxY + padding * 2,
        nodeWidth,
        nodeHeight
    };
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 50;

/**
 * Renders the interactive SVG operator DAG canvas (no toolbar) and returns a
 * control API so the host can place zoom controls wherever it wants.
 *
 * Zoom/pan is implemented by manipulating the SVG viewBox (rather than a CSS
 * transform), which keeps pixel-to-plan-unit conversion straightforward for
 * drag panning and lets "Fit"/"focus cost center" position content reliably.
 *
 * On render the view auto-focuses the cost center (the most expensive
 * operator) at a zoom that makes its node readable, since real plans are
 * often far too large to read at 100%.
 *
 * Collapsed subtree state is stored on the container element so it survives
 * the re-render triggered when a subtree is collapsed or expanded.
 *
 * @returns {{ zoomIn: Function, zoomOut: Function, fit: Function, focusHotspot: Function }}
 */
export function renderPlanView(container, rootNode, options = {}) {
    const $container = typeof container === 'string' ? $(container) : $(container);
    if (!rootNode) {
        $container.html('<div class="tool-pane-placeholder">No query plan data available.</div>');
        return null;
    }

    const collapsed = $container.data('collapsedNodes') || new Set();
    $container.data('collapsedNodes', collapsed);

    const costAnalysis = analyzeOperatorCosts(rootNode);
    const { width, height, nodeWidth, nodeHeight } = computeTreeLayout(rootNode, collapsed);

    let linksSvg = '';
    let nodesSvg = '';

    function renderBranch(node) {
        const cat = node.category || OPERATOR_CATEGORIES.OTHER;
        const x = node.x;
        const y = node.y;
        const isHotspot = !!node.isHotspot;
        const strokeColor = isHotspot ? '#DC2626' : cat.color;
        const isCollapsed = collapsed.has(node.id);
        const hasChildren = node.children && node.children.length > 0;

        if (nodeHasVisibleChildren(node, collapsed)) {
            for (const child of node.children) {
                const startX = x + nodeWidth / 2;
                const startY = y + nodeHeight;
                const endX = child.x + nodeWidth / 2;
                const endY = child.y;
                const midY = (startY + endY) / 2;

                const pathData = `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
                linksSvg += `<path d="${pathData}" class="plan-edge" stroke="#CBD5E1" stroke-width="2" fill="none" stroke-dasharray="${child.category === OPERATOR_CATEGORIES.JOIN ? '4,3' : 'none'}" />
                    <circle cx="${endX}" cy="${endY}" r="3.5" fill="#94A3B8" />
                `;
                renderBranch(child);
            }
        }

        const timingText = node.timingMs !== null ? `${node.timingMs < 1 ? (node.timingMs * 1000).toFixed(0) + 'µs' : node.timingMs.toFixed(2) + 'ms'}` : '';
        const rowsText = node.cardinality !== null ? `${node.cardinality.toLocaleString()} rows` : '';
        const metaText = [timingText, rowsText].filter(Boolean).join(' • ');
        const extraPreview = node.extraInfo ? node.extraInfo.split('\n')[0].substring(0, 30) + (node.extraInfo.length > 30 ? '...' : '') : '';

        nodesSvg += `<g class="plan-node-group" id="${node.id}" data-node-id="${node.id}" transform="translate(${x}, ${y})" style="cursor: pointer;">
                <rect width="${nodeWidth}" height="${nodeHeight}" rx="6" ry="6"
                      fill="#FFFFFF" stroke="${strokeColor}" stroke-width="${isHotspot ? '2.5' : '1.5'}"
                      class="plan-node-box ${isHotspot ? 'hotspot' : ''}" />
                
                <rect x="0" y="0" width="${nodeWidth}" height="24" rx="6" ry="6" fill="${isHotspot ? 'rgba(220, 38, 38, 0.15)' : cat.bg}" />
                <rect x="0" y="16" width="${nodeWidth}" height="8" fill="${isHotspot ? 'rgba(220, 38, 38, 0.15)' : cat.bg}" />
                
                <text x="10" y="16" fill="${strokeColor}" font-size="11" font-weight="bold" font-family="monospace">
                    ${cat.icon} ${node.name} ${isHotspot ? '🔥' : ''}
                </text>

                <text x="10" y="44" fill="#334155" font-size="11" font-weight="600" font-family="system-ui, sans-serif">
                    ${metaText || cat.label} ${node.costPct ? `(${node.costPct}%)` : ''}
                </text>

                <text x="10" y="66" fill="#64748B" font-size="9.5" font-family="monospace">
                    ${escapeHtml(extraPreview)}
                </text>

                ${hasChildren ? `<g class="plan-node-collapse-toggle" data-node-id="${node.id}" transform="translate(${nodeWidth / 2}, ${nodeHeight})" style="cursor: pointer;">
                    <circle r="9" fill="#FFFFFF" stroke="${strokeColor}" stroke-width="1.5" />
                    <text text-anchor="middle" y="3.5" fill="${strokeColor}" font-size="11" font-weight="bold" font-family="monospace">${isCollapsed ? '+' : '−'}</text>
                </g>` : ''}
            </g>
        `;
    }

    renderBranch(rootNode);

    const fullLayoutHtml = `<div class="plan-view-container">
            <div class="plan-canvas-viewport">
                <svg class="plan-dag-svg" width="100%" height="100%" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
                    <g class="plan-zoom-layer">
                        <g class="plan-links-layer">${linksSvg}</g>
                        <g class="plan-nodes-layer">${nodesSvg}</g>
                    </g>
                </svg>
            </div>

            <div class="plan-node-details-drawer" style="display: none;">
                <div class="drawer-header">
                    <span class="drawer-title">Operator Details</span>
                    <button class="btn-close-drawer">✕</button>
                </div>
                <pre class="drawer-content"></pre>
            </div>
        </div>
    `;

    $container.html(fullLayoutHtml);

    const allOps = costAnalysis.allOperators;
    const $svg = $container.find('.plan-dag-svg');
    const $viewport = $container.find('.plan-canvas-viewport');

    // Node click -> show expression drawer
    $container.find('.plan-node-group').on('click', function (e) {
        if ($(e.target).closest('.plan-node-collapse-toggle').length) return;
        const nodeId = $(this).data('node-id');
        const op = allOps.find(o => o.id === nodeId);
        if (op) {
            const $drawer = $container.find('.plan-node-details-drawer');
            $drawer.find('.drawer-title').text(`${op.name} (${op.category?.label || 'Operator'})`);
            $drawer.find('.drawer-content').text(op.extraInfo || 'No additional condition expressions.');
            $drawer.slideDown(120);
        }
    });

    $container.find('.btn-close-drawer').on('click', () => {
        $container.find('.plan-node-details-drawer').slideUp(100);
    });

    // Collapse / expand a subtree, then re-render in place.
    $container.find('.plan-node-collapse-toggle').on('click', function (e) {
        e.stopPropagation();
        const nodeId = $(this).data('node-id');
        if (collapsed.has(nodeId)) collapsed.delete(nodeId); else collapsed.add(nodeId);
        renderPlanView($container, rootNode, options);
    });

    // Zoom & pan via viewBox manipulation.
    let currentZoom = 1.0;
    let vbX = 0;
    let vbY = 0;

    function clampPan() {
        const vbW = width / currentZoom;
        const vbH = height / currentZoom;
        vbX = Math.max(0, Math.min(Math.max(0, width - vbW), vbX));
        vbY = Math.max(0, Math.min(Math.max(0, height - vbH), vbY));
    }

    function applyViewBox() {
        const vbW = width / currentZoom;
        const vbH = height / currentZoom;
        $svg.attr('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`);
        if (typeof options.onZoomChange === 'function') options.onZoomChange(currentZoom);
    }

    function zoomAround(scale, centerX, centerY) {
        const oldW = width / currentZoom;
        const oldH = height / currentZoom;
        const cx = centerX !== undefined ? centerX : vbX + oldW / 2;
        const cy = centerY !== undefined ? centerY : vbY + oldH / 2;

        currentZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale));
        const newW = width / currentZoom;
        const newH = height / currentZoom;
        vbX = cx - newW / 2;
        vbY = cy - newH / 2;
        clampPan();
        applyViewBox();
        return currentZoom;
    }

    /**
     * Centers on the cost center at a zoom that makes its node readable on
     * screen, regardless of how large the overall plan is.
     */
    function focusHotspot() {
        const hot = costAnalysis.hotspotNode;
        if (!hot || hot.x === undefined) return fit();

        const vw = $viewport.width() || 600;
        const desiredNodePx = Math.min(vw * 0.6, 260);
        const z = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, (desiredNodePx * width) / (nodeWidth * vw)));

        currentZoom = z;
        const vbW = width / currentZoom;
        const vbH = height / currentZoom;
        vbX = hot.x + nodeWidth / 2 - vbW / 2;
        vbY = hot.y + nodeHeight / 2 - vbH / 2;
        clampPan();
        applyViewBox();
        return currentZoom;
    }

    /**
     * Fits the whole plan when it is small enough to read; otherwise falls
     * back to focusing the cost center so the view is never a blank, tiny
     * speck.
     */
    function fit() {
        const vw = $viewport.width() || width;
        const vh = $viewport.height() || height;
        const z = Math.min(vw / width, vh / height);
        if (z < MIN_ZOOM) return focusHotspot();

        currentZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
        vbX = (width - width / currentZoom) / 2;
        vbY = (height - height / currentZoom) / 2;
        clampPan();
        applyViewBox();
        return currentZoom;
    }

    // Drag to pan. Namespaced document listeners are cleared first so that
    // re-renders (e.g. after collapsing a subtree) don't stack handlers.
    $(document).off('.planPan');
    let dragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let vbStartX = 0;
    let vbStartY = 0;

    $svg.on('mousedown', (e) => {
        dragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        vbStartX = vbX;
        vbStartY = vbY;
        $svg.css('cursor', 'grabbing');
        e.preventDefault();
    });

    $(document).on('mousemove.planPan', (e) => {
        if (!dragging) return;
        const vbW = width / currentZoom;
        const scale = vbW / ($svg.width() || 1);
        vbX = vbStartX - (e.clientX - dragStartX) * scale;
        vbY = vbStartY - (e.clientY - dragStartY) * scale;
        clampPan();
        applyViewBox();
    });

    $(document).on('mouseup.planPan', () => {
        if (!dragging) return;
        dragging = false;
        $svg.css('cursor', 'grab');
    });

    const api = {
        // Multiplicative steps so zooming stays usable across the wide range
        // needed for very large plans.
        zoomIn: () => zoomAround(currentZoom * 1.5),
        zoomOut: () => zoomAround(currentZoom / 1.5),
        fit,
        focusHotspot
    };

    // Auto-focus the cost center so large plans are readable immediately.
    focusHotspot();

    $container.data('planApi', api);
    return api;
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"')
        .replace(/'/g, '&#039;');
}

function escapeHtmlAttr(str) {
    return escapeHtml(str).replace(/"/g, '"');
}
