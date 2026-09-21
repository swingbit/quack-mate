/**
 * Quack-Mate Telemetry & Profiling Subsystem
 *
 * Tracks, categorizes, deduplicates, and aggregates SQL query executions
 * during engine searches. Backs the Game Overview stats and the Profiling
 * tab's master-detail cost-center drill-down.
 */

// Phase Categories
export const PHASES = {
    MOVE_GEN: 'Move Generation',
    PRUNING: 'Pruning & Probes',
    QUIESCENCE: 'Quiescence Search',
    BACKPROP: 'Minimax Backpropagation',
    TT_SYNC: 'Transposition Table',
    BUFFER_MGMT: 'Frontier Buffers',
    STATE_ARBITER: 'Board & Rules State',
    OTHER: 'Other Operations'
};

// One distinct hue per phase so the stacked cost-split bars in the Game
// Overview are easy to tell apart. All are medium-saturation so they stay
// legible on the light tool theme.
export const PHASE_COLORS = {
    [PHASES.MOVE_GEN]: '#2563EB',      // Blue
    [PHASES.PRUNING]: '#EA580C',       // Orange
    [PHASES.QUIESCENCE]: '#16A34A',    // Green
    [PHASES.BACKPROP]: '#7C3AED',      // Violet
    [PHASES.TT_SYNC]: '#0891B2',       // Teal
    [PHASES.BUFFER_MGMT]: '#DB2777',   // Pink
    [PHASES.STATE_ARBITER]: '#CA8A04', // Amber
    [PHASES.OTHER]: '#64748B'          // Slate
};

/**
 * Classifies a SQL query string into a semantic phase and query title.
 * @param {string} sql - The raw SQL string
 * @returns {{ phase: string, title: string, templateKey: string }}
 */
export function classifyQuery(sql, meta = {}) {
    if (meta && meta.phase && meta.title) {
        return {
            phase: meta.phase,
            title: meta.title,
            templateKey: meta.key || meta.title.toLowerCase().replace(/\s+/g, '_')
        };
    }

    if (!sql || typeof sql !== 'string') {
        return { phase: PHASES.OTHER, title: 'Unknown Query', templateKey: 'unknown' };
    }

    // 1. Check for explicit targeted in-line SQL annotation comment:
    // Format: /* @phase: Phase Name | @title: Component Title | @key: optional_key */
    const tagMatch = sql.match(/\/\*\s*@phase:\s*([^|*]+)\s*\|\s*@title:\s*([^|*]+)(?:\s*\|\s*@key:\s*([^|*]+))?\s*\*\//i);
    if (tagMatch) {
        const phase = tagMatch[1].trim();
        const title = tagMatch[2].trim();
        const templateKey = tagMatch[3] ? tagMatch[3].trim() : title.toLowerCase().replace(/\s+/g, '_');
        return { phase, title, templateKey };
    }

    // Fallback: Strip SQL comments before checking keywords
    const cleanSql = sql
        .replace(/--.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .trim();
    const upper = cleanSql.toUpperCase();

    // 1. Move Generation & Frontier Expansion (prioritize identifying core computation queries)
    //
    // The recursive-CTE engine runs the whole search as ONE `WITH RECURSIVE`
    // SELECT. It also contains `NEXTVAL` + `SEARCH_TREE`, so it must be matched
    // BEFORE the generic frontier rule below - otherwise it would share a
    // template key with the batched frontier expansion and the legal-move
    // probe, and a single drill-down would jump between completely different
    // plans depending on which capture happened to be recorded last. The
    // `NEXTVAL` requirement keeps the batched engine's own `DELETE ... WHERE id
    // NOT IN (WITH RECURSIVE descendants ...)` cleanup out of this bucket.
    if (upper.startsWith('WITH RECURSIVE') && upper.includes('NEXTVAL') && upper.includes('SEARCH_TREE')) {
        return {
            phase: PHASES.MOVE_GEN,
            title: 'Recursive CTE Search',
            templateKey: 'movegen_recursive_cte_search'
        };
    }

    // Legal-move counting probe: a plain COUNT(*) over the expanded pseudo-legal
    // moves. Shares `EXPANDED_RAW` with the frontier expansion, so it is matched
    // on its own `MOVE_COUNT` projection first.
    if (upper.includes('MOVE_COUNT')) {
        return {
            phase: PHASES.MOVE_GEN,
            title: 'Legal Move Count Probe',
            templateKey: 'movegen_legal_move_count'
        };
    }

    if (upper.includes('EXPANDED_SCORED') || upper.includes('EXPANDED_RAW') || upper.includes('IS_LEGAL_CHECK') || upper.includes('MR_APPLIED') || (upper.includes('ATTACKS_PRECOMPUTED') && upper.includes('MOBILITY_PRECOMPUTED')) || (upper.includes('NEXTVAL') && upper.includes('SEARCH_TREE'))) {
        return {
            phase: PHASES.MOVE_GEN,
            title: 'Frontier Batch Expansion & Ray Casting',
            templateKey: 'movegen_frontier_batch_expansion'
        };
    }

    if (upper.includes('RAW_MOVES') && (upper.includes('ORDER BY') || upper.includes('ROW_NUMBER') || upper.includes('INSERT INTO RAW_MOVES') || upper.includes('FROM PARENT_NODES'))) {
        return {
            phase: PHASES.MOVE_GEN,
            title: 'Generate & Rank Candidate Moves',
            templateKey: 'movegen_ranked_raw_moves'
        };
    }

    // 3. Quiescence Search (QS)
    if (upper.includes('QS_FRONTIER') || upper.includes('QS_SEARCH_TREE') || upper.includes('QS_NEXT_FRONTIER') || upper.includes('APPLYQSEVAL')) {
        let title = 'Quiescence Expansion';
        if (upper.includes('MINIMAX') || upper.includes('BACKPROP')) title = 'QS Minimax Backprop';
        else if (upper.includes('APPLYQSEVAL') || upper.includes('MAIN_TREE')) title = 'Apply QS Scores to Horizon';
        else if (upper.includes('INIT') || upper.includes('SEED')) title = 'QS Seed Frontier';
        return { phase: PHASES.QUIESCENCE, title, templateKey: `qs_${title.toLowerCase().replace(/\s+/g, '_')}` };
    }

    // 4. Minimax Backpropagation & Mate Scoring
    if (upper.includes('MINIMAX_EVAL') || upper.includes('PERSISTENT_MINIMAX') || upper.includes('PARTITION BY PARENT_ID')) {
        let title = 'Minimax Layer Backpropagation';
        if (upper.includes('IS_MATE') || upper.includes('MATE_SCORING') || upper.includes('INITIALIZELEAVES')) {
            title = 'Terminal & Mate Scoring';
        }
        return { phase: PHASES.BACKPROP, title, templateKey: `backprop_${title.toLowerCase().replace(/\s+/g, '_')}` };
    }

    // 5. Pruning & Move Ordering Heuristics
    if (upper.includes('KILLER_MOVES') && (upper.includes('INSERT INTO') || upper.includes('UPDATE') || upper.includes('ON CONFLICT'))) {
        return {
            phase: PHASES.PRUNING,
            title: 'Killer Move Heuristic Update',
            templateKey: 'prune_killer_moves_update'
        };
    }

    if (upper.includes('HISTORY_MOVES') && (upper.includes('INSERT INTO') || upper.includes('UPDATE') || upper.includes('ON CONFLICT'))) {
        return {
            phase: PHASES.PRUNING,
            title: 'History Heuristic Update',
            templateKey: 'prune_history_moves_update'
        };
    }

    if (upper.includes('PRUNED_PARENTS') || upper.includes('BOUND_ONLY_NODES')) {
        return {
            phase: PHASES.PRUNING,
            title: 'Beta Cutoff Pruning Probe',
            templateKey: 'prune_beta_cutoff_probe'
        };
    }

    if (upper.includes('RFP') || upper.includes('REVERSE FUTILITY')) {
        return {
            phase: PHASES.PRUNING,
            title: upper.includes('DELETE') ? 'Reverse Futility Pruning (RFP)' : 'RFP Score Update',
            templateKey: 'prune_rfp_probe'
        };
    }

    if (upper.includes('LMR')) {
        return {
            phase: PHASES.PRUNING,
            title: 'Late Move Reduction (LMR) Probe',
            templateKey: 'prune_lmr_probe'
        };
    }

    // 6. Transposition Table Synchronization
    if (upper.includes('TRANSPOSITION_TABLE') || upper.includes('TT_BEST_MOVES')) {
        return {
            phase: PHASES.TT_SYNC,
            title: 'Transposition Table Upsert',
            templateKey: 'tt_merge_upsert'
        };
    }

    // 7. Frontier Buffer Management & Cleanups
    if (upper.includes('DELETE FROM') || upper.includes('DROP TABLE') || upper.includes('CREATE TEMPORARY TABLE') || upper.includes('CREATE TABLE') || upper.includes('CREATE SEQUENCE') || upper.includes('DROP SEQUENCE') || upper.includes('CREATE INDEX') || upper.includes('SWAP') || upper.includes('WHERE 1=0')) {
        let title = 'Frontier Buffer Swap & Clear';
        if (upper.includes('DELETE FROM SEARCH_TREE')) {
            title = 'Clear Search Tree & Reset Tables';
        } else if (upper.startsWith('CREATE TABLE') || upper.startsWith('DROP ') || upper.includes('WHERE 1=0')) {
            title = 'Schema Buffer Setup & DDL';
        }
        return {
            phase: PHASES.BUFFER_MGMT,
            title,
            templateKey: `buffer_${title.toLowerCase().replace(/\s+/g, '_')}`
        };
    }

    // 8. Board State, Validation & Arbiter Rules
    if (upper.includes('V_BOARD_STATE') || upper.includes('IS_CHECK') || upper.includes('GAME_STATE') || upper.includes('REPETITION_HISTORY')) {
        let title = 'Board State & Check Verification';
        if (upper.includes('REPETITION')) title = '3-Fold Repetition History Check';
        return { phase: PHASES.STATE_ARBITER, title, templateKey: `state_${title.toLowerCase().replace(/\s+/g, '_')}` };
    }

    // Default Fallback
    const firstWord = upper.split(/\s+/)[0] || 'QUERY';
    return {
        phase: PHASES.OTHER,
        title: `${firstWord} Statement`,
        templateKey: `other_${firstWord.toLowerCase()}`
    };
}

/**
 * Normalizes SQL queries for template grouping by stripping dynamic numerical constants.
 * @param {string} sql
 * @returns {string}
 */
function normalizeSqlTemplate(sql) {
    if (!sql) return '';
    return sql
        .replace(/--.*$/gm, '')           // Strip single-line comments
        .replace(/\/\*[\s\S]*?\*\//g, '') // Strip block comments
        .replace(/\b\d+\b/g, '?')         // Replace numbers with parameter placeholders
        .replace(/\s+/g, ' ')             // Collapse whitespace
        .trim();
}

/**
 * Derives a short, human-readable label for a statement WITHOUT modifying
 * it - used when profiling the real, unmodified statement (see
 * splitStatements() below). Falls back to a generic "Statement N" for
 * statements with no recognizable leading keyword.
 * @param {string} stmt
 * @returns {string}
 */
function deriveStepLabel(stmt, index) {
    const s = stmt.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
    const ctasMatch = s.match(/^CREATE\s+(?:TEMPORARY\s+)?TABLE\s+([\w.]+)/i);
    const insertMatch = s.match(/^INSERT\s+INTO\s+([\w.]+)/i);
    const updateMatch = s.match(/^UPDATE\s+([\w.]+)/i);
    const deleteMatch = s.match(/^DELETE\s+FROM\s+([\w.]+)/i);
    const dropMatch = s.match(/^DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([\w.]+)/i);

    if (ctasMatch) return `CREATE ${ctasMatch[1]}`;
    if (insertMatch) return `INSERT ${insertMatch[1]}`;
    if (updateMatch) return `UPDATE ${updateMatch[1]}`;
    if (deleteMatch) return `DELETE ${deleteMatch[1]}`;
    if (dropMatch) return `DROP ${dropMatch[1]}`;
    if (/^(SELECT|WITH)\b/i.test(s)) return 'SELECT';
    return `Statement ${index + 1}`;
}

/**
 * Splits a (possibly multi-statement) SQL string into its individual
 * statements EXACTLY as written - no extraction, no modification. Used by
 * the real live-profiling path: since EXPLAIN ANALYZE / real execution
 * profiling works directly on CREATE/INSERT/DELETE/UPDATE statements (not
 * just bare SELECTs), we never need to rewrite anything here - we profile
 * precisely what actually ran.
 * @param {string} sql
 * @returns {Array<{ index: number, label: string, stmtSql: string }>}
 */
export function splitStatements(sql) {
    const raw = (sql || '').trim();
    if (!raw) return [];
    return raw.split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .map((stmtSql, index) => ({
            index,
            label: deriveStepLabel(stmtSql, index),
            stmtSql
        }));
}

/**
 * Shared live-profiling orchestrator used by every engine backend.
 *
 * Splits `sql` into its individual statements and runs `profileOne(stmt)` for
 * each, collecting the raw JSON profile it returns (or null when a statement
 * produced no profile). The assembled per-statement captures are recorded
 * against the batch's template key so the UI can drill into each statement's
 * real, measured operator plan.
 *
 * Each backend only provides the small `profileOne` adapter - re-point the
 * profiling output to a FRESH path, execute the statement, then read the
 * profile. A fresh path per statement is essential: a statement that emits no
 * profile (e.g. pure DDL such as DROP) would otherwise leave the previous
 * statement's output in place, duplicating its timings onto the wrong step.
 * The splitting, labeling, collection and recording live here so all backends
 * behave identically.
 *
 * @param {string} sql - the full, unmodified batch SQL
 * @param {string} color - 'white' | 'black'
 * @param {(stmt: {index:number,label:string,stmtSql:string}) => Promise<string|null>} profileOne
 *        Resolves to the raw profile JSON string, or null when the statement
 *        produced no profile.
 * @returns {Promise<Array<{index:number,label:string,stmtSql:string,rawExplainRows:Array}>>}
 */
export async function profileBatch(sql, color, profileOne) {
    const statements = splitStatements(sql);
    const capturedSteps = [];

    for (const stmt of statements) {
        let raw = null;
        try {
            raw = await profileOne(stmt);
        } catch (err) {
            raw = null;
        }

        if (raw && raw.trim().length > 0) {
            capturedSteps.push({
                index: stmt.index,
                label: stmt.label,
                stmtSql: stmt.stmtSql,
                rawExplainRows: [{ explain_key: 'analyzed_plan', explain_value: raw }]
            });
        }
    }

    if (capturedSteps.length > 0) {
        const batchClassification = classifyQuery(sql);
        telemetry.recordCapture(color, batchClassification.templateKey, sql, capturedSteps);
    }

    return capturedSteps;
}

/**
 * Active search session telemetry state.
 */
class TelemetryManager {
    constructor() {
        this.sessions = {
            white: null,
            black: null
        };
        this.listeners = new Set();
        // Global, on-demand "Query Profiling" toggle - see
        // setProfilingEnabled() below. When enabled for a color, EVERY
        // statement that color's engine executes gets real, single-execution
        // profiling captured (no re-run, no query modification) until
        // disabled again.
        this.profilingEnabled = {
            white: false,
            black: false
        };
    }

    /**
     * Subscribe to telemetry events.
     * @param {Function} listener - Callback (event, data) => void
     */
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    _notify(event, data) {
        for (const listener of this.listeners) {
            try {
                listener(event, data);
            } catch (err) {
                console.error('[TelemetryManager] Listener error:', err);
            }
        }
    }

    /**
     * Starts a new search telemetry session.
     */
    startSession(color, fen, depth, options = {}) {
        const side = color === 'w' || color === 'white' ? 'white' : 'black';
        const session = {
            id: `search_${Date.now()}_${side}`,
            color: side,
            fen,
            depth,
            options,
            startTime: performance.now(),
            endTime: null,
            totalDurationMs: 0,
            queryCount: 0,
            totalRows: 0,
            phases: {},
            templates: new Map(),
            depths: {},
            queries: [],
            slowestQueries: [],
            currentPly: 1,
            status: 'running',
            // "Live Tap" captures: templateKey -> [{ sql, rawExplainRows, timestamp }, ...]
            capturedPlans: new Map()
        };

        // Initialize all phase buckets
        Object.values(PHASES).forEach(p => {
            session.phases[p] = {
                phase: p,
                durationMs: 0,
                queryCount: 0,
                rowCount: 0,
                color: PHASE_COLORS[p]
            };
        });

        this.sessions[side] = session;
        this._notify('session_start', { color: side, session });
        return session;
    }

    /**
     * Enables or disables real, on-demand query profiling for a color.
     * This is a simple global toggle (not tied to any specific query
     * template or session): while enabled, EVERY statement that color's
     * engine executes is profiled via a real single execution (no
     * duplication, no query rewriting - see splitStatements() +
     * each engine's query wrapper), capturing 100% accurate operator-level
     * timings and cardinalities, exactly matching what
     * benchmarks/profile_duckdb.js does.
     *
     * This intentionally adds overhead while active (extra PRAGMA calls +
     * profiling file I/O per statement), so it is opt-in: the user turns it
     * on before making a move they want to inspect, and off again
     * afterwards to return to full search speed.
     */
    setProfilingEnabled(color, enabled) {
        const side = color === 'w' || color === 'white' ? 'white' : 'black';
        this.profilingEnabled[side] = !!enabled;
        this._notify('profiling_toggled', { color: side, enabled: !!enabled });
    }

    isProfilingEnabled(color) {
        const side = color === 'w' || color === 'white' ? 'white' : 'black';
        return !!this.profilingEnabled[side];
    }

    /**
     * Records a real, captured profile for the active session.
     *
     * `steps` is an array of per-statement captures:
     *   [{ index, label, stmtSql, rawExplainRows }, ...]
     * A recorded query is often a whole multi-statement batch (see
     * splitStatements()), so each capture can carry the real, measured
     * profile of EVERY individual statement in that batch.
     */
    recordCapture(color, templateKey, sql, steps) {
        const side = color === 'w' || color === 'white' ? 'white' : 'black';
        const session = this.sessions[side];
        if (!session) return;

        if (!session.capturedPlans) session.capturedPlans = new Map();
        if (!session.capturedPlans.has(templateKey)) {
            session.capturedPlans.set(templateKey, []);
        }
        session.capturedPlans.get(templateKey).push({
            sql,
            steps,
            timestamp: performance.now()
        });

        this._notify('capture_recorded', { color: side, templateKey, session });
    }

    /**
     * Records an executed query in the active search session.
     */
    recordQuery(color, sql, durationMs = 0, rowCount = 0, meta = {}) {
        const side = color === 'w' || color === 'white' ? 'white' : 'black';
        const session = this.sessions[side];
        if (!session || session.status !== 'running') {
            return;
        }

        const classification = classifyQuery(sql);
        const templateKey = classification.templateKey;
        const normalized = normalizeSqlTemplate(sql);

        const ply = meta.depth || session.currentPly || 1;

        session.queryCount++;
        session.totalDurationMs += durationMs;
        session.totalRows += rowCount;

        // Initialize depth bucket if missing
        if (!session.depths[ply]) {
            session.depths[ply] = {
                ply,
                durationMs: 0,
                queryCount: 0,
                totalRows: 0,
                phases: {},
                templates: new Map()
            };
            Object.values(PHASES).forEach(p => {
                session.depths[ply].phases[p] = {
                    phase: p,
                    durationMs: 0,
                    queryCount: 0,
                    rowCount: 0,
                    color: PHASE_COLORS[p]
                };
            });
        }

        const depthBucket = session.depths[ply];
        depthBucket.queryCount++;
        depthBucket.durationMs += durationMs;
        depthBucket.totalRows += rowCount;

        // 1. Update Phase Aggregates (Global and Per-Depth)
        const phaseBucket = session.phases[classification.phase];
        if (phaseBucket) {
            phaseBucket.durationMs += durationMs;
            phaseBucket.queryCount++;
            phaseBucket.rowCount += rowCount;
        }

        const depthPhaseBucket = depthBucket.phases[classification.phase];
        if (depthPhaseBucket) {
            depthPhaseBucket.durationMs += durationMs;
            depthPhaseBucket.queryCount++;
            depthPhaseBucket.rowCount += rowCount;
        }

        // 2. Update Template Aggregates (Global and Per-Depth)
        const updateTpl = (map) => {
            if (!map.has(templateKey)) {
                map.set(templateKey, {
                    key: templateKey,
                    title: classification.title,
                    phase: classification.phase,
                    phaseColor: PHASE_COLORS[classification.phase],
                    count: 0,
                    totalDurationMs: 0,
                    minDurationMs: Infinity,
                    maxDurationMs: 0,
                    totalRows: 0,
                    sampleSql: sql,
                    normalizedSql: normalized
                });
            } else {
                const existing = map.get(templateKey);
                if (sql.length > existing.sampleSql.length && !sql.includes('WHERE 1=0')) {
                    existing.sampleSql = sql;
                }
            }
            const t = map.get(templateKey);
            t.count++;
            t.totalDurationMs += durationMs;
            t.minDurationMs = Math.min(t.minDurationMs, durationMs);
            t.maxDurationMs = Math.max(t.maxDurationMs, durationMs);
            t.totalRows += rowCount;
        };

        updateTpl(session.templates);
        updateTpl(depthBucket.templates);

        // 3. Store in query log (capped at 250 recent queries to prevent memory growth)
        const queryRecord = {
            id: `${session.id}_q${session.queryCount}`,
            title: classification.title,
            phase: classification.phase,
            sql,
            durationMs,
            rowCount,
            depth: meta.depth || session.currentPly,
            timestamp: performance.now()
        };

        if (session.queries.length < 300) {
            session.queries.push(queryRecord);
        }

        // 4. Update Top Slowest Queries
        this._insertSlowestQuery(session.slowestQueries, queryRecord, 5);

        this._notify('query_recorded', { color: side, query: queryRecord, session });
    }

    _insertSlowestQuery(list, record, limit = 5) {
        if (list.length < limit || record.durationMs > list[list.length - 1].durationMs) {
            list.push(record);
            list.sort((a, b) => b.durationMs - a.durationMs);
            if (list.length > limit) list.pop();
        }
    }

    /**
     * Signals transition to a new search depth/ply.
     */
    setDepthPly(color, ply) {
        const side = color === 'w' || color === 'white' ? 'white' : 'black';
        const session = this.sessions[side];
        if (session) {
            session.currentPly = ply;
            this._notify('depth_changed', { color: side, ply, session });
        }
    }

    /**
     * Finishes the active search session.
     */
    finishSession(color, resultData = {}) {
        const side = color === 'w' || color === 'white' ? 'white' : 'black';
        const session = this.sessions[side];
        if (!session) return null;

        session.endTime = performance.now();
        session.totalDurationMs = session.endTime - session.startTime;
        session.status = 'completed';
        session.result = resultData;

        this._notify('session_complete', { color: side, session });
        return session;
    }

    /**
     * Imports an externally recorded search session (e.g. from Remote Native backend).
     */
    importSession(color, sessionData) {
        if (!sessionData) return null;
        const side = color === 'w' || color === 'white' ? 'white' : 'black';
        const rawDepths = sessionData.depths || {};
        const parsedDepths = {};
        for (const [ply, dData] of Object.entries(rawDepths)) {
            parsedDepths[ply] = {
                ...dData,
                templates: new Map(dData.templates || [])
            };
        }

        const session = {
            ...sessionData,
            templates: new Map(sessionData.templates || []),
            depths: parsedDepths,
            // capturedPlans arrives as a serialized [key, value][] array over
            // the wire (from RemoteEngine/server.js) - rebuild the Map here.
            capturedPlans: new Map(sessionData.capturedPlans || [])
        };
        this.sessions[side] = session;
        this._notify('session_complete', { color: side, session });
        return session;
    }

    /**
     * Retrieves the latest search telemetry session for a color.
     */
    getSession(color) {
        const side = color === 'w' || color === 'white' ? 'white' : 'black';
        return this.sessions[side];
    }
}

// Global Singleton
export const telemetry = new TelemetryManager();
