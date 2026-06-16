import fs from 'fs';
import path from 'path';
import { EngineInstance } from '../src/quackmate-node.js';
import { getRecursiveSearchQuery } from '../src/sql/search.js';
import { getInitSchemaSQL, getPopulateBoardStateTableSQL } from '../src/sql/schema.js';

const TARGET_DIR = '.';

async function main() {
    console.log('=== Preparing Standalone Recursive CTE Engine ===');
    
    if (!fs.existsSync(TARGET_DIR)) {
        fs.mkdirSync(TARGET_DIR, { recursive: true });
        console.log(`Created directory: ${TARGET_DIR}`);
    }

    // Initialize in-memory engine to populate tables
    console.log('Initializing temporary DuckDB database to extract precomputed tables...');
    const nodeInstance = new EngineInstance();
    await nodeInstance.init();

    // Helper to extract table rows and construct SQL INSERT statements
    async function dumpTable(tableName, columns = null) {
        const selectCols = columns ? columns.join(', ') : '*';
        const rows = await nodeInstance.query(`SELECT ${selectCols} FROM ${tableName};`);
        
        if (rows.length === 0) return `-- Table ${tableName} is empty\n`;
        
        const colNames = Object.keys(rows[0]);
        const insertHeader = `INSERT INTO ${tableName} (${colNames.join(', ')}) VALUES\n`;
        
        const valueRows = rows.map(row => {
            const vals = colNames.map(col => {
                const val = row[col];
                if (val === null) return 'NULL';
                if (typeof val === 'bigint') return val.toString();
                if (typeof val === 'number') return val.toString();
                if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
                return `'${val.toString()}'`;
            });
            return `    (${vals.join(', ')})`;
        });

        return `${insertHeader}${valueRows.join(',\n')};\n\n`;
    }

    // Generate schema.sql
    console.log('Generating schema.sql...');
    let schemaSQL = '';

    schemaSQL += `-- =========================================================\n`;
    schemaSQL += `-- MINIMAL STANDALONE SCHEMA FOR RECURSIVE CTE ENGINE\n`;
    schemaSQL += `-- =========================================================\n\n`;

    const KEEP_TABLES = [
        'piece_bitboards',
        'piece_masks',
        'game_state',
        'v_board_state',
        'pst_values',
        'zobrist_constants',
        'zobrist_misc',
        'squares',
        'seq_search_tree_id',
        'mobility_precomputed',
        'attacks_precomputed'
    ];

    const rawSchema = getInitSchemaSQL();
    const statements = rawSchema.split(';').map(q => q.trim()).filter(q => q.length > 0);

    for (const stmt of statements) {
        const matchesKeep = KEEP_TABLES.some(table => {
            const regex = new RegExp(`\\b${table}\\b`, 'i');
            return regex.test(stmt);
        });
        if (matchesKeep) {
            schemaSQL += stmt + ';\n\n';
        }
    }

    // Dump precomputed tables into INSERT statements
    schemaSQL += `-- =========================================================\n`;
    schemaSQL += `-- GENERATED PRECOMPUTED TABLES\n`;
    schemaSQL += `-- =========================================================\n\n`;
    schemaSQL += await dumpTable('mobility_precomputed');
    schemaSQL += await dumpTable('attacks_precomputed');

    // Add board state population helper dynamically
    schemaSQL += `-- =========================================================\n`;
    schemaSQL += `-- BOARD STATE POPULATION HELPER\n`;
    schemaSQL += `-- =========================================================\n\n`;
    schemaSQL += getPopulateBoardStateTableSQL().trim() + ';\n';

    fs.writeFileSync(path.join(TARGET_DIR, 'schema.sql'), schemaSQL);
    console.log(`Wrote schema.sql successfully (size: ${Math.round(schemaSQL.length / 1024)} KB)`);

    // Generate turn-agnostic query.sql (Unified for White & Black)
    console.log('Generating query.sql...');
    // We generate query for depth 3.
    let baseQuery = getRecursiveSearchQuery(3, true);

    // Replace the hardcoded DESC/ASC sorts with a dynamic CASE WHEN turn logic
    const turnOrderReplacement = `(CASE WHEN (SELECT active_turn FROM game_state LIMIT 1) = 1 THEN -m.minimax_eval ELSE m.minimax_eval END) ASC, (CASE WHEN (SELECT active_turn FROM game_state LIMIT 1) = 1 THEN -st.static_eval ELSE st.static_eval END) ASC`;
    baseQuery = baseQuery.replace(/ORDER BY m\.minimax_eval DESC, st\.static_eval DESC/g, `ORDER BY ${turnOrderReplacement}`);

    fs.writeFileSync(path.join(TARGET_DIR, 'query.sql'), baseQuery);
    console.log('Wrote query.sql successfully');
}

main().catch(console.error);
