/**
 * quackmate-san.js
 *
 * SAN (Standard Algebraic Notation) helpers for the Quack-Mate chess UI.
 * Provides isKingInCheck() for detecting checks and sanFromMove() for
 * converting internal move representations into human-readable SAN strings
 * suitable for PGN export.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers – FEN -> board
// ─────────────────────────────────────────────────────────────────────────────

const COLS = 'abcdefgh';

/**
 * Convert an algebraic square name (e.g. 'e4') to a 0-based [row, col].
 * row 0 = rank 8, row 7 = rank 1; col 0 = a-file, col 7 = h-file.
 */
function squareToCoords(sq) {
  const file = sq[0];
  const rank = parseInt(sq[1], 10);
  return [8 - rank, COLS.indexOf(file)];
}

/**
 * Parse a FEN string and return a plain 8×8 board array (row-major, top=rank 8)
 * plus the active color ('w' | 'b').
 *
 *    board[row][col] = piece character (e.g. 'P', 'n', 'K') or null
 */
function parseFen(fen) {
  const parts = fen.split(/\s+/);
  const ranks = parts[0].split('/');
  const board = [];
  for (const rankStr of ranks) {
    const row = [];
    for (const ch of rankStr) {
      if (ch >= '1' && ch <= '8') {
        const empty = parseInt(ch, 10);
        for (let i = 0; i < empty; i++) row.push(null);
      } else {
        row.push(ch);
      }
    }
    board.push(row);
  }
  return { board, activeColor: parts[1] || 'w' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Attack detection (used by isKingInCheck and sanFromMove disambiguation)
// ─────────────────────────────────────────────────────────────────────────────

function isWhitePiece(p) { return p && p === p.toUpperCase(); }

function onBoard(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

/**
 * Does the piece at [r, c] attack the square [kr, kc]?
 * `piece` is a character like 'P' (white pawn), 'n' (black knight), etc.
 */
function attacksSquare(board, r, c, kr, kc, piece) {
  const dr = kr - r;
  const dc = kc - c;
  const absDr = Math.abs(dr);
  const absDc = Math.abs(dc);

  // Pawn
  if (piece === 'P') return dr === -1 && absDc === 1;
  if (piece === 'p') return dr === 1  && absDc === 1;

  // Knight
  if (piece === 'N' || piece === 'n')
    return (absDr === 2 && absDc === 1) || (absDr === 1 && absDc === 2);

  // King
  if (piece === 'K' || piece === 'k')
    return absDr <= 1 && absDc <= 1;

  // Bishop & Queen (diagonals – slide)
  if (piece === 'B' || piece === 'b' || piece === 'Q' || piece === 'q') {
    if (absDr === absDc && absDr > 0) {
      const stepR = dr > 0 ? 1 : -1;
      const stepC = dc > 0 ? 1 : -1;
      let rr = r + stepR, cc = c + stepC;
      while (rr !== kr || cc !== kc) {
        if (board[rr][cc] !== null) return false;
        rr += stepR; cc += stepC;
      }
      return true;
    }
  }

  // Rook & Queen (orthogonals – slide)
  if (piece === 'R' || piece === 'r' || piece === 'Q' || piece === 'q') {
    if (dr === 0 && dc !== 0) {
      const stepC = dc > 0 ? 1 : -1;
      let cc = c + stepC;
      while (cc !== kc) {
        if (board[r][cc] !== null) return false;
        cc += stepC;
      }
      return true;
    }
    if (dc === 0 && dr !== 0) {
      const stepR = dr > 0 ? 1 : -1;
      let rr = r + stepR;
      while (rr !== kr) {
        if (board[rr][c] !== null) return false;
        rr += stepR;
      }
      return true;
    }
  }

  return false;
}

/**
 * Returns true if the king of `activeColor` is in check on `board`.
 */
function kingInCheck(board, activeColor) {
  const kingPiece = activeColor === 'w' ? 'K' : 'k';
  let kr, kc;
  outer:
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === kingPiece) { kr = r; kc = c; break outer; }
    }
  }
  if (kr === undefined) return false;

  const opponentIsWhite = activeColor === 'b';

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      if (isWhitePiece(piece) !== opponentIsWhite) continue;
      if (attacksSquare(board, r, c, kr, kc, piece)) return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Is the king of the side whose turn it is (active colour in the FEN) in check?
 *
 * @param {string} fen - a valid FEN string (e.g. after a move).
 * @returns {boolean}
 */
export function isKingInCheck(fen) {
  const { board, activeColor } = parseFen(fen);
  return kingInCheck(board, activeColor);
}

/**
 * Generate a SAN (Standard Algebraic Notation) string for a move.
 *
 * @param {string} fenBefore - FEN of the position BEFORE the move.
 * @param {string} fenAfter  - FEN of the position AFTER the move.
 * @param {object} parsed    - { piece: 'P'|'N'|... , from: 'e2', to: 'e4' }
 * @param {object} flags     - { isCheck: boolean, isCheckmate: boolean }
 * @returns {string} SAN string, e.g. "Nf3", "exd5", "O-O", "e8=Q+"
 */
export function sanFromMove(fenBefore, fenAfter, parsed, { isCheck = false, isCheckmate = false } = {}) {
  const { board } = parseFen(fenBefore);
  const [fr, fc] = squareToCoords(parsed.from);
  const [tr, tc] = squareToCoords(parsed.to);
  const piece = parsed.piece.toUpperCase();
  const isWhiteMove = isWhitePiece(board[fr][fc]);

  // ── Special: castling ──────────────────────────────────────────────────
  if (piece === 'K' && Math.abs(tc - fc) === 2) {
    const suffix = isCheckmate ? '#' : isCheck ? '+' : '';
    return tc > fc ? `O-O${suffix}` : `O-O-O${suffix}`;
  }

  // ── Determine capture ──────────────────────────────────────────────────
  let isCapture = board[tr][tc] !== null;

  // En-passant: pawn moves diagonally to an empty square
  if (piece === 'P' && !isCapture && fc !== tc) {
    isCapture = true;
  }

  // ── Determine promotion piece (from fenAfter) ──────────────────────────
  let promoPiece = null;
  if (piece === 'P') {
    const promoRank = isWhiteMove ? 0 : 7;
    if (tr === promoRank) {
      const { board: boardAfter } = parseFen(fenAfter);
      const promo = boardAfter[tr][tc];
      if (promo) promoPiece = promo.toUpperCase();
    }
  }

  // ── Build the core move string ─────────────────────────────────────────
  let san = '';

  if (piece === 'P') {
    if (isCapture) {
      san += COLS[fc] + 'x' + parsed.to;
    } else {
      san += parsed.to;
    }
  } else {
    san += piece;

    // Disambiguation: are there other squares with the same piece type
    // that can ALSO reach 'to'?
    const ambiguousSquares = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = board[r][c];
        if (!p || p.toUpperCase() !== piece) continue;
        if (r === fr && c === fc) continue;
        if (!attacksSquare(board, r, c, tr, tc, p)) continue;
        ambiguousSquares.push([r, c]);
      }
    }

    if (ambiguousSquares.length > 0) {
      const sameFile = ambiguousSquares.some(([ar, _]) => ar === fr);
      const sameRank = ambiguousSquares.some(([_, ac]) => ac === fc);

      if (sameFile && sameRank) {
        san += parsed.from; // both file and rank
      } else if (sameFile) {
        san += (8 - fr);    // rank only
      } else {
        san += COLS[fc];    // file only
      }
    }

    if (isCapture) san += 'x';
    san += parsed.to;
  }

  // ── Promotion suffix ───────────────────────────────────────────────────
  if (promoPiece && promoPiece !== 'P' && promoPiece !== 'K')
    san += '=' + promoPiece;

  // ── Check / mate suffixes ──────────────────────────────────────────────
  if (isCheckmate) san += '#';
  else if (isCheck)   san += '+';

  return san;
}
