/**
 * Relational Table Inspector — Live DuckDB State & Table Browser
 *
 * Allows inspecting internal DuckDB tables (`search_tree`, `transposition_table`,
 * `v_board_state`, `raw_moves`, `pst_values`, `game_state`) directly from the UI.
 *
 * Rendered into any container; in the Profiling tab it is hosted inside a
 * slide-over drawer (see QueryInspectorUI.openTablesDrawer) so the inspector is
 * reached contextually from a query or a scan operator rather than a peer tab.
 */

const INSPECTABLE_TABLES = [
    { name: 'v_board_state', label: 'Board State View (v_board_state)', description: 'Current piece bitboards and active king positions' },
    { name: 'piece_bitboards', label: 'Piece Bitboards (piece_bitboards)', description: 'Individual 64-bit masks by piece type' },
    { name: 'game_state', label: 'Game State (game_state)', description: 'Active turn, castling rights, and en-passant square' },
    { name: 'transposition_table', label: 'Transposition Table (transposition_table)', description: 'Cached evaluated positions and best moves' },
    { name: 'pst_values', label: 'Piece-Square Tables (pst_values)', description: 'Precomputed positional score lookup table' },
    { name: 'piece_characteristics', label: 'Piece Characteristics (piece_characteristics)', description: 'Base piece values and color multipliers' },
    { name: 'repetition_history', label: 'Repetition History (repetition_history)', description: 'Board hash occurrences for 3-fold draw detection' },
    { name: 'search_tree', label: 'Search Tree (search_tree)', description: 'Active minimax search tree nodes (during search)' }
];

/**
 * Loads and renders the table inspector container.
 * @param {HTMLElement|string} container - Target DOM container
 * @param {Object} dbEngine - Database engine with query() method
 * @param {string} defaultTable - Initial table to display
 */
export async function renderTableInspector(container, dbEngine, defaultTable = 'v_board_state') {
    const $container = typeof container === 'string' ? $(container) : $(container);
    if ($container.length === 0) return;

    const selectOptions = INSPECTABLE_TABLES.map(t =>
        `<option value="${t.name}" ${t.name === defaultTable ? 'selected' : ''}>${t.label}</option>`
    ).join('');

    const layoutHtml = `<div class="table-inspector-wrapper">
            <div class="table-inspector-toolbar">
                <div class="table-select-group">
                    <label for="table-select">Table:</label>
                    <select class="inspector-table-select">
                        ${selectOptions}
                    </select>
                </div>
                <div class="table-actions-group">
                    <input type="text" class="inspector-filter-input" placeholder="Filter rows..." />
                    <button class="btn-inspector-refresh" title="Refresh Table Data">↻ Refresh</button>
                    <span class="inspector-row-count badge-pill">0 rows</span>
                </div>
            </div>
            <div class="table-inspector-grid-container">
                <div class="inspector-table-loading">Loading table data...</div>
            </div>
        </div>
    `;

    $container.html(layoutHtml);

    // Event handlers
    $container.find('.inspector-table-select').on('change', function () {
        loadAndDisplayTable($container, dbEngine, $(this).val());
    });

    $container.find('.btn-inspector-refresh').on('click', function () {
        const selected = $container.find('.inspector-table-select').val();
        loadAndDisplayTable($container, dbEngine, selected);
    });

    $container.find('.inspector-filter-input').on('input', function () {
        const query = $(this).val().toLowerCase();
        $container.find('.inspector-grid tbody tr').each(function () {
            const text = $(this).text().toLowerCase();
            $(this).toggle(text.includes(query));
        });
    });

    // Initial load
    await loadAndDisplayTable($container, dbEngine, defaultTable);
}

/**
 * Fetches rows from DuckDB and renders the HTML table grid.
 */
async function loadAndDisplayTable($container, dbEngine, tableName) {
    const $grid = $container.find('.table-inspector-grid-container');
    const $rowCount = $container.find('.inspector-row-count');

    if (!dbEngine || typeof dbEngine.query !== 'function') {
        $grid.html('<div class="tool-pane-placeholder">Engine database is not connected.</div>');
        $rowCount.text('0 rows');
        return;
    }

    try {
        $grid.html('<div class="inspector-table-loading">Querying DuckDB table...</div>');
        const query = `SELECT * FROM ${tableName} LIMIT 250;`;
        const rows = await dbEngine.query(query);

        if (!rows || rows.length === 0) {
            $grid.html(`<div class="tool-pane-placeholder">Table <code>${tableName}</code> is currently empty.</div>`);
            $rowCount.text('0 rows');
            return;
        }

        $rowCount.text(`${rows.length} rows`);

        const columns = Object.keys(rows[0]);
        let theadHtml = '<tr>' + columns.map(c => `<th>${escapeHtml(c)}</th>`).join('') + '</tr>';
        
        let tbodyHtml = rows.map(r => {
            const cells = columns.map(col => {
                let val = r[col];
                if (typeof val === 'bigint') val = val.toString();
                else if (val === null || val === undefined) val = '<span class="cell-null">NULL</span>';
                else if (typeof val === 'object') val = JSON.stringify(val);
                else val = escapeHtml(String(val));
                return `<td>${val}</td>`;
            }).join('');
            return `<tr>${cells}</tr>`;
        }).join('');

        const tableHtml = `<table class="inspector-grid">
                <thead>${theadHtml}</thead>
                <tbody>${tbodyHtml}</tbody>
            </table>
        `;

        $grid.html(tableHtml);
    } catch (err) {
        const isNotExisting = err.message && (err.message.includes('does not exist') || err.message.includes('not found'));
        const msg = isNotExisting
            ? `Table <code>${tableName}</code> is only created dynamically during active search execution.`
            : `Error reading table ${tableName}: ${escapeHtml(err.message)}`;
        $grid.html(`<div class="tool-pane-placeholder">${msg}</div>`);
        $rowCount.text('0 rows');
    }
}

/**
 * Selects a table in an already-rendered inspector and loads its rows. Falls
 * back to a full render when the container has no inspector yet. Used by the
 * drawer so that opening a second table (from another scan operator) does not
 * tear down and rebuild the toolbar.
 */
export async function selectTable(container, dbEngine, tableName) {
    const $container = typeof container === 'string' ? $(container) : $(container);
    const $select = $container.find('.inspector-table-select');

    if ($select.length === 0) {
        await renderTableInspector($container, dbEngine, tableName);
        return;
    }

    $select.val(tableName);
    await loadAndDisplayTable($container, dbEngine, tableName);
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"')
        .replace(/'/g, '&#039;');
}
