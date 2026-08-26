/**
 * Shared configuration constants for Quack-Mate.
 * Currently holds:
 *   - DUCKDB_WASM_VERSION – version tag for the DuckDB-Wasm CDN bundles
 *   - REMOTE_ENGINE_URL   – URL of the remote Node.js engine server
 * Imported by the Wasm bridge (quackmate-wasm.js) and the UI module
 * (quackmate-ui.js).
 */

export const CONFIG = {
    DUCKDB_WASM_VERSION: '1.33.1-dev53.0',
    REMOTE_ENGINE_URL: 'http://localhost:3001'
};
