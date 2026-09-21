/**
 * Quack-Mate Deep DuckDB Profiler
 *
 * Runs known chess positions (benchmark suite or custom FEN) through full DuckDB
 * native profiling (detailed physical operator timings, EXPLAIN ANALYZE DAG,
 * cardinalities, rows scanned, optimizer overhead) WITHOUT modifying any engine code.
 *
 * Usage:
 *   node benchmarks/profile_duckdb.js [options]
 *
 * Examples:
 *   node benchmarks/profile_duckdb.js --depth=3
 *   node benchmarks/profile_duckdb.js --position=kiwipete --depth=4
 *   node benchmarks/profile_duckdb.js --fen="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1" --depth=3
 *   node benchmarks/profile_duckdb.js --all --depth=3 --threads=4
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { EngineInstance } from '../src/quackmate-node.js';
import { DEFAULT_OPTIONS } from '../src/quackmate-common.js';
import { classifyQuery, PHASES } from '../src/quackmate-telemetry.js';

const BENCHMARK_POSITIONS = [
    {
        id: 'start',
        name: 'Perft Pos 1 (StartPos)',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
    },
    {
        id: 'midgame',
        name: 'Perft Pos 2 (Complex Midgame)',
        fen: 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10'
    },
    {
        id: 'kiwipete',
        name: 'Perft Pos 3 (KiwiPete Tactics)',
        fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1'
    },
    {
        id: 'endgame',
        name: 'Perft Pos 4 (Endgame)',
        fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1'
    }
];

function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        depth: 3,
        threads: DEFAULT_OPTIONS.maxThreads || 4,
        position: 'kiwipete',
        fen: null,
        strategy: 'batched_pvs',
        topQueries: 10,
        topOperators: 10,
        showTree: false,
        jsonOut: null,
        help: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '-h' || arg === '--help') {
            options.help = true;
        } else if (arg.startsWith('--depth=')) {
            options.depth = parseInt(arg.split('=')[1], 10);
        } else if (arg === '--depth' && i + 1 < args.length) {
            options.depth = parseInt(args[++i], 10);
        } else if (arg.startsWith('--threads=')) {
            options.threads = parseInt(arg.split('=')[1], 10);
        } else if (arg === '--threads' && i + 1 < args.length) {
            options.threads = parseInt(args[++i], 10);
        } else if (arg.startsWith('--position=')) {
            options.position = arg.split('=')[1].toLowerCase();
        } else if (arg === '--position' && i + 1 < args.length) {
            options.position = args[++i].toLowerCase();
        } else if (arg.startsWith('--fen=')) {
            options.fen = arg.split('=')[1];
        } else if (arg === '--fen' && i + 1 < args.length) {
            options.fen = args[++i];
        } else if (arg.startsWith('--strategy=')) {
            options.strategy = arg.split('=')[1];
        } else if (arg === '--all') {
            options.position = 'all';
        } else if (arg === '--tree' || arg === '--show-tree') {
            options.showTree = true;
        } else if (arg.startsWith('--json=')) {
            options.jsonOut = arg.split('=')[1];
        }
    }

    return options;
}

function showHelp() {
    console.log(`
Quack-Mate DuckDB Deep Profiler
===============================
Runs search positions with full native DuckDB execution profiling (physical operator
timings, DAG traversal, rows scanned, optimizer overhead) and pinpoints top bottlenecks.

Options:
  -h, --help            Show this help message
  --depth <n>           Search depth (default: 3)
  --threads <n>         DuckDB database threads (default: 4)
  --position <name>     Position name: 'all', 'start', 'midgame', 'kiwipete', 'endgame' (default: 'kiwipete')
  --fen <fen_string>    Custom FEN to profile
  --strategy <strat>    Search strategy: 'batched_pvs' (default) or 'recursive'
  --show-tree           Display the physical operator tree of the #1 slowest query
  --json <path>         Dump full profile data into a JSON file

Examples:
  node benchmarks/profile_duckdb.js --depth=3
  node benchmarks/profile_duckdb.js --position=all --depth=3
  node benchmarks/profile_duckdb.js --position=kiwipete --depth=4 --show-tree
`);
}

/**
 * Normalizes and extracts physical operators recursively from DuckDB's profiling JSON.
 */
function walkOperatorTree(node, onOperator, parent = null, depth = 0) {
    if (!node) return;

    const opName = node.operator_name || node.operator_type || node.name;
    const isSynthetic = opName === 'QUERY' || opName === 'EXPLAIN_ANALYZE' || opName === 'ROOT' || !opName;

    if (!isSynthetic) {
        const timeMs = (node.operator_timing || 0) * 1000;
        const rows = node.operator_cardinality !== undefined ? node.operator_cardinality : (node.cumulative_cardinality || 0);
        const rowsScanned = node.operator_rows_scanned || 0;
        const extraInfo = node.extra_info || {};

        onOperator({
            name: opName,
            timeMs,
            rows,
            rowsScanned,
            extraInfo,
            depth,
            parent
        });
    }

    if (Array.isArray(node.children)) {
        for (const child of node.children) {
            walkOperatorTree(child, onOperator, isSynthetic ? parent : opName, isSynthetic ? depth : depth + 1);
        }
    }
}

/**
 * Profiles a single chess position using DuckDB native JSON profiling.
 */
async function profilePosition(pos, config) {
    const engine = new EngineInstance();
    await engine.init();

    const tmpProfFile = path.join(os.tmpdir(), `duckdb_prof_${Date.now()}_${Math.random().toString(36).substring(2)}.json`);

    await engine.connection.runAndReadAll("PRAGMA enable_profiling='json'");
    await engine.connection.runAndReadAll("PRAGMA profiling_mode='detailed'");
    await engine.connection.runAndReadAll(`PRAGMA profiling_output='${tmpProfFile.replace(/'/g, "''")}'`);

    const queryRecords = [];
    const operatorMap = new Map(); // opName -> { count, totalTimeMs, totalRows, totalScanned, extraInfoSamples: [] }
    let totalOptimizerMs = 0;
    let totalCpuMs = 0;
    let totalPlannerMs = 0;
    let totalWallMs = 0;

    // Non-intrusively wrap engine.query to capture DuckDB profile after every executed statement
    const originalQuery = engine.query.bind(engine);
    engine.query = async function (sql, meta = {}) {
        const stmts = (sql || '').split(';').map(s => s.trim()).filter(s => s.length > 0);
        let lastResult = [];

        for (const stmt of stmts) {
            const t0 = performance.now();
            const reader = await engine.connection.runAndReadAll(stmt);
            const wallDuration = performance.now() - t0;

            const cols = reader.columnNames();
            const rows = reader.getRows().map(r => {
                const obj = {};
                for (let i = 0; i < cols.length; i++) obj[cols[i]] = r[i];
                return obj;
            });
            lastResult = rows;

            if (fs.existsSync(tmpProfFile)) {
                try {
                    const profRaw = fs.readFileSync(tmpProfFile, 'utf8');
                    const prof = JSON.parse(profRaw);

                    const qCpuMs = (prof.cpu_time || 0) * 1000;
                    const qLatencyMs = (prof.latency || 0) * 1000;
                    const qOptMs = (prof.cumulative_optimizer_timing || 0) * 1000;
                    const qPlanMs = (prof.planner || 0) * 1000 + (prof.physical_planner || 0) * 1000;

                    totalCpuMs += qCpuMs;
                    totalOptimizerMs += qOptMs;
                    totalPlannerMs += qPlanMs;
                    totalWallMs += wallDuration;

                    const classification = classifyQuery(stmt, meta);

                    const record = {
                        sql: stmt,
                        wallMs: wallDuration,
                        cpuMs: qCpuMs,
                        latencyMs: qLatencyMs,
                        optimizerMs: qOptMs,
                        plannerMs: qPlanMs,
                        phase: classification.phase,
                        title: classification.title,
                        templateKey: classification.templateKey,
                        profile: prof
                    };
                    queryRecords.push(record);

                    walkOperatorTree(prof, (op) => {
                        if (!operatorMap.has(op.name)) {
                            operatorMap.set(op.name, {
                                name: op.name,
                                count: 0,
                                totalTimeMs: 0,
                                totalRows: 0,
                                totalScanned: 0,
                                maxTimeMs: 0,
                                samples: []
                            });
                        }
                        const entry = operatorMap.get(op.name);
                        entry.count++;
                        entry.totalTimeMs += op.timeMs;
                        entry.totalRows += op.rows;
                        entry.totalScanned += op.rowsScanned;
                        if (op.timeMs > entry.maxTimeMs) {
                            entry.maxTimeMs = op.timeMs;
                        }
                        if (entry.samples.length < 3 && Object.keys(op.extraInfo).length > 0) {
                            entry.samples.push(op.extraInfo);
                        }
                    });
                } catch (err) {
                    // Ignore JSON read races
                }
            }
        }
        return lastResult;
    };

    const searchStart = performance.now();
    const result = await engine.find_best_move(pos.fen, {
        maxDepth: config.depth,
        maxThreads: config.threads,
        strategy: config.strategy,
        useAlphaBeta: true
    });
    const totalSearchTime = performance.now() - searchStart;

    // Cleanup temp profile file
    try {
        if (fs.existsSync(tmpProfFile)) fs.unlinkSync(tmpProfFile);
    } catch (e) { /* ignore */ }
    engine.close();

    return {
        position: pos,
        result,
        totalSearchTime,
        totalWallMs,
        totalCpuMs,
        totalOptimizerMs,
        totalPlannerMs,
        queryRecords,
        operators: Array.from(operatorMap.values())
    };
}

function formatTable(headers, rows) {
    const colWidths = headers.map((h, colIdx) => {
        let maxW = h.length;
        for (const row of rows) {
            const cell = String(row[colIdx] ?? '');
            if (cell.length > maxW) maxW = cell.length;
        }
        return maxW;
    });

    const headerLine = '│ ' + headers.map((h, i) => h.padEnd(colWidths[i])).join(' │ ') + ' │';
    const sepLine = '├─' + colWidths.map(w => '─'.repeat(w)).join('─┼─') + '─┤';
    const topBorder = '┌─' + colWidths.map(w => '─'.repeat(w)).join('─┬─') + '─┐';
    const botBorder = '└─' + colWidths.map(w => '─'.repeat(w)).join('─┴─') + '─┘';

    const bodyLines = rows.map(row => {
        return '│ ' + row.map((cell, i) => {
            const s = String(cell ?? '');
            // Right-align numbers, left-align text
            const isNum = /^[0-9.,%+\-ms\s]+$/.test(s) && !s.includes(' ') || s.endsWith('ms') || s.endsWith('%');
            return isNum ? s.padStart(colWidths[i]) : s.padEnd(colWidths[i]);
        }).join(' │ ') + ' │';
    });

    return [topBorder, headerLine, sepLine, ...bodyLines, botBorder].join('\n');
}

function printTree(node, depth = 0) {
    const pad = '  '.repeat(depth);
    const name = node.operator_name || node.operator_type || node.name || 'QUERY';
    const timing = node.operator_timing ? `${(node.operator_timing * 1000).toFixed(2)}ms` : '';
    const card = node.operator_cardinality !== undefined ? `rows: ${node.operator_cardinality.toLocaleString()}` : '';
    const scan = node.operator_rows_scanned ? `scanned: ${node.operator_rows_scanned.toLocaleString()}` : '';
    const extraParts = [];
    if (node.extra_info) {
        if (node.extra_info.Table) extraParts.push(`tbl: ${node.extra_info.Table}`);
        if (node.extra_info.Filters) extraParts.push(`filter: ${node.extra_info.Filters}`);
        if (node.extra_info.Aggregates) extraParts.push(`agg: ${node.extra_info.Aggregates}`);
    }
    const extraStr = extraParts.length > 0 ? `[${extraParts.join(' | ')}]` : '';

    console.log(`${pad}├── \x1b[36m${name}\x1b[0m ${timing ? `\x1b[33m(${timing})\x1b[0m` : ''} ${card} ${scan} \x1b[90m${extraStr}\x1b[0m`);

    if (Array.isArray(node.children)) {
        for (const child of node.children) {
            printTree(child, depth + 1);
        }
    }
}

function analyzeReport(profileData, config) {
    const { position, result, totalSearchTime, totalWallMs, totalCpuMs, totalOptimizerMs, totalPlannerMs, queryRecords, operators } = profileData;

    console.log(`\n================================================================================`);
    console.log(`🎯 DUCKDB PROFILE REPORT: ${position.name} (Depth ${config.depth})`);
    console.log(`================================================================================`);
    console.log(`FEN        : ${position.fen}`);
    console.log(`Best Move  : ${result.move ? `${result.move.from}${result.move.to}` : (result.reason || 'none')} | Eval Score: ${result.score} | Nodes Searched: ${result.nodes?.toLocaleString() || 'N/A'}`);
    console.log(`Total Wall : ${Math.round(totalSearchTime)} ms | Total Queries Profiled: ${queryRecords.length}`);
    console.log(`Time Split : Total Operator CPU: ${totalCpuMs.toFixed(1)}ms | Optimizer: ${totalOptimizerMs.toFixed(1)}ms | Planner: ${totalPlannerMs.toFixed(1)}ms`);

    // -------------------------------------------------------------------------
    // 1. TOP PHYSICAL OPERATORS
    // -------------------------------------------------------------------------
    console.log(`\n📊 1. TOP PHYSICAL OPERATORS (BY TOTAL CPU TIME)`);
    console.log(`--------------------------------------------------------------------------------`);
    const sortedOps = [...operators].sort((a, b) => b.totalTimeMs - a.totalTimeMs);
    const opHeaders = ['Physical Operator', 'Total CPU (ms)', '% CPU', 'Calls', 'Avg (ms)', 'Max (ms)', 'Rows Out', 'Rows Scanned'];
    const opRows = sortedOps.slice(0, config.topOperators).map(op => {
        const pct = totalCpuMs > 0 ? ((op.totalTimeMs / totalCpuMs) * 100).toFixed(1) + '%' : '0.0%';
        const avg = op.count > 0 ? (op.totalTimeMs / op.count).toFixed(3) : '0';
        return [
            op.name,
            op.totalTimeMs.toFixed(2) + ' ms',
            pct,
            op.count.toLocaleString(),
            avg + ' ms',
            op.maxTimeMs.toFixed(2) + ' ms',
            op.totalRows.toLocaleString(),
            op.totalScanned.toLocaleString()
        ];
    });
    console.log(formatTable(opHeaders, opRows));

    // -------------------------------------------------------------------------
    // 2. ENGINE PHASE BREAKDOWN
    // -------------------------------------------------------------------------
    console.log(`\n🏛️  2. ENGINE PHASE BREAKDOWN`);
    console.log(`--------------------------------------------------------------------------------`);
    const phaseMap = new Map();
    for (const q of queryRecords) {
        if (!phaseMap.has(q.phase)) {
            phaseMap.set(q.phase, { phase: q.phase, cpuMs: 0, wallMs: 0, queries: 0, optMs: 0 });
        }
        const p = phaseMap.get(q.phase);
        p.cpuMs += q.cpuMs;
        p.wallMs += q.wallMs;
        p.optMs += q.optimizerMs;
        p.queries++;
    }
    const sortedPhases = Array.from(phaseMap.values()).sort((a, b) => b.cpuMs - a.cpuMs);
    const phaseHeaders = ['Search Phase', 'CPU Time (ms)', '% CPU', 'Wall Time (ms)', 'Queries', 'Optimizer (ms)'];
    const phaseRows = sortedPhases.map(p => {
        const pct = totalCpuMs > 0 ? ((p.cpuMs / totalCpuMs) * 100).toFixed(1) + '%' : '0.0%';
        return [
            p.phase,
            p.cpuMs.toFixed(2) + ' ms',
            pct,
            p.wallMs.toFixed(2) + ' ms',
            p.queries.toLocaleString(),
            p.optMs.toFixed(2) + ' ms'
        ];
    });
    console.log(formatTable(phaseHeaders, phaseRows));

    // -------------------------------------------------------------------------
    // 3. TOP SQL QUERY TEMPLATES
    // -------------------------------------------------------------------------
    console.log(`\n🔍 3. TOP SQL QUERY TEMPLATES (BY CUMULATIVE CPU TIME)`);
    console.log(`--------------------------------------------------------------------------------`);
    const templateMap = new Map();
    for (const q of queryRecords) {
        const key = `${q.phase}::${q.title}`;
        if (!templateMap.has(key)) {
            templateMap.set(key, { phase: q.phase, title: q.title, cpuMs: 0, wallMs: 0, calls: 0, optMs: 0, sampleSql: q.sql, sampleProfile: q.profile });
        }
        const t = templateMap.get(key);
        t.cpuMs += q.cpuMs;
        t.wallMs += q.wallMs;
        t.optMs += q.optimizerMs;
        t.calls++;
    }
    const sortedTemplates = Array.from(templateMap.values()).sort((a, b) => b.cpuMs - a.cpuMs);
    const templateHeaders = ['Phase', 'Query Component', 'Total CPU (ms)', '% CPU', 'Calls', 'Avg CPU', 'Wall (ms)'];
    const templateRows = sortedTemplates.slice(0, config.topQueries).map(t => {
        const pct = totalCpuMs > 0 ? ((t.cpuMs / totalCpuMs) * 100).toFixed(1) + '%' : '0.0%';
        const avg = t.calls > 0 ? (t.cpuMs / t.calls).toFixed(2) : '0';
        return [
            t.phase,
            t.title,
            t.cpuMs.toFixed(2) + ' ms',
            pct,
            t.calls.toLocaleString(),
            avg + ' ms',
            t.wallMs.toFixed(2) + ' ms'
        ];
    });
    console.log(formatTable(templateHeaders, templateRows));

    // -------------------------------------------------------------------------
    // 4. TOP BOTTLENECK & TAKEAWAYS
    // -------------------------------------------------------------------------
    const topOp = sortedOps[0];
    const topPhase = sortedPhases[0];
    const topTpl = sortedTemplates[0];

    console.log(`\n💡 4. PERFORMANCE BOTTLENECK PINPOINT`);
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`📌 Primary Physical Operator Bottleneck : \x1b[31m${topOp ? topOp.name : 'N/A'}\x1b[0m`);
    if (topOp) {
        const opPct = totalCpuMs > 0 ? ((topOp.totalTimeMs / totalCpuMs) * 100).toFixed(1) : 0;
        console.log(`   - Consumes \x1b[1m${topOp.totalTimeMs.toFixed(2)} ms (${opPct}% of total CPU)\x1b[0m across ${topOp.count} invocations`);
        console.log(`   - Produced ${topOp.totalRows.toLocaleString()} rows, scanned ${topOp.totalScanned.toLocaleString()} rows`);
    }

    console.log(`📌 Primary SQL Query Bottleneck          : \x1b[31m${topTpl ? `${topTpl.title} (${topTpl.phase})` : 'N/A'}\x1b[0m`);
    if (topTpl) {
        const tplPct = totalCpuMs > 0 ? ((topTpl.cpuMs / totalCpuMs) * 100).toFixed(1) : 0;
        console.log(`   - Consumes \x1b[1m${topTpl.cpuMs.toFixed(2)} ms (${tplPct}% of total CPU)\x1b[0m across ${topTpl.calls} queries`);
    }

    console.log(`📌 Primary Search Phase Bottleneck       : \x1b[31m${topPhase ? topPhase.phase : 'N/A'}\x1b[0m`);
    if (topPhase) {
        const phasePct = totalCpuMs > 0 ? ((topPhase.cpuMs / totalCpuMs) * 100).toFixed(1) : 0;
        console.log(`   - Accounts for \x1b[1m${topPhase.cpuMs.toFixed(2)} ms (${phasePct}% of total engine computation)\x1b[0m`);
    }

    // Optional physical plan DAG for slowest query
    if (config.showTree && topTpl && topTpl.sampleProfile) {
        console.log(`\n🌲 PHYSICAL OPERATOR DAG FOR SLOWEST QUERY (${topTpl.title}):`);
        console.log(`--------------------------------------------------------------------------------`);
        printTree(topTpl.sampleProfile);
    }
}

async function main() {
    const config = parseArgs();
    if (config.help) {
        showHelp();
        process.exit(0);
    }

    let positionsToRun = [];
    if (config.fen) {
        positionsToRun = [{ id: 'custom', name: 'Custom FEN Position', fen: config.fen }];
    } else if (config.position === 'all') {
        positionsToRun = BENCHMARK_POSITIONS;
    } else {
        const matched = BENCHMARK_POSITIONS.find(p => p.id === config.position || p.name.toLowerCase().includes(config.position));
        if (matched) {
            positionsToRun = [matched];
        } else {
            console.error(`Unknown position '${config.position}'. Available: 'all', 'start', 'midgame', 'kiwipete', 'endgame'`);
            process.exit(1);
        }
    }

    console.log(`\n🦆 Quack-Mate DuckDB Profiling Suite`);
    console.log(`Configurations: Depth=${config.depth}, Threads=${config.threads}, Strategy=${config.strategy}`);
    console.log(`Positions to profile: ${positionsToRun.map(p => p.name).join(', ')}`);

    const allReports = [];
    for (const pos of positionsToRun) {
        console.log(`\n⏳ Profiling ${pos.name}...`);
        const report = await profilePosition(pos, config);
        analyzeReport(report, config);
        allReports.push(report);
    }

    if (config.jsonOut) {
        fs.writeFileSync(config.jsonOut, JSON.stringify(allReports, (key, value) => {
            if (typeof value === 'bigint') return value.toString();
            return value;
        }, 2));
        console.log(`\n💾 Saved detailed JSON profile to: ${config.jsonOut}`);
    }

    console.log(`\n✅ Profiling complete.`);
}

main().catch(err => {
    console.error('Fatal Profiler Error:', err);
    process.exit(1);
});
