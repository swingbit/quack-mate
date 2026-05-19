/**
 * quackmate-standard.js
 * 
 * A pure JavaScript (Node/Browser) chess engine implementation using bitboards.
 * Implements the same search algorithm as the SQL engine, but using DFS.
 * 
 * Reuses evaluation constants and common logic from quackmate-common.js.
 */

import { 
    PIECES, TURNS, PIECE_VALUES, COMPUTED_PST,
    SCORE_INFINITE, SCORE_MATE_THRESHOLD, DEFAULT_OPTIONS,
    PRUNING_MARGIN, CAPTURE_MARGIN, ZOBRIST_CONSTANTS, ZOBRIST_MISC,
    squareToAlgebraic,
    ORDER_TT_OFFSET, ORDER_CAPTURE_OFFSET, ORDER_PROMO_OFFSET, ORDER_CASTLE_OFFSET,
    ORDER_CHECK_OFFSET, ORDER_KILLER_OFFSET, ORDER_HISTORY_MAX
} from './quackmate-common.js';

// =============================================================================
// Globals & Search Tables
// =============================================================================
export const transpositionTable = new Map();
const killerMoves = Array.from({ length: 64 }, () => [null, null]);
const historyTable = new Int32Array(13 * 64); // piece (+6) * 64

// Transposition Table Bounds
const BOUND_EXACT = 0;
const BOUND_UPPER = 1;
const BOUND_LOWER = 2;

// =============================================================================
// Bitboard Helpers (BigInt)
// =============================================================================

const CASTLING = { K: 1, Q: 2, k: 4, q: 8 };

const ONE = 1n;
const ZERO = 0n;

function setBit(bb, sq) {
    return bb | (ONE << BigInt(sq));
}

function getBit(bb, sq) {
    return (bb & (ONE << BigInt(sq))) !== ZERO;
}

function clearBit(bb, sq) {
    return bb & ~(ONE << BigInt(sq));
}

function popLSB(bb) {
    const lsb = bb & -bb;
    const newBB = bb ^ lsb;
    return { bit: lsb, newBB, index: getBitIndex(lsb) };
}

function getBitIndex(bb) {
    if (bb === ZERO) return -1;
    // BigInt.toString(2) is safe for all 64 bits.
    // Length - 1 gives the highest bit index. 
    // Since this is only called with single bits (lsb), it's exactly what we need.
    return bb.toString(2).length - 1;
}



// =============================================================================
// Game State
// =============================================================================

export class GameState {
    constructor(fen) {
        this.bitboards = {
            [PIECES.P]: ZERO, [PIECES.N]: ZERO, [PIECES.B]: ZERO, [PIECES.R]: ZERO, [PIECES.Q]: ZERO, [PIECES.K]: ZERO,
            [PIECES.p]: ZERO, [PIECES.n]: ZERO, [PIECES.b]: ZERO, [PIECES.r]: ZERO, [PIECES.q]: ZERO, [PIECES.k]: ZERO
        };
        this.turn = TURNS.WHITE;
        this.castling = 0; // K=1, Q=2, k=4, q=8
        this.halfMoves = 0;
        this.fullMoves = 1;
        
        if (fen) this.parseFen(fen);
    }

    parseFen(fen) {
        const tokens = fen.split(' ');
        const [pieces, turn, castling, ep, half, full] = tokens;

        // Pieces
        let sq = 56; // a8
        for (let i = 0; i < pieces.length; i++) {
            const char = pieces[i];
            if (char === '/') {
                sq -= 16;
            } else if (/\d/.test(char)) {
                sq += parseInt(char);
            } else {
                const piece = PIECES[char];
                if (piece) {
                    this.bitboards[piece] = setBit(this.bitboards[piece], sq);
                }
                sq++;
            }
        }

        // Turn
        this.turn = turn === 'w' ? TURNS.WHITE : TURNS.BLACK;

        // Castling
        this.castling = 0;
        if (castling.includes('K')) this.castling |= 1;
        if (castling.includes('Q')) this.castling |= 2;
        if (castling.includes('k')) this.castling |= 4;
        if (castling.includes('q')) this.castling |= 8;

        // Clocks
        this.halfMoves = parseInt(half) || 0;
        this.fullMoves = parseInt(full) || 1;
    }

    getOccupancy(turn) {
        let occ = ZERO;
        if (turn === TURNS.WHITE) {
            occ |= this.bitboards[PIECES.P] | this.bitboards[PIECES.N] | this.bitboards[PIECES.B] | 
                   this.bitboards[PIECES.R] | this.bitboards[PIECES.Q] | this.bitboards[PIECES.K];
        } else if (turn === TURNS.BLACK) {
            occ |= this.bitboards[PIECES.p] | this.bitboards[PIECES.n] | this.bitboards[PIECES.b] | 
                   this.bitboards[PIECES.r] | this.bitboards[PIECES.q] | this.bitboards[PIECES.k];
        } else {
            // All
            for (const bb of Object.values(this.bitboards)) occ |= bb;
        }
        return occ;
    }

    generateMoves(options) {
        const opts = { legal: true, type: 'all', ...options };
        const moves = [];
        const us = this.turn;
        const them = us === TURNS.WHITE ? TURNS.BLACK : TURNS.WHITE;
        const occ = this.getOccupancy('both');
        const usOcc = this.getOccupancy(us);
        const themOcc = this.getOccupancy(them);

        const genCaptures = opts.type === 'captures' || opts.type === 'all';
        const genQuiets = opts.type === 'quiets' || opts.type === 'all';
        
        // Piece codes
        const [P, N, B, R, Q, K] = us === TURNS.WHITE 
            ? [PIECES.P, PIECES.N, PIECES.B, PIECES.R, PIECES.Q, PIECES.K]
            : [PIECES.p, PIECES.n, PIECES.b, PIECES.r, PIECES.q, PIECES.k];

        // Safe helpers
        const isSafeAndCheck = (from, to, piece, mType, promo) => {
            if (!opts.legal) return { safe: true, check: false };
            const cloned = this.clone();
            cloned.applyMove({ from, to, piece, type: mType, promotion: promo });
            const myKingSq = getBitIndex(cloned.bitboards[K]);
            const safe = !isSquareAttacked(myKingSq, them, cloned);
            if (!safe) return { safe: false, check: false };
            
            const enemyK = them === TURNS.WHITE ? PIECES.K : PIECES.k;
            const enemyKingSq = getBitIndex(cloned.bitboards[enemyK]);
            const check = isSquareAttacked(enemyKingSq, us, cloned);
            return { safe: true, check };
        };

        const addMove = (from, to, piece, type = 'quiet', promo = null, captured = 0) => {
            // Use Queen as representative for safety check of any promotion
            const testPromo = promo ? (us === TURNS.WHITE ? PIECES.Q : PIECES.q) : null;
            const { safe, check } = isSafeAndCheck(from, to, piece, type, testPromo);
            if (safe) {
                if (promo) {
                    const promoPieces = us === TURNS.WHITE 
                        ? [PIECES.Q, PIECES.R, PIECES.B, PIECES.N] 
                        : [PIECES.q, PIECES.r, PIECES.b, PIECES.n];
                    for (const pPiece of promoPieces) {
                        moves.push({ from, to, piece, promotion: pPiece, type: 'promotion', isCheck: check, captured_piece: captured });
                    }
                } else {
                    moves.push({ from, to, piece, type, isCheck: check, captured_piece: captured });
                }
            }
        };

        // Pawns
        let pawns = this.bitboards[P];
        while (pawns !== ZERO) {
            const { index: from, newBB } = popLSB(pawns);
            pawns = newBB;
            
            // Single Push
            const forward = us === TURNS.WHITE ? 8 : -8;
            const to1 = from + forward;
            if (!getBit(occ, to1)) {
                // Check promotion rank
                const isPromo = (us === TURNS.WHITE && to1 >= 56) || (us === TURNS.BLACK && to1 <= 7);
                if (isPromo) {
                    if (genQuiets) addMove(from, to1, P, 'quiet', true);
                } else if (genQuiets) {
                    addMove(from, to1, P, 'quiet');
                    // Double Push
                    const rank = Math.floor(from / 8);
                    if ((us === TURNS.WHITE && rank === 1) || (us === TURNS.BLACK && rank === 6)) {
                        const to2 = from + forward * 2;
                        if (!getBit(occ, to2)) {
                            addMove(from, to2, P, 'double_push');
                        }
                    }
                }
            }

            // Captures
            if (genCaptures) {
                const attacks = PAWN_ATTACKS[us === TURNS.WHITE ? 0 : 1][from];
                let captures = attacks & themOcc;
                
                while (captures !== ZERO) {
                    const { index: to, newBB: rem } = popLSB(captures);
                    captures = rem;
                    
                    let victim = 0;
                    const enemies = them === TURNS.WHITE 
                        ? [PIECES.P, PIECES.N, PIECES.B, PIECES.R, PIECES.Q, PIECES.K]
                        : [PIECES.p, PIECES.n, PIECES.b, PIECES.r, PIECES.q, PIECES.k];
                    for (const ep of enemies) {
                        if (getBit(this.bitboards[ep], to)) { victim = ep; break; }
                    }

                    const isPromo = (us === TURNS.WHITE && to >= 56) || (us === TURNS.BLACK && to <= 7);
                    addMove(from, to, P, 'capture', isPromo, victim);
                }
            }
        }

        // Knights
        let knights = this.bitboards[N];
        while (knights !== ZERO) {
            const { index: from, newBB } = popLSB(knights);
            knights = newBB;
            let attacks = KNIGHT_ATTACKS[from] & ~usOcc; 
            while (attacks !== ZERO) {
                const { index: to, newBB: rem } = popLSB(attacks);
                attacks = rem;
                const isCap = getBit(themOcc, to);
                if (isCap && genCaptures) {
                    let victim = 0;
                    const enemies = them === TURNS.WHITE 
                        ? [PIECES.P, PIECES.N, PIECES.B, PIECES.R, PIECES.Q, PIECES.K]
                        : [PIECES.p, PIECES.n, PIECES.b, PIECES.r, PIECES.q, PIECES.k];
                    for (const ep of enemies) {
                        if (getBit(this.bitboards[ep], to)) { victim = ep; break; }
                    }
                    addMove(from, to, N, 'capture', null, victim);
                }
                else if (!isCap && genQuiets) addMove(from, to, N, 'quiet');
            }
        }

        // Kings
        let kings = this.bitboards[K]; 
        if (kings !== ZERO) { 
            const from = getBitIndex(kings);
            let attacks = KING_ATTACKS[from] & ~usOcc;
            while (attacks !== ZERO) {
                const { index: to, newBB: rem } = popLSB(attacks);
                attacks = rem;
                const isCap = getBit(themOcc, to);
                if (isCap && genCaptures) {
                    let victim = 0;
                    const enemies = them === TURNS.WHITE 
                        ? [PIECES.P, PIECES.N, PIECES.B, PIECES.R, PIECES.Q, PIECES.K]
                        : [PIECES.p, PIECES.n, PIECES.b, PIECES.r, PIECES.q, PIECES.k];
                    for (const ep of enemies) {
                        if (getBit(this.bitboards[ep], to)) { victim = ep; break; }
                    }
                    addMove(from, to, K, 'capture', null, victim);
                }
                else if (!isCap && genQuiets) addMove(from, to, K, 'quiet');
            }
            
            // Castling
            if (genQuiets && !this.isKingInCheck(us)) { 
                // Kingside
                if ((this.castling & (us === TURNS.WHITE ? 1 : 4)) !== 0) {
                    const kTo = us === TURNS.WHITE ? 6 : 62;
                    const path = us === TURNS.WHITE ? [5, 6] : [61, 62];
                    if (!getBit(occ, path[0]) && !getBit(occ, path[1])) {
                        if (!isSquareAttacked(path[0], them, this) && !isSquareAttacked(path[1], them, this)) {
                             const { check } = isSafeAndCheck(from, kTo, K, 'castling');
                             moves.push({ from, to: kTo, piece: K, type: 'castling', isCheck: check });
                        }
                    }
                }
                // Queenside
                if ((this.castling & (us === TURNS.WHITE ? 2 : 8)) !== 0) {
                    const kTo = us === TURNS.WHITE ? 2 : 58;
                    const path = us === TURNS.WHITE ? [3, 2, 1] : [59, 58, 57]; 
                    if (!getBit(occ, path[0]) && !getBit(occ, path[1]) && !getBit(occ, path[2])) {
                        if (!isSquareAttacked(path[0], them, this) && !isSquareAttacked(path[1], them, this)) {
                             const { check } = isSafeAndCheck(from, kTo, K, 'castling');
                             moves.push({ from, to: kTo, piece: K, type: 'castling', isCheck: check });
                        }
                    }
                }
            }
        }

        // Sliders (B, R, Q)
        for (const pieceType of [B, R, Q]) {
            let pieces = this.bitboards[pieceType];
            while (pieces !== ZERO) {
                const { index: from, newBB } = popLSB(pieces);
                pieces = newBB;
                let attacks;
                if (pieceType === B || pieceType === PIECES.b) attacks = getBishopAttacks(from, occ);
                else if (pieceType === R || pieceType === PIECES.r) attacks = getRookAttacks(from, occ);
                else attacks = getQueenAttacks(from, occ);
                
                attacks &= ~usOcc;
                
                while (attacks !== ZERO) {
                    const { index: to, newBB: rem } = popLSB(attacks);
                    attacks = rem;
                    const isCap = getBit(themOcc, to);
                    if (isCap && genCaptures) {
                        let victim = 0;
                        const enemies = them === TURNS.WHITE 
                            ? [PIECES.P, PIECES.N, PIECES.B, PIECES.R, PIECES.Q, PIECES.K]
                            : [PIECES.p, PIECES.n, PIECES.b, PIECES.r, PIECES.q, PIECES.k];
                        for (const ep of enemies) {
                            if (getBit(this.bitboards[ep], to)) { victim = ep; break; }
                        }
                        addMove(from, to, pieceType, 'capture', null, victim);
                    }
                    else if (!isCap && genQuiets) addMove(from, to, pieceType, 'quiet');
                }
            }
        }

        return moves;
    }

    clone() {
        const c = new GameState();
        c.bitboards = { ...this.bitboards }; 
        c.turn = this.turn;
        c.castling = this.castling;
        c.halfMoves = this.halfMoves;
        c.fullMoves = this.fullMoves;
        return c;
    }

    isKingInCheck(turn) {
        const kingBB = this.bitboards[turn === TURNS.WHITE ? PIECES.K : PIECES.k];
        if (kingBB === ZERO) return true; 
        const kingSq = getBitIndex(kingBB);
        const enemy = turn === TURNS.WHITE ? TURNS.BLACK : TURNS.WHITE;
        return isSquareAttacked(kingSq, enemy, this);
    }

    applyMove(move) {
        const us = this.turn;
        const them = us === TURNS.WHITE ? TURNS.BLACK : TURNS.WHITE;
        
        this.bitboards[move.piece] = clearBit(this.bitboards[move.piece], move.from);
        
        const targetPiece = (move.promotion && typeof move.promotion === 'number') ? move.promotion : move.piece;
        this.bitboards[targetPiece] = setBit(this.bitboards[targetPiece], move.to);
        
        let captureSq = -1;
        
        // Check standard capture
        const themOcc = this.getOccupancy(them);
        if (getBit(themOcc, move.to)) {
            captureSq = move.to;
        }
        
        if (captureSq !== -1) {
            const enemies = them === TURNS.WHITE 
            ? [PIECES.P, PIECES.N, PIECES.B, PIECES.R, PIECES.Q, PIECES.K]
            : [PIECES.p, PIECES.n, PIECES.b, PIECES.r, PIECES.q, PIECES.k];
            
            for (const ep of enemies) {
                if (getBit(this.bitboards[ep], captureSq)) {
                    this.bitboards[ep] = clearBit(this.bitboards[ep], captureSq);
                    break; 
                }
            }
        }
        
        if (move.type === 'castling') {
            let rFrom, rTo;
            if (move.to === 6) { rFrom = 7; rTo = 5; }
            else if (move.to === 2) { rFrom = 0; rTo = 3; }
            else if (move.to === 62) { rFrom = 63; rTo = 61; }
            else if (move.to === 58) { rFrom = 56; rTo = 59; }
            
            const R = us === TURNS.WHITE ? PIECES.R : PIECES.r;
            this.bitboards[R] = clearBit(this.bitboards[R], rFrom);
            this.bitboards[R] = setBit(this.bitboards[R], rTo);
        }
        
        this.turn = them;
        
        // Update Castling Rights
        // Moving King or Rook
        const usRights = us === TURNS.WHITE ? (CASTLING.K | CASTLING.Q) : (CASTLING.k | CASTLING.q);
        if ((this.castling & usRights) !== 0) {
            if (move.piece === PIECES.K || move.piece === PIECES.k) {
                this.castling &= ~usRights;
            } else if (move.piece === PIECES.R || move.piece === PIECES.r) {
                if (move.from === 7 || move.from === 63) this.castling &= us === TURNS.WHITE ? ~CASTLING.K : ~CASTLING.k;
                else if (move.from === 0 || move.from === 56) this.castling &= us === TURNS.WHITE ? ~CASTLING.Q : ~CASTLING.q;
            }
        }
        
        // Capturing Rook (affects opponent rights)
        if (captureSq !== -1) {
            // If capture square was a rook home square, remove right
            if (captureSq === 7) this.castling &= ~CASTLING.K;
            else if (captureSq === 0) this.castling &= ~CASTLING.Q;
            else if (captureSq === 63) this.castling &= ~CASTLING.k;
            else if (captureSq === 56) this.castling &= ~CASTLING.q;
        }
    }

    toFen() {
        let fen = '';
        // Pieces
        for (let rank = 7; rank >= 0; rank--) {
            let empty = 0;
            for (let file = 0; file < 8; file++) {
                const sq = rank * 8 + file;
                let pieceChar = null;
                for (const [p, bb] of Object.entries(this.bitboards)) {
                    if (getBit(bb, sq)) {
                        const pName = Object.keys(PIECES).find(key => PIECES[key] == p);
                        pieceChar = pName;
                        break;
                    }
                }
                
                if (pieceChar) {
                    if (empty > 0) {
                        fen += empty;
                        empty = 0;
                    }
                    fen += pieceChar;
                } else {
                    empty++;
                }
            }
            if (empty > 0) fen += empty;
            if (rank > 0) fen += '/';
        }
        
        // Turn
        fen += ` ${this.turn === TURNS.WHITE ? 'w' : 'b'}`;
        
        // Castling
        let castling = '';
        if (this.castling & 1) castling += 'K';
        if (this.castling & 2) castling += 'Q';
        if (this.castling & 4) castling += 'k';
        if (this.castling & 8) castling += 'q';
        fen += ` ${castling || '-'}`;
        
        // No EP
        fen += ' -';
        
        // Clocks
        fen += ` ${this.halfMoves} ${this.fullMoves}`;
        
        return fen;
    }

    calculateHash() {
        let h = 0n;
        for (const [pChar, pId] of Object.entries(PIECES)) {
            let bb = this.bitboards[pId];
            const constants = ZOBRIST_CONSTANTS[pChar];
            while (bb !== ZERO) {
                const sq = getBitIndex(bb & -bb);
                bb &= bb - 1n; // Pop lsb
                h ^= constants[sq];
            }
        }
        if (this.turn === TURNS.BLACK) h ^= ZOBRIST_MISC.turn;
        if (this.castling & 1) h ^= ZOBRIST_MISC.castle[0];
        if (this.castling & 2) h ^= ZOBRIST_MISC.castle[1];
        if (this.castling & 4) h ^= ZOBRIST_MISC.castle[2];
        if (this.castling & 8) h ^= ZOBRIST_MISC.castle[3];
        return h;
    }

    evaluate() {
        let score = 0;
        for (const [pChar, pId] of Object.entries(PIECES)) {
            let bb = this.bitboards[pId];
            if (bb === ZERO) continue;
            
            const isWhite = pId > 0;
            const pst = COMPUTED_PST[pId];
            const material = PIECE_VALUES[pId];
            
            while (bb !== ZERO) {
                const { index: sq, newBB } = popLSB(bb);
                bb = newBB;
                
                // Add material and positional bonus explicitly
                score += (isWhite ? 1 : -1) * (material + (pst[sq] || 0));
            }
        }
        return score;
    }
}

// =============================================================================
// Move Generation: Constants & Precomputations
// =============================================================================

const KING_ATTACKS = new BigUint64Array(64);
const KNIGHT_ATTACKS = new BigUint64Array(64);
const PAWN_ATTACKS = [new BigUint64Array(64), new BigUint64Array(64)]; 
const RAYS = Array.from({length: 64}, () => new BigUint64Array(8));

function initPrecomputed() {
    for (let sq = 0; sq < 64; sq++) {
        const b = ONE << BigInt(sq);
        let k = ZERO, n = ZERO;
        if (sq % 8 !== 0) { k |= (b >> 1n) | (b >> 9n) | (b << 7n); } 
        if (sq % 8 !== 7) { k |= (b << 1n) | (b << 9n) | (b >> 7n); } 
        k |= (b << 8n) | (b >> 8n);
        KING_ATTACKS[sq] = k;

        const file = sq % 8;
        if (file > 0) { n |= (b >> 17n) | (b << 15n); }
        if (file > 1) { n |= (b >> 10n) | (b << 6n); }
        if (file < 7) { n |= (b >> 15n) | (b << 17n); }
        if (file < 6) { n |= (b >> 6n)  | (b << 10n); }
        KNIGHT_ATTACKS[sq] = n;
    }

    for (let sq = 0; sq < 64; sq++) {
        for (let i = sq + 8; i < 64; i += 8) RAYS[sq][0] |= (ONE << BigInt(i)); 
        for (let i = sq - 8; i >= 0; i -= 8) RAYS[sq][2] |= (ONE << BigInt(i)); 
        for (let i = sq + 1; i % 8 !== 0; i++) RAYS[sq][1] |= (ONE << BigInt(i)); 
        for (let i = sq - 1; i >= 0 && i % 8 !== 7; i--) RAYS[sq][3] |= (ONE << BigInt(i)); 
        for (let i = sq + 9; i < 64 && i % 8 !== 0; i += 9) RAYS[sq][4] |= (ONE << BigInt(i)); 
        for (let i = sq - 7; i >= 0 && i % 8 !== 0; i -= 7) RAYS[sq][5] |= (ONE << BigInt(i)); 
        for (let i = sq - 9; i >= 0 && i % 8 !== 7; i -= 9) RAYS[sq][6] |= (ONE << BigInt(i)); 
        for (let i = sq + 7; i < 64 && i % 8 !== 7; i += 7) RAYS[sq][7] |= (ONE << BigInt(i)); 
    }

    for (let sq = 0; sq < 64; sq++) {
        const b = ONE << BigInt(sq);
        if (sq % 8 !== 0) PAWN_ATTACKS[0][sq] |= (b << 7n);
        if (sq % 8 !== 7) PAWN_ATTACKS[0][sq] |= (b << 9n);
        
        if (sq % 8 !== 0) PAWN_ATTACKS[1][sq] |= (b >> 9n);
        if (sq % 8 !== 7) PAWN_ATTACKS[1][sq] |= (b >> 7n);
    }
}

initPrecomputed(); 
console.log("Precomputed tables initialized."); 

// =============================================================================
// Attack Lookups
// =============================================================================

function getRayAttacks(sq, dir, occ) {
    const attack = RAYS[sq][dir];
    const blocker = attack & occ;
    if (blocker === ZERO) return attack;

    let blockerSq;
    if ([0, 4, 7].includes(dir)) { 
        blockerSq = getBitIndex(blocker & -blocker); 
    } else if (dir === 1) { 
        blockerSq = getBitIndex(blocker & -blocker);
    } else { 
        const len = blocker.toString(2).length;
        blockerSq = len - 1;
    }
    return attack ^ RAYS[blockerSq][dir];
}

function getBishopAttacks(sq, occ) {
    return getRayAttacks(sq, 4, occ) | getRayAttacks(sq, 5, occ) | 
           getRayAttacks(sq, 6, occ) | getRayAttacks(sq, 7, occ);
}

function getRookAttacks(sq, occ) {
    return getRayAttacks(sq, 0, occ) | getRayAttacks(sq, 1, occ) | 
           getRayAttacks(sq, 2, occ) | getRayAttacks(sq, 3, occ);
}

function getQueenAttacks(sq, occ) {
    return getBishopAttacks(sq, occ) | getRookAttacks(sq, occ);
}

function isSquareAttacked(sq, sideAttacking, gameState) {
    if (sq < 0 || sq > 63) return false;
    const occ = gameState.getOccupancy('both');
    
    const pawnIdx = sideAttacking === TURNS.WHITE ? 1 : 0; 
    if ((PAWN_ATTACKS[pawnIdx][sq] & gameState.bitboards[sideAttacking === TURNS.WHITE ? PIECES.P : PIECES.p]) !== ZERO) return true;

    const N = sideAttacking === TURNS.WHITE ? PIECES.N : PIECES.n;
    if ((KNIGHT_ATTACKS[sq] & gameState.bitboards[N]) !== ZERO) return true;

    const K = sideAttacking === TURNS.WHITE ? PIECES.K : PIECES.k;
    if ((KING_ATTACKS[sq] & gameState.bitboards[K]) !== ZERO) return true;

    const B = sideAttacking === TURNS.WHITE ? PIECES.B : PIECES.b;
    const R = sideAttacking === TURNS.WHITE ? PIECES.R : PIECES.r;
    const Q = sideAttacking === TURNS.WHITE ? PIECES.Q : PIECES.q;
    const QB = gameState.bitboards[Q] | gameState.bitboards[B];
    const QR = gameState.bitboards[Q] | gameState.bitboards[R];

    if (getBishopAttacks(sq, occ) & QB) return true;
    if (getRookAttacks(sq, occ) & QR) return true;

    return false;
}

// =============================================================================
// Public Interface
// =============================================================================

export function init() {
    return Promise.resolve();
}

function squareIndexToAlgebraic(index) {
  const file = String.fromCharCode('a'.charCodeAt(0) + (index % 8));
  const rank = Math.floor(index / 8) + 1;
  return `${file}${rank}`;
}

function getPieceChar(piece) {
    const entry = Object.entries(PIECES).find(([k, v]) => v === piece);
    return entry ? entry[0] : '?';
}

export async function find_best_move(fen, options) {

    const opts = { ...DEFAULT_OPTIONS, ...(options || {}) };
    if (options && options.depth && !options.maxDepth) {
        opts.maxDepth = options.depth;
    }
    const game = new GameState(fen);
    
    // State Reset (Ensures fresh tables for each benchmark board)
    if (opts.resetContext) {
        transpositionTable.clear();
        for (let i = 0; i < 64; i++) killerMoves[i] = [null, null];
        historyTable.fill(0);
    }
    const maxDepth = opts.maxDepth || 4;
    const useAlphaBeta = opts.useAlphaBeta !== false;
    const useTT = opts.useTT !== false;
    const useLMR = opts.useLMR !== false;
    const useRFP = opts.useRFP !== false;
    const useFFP = opts.useFFP !== false;
    const useLMP = opts.useLMP !== false;
    const useKillers = opts.useKillers !== false;
    const useHistory = opts.useHistory !== false;
    const usePST = opts.usePST !== false;
    const maxDepthQS = opts.maxDepthQS || 0;
    
    let nodes = 0;
    
    // Initial moves list from root
    const rootMoves = game.generateMoves({ legal: true, type: 'all' });
    if (rootMoves.length === 0) {
        return { fen, move: 'none', nodes: 0, reason: 'no_moves', score: game.isKingInCheck(game.turn) ? -SCORE_MATE_THRESHOLD : 0 };
    }

    let currentBestMove = rootMoves[0];
    let currentBestScore = -SCORE_INFINITE;

    function getBoardHash(gs) {
        return gs.calculateHash();
    }

    function moveOrderScore(move, gameState, depth, ttMove) {
        let rank = 0;
        if (ttMove && move.from === ttMove.from && move.to === ttMove.to) return ORDER_TT_OFFSET;
        
        let isCaptureOrPromo = false;
        if (move.type === 'capture' || move.type === 'ep_capture') {
            const captured = move.captured_piece || 0;
            rank += ORDER_CAPTURE_OFFSET + (Math.abs(captured) * 10 - Math.abs(move.piece));
            isCaptureOrPromo = true;
        }
        
        if (move.promotion) {
            rank += ORDER_PROMO_OFFSET;
            isCaptureOrPromo = true;
        }
        
        if (move.type === 'castling') {
            rank += ORDER_CASTLE_OFFSET;
            isCaptureOrPromo = true;
        }

        if (!isCaptureOrPromo && move.isCheck) {
            rank += ORDER_CHECK_OFFSET;
        }
        
        if (useKillers) {
            const killers = killerMoves[depth];
            if (killers && killers[0] && move.from === killers[0].from && move.to === killers[0].to) rank += ORDER_KILLER_OFFSET;
            if (killers && killers[1] && move.from === killers[1].from && move.to === killers[1].to) rank += ORDER_HISTORY_MAX;
        }

        if (useHistory) {
            const historyIdx = (move.piece + 6) * 64 + move.to;
            rank += historyTable[historyIdx] || 0;
        }
        
        if (usePST) {
            const pst = COMPUTED_PST[move.piece];
            if (pst) rank += pst[move.to] || 0;
        }
        
        return rank;
    }

    function quiescence(gameState, alpha, beta, maxQSDepth, currentQSDepth) {
        nodes++;

        const inCheck = gameState.isKingInCheck(gameState.turn);
        const staticEval = gameState.evaluate() * (gameState.turn === TURNS.WHITE ? 1 : -1);

        if (currentQSDepth >= maxQSDepth) {
            return staticEval;
        }

        // Stand-pat alpha cutoff: only if NOT in check!
        if (!inCheck) {
            if (staticEval >= beta) {
                return beta;
            }
            if (staticEval > alpha) {
                alpha = staticEval;
            }
        }

        // Generate moves:
        let movesToTry = [];
        if (inCheck) {
            // If in check, we must generate ALL legal moves to escape check
            movesToTry = gameState.generateMoves({ legal: true });
        } else {
            // Generate only captures and promotions
            const rawMoves = gameState.generateMoves({ legal: true, type: 'captures' });
            const quietPromoMoves = gameState.generateMoves({ legal: true, type: 'quiets' }).filter(m => m.promotion);
            movesToTry = [...rawMoves, ...quietPromoMoves];
        }

        // Delta pruning / Stand-pat filtering: only apply if NOT in check!
        let filteredMoves = movesToTry;
        if (!inCheck) {
            filteredMoves = movesToTry.filter(move => {
                if (move.promotion) return true;
                if (move.type === 'capture' || move.type === 'ep_capture') {
                    const victim = move.captured_piece || 0;
                    if (victim === 0) return false;
                    const victimVal = PIECE_VALUES[Math.abs(victim)] || 0;
                    const attackerVal = PIECE_VALUES[Math.abs(move.piece)] || 0;
                    return victimVal >= Math.floor(attackerVal / 2);
                }
                return false;
            });
        }

        // If in check and no moves are generated, it is checkmate!
        if (filteredMoves.length === 0) {
            if (inCheck) {
                return -SCORE_INFINITE + currentQSDepth; // Mate score
            }
            return staticEval;
        }

        // Order the moves (MVV-LVA)
        filteredMoves.forEach(m => {
            m.qsOrderScore = moveOrderScore(m, gameState, 0, null);
        });
        filteredMoves.sort((a, b) => b.qsOrderScore - a.qsOrderScore);

        let bestScore = inCheck ? -SCORE_INFINITE : staticEval;

        for (let i = 0; i < filteredMoves.length; i++) {
            const move = filteredMoves[i];
            const child = gameState.clone();
            child.applyMove(move);

            const score = -quiescence(child, -beta, -alpha, maxQSDepth, currentQSDepth + 1);

            if (score > bestScore) {
                bestScore = score;
            }
            if (score > alpha) {
                alpha = score;
                if (alpha >= beta) {
                    return beta;
                }
            }
        }

        return bestScore;
    }

    function pvs(gameState, depth, targetDepth, alpha, beta, isPV = true) {
        nodes++;

        const hash = getBoardHash(gameState);
        const ttEntry = transpositionTable.get(hash);
        let ttMove = null;

        const remainingDepth = targetDepth - depth;

        if (useTT) {
            if (ttEntry && ttEntry.depth >= remainingDepth) {
                ttMove = ttEntry.bestMove;
                if (ttEntry.bound === BOUND_EXACT) return ttEntry.score;
                if (ttEntry.bound === BOUND_UPPER && ttEntry.score <= alpha) return ttEntry.score;
                if (ttEntry.bound === BOUND_LOWER && ttEntry.score >= beta) return ttEntry.score;
            } else if (ttEntry) {
                ttMove = ttEntry.bestMove;
            }
        }

        if (remainingDepth <= 0) {
            if (maxDepthQS > 0) {
                return quiescence(gameState, alpha, beta, maxDepthQS, 0);
            }
            return gameState.evaluate() * (gameState.turn === TURNS.WHITE ? 1 : -1);
        }

        const originalAlpha = alpha;

        if (useRFP && !isPV && !gameState.isKingInCheck(gameState.turn) && remainingDepth < 3) {
            const staticEval = gameState.evaluate() * (gameState.turn === TURNS.WHITE ? 1 : -1);
            if (staticEval - PRUNING_MARGIN >= beta) return staticEval;
        }

        let bestMoveInNode = null;
        let bestScoreInNode = -SCORE_INFINITE;
        let movesEvaluated = 0;

        const stages = ['tt', 'captures', 'quiets'];
        for (const stage of stages) {
            let movesToTry = [];
            
            if (stage === 'tt' && ttMove) {
                movesToTry = [ttMove];
            } else if (stage === 'captures') {
                movesToTry = gameState.generateMoves({ legal: true, type: 'captures' });
                movesToTry.forEach(m => m.score = moveOrderScore(m, gameState, depth, ttMove));
                movesToTry.sort((a,b) => (b.score || 0) - (a.score || 0));
            } else if (stage === 'quiets') {
                movesToTry = gameState.generateMoves({ legal: true, type: 'quiets' });
                movesToTry.forEach(m => m.score = moveOrderScore(m, gameState, depth, ttMove));
                movesToTry.sort((a,b) => (b.score || 0) - (a.score || 0));
            }

            for (let i = 0; i < movesToTry.length; i++) {
                const move = movesToTry[i];
                if (stage !== 'tt' && ttMove && move.from === ttMove.from && move.to === ttMove.to) continue;
                
                // LMP (Late Move Pruning)
                // matches rnk <= (12 + remaining_depth * 4) + captures/checks exemption
                if (useLMP && remainingDepth > 0 && !gameState.isKingInCheck(gameState.turn) && !move.isCheck && move.type !== 'capture' && move.type !== 'ep_capture' && !move.promotion) {
                    // rank starts from 1, movesEvaluated is essentially rank - 1 (roughly speaking).
                    // In SQL, rank includes all moves. So we use movesEvaluated for the rank.
                    if (movesEvaluated + 1 > 12 + remainingDepth * 4) {
                        continue;
                    }
                }

                const child = gameState.clone();
                child.applyMove(move);

                if (useFFP && !isPV && remainingDepth <= 2 && !gameState.isKingInCheck(gameState.turn) && !move.isCheck && move.type !== 'capture' && move.type !== 'ep_capture' && !move.promotion) {
                    const parentStaticEval = gameState.evaluate() * (gameState.turn === TURNS.WHITE ? 1 : -1);
                    if (parentStaticEval + PRUNING_MARGIN < alpha) {
                        continue;
                    }
                }

                let score;
                if (movesEvaluated === 0) {
                    score = -pvs(child, depth + 1, targetDepth, -beta, -alpha, isPV);
                } else {
                    let doFullSearch = true;
                    
                    // LMR: Reduce late moves in non-PV nodes
                    if (useLMR && !isPV && movesEvaluated >= 3 && remainingDepth >= 3 
                        && move.type !== 'capture' && move.type !== 'ep_capture' 
                        && !move.promotion && !move.isCheck
                        && !gameState.isKingInCheck(gameState.turn)) {
                        score = -pvs(child, depth + 1, targetDepth - 1, -alpha - 1, -alpha, false);
                        doFullSearch = score > alpha; // Re-search at full depth if LMR fails
                    }
                    
                    if (doFullSearch) {
                        score = -pvs(child, depth + 1, targetDepth, -alpha - 1, -alpha, false);
                        if (score > alpha && score < beta) {
                            score = -pvs(child, depth + 1, targetDepth, -beta, -alpha, true);
                        }
                    }
                }

                if (movesEvaluated === 0 || score > bestScoreInNode) {
                    bestScoreInNode = score;
                    bestMoveInNode = move;
                }
                movesEvaluated++;

                if (score > alpha) {
                    alpha = score;
                    if (useAlphaBeta && alpha >= beta) {
                        if (move.type === 'quiet') {
                            if (useKillers && killerMoves[depth]) {
                                if (killerMoves[depth][0]?.from !== move.from || killerMoves[depth][0]?.to !== move.to) {
                                    killerMoves[depth][1] = killerMoves[depth][0];
                                    killerMoves[depth][0] = move;
                                }
                            }
                            if (useHistory) {
                                historyTable[(move.piece + 6) * 64 + move.to] += remainingDepth * remainingDepth;
                            }
                        }
                        return beta; 
                    }
                }
            }
        }

        if (movesEvaluated === 0) {
            if (gameState.isKingInCheck(gameState.turn)) return -SCORE_MATE_THRESHOLD + depth;
            return 0;
        }

        if (useTT) {
            let bound = BOUND_EXACT;
            if (bestScoreInNode <= originalAlpha) bound = BOUND_UPPER;
            else if (bestScoreInNode >= beta) bound = BOUND_LOWER;
            
            transpositionTable.set(hash, { 
                bestMove: bestMoveInNode, 
                score: bestScoreInNode, 
                depth: remainingDepth,
                bound
            });
        }

        return bestScoreInNode;
    }

    const startTime = performance.now();
    for (let d = 1; d <= maxDepth; d++) {
        const hash = getBoardHash(game);
        const ttEntry = transpositionTable.get(hash);
        const ttMove = ttEntry ? ttEntry.bestMove : currentBestMove;

        rootMoves.forEach(m => {
            if (m.type === 'capture') {
                const enemies = game.turn === TURNS.WHITE 
                    ? [PIECES.p, PIECES.n, PIECES.b, PIECES.r, PIECES.q, PIECES.k]
                    : [PIECES.P, PIECES.N, PIECES.B, PIECES.R, PIECES.Q, PIECES.K];
                for (const piece of enemies) {
                    if (getBit(game.bitboards[piece], m.to)) { m.captured_piece = piece; break; }
                }
            }
            m.orderScore = moveOrderScore(m, game, 0, ttMove);
        });
        rootMoves.sort((a,b) => (b.orderScore || 0) - (a.orderScore || 0));

        let bestDMove = rootMoves[0];
        let bestDScore = -SCORE_INFINITE;
        let alpha = -SCORE_INFINITE;
        let beta = SCORE_INFINITE;

        for (let i = 0; i < rootMoves.length; i++) {
            const move = rootMoves[i];
            const childNode = game.clone();
            childNode.applyMove(move);

            let score;
            if (i === 0) {
                score = -pvs(childNode, 1, d, -beta, -alpha, true);
            } else {
                score = -pvs(childNode, 1, d, -alpha - 1, -alpha, false);
                if (useAlphaBeta && score > alpha && score < beta) {
                    score = -pvs(childNode, 1, d, -beta, -alpha, true);
                } else if (!useAlphaBeta && score > alpha) {
                    score = -pvs(childNode, 1, d, -beta, -alpha, true);
                }
            }

            // Only replace best if strictly better (preserves MVV-LVA ordering for ties)
            if (i === 0 || score > bestDScore) {
                bestDScore = score;
                bestDMove = move;
            }
            if (score > alpha) alpha = score;
        }

        currentBestMove = bestDMove;
        currentBestScore = bestDScore;
        if (useTT) transpositionTable.set(hash, { bestMove: currentBestMove, score: currentBestScore, depth: d, bound: BOUND_EXACT });
    }
    
    const endTime = performance.now();
    const finalState = game.clone();
    finalState.applyMove(currentBestMove);
    
    return { 
        fen: finalState.toFen(), 
        move: currentBestMove ? {
            from: squareToAlgebraic(currentBestMove.from),
            to: squareToAlgebraic(currentBestMove.to),
            promotion: currentBestMove.promotion ? getPieceChar(currentBestMove.promotion).toLowerCase() : undefined
        } : null, 
        nodes, 
        score: currentBestScore,
        time: (endTime - startTime)
    };
}
