/**
 * quackmate-ui.js
 * 
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
        this.worker = new Worker('src/quackmate-standard.worker.js', { type: 'module' });
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
            maxDepth: options.maxDepth,
            useAlphaBeta: options.useAlphaBeta
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

  async makeMove(fen, from, to) {
    const response = await fetch(`${this.baseUrl}/${this.engineId}/try_apply_move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fen, from, to })
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
        
        switch (player.player) {
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

        if (player.player !== 'standard_js') {
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

// Player State
const players = {
  white: {
    player: 'duckdb_wasm',
    running: false,
    engine: null,
    stats: { moves: 0, time: 0, search_time: 0, nodes: 0 },
    options: {
      ...DEFAULT_OPTIONS
    }
  },
  black: {
    player: 'duckdb_wasm',
    running: false,
    engine: null,
    stats: { moves: 0, time: 0, search_time: 0, nodes: 0 },
    options: {
      ...DEFAULT_OPTIONS
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
    }
  }

  if (fen_stack.length === 0) {
    new_game(board.orientation);
  } else {
    last_fen = fen_stack[fen_stack.length - 1];
    board.position(last_fen);
    updateCapturedPieces(last_fen);
    updateLastMoveUI();
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

  last_fen = custom_fen
  fen_stack = [custom_fen]
  move_history = []
  is_move_legit = false
  turn_start_time = performance.now();
  updateCapturedPieces(last_fen);
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
        return;
      }
    }

    // Check 50-move rule
    const halfMoveClock = parseInt(fen.split(' ')[4] || '0', 10);
    if (halfMoveClock >= 100) {
      alert("The game has ended with a draw (50-move rule). Please start a new game.");
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
    } else {
      let res = reply.match(/^checkmate (white|black)$/)
      if (res) {
        alert("The game has ended with " + res[1] + " in checkmate. Please start a new game.")
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
        if (field === 'maxDepth' && finalVal > RESTRICTED_MODE_LIMITS.maxDepth) {
            finalVal = RESTRICTED_MODE_LIMITS.maxDepth;
            $el.val(RESTRICTED_MODE_LIMITS.maxDepth);
        }
    }

    if (field === 'player') {
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
    const isWhite = color === 'white';
    const p = players[color];
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
    const strategy = p.options.strategy;
    
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
      const $nativeOptions = $('option[value="duckdb_native"]');
      $nativeOptions.prop('disabled', true);
      $nativeOptions.text($nativeOptions.text() + " (Unavailable)");
      
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
  if (!player.engine) {
    logPlayerStatus(color, `Initializing ${color} engine...`);
    player.engine = await EngineFactory.create(color);
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

function updateStatsUI(turn, profiling) {
  const p = players[turn];
  const $statEl = turn === 'white' ? $status_white : $status_black;
  const $avgEl = turn === 'white' ? $avg_white : $avg_black;
  const $container = $statEl.closest('.player-stats');

  // Clear previous profiling display
  $container.find('.profiling-stats').remove();

  if (p.stats.moves === 0) {
    $statEl.html('-');
    $avgEl.html('-');
    return;
  }

  const avgTime = Math.round(p.stats.time / p.stats.moves);
  const avgNodes = Math.round(p.stats.nodes / p.stats.moves);
  const avgNps = p.stats.search_time > 0 ? Math.round(p.stats.nodes / (p.stats.search_time / 1000)) : 0;

  if (p.player === 'human') {
    // For human average, nodes/nps don't make sense, just show time
    $avgEl.html(`<div>Time: ${formatTime(avgTime)}</div>`);
  } else {
    $avgEl.html(`
       <div>Time: ${formatTime(avgTime)}</div>
       <div>Nodes: ${avgNodes.toLocaleString()}</div>
       <div>NPS: ${avgNps.toLocaleString()}</div>
     `);
  }

  // Profiling Display
  if (!profiling) return;

  if (profiling.stats) {
         // New Batched PVS Stats
         const s = profiling.stats;
         let html = '<div class="profiling-stats">';
         
         // Left Column: Timings
         html += '<div style="flex:1;">';
         if (s.timing) {
             const t = s.timing;
             html += `<div style="display:flex; justify-content:space-between;"><span>Init:</span> <span>${Math.round(t.init)}ms</span></div>`;
             html += `<div style="display:flex; justify-content:space-between;"><span>PV:</span> <span>${Math.round(t.pv_search)}ms</span></div>`;
             // Compact breakdown to fit height
             html += `<div style="display:flex; justify-content:space-between;" title="Prep / Expand / Overhead"><span>Pr/Ex/Ov:</span> <span>${Math.round(t.rest_prep)}/${Math.round(t.rest_expand)}/${Math.round(t.rest_overhead)}ms</span></div>`;
             html += `<div style="display:flex; justify-content:space-between;"><span>Deep:</span> <span>${Math.round(t.rest_deep)}ms</span></div>`;
             html += `<div style="display:flex; justify-content:space-between;"><span>Score:</span> <span>${Math.round(t.scoring)}ms</span></div>`;
         }
         html += '</div>';

         // Right Column: Metrics
         html += '<div style="flex:1; border-left: 1px solid #ddd; padding-left: 8px; display:flex; flex-direction:column; justify-content:center;">';
         
         if (s.pv_accuracy && s.pv_accuracy.total > 0) {
             const acc = Math.round((s.pv_accuracy.correct / s.pv_accuracy.total) * 100);
             html += `<div title="Predictive Stability: (Stable Iterations / Total Depth)">PV Acc: ${acc}% <span style="color:#888">(${s.pv_accuracy.correct}/${s.pv_accuracy.total})</span></div>`;
         }
         
         if (s.lmr) {
              const rate = s.lmr.reductions > 0 ? Math.round((s.lmr.researches / s.lmr.reductions) * 100) : 0;
              // Reduction Rate: Reductions / Total Batches
              const reductionRate = s.lmr.total_batches > 0 ? Math.round((s.lmr.reductions / s.lmr.total_batches) * 100) : 0;
              
              html += `<div title="Late Move Reductions: (Failed Reductions / Total Reductions)">LMR: ${s.lmr.researches}/${s.lmr.reductions}<span style="color:#888"> (${rate}%)</span></div>`;
              html += `<div title="Reduction Rate: (Batches Reduced / Total Batches)">Red. Rate: ${reductionRate}%</div>`;
         }

         if (s.pruning) {
             html += `<div title="Pruned Parents: (Branches skipped at Depth 1)">Pruned: ${s.pruning.pruned_parents}</div>`;
             if (s.pruning.estimated_nodes_avoided > 0) {
                 const estSaved = (s.pruning.estimated_nodes_avoided / 1000000).toFixed(1) + 'M';
                 html += `<div title="Estimated Nodes Avoided (BF=30)">Est Saved: ${estSaved}</div>`;
             }
         }

         html += '</div>';
         html += '</div>';
         
         $container.children('.stats-row').after(html);
         return; // STOP HERE
  }
}

function processMoveResult(data, duration, turn) {
  setThinking(false);
  if (data.reason === 'found_move') {
    is_move_legit = true;

    // Update Stats
    players[turn].stats.moves++;
    players[turn].stats.time += duration;
    players[turn].stats.search_time += (data.search_duration || duration);
    players[turn].stats.nodes += (data.nodes || 0);

    // Use search_duration if provided by engine for more accurate NPS, fallback to total duration
    const $statEl = turn === 'white' ? $status_white : $status_black;
    const effectiveDuration = data.search_duration || duration;
    const nps = data.nodes ? Math.round(data.nodes / (effectiveDuration / 1000)) : 0;

    $statEl.html(`
       <div class="stats-content">
           <div>Time: ${formatTime(duration)}</div>
           <div>Nodes: ${(data.nodes || 0).toLocaleString()}</div>
           <div>NPS: ${nps.toLocaleString()}</div>
       </div>
    `);

    updateStatsUI(turn, data.profiling);

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

async function onDrop(source, target, piece, newPos, oldPos, orientation) {
  if (is_thinking) return 'snapback';

  // Prevent human moving if it's AI turn (unless we want to allow override?)
  const turn = getTurn(last_fen) === 'w' ? 'white' : 'black';
  if (players[turn].player !== 'human') return 'snapback';

  if (target === 'offboard') return;

  // Use default engine (arbiter) for validation
  // Hook up logger to human console
  const color = turn;
  clearPlayerConsole(color); // Clear previous logs
  setQueryLogger((sql) => {
    logToPlayerConsole(color, sql);
  });

  console.log(`[DEBUG] Human move Attempt: ${source}->${target} | FEN: ${last_fen}`);

  const reply = await try_apply_move(last_fen, source, target);

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
    const duration = performance.now() - turn_start_time;
    record_last_move(reply, `${pieceChar} ${source}-${target}`, null, duration, 0);

    // Record Human Stats
    // reply is new FEN, so turn has flipped. We want stats for the player who JUST moved.
    const justMovedColor = getTurn(reply) === 'w' ? 'black' : 'white';

    if (players[justMovedColor].player === 'human') {
        players[justMovedColor].stats.moves++;
        players[justMovedColor].stats.time += duration;
        
        const $statEl = justMovedColor === 'white' ? $status_white : $status_black;
        $statEl.html(`<div>Time: ${formatTime(duration)}</div>`);
        
        updateStatsUI(justMovedColor);
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

  $('.modal-overlay').on('click', function(e) {
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
  });
  updateCapturedPieces(last_fen);
  window.getDuckDBThreads = getDuckDBThreads;

  initUI();

  // History Button
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
      setTimeout(() => $btn.text(originalText), 2000);
    }).catch(err => {
      console.error('Failed to copy: ', err);
      alert("Failed to copy history to clipboard.");
    });
  });

  // Console Toggle (Mute) Buttons
  $('.btn-toggle-console').on('click', function(e) {
    e.stopPropagation();
    const color = $(this).data('target');
    const state = consoleStates[color];
    state.isMuted = !state.isMuted;
    
    const $btn = $(this);
    const $console = $(`#${color}-console`);
    
    if (state.isMuted) {
        $btn.text('Unmute').addClass('active');
        $console.addClass('muted');
    } else {
        $btn.text('Mute').removeClass('active');
        $console.removeClass('muted');
    }
  });

  // Console Copy Buttons
  $('.btn-copy-console').on('click', function (e) {
    e.stopPropagation();
    const targetId = $(this).data('target');
    const text = $('#' + targetId).text();
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

