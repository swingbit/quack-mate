import {
    getInitSchemaSQL,
    getClearBoardSQL,
    getPopulateBoardStateTableSQL,
    getClearSearchSQL,
    getPopulatePstSQL,
    getPopulateAttacksSQL,
    getPopulateMobilitySQL,
    getPopulateZobristSQL,
    getInitSearchTablesSQL
} from './sql/schema.js';

import {
    getApplyMoveSQL,
    getPseudoLegalMovesSQL,
    getLegalMoveCountSQL,
    getKingInCheckFullSQL,
    getGenerateRankedRawMovesSQL,
    getExpandFromRawMovesSQL
} from './sql/moves.js';

import { getStaticEvalSQL } from './sql/eval.js';

import {
    getPersistentExpansionSQL,
    getPersistentMinimaxSQL,
    getRecursiveSearchQuery,
    getMergeTT_SQL,
    getUpdateHistorySQL,
    getBatchUpdateKillersSQL,
    getZobristHashSQL,
    getQSInitSQL,
    getQSExpansionSQL,
    getQSMinimaxBackpropSQL,
    getApplyQSEvalToMainTreeSQL
} from './sql/search.js';


import {
    getBitIndexSQL,
    getClearTableSQL,
    getRevertStateSQL,
    getBoardStateSQLs,
    getInsertValuesSQL
} from './sql/utils.js';

import {
    getCreateTempTablesSQL,
    getClearSearchTreeSQL,
    getInsertRootNodeSQL,
    getNMPConditionSQL,
    getSwapFrontiersSQL,
    getMateScoringSQL,
    getInitializeLeavesSQL,
    getInsertPVSearchFrontierSQL,
    getInsertRestParentNodesSQL
} from './sql/sessions.js';

import { 
    PIECES, TURNS, 
    SCORE_INFINITE, PRUNING_MARGIN,
    COMPUTED_PST,
    ZOBRIST_CONSTANTS,
    ZOBRIST_MISC,
    DEFAULT_OPTIONS,
    RESTRICTED_MODE_LIMITS
} from './quackmate-common.js';

export { PIECES, TURNS, DEFAULT_OPTIONS, RESTRICTED_MODE_LIMITS };

/**
 * Parses an algebraic square notation (e.g., 'e2') to a bitboard index (0-63).
 * @param {string} algebraic 
 * @returns {number}
 */
export function algebraicToSquareIndex(algebraic) {

    const file = algebraic.charCodeAt(0) - 'a'.charCodeAt(0); // 0-7
    const rank = parseInt(algebraic[1], 10) - 1; // 0-7
    return rank * 8 + file;
}

export function squareIndexToAlgebraic(index) {
    const file = String.fromCharCode('a'.charCodeAt(0) + (index % 8));
    const rank = Math.floor(index / 8) + 1;
    return `${file}${rank}`;
}

export function pieceIdToChar(id) {
    const entry = Object.entries(PIECES).find(([char, val]) => val === id);
    return entry ? entry[0] : '';
}

export async function getDuckDBThreads(db) {
    const result = await db.query(`SELECT current_setting('threads') AS threads;`);
    if (result.length > 0) {
        return result[0].threads;
    }
    return null;
}



export { initialize_search_session, execute_recursive_search };

export async function populatePstValues(db) {
    await db.query(getClearTableSQL('pst_values'));

    const values = [];
    for (const piece in COMPUTED_PST) {
        for (const [sq, value] of Object.entries(COMPUTED_PST[piece])) {
            values.push(`(${piece}, ${sq}, ${value})`);
        }
    }

    if (values.length > 0) {
        // Bulk insert in large chunks if needed, or directly if under limit.
        // Assuming getPopulatePstSQL handles the array correctly.
        await db.query(getPopulatePstSQL(values));
    }
}
export async function populateAttacksPrecomputed(db) {
    await db.query(getClearTableSQL('attacks_precomputed'));
    const values = [];
    for (let f = 0; f < 64; f++) {
        const fy = Math.floor(f / 8);
        const fx = f % 8;

        let knight_mask = 0n;
        const nDeltas = [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]];
        for (const [dy, dx] of nDeltas) {
            const ty = fy + dy, tx = fx + dx;
            if (ty >= 0 && ty < 8 && tx >= 0 && tx < 8) knight_mask |= (1n << BigInt(ty * 8 + tx));
        }

        let king_mask = 0n;
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dy === 0 && dx === 0) continue;
                const ty = fy + dy, tx = fx + dx;
                if (ty >= 0 && ty < 8 && tx >= 0 && tx < 8) king_mask |= (1n << BigInt(ty * 8 + tx));
            }
        }

        let wp_mask = 0n;
        for (const dx of [-1, 1]) {
            const ty = fy - 1, tx = fx + dx;
            if (ty >= 0 && tx >= 0 && tx < 8) wp_mask |= (1n << BigInt(ty * 8 + tx));
        }

        let bp_mask = 0n;
        for (const dx of [-1, 1]) {
            const ty = fy + 1, tx = fx + dx;
            if (ty < 8 && tx >= 0 && tx < 8) bp_mask |= (1n << BigInt(ty * 8 + tx));
        }

        values.push(`(${f}, ${knight_mask}, ${king_mask}, ${wp_mask}, ${bp_mask})`);
    }
    await db.query(getPopulateAttacksSQL(values));
}

export async function populateMobilityPrecomputed(db) {
    await db.query(getClearTableSQL('mobility_precomputed'));

    // Generate all moves first
    const moves = [];
    const addMove = (p, f, t, mask) => {
        moves.push({ p, f, t, m: mask.toString() });
    };

    for (let f = 0; f < 64; f++) {
        const fy = Math.floor(f / 8);
        const fx = f % 8;

        // Leapers (Knights, Kings)
        // Stored with ray_mask = 0 as they are never blocked.
        const leaperDirs = {
            'N': [[2, 1], [2, -1], [-2, 1], [-2, -1], [1, 2], [1, -2], [-1, 2], [-1, -2]],
            'K': [[1, 1], [1, -1], [-1, 1], [-1, -1], [0, 1], [0, -1], [1, 0], [-1, 0]]
        };
        for (const [p, dirs] of Object.entries(leaperDirs)) {
            for (const [dy, dx] of dirs) {
                const ty = fy + dy, tx = fx + dx;
                if (ty >= 0 && ty < 8 && tx >= 0 && tx < 8) {
                    addMove(p, f, ty * 8 + tx, 0n);
                }
            }
        }

        // Sliders
        const sliderDirs = {
            'B': [[1, 1], [1, -1], [-1, 1], [-1, -1]],
            'R': [[0, 1], [0, -1], [1, 0], [-1, 0]],
            'Q': [[1, 1], [1, -1], [-1, 1], [-1, -1], [0, 1], [0, -1], [1, 0], [-1, 0]]
        };

        for (const [p, dirs] of Object.entries(sliderDirs)) {
            for (const [dy, dx] of dirs) {
                let mask = 0n;
                for (let dist = 1; dist < 8; dist++) {
                    const ty = fy + dy * dist, tx = fx + dx * dist;
                    if (ty < 0 || ty >= 8 || tx < 0 || tx >= 8) break;
                    const t = ty * 8 + tx;
                    addMove(p, f, t, mask);
                    mask |= (1n << BigInt(t));
                }
            }
        }
    }

    // Insert in bulk to avoid performance issues
    const batchSize = 500;
    for (let i = 0; i < moves.length; i += batchSize) {
        const batch = moves.slice(i, i + batchSize);
        const values = batch.map(m => `(${PIECES[m.p]}, ${m.f}, ${m.t}, ${m.m})`).join(', ');
        await db.query(getPopulateMobilitySQL(values));
    }
}

export async function populateZobristTables(db) {
    const zcValues = [];
    const pieces = ['K', 'Q', 'R', 'B', 'N', 'P', 'k', 'q', 'r', 'b', 'n', 'p'];
    for (const piece of pieces) {
        for (let sq = 0; sq < 64; sq++) {
            zcValues.push(`(${PIECES[piece]}, ${sq}, ${ZOBRIST_CONSTANTS[piece][sq]})`);
        }
    }

    const zmValues = [];
    // Turn
    zmValues.push(`('turn', 0, ${ZOBRIST_MISC.turn})`);
    // Castling (4 bits: WK, WQ, BK, BQ)
    for (let i = 0; i < 4; i++) {
        zmValues.push(`('castle', ${i}, ${ZOBRIST_MISC.castle[i]})`);
    }

    await db.query(getPopulateZobristSQL(zcValues, zmValues));
}

export function parseFen(fen) {
    const parts = fen.split(' ');
    const piecePlacement = parts[0];
    const activeTurn = parts[1];
    const castlingRights = parts[2];
    const enPassantTarget = parts[3];
    const halfMoveClock = parseInt(parts[4], 10);
    const fullMoveNumber = parseInt(parts[5], 10);

    const bitboards = {
        'P': 0n, 'N': 0n, 'B': 0n, 'R': 0n, 'Q': 0n, 'K': 0n,
        'p': 0n, 'n': 0n, 'b': 0n, 'r': 0n, 'q': 0n, 'k': 0n
    };

    let y = 8;
    for (const rankString of piecePlacement.split('/')) {
        let x = 1;
        for (const char of rankString) {
            const num = parseInt(char, 10);
            if (!isNaN(num)) {
                x += num;
            } else {
                const piece = char;
                const squareIndex = (y - 1) * 8 + (x - 1);
                bitboards[piece] |= (1n << BigInt(squareIndex));
                x++;
            }
        }
        y--;
    }

    const boardInsertSql = getInsertValuesSQL('piece_bitboards', 'piece, bitboard', 
        Object.entries(bitboards).map(([piece, bitboard]) => `(${PIECES[piece]}, ${bitboard.toString()})`)
    );

    let castlingRightsInt = 0;
    if (castlingRights.includes('K')) castlingRightsInt |= 1;
    if (castlingRights.includes('Q')) castlingRightsInt |= 2;
    if (castlingRights.includes('k')) castlingRightsInt |= 4;
    if (castlingRights.includes('q')) castlingRightsInt |= 8;

    let epTargetInt = -1;

    const turnVal = activeTurn === 'w' ? TURNS.WHITE : TURNS.BLACK;
    const stateInsertSql = getInsertValuesSQL('game_state', 'active_turn, castling_rights, halfmove_clock, fullmove_number', 
        [`(${turnVal}, ${castlingRightsInt}, ${halfMoveClock}, ${fullMoveNumber})`]
    );

    return { boardInsertSql, stateInsertSql };
}

export async function toFen(db) {
    // Query board and game state
    const queries = getBoardStateSQLs();
    const [bitboardsResult, gameStateResult] = await Promise.all([
        db.query(queries[0]),
        db.query(queries[1])
    ]);

    const gameState = gameStateResult[0];

    const revPIECES = Object.fromEntries(Object.entries(PIECES).map(([k, v]) => [v, k]));
    const pieceMap = new Map();
    for (const { piece, bitboard } of bitboardsResult) {
        let bb = (bitboard === null || bitboard === undefined) ? 0n : BigInt(bitboard);
        for (let i = 0; i < 64; i++) {
            if ((bb & (1n << BigInt(i))) !== 0n) {
                const y = Math.floor(i / 8) + 1;
                const x = (i % 8) + 1;
                pieceMap.set(`${y}-${x}`, revPIECES[piece]);
            }
        }
    }

    const ranks = [];
    for (let y = 8; y >= 1; y--) {
        let emptyCount = 0;
        let rankString = '';
        for (let x = 1; x <= 8; x++) {
            const piece = pieceMap.get(`${y}-${x}`);
            if (piece) {
                if (emptyCount > 0) {
                    rankString += emptyCount;
                    emptyCount = 0;
                }
                rankString += piece;
            } else {
                emptyCount++;
            }
        }
        if (emptyCount > 0) {
            rankString += emptyCount;
        }
        ranks.push(rankString);
    }
    const piecePlacement = ranks.join('/');

    const { active_turn, halfmove_clock, fullmove_number } = gameState;
    const cr = BigInt(gameState.castling_rights || 0);
    let castling = '';
    if ((cr & 1n) === 1n) castling += 'K';
    if ((cr & 2n) === 2n) castling += 'Q';
    if ((cr & 4n) === 4n) castling += 'k';
    if ((cr & 8n) === 8n) castling += 'q';
    if (castling === '') castling = '-';

    let epTargetStr = '-';

    const activeTurnChar = active_turn === TURNS.WHITE ? 'w' : 'b';
    return [piecePlacement, activeTurnChar, castling, epTargetStr, halfmove_clock, fullmove_number].join(' ');
}

// Helper function to get the king's position
async function getKingPosition(db, isWhiteKing) {
    const kingPieceVal = isWhiteKing ? PIECES.K : PIECES.k;
    const result = await db.query(`SELECT bitboard FROM piece_bitboards WHERE piece = ${kingPieceVal};`);
    const kingBitboard = BigInt(result[0]?.bitboard || 0);
    for (let i = 0; i < 64; i++) {
        if ((kingBitboard >> BigInt(i)) & 1n) {
            return i;
        }
    }
    return -1; // Should not happen in a valid game
}

// Helper function to check if a king is in check
async function isKingInCheck(db, isWhiteTurn) {
    const result = await db.query(getKingInCheckFullSQL(isWhiteTurn));
    return result[0].is_check === 1 || result[0].is_check === true || result[0].is_check === 'true';
}


// Helper function to generate all pseudo-legal moves for the active player
// Pseudo-legal moves are fully legal themselves, however they can still become
// illegal if they cause the player's king to be in check. This is tested later.
async function generatePseudoLegalMoves(db, isWhiteTurn) {
    return db.query(getPseudoLegalMovesSQL(isWhiteTurn));
}



/**
 * Entry point for finding the best move from a given FEN.
 * Dispatches to either Recursive or Batched PVS search depending on options.
 * 
 * @param {Object} db - DB connection wrapper
 * @param {string} fromFEN - Starting board position in FEN notation
 * @param {Object} options - Search configuration (depth, strategy, etc.)
 * @returns {Object} Result containing {fen, nodes, move}
 */
export async function find_best_move(db, fromFEN, options, callbacks) {
    const opts = { ...DEFAULT_OPTIONS, ...(options || {}) };
    // Backward compat: if caller still passes `depth` instead of `maxDepth`, honour it.
    if (options && options.depth && !options.maxDepth) {
        opts.maxDepth = options.depth;
    }

    if (opts.maxThreads) {
        await db.query(`SET threads = ${opts.maxThreads};`);
    }


    if (opts.strategy === 'batched_pvs') {
        return find_best_move_batched_pvs(db, fromFEN, opts, callbacks);
    }

    // Default: Recursive Search
    return find_best_move_recursive(db, fromFEN, opts);
}

/**
 * Helper to execute multiple SQL statements separated by semicolons.
 * Necessary because some drivers (like duckdb-nodejs) only execute the first statement in db.all().
 */
async function queryAll(db, multiSql) {
    if (!multiSql) return;
    const queries = multiSql.split(';').map(q => q.trim()).filter(q => q.length > 0);
    for (const q of queries) {
        await db.query(q);
    }
}

/**
 * RECURSIVE SEARCH STRATEGY
 * 
 * Executes a single large Recursive CTE that explores the entire search tree.
 * Evaluation and minimax pull-up are performed entirely within the DB.
 * 
 * Pros: Mathematical elegance, minimal JS logic.
 * Cons: Memory usage scales poorly with depth; no easy way to prune.
 */
/**
 * Initializes the DB schema and populates the board state from FEN.
 * Should be called ONCE before a batch of searches on the same position.
 */
async function initialize_search_session(db, fromFEN, history) {

    
    // 1. Ensure Base Schema Exists (piece_bitboards, pst_values, game_state, etc.)
    let schemaNeeded = false;
    let pstNeeded = false;
    try {
        const pstCount = await db.query('SELECT COUNT(*) as cnt FROM pst_values;');
        if (Number(pstCount[0].cnt) === 0) pstNeeded = true;
    } catch (e) {
        schemaNeeded = true;
        pstNeeded = true;
    }

    const queries = [];
    if (schemaNeeded) {
        queries.push(...getInitSchemaSQL().split(';'));
    }
    queries.push(...getInitSearchTablesSQL().split(';'));

    const initQueries = queries.map(q => q.trim()).filter(q => q.length > 0);
    for (const q of initQueries) {
        try {
            // console.log(`Executing init query: ${q.substring(0, 100)}...`);
            await db.query(q);
        } catch (e) {
            if (e.message && (e.message.includes('already exists'))) {
                // Ignore existence/sequence errors
            } else {
                console.error("Init Error:", e);
                throw e; // Usually safe to keep going if tables were created
            }
        }
    }

    // 2. Populate Precomputed Tables if needed
    let mobilityNeeded = false;
    try {
        const mpCount = await db.query('SELECT COUNT(*) as cnt FROM mobility_precomputed;');
        if (Number(mpCount[0].cnt) === 0) mobilityNeeded = true;
    } catch (e) {
        mobilityNeeded = true;
    }

    // --- Performance Optimization: Create Persistent Temp Tables ---
    // Instead of DROP/CREATE in loops, we create them once here and DELETE/INSERT later.
    try {
        await db.query(getCreateTempTablesSQL());
    } catch(e) { /* ignore */ }

    if (pstNeeded) {
        await populatePstValues(db);
    }
    if (mobilityNeeded) {
        await populateMobilityPrecomputed(db);
        await populateAttacksPrecomputed(db);
    }
    
    // 3. Clear & Populate Board
    const { boardInsertSql, stateInsertSql } = parseFen(fromFEN);

    await db.query(getClearBoardSQL()); 
    await db.query(boardInsertSql);
    await db.query(stateInsertSql);
    await db.query(getPopulateBoardStateTableSQL());
    
    if (history) {
         await populateRepetitionHistory(db, history);
    }
}

/**
 * Executes the Recursive Search Query on the EXISTING DB state.
 * Does NOT touch schema or insert data.
 */
async function execute_recursive_search(db, opts) {
    // Fetch critical state for query generation
    const gameState = (await db.query('SELECT * FROM game_state LIMIT 1;'))[0];
    if (!gameState) throw new Error("execute_recursive_search: game_state is empty!");
    
    const isWhiteTurn = Number(gameState.active_turn) === TURNS.WHITE;
    const depth = opts.maxDepth;
    const alpha = opts.alpha !== undefined ? opts.alpha : -SCORE_INFINITE;
    const beta = opts.beta !== undefined ? opts.beta : SCORE_INFINITE;
    let totalNodes = 0;


    const recursiveQuery = getRecursiveSearchQuery(depth, isWhiteTurn, alpha, beta, opts.returnAllMoves);
    const allMovesResult = await db.query(recursiveQuery);

    if (allMovesResult.length === 0) {
        return {
            nodes: 0,
            score: -Infinity, // Fail Low or Filtered
            move: null
        };
    }
    
    // If we want all moves (e.g. for PVS ordering), return the raw array
    if (opts.returnAllMoves) {
        return {
            nodes: Number(allMovesResult[0].total_nodes), // First row has total count
            moves: allMovesResult.map(row => ({
                 from_sq: row.from_sq,
                 to_sq: row.to_sq,
                 piece: row.piece,
                 is_castle: !!row.is_castle,
                 is_promo: !!row.is_promo,
                 score: Number(row.minimax_eval)
            }))
        };
    }

    // best_move CTE logic returns rows ordered by score
    const bestRow = allMovesResult[0]; 
    
    if (bestRow.total_nodes !== undefined) {
         totalNodes = Number(bestRow.total_nodes);
    } 

    return {
        fen: null, // caller has FEN
        nodes: totalNodes,
        move: { 
            from_sq: bestRow.from_sq, 
            to_sq: bestRow.to_sq, 
            piece: bestRow.piece,
            is_castle: !!bestRow.is_castle,
            is_promo: !!bestRow.is_promo
        },
        score: Number(bestRow.minimax_eval)
    };
}

async function find_best_move_recursive(db, fromFEN, opts) {
    // 1. Initialize Session (Drop/Create Tables, Insert FEN)
    await initialize_search_session(db, fromFEN, opts.fenHistory);

    // 2. Execute Search
    const result = await execute_recursive_search(db, opts);
    
    // If we want all moves
    if (opts.returnAllMoves && result.moves) {
        return {
            fen: fromFEN,
            nodes: result.nodes,
            moves: result.moves,
            score: result.moves[0]?.score || 0
        };
    }

    const bestMove = result.move;
    if (bestMove) {
        // Apply move to get NEW FEN
        const gameState = (await db.query('SELECT * FROM game_state;'))[0];
        const isWhiteTurn = Number(gameState.active_turn) === TURNS.WHITE;
        
        await db.query(getApplyMoveSQL({
            from_sq: bestMove.from_sq,
            to_sq: bestMove.to_sq,
            piece: bestMove.piece,
            isCastle: bestMove.is_castle,
            isPromo: bestMove.is_promo
        }, isWhiteTurn, gameState));

        const finalFEN = await toFen(db);

        return {
            fen: finalFEN, 
            nodes: result.nodes,
            score: result.score,
            move: {
                from: squareIndexToAlgebraic(Number(bestMove.from_sq)),
                to: squareIndexToAlgebraic(Number(bestMove.to_sq)),
                piece: pieceIdToChar(bestMove.piece)
            }
        };
    }
    
    // Fail Low / No Moves
    return { fen: fromFEN, nodes: result.nodes, score: result.score, move: null };
}

/**
 * Validates and applies a human move to the board.
 * Checks if the move is pseudo-legal and ensures it doesn't leave the king in check.
 * 
 * @param {Object} db - DB connection wrapper
 * @param {string} fromFEN - Current FEN
 * @param {string} fromPos - Source square (e.g., 'e2')
 * @param {string} toPos - Target square (e.g., 'e4')
 * @returns {string} New FEN if legal, or error message
 */
export async function try_apply_move(db, fromFEN, fromPos, toPos) {
    await db.query(getClearBoardSQL());
    const { boardInsertSql, stateInsertSql } = parseFen(fromFEN);
    await db.query(boardInsertSql);
    await db.query(stateInsertSql);
    await db.query(getPopulateBoardStateTableSQL());

    const from_sq_index = algebraicToSquareIndex(fromPos);
    const to_sq_index = algebraicToSquareIndex(toPos);

    const gameState = (await db.query('SELECT * FROM game_state;'))[0];
    const isWhiteTurn = gameState.active_turn === TURNS.WHITE;

    // Generate pseudo-legal moves
    const pseudoLegalMoves = await generatePseudoLegalMoves(db, isWhiteTurn);

    // Check if the move is in the list
    const move = pseudoLegalMoves.find(m => m.from_sq === from_sq_index && m.to_sq === to_sq_index);

    if (!move) {
        return 'illegal_move: not in pseudo-legal moves';
    }

    // The move is pseudo-legal. Now, apply it and check for check.
    const originalBitboards = await db.query('SELECT piece, bitboard FROM piece_bitboards;');
    const originalGameState = (await db.query('SELECT * FROM game_state;'))[0];

    try {
        // Apply move using unified SQL
        await db.query(getApplyMoveSQL(move, isWhiteTurn, originalGameState));

        // Check if the current player's king is in check
        if (await isKingInCheck(db, isWhiteTurn)) {
            return 'illegal_move: king is in check';
        }

        // Legal move.
        return await toFen(db);
    } finally {
        // Revert changes
        const revertQueries = getRevertStateSQL(originalBitboards, originalGameState);
        for (const q of revertQueries) {
            await db.query(q);
        }
    }
}


export async function check_end_game(db, fromFEN) {
    // Save initial state if we are not already in a transaction that will be rolled back
    // However, since we are moving everything to SQL that doesn't mutate, we might not need this.
    // But let's stay safe for now.

    const initialBoard = await db.query('SELECT piece, bitboard FROM piece_bitboards;');
    const initialGame = (await db.query('SELECT * FROM game_state;'))[0];

    await db.query(getClearBoardSQL());
    const { boardInsertSql, stateInsertSql } = parseFen(fromFEN);
    await db.query(boardInsertSql);
    await db.query(stateInsertSql);
    await db.query(getPopulateBoardStateTableSQL());

    const gameState = (await db.query('SELECT * FROM game_state;'))[0];
    const isWhiteTurn = gameState.active_turn === TURNS.WHITE;
    
    let reply = "none";
    try {
        const kingWasInCheck = await isKingInCheck(db, isWhiteTurn);

        const moveCountRes = await db.query(getLegalMoveCountSQL(isWhiteTurn));
        const hasLegalMoves = moveCountRes[0].move_count > 0;

        if (!hasLegalMoves) {
            reply = kingWasInCheck ? (isWhiteTurn ? "checkmate white" : "checkmate black") : "draw";
        }
    } catch (e) {
        console.error("Error in check_end_game:", e);
        // Fallback to "none" for UI stability.
    } finally {
        // Restore
        const revertQueries = getRevertStateSQL(initialBoard, initialGame);
        for (const q of revertQueries) {
            await db.query(q);
        }
    }

    return reply;
}


export async function get_legal_move_count(db, fromFEN) {
    await db.query(getClearBoardSQL());
    const { boardInsertSql, stateInsertSql } = parseFen(fromFEN);
    await db.query(boardInsertSql);
    await db.query(stateInsertSql);
    await db.query(getPopulateBoardStateTableSQL());

    const gameState = (await db.query('SELECT * FROM game_state;'))[0];
    const isWhiteTurn = gameState.active_turn === TURNS.WHITE;

    const moveCountRes = await db.query(getLegalMoveCountSQL(isWhiteTurn));
    return moveCountRes[0].move_count;
}


/**
 * Populates the repetition_history table with hashes of past board states.
 */
async function populateRepetitionHistory(db, fenHistory) {
    if (!fenHistory || fenHistory.length === 0) return;
    
    const counts = new Map();
    const originalBitboards = await db.query('SELECT piece, bitboard FROM piece_bitboards;');
    const originalGameState = (await db.query('SELECT * FROM game_state;'))[0];

    try {
        for (const fen of fenHistory) {
            await db.query(getClearBoardSQL());
            const { boardInsertSql, stateInsertSql } = parseFen(fen);
            for (const q of boardInsertSql.split(';').map(x => x.trim()).filter(x => x.length > 0)) {
                await db.query(q);
            }
            for (const q of stateInsertSql.split(';').map(x => x.trim()).filter(x => x.length > 0)) {
                await db.query(q);
            }
            
            await db.query(getPopulateBoardStateTableSQL());
            
            // Note: v_board_state already reflects the current board/game_state
            const result = await db.query(`SELECT ${getZobristHashSQL('v_board_state')} as board_hash FROM v_board_state;`);
            if (result.length > 0) {
                const hash = result[0].board_hash;
                counts.set(hash.toString(), (counts.get(hash.toString()) || 0) + 1);
            }
        }
        
        for (const [hash, count] of counts.entries()) {
            await db.query(`INSERT INTO repetition_history (board_hash, count) VALUES (${hash}, ${count});`);
        }
    } finally {
        // Restore original state before continuing with the actual search
        const revertQueries = getRevertStateSQL(originalBitboards, originalGameState);
        for (const q of revertQueries) {
            await db.query(q);
        }

    }
}


/**
 * BATCHED PVS STRATEGY
 * 
 * Implements Principal Variation Search (PVS) using a batched approach optimized for SQL execution.
 * 
 * Algorithm:
 * 1. Initialize: Parse FEN and populate board state tables.
 * 2. Heuristic PV Selection: Run a quick depth-1 search to identify the most promising move (PV move).
 * 3. Move Ordering: Sort all root moves with PV move first, then captures, then promotions.
 * 4. Phase 1 (PV Search): Search the PV move to full depth with a full alpha-beta window.
 * 5. Phase 2 (Rest Search): Search remaining moves with a null window based on PV score.
 *    - For White (maximizer): Use window [bestScore, +∞) to find improvements.
 *    - For Black (minimizer): Use window (-∞, bestScore] to find improvements.
 * 6. Re-search: If a better move is found, re-search it with a full window to get exact score.
 * 7. Apply: Apply the best move and return the resulting FEN.
 * 
 * @param {Object} db - Database connection with query() method
 * @param {string} fromFEN - Starting position in FEN notation
 * @param {Object} options - Search options (depth, usePruning/useAlphaBeta, fenHistory)
 * @param {Object} callbacks - Optional callbacks for progress reporting
 * @returns {Object} { fen, nodes, score, move }
 */
export async function find_best_move_batched_pvs(db, fromFEN, options, callbacks) {

    const depth = options.maxDepth;
    const maxThreads = options.maxThreads;

    // --- Performance Optimization ---
    try {
        await db.query(`PRAGMA threads=${maxThreads};`);
        await db.query(`PRAGMA preserve_insertion_order=false;`);
        
        let memLimit = '4GB';
        const isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
        if (isNode) {
            try {
                const os = await import('os');
                // Calculate 80% of actual available (free) memory, bounded between 1GB and 16GB
                const availableMemGB = Math.floor(os.freemem() / (1024 * 1024 * 1024));
                const targetLimit = Math.max(1, Math.min(16, Math.floor(availableMemGB * 0.8)));
                memLimit = `${targetLimit}GB`;
            } catch (e) {
                memLimit = '16GB'; // Fallback
            }
        }
        await db.query(`PRAGMA memory_limit='${memLimit}';`);
    } catch(e) { console.warn("Could not set PRAGMA:", e); }

    const isWhiteTurn = fromFEN.split(' ')[1] === 'w'; // Basic check, better to use state

    // Profiling Stats
    const stats = {
        pv_accuracy: { correct: 0, total: 0 },
        lmr: { researches: 0, reductions: 0, total_batches: 0 },
        pruning: { pruned_parents: 0, estimated_nodes_avoided: 0 },
        ordering: { best_move_rank: [] }, // Rank of final best move in initial sort
        timing: { init: 0, root_gen: 0, pv_search: 0, rest_prep: 0, rest_expand: 0, rest_deep: 0, rest_overhead: 0, scoring: 0, scoring_internal: 0, batch_mgmt: 0, pruning_overhead: 0, lmr_check: 0, lmr_research: 0 }
    };
    
    const tInitStart = performance.now();
    // Step 1: Initialize search session (parse FEN, populate tables)
    await initialize_search_session(db, fromFEN, options.fenHistory);

    // --- RE-INIT for ID Session ---
    // 1. Clear persistent tables (Search Tree AND TT)
    await db.query(getClearSearchSQL());

    // 2. Insert Root Node (depth=0)
    // We assume v_board_state is populated with the root position.
    // Query whether the active king is currently in check (needed for LMP exemption)
    const rootCheckResult = await db.query(getKingInCheckFullSQL(isWhiteTurn));
    const rootIsCheck = rootCheckResult[0]?.is_check ? 1 : 0;
    
    // DEBUG: Log root check status
    // console.log(`[DEBUG] rootIsCheck for ${fromFEN}: ${rootIsCheck} (Raw: ${JSON.stringify(rootCheckResult[0])})`);

    await db.query(getInsertRootNodeSQL(rootIsCheck));
    
    stats.timing.init = (performance.now() - tInitStart);

    let nodesAccumulated = 0;
    let currentBestMove = null;
    let previousBestMove = null;
    let currentBestScore = 0;
    
    // Helper: Run expansion loop from startD to maxD
    const run_persistent_loop = async (startD, maxD, loopAlpha, loopBeta, targetD) => {
        for (let d = startD; d <= maxD; d++) {
            
            // --- BATched STATIC NULL MOVE PRUNING (Reverse Futility Pruning) ---
            // If the node is not in check, and its static evaluation is so good that it exceeds beta,
            // we assume it will fail high even if we do nothing (pass the turn).
            if (options.useRFP && d <= maxD && loopAlpha != null && loopBeta != null) {
                const margin = PRUNING_MARGIN * (targetD - d + 1);
                const nmpCondition = getNMPConditionSQL(margin, loopAlpha, loopBeta);

                await db.query(`
                    UPDATE search_tree 
                    SET minimax_eval = static_eval 
                    WHERE id IN (SELECT id FROM frontier_nodes WHERE ${nmpCondition})
                `);
                
                const resNmp = await db.query(`DELETE FROM frontier_nodes WHERE ${nmpCondition} RETURNING 1`);
                if (resNmp.length > 0) {
                    stats.pruning = stats.pruning || {};
                    stats.pruning.nmp_cutoffs = (stats.pruning.nmp_cutoffs || 0) + resNmp.length;
                }
            }

            // Expand Frontier (d-1) -> Search Tree (d) -> Next Frontier (d)
            const expansionQuery = getPersistentExpansionSQL('frontier_nodes', 'next_frontier_nodes', d, maxD, loopAlpha, loopBeta, options);
            
            // Clear target table before insertion to prevent accumulation from previous phases
            await db.query(`DELETE FROM next_frontier_nodes`);
            
            const res = await db.query(expansionQuery);
            nodesAccumulated += res.length;
            
            // Swap Frontiers
            await queryAll(db, getSwapFrontiersSQL());
        }
    };

    // Helper: Run minimax pull-up from maxDepth to 0
    const run_scoring = async (d) => {
        const scoringQuery = getPersistentMinimaxSQL(d, isWhiteTurn);
        await queryAll(db, scoringQuery);
    };
    
    // Helper: Run Backpropagation
    // applyQS: when true AND options.useQS is set, runs the QS extension before backprop.
    //          Pass true ONLY for the single definitive final-scoring call per ID depth.
    const run_full_scoring_pass = async (targetDepth, applyQS = false) => {
        const tScoreStart = performance.now();
        
        // 1. Identify Mate/Draw BEFORE falling back to static eval.
        await db.query(getMateScoringSQL(targetDepth));

        // 2. Initialize remaining leaves (horizon nodes without children keep static_eval)
        await db.query(getInitializeLeavesSQL(targetDepth));

        // 3. Quiescence Search (optional, only on the final definitive pass per depth)
        if (options.maxDepthQS > 0 && applyQS) {
            // Seed QS frontier from main-tree horizon leaves
            await queryAll(db, getQSInitSQL('qs_frontier', targetDepth));

            let qsFrontierCount = (await db.query('SELECT COUNT(*) as c FROM qs_frontier'))[0].c;

            // Expand capture-only plies until quiescence or depth limit
            for (let qsPly = 1; qsPly <= options.maxDepthQS && Number(qsFrontierCount) > 0; qsPly++) {
                await queryAll(db, getQSExpansionSQL('qs_frontier', 'qs_next_frontier', 'qs_search_tree', qsPly));

                // Swap QS frontiers
                await db.query('DELETE FROM qs_frontier');
                await db.query(`INSERT INTO qs_frontier SELECT * FROM qs_next_frontier`);
                await db.query('DELETE FROM qs_next_frontier');

                qsFrontierCount = (await db.query('SELECT COUNT(*) as c FROM qs_frontier'))[0].c;
                nodesAccumulated += Number(qsFrontierCount);
            }

            // Propagate QS minimax scores back up through qs_search_tree
            // (leaves already have minimax_eval = static_eval from expansion)
            // Find the depth range of QS nodes
            const qsDepthRes = await db.query('SELECT MIN(depth) as min_d, MAX(depth) as max_d FROM qs_search_tree');
            if (qsDepthRes.length > 0 && qsDepthRes[0].max_d !== null) {
                const qsMinD = Number(qsDepthRes[0].min_d);
                const qsMaxD = Number(qsDepthRes[0].max_d);

                // Backpropagate within the QS tree (from deepest up to shallowest QS node)
                for (let qsBackD = qsMaxD - 1; qsBackD >= qsMinD; qsBackD--) {
                    await db.query(getQSMinimaxBackpropSQL(qsBackD));
                }

                // Apply the best QS child score back to the main-tree horizon nodes.
                // For each main-tree leaf, look up its QS children (depth = targetDepth + 1)
                // and take the best (max for White, min for Black) score, clamped by stand-pat.
                await db.query(getApplyQSEvalToMainTreeSQL(targetDepth));
            }

            // Clean up QS tables for the next pass
            await db.query('DELETE FROM qs_search_tree; DELETE FROM qs_frontier; DELETE FROM qs_next_frontier');
        }
        
        // 4. Backpropagate main tree
        for (let backD = targetDepth - 1; backD >= 0; backD--) {
             await db.query(getPersistentMinimaxSQL(backD));
        }
        stats.timing.scoring_internal += (performance.now() - tScoreStart);
    };



    let pAlpha = -SCORE_INFINITE;
    let pBeta = SCORE_INFINITE;

    // --- ITERATIVE DEEPENING LOOP ---
    for (let id_depth = 1; id_depth <= depth; id_depth++) {
        // 1. Clear search tables for this depth
        await db.query(getClearSearchTreeSQL());
        await db.query('DROP TABLE IF EXISTS batch_d2_nodes; CREATE TEMPORARY TABLE batch_d2_nodes AS SELECT * FROM search_tree WHERE 1=0;');

        // 2. Insert Root Node
        await db.query(getInsertRootNodeSQL(rootIsCheck));

        // 3. PHASE 1: GENERATE ROOT MOVES (Depth 1)
        const tRootGenStart = performance.now();
        // console.log("Generating root moves for Black...");
        const expQuery = getPersistentExpansionSQL('frontier_nodes', 'next_frontier_nodes', 1, depth, null, null, options);
        await queryAll(db, expQuery);
        // console.log("Query execution complete!");

        const countRes = await db.query('SELECT COUNT(*) as cnt FROM next_frontier_nodes');
        // console.log("Root generation finished, nodes generated:", countRes[0].cnt);
        nodesAccumulated += Number(countRes[0].cnt);
        
        await queryAll(db, getSwapFrontiersSQL());

        // 4. Identify PV Node (Best from previous iteration or current static)
        let pvId = -1;
        
        // console.log("Identifying PV node...");
        
        // Root Ordering Optimization: Use best move from previous depth (Iterative Deepening)
        if (previousBestMove) {
             const prevFrom = algebraicToSquareIndex(previousBestMove.from);
             const prevTo = algebraicToSquareIndex(previousBestMove.to);
             // Verify the move exists at depth 1.
             const pvCheck = await db.query(`SELECT id FROM search_tree WHERE depth=1 AND from_sq=${prevFrom} AND to_sq=${prevTo} LIMIT 1`);
             if (pvCheck.length > 0) {
                 pvId = Number(pvCheck[0].id);
             } 
        }

        if (pvId === -1) {
            const order = isWhiteTurn ? 'DESC' : 'ASC';
            const bestD1 = await db.query(`SELECT id FROM search_tree WHERE depth=1 ORDER BY static_eval ${order}, id ASC LIMIT 1`);
            if (bestD1.length > 0) {
                pvId = Number(bestD1[0].id);
            }
        }

        if (pvId !== -1) {
            if (id_depth === 1) {
                // Initial root expansion already done. Scoring happens at loop end.
            } else {
                // --- PHASE 2: PV SEARCH ---
                const tPvStart = performance.now();
                await db.query('DELETE FROM frontier_nodes');
                await db.query(getInsertPVSearchFrontierSQL(pvId));
                
                await run_persistent_loop(2, id_depth, pAlpha, pBeta, id_depth);
                await run_full_scoring_pass(id_depth, options.maxDepthQS > 0);
                stats.timing.pv_search += (performance.now() - tPvStart);
                
                const pvNodeRes = await db.query(`SELECT minimax_eval FROM search_tree WHERE id = ${pvId}`);
                const pvScore = Number(pvNodeRes[0].minimax_eval);

                // --- PHASE 3: REST SEARCH (Grouped Expansion) ---
                // Instead of expanding all at once, we use sorted batches.
                // Batch 1: Rank 1 (Top Move/Hash)
                // Batch 2: Rank 2 (Captures)
                // Batch 3+: Rank 3+ (Killers/Quiet) in chunks

                // 1. Identify "Rest" Parents (Nodes at Depth 1 that are NOT PV)
                const useAlphaBeta = (options.useAlphaBeta !== false);
                pAlpha = (useAlphaBeta) ? (isWhiteTurn ? pvScore : pvScore - 1) : -SCORE_INFINITE;
                pBeta = (useAlphaBeta) ? (isWhiteTurn ? pvScore + 1 : pvScore) : SCORE_INFINITE;

                const grouped_pvs_search = async () => {
                     const tGroupStart = performance.now();
                     const sPrep = stats.timing.rest_prep;
                     const sExpand = stats.timing.rest_expand;
                     const sDeep = stats.timing.rest_deep;

                     // PREP PHASE: Generating Parent Nodes & Root Moves
                     const tPrepStart = performance.now();
                    
                    await queryAll(db, 'DROP TABLE IF EXISTS parent_nodes;' + getInsertRestParentNodesSQL(pvId));

                   
                    // 1. Generate ALL ranked moves for these parents into a stable table
                    // columns: parent_id, from, to, piece... score, is_processed
                    const rawMovesQuery = getGenerateRankedRawMovesSQL('parent_nodes', 'raw_moves', options.bpvsBatchSize, depth, options);
                    await db.query(rawMovesQuery);
                    
                    // --- LMP ESTIMATION LOGIC ---
                    if (options.useLMP) {
                        const pCountRes = await db.query('SELECT COUNT(*) as c FROM parent_nodes');
                        const rCountRes = await db.query('SELECT COUNT(*) as c FROM raw_moves');
                        const pCount = Number(pCountRes[0].c);
                        const rCount = Number(rCountRes[0].c);
                        
                        // Heuristic: Average BF ~35.
                        // Ideally we would have generated (Parents * 35) moves.
                        // We generated rCount moves.
                        // Pruned ~= (P * 35) - R
                        const totalMovesEstimate = pCount * 35;
                        const prunedMovesEstimate = Math.max(0, totalMovesEstimate - rCount);
                        
                        // Estimate of search tree size saved by pruning, assuming branching factor of 30.
                        const remainingDepth = id_depth - 1; 
                        let savedPerMove = 0;
                        if (remainingDepth > 0) {
                             savedPerMove = 1;
                             for(let d=0; d<remainingDepth; d++) savedPerMove *= 30;
                        }
                        
                        stats.pruning.estimated_nodes_avoided += (prunedMovesEstimate * savedPerMove);
                    }
                    // -----------------------------

                    // Index for fast batch retrieval and pruning check
                    await db.query('CREATE INDEX IF NOT EXISTS idx_raw_moves_batch ON raw_moves(batch_id, is_processed)');
                    
                    stats.timing.rest_prep += (performance.now() - tPrepStart);

                    // 2. Determine number of batches
                    const batchRes = await db.query('SELECT MAX(batch_id) as max_b FROM raw_moves');
                    let maxBatchId = -1;
                    if (batchRes.length > 0 && batchRes[0].max_b !== null) {
                        maxBatchId = Number(batchRes[0].max_b);
                    }
                    
                    // Ensure frontier tables are clean before starting the batch loop.
                    await db.query('DELETE FROM next_frontier_nodes; DELETE FROM frontier_nodes;');

                    // =========================================================================
                    // BATCH PVS EXPANSION & SEARCH LOOP
                    // =========================================================================

                    // Create batch buffer table once outside the loop
                    await db.query('DROP TABLE IF EXISTS batch_d2_nodes; CREATE TEMPORARY TABLE batch_d2_nodes AS SELECT * FROM search_tree WHERE 1=0;');

                    // Loop through batches
                    // batch_id is 0-indexed
                    for (let batchId = 0; batchId <= maxBatchId; batchId++) {
                        stats.lmr.total_batches++;
                        
                        await db.query('DELETE FROM frontier_nodes; DELETE FROM batch_d2_nodes;');
                        
                        // Expand D1->D2 (Batch) directly using batch_id
                        const tExpStart = performance.now();
                        const expansionQuery = getExpandFromRawMovesSQL('raw_moves', 'batch_d2_nodes', 2, options.bpvsBatchSize, isWhiteTurn, batchId, pAlpha, pBeta, options);
                        await db.query(expansionQuery);
                        
                        // Insert into search_tree so they can be scored!
                        const tMgmtStart = performance.now();
                        await db.query('INSERT INTO search_tree SELECT * FROM batch_d2_nodes');
                        // Populate frontier_nodes for the loop (D3+)
                        await db.query('INSERT INTO frontier_nodes SELECT * FROM batch_d2_nodes');
                        stats.timing.batch_mgmt += (performance.now() - tMgmtStart);
                        
                        stats.timing.rest_expand += (performance.now() - tExpStart);
                        
                        // Scoring count
                        const d2CountRes = await db.query('SELECT COUNT(*) as c FROM batch_d2_nodes');
                        nodesAccumulated += Number(d2CountRes[0].c);
                        
                        // LMR Logic 
                        // Only reduce if LMR is enabled.
                        let searchDepth = id_depth;
                        let isReduced = false;
                        
                        // Reduce if: LMR enabled, Deep enough loop, Late Batch, and not too shallow overall
                        // Batch 0 (Move 1) = Full Depth.
                        // Batch 1 (Moves 2-4) = Full Depth.
                        // Batch 2+ (Moves 5+) = Reduced.
                        if (options.useLMR && id_depth > 2 && batchId > 1) {
                            searchDepth = id_depth - 1;
                            isReduced = true;
                            stats.lmr.reductions++;
                        }

                        // Run Recursion (Reduced or Full)
                        if (searchDepth > 2) {
                            const tDeepStart = performance.now();
                            await run_persistent_loop(3, searchDepth, pAlpha, pBeta, id_depth); 
                            stats.timing.rest_deep += (performance.now() - tDeepStart);
                        }
                        // Score
                        await run_full_scoring_pass(searchDepth, options.maxDepthQS > 0);
                        
                        // Re-Search Verification (if Reduced)
                        if (isReduced) {
                            let unexpectedHigh = false;
                            
                            // Check bounds
                            const tCheckStart = performance.now();
                            if (isWhiteTurn && pAlpha !== null) {
                                const check = await db.query(`SELECT 1 FROM search_tree WHERE depth=1 AND minimax_eval > ${pAlpha} AND id IN (SELECT parent_id FROM batch_d2_nodes) LIMIT 1`);
                                if (check.length > 0) unexpectedHigh = true;
                            } else if (!isWhiteTurn && pBeta !== null) {
                                const check = await db.query(`SELECT 1 FROM search_tree WHERE depth=1 AND minimax_eval < ${pBeta} AND id IN (SELECT parent_id FROM batch_d2_nodes) LIMIT 1`);
                                if (check.length > 0) unexpectedHigh = true;
                            }
                            stats.timing.lmr_check += (performance.now() - tCheckStart);
                            
                            if (unexpectedHigh) {
                                const tResearchStart = performance.now();
                                
                                stats.lmr.researches++;
  
                                // Run Full Depth from where we left off
                                await run_persistent_loop(searchDepth + 1, id_depth, pAlpha, pBeta, id_depth);
                                await run_full_scoring_pass(id_depth, options.maxDepthQS > 0);
                                stats.timing.lmr_research += (performance.now() - tResearchStart);
                            }
                        }
                        
                        if (options.useAlphaBeta !== false) {
                            // Prune Parents that have failed low/high relative to the PV Score.
                            // White Root (Max): D1 is Min node. Current Eval is Upper Bound. 
                            // If Eval <= Alpha (pvScore), then True Value <= Alpha. Move is not better. Prune.
                            
                            // Black Root (Min): D1 is Max node. Current Eval is Lower Bound.
                            // If Eval >= Beta (pvScore), then True Value >= Beta. Move is not better. Prune.

                            let pruneCondition = '1=0';
                            if (isWhiteTurn && pAlpha !== null) {
                                pruneCondition = `minimax_eval <= ${pAlpha}`;
                            } else if (!isWhiteTurn && pBeta !== null) {
                                pruneCondition = `minimax_eval >= ${pBeta}`;
                            }

                            if (pruneCondition !== '1=0') {
                                const tPruneStart = performance.now();
                                // 1. Identify Pruned Parents
                                await db.query('DELETE FROM pruned_parents');
                                 await db.query(`
                                     INSERT INTO pruned_parents (id)
                                     SELECT s.id FROM search_tree s
                                     WHERE s.depth = 1 
                                     AND (${pruneCondition})
                                     AND EXISTS (SELECT 1 FROM search_tree child WHERE child.parent_id = s.id)
                                 `);
                                
                                const prunedCount = await db.query('SELECT COUNT(*) as c FROM pruned_parents');
                                const pCount = Number(prunedCount[0].c);
                                stats.pruning.pruned_parents += pCount;
                                
                                // Estimate nodes avoided (BF=30)
                                const remainingDepth = id_depth - 1;
                                let saved = 0;
                                let power = 30;
                                for(let d=0; d<remainingDepth; d++) {
                                    saved += power;
                                    power *= 30;
                                }
                                stats.pruning.estimated_nodes_avoided += (pCount * saved);

                                // 2. Mark their moves as processed
                                await db.query(`
                                    UPDATE raw_moves 
                                    SET is_processed = 1 
                                    WHERE parent_id IN (SELECT id FROM pruned_parents)
                                `);
                                stats.timing.pruning_overhead += (performance.now() - tPruneStart);
                            }
                        }
                    }
                    
                    // Final Scoring propagation to Root (QS applies here — this is the one definitive pass)
                    const tScoreStart = performance.now();
                    await run_full_scoring_pass(id_depth, true);
                    stats.timing.scoring += (performance.now() - tScoreStart);
                    
                    if (options.useHistory) {
                        // Update History Heuristic
                        await db.query(getUpdateHistorySQL(id_depth));
                    }
                    
                    if (options.useKillers) {
                        // Update Killer Heuristic (Batch)
                        await db.query(getBatchUpdateKillersSQL(id_depth));
                    }
                    
                    // Overhead Check
                    const measured = (stats.timing.rest_prep - sPrep) + (stats.timing.rest_expand - sExpand) + (stats.timing.rest_deep - sDeep);
                    stats.timing.rest_overhead += Math.max(0, (performance.now() - tGroupStart) - measured);
                };

                await grouped_pvs_search();
            }
            
            // Ensure root (Depth 0) is updated from children (Depth 1)
            await run_full_scoring_pass(1, id_depth === 1);

            if (options.useTT) {
                // --- END OF DEPTH: UPDATE TT ---
                await db.query(getMergeTT_SQL(id_depth));
            }

            // Retrieve Results for this iteration
            // We just select the best move at depth 1 for the root player.
            
            const bestRes = await db.query(`
                SELECT st.from_sq, st.to_sq, st.piece, st.minimax_eval
                FROM search_tree st
                WHERE st.depth = 1 
                AND st.minimax_eval IS NOT NULL
                ORDER BY st.minimax_eval ${isWhiteTurn ? 'DESC' : 'ASC'}, st.static_eval ${isWhiteTurn ? 'DESC' : 'ASC'}, st.from_sq ASC, st.to_sq ASC
                LIMIT 1;
            `);
            
            if (bestRes.length > 0) {
                 const best = bestRes[0];
                 currentBestScore = Number(best.minimax_eval);
                 currentBestMove = { 
                    from: squareIndexToAlgebraic(best.from_sq), 
                    to: squareIndexToAlgebraic(best.to_sq),                     piece: pieceIdToChar(best.piece) 
                 };
                 previousBestMove = currentBestMove;
            }
            // console.log('pvId:', pvId, 'previousBestMove:', previousBestMove);

            if (callbacks && callbacks.onDepthComplete) {
                 callbacks.onDepthComplete({ depth: id_depth, score: currentBestScore, nodes: nodesAccumulated, bestMove: currentBestMove, stats });
            }

            // Track PV Accuracy
            if (currentBestMove) {
                 const bestIdStr = (await db.query(`SELECT id FROM search_tree WHERE depth=1 AND from_sq=${algebraicToSquareIndex(currentBestMove.from)} AND to_sq=${algebraicToSquareIndex(currentBestMove.to)} LIMIT 1`))[0]?.id;
                 const bestId = Number(bestIdStr);
                 stats.pv_accuracy.total++;
                 if (bestId === pvId) {
                     stats.pv_accuracy.correct++;
                 }
            }
        }
    }
    
    
    // Apply final move
    const finalGameState = (await db.query('SELECT * FROM game_state;'))[0];
    if (currentBestMove) {
        // console.log('Final Move Selected:', currentBestMove.from + '-' + currentBestMove.to);
        previousBestMove = currentBestMove; // Update for next depth loop (if we were inside the loop, but here we return)

        // Need raw move details to apply.
        // We only stored algebraic.
        // Let's re-query or store raw in currentBestMoveRaw.
        const fromSq = algebraicToSquareIndex(currentBestMove.from);
        const toSq = algebraicToSquareIndex(currentBestMove.to);
        // Getting raw details from DB is safer.
        const rawMoveRes = await db.query(`SELECT * FROM search_tree WHERE depth=1 AND from_sq=${fromSq} AND to_sq=${toSq} LIMIT 1`);
        if (rawMoveRes.length > 0) {
            const raw = rawMoveRes[0];
            await db.query(getApplyMoveSQL({
                from_sq: raw.from_sq,
                to_sq: raw.to_sq,
                piece: raw.piece,
                isCastle: raw.is_castle,
                isPromo: raw.is_promo
            }, isWhiteTurn, finalGameState));
        }
    }

    const finalFEN = await toFen(db);
    const result = { ...options, fen: finalFEN, nodes: nodesAccumulated, score: currentBestScore, move: currentBestMove, stats };
    
    if (options.returnAllMoves) {
        const allMoves = await db.query(`
            SELECT st.from_sq, st.to_sq, st.piece, st.is_castle, st.is_promo, st.minimax_eval
            FROM search_tree st
            WHERE st.depth = 1 
            AND st.minimax_eval IS NOT NULL
            ORDER BY st.minimax_eval ${isWhiteTurn ? 'DESC' : 'ASC'}
        `);
        result.moves = allMoves.map(m => ({
            from_sq: m.from_sq,
            to_sq: m.to_sq,
            piece: m.piece,
            is_castle: !!m.is_castle,
            is_promo: !!m.is_promo,
            score: Number(m.minimax_eval)
        }));
    }
    
    return result;
}
