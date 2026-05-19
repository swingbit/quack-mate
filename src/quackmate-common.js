export const TURNS = {
    WHITE: 1,
    BLACK: -1
};

export const PIECES = {
    P: 1, N: 2, B: 3, R: 4, Q: 5, K: 6,
    p: -1, n: -2, b: -3, r: -4, q: -5, k: -6
};

export const PIECE_VALUES = {
    [PIECES.P]: 100, [PIECES.N]: 320, [PIECES.B]: 330, [PIECES.R]: 500, [PIECES.Q]: 900, [PIECES.K]: 20000,
    [PIECES.p]: 100, [PIECES.n]: 320, [PIECES.b]: 330, [PIECES.r]: 500, [PIECES.q]: 900, [PIECES.k]: 20000
};

export const DEFAULT_OPTIONS = {
    strategy: 'batched_pvs',
    maxDepth: 4,
    maxThreads: 1,
    bpvsBatchSize: 64,
    useTT: true,
    useAlphaBeta: true,
    useRFP: true,
    useFFP: true,
    useLMR: true,
    useLMP: true,
    useKillers: true,
    useHistory: true,
    usePST: true,
    useMVVLVA: true,
    maxDepthQS: 0,
    debug: false
};

export const RESTRICTED_MODE_LIMITS = {
    maxThreads: 2,
    maxDepth: 5
};

// =============================================================================
// GLOBAL ENGINE CONSTANTS (Shared between SQL and Standard JS engines)
// =============================================================================

// Bitboard Masks (U64 as decimal strings for SQL injection, used as BigInt in JS)
export const MASK_FILE_A = '72340172838076673';      // 0x0101010101010101
export const MASK_FILE_H = '9259542123273830528';    // 0x8080808080808080
export const MASK_RANK_2 = '65280';                  // 0x000000000000FF00
export const MASK_RANK_7 = '71776119061217280';      // 0x00FF000000000000
export const MASK_FULL   = '18446744073709551615';   // 0xFFFFFFFFFFFFFFFF

// Evaluation & Search Constants
export const SCORE_INFINITE       = 1000000;
export const SCORE_MATE_THRESHOLD  = 900000;
export const PRUNING_MARGIN        = 150;
export const CAPTURE_MARGIN        = 200;

// Move Ordering Bonuses (Heuristics)
export const ORDER_TT_OFFSET       = 2000000;
export const ORDER_CAPTURE_OFFSET  = 1000000;
export const ORDER_PROMO_OFFSET    = 800000; 
export const ORDER_CASTLE_OFFSET   = 700000;
export const ORDER_CHECK_OFFSET    = 600000; // Must be > ORDER_KILLER_OFFSET to never be LMP-pruned
export const ORDER_KILLER_OFFSET   = 500000;
export const ORDER_HISTORY_MAX     = 400000; // Cap history score to avoid overtaking Killers

export const PST_DATA = {
    'P': [
        0, 0, 0, 0, 0, 0, 0, 0,
        200, 200, 200, 200, 200, 200, 200, 200,
        50, 50, 60, 80, 80, 60, 50, 50,
        5, 5, 10, 25, 25, 10, 5, 5,
        0, 0, 0, 20, 20, 0, 0, 0,
        5, -5, -10, 0, 0, -10, -5, 5,
        5, 10, 10, -20, -20, 10, 10, 5,
        0, 0, 0, 0, 0, 0, 0, 0
    ],
    'N': [
        -50, -40, -30, -30, -30, -30, -40, -50,
        -40, -20, 0, 0, 0, 0, -20, -40,
        -30, 0, 10, 15, 15, 10, 0, -30,
        -30, 5, 15, 20, 20, 15, 5, -30,
        -30, 0, 15, 20, 20, 15, 0, -30,
        -30, 5, 10, 15, 15, 10, 5, -30,
        -40, -20, 0, 5, 5, 0, -20, -40,
        -50, -40, -30, -30, -30, -30, -40, -50
    ],
    'B': [
        -20, -10, -10, -10, -10, -10, -10, -20,
        -10, 0, 0, 0, 0, 0, 0, -10,
        -10, 0, 5, 10, 10, 5, 0, -10,
        -10, 5, 5, 10, 10, 5, 5, -10,
        -10, 0, 10, 10, 10, 10, 0, -10,
        -10, 10, 10, 10, 10, 10, 10, -10,
        -10, 5, 0, 0, 0, 0, 5, -10,
        -20, -10, -10, -10, -10, -10, -10, -20
    ],
    'R': [
        0, 0, 0, 0, 0, 0, 0, 0,
        5, 10, 10, 10, 10, 10, 10, 5,
        -5, 0, 0, 0, 0, 0, 0, -5,
        -5, 0, 0, 0, 0, 0, 0, -5,
        -5, 0, 0, 0, 0, 0, 0, -5,
        -5, 0, 0, 0, 0, 0, 0, -5,
        -5, 0, 0, 0, 0, 0, 0, -5,
        0, 0, 0, 5, 5, 0, 0, 0
    ],
    'Q': [
        -20, -10, -10, -5, -5, -10, -10, -20,
        -10, 0, 0, 0, 0, 0, 0, -10,
        -10, 0, 5, 5, 5, 5, 0, -10,
        -5, 0, 5, 5, 5, 5, 0, -5,
        0, 0, 5, 5, 5, 5, 0, -5,
        -10, 5, 5, 5, 5, 5, 0, -10,
        -10, 0, 5, 0, 0, 0, 0, -10,
        -20, -10, -10, -5, -5, -10, -10, -20
    ],
    'K': [
        -30, -40, -40, -50, -50, -40, -40, -30,
        -30, -40, -40, -50, -50, -40, -40, -30,
        -30, -40, -40, -50, -50, -40, -40, -30,
        -30, -40, -40, -50, -50, -40, -40, -30,
        -20, -30, -30, -40, -40, -30, -30, -20,
        -10, -20, -20, -20, -20, -20, -20, -10,
        20, 20, 0, 0, 0, 0, 20, 20,
        20, 30, 40, 0, 0, 10, 50, 20
    ]
};

export const COMPUTED_PST = (() => {
    const res = {};
    for (const [piece, pst] of Object.entries(PST_DATA)) {
        res[PIECES[piece]] = {};
        const black_piece_id = PIECES[piece.toLowerCase()];
        res[black_piece_id] = {};
        
        for (let idx = 0; idx < 64; idx++) {
            // White Logic: Flipped Rank
            const y = Math.floor(idx / 8);
            const x = idx % 8;
            const flipped_idx = (7 - y) * 8 + x;
            let val_w = pst[flipped_idx]; 
            if ((piece === 'N' || piece === 'B') && y >= 1) val_w += 40;
            if (['P','N','B','Q'].includes(piece) && [27, 28, 35, 36].includes(idx)) val_w += 60;
            res[PIECES[piece]][idx] = val_w;

            // Black Logic: Mirrored Y (Same PST source)
            const y_b = 7 - y; 
            // Black at White's Rank 7 (y=6) is their Rank 2, so should use pst index 48-55 (y*8+x)
            let val_b = pst[y * 8 + x]; 
            const piece_b = piece.toLowerCase();
            if (['n','b'].includes(piece_b) && y_b >= 1) val_b += 40;
            if (['p','n','b','q'].includes(piece_b) && [27, 28, 35, 36].includes(idx)) val_b += 60;
            res[black_piece_id][idx] = val_b; 
        }
    }
    return res;
})();

export function squareToAlgebraic(index) {
  const file = String.fromCharCode('a'.charCodeAt(0) + (index % 8));
  const rank = Math.floor(index / 8) + 1;
  return `${file}${rank}`;
}

export function algebraicToSquareIndex(alg) {
  const file = alg.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = parseInt(alg.charAt(1)) - 1;
  return rank * 8 + file;
}

// =============================================================================
// Zobrist Hashing Constants (Seeded for stability)
// =============================================================================

// Math.random() cannot be seeded in JS, but Zobrist keys must be identical 
// across every search to avoid Transposition Table misses.
export const { ZOBRIST_CONSTANTS, ZOBRIST_MISC } = (() => {
    const constants = {};
    const misc = { turn: 0n, castle: [] };
    
    // Seeded Xorshift64
    let state = 0xDEADC0DEBEEFn;
    const next = () => {
        state ^= (state << 13n) & 0xFFFFFFFFFFFFFFFFn;
        state ^= (state >> 7n) & 0xFFFFFFFFFFFFFFFFn;
        state ^= (state << 17n) & 0xFFFFFFFFFFFFFFFFn;
        return state;
    };

    for (const p of ['K', 'Q', 'R', 'B', 'N', 'P', 'k', 'q', 'r', 'b', 'n', 'p']) {
        constants[p] = Array.from({ length: 64 }, next);
    }
    misc.turn = next();
    misc.castle = Array.from({ length: 4 }, next);

    return { ZOBRIST_CONSTANTS: constants, ZOBRIST_MISC: misc };
})();
