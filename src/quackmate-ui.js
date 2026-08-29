/**
 * Frontend glue logic for the Quackmate web interface.
 * Handles chessboard.js integration, UI updates, and communication 
 * with either the Wasm engine or the Remote engine.
 */
import {
  init as init_quackmate,
  try_apply_move,
  check_end_game,
  getDuckDBThreads,
  setQueryLogger,
  DuckDBWasmEngine,
  DEFAULT_OPTIONS,
  RESTRICTED_MODE_LIMITS
} from './quackmate-wasm.js';
import { CONFIG } from '../utils/config.js';
import { sanFromMove, isKingInCheck } from './quackmate-san.js';
import { GameState } from './quackmate-js-dfs.js';


const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

let board = null
let isRestrictedMode = false;
let sanitizeTimeout = null
let $last_white = $('#last_white')
let $last_black = $('#last_black')
let $status_white = $('#status_white')
let $status_black = $('#status_black')
let $avg_white = $('#avg_white')
let $avg_black = $('#avg_black')
let $player_status_white = $('#player_status_white')
let $player_status_black = $('#player_status_black')
let $move_count_white = $('#move_count_white')
let $move_count_black = $('#move_count_black')
let $engineStatus = $('#engine-status')

// Evaluation history for the live graph
let evalHistory = [];

// Per-tab console font size memory (persisted in localStorage)
const DEFAULT_FONT_SIZE = 11;
let tabFontSizes = {
  'white-stats': DEFAULT_FONT_SIZE + 2,
  'white-sql': DEFAULT_FONT_SIZE,
  'white-plan': DEFAULT_FONT_SIZE,
  'white-db': DEFAULT_FONT_SIZE,
  'black-stats': DEFAULT_FONT_SIZE + 2,
  'black-sql': DEFAULT_FONT_SIZE,
  'black-plan': DEFAULT_FONT_SIZE,
  'black-db': DEFAULT_FONT_SIZE
};

try {
  const saved = localStorage.getItem('quackmate_tab_font_sizes');
  if (saved) tabFontSizes = { ...tabFontSizes, ...JSON.parse(saved) };
} catch(e) {}

function applyTabFontSize(paneId) {
  const size = tabFontSizes[paneId] || DEFAULT_FONT_SIZE;
  const $pane = $('#' + paneId);
  $pane.find('.console-output, .sql-stats-output, .tool-pane-placeholder').css('font-size', size + 'px');

  const $container = $pane.closest('.tool-panel-container');
  if ($pane.hasClass('active')) {
    $container.find('.font-size-label').text(size + 'px');
  }
}

// Log Streamer Utility
class LogStreamer {
  constructor(logger) {
    this.logger = logger;
  }

  stream(logs) {
    if (this.logger && logs && logs.length > 0) {
      logs.forEach(sql => this.logger(sql));
    }
  }
}

class WasmEngineAdapter {
  constructor() {
    this.version = CONFIG.DUCKDB_WASM_VERSION; // Default
    this.engine = new DuckDBWasmEngine();
    this.logs = [];
    this.loggerCallback = null;

    // Trap logs internally
    this.engine.setQueryLogger((sql) => {
      this.logs.push(sql);
    });
  }

  async init() {
    await this.engine.init(this.version);
  }

  setQueryLogger(logger) {
    this.loggerCallback = logger;
  }

  async findBestMove(fen, options) {
    this.logs = []; // Clear buffer
    const result = await this.engine.findBestMove(fen, options);

    // Stream logs after execution
    if (this.loggerCallback) {
      new LogStreamer(this.loggerCallback).stream(this.logs);
    }

    return result;
  }

  // Proxy other methods directly
  async makeMove(fen, from, to) { return this.engine.makeMove(fen, from, to); }
  async checkEndGame(fen) { return this.engine.checkEndGame(fen); }
  async resetGame() { if (this.engine.resetGame) await this.engine.resetGame(); }
  async getVersion() { return this.engine.getVersion(); }
}

class StandardEngineAdapter {
    constructor() {
        this.initialized = false;
        this.logs = [];
        this.loggerCallback = null;
        this.worker = new Worker('src/quackmate-js-dfs.worker.js', { type: 'module' });
        this.pendingRequests = new Map();
        this.msgId = 0;
        
        this.worker.onmessage = (e) => {
            const { type, id, result, error } = e.data;
            if (this.pendingRequests.has(id)) {
                const { resolve, reject } = this.pendingRequests.get(id);
                this.pendingRequests.delete(id);
                if (type === 'error') reject(new Error(error));
                else resolve(result);
            }
        };
    }

    async init() {
        if (this.initialized) return;
        return this.send('init');
    }
    
    send(type, payload = {}) {
        return new Promise((resolve, reject) => {
            const id = ++this.msgId;
            this.pendingRequests.set(id, { resolve, reject });
            this.worker.postMessage({ type, id, ...payload });
        });
    }

    setQueryLogger(logger) {
        this.loggerCallback = logger;
    }

    async findBestMove(fen, options) {
        const engineOpts = {
            ...options
        };
        
        const start = performance.now();
        const res = await this.send('search', { fen, options: engineOpts });
        const end = performance.now();
        
        // Ensure duration is set
        return {
            ...res,
            duration: res.search_duration || (end - start)
        };
    }
    
    async checkEndGame(fen) {
        return "none"; 
    }
    
    async resetGame() {
        // Nothing to reset for now
    }

    async getVersion() {
        return "";
    }
}

class RemoteEngine {
  constructor(baseUrl, engineId) {
    this.baseUrl = baseUrl;
    this.engineId = engineId;
    this.loggerCallback = null;
  }

  async init() {
    console.log(`Initialized RemoteEngine for ${this.engineId} at ${this.baseUrl}`);
  }

  setQueryLogger(logger) {
    this.loggerCallback = logger;
  }

  log(logs) {
    if (this.loggerCallback) {
      new LogStreamer(this.loggerCallback).stream(logs);
    }
  }

  async findBestMove(fen, options) {
    const start = performance.now();
    const response = await fetch(`${this.baseUrl}/${this.engineId}/best_move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen, options })
    });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    this.log(data.logs);
    data.duration = performance.now() - start;
    return data; // { fen, nodes, move, logs, duration }
  }

  async findBestMoveIteratively(fen, options, callbacks) {
    if (callbacks && callbacks.onSearchBegin) callbacks.onSearchBegin({ depth: options.maxDepth });
    const result = await this.findBestMove(fen, options);

    // Construct the data object expected by onSearchComplete/processMoveResult
    const enhancedResult = {
      ...result,
      reason: (result.fen === fen) ? 'no_moves' : 'found_move'
    };

    if (callbacks && callbacks.onSearchComplete) {
      callbacks.onSearchComplete(enhancedResult);
    }
    return result;
  }

  async makeMove(fen, from, to, promotion = 'q') {
    const response = await fetch(`${this.baseUrl}/${this.engineId}/try_apply_move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen, from, to, promotion })
    });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    this.log(data.logs);
    // server returns { result: "FEN_OR_ERROR", logs: [...] }
    return data.result;
  }

  async checkEndGame(fen) {
    const response = await fetch(`${this.baseUrl}/${this.engineId}/check_end_game`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen })
    });
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    this.log(data.logs);
    // server returns { result: "status", logs: [...] }
    return data.result;
  }

  async resetGame() {
    console.log(`Resetting RemoteEngine ${this.engineId}...`);
    const response = await fetch(`${this.baseUrl}/${this.engineId}/reset_game`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    if (!response.ok) {
        console.error("Failed to reset remote engine:", await response.text());
    } else {
        const data = await response.json();
        if (data.warning) console.warn("Remote reset warning:", data.warning);
        else console.log("Remote engine reset successful.");
    }
  }

  async getVersion() {
    const response = await fetch(`${this.baseUrl}/${this.engineId}/version`);
    if (!response.ok) return "unknown";
    const data = await response.json();
    return data.version;
  }
}


let consoleStates = {
    white: { lastSql: null, count: 0, $lastDiv: null, isMuted: false },
    black: { lastSql: null, count: 0, $lastDiv: null, isMuted: false }
};

let consoleBuffers = {
    white: [],
    black: []
};

// Start a timer to "drip" logs from the buffer to the UI at a constant, readable rate.
const LOG_TICK_MS = 30;

setInterval(() => {
    adaptiveDripFlush('white');
    adaptiveDripFlush('black');
}, LOG_TICK_MS);

function logToPlayerConsole(color, sql) {
    if (!consoleBuffers[color]) return;
    consoleBuffers[color].push(sql);
}

function adaptiveDripFlush(color) {
    const buffer = consoleBuffers[color];
    if (!buffer || buffer.length === 0) return;
    
    const state = consoleStates[color];
    if (state.isMuted) {
        buffer.length = 0;
        return;
    }

    const $console = $(`#${color}-console`);
    const el = $console[0];

    // DRIP RATE: We keep it small to maintain the "streaming" feel.
    // If the buffer gets huge, we speed up slightly, but never "dump" everything.
    let dripCount = 2; 
    if (buffer.length > 500) dripCount = 10;
    else if (buffer.length > 100) dripCount = 5;
    
    const subset = buffer.splice(0, dripCount);
    
    const fragment = document.createDocumentFragment();
    let hasNewElements = false;

    subset.forEach(sql => {
        const normalizedSql = sql.trim();
        if (normalizedSql === state.lastSql && state.$lastDiv) {
            state.count++;
            state.$lastDiv.text(`${normalizedSql} (x${state.count})`);
        } else {
            state.lastSql = normalizedSql;
            state.count = 1;
            const div = document.createElement('div');
            div.textContent = normalizedSql;
            state.$lastDiv = $(div);
            fragment.appendChild(div);
            hasNewElements = true;
        }
    });
    
    if (hasNewElements) {
        el.appendChild(fragment);
    }
    
    // Keep the latest line in view
    el.scrollTop = el.scrollHeight;
}

function clearPlayerConsole(color) {
    const $console = $(`#${color}-console`);
    $console.empty();
    if (consoleStates[color]) {
        // Preserve the isMuted state during clear
        const wasMuted = consoleStates[color].isMuted;
        consoleStates[color] = { lastSql: null, count: 0, $lastDiv: null, isMuted: wasMuted };
    }
    // We do NOT clear consoleBuffers[color] here. 
    // This allows any remaining "backlog" from the engine to finish 
    // its smooth dripping effect even after the move has been applied.
}

function logPlayerStatus(color, status) {
    const $el = color === 'white' ? $player_status_white : $player_status_black;
    $el.text(status);
}

class EngineFactory {
    static async create(color) {
        const player = players[color];
        let engine;
        
        let playerType = player.player;
        if (playerType === 'human') {
            // Human Suggest Move fallback: use WASM engine or Native server based on availability
            playerType = isRestrictedMode ? 'duckdb_wasm' : 'duckdb_native';
        }
        
        switch (playerType) {
            case 'duckdb_wasm':
                engine = new WasmEngineAdapter();
                break;
            case 'duckdb_native':
                engine = new RemoteEngine(CONFIG.REMOTE_ENGINE_URL || 'http://localhost:3001', color === 'white' ? 'player_white' : 'player_black');
                break;
            case 'standard_js':
                engine = new StandardEngineAdapter();
                break;
            default:
                return null;
        }

        if (playerType !== 'standard_js') {
            engine.setQueryLogger((sql) => logToPlayerConsole(color, sql));
        }
        
        await engine.init();
        return engine;
    }
}


let last_fen = START_FEN
let fen_stack = [last_fen]
let is_move_legit = false
let is_thinking = false
let turn_start_time = 0;
let move_history = [];
let gameResult = '*';

// Player State
const players = {
  white: {
    player: 'human',
    running: false,
    engine: null,
    stats: { moves: 0, time: 0, search_time: 0, nodes: 0 },
    options: {
      ...DEFAULT_OPTIONS,
      randomize: true
    }
  },
  black: {
    player: 'duckdb_wasm',
    running: false,
    engine: null,
    stats: { moves: 0, time: 0, search_time: 0, nodes: 0 },
    options: {
      ...DEFAULT_OPTIONS,
      randomize: true
    }
  }
};

// --- Control Bindings ---

// White Buttons
$('#white-suggest-move').on('click', () => { if (!is_thinking) triggerChessMove(last_fen, true); });
$('#white-undo-move').on('click', undo_move);
$('#white-start-ai').on('click', () => startAI('white'));
$('#white-pause-ai').on('click', () => pauseAI('white'));

// Black Buttons
$('#black-suggest-move').on('click', () => { if (!is_thinking) triggerChessMove(last_fen, true); });
$('#black-undo-move').on('click', undo_move);
$('#black-start-ai').on('click', () => startAI('black'));
$('#black-pause-ai').on('click', () => pauseAI('black'));


$('#suggest_move').on('click', () => triggerChessMove(last_fen, true));
$('#undo_move').on('click', undo_move);


function updateLastMoveUI() {
  $last_white.html(null);
  $last_black.html(null);

  let whiteMove = null;
  let blackMove = null;

  // Find the last move by white and last move by black in move_history
  for (let i = move_history.length - 1; i >= 0; i--) {
    const m = move_history[i];
    if (m.color === 'White' && !whiteMove) whiteMove = m;
    if (m.color === 'Black' && !blackMove) blackMove = m;
    if (whiteMove && blackMove) break;
  }

  if (whiteMove) {
    $last_white.text(whiteMove.move);
    $last_white.attr('title', whiteMove.fen);
  }
  if (blackMove) {
    $last_black.text(blackMove.move);
    $last_black.attr('title', blackMove.fen);
  }
  if (blackMove) {
    $last_black.text(blackMove.move);
    $last_black.attr('title', blackMove.fen);
  }

  // Update Move Counters
  const whiteMoves = move_history.filter(m => m.color === 'White').length;
  const blackMoves = move_history.filter(m => m.color === 'Black').length;
  $move_count_white.text(whiteMoves);
  $move_count_black.text(blackMoves);
}

function undo_move() {
  if (is_thinking) return;

  // Undo 2 ply (1 full move)
  for (let i = 0; i < 2; i++) {
    if (fen_stack.length > 1) {
      fen_stack.pop();
      move_history.pop();
      evalHistory.pop();
    }
  }

  if (fen_stack.length === 0) {
    new_game(board.orientation);
  } else {
    last_fen = fen_stack[fen_stack.length - 1];
    board.position(last_fen);
    updateCapturedPieces(last_fen);
    updateLastMoveUI();
    renderEvalGraph();
    updateInteractiveMoveHistory();
  }
}


function getHistoryText() {
    if (move_history.length === 0) return null;
    
    function formatPlayerDetails(color) {
      const p = players[color];
      let details = `Player ${color.charAt(0).toUpperCase() + color.slice(1)}: ${p.player}`;
      if (p.player !== 'human') {
        const o = p.options;
        const isStandard = p.player === 'standard_js';
        const isSql = p.player === 'duckdb_wasm' || p.player === 'duckdb_native';
        
        details += ` (Strategy: ${o.strategy}, Max Depth: ${o.maxDepth}`;
        
        // Max Depth QS (not used in recursive CTE)
        if (o.strategy !== 'recursive') {
          details += `, Max Depth QS: ${o.maxDepthQS}`;
        }
        
        // Threads (SQL engines only)
        if (isSql) {
          details += `, Threads: ${o.maxThreads}`;
        }
        
        // TT (SQL batched_pvs only)
        if (isSql && o.strategy === 'batched_pvs') {
          details += `, TT: ${o.useTT ? 'on' : 'off'}`;
        }
        
        // Alpha-Beta (standard_js, or SQL batched_pvs)
        if (isStandard || (isSql && o.strategy === 'batched_pvs')) {
          details += `, Alpha-Beta: ${o.useAlphaBeta ? 'on' : 'off'}`;
        }
        
        // Move Ordering and Lossy Pruning (SQL batched_pvs only)
        if (isSql && o.strategy === 'batched_pvs') {
          const moveOrdering = [];
          if (o.useMVVLVA) moveOrdering.push('MVV-LVA');
          if (o.useTT) moveOrdering.push('TT');
          if (o.usePST) moveOrdering.push('PST');
          if (o.useKillers) moveOrdering.push('Killers');
          if (o.useHistory) moveOrdering.push('History');
          
          details += `, Move Ordering: ${moveOrdering.length > 0 ? moveOrdering.join(', ') : 'none'}`;
          
          const lossyPruning = [];
          if (o.useRFP) lossyPruning.push('RFP');
          if (o.useFFP) lossyPruning.push('FFP');
          if (o.useLMR) lossyPruning.push('LMR');
          if (o.useLMP) lossyPruning.push('LMP');
          
          details += `, Lossy Pruning: ${lossyPruning.length > 0 ? lossyPruning.join(', ') : 'none'}`;
        }
        
        details += `)`;
      }
      return details;
    }

    const playerHeader = `${formatPlayerDetails('white')}\n${formatPlayerDetails('black')}\n${'-'.repeat(40)}\nSeq, Color, FEN, Move, Score, Time, Nodes, EstSaved, Stats`;
    const lines = move_history.map(m => {
        let statsStr = '';
        let estSaved = '0';

        if (m.profiling && m.profiling.stats) {
            const s = m.profiling.stats;
            const parts = [];
            // PV Acc
            if (s.pv_accuracy && s.pv_accuracy.total > 0) {
                 const acc = Math.round((s.pv_accuracy.correct / s.pv_accuracy.total) * 100);
                 parts.push(`PV:${acc}%`);
            }
            // LMR
            if (s.lmr && s.lmr.researches > 0) {
                 parts.push(`LMR_Re:${s.lmr.researches}`);
            }
            // Timing
            if (s.timing) {
                const t = s.timing;
                // Init, PV, Prep, Expand, Deep, Score
                parts.push(`I:${Math.round(t.init)}`);
                parts.push(`PV:${Math.round(t.pv_search)}`);
                parts.push(`R(Pr:${Math.round(t.rest_prep)} Ex:${Math.round(t.rest_expand)} D:${Math.round(t.rest_deep)})`);
                parts.push(`S:${Math.round(t.scoring)}`);
            }
            // Est Saved
            if (s.pruning && s.pruning.estimated_nodes_avoided > 0) {
                estSaved = (s.pruning.estimated_nodes_avoided / 1000000).toFixed(1) + 'M';
            }

            statsStr = parts.join('|');
        }
        return `${m.id}, ${m.color}, ${m.fen}, ${m.move}, ${m.score || 0}, ${Math.round(m.duration)}ms, ${m.nodes}, ${estSaved}, ${statsStr}`;
    });
    return [playerHeader, ...lines].join('\n');
}

// =============================================================================
// PGN Export
// =============================================================================

/**
 * Parse a move display string like "P e2-e4" back to {piece, from, to}.
 * Returns null if parsing fails.
 */
function parseMoveString(moveStr) {
    const parts = moveStr.split(' ');
    if (parts.length !== 2) return null;
    const piece = parts[0];
    const squares = parts[1].split('-');
    if (squares.length !== 2) return null;
    const [from, to] = squares;
    // Validate algebraic notation
    if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to)) return null;
    return { piece, from, to };
}

/**
 * Build PGN header section including the Seven Tag Roster and custom engine tags.
 */
function buildPgnHeaders() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const dateStr = `${y}.${m}.${d}`;

    function formatPlayerName(color) {
        const p = players[color];
        if (p.player === 'human') return 'Human';
        const label = p.player === 'duckdb_native' ? 'DuckDB Native' :
                      p.player === 'duckdb_wasm' ? 'DuckDB WASM' :
                      p.player === 'standard_js' ? 'Standard JS Engine' : p.player;
        return `${label} (${p.options.strategy}, d=${p.options.maxDepth})`;
    }

    const result = gameResult || '*';

    const tags = [
        `[Event "Quack-Mate Engine Game"]`,
        `[Site "Quack-Mate Web UI"]`,
        `[Date "${dateStr}"]`,
        `[Round "?"]`,
        `[White "${formatPlayerName('white')}"]`,
        `[Black "${formatPlayerName('black')}"]`,
        `[Result "${result}"]`,
    ];

    // Custom engine metadata tags
    ['white', 'black'].forEach(color => {
        const p = players[color];
        if (p.player === 'human') return;
        const cap = color.charAt(0).toUpperCase() + color.slice(1);
        const engineLabel = p.player === 'duckdb_native' ? 'DuckDB Native' :
                            p.player === 'duckdb_wasm' ? 'DuckDB WASM' :
                            p.player === 'standard_js' ? 'Standard JS' : p.player;
        tags.push(`[${cap}Engine "${engineLabel}"]`);
        tags.push(`[${cap}Strategy "${p.options.strategy}"]`);
        tags.push(`[${cap}Depth "${p.options.maxDepth}"]`);
        if (p.options.maxDepthQS > 0) {
            tags.push(`[${cap}QuiescenceDepth "${p.options.maxDepthQS}"]`);
        }
        tags.push(`[${cap}Threads "${p.options.maxThreads}"]`);

        // Build config summary string
        if (p.options.strategy === 'batched_pvs') {
            const configs = [];
            if (p.options.useAlphaBeta) configs.push('Alpha-Beta');
            if (p.options.useTT) configs.push('TT');
            if (p.options.useMVVLVA) configs.push('MVV-LVA');
            if (p.options.usePST) configs.push('PST');
            if (p.options.useKillers) configs.push('Killers');
            if (p.options.useHistory) configs.push('History');
            if (p.options.useRFP) configs.push('RFP');
            if (p.options.useFFP) configs.push('FFP');
            if (p.options.useLMR) configs.push('LMR');
            if (p.options.useLMP) configs.push('LMP');
            if (configs.length > 0) {
                tags.push(`[${cap}Config "${configs.join(', ')}"]`);
            }
        }
    });

    return tags.join('\n');
}

/**
 * Format a per-move comment with engine metadata.
 */
function formatMoveComment(move) {
    const parts = [];
    if (move.score) parts.push(`score: ${move.score}`);
    parts.push(`nodes: ${move.nodes}`);
    parts.push(`time: ${Math.round(move.duration)}ms`);
    return parts.join(', ');
}

/**
 * Build the PGN movetext section with SAN annotations and engine comments.
 */
function buildPgnMovetext() {
    if (move_history.length === 0) return '';

    const lines = [];
    let moveNum = 1;

    for (let i = 0; i < move_history.length; i += 2) {
        const whiteMove = move_history[i];
        const blackMove = i + 1 < move_history.length ? move_history[i + 1] : null;

        let line = `${moveNum}.`;

        // --- White move ---
        const sanWhite = getSanForMove(i);
        line += ` ${sanWhite}`;
        line += ` { ${formatMoveComment(whiteMove)} }`;

        // --- Black move ---
        if (blackMove) {
            const sanBlack = getSanForMove(i + 1);
            line += ` ${sanBlack}`;
            line += ` { ${formatMoveComment(blackMove)} }`;
        }

        lines.push(line);
        moveNum++;
    }

    // Append game result
    const result = gameResult || '*';
    lines.push(result);

    return lines.join('\n');
}

/**
 * Compute the SAN string for a specific move in the history.
 * Uses fen_stack[i] for the position before the move and fen_stack[i+1] for after.
 */
function getSanForMove(index) {
    const move = move_history[index];
    if (!move) return '?';

    const fenBefore = fen_stack[index];
    const fenAfter = fen_stack[index + 1];
    if (!fenBefore || !fenAfter) return move.move || '?';

    const parsed = parseMoveString(move.move);
    if (!parsed) return move.move || '?';

    // Determine if the resulting position gives check
    const isCheck = isKingInCheck(fenAfter);

    // Determine if this move is checkmate
    const isLastMove = index === move_history.length - 1;
    let isCheckmate = false;
    if (isLastMove) {
        if (gameResult === '1-0' && move.color === 'White') isCheckmate = true;
        if (gameResult === '0-1' && move.color === 'Black') isCheckmate = true;
    }

    return sanFromMove(fenBefore, fenAfter, parsed, { isCheck, isCheckmate });
}

/**
 * Generate the complete PGN text for the current game.
 */
function getPgnText() {
    if (move_history.length === 0) return null;

    const headers = buildPgnHeaders();
    const movetext = buildPgnMovetext();

    return headers + '\n\n' + movetext + '\n';
}

/**
 * Generate a timestamped filename for the PGN download.
 */
function generatePgnFilename() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    return `QuackMate_${y}${m}${d}_${h}${min}${s}.pgn`;
}

/**
 * Trigger a browser file download from a text string.
 */
function downloadFile(content, filename) {
    const blob = new Blob([content], { type: 'application/x-chess-pgn' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function showPanicOverlay(error) {
    const overlay = document.createElement('div');
    overlay.className = 'panic-overlay';
    
    // Create container
    const container = document.createElement('div');
    container.className = 'panic-container';
    
    const title = document.createElement('h2');
    title.textContent = 'Critical Error';
    title.className = 'panic-title';
    
    const msg = document.createElement('div');
    msg.className = 'panic-message';
    msg.textContent = error || 'Unknown Error';
    
    const btnBox = document.createElement('div');
    
    const reloadBtn = document.createElement('button');
    reloadBtn.className = 'panic-button';
    reloadBtn.textContent = 'OK (Copy History & Reload)';
    
    reloadBtn.onclick = () => {
        reloadBtn.disabled = true;
        reloadBtn.textContent = 'Copying...';
        const text = getHistoryText();
        if(!text) {
             location.reload();
             return;
        }
        navigator.clipboard.writeText(text)
            .then(() => {
                reloadBtn.textContent = 'Copied! Reloading...';
                setTimeout(() => location.reload(), 500);
            })
            .catch(err => {
                console.error('Clipboard copy failed:', err);
                location.reload();
            });
    };
    
    btnBox.appendChild(reloadBtn);
    container.appendChild(title);
    container.appendChild(msg);
    container.appendChild(btnBox);
    overlay.appendChild(container);
    
    document.body.appendChild(overlay);
}

function panic(error) {
  console.error("Critical Error:", error);
  try {
      showPanicOverlay(error);
  } catch(e) {
      // Fallback
      alert("Critical Error Occurred:\n" + (error || "Unknown error") + "\n\nClick OK to reload.");
      location.reload();
  }
}

function check_panic_reply(reply) {
  if (reply == undefined || reply == 'illegal_input') {
    panic("Invalid engine reply: " + reply)
  }
}

function new_game(orientation, start_fen) {
  const custom_fen = start_fen || START_FEN;
  // Stop AIs
  pauseAI('white');
  pauseAI('black');

  // Reset Engine State (Clear Transposition Table etc.)
  ['white', 'black'].forEach(c => {
    if (players[c].engine && typeof players[c].engine.resetGame === 'function') {
      players[c].engine.resetGame().catch(console.error);
    }
  });

  board.orientation(orientation || 'white')
  board.position(custom_fen === START_FEN ? 'start' : custom_fen)
  $last_white.html(null)
  $last_black.html(null)
  $engineStatus.html('')
  clearPlayerConsole('white');
  clearPlayerConsole('black');
  $('#white-version-info').empty();
  $('#black-version-info').empty();
  logPlayerStatus('white', 'New game started.');
  logPlayerStatus('black', 'New game started.');
  $move_count_white.text('0');
  $move_count_black.text('0');
  players.white.stats = { moves: 0, time: 0, search_time: 0, nodes: 0 };
  players.black.stats = { moves: 0, time: 0, search_time: 0, nodes: 0 };
  updateStatsUI('white');
  updateStatsUI('black');

  // Reset evaluation graph
  evalHistory = [];
  renderEvalGraph();

  last_fen = custom_fen
  fen_stack = [custom_fen]
  move_history = []
  gameResult = '*';
  is_move_legit = false
  turn_start_time = performance.now();
  updateCapturedPieces(last_fen);
  updateInteractiveMoveHistory();
}

function startAI(color) {
  players[color].running = true;
  updateStatus(color);

  // If it's this player's turn, trigger move
  const turn = getTurn(last_fen) === 'w' ? 'white' : 'black';
  if (turn === color && !is_thinking) {
    triggerChessMove(last_fen);
  }
}

function pauseAI(color) {
  players[color].running = false;
  updateStatus(color);
}

function updateStatus(color) {
  // Toggle buttons based on running state
  const p = players[color];
  const isRunning = p.running;

  const $startBtn = color === 'white' ? $('#white-start-ai') : $('#black-start-ai');
  const $pauseBtn = color === 'white' ? $('#white-pause-ai') : $('#black-pause-ai');

  if (isRunning) {
    $startBtn.prop('disabled', true).css('opacity', 0.5);
    $pauseBtn.prop('disabled', false).css('opacity', 1.0);
  } else {
    $startBtn.prop('disabled', false).css('opacity', 1.0);
    $pauseBtn.prop('disabled', true).css('opacity', 0.5);
  }
}

async function handle_end_game(fen) {
  try {
    // Check 3-fold repetition
    const baseFen = (f) => f.split(' ').slice(0, 4).join(' ');
    const fenCounts = {};
    for (const f of fen_stack) {
      const bf = baseFen(f);
      fenCounts[bf] = (fenCounts[bf] || 0) + 1;
      if (fenCounts[bf] >= 3) {
        alert("The game has ended with a draw (3-fold repetition). Please start a new game.");
        gameResult = '1/2-1/2';
        return;
      }
    }

    // Check 50-move rule
    const halfMoveClock = parseInt(fen.split(' ')[4] || '0', 10);
    if (halfMoveClock >= 100) {
      alert("The game has ended with a draw (50-move rule). Please start a new game.");
      gameResult = '1/2-1/2';
      return;
    }

    let reply = await check_end_game(fen)
    check_panic_reply(reply)
    if (reply == "none") {
      triggerChessMove(fen);
      return
    }
    if (reply == "draw") {
      alert("The game has ended with a draw. Please start a new game.")
      gameResult = '1/2-1/2';
    } else {
      let res = reply.match(/^checkmate (white|black)$/)
      if (res) {
        alert("The game has ended with " + res[1] + " in checkmate. Please start a new game.")
        gameResult = res[1] === 'white' ? '0-1' : '1-0';
      } else {
        panic("Unexpected game end state (expected 'checkmate' or 'draw'): " + reply)
      }
    }
  } catch (e) {
    console.error("handle_end_game error:", e);
    // Continue anyway if arbiter check failed
    triggerChessMove(fen);
  }
}

function record_last_move(fen, displayStr, profiling, duration, nodes) {
  last_fen = fen
  fen_stack.push(fen)
  updateCapturedPieces(fen)

  let colorMoved = '';
  if (fen.search(/ w /) != -1) {
    // Active turn is White, so Black just moved
    colorMoved = 'Black';
    $last_black.text(displayStr || fen);
    $last_black.attr('title', fen);
  } else if (fen.search(/ b /) != -1) {
    // Active turn is Black, so White just moved
    colorMoved = 'White';
    $last_white.text(displayStr || fen);
    $last_white.attr('title', fen);
  } else {
    panic("Invalid FEN active turn: " + fen)
  }
  
  // Calculate new move counts
  const currentWhiteMoves = parseInt($move_count_white.text()) || 0;
  const currentBlackMoves = parseInt($move_count_black.text()) || 0;
  
  if (colorMoved === 'White') {
      $move_count_white.text(currentWhiteMoves + 1);
  } else {
      $move_count_black.text(currentBlackMoves + 1);
  }

  move_history.push({
    id: move_history.length + 1,
    color: colorMoved,
    fen: fen,
    move: displayStr || '-',
    score: profiling && profiling.score ? profiling.score : (profiling && profiling.stats && profiling.stats.score ? profiling.stats.score : 0),
    profiling: profiling,
    duration: duration || 0,
    nodes: nodes || 0
  });

  updateInteractiveMoveHistory();
}

function updateInteractiveMoveHistory() {
  const $el = $('#interactive-move-history');
  if (!$el.length) return;
  const pgnMoves = buildPgnMovetext();
  $el.text(pgnMoves || 'No moves recorded yet.');
}

function getTurn(fen) {
  return fen.split(' ')[1]; // 'w' or 'b'
}

function bindEngineOptions() {
  $('.engine-option').on('change', function() {
    const $el = $(this);
    const color = $el.data('color'); // 'white' or 'black'
    const field = $el.data('field'); // e.g., 'useLMR' or 'player'
    
    let val = $el.is(':checkbox') ? $el.prop('checked') : $el.val();
    let finalVal = (typeof val === 'string' && !isNaN(val) && val !== '') ? parseInt(val) : val;

    // Enforce Restricted Mode Limits
    if (isRestrictedMode) {
        if (field === 'maxThreads' && finalVal > RESTRICTED_MODE_LIMITS.maxThreads) {
            finalVal = RESTRICTED_MODE_LIMITS.maxThreads;
            $el.val(RESTRICTED_MODE_LIMITS.maxThreads);
        }
    }

    if (field === 'maxDepth') {
        if (isRestrictedMode) {
            const currentStrategy = players[color].options.strategy;
            const maxDepthLimit = (currentStrategy === 'recursive') ? 3 : RESTRICTED_MODE_LIMITS.maxDepth;
            if (finalVal > maxDepthLimit) {
                finalVal = maxDepthLimit;
                $el.val(maxDepthLimit);
            }
        }
        // Record choice for this strategy
        players[color].lastDepthByStrategy = players[color].lastDepthByStrategy || {};
        players[color].lastDepthByStrategy[players[color].options.strategy] = finalVal;
    }

    if (field === 'player') {
        if (players[color].player !== finalVal) {
            if (players[color].engine && players[color].engine.worker) {
                try { players[color].engine.worker.terminate(); } catch(e) {}
            }
            players[color].engine = null;
            players[color].engineType = null;
            $(`#${color}-version-info`).empty();
        }
        players[color].player = finalVal;
        updateStrategyOptions(color);
    } else {
        players[color].options[field] = finalVal;
    }
    
    // Trigger any dependent UI visibility logic
    configVisibility(color);
  });
}

bindEngineOptions();

function updateStrategyOptions(color) {
    const p = players[color];
    const $select = $(`#${color}-strategy-select`);
    const isStandard = p.player === 'standard_js';
    
    const prevStrategy = p.options.strategy;
    $select.empty();
    
    if (isStandard) {
        if (prevStrategy !== 'minimax') {
            p.options.lastSqlStrategy = prevStrategy;
        }
        $select.append(new Option("Minimax", "minimax"));
        p.options.strategy = "minimax";
        $select.val("minimax");
    } else {
        $select.append(new Option("Recursive CTE", "recursive"));
        $select.append(new Option("Batched PVS", "batched_pvs"));
        
        // Restore from memory if previous was minimax, or preserve if already valid
        let target = prevStrategy;
        if (target === 'minimax') {
            target = p.options.lastSqlStrategy || 'batched_pvs';
        }

        if (target === 'recursive' || target === 'batched_pvs') {
            $select.val(target);
            p.options.strategy = target;
        } else {
            $select.val('batched_pvs');
            p.options.strategy = 'batched_pvs';
        }
    }
}

function configVisibility(color) {
    const p = players[color];
    const strategy = p.options.strategy;

    // Initialize depth memory if not present
    p.lastDepthByStrategy = p.lastDepthByStrategy || {
        recursive: isRestrictedMode ? 3 : 3,
        batched_pvs: p.options.maxDepth,
        minimax: p.options.maxDepth
    };

    // When strategy changes, restore last recorded depth for the new strategy
    if (p.lastStrategy !== strategy) {
        p.lastStrategy = strategy;
        const savedDepth = p.lastDepthByStrategy[strategy];
        if (savedDepth !== undefined) {
            p.options.maxDepth = savedDepth;
            $(`#${color}-max-depth`).val(savedDepth);
        }
    }

    // Enforce Restricted Mode strategy-specific limits
    if (isRestrictedMode) {
        const maxDepthLimit = (strategy === 'recursive') ? 3 : RESTRICTED_MODE_LIMITS.maxDepth;
        $(`#${color}-max-depth`).attr('max', maxDepthLimit);
        if (p.options.maxDepth > maxDepthLimit) {
            p.options.maxDepth = maxDepthLimit;
            $(`#${color}-max-depth`).val(maxDepthLimit);
            p.lastDepthByStrategy[strategy] = maxDepthLimit; // Update record to capped value
        }
    } else {
        $(`#${color}-max-depth`).attr('max', 10);
    }

    const isWhite = color === 'white';
    const $settings = $(`#${color}-ai-settings`);
    const $ttContainer = $(`#${color}-tt-container`);
    const $threadsContainer = $(`#${color}-threads-container`);
    const $abContainer = $(`#${color}-ab-container`);
    const $pvsOptimizations = $(`#${color}-pvs-optimizations`);
    const $consoleContainer = $(`#${color}-console`).parent();
    const $humanControls = $(`#${color}-human-controls`);
    const $aiControls = $(`#${color}-ai-controls`);

    // 1. Basic Player Type visibility
    if (p.player === 'human') {
        $settings.hide();
        $aiControls.hide();
        $humanControls.show();
        $consoleContainer.show(); // SQL console for human moves (arbiter)
        return;
    }

    $settings.show();
    $aiControls.show();
    $humanControls.hide();

    // 2. Engine and Strategy Specific visibility
    const $qsContainer = $(`#${color}-qs-depth-container`);
    
    // Universal Strategy Rules
    if (strategy === 'recursive') {
        $qsContainer.hide();
        $ttContainer.hide();
        $abContainer.hide();
        $pvsOptimizations.hide();
    } else {
        $qsContainer.show();
        
        // Engine-dependent rules for non-recursive strategies
        if (p.player === 'standard_js') {
            $ttContainer.hide();
            $threadsContainer.hide();
            $abContainer.show();
            $pvsOptimizations.hide();
            $consoleContainer.hide();
        } else {
            // DuckDB Engines
            $threadsContainer.show();
            $consoleContainer.show();
            
            if (strategy === 'batched_pvs') {
                $ttContainer.show();
                $abContainer.show();
                $pvsOptimizations.show();
            } else {
                // Minimax or others
                $ttContainer.hide();
                $abContainer.hide();
                $pvsOptimizations.hide();
            }
        }
    }
}

// Initialize UI from Defaults
function initUI() {
  // Layout Adjustment: Move Status next to Last Move
  $player_status_white.insertAfter($last_white).css({ 'display': 'inline-block', 'margin-left': '10px', 'font-size': '0.9em', 'color': '#aaa' });
  $player_status_black.insertAfter($last_black).css({ 'display': 'inline-block', 'margin-left': '10px', 'font-size': '0.9em', 'color': '#aaa' });
  $last_white.css('display', 'inline-block');
  $last_black.css('display', 'inline-block');

  if (isRestrictedMode) {
      console.log("Restricted Mode: Server not found. Capping resources.");
      $('option[value="duckdb_native"]').each(function() {
          const $opt = $(this);
          $opt.prop('disabled', true);
          if (!$opt.text().includes("(Unavailable)")) {
              $opt.text($opt.text() + " (Unavailable)");
          }
      });
      
      // Cap initial UI values
      $('#white-max-threads, #black-max-threads').attr('max', RESTRICTED_MODE_LIMITS.maxThreads);
      $('#white-max-depth, #black-max-depth').attr('max', RESTRICTED_MODE_LIMITS.maxDepth);
      
      if (players.white.options.maxThreads > RESTRICTED_MODE_LIMITS.maxThreads) players.white.options.maxThreads = RESTRICTED_MODE_LIMITS.maxThreads;
      if (players.black.options.maxThreads > RESTRICTED_MODE_LIMITS.maxThreads) players.black.options.maxThreads = RESTRICTED_MODE_LIMITS.maxThreads;
      if (players.white.options.maxDepth > RESTRICTED_MODE_LIMITS.maxDepth) players.white.options.maxDepth = RESTRICTED_MODE_LIMITS.maxDepth;
      if (players.black.options.maxDepth > RESTRICTED_MODE_LIMITS.maxDepth) players.black.options.maxDepth = RESTRICTED_MODE_LIMITS.maxDepth;

      $('#help-restricted-section').show();
  } else {
      $('#help-restricted-section').hide();
  }

  // Add Copy FEN listeners
  $last_white.on('click', function () {
    const fen = $(this).attr('title');
    if (fen) {
      navigator.clipboard.writeText(fen).then(() => {
        const originalText = $(this).text();
        $(this).text("Copied!");
        setTimeout(() => $(this).text(originalText), 1000);
      });
    }
  });
  $last_black.on('click', function () {
    const fen = $(this).attr('title');
    if (fen) {
      navigator.clipboard.writeText(fen).then(() => {
        const originalText = $(this).text();
        $(this).text("Copied!");
        setTimeout(() => $(this).text(originalText), 1000);
      });
    }
  });

  // Synchronize UI elements with player objects
  const syncPlayerUI = (color) => {
      updateStrategyOptions(color);
      
      $(`.engine-option[data-color="${color}"]`).each(function() {
          const $el = $(this);
          const field = $el.data('field');
          const val = (field === 'player') ? players[color].player : players[color].options[field];
          
          if ($el.is(':checkbox')) {
              $el.prop('checked', !!val);
          } else {
              $el.val(val);
          }
      });

      configVisibility(color);
  };

  syncPlayerUI('white');
  syncPlayerUI('black');

  // Init button states
  updateStatus('white');
  updateStatus('black');
}


function setThinking(thinking) {
  is_thinking = thinking;
}

// --- Engine Execution ---

async function getOrInitEngine(color) {
  const player = players[color];
  const targetType = player.player;

  if (!player.engine || player.engineType !== targetType) {
    if (player.engine && player.engine.worker) {
      try { player.engine.worker.terminate(); } catch(e) {}
    }
    logPlayerStatus(color, `Initializing ${color} engine...`);
    player.engine = await EngineFactory.create(color);
    player.engineType = targetType;
  }

  if (player.player === 'duckdb_native' || player.player === 'duckdb_wasm') {
    // Display version info
    try {
        const version = await player.engine.getVersion();
        console.log(`${color} engine version: ${version}`);
        $(`#${color}-version-info`).text(`DuckDB ${version}`);
    } catch (e) {
        console.warn(`Failed to get version for ${color} engine:`, e);
    }
  } else if (player.player === 'standard_js') {
    $(`#${color}-version-info`).text('DFS JS Engine');
  } else {
    $(`#${color}-version-info`).empty();
  }
  return player.engine;
}

async function triggerChessMove(fromFEN, forceAI = false) {
  if (is_thinking) return;

  const turn = getTurn(fromFEN) === 'w' ? 'white' : 'black';
  const player = players[turn];

  console.log(`[DEBUG] triggerChessMove called. Turn: ${turn}, Player: ${player.player}, Running: ${player.running}, ForceAI: ${forceAI}, IsThinking: ${is_thinking}`);
  console.log(`[DEBUG] FEN: ${fromFEN}`);
  
  if (player.player !== 'human') {
    if (!player.running && !forceAI) {
      console.log(`[DEBUG] AI is paused. Exiting.`);
      return; // AI is paused
    }
  } else {
    // Human
    if (!forceAI) {
        console.log(`[DEBUG] Waiting for human. Exiting.`);
        return; // Wait for human input
    }
  }

  setThinking(true);
  logPlayerStatus(turn, 'Thinking...');

  try {
    const engine = await getOrInitEngine(turn);
    logPlayerStatus(turn, 'Thinking...');
    const options = { ...player.options, fenHistory: fen_stack };

    // Clear console before starting new search
    clearPlayerConsole(turn);

    // Direct search
    const reply = await engine.findBestMove(fromFEN, options);
    processMoveResult({
      reason: reply.fen === fromFEN ? 'no_moves' : 'found_move',
      fen: reply.fen,
      nodes: reply.nodes,
      move: reply.move,
      score: reply.score,
      search_duration: reply.search_duration,
      profiling: reply.profiling || (reply.stats ? { stats: reply.stats, score: reply.score } : null)
    }, reply.duration, turn);

  } catch (e) {
    console.error(e);
    panic("Error during move calculation: " + e.message);
  }
}

function formatTime(ms) {
  if (ms >= 1000) return (ms / 1000).toFixed(2) + 's';
  return Math.round(ms) + 'ms';
}

function formatSearchStatsTable(turn, profiling, playerState) {
  const p = playerState;
  const isHuman = p.player === 'human';
  const colorName = turn === 'white' ? 'White' : 'Black';

  if (!profiling && p.stats.moves === 0) {
    return `<span class="sql-stats-comment">-- DuckDB SQL Search Profiler [${colorName}]\n-- Waiting for move calculation...</span>`;
  }

  const avgTime = p.stats.moves > 0 ? Math.round(p.stats.time / p.stats.moves) : 0;
  const avgNodes = p.stats.moves > 0 ? Math.round(p.stats.nodes / p.stats.moves) : 0;

  let out = '';
  out += `<span class="sql-stats-comment">-- DuckDB SQL Search Profiler [${colorName} - Move ${p.stats.moves}]</span>\n`;

  if (isHuman) {
    out += `┌────────────────────────────┬────────────────┐\n`;
    out += `│ <span class="sql-stats-header">Human Player Metric       </span> │ <span class="sql-stats-header">Value         </span> │\n`;
    out += `├────────────────────────────┼────────────────┤\n`;
    out += `│ Total Moves Played         │ <span class="sql-stats-num">${String(p.stats.moves).padStart(14)}</span> │\n`;
    out += `│ Total Move Time            │ <span class="sql-stats-num">${formatTime(p.stats.time).padStart(14)}</span> │\n`;
    out += `│ Average Time per Move      │ <span class="sql-stats-num">${formatTime(avgTime).padStart(14)}</span> │\n`;
    out += `└────────────────────────────┴────────────────┘\n`;
    return out;
  }

  // AI Search with Profiling Stats
  const s = profiling && profiling.stats ? profiling.stats : null;
  const t = s && s.timing ? s.timing : null;

  const col1W = 20; // Stage
  const col2W = 10; // Time
  const col3W = 21; // Metric
  const col4W = 16; // Value

  out += `┌──────────────────────┬────────────┬───────────────────────┬──────────────────┐\n`;
  out += `│ <span class="sql-stats-header">Search Component    </span> │ <span class="sql-stats-header">Duration </span>  │ <span class="sql-stats-header">Optimization Metric  </span> │ <span class="sql-stats-header">Value           </span> │\n`;
  out += `├──────────────────────┼────────────┼───────────────────────┼──────────────────┤\n`;

  // Row 1: Init & Nodes
  const r1Comp = 'Initialization';
  const r1Time = t ? `${Math.round(t.init)}ms` : '-';
  const r1Met = 'Nodes Evaluated';
  const r1Val = profiling && profiling.nodes !== undefined ? (profiling.nodes).toLocaleString() : (p.stats.nodes > 0 ? p.stats.nodes.toLocaleString() : '-');
  out += `│ ${r1Comp.padEnd(col1W)} │ <span class="sql-stats-num">${r1Time.padStart(col2W)}</span> │ ${r1Met.padEnd(col3W)} │ <span class="sql-stats-num">${r1Val.padStart(col4W)}</span> │\n`;

  // Row 2: PV & Stability
  const r2Comp = 'PV Search';
  const r2Time = t ? `${Math.round(t.pv_search)}ms` : '-';
  const r2Met = 'PV Stability';
  let r2Val = '-';
  if (s && s.pv_accuracy && s.pv_accuracy.total > 0) {
    const acc = Math.round((s.pv_accuracy.correct / s.pv_accuracy.total) * 100);
    r2Val = `${acc}% (${s.pv_accuracy.correct}/${s.pv_accuracy.total})`;
  }
  out += `│ ${r2Comp.padEnd(col1W)} │ <span class="sql-stats-num">${r2Time.padStart(col2W)}</span> │ ${r2Met.padEnd(col3W)} │ <span class="sql-stats-num">${r2Val.padStart(col4W)}</span> │\n`;

  // Row 3: Rest Expand & LMR
  const r3Comp = 'Rest Expansion';
  const r3Time = t ? `${Math.round(t.rest_prep + t.rest_expand + t.rest_overhead)}ms` : '-';
  const r3Met = 'LMR Researches';
  let r3Val = '-';
  if (s && s.lmr && s.lmr.reductions > 0) {
    const rate = Math.round((s.lmr.researches / s.lmr.reductions) * 100);
    r3Val = `${s.lmr.researches}/${s.lmr.reductions} (${rate}%)`;
  }
  out += `│ ${r3Comp.padEnd(col1W)} │ <span class="sql-stats-num">${r3Time.padStart(col2W)}</span> │ ${r3Met.padEnd(col3W)} │ <span class="sql-stats-num">${r3Val.padStart(col4W)}</span> │\n`;

  // Row 4: Deepening & Reduction Rate
  const r4Comp = 'Deepening (PVS)';
  const r4Time = t ? `${Math.round(t.rest_deep)}ms` : '-';
  const r4Met = 'Reduction Rate';
  let r4Val = '-';
  if (s && s.lmr && s.lmr.total_batches > 0) {
    const reductionRate = Math.round((s.lmr.reductions / s.lmr.total_batches) * 100);
    r4Val = `${reductionRate}% (${s.lmr.reductions}/${s.lmr.total_batches})`;
  }
  out += `│ ${r4Comp.padEnd(col1W)} │ <span class="sql-stats-num">${r4Time.padStart(col2W)}</span> │ ${r4Met.padEnd(col3W)} │ <span class="sql-stats-num">${r4Val.padStart(col4W)}</span> │\n`;

  // Row 5: Scoring & Pruned
  const r5Comp = 'Minimax Scoring';
  const r5Time = t ? `${Math.round(t.scoring)}ms` : '-';
  const r5Met = 'Pruned Branches';
  const r5Val = s && s.pruning ? String(s.pruning.pruned_parents) : '-';
  out += `│ ${r5Comp.padEnd(col1W)} │ <span class="sql-stats-num">${r5Time.padStart(col2W)}</span> │ ${r5Met.padEnd(col3W)} │ <span class="sql-stats-num">${r5Val.padStart(col4W)}</span> │\n`;

  // Row 6: Total Duration & Nodes Avoided
  const r6Comp = 'Total Search Time';
  const r6Time = profiling && profiling.duration ? `${Math.round(profiling.duration)}ms` : (p.stats.time > 0 ? `${Math.round(p.stats.time)}ms` : '-');
  const r6Met = 'Nodes Avoided';
  let r6Val = '-';
  if (s && s.pruning && s.pruning.estimated_nodes_avoided > 0) {
    r6Val = (s.pruning.estimated_nodes_avoided / 1000000).toFixed(2) + 'M';
  }
  out += `├──────────────────────┼────────────┼───────────────────────┼──────────────────┤\n`;
  out += `│ ${r6Comp.padEnd(col1W)} │ <span class="sql-stats-num">${r6Time.padStart(col2W)}</span> │ ${r6Met.padEnd(col3W)} │ <span class="sql-stats-num">${r6Val.padStart(col4W)}</span> │\n`;

  // Row 7: Game Averages
  const r7Comp = 'Avg Move (Game)';
  const r7Time = p.stats.moves > 0 ? formatTime(avgTime) : '-';
  const r7Met = 'Avg Nodes (Game)';
  const r7Val = p.stats.moves > 0 ? avgNodes.toLocaleString() : '-';
  out += `│ ${r7Comp.padEnd(col1W)} │ <span class="sql-stats-num">${r7Time.padStart(col2W)}</span> │ ${r7Met.padEnd(col3W)} │ <span class="sql-stats-num">${r7Val.padStart(col4W)}</span> │\n`;
  out += `└──────────────────────┴────────────┴───────────────────────┴──────────────────┘\n`;

  return out;
}

function updateStatsUI(turn, profiling) {
  const p = players[turn];
  const $searchStats = $(`#${turn}-search-stats`);

  if ($searchStats.length) {
    const tableHtml = formatSearchStatsTable(turn, profiling, p);
    $searchStats.html(tableHtml);
  }
}

const SCORE_CAP = 10000;  // only clamp mate scores, preserve real centipawn values

function clampScore(s) {
    return Math.max(-SCORE_CAP, Math.min(SCORE_CAP, s));
}

function renderEvalGraph() {
    const container = document.getElementById('eval-graph');
    if (!container) return;

    if (evalHistory.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #888; font-size: 11px; padding: 12px 0;">No moves played yet</div>';
        return;
    }

    const width = 600;
    const height = 110;
    const padding = { top: 12, right: 20, bottom: 22, left: 45 };

    // Compute Y range from clamped scores, with 10% headroom
    const scores = evalHistory.map(e => clampScore(e.score));
    const rawMax = Math.max(...scores);
    const rawMin = Math.min(...scores);
    const absMax = Math.max(Math.abs(rawMax), Math.abs(rawMin), 150);
    const headroom = Math.max(absMax * 0.1, 40);  // 10% padding, minimum 40cp
    const yMax = absMax + headroom;
    const yMin = -(absMax + headroom);

    // Scale functions
    const xScale = i => padding.left + (i / Math.max(evalHistory.length - 1, 1)) * (width - padding.left - padding.right);
    const yScale = v => padding.top + (yMax - v) / (yMax - yMin) * (height - padding.top - padding.bottom);

    // Build SVG with viewBox for responsive scaling
    let svg = `<svg viewBox="0 0 ${width} ${height}" class="eval-graph-svg" preserveAspectRatio="none">`;

    // Zero line
    const zeroY = yScale(0);
    svg += `<line x1="${padding.left}" y1="${zeroY}" x2="${width - padding.right}" y2="${zeroY}"
             stroke="#999" stroke-dasharray="3,3" stroke-width="1"/>`;

    // Y-axis labels (rounded to integers)
    svg += `<text x="${padding.left - 5}" y="${yScale(yMax) + 4}" text-anchor="end" font-size="9" fill="#777">+${Math.round(yMax)}</text>`;
    svg += `<text x="${padding.left - 5}" y="${zeroY + 3}" text-anchor="end" font-size="9" fill="#777">0</text>`;
    svg += `<text x="${padding.left - 5}" y="${yScale(yMin) + 4}" text-anchor="end" font-size="9" fill="#777">${Math.round(yMin)}</text>`;

    // Polyline points (clamped)
    const points = evalHistory.map((e, i) => `${xScale(i)},${yScale(clampScore(e.score))}`).join(' ');
    svg += `<polyline points="${points}" fill="none" stroke="#2b78e4" stroke-width="2" stroke-linejoin="round"/>`;

    // Dots on each point — white for White's moves, dark for Black's
    evalHistory.forEach((e, i) => {
        const moveNum = Math.ceil(e.moveNumber / 2);
        const plyNotation = e.turn === 'white' ? `${moveNum}.` : `${moveNum}...`;
        const colorLabel = e.turn === 'white' ? 'White' : 'Black';
        const cp = e.score;
        let scoreLabel;
        if (cp > 0) {
            scoreLabel = `+${(cp / 100).toFixed(2)} (+${cp} cp White adv)`;
        } else if (cp < 0) {
            scoreLabel = `${(cp / 100).toFixed(2)} (${cp} cp Black adv)`;
        } else {
            scoreLabel = `0.00 (Equal)`;
        }

        const fillColor = e.turn === 'white' ? '#ffffff' : '#111111';
        svg += `<circle cx="${xScale(i)}" cy="${yScale(clampScore(e.score))}" r="3.5"
                 fill="${fillColor}" stroke="#2b78e4" stroke-width="1.5">
                 <title>${plyNotation} (${colorLabel}): ${scoreLabel}</title>
               </circle>`;
    });

    // X-axis labels (full move numbers e.g. 1, 2, 3...)
    const step = Math.max(1, Math.floor(evalHistory.length / 10));
    for (let i = 0; i < evalHistory.length; i += step) {
        const fullMoveNum = Math.ceil(evalHistory[i].moveNumber / 2);
        svg += `<text x="${xScale(i)}" y="${height - 4}" text-anchor="middle" font-size="9" fill="#777">${fullMoveNum}</text>`;
    }

    svg += '</svg>';
    container.innerHTML = svg;
}

function processMoveResult(data, duration, turn) {
  setThinking(false);
  if (data.reason === 'found_move') {
    is_move_legit = true;

    // Record evaluation normalized to White's perspective (+ = White advantage, - = Black advantage)
    const normalizedScore = turn === 'white' ? (data.score || 0) : -(data.score || 0);
    evalHistory.push({
        moveNumber: evalHistory.length + 1,
        score: normalizedScore,
        turn: turn
    });
    renderEvalGraph();

    // Update Stats
    players[turn].stats.moves++;
    players[turn].stats.time += duration;
    players[turn].stats.search_time += (data.search_duration || duration);
    players[turn].stats.nodes += (data.nodes || 0);

    const effectiveDuration = data.search_duration || duration;

    updateStatsUI(turn, {
      ...data.profiling,
      duration: effectiveDuration,
      nodes: data.nodes
    });

    if (turn === 'white') $player_status_white.text('Move found.');
    else $player_status_black.text('Move found.');

    // Format move string
    let moveDisplay = data.fen; // Fallback
    if (data.move) {
      // data.move.from is already algebraic (e.g. 'e2'), so usage of squareIndexToAlgebraic is redundant and causes NaN
      const fromAlg = data.move.from;
      const toAlg = data.move.to;
      const piece = data.move.piece; // 'P', 'N', etc.
      moveDisplay = `${piece} ${fromAlg}-${toAlg}`;
    }

    if (sanitizeTimeout) {
      clearTimeout(sanitizeTimeout);
      sanitizeTimeout = null;
    }

    record_last_move(data.fen, moveDisplay, data.profiling, effectiveDuration, data.nodes);
    board.position(last_fen, true);
    updateCapturedPieces(last_fen);

    // Wait for animation to finish (chessboard.js default is 200ms) before checking game end / next move
    window.setTimeout(() => {
      onMoveEnd(null, null);
    }, 250);
  } else {
    if (turn === 'white') $player_status_white.text('No legal moves.');
    else $player_status_black.text('No legal moves.');
    // checkmate or stalemate should be caught by handle_end_game
    handle_end_game(last_fen);
  }
}

// --- Board Callbacks ---

function promptPromotion(color) {
  return new Promise((resolve) => {
    const $modal = $('#modal-promotion');
    const prefix = color === 'white' ? 'w' : 'b';
    $('#promo-img-q').attr('src', `img/chesspieces/wikipedia/${prefix}Q.png`);
    $('#promo-img-r').attr('src', `img/chesspieces/wikipedia/${prefix}R.png`);
    $('#promo-img-b').attr('src', `img/chesspieces/wikipedia/${prefix}B.png`);
    $('#promo-img-n').attr('src', `img/chesspieces/wikipedia/${prefix}N.png`);

    $modal.addClass('active');

    const cleanup = () => {
      $modal.removeClass('active');
      $('.promo-choice-btn').off('click', handleChoice);
      $('#modal-cancel-promotion').off('click', handleCancel);
      $modal.off('click', handleOverlayClick);
      $(document).off('keydown', handleKeyDown);
    };

    const handleChoice = function() {
      const promo = $(this).data('promo');
      cleanup();
      resolve(promo);
    };

    const handleCancel = function() {
      cleanup();
      resolve(null);
    };

    const handleOverlayClick = function(e) {
      if (e.target === this) {
        cleanup();
        resolve(null);
      }
    };

    const handleKeyDown = function(e) {
      if (e.key === 'Escape') {
        cleanup();
        resolve(null);
      }
    };

    $('.promo-choice-btn').on('click', handleChoice);
    $('#modal-cancel-promotion').on('click', handleCancel);
    $modal.on('click', handleOverlayClick);
    $(document).on('keydown', handleKeyDown);
  });
}

async function onDrop(source, target, piece, newPos, oldPos, orientation) {
  if (is_thinking) return 'snapback';

  // Prevent human moving if it's AI turn (unless we want to allow override?)
  const turn = getTurn(last_fen) === 'w' ? 'white' : 'black';
  if (players[turn].player !== 'human') return 'snapback';

  if (target === 'offboard') return;

  const isPromotion = (piece === 'wP' && target.charAt(1) === '8') || (piece === 'bP' && target.charAt(1) === '1');
  let promotionChoice = 'q';
  let reply;

  // Use default engine (arbiter) for validation
  // Hook up logger to human console
  const color = turn;
  clearPlayerConsole(color); // Clear previous logs
  setQueryLogger((sql) => {
    logToPlayerConsole(color, sql);
  });

  if (isPromotion) {
    // Validate move legality before showing the promotion modal
    const testReply = await try_apply_move(last_fen, source, target, 'q');
    if (testReply == undefined || testReply === 'illegal_move' || testReply.search(/illegal/) !== -1) {
      setQueryLogger(null);
      console.error(`[DEBUG] Move Rejected (illegal pawn move): ${source}->${target}. Reply: ${testReply}`);
      is_move_legit = false;
      board.position(last_fen, true);
      return 'snapback';
    }

    // Move is legal: prompt the human player for their promotion piece choice
    promotionChoice = await promptPromotion(turn);
    if (!promotionChoice) {
      // User cancelled promotion (clicked outside / pressed Escape / Cancel button)
      setQueryLogger(null);
      board.position(last_fen, true);
      return 'snapback';
    }

    if (promotionChoice === 'q') {
      reply = testReply;
    } else {
      reply = await try_apply_move(last_fen, source, target, promotionChoice);
    }
  } else {
    console.log(`[DEBUG] Human move Attempt: ${source}->${target} | FEN: ${last_fen}`);
    reply = await try_apply_move(last_fen, source, target);
  }

  setQueryLogger(null); // Detach logger

  console.log(`[DEBUG] try_apply_move reply:`, reply);

  if (reply == undefined || reply == 'illegal_move' || reply.search(/illegal/) != -1) {
    console.error(`[DEBUG] Move Rejected: ${source}->${target}. Reply: ${reply}`);
    is_move_legit = false;
    board.position(last_fen, true); // Animated snapback
    return 'snapback';
  } else {
    is_move_legit = true;
    const pieceChar = piece.charAt(1); // 'wP' -> 'P'
    const promoSuffix = isPromotion ? `=${promotionChoice.toUpperCase()}` : '';
    const duration = performance.now() - turn_start_time;
    record_last_move(reply, `${pieceChar} ${source}-${target}${promoSuffix}`, null, duration, 0);
    updateCapturedPieces(reply);

    // Record Human Stats & Evaluation for the graph
    // reply is new FEN, so turn has flipped. We want stats for the player who JUST moved.
    const justMovedColor = getTurn(reply) === 'w' ? 'black' : 'white';
    const staticScore = new GameState(reply).evaluate();

    evalHistory.push({
        moveNumber: evalHistory.length + 1,
        score: staticScore,
        turn: justMovedColor
    });
    renderEvalGraph();

    if (players[justMovedColor].player === 'human') {
        players[justMovedColor].stats.moves++;
        players[justMovedColor].stats.time += duration;
        
        updateStatsUI(justMovedColor, { duration });
    }

    // Auto-start Black if White makes the first move of the game
    if (justMovedColor === 'white' && move_history.length === 1) {
        if (players.black.player !== 'human' && !players.black.running) {
            players.black.running = true;
            updateStatus('black');
        }
    }

    // Re-draw the board according to the received FEN (sanitize)
    if (sanitizeTimeout) clearTimeout(sanitizeTimeout);
    sanitizeTimeout = window.setTimeout(() => {
      board.position(last_fen);
      sanitizeTimeout = null;
    }, 100);
    window.setTimeout(() => {
      onMoveEnd();
    }, 250);
  }
}

function onMoveEnd(oldPos, newPos) {
  // Check game end first
  handle_end_game(last_fen);
  // Then trigger next player if game continues handled inside handle_end_game

  // Start timing for next turn
  turn_start_time = performance.now();
}

function onDragStart(source, piece, position, orientation) {
  const turn = getTurn(last_fen) === 'w' ? 'white' : 'black';
  if (is_thinking || players[turn].player !== 'human') {
    return false;
  }
}

async function fetchWasmVersions() {
  const $select = $('#wasm-version-select');
  let versions = [];
  let activeVersion = CONFIG.DUCKDB_WASM_VERSION;

  const renderOptions = () => {
    $select.empty();
    versions.forEach(v => {
      const isActive = (v === activeVersion);
      const isDefault = (v === CONFIG.DUCKDB_WASM_VERSION);
      
      let label = v;
      if (isActive) label = `✅ ${v} (Active)`;
      else if (isDefault) label = `⭐ ${v} (Default)`;
      
      const selectedAttr = isActive ? 'selected' : '';
      $select.append(`<option value="${v}" ${selectedAttr}>${label}</option>`);
    });
  };

  try {
    const response = await fetch('https://data.jsdelivr.com/v1/package/npm/@duckdb/duckdb-wasm');
    const data = await response.json();
    
    if (data && data.versions) {
      // Filter and natural sort versions
      versions = data.versions.slice(0, 50); 
      versions.sort(new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare).reverse();

      if (!versions.includes(CONFIG.DUCKDB_WASM_VERSION)) {
          versions.unshift(CONFIG.DUCKDB_WASM_VERSION);
      }
      renderOptions();
    }
  } catch (e) {
    console.error("Failed to fetch WASM versions:", e);
    versions = [CONFIG.DUCKDB_WASM_VERSION];
    renderOptions();
  }

  $select.on('change', function() {
      activeVersion = $(this).val();
      console.log(`Switching WASM version to: ${activeVersion}`);
      
      // Update labels to show new active status
      renderOptions();

      // Update all existing WASM adapters
      if (players.white.engine instanceof WasmEngineAdapter) {
          players.white.engine.version = activeVersion;
      }
      if (players.black.engine instanceof WasmEngineAdapter) {
          players.black.engine.version = activeVersion;
      }
  });
}

export async function init() {
  // Handle minimum resolution display values
  const updateResolutionDims = () => {
    $('#current-width').text(window.innerWidth);
    $('#current-height').text(window.innerHeight);
  };
  window.addEventListener('resize', updateResolutionDims);
  updateResolutionDims();

  // Attach UI Event Listeners immediately
  $('#btn-settings').on('click', function () {
    console.log("Settings button clicked");
    $('#settings-modal').addClass('active');
  });

  $('#modal-close-settings').on('click', function() {
    $('#settings-modal').removeClass('active');
  });

  $('#btn-help').on('click', function () {
    $('#help-modal').addClass('active');
  });

  $('#modal-close-help').on('click', function() {
    $('#help-modal').removeClass('active');
  });

  $('#btn-reset').on('click', function () {
    $('#reset-fen-input').val(''); 
    $('#reset-modal').addClass('active');
    $('#reset-fen-input').focus();
  });

  $('#modal-cancel-reset').on('click', function() {
    $('#reset-modal').removeClass('active');
  });

  $('#modal-confirm-reset').on('click', function() {
    const fen = $('#reset-fen-input').val().trim();
    if (fen && !isValidFEN(fen)) {
        alert("Invalid FEN string. Please check and try again.");
        return;
    }
    new_game('white', fen || START_FEN);
    $('#reset-modal').removeClass('active');
  });

  $('.modal-overlay').not('#modal-promotion').on('click', function(e) {
    if (e.target === this) {
      $(this).removeClass('active');
    }
  });

  // Check for local server availability
  let serverAvailable = false;
  const isLocalHost = window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1' || 
                       window.location.hostname === '[::1]';

  if (isLocalHost) {
      try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 1000);
          const response = await fetch(`${CONFIG.REMOTE_ENGINE_URL || 'http://localhost:3001'}/player_white/version`, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (response.ok) {
              serverAvailable = true;
          }
      } catch (e) {
          // ignore
      }
  }

  if (serverAvailable) {
      // Native Server is available! Set both players to DuckDB Native
      players.white.player = 'duckdb_native';
      players.black.player = 'duckdb_native';
      $('#white-player-type').val('duckdb_native');
      $('#black-player-type').val('duckdb_native');
      updateStrategyOptions('white');
      updateStrategyOptions('black');
  } else {
      isRestrictedMode = true;
  }

  // Fetch WASM versions in background
  fetchWasmVersions();

  // Init the default arbiter engine
  await init_quackmate()

  // Initialize the UI
  let config = {
    draggable: true,
    position: 'start',
    orientation: 'white',
    onDrop: onDrop,
    onDragStart: onDragStart,
  }
  board = Chessboard('board1', config);
  window.addEventListener('resize', () => {
    $('#board1').css('width', '100%');
    board.resize();
    renderEvalGraph();
  });
  updateCapturedPieces(last_fen);
  window.getDuckDBThreads = getDuckDBThreads;

  initUI();

  // Move History Panel Actions
  $('#btn-download-pgn').on('click', function () {
    const pgnText = getPgnText();
    if (!pgnText) {
      alert("No moves to export.");
      return;
    }
    const $btn = $(this);
    const originalText = $btn.text();
    $btn.text("Downloading...");
    downloadFile(pgnText, generatePgnFilename());
    setTimeout(() => $btn.text(originalText), 1500);
  });

  $('#btn-copy-pgn').on('click', function () {
    const pgnText = getPgnText();
    if (!pgnText) {
      alert("No moves to copy.");
      return;
    }
    navigator.clipboard.writeText(pgnText).then(() => {
      const $btn = $(this);
      const originalText = $btn.text();
      $btn.text("Copied!");
      setTimeout(() => $btn.text(originalText), 1500);
    }).catch(err => {
      console.error('Failed to copy PGN: ', err);
      alert("Failed to copy PGN to clipboard.");
    });
  });

  $('#btn-copy-history').on('click', function () {
    const text = getHistoryText();
    if (!text) {
      alert("No moves to copy.");
      return;
    }
    
    navigator.clipboard.writeText(text).then(() => {
      const $btn = $(this);
      const originalText = $btn.text();
      $btn.text("Copied!");
      setTimeout(() => $btn.text(originalText), 1500);
    }).catch(err => {
      console.error('Failed to copy: ', err);
      alert("Failed to copy history to clipboard.");
    });
  });

  // Console Copy Buttons (copies active tab output)
  $('.btn-copy-console').on('click', function (e) {
    e.stopPropagation();
    const $container = $(this).closest('.tool-panel-container');
    const $activePane = $container.find('.tool-tab-pane.active .console-output');
    const text = $activePane.text();
    if (!text || text.trim() === "") return;

    navigator.clipboard.writeText(text).then(() => {
      const $btn = $(this);
      const originalText = $btn.text();
      $btn.text("Copied!");
      setTimeout(() => $btn.text(originalText), 1500);
    }).catch(err => {
      console.error('Failed to copy console: ', err);
    });
  });

  // Font Size Decrement (-)
  $('.btn-font-dec').on('click', function (e) {
    e.stopPropagation();
    const $container = $(this).closest('.tool-panel-container');
    const $activePane = $container.find('.tool-tab-pane.active');
    const paneId = $activePane.attr('id');
    if (!paneId) return;

    let currentSize = tabFontSizes[paneId] || DEFAULT_FONT_SIZE;
    if (currentSize > 7) {
      currentSize--;
      tabFontSizes[paneId] = currentSize;
      applyTabFontSize(paneId);
      try { localStorage.setItem('quackmate_tab_font_sizes', JSON.stringify(tabFontSizes)); } catch(e) {}
    }
  });

  // Font Size Increment (+)
  $('.btn-font-inc').on('click', function (e) {
    e.stopPropagation();
    const $container = $(this).closest('.tool-panel-container');
    const $activePane = $container.find('.tool-tab-pane.active');
    const paneId = $activePane.attr('id');
    if (!paneId) return;

    let currentSize = tabFontSizes[paneId] || DEFAULT_FONT_SIZE;
    if (currentSize < 24) {
      currentSize++;
      tabFontSizes[paneId] = currentSize;
      applyTabFontSize(paneId);
      try { localStorage.setItem('quackmate_tab_font_sizes', JSON.stringify(tabFontSizes)); } catch(e) {}
    }
  });

  // Side Tool Tabs (White & Black)
  $('.tool-tab-btn').on('click', function () {
    const $btn = $(this);
    const targetPaneId = $btn.data('tab');
    const $container = $btn.closest('.tool-panel-container');

    $container.find('.tool-tab-btn').removeClass('active');
    $container.find('.tool-tab-pane').removeClass('active');

    $btn.addClass('active');
    $container.find('#' + targetPaneId).addClass('active');
    applyTabFontSize(targetPaneId);
  });

  // Center Analytics Tabs
  $('.analytics-tab-btn').on('click', function () {
    const $btn = $(this);
    const targetPaneId = $btn.data('tab');
    const $container = $btn.closest('.center-analytics-container');

    // Ensure drawer is open if a tab is clicked
    $container.removeClass('collapsed');

    $container.find('.analytics-tab-btn').removeClass('active');
    $container.find('.analytics-tab-pane').removeClass('active');

    $btn.addClass('active');
    $container.find('#' + targetPaneId).addClass('active');

    if (targetPaneId === 'analytics-eval') {
      renderEvalGraph();
    } else if (targetPaneId === 'analytics-moves') {
      updateInteractiveMoveHistory();
    }
  });

  // Center Analytics Drawer Toggle
  $('#btn-toggle-analytics').on('click', function () {
    $('.center-analytics-container').toggleClass('collapsed');
  });

  // Player Stats Card Collapse Toggle
  $('.btn-toggle-stats').on('click', function (e) {
    e.stopPropagation();
    const targetId = $(this).data('target');
    $('#' + targetId).toggleClass('collapsed');
  });

  // Tool Panel Console Collapse Toggle
  $('.btn-toggle-tool-panel').on('click', function (e) {
    e.stopPropagation();
    const targetId = $(this).data('target');
    $('#' + targetId).toggleClass('collapsed');
  });

  // Apply saved/default font sizes to all console panes
  Object.keys(tabFontSizes).forEach(paneId => {
    applyTabFontSize(paneId);
  });

  renderEvalGraph();
}

const pieceInfos = {
  'P': { value: 1 },
  'N': { value: 3 },
  'B': { value: 3 },
  'R': { value: 5 },
  'Q': { value: 9 },
  'K': { value: 0 },
  'p': { value: 1 },
  'n': { value: 3 },
  'b': { value: 3 },
  'r': { value: 5 },
  'q': { value: 9 },
  'k': { value: 0 }
};

function updateCapturedPieces(fen) {
  const fenBoard = fen.split(' ')[0];
  const pieceCounts = {
    'P': 0, 'N': 0, 'B': 0, 'R': 0, 'Q': 0, 'K': 0,
    'p': 0, 'n': 0, 'b': 0, 'r': 0, 'q': 0, 'k': 0
  };

  for (let i = 0; i < fenBoard.length; i++) {
    const char = fenBoard[i];
    if (pieceCounts.hasOwnProperty(char)) {
      pieceCounts[char]++;
    }
  }

  const startCounts = {
    'P': 8, 'N': 2, 'B': 2, 'R': 2, 'Q': 1, 'K': 1,
    'p': 8, 'n': 2, 'b': 2, 'r': 2, 'q': 1, 'k': 1
  };

  // What White captured (Missing Black pieces)
  const capturedByWhite = [];
  let whiteMaterialAdvantage = 0;
  
  // What Black captured (Missing White pieces)
  const capturedByBlack = [];
  let blackMaterialAdvantage = 0;

  // Check Black pieces (lines 'kqrbnp')
  ['q', 'r', 'b', 'n', 'p'].forEach(p => {
      const count = Math.max(0, startCounts[p] - pieceCounts[p]);
      for (let k = 0; k < count; k++) {
          capturedByWhite.push(p);
          whiteMaterialAdvantage += pieceInfos[p].value;
      }
  });

  // Check White pieces (lines 'KQRBNP')
  ['Q', 'R', 'B', 'N', 'P'].forEach(p => {
      const count = Math.max(0, startCounts[p] - pieceCounts[p]);
      for (let k = 0; k < count; k++) {
          capturedByBlack.push(p);
          blackMaterialAdvantage += pieceInfos[p].value;
      }
  });

  // Sort by value (Queenc -> Pawn)
  capturedByWhite.sort((a,b) => pieceInfos[b].value - pieceInfos[a].value);
  capturedByBlack.sort((a,b) => pieceInfos[b].value - pieceInfos[a].value);

  // Calculate net advantage
  const netWhite = whiteMaterialAdvantage - blackMaterialAdvantage;

  const getImgTag = (p) => {
      const isWhitePiece = (p === p.toUpperCase());
      const colorPrefix = isWhitePiece ? 'w' : 'b';
      const pieceType = p.toUpperCase();
      const fileName = `${colorPrefix}${pieceType}.png`;
      return `<img src="img/chesspieces/wikipedia/${fileName}" class="captured-piece" alt="${p}" />`;
  };

  let whiteHtml = capturedByWhite.map(p => getImgTag(p)).join('');
  let blackHtml = capturedByBlack.map(p => getImgTag(p)).join('');

  if (netWhite > 0) whiteHtml += `<span class="score-text">(+${netWhite})</span>`;
  if (netWhite < 0) blackHtml += `<span class="score-text">(+${Math.abs(netWhite)})</span>`;

  $('#captured_by_white').html(whiteHtml).attr('title', 'Captured Black Pieces');
  $('#captured_by_black').html(blackHtml).attr('title', 'Captured White Pieces');
}

function isValidFEN(fen) {
  // Basic FEN validation: 6 fields separated by spaces
  const parts = fen.split(/\s+/);
  if (parts.length !== 6) return false;

  // Board part should have 8 ranks separated by /
  const ranks = parts[0].split('/');
  if (ranks.length !== 8) return false;

  // Check active color
  if (!/^(w|b)$/.test(parts[1])) return false;

  // Check castling
  if (!/^(-|[KQkq]+)$/.test(parts[2])) return false;

  // Check en passant
  if (!/^(-|[a-h][36])$/.test(parts[3])) return false;

  return true;
}

