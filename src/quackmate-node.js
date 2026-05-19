import { DuckDBInstance } from '@duckdb/node-api';
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


let queryLogger = null;

export class EngineInstance {
    constructor() {
        this.db = null;
        this.connection = null;
        this.queryLogger = null;
    }

    setQueryLogger(logger) {
        this.queryLogger = logger;
    }

    async query(sql) {
        if (this.queryLogger) {
            this.queryLogger(sql);
        }
        if (queryLogger) {
            queryLogger(sql);
        }
        const reader = await this.connection.runAndReadAll(sql);
        const columns = reader.columnNames();
        const rows = reader.getRows();
        return rows.map(row => {
            const obj = {};
            for (let i = 0; i < columns.length; i++) {
                obj[columns[i]] = row[i];
            }
            return obj;
        });
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
        await this.query("BEGIN TRANSACTION");
        try {
            const result = await find_best_move_logic(this, fromFEN, options);
            if (traceCallback) {
                await traceCallback(this);
            }
            return result;
        } finally {
            await this.query("ROLLBACK");
        }
    }

    async try_apply_move(fromFEN, fromPos, toPos) {
        await this.query("BEGIN TRANSACTION");
        try {
            const result = await try_apply_move_logic(this, fromFEN, fromPos, toPos);
            return result;
        } finally {
            await this.query("ROLLBACK");
        }
    }

    async check_end_game(fromFEN) {
        await this.query("BEGIN TRANSACTION");
        try {
            const result = await check_end_game_logic(this, fromFEN);
            return result;
        } finally {
            await this.query("ROLLBACK");
        }
    }

    async get_legal_move_count(fromFEN = null) {
        await this.query("BEGIN TRANSACTION");
        try {
            const result = await get_legal_move_count_logic(this, fromFEN);
            return result;
        } finally {
            await this.query("ROLLBACK");
        }
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

export async function try_apply_move(fromFEN, fromPos, toPos) {
    if (!defaultInstance) throw new Error("Engine not initialized");
    return defaultInstance.try_apply_move(fromFEN, fromPos, toPos);
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


