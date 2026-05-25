import { 
    PIECES,
    TURNS,
    SCORE_INFINITE
} from '../quackmate-common.js';

import { getIsBitSetSQL, getOrSQL, getBitIndexSQL, getNextValSQL, getZobristHashSQL } from './utils.js';
import { getStaticEvalSQL } from './eval.js';
import { getIsKingInCheckSQL, getGivesCheckSQL, getMovesSelectSQL, captureLogicFor, getAppliedStateDirectSQL } from './moves.js';


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
       SEARCH SPACE EXPANSION
       
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


export function getMinimaxCTE(depth) {
    return `
    /* =========================================================
       MINIMAX BACKPROPAGATION
       ========================================================= */
    minimax AS (
        -- Base Case: Leaf nodes (nodes at target depth or nodes that have no children)
        SELECT id, parent_id, depth, static_eval::INTEGER as minimax_eval, 0 as step
        FROM search_tree s
        WHERE s.depth = ${depth}
           OR NOT EXISTS (SELECT 1 FROM search_tree child WHERE child.parent_id = s.id)
        
        UNION ALL
        
        -- Recursive Step: Evaluate parents at depth = depth - (prev.step + 1)
        SELECT 
            parent.id, parent.parent_id, parent.depth,
            (CASE WHEN parent.active_turn = ${TURNS.WHITE} 
                  THEN MAX(child.minimax_eval) 
                  ELSE MIN(child.minimax_eval) 
            END)::INTEGER as minimax_eval,
            prev.step + 1 as step
        FROM (SELECT DISTINCT step FROM minimax) prev
        JOIN search_tree parent ON parent.depth = ${depth} - (prev.step + 1)
        JOIN recurring.minimax child ON child.parent_id = parent.id
        GROUP BY parent.id, parent.parent_id, parent.depth, parent.active_turn, prev.step
    )`;
}

/**
 * THE GRAND RECURSIVE SEARCH QUERY
 * 
 * This function builds a SINGLE SQL query that performs the entire search (Expansion -> Minimax).
 * It uses a `WITH RECURSIVE` CTE to traverse the game tree.
 * 
 * Structure:
 * 1. `search_tree` (Recursive CTE): 
 *    - Base Case: Selects the current board state (root).
 *    - Recursive Step: Expands the previous depth's nodes using `getMovesSelectSQL`.
 * 
 * 2. `minimax` (RecursiveCTE using recurring): 
 *    - Base Case: Leaf nodes with their static evaluations.
 *    - Recursive Step (Reverse): Joins child nodes to parents using recurring.minimax to 
 *      dynamically aggregate scores accessing leaves at mixed depths (requires DuckDB >= 1.5).
 * 
 * 3. Final Select: Returns the best move from the root's children based on the minimax value.
 */

export function getRecursiveSearchQuery(depth, isWhiteTurn, alpha = -SCORE_INFINITE, beta = SCORE_INFINITE, returnAllMoves = false) {
    return `
    WITH RECURSIVE
        ${getExpansionCTE(depth, alpha, beta)},
        
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
