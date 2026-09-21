/**
 * Node.js native entry point for the Quack-Mate chess engine.
 * Wraps the DuckDB engine logic inside an EngineInstance class that
 * manages a persistent DuckDB connection, runs queries, and exposes
 * methods like find_best_move, try_apply_move, and check_end_game.
 * Also provides a standalone init() function and getVersion() for
 * the HTTP server (utils/server.js).
 */

import { DuckDBInstance } from '@duckdb/node-api';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    populatePstValues,
    populateAttacksPrecomputed,
    populateMobilityPrecomputed,
    populateZobristTables,
    find_best_move as find_best_move_logic,
    try_apply_move as try_apply_move_logic,
    check_end_game as check_end_game_logic,
    get_legal_move_count as get_legal_move_count_logic
} from './quackmate.js';

import {
    getInitSchemaSQL,
    getClearSearchSQL,
    getInitSearchTablesSQL
} from './sql/schema.js';
import { telemetry, profileBatch, splitStatements } from './quackmate-telemetry.js';

let queryLogger = null;

export class EngineInstance {
    constructor(playerColor = 'white') {
        this.db = null;
        this.connection = null;
        this.queryLogger = null;
        this.playerColor = playerColor;
    }

    setQueryLogger(logger) {
        this.queryLogger = logger;
    }

    async query(sql, meta = {}) {
        const startTime = performance.now();
        if (this.queryLogger) {
            this.queryLogger(sql);
        }
        if (queryLogger) {
            queryLogger(sql);
        }

        const color = this.playerColor || 'white';
        let columns, rows;

        if (telemetry.isProfilingEnabled(color)) {
            // Real, on-demand profiling: run every individual statement in
            // this (possibly multi-statement) batch EXACTLY as written - no
            // duplication, no query rewriting - capturing its REAL,
            // single-execution profile. This is deliberately opt-in (see
            // telemetry.setProfilingEnabled()) since it adds per-statement
            // PRAGMA + file I/O overhead.
            ({ columns, rows } = await this._runWithRealProfiling(sql, color));
        } else {
            const reader = await this.connection.runAndReadAll(sql);
            columns = reader.columnNames();
            rows = reader.getRows();
        }

        const durationMs = performance.now() - startTime;
        const rowCount = rows.length;
        telemetry.recordQuery(color, sql, durationMs, rowCount, meta);
        return rows.map(row => {
            const obj = {};
            for (let i = 0; i < columns.length; i++) {
                obj[columns[i]] = row[i];
            }
            return obj;
        });
    }

    /**
     * Executes every statement in `sql` (split, unmodified) one at a time,
     * capturing each one's REAL, single-execution DuckDB profile via
     * `PRAGMA profiling_output` + a temp file read - exactly the technique
     * benchmarks/profile_duckdb.js uses. No statement is ever re-run or
     * rewritten, so this is 100% accurate (unlike wrapping a duplicated
     * `EXPLAIN ANALYZE` around an extracted fragment).
     *
     * The splitting/collection/recording itself lives in the shared
     * `profileBatch()` orchestrator; this method only adapts it to the native
     * driver (set the output path, execute, read the temp file).
     *
     * Returns `{ columns, rows }` from the LAST statement, matching the
     * existing multi-statement calling convention (callers of a batched
     * INSERT ... RETURNING rely on the final statement's result rows).
     */
    async _runWithRealProfiling(sql, color) {
        const statements = splitStatements(sql);
        if (statements.length === 0) {
            return { columns: [], rows: [] };
        }

        let lastColumns = [];
        let lastRows = [];

        try {
            await this.connection.runAndReadAll("PRAGMA enable_profiling='json';");
            await this.connection.runAndReadAll("PRAGMA profiling_mode='detailed';");

            await profileBatch(sql, color, async (stmt) => {
                // A FRESH output path per statement: a statement that emits no
                // profile (e.g. DROP) must not inherit the previous statement's
                // file, which would otherwise duplicate its timings onto the
                // wrong step.
                const outFile = path.join(os.tmpdir(), `quackmate_prof_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2)}_${stmt.index}.json`);
                try {
                    await this.connection.runAndReadAll(`PRAGMA profiling_output='${outFile.replace(/'/g, "''")}';`);

                    const reader = await this.connection.runAndReadAll(stmt.stmtSql);
                    lastColumns = reader.columnNames();
                    lastRows = reader.getRows();

                    if (fs.existsSync(outFile)) {
                        return fs.readFileSync(outFile, 'utf8');
                    }
                    return null;
                } finally {
                    try { if (fs.existsSync(outFile)) fs.unlinkSync(outFile); } catch (e) { /* ignore */ }
                }
            });
        } finally {
            try { await this.connection.runAndReadAll('PRAGMA disable_profiling;'); } catch (e) { /* ignore */ }
        }

        return { columns: lastColumns, rows: lastRows };
    }

    async init() {
        this.db = await DuckDBInstance.create(':memory:');
        this.connection = await this.db.connect();

        await this.query(getInitSchemaSQL());
        await this.query(getInitSearchTablesSQL());
        await populatePstValues(this);
        await populateAttacksPrecomputed(this);
        await populateMobilityPrecomputed(this);
        // Zobrist tables are now synchronously fully populated by getInitSchemaSQL, avoiding Math.random() mismatches

        return this;
    }

    async resetGame() {
        const clearSQL = getClearSearchSQL();
        const queries = clearSQL.split(';').map(q => q.trim()).filter(q => q.length > 0);
        for (const q of queries) {
            await this.query(q);
        }
    }

    async find_best_move(fromFEN, options, traceCallback = null) {
        this.playerColor = (fromFEN && fromFEN.split(' ')[1] === 'w') ? 'white' : 'black';
        const result = await find_best_move_logic(this, fromFEN, options);
        if (traceCallback) {
            await traceCallback(this);
        }
        return result;
    }

    async try_apply_move(fromFEN, fromPos, toPos, promotion = 'q') {
        const result = await try_apply_move_logic(this, fromFEN, fromPos, toPos, promotion);
        return result;
    }

    async check_end_game(fromFEN) {
        const result = await check_end_game_logic(this, fromFEN);
        return result;
    }

    async get_legal_move_count(fromFEN = null) {
        const result = await get_legal_move_count_logic(this, fromFEN);
        return result;
    }

    async getVersion() {
        const res = await this.query("SELECT version() AS version");
        return res[0].version;
    }

    close() {
        if (this.connection) {
            try {
                this.connection.closeSync();
            } catch (e) {
                console.warn("Error closing connection:", e);
            }
            this.connection = null;
        }
        if (this.db) {
            try {
                this.db.closeSync();
            } catch (e) {
                console.warn("Error closing db:", e);
            }
            this.db = null;
        }
    }
}

let defaultInstance = null;

export async function init() {
    if (defaultInstance) {
        defaultInstance.close();
    }
    defaultInstance = new EngineInstance();
    await defaultInstance.init();
}

export function close() {
    if (defaultInstance) {
        defaultInstance.close();
        defaultInstance = null;
    }
}

export function setQueryLogger(logger) {
    queryLogger = logger;
}

export async function getVersion() {
    if (!defaultInstance) throw new Error("Engine not initialized");
    return defaultInstance.getVersion();
}

export async function find_best_move(fromFEN, options) {
    if (!defaultInstance) throw new Error("Engine not initialized");
    return defaultInstance.find_best_move(fromFEN, options);
}

export async function try_apply_move(fromFEN, fromPos, toPos, promotion = 'q') {
    if (!defaultInstance) throw new Error("Engine not initialized");
    return defaultInstance.try_apply_move(fromFEN, fromPos, toPos, promotion);
}

export async function check_end_game(fromFEN) {
    if (!defaultInstance) throw new Error("Engine not initialized");
    return defaultInstance.check_end_game(fromFEN);
}

export async function get_legal_move_count(fromFEN) {
    if (!defaultInstance) throw new Error("Engine not initialized");
    return defaultInstance.get_legal_move_count(fromFEN);
}

export async function resetGame() {
    if (!defaultInstance) throw new Error("Engine not initialized");
    return defaultInstance.resetGame();
}


