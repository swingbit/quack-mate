/**
 * Shared configuration constants for Quack-Mate.
 * Currently holds:
 *   - DUCKDB_WASM_VERSION – version tag for the DuckDB-Wasm CDN bundles
 *   - REMOTE_ENGINE_URL   – URL of the remote Node.js engine server
 * Imported by the Wasm bridge (quackmate-wasm.js) and the UI module
 * (quackmate-ui.js).
 */

export const CONFIG = {
    DUCKDB_WASM_VERSION: '1.33.1-dev65.0',
    REMOTE_ENGINE_URL: 'http://localhost:3001'
};

// The DuckDB-WASM version that is ACTIVE for this session. It starts at the
// built-in default above, but the settings panel can change it at runtime.
// Any engine created or (re)initialized afterwards reads this instead of the
// hard-coded default, so switching versions takes effect on the very next
// move rather than only after a full re-initialization.
let activeWasmVersion = CONFIG.DUCKDB_WASM_VERSION;

export function getActiveWasmVersion() {
    return activeWasmVersion;
}

export function setActiveWasmVersion(version) {
    activeWasmVersion = version || CONFIG.DUCKDB_WASM_VERSION;
    return activeWasmVersion;
}
