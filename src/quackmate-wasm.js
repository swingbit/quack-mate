/**
 * quackmate-wasm.js
 * 
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
    DEFAULT_OPTIONS
} from './quackmate.js';

import {
    getInitSchemaSQL,
    getClearSearchSQL,
    getInitSearchTablesSQL
} from './sql/schema.js';

export { DEFAULT_OPTIONS };

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

// --- DB Wrapper Helper ---
function createDbWrapper(c, logger) {
    return {
        query: async (sql) => {
            if (logger) {
                logger(sql);
            } else {
                // console.log("WASM query:", sql); // Default silence or debug?
            }
            const result = await c.query(sql);
            if (!result || typeof result.toArray !== 'function') {
                return [];
            }
            const arr = result.toArray();
            if (arr.length === 0) {
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
            const db_wrapper = createDbWrapper(c, this.queryLogger);
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
            const db_wrapper = createDbWrapper(c, this.queryLogger);
            return await getDuckDBThreads_logic(db_wrapper);
        } finally {
            await c.close();
        }
    }

    async findBestMove(fromFEN, options) {
        if (!this.db) throw new Error("Database not initialized!");
        const c = await this.db.connect();
        try {
            const db_wrapper = createDbWrapper(c, this.queryLogger);
            await db_wrapper.query("BEGIN TRANSACTION");
            try {
                const startTime = performance.now();
                const result = await find_best_move_logic(db_wrapper, fromFEN, options);
                const duration = performance.now() - startTime;

                // Handle both object return {fen, nodes, move} and fallback
                const moveData = (result && result.fen) ? result : { fen: result, nodes: 0, move: null };

                console.log("WASM findBestMove result:", { fen: moveData.fen, duration, nodes: moveData.nodes });
                return { ...moveData, duration };
            } finally {
                await db_wrapper.query("ROLLBACK");
            }
        } finally {
            await c.close();
        }
    }



    async makeMove(fromFEN, fromPos, toPos) {
        if (!this.db) throw new Error("Database not initialized!");
        const c = await this.db.connect();
        try {
            const db_wrapper = createDbWrapper(c, this.queryLogger);
            await db_wrapper.query("BEGIN TRANSACTION");
            try {
                return await try_apply_move_logic(db_wrapper, fromFEN, fromPos, toPos);
            } finally {
                await db_wrapper.query("ROLLBACK");
            }
        } finally {
            await c.close();
        }
    }

    async checkEndGame(fromFEN) {
        if (!this.db) throw new Error("Database not initialized!");
        const c = await this.db.connect();
        try {
            const db_wrapper = createDbWrapper(c, this.queryLogger);
            await db_wrapper.query("BEGIN TRANSACTION");
            try {
                return await check_end_game_logic(db_wrapper, fromFEN);
            } finally {
                await db_wrapper.query("ROLLBACK");
            }
        } finally {
            await c.close();
        }
    }

    async resetGame() {
        if (!this.db) return; // Or throw?
        const c = await this.db.connect();
        try {
            const db_wrapper = createDbWrapper(c, this.queryLogger);
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

    async getVersion() {
        if (!this.db) throw new Error("Database not initialized!");
        const c = await this.db.connect();
        try {
            const db_wrapper = createDbWrapper(c, this.queryLogger);
            const res = await db_wrapper.query("SELECT version() AS version");
            return res[0].version;
        } finally {
            await c.close();
        }
    }
}

// --- Backward Compatibility / Default Instance ---
let defaultEngine = new DuckDBWasmEngine();

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



export async function try_apply_move(fromFEN, fromPos, toPos) {
    return defaultEngine.makeMove(fromFEN, fromPos, toPos);
}

export async function check_end_game(fromFEN) {
    return defaultEngine.checkEndGame(fromFEN);
}
