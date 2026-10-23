/**
 * WebAssembly bridge for Quackmate.
 * Loads DuckDB-Wasm and connects it to the engine logic for browser use.
 */
import { getActiveWasmVersion, setActiveWasmVersion } from '../utils/config.js';
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

// The last version we successfully brought up, used as a fallback if a later
// version turns out to be unusable at init time.
let lastUsableVersion = null;

// --- DuckDB-WASM bundle resolution ---
//
// duckdb-wasm has renamed its distribution bundles across releases: the older
// threaded "coi" bundle (duckdb-coi.wasm + duckdb-browser-coi.worker.js) was
// replaced by a "threads" bundle (duckdb-threads.wasm +
// duckdb-browser-threads.worker.js), and single-threaded "base"/"mvp" bundles
// exist as well. Instead of hardcoding one naming scheme (which 404s on
// versions shipping a different one), we ask jsDelivr which files a version
// actually publishes and pick the best scheme that is fully present.
//
// Threaded bundles need SharedArrayBuffer, i.e. cross-origin isolation. When
// the page is NOT isolated (e.g. a browser that doesn't support
// `COEP: credentialless`), we must use a single-threaded bundle instead.
const BUNDLE_SCHEMES = [
    // Threaded bundles (require cross-origin isolation / SharedArrayBuffer).
    {
        name: 'coi',
        threaded: true,
        mainModule: 'duckdb-coi.wasm',
        mainWorker: 'duckdb-browser-coi.worker.js',
        pthreadWorker: 'duckdb-browser-coi.pthread.worker.js',
    },
    {
        name: 'threads',
        threaded: true,
        mainModule: 'duckdb-threads.wasm',
        mainWorker: 'duckdb-browser-threads.worker.js',
        pthreadWorker: 'duckdb-browser-threads.pthread.worker.js',
    },
    // Single-threaded bundles (no SharedArrayBuffer / no isolation required).
    {
        name: 'base',
        threaded: false,
        mainModule: 'duckdb-base.wasm',
        mainWorker: 'duckdb-browser-base.worker.js',
        pthreadWorker: null,
    },
    {
        name: 'mvp',
        threaded: false,
        mainModule: 'duckdb-mvp.wasm',
        mainWorker: 'duckdb-browser-mvp.worker.js',
        pthreadWorker: null,
    },
];

const wasmDistBase = (version) =>
    `https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${version}/dist`;

function isCrossOriginIsolated() {
    return typeof self !== 'undefined' && self.crossOriginIsolated === true;
}

// version -> resolved bundle descriptor (also caches negatives)
const resolvedBundles = new Map();

function _buildBundle(version, scheme) {
    const base = wasmDistBase(version);
    return {
        usable: true,
        name: scheme.name,
        mainModuleUrl: `${base}/${scheme.mainModule}`,
        mainWorkerUrl: `${base}/${scheme.mainWorker}`,
        pthreadWorkerUrl: scheme.pthreadWorker ? `${base}/${scheme.pthreadWorker}` : null,
    };
}

/**
 * Resolves which distribution bundle a given duckdb-wasm version ships, by
 * consulting jsDelivr's file listing. Returns a descriptor with `usable`, the
 * resolved `name`, the asset URLs, and (when unusable) the `missing` URLs.
 * Falls back to the legacy scheme when the listing can't be fetched - load()
 * then verifies the assets for real.
 */
async function resolveBundle(version) {
    if (resolvedBundles.has(version)) return resolvedBundles.get(version);

    let fileSet = null;
    try {
        const res = await fetch(
            `https://data.jsdelivr.com/v1/package/npm/@duckdb/duckdb-wasm@${version}/flat`
        );
        if (res.ok) {
            const data = await res.json();
            fileSet = new Set(((data && data.files) || []).map((f) => f.name));
        } else {
            // jsDelivr returns 404 for unknown versions -> the version does not
            // exist, so treat it as definitely unusable (empty file set).
            fileSet = new Set();
        }
    } catch (_) {
        // Network/listing unavailable (offline/blocked) - don't hard-fail;
        // resolve optimistically and let load() verify with a real fetch.
    }

    // When isolated we can (and prefer) the threaded bundles; otherwise only
    // single-threaded bundles are usable.
    const ordered = isCrossOriginIsolated()
        ? [...BUNDLE_SCHEMES.filter((s) => s.threaded), ...BUNDLE_SCHEMES.filter((s) => !s.threaded)]
        : BUNDLE_SCHEMES.filter((s) => !s.threaded);

    let resolved = null;
    if (fileSet) {
        for (const scheme of ordered) {
            const required = [scheme.mainModule, scheme.mainWorker, scheme.pthreadWorker].filter(Boolean);
            if (required.every((f) => fileSet.has(`/dist/${f}`))) {
                resolved = _buildBundle(version, scheme);
                break;
            }
        }
        if (!resolved) {
            const base = wasmDistBase(version);
            const wanted = ordered[0] || BUNDLE_SCHEMES[0];
            resolved = {
                usable: false,
                name: null,
                mainModuleUrl: null,
                mainWorkerUrl: null,
                pthreadWorkerUrl: null,
                missing: [wanted.mainModule, wanted.mainWorker, wanted.pthreadWorker]
                    .filter(Boolean)
                    .map((f) => `${base}/${f}`),
            };
        }
    } else {
        // Can't list files - optimistically use the preferred scheme; load() will
        // confirm each asset with a real fetch and throw if it's missing.
        resolved = _buildBundle(version, ordered[0] || BUNDLE_SCHEMES[0]);
    }

    resolvedBundles.set(version, resolved);
    return resolved;
}

/**
 * Public usability probe: does `version` ship a bundle this engine can load?
 * The settings panel uses it to reject unusable versions before switching.
 */
export async function checkWasmVersionUsable(version) {
    const bundle = await resolveBundle(version);
    return {
        usable: !!bundle.usable,
        scheme: bundle.name,
        missing: bundle.missing || [],
    };
}

// --- Resource Cache ---
const WasmBlobCache = {
    blobs: null,
    currentVersion: null,
    loadPromise: null,

    async load(version = getActiveWasmVersion()) {
        if (this.currentVersion !== version) {
            this.blobs = null;
            this.loadPromise = null;
            this.currentVersion = version;
        }
        if (this.blobs) return this.blobs;
        if (this.loadPromise) return this.loadPromise;

        this.loadPromise = (async () => {
            const bundle = await resolveBundle(version);
            if (!bundle.usable) {
                throw new Error(
                    `DuckDB WASM ${version} is not usable: required bundle files are missing (${(bundle.missing || []).join(', ')})`
                );
            }

            const worker_resp = await fetch(bundle.mainWorkerUrl);
            if (!worker_resp.ok) {
                throw new Error(
                    `DuckDB WASM ${version}: worker not found (${bundle.mainWorkerUrl}, HTTP ${worker_resp.status})`
                );
            }
            const worker_script = await worker_resp.text();
            const worker_blob = new Blob([worker_script], { type: 'application/javascript' });
            const worker_url = URL.createObjectURL(worker_blob);

            let pthread_worker_url = null;
            if (bundle.pthreadWorkerUrl) {
                const pthread_resp = await fetch(bundle.pthreadWorkerUrl);
                if (!pthread_resp.ok) {
                    throw new Error(
                        `DuckDB WASM ${version}: pthread worker not found (${bundle.pthreadWorkerUrl}, HTTP ${pthread_resp.status})`
                    );
                }
                const pthread_worker_script = await pthread_resp.text();
                pthread_worker_url = URL.createObjectURL(
                    new Blob([pthread_worker_script], { type: 'application/javascript' })
                );
            }

            this.blobs = {
                mainModule: bundle.mainModuleUrl,
                workerUrl: worker_url,
                pthreadWorkerUrl: pthread_worker_url,
                scheme: bundle.name,
            };
            return this.blobs;
        })().catch(err => {
            // Never cache a rejected load: a later attempt (e.g. falling back to
            // another version) must be able to retry cleanly.
            this.loadPromise = null;
            this.blobs = null;
            throw err;
        });

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

    /**
     * Tears down the underlying worker/database (if any) so the engine can be
     * safely re-initialized later - possibly against a different WASM version.
     * Idempotent: safe to call on an engine that was never initialized or has
     * already been disposed.
     */
    async dispose() {
        if (this.db) {
            try { await this.db.terminate(); } catch (e) { /* ignore */ }
            this.db = null;
        }
        if (this._worker) {
            try { this._worker.terminate(); } catch (e) { /* ignore */ }
            this._worker = null;
        }
    }

    /**
     * Lazily initializes the underlying database if it isn't ready. This lets
     * callers dispose() an engine (e.g. after a WASM version switch) and have
     * it transparently come back up - on the new version - the next time it's
     * actually used.
     */
    async _ensureInit() {
        if (!this.db) {
            await this.init();
        }
    }

    async _initWithVersion(version) {
        const duckdb = await import(`https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@${version}/+esm`);
        const blobs = await WasmBlobCache.load(version);

        this._worker = new Worker(blobs.workerUrl);
        const logger = new duckdb.ConsoleLogger();
        this.db = new duckdb.AsyncDuckDB(logger, this._worker);

        // Initialize the database. The pthread worker is null for the
        // single-threaded "base" bundle; duckdb-wasm handles a null pthread.
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

    async init(version = getActiveWasmVersion()) {
        await this.dispose();
        try {
            await this._initWithVersion(version);
            lastUsableVersion = version;
        } catch (err) {
            await this.dispose();
            // If this version can't be brought up but we previously initialized
            // a different one successfully, recover by falling back to it rather
            // than leaving the engine dead.
            if (lastUsableVersion && lastUsableVersion !== version) {
                console.warn(
                    `DuckDB WASM ${version} could not be initialized (${err.message}); ` +
                    `falling back to last known good version ${lastUsableVersion}.`
                );
                await this._initWithVersion(lastUsableVersion);
                setActiveWasmVersion(lastUsableVersion);
                return;
            }
            throw err;
        }
    }

    async getDuckDBThreads() {
        await this._ensureInit();
        const c = await this.db.connect();
        try {
            const db_wrapper = createDbWrapper(c, this.queryLogger, 'white', this.db);
            return await getDuckDBThreads_logic(db_wrapper);
        } finally {
            await c.close();
        }
    }

    async findBestMove(fromFEN, options) {
        await this._ensureInit();
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
        await this._ensureInit();
        const c = await this.db.connect();
        try {
            const db_wrapper = createDbWrapper(c, this.queryLogger, 'white', this.db);
            return await try_apply_move_logic(db_wrapper, fromFEN, fromPos, toPos, promotion);
        } finally {
            await c.close();
        }
    }

    async checkEndGame(fromFEN) {
        await this._ensureInit();
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
        await this._ensureInit();
        const c = await this.db.connect();
        try {
            const db_wrapper = createDbWrapper(c, this.queryLogger, 'white', this.db);
            return await db_wrapper.query(sql);
        } finally {
            await c.close();
        }
    }

    async getVersion() {
        await this._ensureInit();
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
