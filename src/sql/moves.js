import { 
    PIECES,
    TURNS,
    PIECE_VALUES,
    MASK_FULL,
    MASK_FILE_A,
    MASK_FILE_H,
    MASK_RANK_2,
    MASK_RANK_7,
    PRUNING_MARGIN,
    CAPTURE_MARGIN,
    ORDER_TT_OFFSET,
    ORDER_HISTORY_MAX,
    ORDER_KILLER_OFFSET,
    ORDER_CAPTURE_OFFSET,
    ORDER_CHECK_OFFSET
} from '../quackmate-common.js';

const BBTYPE = 'UBIGINT';

import { getIsBitSetSQL, getOrSQL, getXorSQL, getBitIndexSQL, getSafeLSH } from './utils.js';
import { getStaticEvalSQL, getPieceValueCaseSQL, getMVVLVAScoreSQL, getIncrementalEvalSQL } from './eval.js';
import { getZobristHashSQL } from './search.js';

export function getAreSquaresAttackedSQL(squares, alias = 'em', attacker_turn = null) {
    // If squares is an array, format as IN (a, b, c) or = a
    const squareCond = Array.isArray(squares) 
        ? (squares.length === 1 ? `= ${squares[0]}` : `IN (${squares.join(', ')})`)
        : `= ${squares}`;
        
    const sqExpr = Array.isArray(squares) ? 'ap.square' : `ap.square`; // Logic is same for ap.square
    const mpSqExpr = Array.isArray(squares) ? 'mp.target_sq' : `mp.target_sq`;

    const turn = attacker_turn || `${alias}.active_turn`;
    // Only include aliases that are confirmed to have the 'all_pieces' column
    const all_pieces = ['e', 'legal_expanded', 'search_space', 's', 's_in', 'fn', 'mc', 'merged_candidates', 'c', 'm_expanded', 'er', 'mr', 'mr_applied'].includes(alias) 
        ? `${alias}.all_pieces`
        : getOrSQL([`${alias}.wK_bb`, `${alias}.wQ_bb`, `${alias}.wR_bb`, `${alias}.wB_bb`, `${alias}.wN_bb`, `${alias}.wP_bb`, `${alias}.bK_bb`, `${alias}.bQ_bb`, `${alias}.bR_bb`, `${alias}.bB_bb`, `${alias}.bN_bb`, `${alias}.bP_bb`]);

    // Optimization: If turn is a literal
    if (attacker_turn === TURNS.BLACK || attacker_turn === TURNS.WHITE) {
        const t = attacker_turn;
        const leaperPart = t === TURNS.BLACK ?
            `(((${alias}.bP_bb) & (ap.black_pawn_mask)) <> 0 OR ((${alias}.bN_bb) & (ap.knight_mask)) <> 0 OR ((${alias}.bK_bb) & (ap.king_mask)) <> 0)` :
            `(((${alias}.wP_bb) & (ap.white_pawn_mask)) <> 0 OR ((${alias}.wN_bb) & (ap.knight_mask)) <> 0 OR ((${alias}.wK_bb) & (ap.king_mask)) <> 0)`;

        const sliderPart = t === TURNS.BLACK ?
            `(
                (mp.piece = ${PIECES.B} AND ${getIsBitSetSQL(`${alias}.bB_bb`, 'mp.from_sq')} AND (mp.ray_mask & (${all_pieces})) = 0) OR
                (mp.piece = ${PIECES.R} AND ${getIsBitSetSQL(`${alias}.bR_bb`, 'mp.from_sq')} AND (mp.ray_mask & (${all_pieces})) = 0) OR
                (mp.piece = ${PIECES.Q} AND ${getIsBitSetSQL(`${alias}.bQ_bb`, 'mp.from_sq')} AND (mp.ray_mask & (${all_pieces})) = 0)
            )` :
            `(
                (mp.piece = ${PIECES.B} AND ${getIsBitSetSQL(`${alias}.wB_bb`, 'mp.from_sq')} AND (mp.ray_mask & (${all_pieces})) = 0) OR
                (mp.piece = ${PIECES.R} AND ${getIsBitSetSQL(`${alias}.wR_bb`, 'mp.from_sq')} AND (mp.ray_mask & (${all_pieces})) = 0) OR
                (mp.piece = ${PIECES.Q} AND ${getIsBitSetSQL(`${alias}.wQ_bb`, 'mp.from_sq')} AND (mp.ray_mask & (${all_pieces})) = 0)
            )`;
            
        return `(EXISTS (
                SELECT 1 
                FROM attacks_precomputed ap 
                WHERE ap.square ${squareCond} 
                AND (${leaperPart})
                
                UNION ALL
                
                SELECT 1 
                FROM mobility_precomputed mp 
                WHERE mp.target_sq ${squareCond} 
                AND mp.piece IN (${PIECES.B}, ${PIECES.R}, ${PIECES.Q}) 
                AND (${sliderPart})
            ))`;
    }
    
    // Dynamic turn fallback
    return `(EXISTS (
            SELECT 1 
            FROM attacks_precomputed ap 
            WHERE ap.square ${squareCond} 
            AND (
                (${turn} = ${TURNS.BLACK} AND (((${alias}.bP_bb) & (ap.black_pawn_mask)) <> 0 OR ((${alias}.bN_bb) & (ap.knight_mask)) <> 0 OR ((${alias}.bK_bb) & (ap.king_mask)) <> 0))
                OR
                (${turn} = ${TURNS.WHITE} AND (((${alias}.wP_bb) & (ap.white_pawn_mask)) <> 0 OR ((${alias}.wN_bb) & (ap.knight_mask)) <> 0 OR ((${alias}.wK_bb) & (ap.king_mask)) <> 0))
            )
            
            UNION ALL
            
            SELECT 1 
            FROM mobility_precomputed mp 
            WHERE mp.target_sq ${squareCond} 
            AND mp.piece IN (${PIECES.B}, ${PIECES.R}, ${PIECES.Q}) 
            AND (
                (${turn} = ${TURNS.BLACK} AND (
                    (mp.piece = ${PIECES.B} AND ${getIsBitSetSQL(`${alias}.bB_bb`, 'mp.from_sq')} AND (mp.ray_mask & (${all_pieces})) = 0) OR
                    (mp.piece = ${PIECES.R} AND ${getIsBitSetSQL(`${alias}.bR_bb`, 'mp.from_sq')} AND (mp.ray_mask & (${all_pieces})) = 0) OR
                    (mp.piece = ${PIECES.Q} AND ${getIsBitSetSQL(`${alias}.bQ_bb`, 'mp.from_sq')} AND (mp.ray_mask & (${all_pieces})) = 0)
                ))
                OR
                (${turn} = ${TURNS.WHITE} AND (
                    (mp.piece = ${PIECES.B} AND ${getIsBitSetSQL(`${alias}.wB_bb`, 'mp.from_sq')} AND (mp.ray_mask & (${all_pieces})) = 0) OR
                    (mp.piece = ${PIECES.R} AND ${getIsBitSetSQL(`${alias}.wR_bb`, 'mp.from_sq')} AND (mp.ray_mask & (${all_pieces})) = 0) OR
                    (mp.piece = ${PIECES.Q} AND ${getIsBitSetSQL(`${alias}.wQ_bb`, 'mp.from_sq')} AND (mp.ray_mask & (${all_pieces})) = 0)
                ))
            )
        ))`;
}

/**
 * Generates SQL to check if a square is attacked by any piece of the specified turn.
 * Uses precomputed attack masks for Leaper pieces (Pawns, Knights, Kings)
 * and sliding ray checks for Sliding pieces (Bishops, Rooks, Queens).
 * 
 * @param {string} target_sq_expr - SQL expression for the square index (0-63)
 * @param {string} alias - Table alias for bitboard columns
 * @param {string|null} attacker_turn - Optional literal ('w' or 'b') or SQL expression
 * @returns {string} SQL EXISTS expression
 */

export function getIsSquareAttackedSQL(target_sq_expr, alias = 'em', attacker_turn = null) {
    return getAreSquaresAttackedSQL(target_sq_expr, alias, attacker_turn);
}


/**
 * Generates SQL to check if the king of the specified turn is in check.
 * 
 * Alias Legend (Optimization Context):
 * - s: search_space OR search_tree
 * - fn: frontier_nodes (Search Initialization)
 * - mc: merged_candidates
 * - m_expanded: Recursive Step Subquery (Minimax)
 * 
 
 * @param {string} stateAlias - Table alias for bitboard columns
 * @param {string} turnLiteral - The turn of the king being checked ('w' or 'b')
 * @returns {string} SQL EXISTS expression
 */

export function getIsKingInCheckSQL(stateAlias, turnLiteral) {
    // Only use the optimized king squares if they are explicitly available in the table
    const canUseOptimized = ['c', 's', 'fn', 'mc', 'merged_candidates', 'm_expanded', 'er', 'expanded_all', 'pvs_buffer', 'parent_nodes', 'prep'].includes(stateAlias);
    
    let king_sq;
    if (stateAlias === 'e' || stateAlias === 'legal_expanded') {
        // Special case for expanded tables which have pre-calculated active_king_sq
        king_sq = `${stateAlias}.active_king_sq`;
    } else if (stateAlias === 'm_expanded') {
        // For m_expanded, 'active_king_sq' refers to the NEXT player (opponent).
        // To check if the move was legal, we must check if the MOVER's King (now passive) is in check.
        // We use optimal wK_sq/bK_sq columns directly.
        king_sq = `(CASE WHEN ${turnLiteral} = ${TURNS.WHITE} THEN ${stateAlias}.wK_sq ELSE ${stateAlias}.bK_sq END)`;
    } else if (canUseOptimized) {
        king_sq = `(CASE WHEN ${turnLiteral} = ${TURNS.WHITE} THEN ${stateAlias}.wK_sq ELSE ${stateAlias}.bK_sq END)`;
    } else {
        king_sq = `(CASE WHEN (CASE WHEN ${turnLiteral} = ${TURNS.WHITE} THEN ${stateAlias}.wK_bb ELSE ${stateAlias}.bK_bb END) = 0 THEN 0 ELSE ${getBitIndexSQL(`(CASE WHEN ${turnLiteral} = ${TURNS.WHITE} THEN ${stateAlias}.wK_bb ELSE ${stateAlias}.bK_bb END)`)} END)`;
    }
    const attacker_turn = `(${turnLiteral} * -1)`;
    return getIsSquareAttackedSQL(king_sq, stateAlias, attacker_turn);
}

/**
 * LIGHTWEIGHT GIVES-CHECK DETECTION (for move scoring before LMP)
 * 
 * Computes whether a move likely gives check to the opponent king.
 * Uses piece-type geometry: knight L-shape, pawn diagonal, sliding piece alignment.
 * Sliding pieces (R/B/Q) may produce FALSE POSITIVES (ignoring blockers),
 * which is acceptable for move ordering — we just search a few extra moves.
 * 
 * @param {string} moveAlias - Alias for the move columns (from_sq, to_sq, piece)
 * @param {string} parentAlias - Alias for the parent node (passive_king_sq, active_turn)
 * @returns {string} SQL CASE expression returning 1 if move likely gives check, 0 otherwise
 */

export function getGivesCheckSQL(moveAlias, parentAlias) {
    // File and rank of target square and opponent king
    const toFile = `(${moveAlias}.to_sq % 8)`;
    const toRank = `(${moveAlias}.to_sq / 8)`;
    const kFile = `(${parentAlias}.passive_king_sq % 8)`;
    const kRank = `(${parentAlias}.passive_king_sq / 8)`;
    const fileDiff = `ABS(${toFile} - ${kFile})`;
    const rankDiff = `ABS(${toRank} - ${kRank})`;

    return `(CASE
        -- Knight check: L-shape pattern (file_diff + rank_diff = 3, both >= 1)
        WHEN ABS(${moveAlias}.piece) = ${PIECES.N} AND ${fileDiff} + ${rankDiff} = 3 AND ${fileDiff} >= 1 AND ${rankDiff} >= 1 THEN 1
        -- Rook check: same rank or same file (ignoring blockers)
        WHEN ABS(${moveAlias}.piece) = ${PIECES.R} AND (${toFile} = ${kFile} OR ${toRank} = ${kRank}) THEN 1
        -- Bishop check: same diagonal (ignoring blockers)
        WHEN ABS(${moveAlias}.piece) = ${PIECES.B} AND ${fileDiff} = ${rankDiff} AND ${fileDiff} > 0 THEN 1
        -- Queen check: same rank, file, or diagonal (ignoring blockers)
        WHEN ABS(${moveAlias}.piece) = ${PIECES.Q} AND (${toFile} = ${kFile} OR ${toRank} = ${kRank} OR (${fileDiff} = ${rankDiff} AND ${fileDiff} > 0)) THEN 1
        -- Pawn check: diagonal capture square matches king
        -- White pawn on to_sq attacks to_sq+7 (left) and to_sq+9 (right), but only if file differs by 1
        WHEN ${moveAlias}.piece = ${PIECES.P} AND ${rankDiff} = 1 AND ${fileDiff} = 1 AND ${toRank} < ${kRank} THEN 1
        -- Black pawn on to_sq attacks to_sq-7 (right) and to_sq-9 (left)
        WHEN ${moveAlias}.piece = ${PIECES.p} AND ${rankDiff} = 1 AND ${fileDiff} = 1 AND ${toRank} > ${kRank} THEN 1
        ELSE 0
    END)`;
}

/**
 * PSEUDO-LEGAL MOVE GENERATION
 * 
 * Generates all pseudo-legal moves for the current board state using a set-based query.
 * 
 * LOGIC FLOW:
 * 1. SLIDERS & LEAPERS (N, B, R, Q, K)
 *    - Strategy: Explode occupied squares via LATERAL join -> Hash Join Mobility.
 *    - Filtering: Uses ray masks for blockers and checks my_pieces for friendly fire.
 * 
 * 2. PAWNS (Vectorized)
 *    - Strategy: Global bitwise shifts on piece bitboards (Pushes & Captures).
 *    - Features: Handles promotions and capture identification (including piece type).
 * 
 * 3. CASTLING
 *    - Strategy: Join against a static VALUES table defining move requirements.
 *    - Verification: Checks rights, occupancy (path clearance), and legality (attack detection).
 * 
 * @param {string} stateTable - The name of the table containing the parent board states
 * @param {boolean} isLateral - Whether to use LATERAL join syntax
 * @param {string} forcedAlias - The alias to use for the state table (critical for subqueries)
 */

export function getMovesSelectSQL(stateTable, isLateral = false, forcedAlias = 's') {
    const sAlias = forcedAlias || (isLateral ? stateTable : 's');
    const fromS = sAlias;
    const latTablePrefix = isLateral ? `(SELECT 1) dummy` : `${stateTable} ${sAlias} `;

    const fromClause = isLateral 
        ? `squares sq` 
        : `${stateTable} ${sAlias} CROSS JOIN squares sq`;

    return `
        /* =========================================================
           PART 1: SLIDERS & LEAPERS (N, B, R, Q, K)
           Strategy: Explode Bitboards (LATERAL) -> Hash Join Mobility
           ========================================================= */
        SELECT 
            ${fromS}.id as parent_id, 
            sq.i as from_sq, 
            mp.target_sq AS to_sq, 
            (pt.piece * ${fromS}.active_turn)::TINYINT as piece,
            0::TINYINT as is_castle, 
            0::TINYINT as is_promo,
            
            -- [Capture Logic]
            (CASE WHEN ${getIsBitSetSQL(`${fromS}.opponent_pieces`, 'mp.target_sq')} THEN 1 ELSE 0 END)::TINYINT as is_capture,
            (COALESCE(${captureLogicFor('mp', fromS, 'target_sq')}, 0))::TINYINT as captured_piece
        
        FROM ${fromClause}
        -- 1. Explode: Find occupied squares and identify pieces using LATERAL
        JOIN LATERAL (
            SELECT (CASE WHEN ${fromS}.active_turn = ${TURNS.WHITE} THEN
                (CASE 
                    WHEN ${getIsBitSetSQL(`${fromS}.wN_bb`, 'sq.i')} THEN ${PIECES.N}
                    WHEN ${getIsBitSetSQL(`${fromS}.wB_bb`, 'sq.i')} THEN ${PIECES.B}
                    WHEN ${getIsBitSetSQL(`${fromS}.wR_bb`, 'sq.i')} THEN ${PIECES.R}
                    WHEN ${getIsBitSetSQL(`${fromS}.wQ_bb`, 'sq.i')} THEN ${PIECES.Q}
                    WHEN ${getIsBitSetSQL(`${fromS}.wK_bb`, 'sq.i')} THEN ${PIECES.K}
                END)
            ELSE
                (CASE 
                    WHEN ${getIsBitSetSQL(`${fromS}.bN_bb`, 'sq.i')} THEN ${PIECES.N}
                    WHEN ${getIsBitSetSQL(`${fromS}.bB_bb`, 'sq.i')} THEN ${PIECES.B}
                    WHEN ${getIsBitSetSQL(`${fromS}.bR_bb`, 'sq.i')} THEN ${PIECES.R}
                    WHEN ${getIsBitSetSQL(`${fromS}.bQ_bb`, 'sq.i')} THEN ${PIECES.Q}
                    WHEN ${getIsBitSetSQL(`${fromS}.bK_bb`, 'sq.i')} THEN ${PIECES.K}
                END)
            END) as piece
        ) pt ON pt.piece IS NOT NULL
        
        -- 2. Join Mobility
        JOIN mobility_precomputed mp ON mp.from_sq = sq.i AND mp.piece = pt.piece
        
        WHERE 
        -- Blockers
        (mp.ray_mask & ${fromS}.all_pieces) = 0 
        -- Friendly Fire
        AND NOT ${getIsBitSetSQL(`${fromS}.my_pieces`, 'mp.target_sq')}

        UNION ALL

        /* =========================================================
           PART 2: PAWNS (Vectorized)
           Strategy: Global Bitwise Shifts
           ========================================================= */
        -- SINGLE PUSH (White: << 8, Black: >> 8)
        SELECT 
            ${fromS}.id, sq.i - (CASE WHEN ${fromS}.active_turn = ${TURNS.WHITE} THEN 8 ELSE -8 END), sq.i,
            (CASE WHEN ${fromS}.active_turn = ${TURNS.WHITE} THEN ${PIECES.P} ELSE ${PIECES.p} END)::TINYINT,
            0, 
            (CASE WHEN (sq.i >> 3) = (CASE WHEN ${fromS}.active_turn = ${TURNS.WHITE} THEN 7 ELSE 0 END) THEN 1 ELSE 0 END), -- Promo
            0, 0
        FROM ${fromClause}
        WHERE ${fromS}.active_turn = ${TURNS.WHITE}
          AND ${getIsBitSetSQL(`(CAST((CAST(${fromS}.wP_bb AS HUGEINT) << 8) & CAST(${MASK_FULL} AS HUGEINT) AS ${BBTYPE}) & ~${fromS}.all_pieces)`, 'sq.i')}
        UNION ALL
        SELECT 
            ${fromS}.id, sq.i + 8, sq.i,
            ${PIECES.p}, 0, 
            (CASE WHEN (sq.i >> 3) = 0 THEN 1 ELSE 0 END), 0, 0
        FROM ${fromClause}
        WHERE ${fromS}.active_turn = ${TURNS.BLACK}
          AND ${getIsBitSetSQL(`((${fromS}.bP_bb >> 8) & ~${fromS}.all_pieces)`, 'sq.i')}

        UNION ALL

        -- DOUBLE PUSH
        SELECT 
            ${fromS}.id, sq.i - 16, sq.i, ${PIECES.P}, 0, 0, 0, 0
        FROM ${fromClause}
        WHERE ${fromS}.active_turn = ${TURNS.WHITE}
          AND ${getIsBitSetSQL(`CAST(((CAST((${fromS}.wP_bb & CAST(${MASK_RANK_2} AS ${BBTYPE})) AS HUGEINT) << 16) & CAST(${MASK_FULL} AS HUGEINT)) AS ${BBTYPE}) & ~${fromS}.all_pieces & ~CAST(((CAST(${fromS}.all_pieces AS HUGEINT) << 8) & CAST(${MASK_FULL} AS HUGEINT)) AS ${BBTYPE})`, 'sq.i')}
        UNION ALL
        SELECT 
            ${fromS}.id, sq.i + 16, sq.i, ${PIECES.p}, 0, 0, 0, 0
        FROM ${fromClause}
        WHERE ${fromS}.active_turn = ${TURNS.BLACK}
          AND ${getIsBitSetSQL(`(((${fromS}.bP_bb & CAST(${MASK_RANK_7} AS ${BBTYPE}))) >> 16) & ~${fromS}.all_pieces & ~(${fromS}.all_pieces >> 8)`, 'sq.i')}

        UNION ALL

        -- CAPTURES (Left/Right)
        
        -- W_L (7)
        SELECT ${fromS}.id, sq.i - 7, sq.i, ${PIECES.P}, 0, (CASE WHEN (sq.i >> 3) = 7 THEN 1 ELSE 0 END), 1, 
               CAST(COALESCE(${captureLogicFor('sq_to', fromS, 'to_sq')}, 0) AS TINYINT)
        FROM ${fromClause} LEFT JOIN LATERAL (SELECT sq.i as to_sq) sq_to ON true
        WHERE ${fromS}.active_turn = ${TURNS.WHITE}
          AND ${getIsBitSetSQL(`CAST(((CAST((${fromS}.wP_bb & ~CAST(${MASK_FILE_A} AS ${BBTYPE})) AS HUGEINT) << 7) & CAST(${MASK_FULL} AS HUGEINT)) AS ${BBTYPE}) & ${fromS}.opponent_pieces`, 'sq.i')}
          
        UNION ALL
        -- W_R (9)
        SELECT ${fromS}.id, sq.i - 9, sq.i, ${PIECES.P}, 0, (CASE WHEN (sq.i >> 3) = 7 THEN 1 ELSE 0 END), 1,
               CAST(COALESCE(${captureLogicFor('sq_to', fromS, 'to_sq')}, 0) AS TINYINT)
        FROM ${fromClause} LEFT JOIN LATERAL (SELECT sq.i as to_sq) sq_to ON true
        WHERE ${fromS}.active_turn = ${TURNS.WHITE}
          AND ${getIsBitSetSQL(`CAST(((CAST((${fromS}.wP_bb & ~CAST(${MASK_FILE_H} AS ${BBTYPE})) AS HUGEINT) << 9) & CAST(${MASK_FULL} AS HUGEINT)) AS ${BBTYPE}) & ${fromS}.opponent_pieces`, 'sq.i')}

        UNION ALL
        -- B_L (>> 9) (Mirror of W_R)
        SELECT ${fromS}.id, sq.i + 9, sq.i, ${PIECES.p}, 0, (CASE WHEN (sq.i >> 3) = 0 THEN 1 ELSE 0 END), 1,
               CAST(COALESCE(${captureLogicFor('sq_to', fromS, 'to_sq')}, 0) AS TINYINT)
        FROM ${fromClause} LEFT JOIN LATERAL (SELECT sq.i as to_sq) sq_to ON true
        WHERE ${fromS}.active_turn = ${TURNS.BLACK}
          AND ${getIsBitSetSQL(`(((${fromS}.bP_bb & ~CAST(${MASK_FILE_A} AS ${BBTYPE}))) >> 9) & ${fromS}.opponent_pieces`, 'sq.i')}

        UNION ALL
        -- B_R (>> 7) (Mirror of W_L)
        SELECT ${fromS}.id, sq.i + 7, sq.i, ${PIECES.p}, 0, (CASE WHEN (sq.i >> 3) = 0 THEN 1 ELSE 0 END), 1,
               CAST(COALESCE(${captureLogicFor('sq_to', fromS, 'to_sq')}, 0) AS TINYINT)
        FROM ${fromClause} LEFT JOIN LATERAL (SELECT sq.i as to_sq) sq_to ON true
        WHERE ${fromS}.active_turn = ${TURNS.BLACK}
          AND ${getIsBitSetSQL(`(((${fromS}.bP_bb & ~CAST(${MASK_FILE_H} AS ${BBTYPE}))) >> 7) & ${fromS}.opponent_pieces`, 'sq.i')}

        UNION ALL

        /* =========================================================
           PART 3: CASTLING (Rights & Path Verification)
           Strategy: Subquery Barrier & Consolidated Attack Detection
           ========================================================= */
        SELECT q.parent_id, q.from_sq, q.to_sq, 
               q.piece, 
               1, 0, 0, 0
        FROM (
            SELECT ${fromS}.id as parent_id, cv.from_sq, cv.to_sq, 
                   CAST(CASE WHEN cv.turn = ${TURNS.WHITE} THEN ${PIECES.K} ELSE ${PIECES.k} END AS TINYINT) as piece,
                   cv.s1, cv.s2, cv.s3, cv.turn,
                   ${fromS}.wP_bb, ${fromS}.wN_bb, ${fromS}.wK_bb, ${fromS}.wB_bb, ${fromS}.wR_bb, ${fromS}.wQ_bb,
                   ${fromS}.bP_bb, ${fromS}.bN_bb, ${fromS}.bK_bb, ${fromS}.bB_bb, ${fromS}.bR_bb, ${fromS}.bQ_bb,
                   ${fromS}.all_pieces
            FROM (
                -- Definition of Castling Moves:
                -- turn: 1=White, -1=Black
                -- rights: Castling rights bitmask required (1=WK, 2=WQ, 4=BK, 8=BQ)
                -- from_sq: King start square
                -- to_sq: King destination square
                -- rook_sq: Rook start square
                -- e1, e2, e3: Squares that must be empty (-1 if not applicable)
                -- s1, s2, s3: Squares that must not be attacked by enemy (Start, Path, Dest)
                VALUES 
                    (1, 1, 4, 6, 7, 5, 6, -1, 4, 5, 6),
                    (1, 2, 4, 2, 0, 1, 2, 3, 4, 3, 2),
                    (-1, 4, 60, 62, 63, 61, 62, -1, 60, 61, 62),
                    (-1, 8, 60, 58, 56, 57, 58, 59, 60, 59, 58)
            ) AS cv(turn, rights, from_sq, to_sq, rook_sq, e1, e2, e3, s1, s2, s3)
            ${isLateral ? "" : `, ${stateTable} ${forcedAlias}`}
            WHERE ${fromS}.active_turn = cv.turn
              AND (${fromS}.castling_rights & cv.rights::HUGEINT) <> 0
              AND ${getIsBitSetSQL(`(CASE WHEN cv.turn = ${TURNS.WHITE} THEN ${fromS}.wR_bb ELSE ${fromS}.bR_bb END)`, 'cv.rook_sq')}
              AND NOT ${getIsBitSetSQL(`${fromS}.all_pieces`, 'cv.e1')}
              AND NOT ${getIsBitSetSQL(`${fromS}.all_pieces`, 'cv.e2')}
              AND (cv.e3 = -1 OR NOT ${getIsBitSetSQL(`${fromS}.all_pieces`, 'cv.e3')})
        ) q
        WHERE NOT (${getAreSquaresAttackedSQL(['q.s1', 'q.s2', 'q.s3'], 'q', `(q.turn * -1)`)})
        `;
}





export function captureLogicFor(m, s, targetSqCol = 'to_sq') {
    const colMap = {
        [PIECES.K]: 'wK_bb', [PIECES.Q]: 'wQ_bb', [PIECES.R]: 'wR_bb', [PIECES.B]: 'wB_bb', [PIECES.N]: 'wN_bb', [PIECES.P]: 'wP_bb',
        [PIECES.k]: 'bK_bb', [PIECES.q]: 'bQ_bb', [PIECES.r]: 'bR_bb', [PIECES.b]: 'bB_bb', [PIECES.n]: 'bN_bb', [PIECES.p]: 'bP_bb'
    };

    const cases = Object.entries(colMap).map(([p_val, col]) => {
        return `WHEN ((${s}.${col}) & (${getSafeLSH(`1::${BBTYPE}`, `${m}.${targetSqCol}`)})) <> 0 THEN ${p_val}`;
    }).join('\n        ');

    return `(CASE 
        ${cases}
        ELSE NULL END)`;
}


/**
 * Generates SQL columns representing the NEW bitboards after applying a move.
 * Combines calculating the Delta and applying it to the State in one expression.
 * Returns: (state.wP_bb ^ delta_expr) AS wP_bb, ...
 */

export function getAppliedStateDirectSQL(m, s, capturedPieceAlias = null) {
    const pieces = Object.keys(PIECES);
    const colMap = {
        [PIECES.K]: 'wK_bb', [PIECES.Q]: 'wQ_bb', [PIECES.R]: 'wR_bb', [PIECES.B]: 'wB_bb', [PIECES.N]: 'wN_bb', [PIECES.P]: 'wP_bb',
        [PIECES.k]: 'bK_bb', [PIECES.q]: 'bQ_bb', [PIECES.r]: 'bR_bb', [PIECES.b]: 'bB_bb', [PIECES.n]: 'bN_bb', [PIECES.p]: 'bP_bb'
    };

    return pieces.map(p => {
        const p_val = PIECES[p];
        const isWhite = p_val > 0;
        const bbCol = colMap[p_val];
        const maskCol = `mask_${isWhite ? 'w' + p : 'b' + p.toUpperCase()}`;
        
        const deltaFrom = getSafeLSH(`1::${BBTYPE}`, `${m}.from_sq`);
        const deltaTo = getSafeLSH(`1::${BBTYPE}`, `${m}.to_sq`);
        
        let terms = [
            `(${deltaFrom} & pm_d.${maskCol})`,
            `(${deltaTo} & pm_a.${maskCol})`,
            `(${deltaTo} & COALESCE(pm_c.${maskCol}, 0::${BBTYPE}))`
        ];

        // CASTLING (Rook Movement) - Kept imperative as it involves specific non-from/to logic
        const rookVal = isWhite ? PIECES.R : PIECES.r;
        const kingVal = isWhite ? PIECES.K : PIECES.k;
        if (p_val === rookVal) {
             const castleDelta = `(CASE WHEN ${m}.is_castle = 1 AND ${m}.piece = ${kingVal} THEN ${getXorSQL(
                getSafeLSH(`1::${BBTYPE}`, `(CASE 
                WHEN ${m}.to_sq = 6 THEN 7::TINYINT
                WHEN ${m}.to_sq = 2 THEN 0::TINYINT
                WHEN ${m}.to_sq = 62 THEN 63::TINYINT
                WHEN ${m}.to_sq = 58 THEN 56::TINYINT
                ELSE ${m}.from_sq END)`),
                getSafeLSH(`1::${BBTYPE}`, `(CASE 
                WHEN ${m}.to_sq = 6 THEN 5::TINYINT 
                WHEN ${m}.to_sq = 2 THEN 3::TINYINT 
                WHEN ${m}.to_sq = 62 THEN 61::TINYINT 
                WHEN ${m}.to_sq = 58 THEN 59::TINYINT 
                ELSE ${m}.from_sq END)`)
             )} ELSE 0 END)`;
            terms.push(castleDelta);
        }
        

        // Combine
        return `${getXorSQL(`${s}.${bbCol}`, getXorSQL(terms))} AS ${bbCol}`;
    }).join(',\n        ');
}

/**
 * Generates SQL to calculate a Zobrist hash for a given board state.
 * 
 * @param {string} alias - Table alias for board state columns
 * @returns {string} SQL expression for ${BBTYPE} hash
 */

export function getApplyMoveSQL(move, isWhiteTurn, gameState) {
    const from_sq = move.from_sq;
    const to_sq = move.to_sq;
    const piece = move.piece;
    const isCastle = move.isCastle !== undefined ? move.isCastle : move.is_castle;
    const isPromo = move.isPromo !== undefined ? move.isPromo : move.is_promo;
    const opponentTurnVal = isWhiteTurn ? TURNS.BLACK : TURNS.WHITE;
    const pieceVal = typeof piece === 'string' ? PIECES[piece] : piece;

    return `
        -- Apply move logic
        DROP TABLE IF EXISTS final_state_tmp;
        CREATE TEMPORARY TABLE final_state_tmp AS
            WITH search_space AS (
                SELECT * FROM v_board_state
            ),
            all_moves_one AS (
                SELECT 1::INTEGER as id, 0::INTEGER as parent_id, 
                ${from_sq} as from_sq, ${to_sq} as to_sq, ${pieceVal} as piece,
                ${isCastle ? 1 : 0} as is_castle, ${isPromo ? 1 : 0} as is_promo
            )
            SELECT 
                ${opponentTurnVal} as active_turn,
                (CASE WHEN m.from_sq = 4 OR m.to_sq = 4 THEN (s.castling_rights & 12) WHEN m.from_sq = 7 OR m.to_sq = 7 THEN (s.castling_rights & 14) WHEN m.from_sq = 0 OR m.to_sq = 0 THEN (s.castling_rights & 13) WHEN m.from_sq = 60 OR m.to_sq = 60 THEN (s.castling_rights & 3) WHEN m.from_sq = 63 OR m.to_sq = 63 THEN (s.castling_rights & 11) WHEN m.from_sq = 56 OR m.to_sq = 56 THEN (s.castling_rights & 7) ELSE s.castling_rights END) as castling_rights,
                ${getAppliedStateDirectSQL('m', 's')}
            FROM search_space s
            CROSS JOIN all_moves_one m
            LEFT JOIN piece_masks pm_d ON pm_d.piece = m.piece
            LEFT JOIN piece_masks pm_a ON pm_a.piece = (CASE WHEN m.is_promo = 1 THEN (CASE WHEN ${isWhiteTurn ? 'true' : 'false'} THEN ${PIECES.Q} ELSE ${PIECES.q} END) ELSE m.piece END)
            LEFT JOIN piece_masks pm_c ON pm_c.piece = ${captureLogicFor('m', 's')}
            ;

        -- Apply to piece_bitboards (Single Update)
        UPDATE piece_bitboards SET bitboard = (CASE piece 
            WHEN ${PIECES.K} THEN COALESCE((SELECT wK_bb FROM final_state_tmp), 0::${BBTYPE})
            WHEN ${PIECES.Q} THEN COALESCE((SELECT wQ_bb FROM final_state_tmp), 0::${BBTYPE})
            WHEN ${PIECES.R} THEN COALESCE((SELECT wR_bb FROM final_state_tmp), 0::${BBTYPE})
            WHEN ${PIECES.B} THEN COALESCE((SELECT wB_bb FROM final_state_tmp), 0::${BBTYPE})
            WHEN ${PIECES.N} THEN COALESCE((SELECT wN_bb FROM final_state_tmp), 0::${BBTYPE})
            WHEN ${PIECES.P} THEN COALESCE((SELECT wP_bb FROM final_state_tmp), 0::${BBTYPE})
            WHEN ${PIECES.k} THEN COALESCE((SELECT bK_bb FROM final_state_tmp), 0::${BBTYPE})
            WHEN ${PIECES.q} THEN COALESCE((SELECT bQ_bb FROM final_state_tmp), 0::${BBTYPE})
            WHEN ${PIECES.r} THEN COALESCE((SELECT bR_bb FROM final_state_tmp), 0::${BBTYPE})
            WHEN ${PIECES.b} THEN COALESCE((SELECT bB_bb FROM final_state_tmp), 0::${BBTYPE})
            WHEN ${PIECES.n} THEN COALESCE((SELECT bN_bb FROM final_state_tmp), 0::${BBTYPE})
            WHEN ${PIECES.p} THEN COALESCE((SELECT bP_bb FROM final_state_tmp), 0::${BBTYPE})
            ELSE bitboard END)
        WHERE EXISTS (SELECT 1 FROM final_state_tmp);

        -- Update game_state
        UPDATE game_state SET active_turn = (SELECT active_turn FROM final_state_tmp),
                            castling_rights = (SELECT castling_rights FROM final_state_tmp)
        WHERE EXISTS (SELECT 1 FROM final_state_tmp);
        
        DROP TABLE final_state_tmp;
    `;
}


export function getBoardStateCTEs(isWhiteTurn) {
    const turnVal = isWhiteTurn ? TURNS.WHITE : TURNS.BLACK;
    return `
        board_state_bbs AS (
            SELECT 
                0 as id, ${turnVal} as active_turn,
                wK_bb, wQ_bb, wR_bb, wB_bb, wN_bb, wP_bb,
                bK_bb, bQ_bb, bR_bb, bB_bb, bN_bb, bP_bb,
                castling_rights,
                ${getBitIndexSQL('wK_bb')} as wK_sq,
                ${getBitIndexSQL('bK_bb')} as bK_sq
            FROM v_board_state
        ),
        search_space AS (
            SELECT *,
                ${getOrSQL(['wK_bb', 'wQ_bb', 'wR_bb', 'wB_bb', 'wN_bb', 'wP_bb', 'bK_bb', 'bQ_bb', 'bR_bb', 'bB_bb', 'bN_bb', 'bP_bb'])} as all_pieces,
                (CASE WHEN active_turn = ${TURNS.WHITE} THEN ${getOrSQL(['wK_bb', 'wQ_bb', 'wR_bb', 'wB_bb', 'wN_bb', 'wP_bb'])} ELSE ${getOrSQL(['bK_bb', 'bQ_bb', 'bR_bb', 'bB_bb', 'bN_bb', 'bP_bb'])} END) as my_pieces,
                (CASE WHEN active_turn = ${TURNS.WHITE} THEN ${getOrSQL(['bK_bb', 'bQ_bb', 'bR_bb', 'bB_bb', 'bN_bb', 'bP_bb'])} ELSE ${getOrSQL(['wK_bb', 'wQ_bb', 'wR_bb', 'wB_bb', 'wN_bb', 'wP_bb'])} END) as opponent_pieces
            FROM board_state_bbs
        )
    `;
}


export function getPseudoLegalMovesSQL(isWhiteTurn) {
    return `WITH ${getBoardStateCTEs(isWhiteTurn)}, 
            all_moves AS (${getMovesSelectSQL('search_space')})
            SELECT from_sq, to_sq, piece, is_castle, is_promo, is_capture FROM all_moves t; `;
}


export function getLegalMoveCountSQL(isWhiteTurn) {
    return `WITH ${getBoardStateCTEs(isWhiteTurn)}, 
            all_moves AS (${getMovesSelectSQL('search_space')}),
            piece_masks AS (
                SELECT * FROM (VALUES ${getPieceMasksValuesSQL()}) AS t(piece, ${getPieceMasksColumnsSQL()})
            ),
            expanded_raw AS (
                SELECT 
                    m_in.*,
                    s.active_turn as active_turn_parent,
                    ${getAppliedStateDirectSQL('m_in', 's')},
                    CAST(CASE 
                        WHEN m_in.piece = (CASE WHEN s.active_turn = ${TURNS.WHITE} THEN ${PIECES.K} ELSE ${PIECES.k} END) THEN m_in.to_sq 
                        ELSE (CASE WHEN s.active_turn = ${TURNS.WHITE} THEN ${getBitIndexSQL('s.wK_bb')} ELSE ${getBitIndexSQL('s.bK_bb')} END)
                    END AS TINYINT) as active_king_sq
                FROM board_state_bbs s
                CROSS JOIN all_moves m_in
                LEFT JOIN piece_masks pm_d ON pm_d.piece = m_in.piece
                LEFT JOIN piece_masks pm_a ON pm_a.piece = (CASE WHEN m_in.is_promo = 1 THEN (CASE WHEN s.active_turn = ${TURNS.WHITE} THEN ${PIECES.Q} ELSE ${PIECES.q} END) ELSE m_in.piece END)
                LEFT JOIN piece_masks pm_c ON pm_c.piece = ${captureLogicFor('m_in', 's')}
            ),
            expanded AS (
                SELECT *,
                    ${getOrSQL(['wK_bb', 'wQ_bb', 'wR_bb', 'wB_bb', 'wN_bb', 'wP_bb', 'bK_bb', 'bQ_bb', 'bR_bb', 'bB_bb', 'bN_bb', 'bP_bb'])} as all_pieces
                FROM expanded_raw
            )
            SELECT CAST(COUNT(*) AS INTEGER) as move_count FROM expanded e WHERE NOT (${getIsKingInCheckSQL('e', 'e.active_turn_parent')});
`;
}

export function getKingInCheckFullSQL(isWhiteTurn) {
    const turnVal = isWhiteTurn ? TURNS.WHITE : TURNS.BLACK;
    return `
        WITH board_state_bbs AS (
            SELECT 
                COALESCE((SELECT bitboard FROM piece_bitboards WHERE piece = ${PIECES.K}), 0::${BBTYPE}) as wK_bb,
                COALESCE((SELECT bitboard FROM piece_bitboards WHERE piece = ${PIECES.Q}), 0::${BBTYPE}) as wQ_bb,
                COALESCE((SELECT bitboard FROM piece_bitboards WHERE piece = ${PIECES.R}), 0::${BBTYPE}) as wR_bb,
                COALESCE((SELECT bitboard FROM piece_bitboards WHERE piece = ${PIECES.B}), 0::${BBTYPE}) as wB_bb,
                COALESCE((SELECT bitboard FROM piece_bitboards WHERE piece = ${PIECES.N}), 0::${BBTYPE}) as wN_bb,
                COALESCE((SELECT bitboard FROM piece_bitboards WHERE piece = ${PIECES.P}), 0::${BBTYPE}) as wP_bb,
                COALESCE((SELECT bitboard FROM piece_bitboards WHERE piece = ${PIECES.k}), 0::${BBTYPE}) as bK_bb,
                COALESCE((SELECT bitboard FROM piece_bitboards WHERE piece = ${PIECES.q}), 0::${BBTYPE}) as bQ_bb,
                COALESCE((SELECT bitboard FROM piece_bitboards WHERE piece = ${PIECES.r}), 0::${BBTYPE}) as bR_bb,
                COALESCE((SELECT bitboard FROM piece_bitboards WHERE piece = ${PIECES.b}), 0::${BBTYPE}) as bB_bb,
                COALESCE((SELECT bitboard FROM piece_bitboards WHERE piece = ${PIECES.n}), 0::${BBTYPE}) as bN_bb,
                COALESCE((SELECT bitboard FROM piece_bitboards WHERE piece = ${PIECES.p}), 0::${BBTYPE}) as bP_bb,
                castling_rights, active_turn
            FROM game_state
        )
        SELECT ${getIsKingInCheckSQL('board_state_bbs', turnVal)} as is_check FROM board_state_bbs
    `;
}

/**
 * BATCHED PVS (Principal Variation Search) STRATEGY
 * 
 * Generates SQL to expand a batch of candidate moves into new board positions.
 * 
 * This function is part of the Batched PVS pipeline used in find_best_move_batched_pvs:
 *   frontier_nodes → generate moves → candidates_pvs → [getExpansionPVS_SQL] → next_frontier_nodes
 * 
 * At each depth, moves are split into batches:
 * - PV Batch (rn=1): The best-guess move from depth-1 search
 * - Rest Batch (rn>1): Remaining moves, searched with null window
 * 
 * Input:  Moves from `sourceTable` (typically `candidates_pvs`) filtered by `batchCondition`
 * Output: New positions inserted into `next_frontier_nodes`
 * 
 * @param {string} sourceTable - Table containing candidate moves (e.g., 'candidates_pvs')
 * @param {string} batchCondition - SQL WHERE condition to filter moves (e.g., "rn = 1" for PV, "rn > 1" for rest)
 * @param {boolean} useTT - Whether to probe the transposition table for cached evaluations
 * @returns {string} SQL statements to execute the expansion
 */



export function getPieceMasksValuesSQL() {
    const piecemasks = [
         {p: PIECES.P, col: 'wP'}, {p: PIECES.N, col: 'wN'}, {p: PIECES.B, col: 'wB'}, 
         {p: PIECES.R, col: 'wR'}, {p: PIECES.Q, col: 'wQ'}, {p: PIECES.K, col: 'wK'},
         {p: PIECES.p, col: 'bP'}, {p: PIECES.n, col: 'bN'}, {p: PIECES.b, col: 'bB'}, 
         {p: PIECES.r, col: 'bR'}, {p: PIECES.q, col: 'bQ'}, {p: PIECES.k, col: 'bK'}
    ];
    return piecemasks.map(pm => {
        const masks = piecemasks.map(targetP => targetP.p === pm.p ? `(~0::${BBTYPE})` : `0::${BBTYPE}`);
        return `(${pm.p}, ${masks.join(', ')})`;
    }).join(', ');
}


export function getPieceMasksColumnsSQL() {
     const piecemasks = [
         {p: PIECES.P, col: 'wP'}, {p: PIECES.N, col: 'wN'}, {p: PIECES.B, col: 'wB'}, 
         {p: PIECES.R, col: 'wR'}, {p: PIECES.Q, col: 'wQ'}, {p: PIECES.K, col: 'wK'},
         {p: PIECES.p, col: 'bP'}, {p: PIECES.n, col: 'bN'}, {p: PIECES.b, col: 'bB'}, 
         {p: PIECES.r, col: 'bR'}, {p: PIECES.q, col: 'bQ'}, {p: PIECES.k, col: 'bK'}
    ];
    return piecemasks.map(pm => `mask_${pm.col}`).join(', ');
}


export function getCastlingMaskSQL(alias) {
     return `(
            15 
            & (CASE WHEN ${alias}.piece = ${PIECES.K} OR ${alias}.from_sq = 4 OR ${alias}.to_sq = 4 THEN 12 ELSE 15 END)
            & (CASE WHEN ${alias}.piece = ${PIECES.k} OR ${alias}.from_sq = 60 OR ${alias}.to_sq = 60 THEN 3 ELSE 15 END)
            & (CASE WHEN ${alias}.from_sq = 0 OR ${alias}.to_sq = 0 THEN 13 ELSE 15 END)
            & (CASE WHEN ${alias}.from_sq = 7 OR ${alias}.to_sq = 7 THEN 14 ELSE 15 END)
            & (CASE WHEN ${alias}.from_sq = 56 OR ${alias}.to_sq = 56 THEN 7 ELSE 15 END)
            & (CASE WHEN ${alias}.from_sq = 63 OR ${alias}.to_sq = 63 THEN 11 ELSE 15 END)
        )`;
}


export function getGenerateRankedRawMovesSQL(sourceTable, targetTable, batchSize, maxDepth, options = {}) {
    // Generates ALL moves for nodes in sourceTable, scores them, and stores in targetTable with batch_id.
    // Construct optional joins
    const joins = [];
    if (options.useTT) joins.push('LEFT JOIN transposition_table tt ON (tt.board_hash = c.board_hash)');
    if (options.useHistory) joins.push('LEFT JOIN history_moves h ON (h.piece = m.piece AND h.to_sq = m.to_sq)');
    
    // Construct optional scoring terms
    const ttScore = options.useTT ? `(CASE WHEN tt.best_move_from = m.from_sq AND tt.best_move_to = m.to_sq THEN ${ORDER_TT_OFFSET} ELSE 0 END)` : '0';
    const killerScore = options.useKillers ? `(CASE WHEN EXISTS(SELECT 1 FROM killer_moves km WHERE km.depth = c.depth AND km.from_sq = m.from_sq AND km.to_sq = m.to_sq) THEN ${ORDER_KILLER_OFFSET} ELSE 0 END)` : '0';
    const historyScore = options.useHistory ? `LEAST(COALESCE(h.score, 0), ${ORDER_HISTORY_MAX})` : '0';

    const lmpFilter = options.useLMP ? `(sq.depth = 0 OR sq.row_rank <= (8 + (${maxDepth} - sq.depth) * 3) OR sq.is_capture = 1 OR sq.is_promo = 1 OR sq.is_castle = 1 OR sq.is_check = 1 OR sq.gives_check = 1)` : '1=1';
    
    return `
    -- 1. Create temporary search space
    DROP TABLE IF EXISTS search_space;
    CREATE TEMPORARY TABLE search_space AS 
    SELECT 
        id, parent_id, depth, from_sq, to_sq, piece, is_castle, is_promo, is_capture, captured_piece,
        wK_bb, wQ_bb, wR_bb, wB_bb, wN_bb, wP_bb, bK_bb, bQ_bb, bR_bb, bB_bb, bN_bb, bP_bb,
        castling_rights, active_turn, static_eval, board_hash, wK_sq, bK_sq, all_pieces,
        my_pieces, opponent_pieces, active_king_sq, passive_king_sq, is_check
    FROM ${sourceTable};

    -- 2. Generate Moves & Calculate Score & Rank
    -- Using a subquery/CTE to compute rank first, then assign batch_id using Progressive Batching.
    -- Batch 0: Top 1 Move (Hash move / PV move)
    -- Batch 1: Next 3 Moves (Captures, Killers)
    -- Batch 2: Next 8 Moves (Good quiet moves)
    -- Batch 3+: Remaining moves chunked by batchSize.
    
    DELETE FROM ${targetTable};
    INSERT INTO ${targetTable} 
    SELECT 
        sq.parent_id, sq.active_turn, sq.depth, 
        sq.wK_bb, sq.wQ_bb, sq.wR_bb, sq.wB_bb, sq.wN_bb, sq.wP_bb, 
        sq.bK_bb, sq.bQ_bb, sq.bR_bb, sq.bB_bb, sq.bN_bb, sq.bP_bb,
        sq.castling_rights,
        sq.static_eval,
        sq.all_pieces,
        sq.wK_sq, sq.bK_sq,
        
        sq.from_sq, sq.to_sq, sq.piece, sq.captured_piece, sq.is_castle, sq.is_promo, sq.is_capture,
        sq.is_check,
        sq.score,
        
        0::TINYINT as is_processed,
        
        -- Custom Batch Logic: Progressive Batching
        CAST(
            CASE 
                WHEN sq.row_rank = 1 THEN 0 
                WHEN sq.row_rank <= 4 THEN 1 
                WHEN sq.row_rank <= 12 THEN 2 
                ELSE 3 + FLOOR((sq.row_rank - 13) / ${batchSize}) 
            END 
        AS INTEGER) as batch_id

    FROM (
        SELECT 
            *,
            ROW_NUMBER() OVER (PARTITION BY parent_id ORDER BY score DESC) as row_rank
        FROM (
            SELECT 
                c.id as parent_id, c.active_turn, c.depth, 
                c.wK_bb, c.wQ_bb, c.wR_bb, c.wB_bb, c.wN_bb, c.wP_bb, 
                c.bK_bb, c.bQ_bb, c.bR_bb, c.bB_bb, c.bN_bb, c.bP_bb,
                c.castling_rights,
                c.static_eval,
                c.all_pieces,
                c.wK_sq, c.bK_sq,
                c.is_check,
                
                m.from_sq, m.to_sq, m.piece, m.captured_piece, m.is_castle, m.is_promo, m.is_capture,
                ${getGivesCheckSQL('m', 'c')} as gives_check,
                
                -- SCORING LOGIC (Strict Layering)
                -- 1. TT Best Move: > 2,000,000
                -- 2. Captures: > 1,000,000 (MVV-LVA)
                -- 3. Checks: > 600,000
                -- 4. Killers: > 500,000
                -- 5. History + PST: < 400,000 + ~100
                (
                    ${ttScore} +
                    (CASE WHEN ${options.useMVVLVA !== false} AND m.is_capture = 1 THEN ${ORDER_CAPTURE_OFFSET} + ${getMVVLVAScoreSQL('m.captured_piece', 'm.piece')} ELSE 0 END) +
                    (CASE WHEN ${options.useMVVLVA !== false} AND m.is_capture = 0 AND (c.is_check = 1 OR ${getGivesCheckSQL('m', 'c')} = 1) THEN ${ORDER_CHECK_OFFSET} ELSE 0 END) +
                    ${killerScore} +
                    ${historyScore} + 
                    (CASE WHEN ${options.usePST !== false} THEN COALESCE(pst.value, 0) ELSE 0 END)
                ) as score

            FROM search_space c
            ${joins.length > 0 && options.useTT ? joins[0] : ''}
            , LATERAL (${getMovesSelectSQL('search_space', true, 'c')}) m
            ${joins.length > 0 && !options.useTT && joins[0].includes('history_moves') ? joins[0] : (joins.length > 1 ? joins[1] : '')}
            LEFT JOIN pst_values pst ON (pst.piece = m.piece AND pst.square = m.to_sq)
        ) raw_scored
    ) sq
    WHERE ${lmpFilter};

    `;
}


export function getExpandFromRawMovesSQL(rawMovesTable, targetFrontier, depth, batchSize, isWhiteTurn, batchId, pAlpha = null, pBeta = null, options = {}) {
    const maxDepth = options.maxDepth || 4;
    return `
    INSERT INTO ${targetFrontier} (
        id, parent_id, depth, from_sq, to_sq, piece, is_castle, is_promo, is_capture, captured_piece,
        wK_bb, wQ_bb, wR_bb, wB_bb, wN_bb, wP_bb, bK_bb, bQ_bb, bR_bb, bB_bb, bN_bb, bP_bb,
        castling_rights, active_turn, static_eval, minimax_eval, board_hash, wK_sq, bK_sq, all_pieces,
        my_pieces, opponent_pieces, active_king_sq, passive_king_sq, is_check
    )
    WITH batch_moves AS (
        SELECT * FROM ${rawMovesTable} WHERE batch_id = ${batchId} AND is_processed = 0
    ),
    piece_masks AS (
        SELECT * FROM (VALUES ${getPieceMasksValuesSQL()}) AS t(piece, ${getPieceMasksColumnsSQL()})
    ),
    mr_applied AS (
        SELECT 
            mr.parent_id,
            CAST(${depth} AS TINYINT) as depth,
            mr.from_sq, mr.to_sq, mr.piece, mr.is_castle, mr.is_promo, mr.is_capture, mr.captured_piece,
            ${getAppliedStateDirectSQL('mr', 'mr', 'mr.captured_piece')},
            
            CAST(mr.castling_rights & ${getCastlingMaskSQL('mr')} AS HUGEINT) as castling_rights,
            CAST(mr.active_turn * -1 AS TINYINT) as active_turn,
            CAST(mr.active_turn AS TINYINT) as active_turn_parent,
            
            mr.static_eval as static_eval_parent,
            mr.is_check as is_check_parent,
            0::BIGINT as board_hash,
            
            CAST(CASE WHEN mr.piece = ${PIECES.K} THEN mr.to_sq ELSE mr.wK_sq END AS TINYINT) as wK_sq,
            CAST(CASE WHEN mr.piece = ${PIECES.k} THEN mr.to_sq ELSE mr.bK_sq END AS TINYINT) as bK_sq
        FROM batch_moves mr
        LEFT JOIN piece_masks pm_d ON pm_d.piece = mr.piece
        LEFT JOIN piece_masks pm_a ON pm_a.piece = (CASE WHEN mr.is_promo = 1 THEN (CASE WHEN mr.active_turn = ${TURNS.WHITE} THEN ${PIECES.Q} ELSE ${PIECES.q} END) ELSE mr.piece END)
        LEFT JOIN piece_masks pm_c ON pm_c.piece = mr.captured_piece
    )
    SELECT 
        nextval('seq_search_tree_id') as id,
        prep.parent_id, prep.depth, prep.from_sq, prep.to_sq, prep.piece, prep.is_castle, prep.is_promo, prep.is_capture, prep.captured_piece,
        prep.wK_bb, prep.wQ_bb, prep.wR_bb, prep.wB_bb, prep.wN_bb, prep.wP_bb, prep.bK_bb, prep.bQ_bb, prep.bR_bb, prep.bB_bb, prep.bN_bb, prep.bP_bb,
        prep.castling_rights, prep.active_turn, 
        prep.static_eval, 
        prep.static_eval as minimax_eval,
        ${getZobristHashSQL('prep')} as board_hash,
        prep.wK_sq, prep.bK_sq,
        prep.all_pieces, prep.my_pieces, prep.opponent_pieces,
        prep.active_king_sq, prep.passive_king_sq,
        CAST(${getIsKingInCheckSQL('prep', 'prep.active_turn')} AS TINYINT) as is_check
    FROM (
        SELECT *,
            -- Incremental Static Evaluation (O(1))
            ${getIncrementalEvalSQL('mra')} as static_eval,
            ${getOrSQL(['wK_bb', 'wQ_bb', 'wR_bb', 'wB_bb', 'wN_bb', 'wP_bb', 'bK_bb', 'bQ_bb', 'bR_bb', 'bB_bb', 'bN_bb', 'bP_bb'])} as all_pieces,
            (CASE WHEN active_turn = ${TURNS.WHITE} THEN ${getOrSQL(['wK_bb', 'wQ_bb', 'wR_bb', 'wB_bb', 'wN_bb', 'wP_bb'])} ELSE ${getOrSQL(['bK_bb', 'bQ_bb', 'bR_bb', 'bB_bb', 'bN_bb', 'bP_bb'])} END) as my_pieces,
            (CASE WHEN active_turn = ${TURNS.WHITE} THEN ${getOrSQL(['bK_bb', 'bQ_bb', 'bR_bb', 'bB_bb', 'bN_bb', 'bP_bb'])} ELSE ${getOrSQL(['wK_bb', 'wQ_bb', 'wR_bb', 'wB_bb', 'wN_bb', 'wP_bb'])} END) as opponent_pieces,
            CAST(CASE WHEN active_turn = ${TURNS.WHITE} THEN wK_sq ELSE bK_sq END AS TINYINT) as active_king_sq,
            CAST(CASE WHEN active_turn = ${TURNS.WHITE} THEN bK_sq ELSE wK_sq END AS TINYINT) as passive_king_sq
        FROM mr_applied mra
    ) prep
    WHERE CAST(${getIsKingInCheckSQL('prep', 'prep.active_turn_parent')} AS TINYINT) = 0
    ${(options.useFFP !== false && (maxDepth - depth <= 2) && pAlpha !== undefined && pAlpha !== null) ? ` 
        AND NOT (
            prep.active_turn_parent = ${TURNS.WHITE} 
            AND prep.is_check_parent = 0
            AND (${getIsKingInCheckSQL('prep', 'prep.active_turn')}) = FALSE
            AND prep.static_eval < ${pAlpha} - ${PRUNING_MARGIN}
            AND prep.is_promo = 0
            AND (
                prep.is_capture = 0 
                OR (prep.static_eval + ${getPieceValueCaseSQL('prep.captured_piece')} + ${CAPTURE_MARGIN} < ${pAlpha})
            )
        )` : ''}
    ${(options.useFFP !== false && (maxDepth - depth <= 2) && pBeta !== undefined && pBeta !== null) ? ` 
        AND NOT (
            prep.active_turn_parent = ${TURNS.BLACK} 
            AND prep.is_check_parent = 0
            AND (${getIsKingInCheckSQL('prep', 'prep.active_turn')}) = FALSE
            AND prep.static_eval > ${pBeta} + ${PRUNING_MARGIN}
            AND prep.is_promo = 0
            AND (
                prep.is_capture = 0
                OR (prep.static_eval - ${getPieceValueCaseSQL('prep.captured_piece')} - ${CAPTURE_MARGIN} > ${pBeta})
            )
        )` : ''}
    ;
    INSERT INTO attempted_expansions
    SELECT DISTINCT parent_id 
    FROM ${rawMovesTable} 
    WHERE batch_id = ${batchId} AND is_processed = 0
    EXCEPT SELECT id FROM attempted_expansions;

    INSERT INTO non_mate_nodes
    SELECT DISTINCT parent_id FROM ${targetFrontier}
    EXCEPT SELECT id FROM non_mate_nodes;
    `;
}
