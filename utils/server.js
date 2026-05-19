import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import * as duckdbEngine from '../src/quackmate-node.js';


import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.API_PORT ? parseInt(process.env.API_PORT, 10) : 3001;
const staticPort = (process.env.HTTP_PORT || process.env.PORT) ? parseInt(process.env.HTTP_PORT || process.env.PORT, 10) : 8000;

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());

// Engine Registry
// Future engines (e.g., MonetDB) can be added here
const engines = {};

// Initialize engines
async function initEngines() {
    console.log("Initializing DuckDB Engine...");
    try {
        await duckdbEngine.init();
        const version = await duckdbEngine.getVersion();
        console.log(`DuckDB Native Version: ${version}`);
        engines['duckdb_native'] = duckdbEngine;
    } catch (err) {
        console.warn("Failed to initialize DuckDB engine:", err.message);
    }



    console.log("Initializing Player White Engine...");
    const whiteEngine = new duckdbEngine.EngineInstance();
    await whiteEngine.init();
    engines['player_white'] = whiteEngine;

    console.log("Initializing Player Black Engine...");
    const blackEngine = new duckdbEngine.EngineInstance();
    await blackEngine.init();
    engines['player_black'] = blackEngine;

    console.log('All engines initialized.');
    console.log(`Available engines: ${Object.keys(engines).join(', ')}`);
}

// Middleware to get engine instance
function getEngine(req, res, next) {
    const engineId = req.params.engineId;
    const engine = engines[engineId];
    if (!engine) {
        return res.status(404).json({ error: `Engine '${engineId}' not found` });
    }
    req.engine = engine;
    next();
}

// --- Endpoints ---

// Helper to wrap execution with logging
async function executeWithLogging(req, fn) {
    let logs = [];
    if (req.engine && req.engine.setQueryLogger) {
        req.engine.setQueryLogger((sql) => logs.push(sql));
    }

    try {
        const result = await fn();

        // If result is string (e.g. checkmate/illegal), wrap it
        if (typeof result === 'string') {
            return { result, logs };
        }

        // If result is object, merge logs
        // Note: find_best_move returns { fen, nodes, move }
        return { ...result, logs };
    } finally {
        if (req.engine && req.engine.setQueryLogger) {
            req.engine.setQueryLogger(null);
        }
    }
}

// Get Best Move
app.post('/:engineId/best_move', getEngine, async (req, res) => {
    try {
        const { fen, options } = req.body;
        const result = await executeWithLogging(req, () => req.engine.find_best_move(fen, options));
        res.json(result);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// Make Move (Validation/Arbiter)
app.post('/:engineId/try_apply_move', getEngine, async (req, res) => {
    try {
        const { fen, from, to } = req.body;
        const result = await executeWithLogging(req, () => req.engine.try_apply_move(fen, from, to));
        // try_apply_move returns newFEN string OR error string.
        // executeWithLogging wraps it in { result: "...", logs: [] }
        res.json(result);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// Check End Game
app.post('/:engineId/check_end_game', getEngine, async (req, res) => {
    try {
        const { fen } = req.body;
        const result = await executeWithLogging(req, () => req.engine.check_end_game(fen));
        res.json(result);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// Reset Game
app.post('/:engineId/reset_game', getEngine, async (req, res) => {
    try {
        if (req.engine.resetGame) {
            await req.engine.resetGame();
            res.json({ result: "ok" });
        } else {
            console.warn(`Engine ${req.params.engineId} does not support resetGame`);
            res.json({ result: "ok", warning: "reset_not_supported" });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// Get Version
app.get('/:engineId/version', getEngine, async (req, res) => {
    try {
        if (req.engine.getVersion) {
            const version = await req.engine.getVersion();
            res.json({ version });
        } else {
            res.json({ version: "unknown" });
        }
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: e.message });
    }
});

// Static Server (HTTP on 8000)
const staticApp = express();
staticApp.use((req, res, next) => {
    // These headers are needed to enable crossOriginIsolated for SharedArrayBuffer
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    next();
});
staticApp.use(express.static(path.join(__dirname, '..')));

// Start Servers
const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Quackmate Engine server listening on port ${port}`);
});

const staticServer = staticApp.listen(staticPort, '0.0.0.0', () => {
    console.log(`Quackmate HTTP server listening on port ${staticPort}`);
});

// Graceful Shutdown
async function shutdown() {
    console.log('Shutting down...');
    server.close();
    staticServer.close();



    // Add other engine cleanups here if needed

    console.log('Shutdown complete.');
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

initEngines().catch(err => {
    console.error("Failed to initialize engines:", err);
    shutdown(); // Ensure cleanup even on init failure
});
