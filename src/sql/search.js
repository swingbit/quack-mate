import { 
    PIECES,
    TURNS,
    PIECE_VALUES,
    SCORE_INFINITE,
    SCORE_MATE_THRESHOLD,
    PRUNING_MARGIN,
    CAPTURE_MARGIN,
    ORDER_CAPTURE_OFFSET,
    ORDER_PROMO_OFFSET,
    ORDER_CHECK_OFFSET,
    ORDER_TT_OFFSET,
    ORDER_CASTLE_OFFSET,
    ORDER_KILLER_OFFSET
} from '../quackmate-common.js';

const BBTYPE = 'UBIGINT';

import { getIsBitSetSQL, getOrSQL, getXorSQL, getBitIndexSQL, getNextValSQL } from './utils.js';
import { getStaticEvalSQL, getPieceValueCaseSQL, getMVVLVAScoreSQL } from './eval.js';
import { getIsKingInCheckSQL, getGivesCheckSQL, getMovesSelectSQL, captureLogicFor, getAppliedStateDirectSQL, getPieceMasksValuesSQL, getPieceMasksColumnsSQL } from './moves.js';




export function getMergeTT_SQL(depth) {
    return `
        /* Identify best moves efficiently */
        DROP TABLE IF EXISTS tt_best_moves;
        CREATE TEMPORARY TABLE tt_best_moves AS
        SELECT parent_id, minimax_eval, from_sq, to_sq
        FROM search_tree
        WHERE minimax_eval IS NOT NULL
        QUALIFY ROW_NUMBER() OVER (PARTITION BY parent_id, minimax_eval ORDER BY id) = 1;

        INSERT INTO transposition_table (board_hash, static_eval, depth, best_move_from, best_move_to)
        SELECT 
            st.board_hash,
            st.minimax_eval,
            CAST(CASE WHEN (${depth} - st.depth) < 0 THEN 0 ELSE (${depth} - st.depth) END AS TINYINT) as remaining_depth,
            COALESCE(bm.from_sq, 0)::TINYINT as best_move_from,
            COALESCE(bm.to_sq, 0)::TINYINT as best_move_to
        FROM search_tree st
        LEFT JOIN tt_best_moves bm ON (bm.parent_id = st.id AND bm.minimax_eval = st.minimax_eval)
        WHERE st.minimax_eval IS NOT NULL
        ON CONFLICT (board_hash) DO UPDATE SET
            static_eval = EXCLUDED.static_eval,
            depth = EXCLUDED.depth,
            best_move_from = EXCLUDED.best_move_from,
            best_move_to = EXCLUDED.best_move_to
        WHERE EXCLUDED.depth >= transposition_table.depth;
        
        DROP TABLE tt_best_moves;
    `;
}


export function getZobristHashSQL(alias) {
    const pieceXor = `COALESCE((SELECT bit_xor(zc.val) FROM zobrist_constants zc WHERE (
        (zc.piece = ${PIECES.K} AND ${getIsBitSetSQL(`${alias}.wK_bb`, 'zc.square')}) OR
        (zc.piece = ${PIECES.Q} AND ${getIsBitSetSQL(`${alias}.wQ_bb`, 'zc.square')}) OR
        (zc.piece = ${PIECES.R} AND ${getIsBitSetSQL(`${alias}.wR_bb`, 'zc.square')}) OR
        (zc.piece = ${PIECES.B} AND ${getIsBitSetSQL(`${alias}.wB_bb`, 'zc.square')}) OR
        (zc.piece = ${PIECES.N} AND ${getIsBitSetSQL(`${alias}.wN_bb`, 'zc.square')}) OR
        (zc.piece = ${PIECES.P} AND ${getIsBitSetSQL(`${alias}.wP_bb`, 'zc.square')}) OR
        (zc.piece = ${PIECES.k} AND ${getIsBitSetSQL(`${alias}.bK_bb`, 'zc.square')}) OR
        (zc.piece = ${PIECES.q} AND ${getIsBitSetSQL(`${alias}.bQ_bb`, 'zc.square')}) OR
        (zc.piece = ${PIECES.r} AND ${getIsBitSetSQL(`${alias}.bR_bb`, 'zc.square')}) OR
        (zc.piece = ${PIECES.b} AND ${getIsBitSetSQL(`${alias}.bB_bb`, 'zc.square')}) OR
        (zc.piece = ${PIECES.n} AND ${getIsBitSetSQL(`${alias}.bN_bb`, 'zc.square')}) OR
        (zc.piece = ${PIECES.p} AND ${getIsBitSetSQL(`${alias}.bP_bb`, 'zc.square')})
    )), 0::${BBTYPE})`;

    const turnXor = `COALESCE((SELECT zm.val FROM zobrist_misc zm WHERE zm.type = 'turn' AND ${alias}.active_turn = ${TURNS.BLACK}), 0::${BBTYPE})`;
    const castleXor = `COALESCE((SELECT bit_xor(zm.val) FROM zobrist_misc zm WHERE zm.type = 'castle' AND (${getIsBitSetSQL(`${alias}.castling_rights`, 'zm.idx')})), 0::${BBTYPE})`;
    return getXorSQL(pieceXor, turnXor, castleXor);
}



/**
 * Generates a query to expand one level of the search tree.
 * 
 * @param {string} previousTurn - The turn that just moved ('w' or 'b')
 * @param {boolean} useTT - Whether to utilize the Transposition Table
 * @returns {string} Complete SQL statement
 */


export function getExpansionCTE(depth, alpha = -SCORE_INFINITE, beta = SCORE_INFINITE) {
    // Applied ONLY when expanding from root (s_in.depth = 0)
    const filterClause = '';

    return `
    /* =========================================================
       EXPANSION PHASE (Recursive CTE)
       
       Simulates the "Generate Moves" and "Make Move" steps.
       It recursively expands nodes from depth 0 up to max_depth.
       ========================================================= */
    search_tree AS (
        -- [Base Case] Root Node: Current Board State
        SELECT 
            0::INTEGER as id,
            NULL::INTEGER as parent_id,
            0::TINYINT as depth,
            -1::TINYINT as from_sq,
            -1::TINYINT as to_sq,
            0::TINYINT as piece,
            0::TINYINT as is_castle, 0::TINYINT as is_promo,
            0::TINYINT as is_capture, 0::TINYINT as captured_piece,
            -- Piece Bitboards
            wK_bb, wQ_bb, wR_bb, wB_bb, wN_bb, wP_bb, 
            bK_bb, bQ_bb, bR_bb, bB_bb, bN_bb, bP_bb,
            -- Metadata
            castling_rights,
            init_state.active_turn,
            init_state.static_eval, 
            NULL::INTEGER as minimax_eval,
            ${getZobristHashSQL('init_state')} as board_hash,
            init_state.wK_sq,
            init_state.bK_sq,
            ${getOrSQL(['wK_bb', 'wQ_bb', 'wR_bb', 'wB_bb', 'wN_bb', 'wP_bb', 'bK_bb', 'bQ_bb', 'bR_bb', 'bB_bb', 'bN_bb', 'bP_bb'])} as all_pieces,
            init_state.my_pieces, init_state.opponent_pieces,
            init_state.active_king_sq, init_state.passive_king_sq,
            0::TINYINT as is_check
        FROM (
            SELECT *,
                (CASE WHEN active_turn = ${TURNS.WHITE} THEN ${getBitIndexSQL('wK_bb')} ELSE ${getBitIndexSQL('bK_bb')} END) as active_king_sq,
                (CASE WHEN active_turn = ${TURNS.WHITE} THEN ${getBitIndexSQL('bK_bb')} ELSE ${getBitIndexSQL('wK_bb')} END) as passive_king_sq,
                ${getBitIndexSQL('wK_bb')} as wK_sq,
                ${getBitIndexSQL('bK_bb')} as bK_sq,
                (${getStaticEvalSQL('v_board_state')})::INTEGER as static_eval,
                (CASE WHEN active_turn = ${TURNS.WHITE} THEN ${getOrSQL(['wK_bb', 'wQ_bb', 'wR_bb', 'wB_bb', 'wN_bb', 'wP_bb'])} ELSE ${getOrSQL(['bK_bb', 'bQ_bb', 'bR_bb', 'bB_bb', 'bN_bb', 'bP_bb'])} END) as my_pieces,
                (CASE WHEN active_turn = ${TURNS.WHITE} THEN ${getOrSQL(['bK_bb', 'bQ_bb', 'bR_bb', 'bB_bb', 'bN_bb', 'bP_bb'])} ELSE ${getOrSQL(['wK_bb', 'wQ_bb', 'wR_bb', 'wB_bb', 'wN_bb', 'wP_bb'])} END) as opponent_pieces
            FROM v_board_state
        ) init_state

        UNION ALL

        -- [Recursive Step] Expand Nodes
        -- For each node at depth d, generate all pseudo-legal moves, 
        -- apply them, filter illegal ones (kings in check), and produce nodes at d+1.
        SELECT
            (${getNextValSQL('seq_search_tree_id')})::INTEGER as id,
            m_expanded.parent_id, m_expanded.depth, m_expanded.from_sq, m_expanded.to_sq, m_expanded.piece, 
            m_expanded.is_castle, m_expanded.is_promo, m_expanded.is_capture, m_expanded.captured_piece,
            m_expanded.wK_bb, m_expanded.wQ_bb, m_expanded.wR_bb, m_expanded.wB_bb, m_expanded.wN_bb, m_expanded.wP_bb, 
            m_expanded.bK_bb, m_expanded.bQ_bb, m_expanded.bR_bb, m_expanded.bB_bb, m_expanded.bN_bb, m_expanded.bP_bb,
            m_expanded.castling_rights, m_expanded.active_turn,
            ${getStaticEvalSQL('m_expanded')} as static_eval,
            NULL::INTEGER as minimax_eval,
            ${getZobristHashSQL('m_expanded')} as board_hash,
            m_expanded.wK_sq, m_expanded.bK_sq, m_expanded.all_pieces,
            m_expanded.my_pieces, m_expanded.opponent_pieces,
            m_expanded.active_king_sq, m_expanded.passive_king_sq,
            0::TINYINT as is_check
        FROM (
            SELECT 
                *,
                ${getOrSQL(['wK_bb', 'wQ_bb', 'wR_bb', 'wB_bb', 'wN_bb', 'wP_bb', 'bK_bb', 'bQ_bb', 'bR_bb', 'bB_bb', 'bN_bb', 'bP_bb'])} as all_pieces,
                (CASE WHEN active_turn = ${TURNS.WHITE} THEN ${getOrSQL(['wK_bb', 'wQ_bb', 'wR_bb', 'wB_bb', 'wN_bb', 'wP_bb'])} ELSE ${getOrSQL(['bK_bb', 'bQ_bb', 'bR_bb', 'bB_bb', 'bN_bb', 'bP_bb'])} END) as my_pieces,
                (CASE WHEN active_turn = ${TURNS.WHITE} THEN ${getOrSQL(['bK_bb', 'bQ_bb', 'bR_bb', 'bB_bb', 'bN_bb', 'bP_bb'])} ELSE ${getOrSQL(['wK_bb', 'wQ_bb', 'wR_bb', 'wB_bb', 'wN_bb', 'wP_bb'])} END) as opponent_pieces,
                (CASE WHEN active_turn = ${TURNS.WHITE} THEN wK_sq ELSE bK_sq END)::TINYINT as active_king_sq,
                (CASE WHEN active_turn = ${TURNS.WHITE} THEN bK_sq ELSE wK_sq END)::TINYINT as passive_king_sq
            FROM (
                SELECT 
                    s_in.id as parent_id, s_in.depth + 1 as depth,
                    m_in.from_sq, m_in.to_sq, m_in.piece, m_in.is_castle, m_in.is_promo,
                    (s_in.active_turn * -1) as active_turn,
                    (CASE WHEN m_in.from_sq = 4 OR m_in.to_sq = 4 THEN (s_in.castling_rights & 12) WHEN m_in.from_sq = 7 OR m_in.to_sq = 7 THEN (s_in.castling_rights & 14) WHEN m_in.from_sq = 0 OR m_in.to_sq = 0 THEN (s_in.castling_rights & 13) WHEN m_in.from_sq = 60 OR m_in.to_sq = 60 THEN (s_in.castling_rights & 3) WHEN m_in.from_sq = 63 OR m_in.to_sq = 63 THEN (s_in.castling_rights & 11) WHEN m_in.from_sq = 56 OR m_in.to_sq = 56 THEN (s_in.castling_rights & 7) ELSE s_in.castling_rights END) as castling_rights,
                    ${captureLogicFor('m_in', 's_in')} as captured_piece,
                    m_in.is_capture::TINYINT as is_capture,
                    ${getAppliedStateDirectSQL('m_in', 's_in')},
                    (CASE WHEN m_in.piece = ${PIECES.K} THEN m_in.to_sq ELSE s_in.wK_sq END)::TINYINT as wK_sq,
                    (CASE WHEN m_in.piece = ${PIECES.k} THEN m_in.to_sq ELSE s_in.bK_sq END)::TINYINT as bK_sq,
                    s_in.active_turn as active_turn_parent
                FROM search_tree s_in
                JOIN LATERAL ( ${getMovesSelectSQL('search_tree', true, 's_in')} ) m_in ON true
                LEFT JOIN piece_masks pm_d ON pm_d.piece = m_in.piece
                LEFT JOIN piece_masks pm_a ON pm_a.piece = (CASE WHEN m_in.is_promo = 1 THEN (CASE WHEN s_in.active_turn = ${TURNS.WHITE} THEN ${PIECES.Q} ELSE ${PIECES.q} END) ELSE m_in.piece END)
                LEFT JOIN piece_masks pm_c ON pm_c.piece = ${captureLogicFor('m_in', 's_in')}
                WHERE s_in.depth < ${depth}
                ${filterClause}
            ) m_inner
        ) m_expanded
        WHERE NOT (${getIsKingInCheckSQL('m_expanded', 'm_expanded.active_turn_parent')})
    )`;
}


export function getLeafEvalCTE(depth) {
    return `
    /* =========================================================
       LEAF NODE EVALUATION
       
       Selects all nodes at max_depth (leaves) to begin backpropagation.
       ========================================================= */
    leaf_evals AS (
        SELECT id, parent_id, depth, active_turn, static_eval
        FROM search_tree s
        WHERE s.depth = ${depth} 
           OR NOT EXISTS (SELECT 1 FROM search_tree child WHERE child.parent_id = s.id)
    )`;
}


export function getMinimaxCTE(depth) {
    return `
    /* =========================================================
       MINIMAX BACKPROPAGATION
       
       Rolls up scores from leaves to root.
       Pseudocode:
       - If Leaf: return static_eval
       - If Parent (White Turn): return MAX(children)
       - If Parent (Black Turn): return MIN(children)
       ========================================================= */
    minimax AS (
        -- [Base Case] Leaves
        SELECT 
            id::INTEGER as id, 
            parent_id::INTEGER as parent_id, 
            static_eval as minimax_eval, 
            depth 
        FROM leaf_evals
        
        UNION ALL
        
        -- [Recursive Step] Propagate Upwards
        SELECT 
            p.id, 
            p.parent_id, 
            (CASE WHEN p.active_turn = ${TURNS.WHITE} THEN MAX(c.minimax_eval) ELSE MIN(c.minimax_eval) END) as minimax_eval, 
            p.depth
        FROM search_tree p 
        JOIN minimax c ON p.id = c.parent_id
        WHERE p.depth < ${depth}
        GROUP BY p.id, p.parent_id, p.depth, p.active_turn
    )`;
}

/**
 * THE GRAND RECURSIVE SEARCH QUERY
 * 
 * This function builds a SINGLE SQL query that performs the entire search (Expansion -> Eval -> Minimax).
 * It uses a `WITH RECURSIVE` CTE to traverse the game tree.
 * 
 * Structure:
 * 1. `search_tree` (Recursive CTE): 
 *    - Base Case: Selects the current board state (root).
 *    - Recursive Step: Expands the previous depth's nodes using `getMovesSelectSQL`.
 * 
 * 2. `leaf_evals`: Selects nodes at the max `depth` and assigns a static evaluation score.
 * 
 * 3. `minimax` (RecursiveCTE): 
 *    - Base Case: Leaf nodes with their static evaluations.
 *    - Recursive Step (Reverse): Joins child nodes to parents, applying MAX or MIN aggregation 
 *      depending on whose turn it is.
 * 
 * 4. Final Select: Returns the best move from the root's children based on the minimax value.
 */

export function getRecursiveSearchQuery(depth, isWhiteTurn, alpha = -SCORE_INFINITE, beta = SCORE_INFINITE, returnAllMoves = false) {
    return `
    WITH RECURSIVE
        ${getExpansionCTE(depth, alpha, beta)},
        
        ${getLeafEvalCTE(depth)},
        
        ${getMinimaxCTE(depth)},
        
        /* =========================================================
           BEST MOVE SELECTION
           
           Selects the move from the root children (depth=1) that 
           matches the root's minimax value.
           ========================================================= */
            best_move AS (
                SELECT from_sq, to_sq, piece, is_castle, is_promo, total_nodes, minimax_eval
                FROM (
                    SELECT st.from_sq, st.to_sq, st.piece, st.is_castle, st.is_promo, (SELECT COUNT(*) FROM search_tree) as total_nodes,
                           ROW_NUMBER() OVER (ORDER BY m.minimax_eval ${isWhiteTurn ? 'DESC' : 'ASC'}, st.static_eval ${isWhiteTurn ? 'DESC' : 'ASC'}, st.from_sq ASC, st.to_sq ASC) as rn,
                           m.minimax_eval
                    FROM search_tree st 
                    JOIN minimax m ON st.id = m.id 
                    WHERE st.depth = 1 
                ) t
                ${returnAllMoves ? '' : 'WHERE rn = 1'}
            )
        SELECT 
            from_sq, to_sq, piece, is_castle, is_promo, total_nodes, minimax_eval 
        FROM best_move ${returnAllMoves ? `ORDER BY minimax_eval ${isWhiteTurn ? 'DESC' : 'ASC'}` : ''};
    `;
}


/**
 * PERSISTENT EXPANSION (Recursive Step Unrolled)
 * 
 * Expands nodes from `sourceTable` (e.g. 'frontier_nodes') and inserts children into `search_tree`.
 * Also populates `targetTable` (e.g. 'next_frontier') with the new leaves for the next iteration.
 */

export function getPersistentExpansionSQL(sourceTable, targetTable, depth, maxDepth, alpha, beta, options = {}) {
    // Helper to generate piece_masks CTE
    const piecemasks = [
         {p: PIECES.P, col: 'wP'}, {p: PIECES.N, col: 'wN'}, {p: PIECES.B, col: 'wB'}, 
         {p: PIECES.R, col: 'wR'}, {p: PIECES.Q, col: 'wQ'}, {p: PIECES.K, col: 'wK'},
         {p: PIECES.p, col: 'bP'}, {p: PIECES.n, col: 'bN'}, {p: PIECES.b, col: 'bB'}, 
         {p: PIECES.r, col: 'bR'}, {p: PIECES.q, col: 'bQ'}, {p: PIECES.k, col: 'bK'}
    ];
    const pmValues = piecemasks.map(pm => {
        const masks = piecemasks.map(target => target.p === pm.p ? `(~0::${BBTYPE})` : `0::${BBTYPE}`);
        return `(${pm.p}, ${masks.join(', ')})`;
    }).join(', ');
    const pmColumns = piecemasks.map(pm => `mask_${pm.col}`).join(', ');

    const lmpFilter = (options.useLMP !== false) ? `WHERE (depth_val = 0 OR rnk <= (12 + (CAST(${maxDepth} AS INTEGER) - CAST(depth_val AS INTEGER)) * 4) OR is_capture = 1 OR is_check_val = 1 OR gives_check_val = 1)` : '';

    // 1. search_space: Select nodes to expand from sourceTable
    return `
    -- 1. Create temporary search space with helpers
    DROP TABLE IF EXISTS search_space;
    CREATE TEMPORARY TABLE search_space AS 
    SELECT 
        id, parent_id, depth, from_sq, to_sq, piece, is_castle, is_promo, is_capture, captured_piece,
        wK_bb, wQ_bb, wR_bb, wB_bb, wN_bb, wP_bb, bK_bb, bQ_bb, bR_bb, bB_bb, bN_bb, bP_bb,
        castling_rights, active_turn, static_eval, board_hash, wK_sq, bK_sq, all_pieces,
        my_pieces, opponent_pieces, active_king_sq, passive_king_sq, is_check
    FROM ${sourceTable};

    INSERT INTO attempted_expansions
    SELECT id FROM search_space
    EXCEPT SELECT id FROM attempted_expansions;

    -- 2a. Generate Moves (Materialize Correlated Subquery)
    -- OPTIMIZATION: Prioritize transposition table (TT) moves first during move ordering.
    
    DROP TABLE IF EXISTS moves_raw;
    CREATE TEMPORARY TABLE moves_raw AS 
    SELECT * EXCLUDE (rnk, depth_val, is_check_val, gives_check_val) FROM (
        SELECT 
            c.id as parent_id, c.active_turn, c.depth as depth_val, c.is_check as is_check_val,
            c.wK_bb, c.wQ_bb, c.wR_bb, c.wB_bb, c.wN_bb, c.wP_bb, 
            c.bK_bb, c.bQ_bb, c.bR_bb, c.bB_bb, c.bN_bb, c.bP_bb,
            c.castling_rights, c.wK_sq, c.bK_sq, c.static_eval,
            
            m.from_sq, m.to_sq, m.piece, m.captured_piece, m.is_castle, m.is_promo, m.is_capture,
            ${getGivesCheckSQL('m', 'c')} as gives_check_val,
            ROW_NUMBER() OVER (PARTITION BY c.id ORDER BY 
                (CASE WHEN tt.best_move_from = m.from_sq AND tt.best_move_to = m.to_sq THEN ${ORDER_TT_OFFSET} ELSE 0 END) +
                (CASE WHEN m.is_capture = 1 THEN ${ORDER_CAPTURE_OFFSET} + ${getMVVLVAScoreSQL('m.captured_piece', 'm.piece')} ELSE 0 END) +
                (CASE WHEN m.is_promo = 1 THEN ${ORDER_PROMO_OFFSET} ELSE 0 END) +
                (CASE WHEN m.is_castle = 1 THEN ${ORDER_CASTLE_OFFSET} ELSE 0 END) +
                (CASE WHEN m.is_capture = 0 AND (c.is_check = 1 OR ${getGivesCheckSQL('m', 'c')} = 1) THEN ${ORDER_CHECK_OFFSET} ELSE 0 END) +
                (CASE WHEN EXISTS(SELECT 1 FROM killer_moves km WHERE km.depth = (CAST(${depth} AS INTEGER) - 1) AND km.from_sq = m.from_sq AND km.to_sq = m.to_sq) THEN ${ORDER_KILLER_OFFSET} ELSE 0 END) +
                COALESCE(h.score, 0) +
                COALESCE(pst.value, 0)
            DESC) as rnk
        FROM search_space c
        LEFT JOIN transposition_table tt ON (tt.board_hash = c.board_hash)
        , LATERAL (${getMovesSelectSQL('search_space', true, 'c')}) m
        LEFT JOIN history_moves h ON (h.piece = m.piece AND h.to_sq = m.to_sq)
        LEFT JOIN pst_values pst ON (pst.piece = m.piece AND pst.square = m.to_sq)
    ) sq
    ${lmpFilter};


    -- 2b. Apply Moves (Join Masks & Calculate State)
    DROP TABLE IF EXISTS expanded_raw;
    CREATE TEMPORARY TABLE expanded_raw AS 
    WITH piece_masks AS (
        SELECT * FROM (VALUES ${pmValues}) AS t(piece, ${pmColumns})
    )
    SELECT *, ${getOrSQL(['wK_bb', 'wQ_bb', 'wR_bb', 'wB_bb', 'wN_bb', 'wP_bb', 'bK_bb', 'bQ_bb', 'bR_bb', 'bB_bb', 'bN_bb', 'bP_bb'])} as all_pieces FROM (
        SELECT 
            mr.parent_id,
            CAST(${depth} AS TINYINT) as depth,
            CAST(mr.active_turn * -1 AS TINYINT) as active_turn,
            CAST(mr.active_turn AS TINYINT) as active_turn_parent,
            mr.from_sq, mr.to_sq, mr.piece, mr.captured_piece, mr.is_castle, mr.is_promo, mr.is_capture,
            mr.static_eval as static_eval_parent,
            
            -- New Castling Rights
            CAST((mr.castling_rights & (
                15 
                & (CASE WHEN mr.piece = ${PIECES.K} OR mr.from_sq = 4 OR mr.to_sq = 4 THEN 12 ELSE 15 END)
                & (CASE WHEN mr.piece = ${PIECES.k} OR mr.from_sq = 60 OR mr.to_sq = 60 THEN 3 ELSE 15 END)
                & (CASE WHEN mr.from_sq = 0 OR mr.to_sq = 0 THEN 13 ELSE 15 END)
                & (CASE WHEN mr.from_sq = 7 OR mr.to_sq = 7 THEN 14 ELSE 15 END)
                & (CASE WHEN mr.from_sq = 56 OR mr.to_sq = 56 THEN 7 ELSE 15 END)
                & (CASE WHEN mr.from_sq = 63 OR mr.to_sq = 63 THEN 11 ELSE 15 END)
            )) AS HUGEINT) as castling_rights,

            ${getAppliedStateDirectSQL('mr', 'mr', 'mr.captured_piece')},
            
            -- Update King Squares
            CAST(CASE WHEN mr.piece = ${PIECES.K} THEN mr.to_sq ELSE mr.wK_sq END AS TINYINT) as wK_sq,
            CAST(CASE WHEN mr.piece = ${PIECES.k} THEN mr.to_sq ELSE mr.bK_sq END AS TINYINT) as bK_sq
            
        FROM moves_raw mr
        LEFT JOIN piece_masks pm_d ON pm_d.piece = mr.piece
        LEFT JOIN piece_masks pm_a ON pm_a.piece = (CASE WHEN mr.is_promo = 1 THEN (CASE WHEN mr.active_turn = ${TURNS.WHITE} THEN ${PIECES.Q} ELSE ${PIECES.q} END) ELSE mr.piece END)
        LEFT JOIN piece_masks pm_c ON pm_c.piece = mr.captured_piece
    ) mr_applied;

    -- 3. Assign IDs and Filter Illegal Moves
    DROP TABLE IF EXISTS expanded_scored;
    CREATE TEMPORARY TABLE expanded_scored AS
    WITH evaluations AS (
        SELECT 
            scored.*,
            (CASE 
                WHEN scored.is_repetition = 1 THEN 0
                ELSE (
                    scored.static_eval_parent 
                    + scored.material_delta
                    + scored.promo_delta
                    + COALESCE(pst_a.value * SIGN(pst_a.piece), 0)
                    - COALESCE(pst_d.value * SIGN(pst_d.piece), 0)
                    - (CASE WHEN scored.is_capture = 1 THEN COALESCE(pst_c.value * SIGN(pst_c.piece), 0) ELSE 0 END)
                    + scored.castle_delta
                )
            END)::INTEGER as static_eval
        FROM (
            SELECT 
                er.*,
                (CASE WHEN COALESCE(rh.count, 0) >= 2 THEN 1 ELSE 0 END) as is_repetition,
                HASH_ER as board_hash,
                (CASE WHEN ${getIsKingInCheckSQL('er', 'er.active_turn_parent')} THEN 1 ELSE 0 END) as is_legal_check,
                (CASE WHEN ${getIsKingInCheckSQL('er', 'er.active_turn')} THEN 1 ELSE 0 END) as is_check,
                -- 1. Material Delta
                (CASE 
                    WHEN er.is_capture = 1 AND er.captured_piece <> 0 THEN (
                        CASE ABS(er.captured_piece)
                            WHEN ${PIECES.P} THEN ${PIECE_VALUES[PIECES.P]}
                            WHEN ${PIECES.N} THEN ${PIECE_VALUES[PIECES.N]}
                            WHEN ${PIECES.B} THEN ${PIECE_VALUES[PIECES.B]}
                            WHEN ${PIECES.R} THEN ${PIECE_VALUES[PIECES.R]}
                            WHEN ${PIECES.Q} THEN ${PIECE_VALUES[PIECES.Q]}
                            WHEN ${PIECES.K} THEN ${PIECE_VALUES[PIECES.K]}
                            ELSE 0
                        END
                    ) ELSE 0 END) * (er.active_turn_parent) as material_delta,
                -- 2. Promotion Material
                (CASE WHEN er.is_promo = 1 THEN (${PIECE_VALUES[PIECES.Q]} - ${PIECE_VALUES[PIECES.P]}) ELSE 0 END) * (er.active_turn_parent) as promo_delta,
                -- 3. Castling Delta (Rook movement PST adjustment)
                (CASE WHEN er.is_castle = 1 THEN (
                    CASE 
                        WHEN er.to_sq = 6  THEN (SELECT r2.value - r1.value FROM pst_values r1, pst_values r2 WHERE r1.piece = ${PIECES.R} AND r1.square = 7 AND r2.piece = ${PIECES.R} AND r2.square = 5)
                        WHEN er.to_sq = 2  THEN (SELECT r2.value - r1.value FROM pst_values r1, pst_values r2 WHERE r1.piece = ${PIECES.R} AND r1.square = 0 AND r2.piece = ${PIECES.R} AND r2.square = 3)
                        WHEN er.to_sq = 62 THEN (SELECT r2.value - r1.value FROM pst_values r1, pst_values r2 WHERE r1.piece = ${PIECES.r} AND r1.square = 63 AND r2.piece = ${PIECES.r} AND r2.square = 61)
                        WHEN er.to_sq = 58 THEN (SELECT r2.value - r1.value FROM pst_values r1, pst_values r2 WHERE r1.piece = ${PIECES.r} AND r1.square = 56 AND r2.piece = ${PIECES.r} AND r2.square = 59)
                        ELSE 0
                    END
                ) ELSE 0 END) as castle_delta,
                (CASE WHEN er.is_promo = 1 THEN (CASE WHEN er.active_turn_parent = ${TURNS.WHITE} THEN ${PIECES.Q} ELSE ${PIECES.q} END) ELSE er.piece END) as piece_at_to
            FROM (SELECT er_base.*, ${getZobristHashSQL('er_base')} as HASH_ER FROM expanded_raw er_base) er
            LEFT JOIN repetition_history rh ON rh.board_hash = er.HASH_ER
        ) scored
        LEFT JOIN pst_values pst_d ON pst_d.piece = scored.piece AND pst_d.square = scored.from_sq
        LEFT JOIN pst_values pst_a ON pst_a.piece = scored.piece_at_to AND pst_a.square = scored.to_sq
        LEFT JOIN pst_values pst_c ON pst_c.piece = scored.captured_piece AND pst_c.square = scored.to_sq
    )
    SELECT 
        nextval('seq_search_tree_id') as id,
        parent_id, depth, active_turn, active_turn_parent,
        from_sq, to_sq, piece, captured_piece, is_castle, is_promo, is_capture,
        wK_bb, wQ_bb, wR_bb, wB_bb, wN_bb, wP_bb,
        bK_bb, bQ_bb, bR_bb, bB_bb, bN_bb, bP_bb,
        castling_rights, wK_sq, bK_sq, all_pieces,
        is_repetition, board_hash, is_legal_check, is_check, static_eval, static_eval_parent
    FROM evaluations
    WHERE is_legal_check = 0
    ;

    DROP TABLE IF EXISTS final_expanded;
    CREATE TEMPORARY TABLE final_expanded AS
    SELECT 
        *,
        (CASE WHEN active_turn = ${TURNS.WHITE} THEN ${getOrSQL(['wK_bb', 'wQ_bb', 'wR_bb', 'wB_bb', 'wN_bb', 'wP_bb'])} ELSE ${getOrSQL(['bK_bb', 'bQ_bb', 'bR_bb', 'bB_bb', 'bN_bb', 'bP_bb'])} END) as my_pieces,
        (CASE WHEN active_turn = ${TURNS.WHITE} THEN ${getOrSQL(['bK_bb', 'bQ_bb', 'bR_bb', 'bB_bb', 'bN_bb', 'bP_bb'])} ELSE ${getOrSQL(['wK_bb', 'wQ_bb', 'wR_bb', 'wB_bb', 'wN_bb', 'wP_bb'])} END) as opponent_pieces,
        CAST(CASE WHEN active_turn = ${TURNS.WHITE} THEN wK_sq ELSE bK_sq END AS TINYINT) as active_king_sq,
        CAST(CASE WHEN active_turn = ${TURNS.WHITE} THEN bK_sq ELSE wK_sq END AS TINYINT) as passive_king_sq,
        CAST(is_check AS TINYINT) as is_check
    FROM expanded_scored
    WHERE 1=1
    ${(options.useFFP !== false && (maxDepth - depth <= 2) && alpha !== undefined && alpha !== null) ? ` 
        AND NOT (
            active_turn_parent = ${TURNS.WHITE} 
            AND static_eval_parent < ${alpha} - ${PRUNING_MARGIN}
            AND is_promo = 0
            AND is_capture = 0 
        )` : ''}
    ${(options.useFFP !== false && (maxDepth - depth <= 2) && beta !== undefined && beta !== null) ? ` 
        AND NOT (
            active_turn_parent = ${TURNS.BLACK} 
            AND static_eval_parent > ${beta} + ${PRUNING_MARGIN}
            AND is_promo = 0
            AND is_capture = 0 
        )` : ''}
    ;

    INSERT INTO non_mate_nodes
    SELECT DISTINCT parent_id 
    FROM expanded_scored
    EXCEPT SELECT id FROM non_mate_nodes;

    -- 4. Insert into Search Tree
    INSERT INTO search_tree
    SELECT 
        id, parent_id, depth, from_sq, to_sq, piece, is_castle, is_promo, is_capture, captured_piece,
        wK_bb, wQ_bb, wR_bb, wB_bb, wN_bb, wP_bb,
        bK_bb, bQ_bb, bR_bb, bB_bb, bN_bb, bP_bb,
        castling_rights, active_turn,
        static_eval, static_eval as minimax_eval, board_hash,
        wK_sq, bK_sq, all_pieces,
        my_pieces, opponent_pieces, active_king_sq, passive_king_sq,
        is_check
    FROM final_expanded;
    
    -- 5. Insert into Target Frontier
    INSERT INTO ${targetTable} (
        id, parent_id, depth, from_sq, to_sq, piece, is_castle, is_promo, is_capture, captured_piece,
        wK_bb, wQ_bb, wR_bb, wB_bb, wN_bb, wP_bb, bK_bb, bQ_bb, bR_bb, bB_bb, bN_bb, bP_bb,
        castling_rights, active_turn, static_eval, minimax_eval, board_hash, wK_sq, bK_sq, all_pieces,
        my_pieces, opponent_pieces, active_king_sq, passive_king_sq, is_check
    )
    SELECT 
        id, parent_id, depth, from_sq, to_sq, piece, is_castle, is_promo, is_capture, captured_piece,
        wK_bb, wQ_bb, wR_bb, wB_bb, wN_bb, wP_bb, bK_bb, bQ_bb, bR_bb, bB_bb, bN_bb, bP_bb,
        castling_rights, active_turn, static_eval, static_eval as minimax_eval, board_hash, wK_sq, bK_sq, all_pieces,
        my_pieces, opponent_pieces, active_king_sq, passive_king_sq, is_check
    FROM final_expanded
    WHERE is_repetition = 0
    RETURNING 1;
    `;
}

/**
 * Generates SQL to perform Minimax backpropagation for a specific depth layer.
 * 
 * @param {number} depth - The depth of the PARENT nodes to update.
 */

export function getPersistentMinimaxSQL(depth) {
    // Initialize leaves (nodes at depth+1 with no children) by setting minimax_eval = static_eval.
    // This SQL loops up from the given depth, updating parents based on the minimax value of their children.
    // We assume the leaf initialization happens implicitly via the initial bulk update in JS.
    
    return `
    UPDATE search_tree s
    SET minimax_eval = (
        SELECT 
            CASE WHEN s.active_turn = ${TURNS.WHITE} 
                 THEN MAX(child.minimax_eval) 
                 ELSE MIN(child.minimax_eval)
            END
        FROM search_tree child
        WHERE child.parent_id = s.id
    )
    WHERE s.depth = ${depth} 
      AND EXISTS(SELECT 1 FROM search_tree child WHERE child.parent_id = s.id);
    `;
}




export function getUpdateHistorySQL(depth) {
    // Merge the best move's score into the history table.
    // We identify the best move as the one whose score matches the parent's resolved minimax value.
    return `
        INSERT INTO transposition_table (board_hash, static_eval, depth, best_move_from, best_move_to)
        SELECT 
            s.board_hash, 
            s.minimax_eval,
            ${depth}::TINYINT as depth,
            (SELECT from_sq FROM search_tree child WHERE child.parent_id = s.id AND child.minimax_eval = s.minimax_eval LIMIT 1) as best_move_from,
            (SELECT to_sq   FROM search_tree child WHERE child.parent_id = s.id AND child.minimax_eval = s.minimax_eval LIMIT 1) as best_move_to
        FROM search_tree s
        WHERE s.depth = ${depth}
        ON CONFLICT (board_hash) DO UPDATE SET
            static_eval = EXCLUDED.static_eval,
            depth = EXCLUDED.depth,
            best_move_from = EXCLUDED.best_move_from,
            best_move_to = EXCLUDED.best_move_to
        WHERE EXCLUDED.depth >= transposition_table.depth;

        -- Update History as well
        INSERT INTO history_moves (piece, to_sq, score)
        SELECT 
            m.piece, m.to_sq, CAST(s.depth * s.depth * 10 AS INTEGER) as bonus
        FROM search_tree s
        JOIN search_tree m ON (m.parent_id = s.id AND m.minimax_eval = s.minimax_eval)
        WHERE s.depth = ${depth}
        ON CONFLICT (piece, to_sq) DO UPDATE SET score = history_moves.score + EXCLUDED.score;
    `;
}


export function getBatchUpdateKillersSQL(maxDepth) {
    // Updates Killer Moves (Slots 0 and 1) for ALL depths in the current search tree.
    // "Success" = Matching parent score for a quiet move.
    return `
        INSERT INTO killer_moves (depth, slot, from_sq, to_sq)
        WITH top_moves AS (
           SELECT s.depth, m.from_sq, m.to_sq, COUNT(*) as frequency
           FROM search_tree s
           JOIN search_tree m ON (m.parent_id = s.id AND m.minimax_eval = s.minimax_eval)
           WHERE s.depth < ${maxDepth}
           AND m.is_capture = 0
           GROUP BY s.depth, m.from_sq, m.to_sq
        ),
        ranked AS (
           SELECT *, ROW_NUMBER() OVER (PARTITION BY depth ORDER BY frequency DESC) as rnk
           FROM top_moves
        )
        SELECT depth, (rnk - 1) as slot, from_sq, to_sq
        FROM ranked
        WHERE rnk <= 2
        ON CONFLICT (depth, slot) DO UPDATE SET from_sq = EXCLUDED.from_sq, to_sq = EXCLUDED.to_sq;
    `;
}



// =============================================================================
// QUIESCENCE SEARCH (QS) SQL helpers
// =============================================================================

/**
 * Seeds the QS frontier table from current main-search horizon nodes.
 *
 * @param {string} qsTable    - persistent QS frontier table name
 * @param {number} targetDepth - main search max depth
 */
export function getQSInitSQL(qsTable, targetDepth) {
    return `
    DELETE FROM ${qsTable};
    INSERT INTO ${qsTable}
    SELECT
        s.id, s.parent_id, s.depth, s.from_sq, s.to_sq, s.piece, s.is_castle, s.is_promo, s.is_capture, s.captured_piece,
        s.wK_bb, s.wQ_bb, s.wR_bb, s.wB_bb, s.wN_bb, s.wP_bb,
        s.bK_bb, s.bQ_bb, s.bR_bb, s.bB_bb, s.bN_bb, s.bP_bb,
        s.castling_rights, s.active_turn,
        s.static_eval, s.minimax_eval, s.board_hash,
        s.wK_sq, s.bK_sq, s.all_pieces,
        s.my_pieces, s.opponent_pieces, s.active_king_sq, s.passive_king_sq, s.is_check
    FROM search_tree s
    WHERE s.depth = ${targetDepth}
    AND (
        s.id IN (SELECT id FROM frontier_nodes)
        OR s.id IN (SELECT id FROM batch_d2_nodes)
        OR (
            (SELECT COUNT(*) FROM frontier_nodes) = 0
            AND (SELECT COUNT(*) FROM batch_d2_nodes) = 0
        )
    );
    `;
}

/**
 * Performs one capture-only (+ promotions) expansion step of the QS tree.
 * Stand-pat: only keep children that improve over the parent's static_eval.
 *
 * @param {string} qsFrontier     - source QS frontier table
 * @param {string} qsNextFrontier - destination QS frontier table (cleared first)
 * @param {string} qsTreeTable    - QS search tree (accumulates all QS nodes)
 * @param {number} qsDepth        - current QS ply index (informational)
 */
export function getQSExpansionSQL(qsFrontier, qsNextFrontier, qsTreeTable, qsDepth) {
    const piecemasks = [
         {p: PIECES.P, col: 'wP'}, {p: PIECES.N, col: 'wN'}, {p: PIECES.B, col: 'wB'},
         {p: PIECES.R, col: 'wR'}, {p: PIECES.Q, col: 'wQ'}, {p: PIECES.K, col: 'wK'},
         {p: PIECES.p, col: 'bP'}, {p: PIECES.n, col: 'bN'}, {p: PIECES.b, col: 'bB'},
         {p: PIECES.r, col: 'bR'}, {p: PIECES.q, col: 'bQ'}, {p: PIECES.k, col: 'bK'}
    ];
    const pmValues = piecemasks.map(pm => {
        const masks = piecemasks.map(target => target.p === pm.p ? `(~0::${BBTYPE})` : `0::${BBTYPE}`);
        return `(${pm.p}, ${masks.join(', ')})`;
    }).join(', ');
    const pmColumns = piecemasks.map(pm => `mask_${pm.col}`).join(', ');

    return `
    -- QS Expansion (ply ${qsDepth}): capture/promo-only moves from ${qsFrontier}
    DROP TABLE IF EXISTS qs_search_space;
    CREATE TEMPORARY TABLE qs_search_space AS
    SELECT
        id, parent_id, depth, from_sq, to_sq, piece, is_castle, is_promo, is_capture, captured_piece,
        wK_bb, wQ_bb, wR_bb, wB_bb, wN_bb, wP_bb,
        bK_bb, bQ_bb, bR_bb, bB_bb, bN_bb, bP_bb,
        castling_rights, active_turn, static_eval, board_hash, wK_sq, bK_sq, all_pieces,
        my_pieces, opponent_pieces, active_king_sq, passive_king_sq, is_check
    FROM ${qsFrontier};

    -- Generate capture-only moves (unless parent was in check, in which case we need all legal moves)
    DROP TABLE IF EXISTS qs_moves_raw;
    CREATE TEMPORARY TABLE qs_moves_raw AS
    SELECT
        c.id as parent_id, c.active_turn, c.depth as parent_depth,
        c.wK_bb, c.wQ_bb, c.wR_bb, c.wB_bb, c.wN_bb, c.wP_bb,
        c.bK_bb, c.bQ_bb, c.bR_bb, c.bB_bb, c.bN_bb, c.bP_bb,
        c.castling_rights, c.wK_sq, c.bK_sq, c.static_eval as static_eval_parent,
        c.is_check as is_check_parent,
        m.from_sq, m.to_sq, m.piece, m.captured_piece, m.is_castle, m.is_promo, m.is_capture
    FROM qs_search_space c
    , LATERAL (${getMovesSelectSQL('qs_search_space', true, 'c')}) m
    WHERE (c.is_check = 1 OR m.is_capture = 1 OR m.is_promo = 1);

    -- Apply moves and compute new board states
    DROP TABLE IF EXISTS qs_expanded_raw;
    CREATE TEMPORARY TABLE qs_expanded_raw AS
    WITH piece_masks AS (
        SELECT * FROM (VALUES ${pmValues}) AS t(piece, ${pmColumns})
    )
    SELECT *,
        ${getOrSQL(['wK_bb', 'wQ_bb', 'wR_bb', 'wB_bb', 'wN_bb', 'wP_bb', 'bK_bb', 'bQ_bb', 'bR_bb', 'bB_bb', 'bN_bb', 'bP_bb'])} as all_pieces
    FROM (
        SELECT
            mr.parent_id,
            CAST(mr.parent_depth + 1 AS TINYINT) as depth,
            CAST(mr.active_turn * -1 AS TINYINT) as active_turn,
            CAST(mr.active_turn AS TINYINT) as active_turn_parent,
            mr.from_sq, mr.to_sq, mr.piece, mr.captured_piece,
            mr.is_castle, mr.is_promo, mr.is_capture,
            mr.static_eval_parent,
            mr.is_check_parent,
            CAST((mr.castling_rights & (
                15
                & (CASE WHEN mr.piece = ${PIECES.K} OR mr.from_sq = 4 OR mr.to_sq = 4 THEN 12 ELSE 15 END)
                & (CASE WHEN mr.piece = ${PIECES.k} OR mr.from_sq = 60 OR mr.to_sq = 60 THEN 3 ELSE 15 END)
                & (CASE WHEN mr.from_sq = 0 OR mr.to_sq = 0 THEN 13 ELSE 15 END)
                & (CASE WHEN mr.from_sq = 7 OR mr.to_sq = 7 THEN 14 ELSE 15 END)
                & (CASE WHEN mr.from_sq = 56 OR mr.to_sq = 56 THEN 7 ELSE 15 END)
                & (CASE WHEN mr.from_sq = 63 OR mr.to_sq = 63 THEN 11 ELSE 15 END)
            )) AS HUGEINT) as castling_rights,
            ${getAppliedStateDirectSQL('mr', 'mr', 'mr.captured_piece')},
            CAST(CASE WHEN mr.piece = ${PIECES.K} THEN mr.to_sq ELSE mr.wK_sq END AS TINYINT) as wK_sq,
            CAST(CASE WHEN mr.piece = ${PIECES.k} THEN mr.to_sq ELSE mr.bK_sq END AS TINYINT) as bK_sq
        FROM qs_moves_raw mr
        LEFT JOIN piece_masks pm_d ON pm_d.piece = mr.piece
        LEFT JOIN piece_masks pm_a ON pm_a.piece = (CASE WHEN mr.is_promo = 1 THEN (CASE WHEN mr.active_turn = ${TURNS.WHITE} THEN ${PIECES.Q} ELSE ${PIECES.q} END) ELSE mr.piece END)
        LEFT JOIN piece_masks pm_c ON pm_c.piece = mr.captured_piece
    ) mr_applied;

    -- Score, filter illegal moves, apply stand-pat (captures that worsen position dropped)
    DROP TABLE IF EXISTS qs_expanded_scored;
    CREATE TEMPORARY TABLE qs_expanded_scored AS
    SELECT
        nextval('seq_search_tree_id') as id,
        er.parent_id,
        er.depth,
        er.active_turn,
        er.active_turn_parent,
        er.from_sq, er.to_sq, er.piece, er.captured_piece,
        er.is_castle, er.is_promo, er.is_capture,
        er.wK_bb, er.wQ_bb, er.wR_bb, er.wB_bb, er.wN_bb, er.wP_bb,
        er.bK_bb, er.bQ_bb, er.bR_bb, er.bB_bb, er.bN_bb, er.bP_bb,
        er.castling_rights, er.wK_sq, er.bK_sq, er.all_pieces,
        (CASE WHEN er.active_turn = ${TURNS.WHITE}
              THEN (er.wK_bb | er.wQ_bb | er.wR_bb | er.wB_bb | er.wN_bb | er.wP_bb)
              ELSE (er.bK_bb | er.bQ_bb | er.bR_bb | er.bB_bb | er.bN_bb | er.bP_bb) END) as my_pieces,
        (CASE WHEN er.active_turn = ${TURNS.WHITE}
              THEN (er.bK_bb | er.bQ_bb | er.bR_bb | er.bB_bb | er.bN_bb | er.bP_bb)
              ELSE (er.wK_bb | er.wQ_bb | er.wR_bb | er.wB_bb | er.wN_bb | er.wP_bb) END) as opponent_pieces,
        CAST(CASE WHEN er.active_turn = ${TURNS.WHITE} THEN er.wK_sq ELSE er.bK_sq END AS TINYINT) as active_king_sq,
        CAST(CASE WHEN er.active_turn = ${TURNS.WHITE} THEN er.bK_sq ELSE er.wK_sq END AS TINYINT) as passive_king_sq,
        -- Incremental static_eval
        (
            er.static_eval_parent
            + (CASE
                WHEN er.is_capture = 1 AND er.captured_piece <> 0 THEN (
                    CASE ABS(er.captured_piece)
                        WHEN ${PIECES.P} THEN ${PIECE_VALUES[PIECES.P]}
                        WHEN ${PIECES.N} THEN ${PIECE_VALUES[PIECES.N]}
                        WHEN ${PIECES.B} THEN ${PIECE_VALUES[PIECES.B]}
                        WHEN ${PIECES.R} THEN ${PIECE_VALUES[PIECES.R]}
                        WHEN ${PIECES.Q} THEN ${PIECE_VALUES[PIECES.Q]}
                        WHEN ${PIECES.K} THEN ${PIECE_VALUES[PIECES.K]}
                        ELSE 0
                    END
                ) ELSE 0 END) * (er.active_turn_parent)
            + (CASE WHEN er.is_promo = 1 THEN (${PIECE_VALUES[PIECES.Q]} - ${PIECE_VALUES[PIECES.P]}) ELSE 0 END) * (er.active_turn_parent)
            + COALESCE((SELECT value * SIGN(piece) FROM pst_values
                        WHERE piece = (CASE WHEN er.is_promo = 1 THEN (CASE WHEN er.active_turn_parent = ${TURNS.WHITE} THEN ${PIECES.Q} ELSE ${PIECES.q} END) ELSE er.piece END)
                        AND square = er.to_sq), 0)
            - COALESCE((SELECT value * SIGN(piece) FROM pst_values WHERE piece = er.piece AND square = er.from_sq), 0)
            - CASE WHEN er.is_capture = 1 THEN COALESCE((SELECT value * SIGN(piece) FROM pst_values WHERE piece = er.captured_piece AND square = er.to_sq), 0) ELSE 0 END
        )::INTEGER as static_eval,
        CAST(${getIsKingInCheckSQL('er', 'er.active_turn')} AS TINYINT) as is_check,
        ${getZobristHashSQL('er')} as board_hash
    FROM qs_expanded_raw er
    -- Legality: moving side's king must not be in check after the move
    WHERE (${getIsKingInCheckSQL('er', 'er.active_turn_parent')}) = FALSE
    -- Stand-pat / Delta pruning: ONLY if the parent was NOT in check!
    AND (
        er.is_check_parent = 1
        OR er.is_promo = 1
        OR (
            er.is_capture = 1 AND er.captured_piece <> 0
            AND (
                CASE ABS(er.captured_piece)
                    WHEN ${PIECES.P} THEN ${PIECE_VALUES[PIECES.P]}
                    WHEN ${PIECES.N} THEN ${PIECE_VALUES[PIECES.N]}
                    WHEN ${PIECES.B} THEN ${PIECE_VALUES[PIECES.B]}
                    WHEN ${PIECES.R} THEN ${PIECE_VALUES[PIECES.R]}
                    WHEN ${PIECES.Q} THEN ${PIECE_VALUES[PIECES.Q]}
                    WHEN ${PIECES.K} THEN ${PIECE_VALUES[PIECES.K]}
                    ELSE 0
                END
            ) >= (
                CASE ABS(er.piece)
                    WHEN ${PIECES.P} THEN ${Math.floor(PIECE_VALUES[PIECES.P] / 2)}
                    WHEN ${PIECES.N} THEN ${Math.floor(PIECE_VALUES[PIECES.N] / 2)}
                    WHEN ${PIECES.B} THEN ${Math.floor(PIECE_VALUES[PIECES.B] / 2)}
                    WHEN ${PIECES.R} THEN ${Math.floor(PIECE_VALUES[PIECES.R] / 2)}
                    WHEN ${PIECES.Q} THEN ${Math.floor(PIECE_VALUES[PIECES.Q] / 2)}
                    WHEN ${PIECES.K} THEN ${Math.floor(PIECE_VALUES[PIECES.K] / 2)}
                    ELSE 0
                END
            )
        )
    );

    -- Insert into QS tree table (leaves initialised with minimax_eval = static_eval)
    INSERT INTO ${qsTreeTable} (
        id, parent_id, depth, from_sq, to_sq, piece, is_castle, is_promo, is_capture, captured_piece,
        wK_bb, wQ_bb, wR_bb, wB_bb, wN_bb, wP_bb,
        bK_bb, bQ_bb, bR_bb, bB_bb, bN_bb, bP_bb,
        castling_rights, active_turn,
        static_eval, minimax_eval, board_hash,
        wK_sq, bK_sq, all_pieces,
        my_pieces, opponent_pieces, active_king_sq, passive_king_sq, is_check
    )
    SELECT
        id, parent_id, depth, from_sq, to_sq, piece, is_castle, is_promo, is_capture, captured_piece,
        wK_bb, wQ_bb, wR_bb, wB_bb, wN_bb, wP_bb,
        bK_bb, bQ_bb, bR_bb, bB_bb, bN_bb, bP_bb,
        castling_rights, active_turn,
        static_eval, static_eval as minimax_eval, board_hash,
        wK_sq, bK_sq, all_pieces,
        my_pieces, opponent_pieces, active_king_sq, passive_king_sq, is_check
    FROM qs_expanded_scored;

    -- Populate next QS frontier
    DELETE FROM ${qsNextFrontier};
    INSERT INTO ${qsNextFrontier} (
        id, parent_id, depth, from_sq, to_sq, piece, is_castle, is_promo, is_capture, captured_piece,
        wK_bb, wQ_bb, wR_bb, wB_bb, wN_bb, wP_bb,
        bK_bb, bQ_bb, bR_bb, bB_bb, bN_bb, bP_bb,
        castling_rights, active_turn,
        static_eval, minimax_eval, board_hash,
        wK_sq, bK_sq, all_pieces,
        my_pieces, opponent_pieces, active_king_sq, passive_king_sq, is_check
    )
    SELECT
        id, parent_id, depth, from_sq, to_sq, piece, is_castle, is_promo, is_capture, captured_piece,
        wK_bb, wQ_bb, wR_bb, wB_bb, wN_bb, wP_bb,
        bK_bb, bQ_bb, bR_bb, bB_bb, bN_bb, bP_bb,
        castling_rights, active_turn,
        static_eval, static_eval as minimax_eval, board_hash,
        wK_sq, bK_sq, all_pieces,
        my_pieces, opponent_pieces, active_king_sq, passive_king_sq, is_check
    FROM qs_expanded_scored;
    `;
}

/**
 * Backpropagates minimax scores within the QS tree at a given ply.
 * 
 * @param {number} qsBackD - QS ply/depth level to backpropagate
 * @returns {string} SQL query
 */
export function getQSMinimaxBackpropSQL(qsBackD) {
    return `
        UPDATE qs_search_tree s
        SET minimax_eval = (
            SELECT CASE WHEN s.active_turn = ${TURNS.WHITE}
                        THEN MAX(child.minimax_eval)
                        ELSE MIN(child.minimax_eval)
                   END
            FROM qs_search_tree child WHERE child.parent_id = s.id
        )
        WHERE s.depth = ${qsBackD}
        AND EXISTS(SELECT 1 FROM qs_search_tree child WHERE child.parent_id = s.id);
    `;
}

/**
 * Propagates the best QS child score back to the main search tree horizon nodes.
 *
 * @param {number} targetDepth - Main search max depth (where main horizon leaves reside)
 * @returns {string} SQL query
 */
export function getApplyQSEvalToMainTreeSQL(targetDepth) {
    return `
        -- Score checkmates on horizon leaves that had is_check = 1 but 0 children in QS search tree
        UPDATE search_tree s
        SET minimax_eval = CASE WHEN active_turn = ${TURNS.WHITE} THEN -${SCORE_MATE_THRESHOLD} + depth ELSE ${SCORE_MATE_THRESHOLD} - depth END
        WHERE depth = ${targetDepth}
          AND is_check = 1
          AND NOT EXISTS (SELECT 1 FROM qs_search_tree qs WHERE qs.parent_id = s.id);

        -- Apply QS results for leaves that had moves in QS
        UPDATE search_tree s
        SET minimax_eval = (
            SELECT CASE WHEN s.active_turn = ${TURNS.WHITE}
                        THEN (CASE WHEN s.is_check = 1 THEN MAX(qs.minimax_eval) ELSE MAX(GREATEST(s.static_eval, qs.minimax_eval)) END)
                        ELSE (CASE WHEN s.is_check = 1 THEN MIN(qs.minimax_eval) ELSE MIN(LEAST(s.static_eval, qs.minimax_eval)) END)
                   END
            FROM qs_search_tree qs WHERE qs.parent_id = s.id
        )
        WHERE s.depth = ${targetDepth}
        AND EXISTS(SELECT 1 FROM qs_search_tree qs WHERE qs.parent_id = s.id);
    `;
}
