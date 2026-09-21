/**
 * WebAssembly bridge for Quackmate.
 * Loads DuckDB-Wasm and connects it to the engine logic for browser use.
 */
import { CONFIG } from '../utils/config.js';
import {
    find_best_move as find_best_move_logic,
    try_apply_move as try_apply_move_logic,
    check_end_game as check_end_game_logic,
    populatePstValues,
    populateAttacksPrecomputed,
    populateMobilityPrecomputed,
    populateZobristTables,
    getDuckDBThreads as getDuckDBThreads_logic,
    DEFAULT_OPTIONS,
    RESTRICTED_MODE_LIMITS
} from './quackmate.js';

import {
    getInitSchemaSQL,
    getClearSearchSQL,
    getInitSearchTablesSQL
} from './sql/schema.js';
import { telemetry, profileBatch, splitStatements } from './quackmate-telemetry.js';

export { DEFAULT_OPTIONS, RESTRICTED_MODE_LIMITS };

// --- Resource Cache ---
const WasmBlobCache = {
    blobs: null,
    currentVersion: null,
    loadPromise: null,

    async load(version = CONFIG.DUCKDB_WASM_VERSION) {
        if (this.currentVersion !== version) {
            this.blobs = null;
            this.loadPromise = null;
            this.currentVersion = version;
        }
        if (this.blobs) return this.blobs;
        if (this.loadPromise) return this.loadPromise;

        this.loadPromise = (async () => {
            const bundle = {
                mainModule: `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${version}/dist/duckdb-coi.wasm`,
                mainWorker: `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${version}/dist/duckdb-browser-coi.worker.js`,
                pthreadWorker: `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${version}/dist/duckdb-browser-coi.pthread.worker.js`,
            };

            const [worker_script, pthread_worker_script] = await Promise.all([
                fetch(bundle.mainWorker).then(resp => resp.text()),
                fetch(bundle.pthreadWorker).then(resp => resp.text()),
            ]);

            const worker_blob = new Blob([worker_script], { type: 'application/javascript' });
            const pthread_worker_blob = new Blob([pthread_worker_script], { type: 'application/javascript' });
            const worker_url = URL.createObjectURL(worker_blob);
            const pthread_worker_url = URL.createObjectURL(pthread_worker_blob);

            this.blobs = {
                mainModule: bundle.mainModule,
                workerUrl: worker_url,
                pthreadWorkerUrl: pthread_worker_url
            };
            return this.blobs;
        })();

        return this.loadPromise;
    }
};

// Converts a DuckDB-Wasm Arrow query result into an array of plain JS
// objects, preserving BigInts (which .toJSON() would otherwise lose).
function arrowResultToPlainObjects(result) {
    if (!result || typeof result.toArray !== 'function') return [];
    const arr = result.toArray();
    if (arr.length === 0) return [];
    const columnNames = result.schema.fields.map(f => f.name);
    return arr.map(row => {
        const obj = {};
        for (const colName of columnNames) {
            obj[colName] = row[colName];
        }
        return obj;
    });
}

/**
 * Executes every statement in `sql` (split, unmodified) one at a time on
 * connection `c`, capturing each one's REAL, single-execution DuckDB
 * profile via `PRAGMA profiling_output` + duckdb-wasm's virtual filesystem
 * (`db.copyFileToBuffer`) - the browser equivalent of the file-based
 * technique benchmarks/profile_duckdb.js uses natively. No statement is
 * ever re-run or rewritten, so this is 100% accurate.
 *
 * The splitting/collection/recording itself lives in the shared
 * `profileBatch()` orchestrator; this function only adapts it to duckdb-wasm
 * (set the output path, execute, read the virtual file).
 *
 * Returns the Arrow result of the LAST statement, matching the existing
 * multi-statement calling convention.
 */
async function runWithRealProfilingWasm(c, db, sql, color) {
    const statements = splitStatements(sql);
    if (statements.length === 0) {
        return await c.query(sql);
    }

    const basePath = `quackmate_prof_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    let lastResult = null;

    try {
        await c.query("PRAGMA enable_profiling='json';");
        await c.query("PRAGMA profiling_mode='detailed';");

        await profileBatch(sql, color, async (stmt) => {
            // A FRESH virtual path per statement, re-issued right before
            // running it: a statement that emits no profile must not inherit
            // the previous statement's file (which would duplicate its
            // timings onto the wrong step), and reusing one path across
            // statements can hit "file is not opened in write mode" errors in
            // duckdb-wasm's virtual filesystem.
            const virtualPath = `${basePath}_${stmt.index}.json`;
            try {
                await c.query(`PRAGMA profiling_output='${virtualPath}';`);
                lastResult = await c.query(stmt.stmtSql);

                if (db && typeof db.copyFileToBuffer === 'function') {
                    const buffer = await db.copyFileToBuffer(virtualPath);
                    if (buffer && buffer.length > 0) {
                        return new TextDecoder('utf-8').decode(buffer);
                    }
                }
                return null;
            } catch (readErr) {
                // Virtual file may not exist yet for DDL-only statements, or
                // copyFileToBuffer may be unsupported in this duckdb-wasm
                // build - degrade gracefully (query result is unaffected).
                return null;
            } finally {
                // Best-effort cleanup so the VFS doesn't accumulate one file
                // per profiled statement. Optional: not all builds expose a
                // drop/unregister API.
                try {
                    if (db && typeof db.dropFile === 'function') {
                        await db.dropFile(virtualPath);
                    }
                } catch (dropErr) { /* ignore */ }
            }
        });
    } finally {
        try { await c.query('PRAGMA disable_profiling;'); } catch (e) { /* ignore */ }
    }

    return lastResult;
}

// --- DB Wrapper Helper ---
// `db` is the AsyncDuckDB instance (needed to read back the profiling
// output file from its virtual filesystem) - pass null to disable real
// profiling capture for this wrapper (e.g. one-off ad-hoc queries).
function createDbWrapper(c, logger, color = 'white', db = null) {
    return {
        query: async (sql, meta = {}) => {
            const startTime = performance.now();
            if (logger) {
                logger(sql);
            }

            const result = telemetry.isProfilingEnabled(color)
                ? await runWithRealProfilingWasm(c, db, sql, color)
                : await c.query(sql);

            const durationMs = performance.now() - startTime;
            if (!result || typeof result.toArray !== 'function') {
                telemetry.recordQuery(color, sql, durationMs, 0, meta);
                return [];
            }
            const arr = result.toArray();
            const rowCount = arr.length;
            telemetry.recordQuery(color, sql, durationMs, rowCount, meta);
            if (rowCount === 0) {
                return [];
            }
            // Manually convert from Arrow struct to plain JS object
            // to preserve BigInts, which are lost by toJSON().
            const columnNames = result.schema.fields.map(f => f.name);
            const plainObjects = arr.map(row => {
                const obj = {};
                for (const colName of columnNames) {
                    obj[colName] = row[colName];
                }
                return obj;
            });
            return plainObjects;
        }
    };
}

// --- Engine Class ---
export class DuckDBWasmEngine {
    constructor() {
        this.db = null;
        this.queryLogger = null;
    }

    setQueryLogger(logger) {
        this.queryLogger = logger;
    }

    async init(version = CONFIG.DUCKDB_WASM_VERSION) {
        if (this.db) {
            await this.db.terminate();
            if (this._worker) {
                this._worker.terminate();
                this._worker = null;
            }
        }

        const duckdb = await import(`https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${version}/+esm`);
        const blobs = await WasmBlobCache.load(version);

        this._worker = new Worker(blobs.workerUrl);
        const logger = new duckdb.ConsoleLogger();
        this.db = new duckdb.AsyncDuckDB(logger, this._worker);

        // Initialize the database
        await this.db.instantiate(blobs.mainModule, blobs.pthreadWorkerUrl);

        // Initialize schema
        const c = await this.db.connect();
        try {
            const db_wrapper = createDbWrapper(c, this.queryLogger, 'white', this.db);
            await c.query(getInitSchemaSQL());
            await c.query(getInitSearchTablesSQL());
            await populatePstValues(db_wrapper);
            await populateAttacksPrecomputed(db_wrapper);
            await populateMobilityPrecomputed(db_wrapper);
            // Zobrist tables are now synchronously fully populated by getInitSchemaSQL, avoiding Math.random() mismatches

        } finally {
            await c.close();
        }
    }

    async getDuckDBThreads() {
        if (!this.db) throw new Error("Database not initialized!");
        const c = await this.db.connect();
        try {
            const db_wrapper = createDbWrapper(c, this.queryLogger, 'white', this.db);
            return await getDuckDBThreads_logic(db_wrapper);
        } finally {
            await c.close();
        }
    }

    async findBestMove(fromFEN, options) {
        if (!this.db) throw new Error("Database not initialized!");
        const c = await this.db.connect();
        const color = fromFEN.split(' ')[1] === 'w' ? 'white' : 'black';
        try {
            const db_wrapper = createDbWrapper(c, this.queryLogger, color, this.db);
            const startTime = performance.now();
            const result = await find_best_move_logic(db_wrapper, fromFEN, options);
            const duration = performance.now() - startTime;

            // Handle both object return {fen, nodes, move} and fallback
            const moveData = (result && result.fen) ? result : { fen: result, nodes: 0, move: null };

            console.log("WASM findBestMove result:", { fen: moveData.fen, duration, nodes: moveData.nodes });
            return { ...moveData, duration };
        } finally {
            await c.close();
        }
    }

    async makeMove(fromFEN, fromPos, toPos, promotion = 'q') {
        if (!this.db) throw new Error("Database not initialized!");
        const c = await this.db.connect();
        try {
            const db_wrapper = createDbWrapper(c, this.queryLogger, 'white', this.db);
            return await try_apply_move_logic(db_wrapper, fromFEN, fromPos, toPos, promotion);
        } finally {
            await c.close();
        }
    }

    async checkEndGame(fromFEN) {
        if (!this.db) throw new Error("Database not initialized!");
        const c = await this.db.connect();
        try {
            const db_wrapper = createDbWrapper(c, this.queryLogger, 'white', this.db);
            return await check_end_game_logic(db_wrapper, fromFEN);
        } finally {
            await c.close();
        }
    }

    async resetGame() {
        if (!this.db) return; // Or throw?
        const c = await this.db.connect();
        try {
            const db_wrapper = createDbWrapper(c, this.queryLogger, 'white', this.db);
            const clearSQL = getClearSearchSQL();
            // Split by semicolon in case the wrapper handles one query at a time better, or just pass full string
            // DuckDB Wasm allows multiple statements usually.
            const queries = clearSQL.split(';').map(q => q.trim()).filter(q => q.length > 0);
            for (const q of queries) {
                await db_wrapper.query(q);
            }
        } finally {
            await c.close();
        }
    }

    async query(sql) {
        if (!this.db) {
            await this.init();
        }
        const c = await this.db.connect();
        try {
            const db_wrapper = createDbWrapper(c, this.queryLogger, 'white', this.db);
            return await db_wrapper.query(sql);
        } finally {
            await c.close();
        }
    }

    async getVersion() {
        if (!this.db) throw new Error("Database not initialized!");
        const c = await this.db.connect();
        try {
            const db_wrapper = createDbWrapper(c, this.queryLogger, 'white', this.db);
            const res = await db_wrapper.query("SELECT version() AS version");
            return res[0].version;
        } finally {
            await c.close();
        }
    }
}

// --- Backward Compatibility / Default Instance ---
export let defaultEngine = new DuckDBWasmEngine();

export async function init() {
    await defaultEngine.init();
    console.log("Default Engine: Database and tables created successfully!");
    const statusElem = document.getElementById("status");
    if (statusElem) statusElem.textContent = "Ready!";
}

export function setQueryLogger(logger) {
    defaultEngine.setQueryLogger(logger);
}

export async function getVersion() {
    return defaultEngine.getVersion();
}

export async function getDuckDBThreads() {
    return defaultEngine.getDuckDBThreads();
}

export async function find_best_move(fromFEN, options) {
    return defaultEngine.findBestMove(fromFEN, options);
}



export async function try_apply_move(fromFEN, fromPos, toPos, promotion = 'q') {
    return defaultEngine.makeMove(fromFEN, fromPos, toPos, promotion);
}

export async function check_end_game(fromFEN) {
    return defaultEngine.checkEndGame(fromFEN);
}
