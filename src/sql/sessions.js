import { TURNS, SCORE_MATE_THRESHOLD } from '../quackmate-common.js';
import { getBitIndexSQL } from './utils.js';
import { getStaticEvalSQL } from './eval.js';

const BBTYPE = 'UBIGINT';

export function getCreateTempTablesSQL() {
    return `
        CREATE TEMPORARY TABLE IF NOT EXISTS pruned_parents (id INTEGER);
        CREATE TEMPORARY TABLE IF NOT EXISTS parent_nodes AS SELECT * FROM search_tree WHERE 1=0;
        CREATE TEMPORARY TABLE IF NOT EXISTS next_frontier_nodes AS SELECT * FROM search_tree WHERE 1=0;
        CREATE TEMPORARY TABLE IF NOT EXISTS frontier_nodes AS SELECT * FROM search_tree WHERE 1=0;
        DELETE FROM history_moves;
        CREATE TEMPORARY TABLE IF NOT EXISTS raw_moves (
            parent_id INTEGER, 
            active_turn INTEGER,
            depth INTEGER,

            wK_bb UBIGINT, wQ_bb UBIGINT, wR_bb UBIGINT, wB_bb UBIGINT, wN_bb UBIGINT, wP_bb UBIGINT,
            bK_bb UBIGINT, bQ_bb UBIGINT, bR_bb UBIGINT, bB_bb UBIGINT, bN_bb UBIGINT, bP_bb UBIGINT,
            castling_rights HUGEINT,
            static_eval INTEGER,
            all_pieces UBIGINT,
            wK_sq TINYINT, bK_sq TINYINT,

            from_sq INTEGER, to_sq INTEGER, piece INTEGER, captured_piece INTEGER, 
            is_castle INTEGER, is_promo INTEGER, is_capture INTEGER, 
            is_check INTEGER,
            
            score INTEGER,
            is_processed INTEGER,
            batch_id INTEGER
        );
        -- Quiescence Search working tables (same schema as search_tree)
        CREATE TEMPORARY TABLE IF NOT EXISTS qs_frontier AS SELECT * FROM search_tree WHERE 1=0;
        CREATE TEMPORARY TABLE IF NOT EXISTS qs_next_frontier AS SELECT * FROM search_tree WHERE 1=0;
        CREATE TEMPORARY TABLE IF NOT EXISTS qs_search_tree AS SELECT * FROM search_tree WHERE 1=0;
    `;
}

export function getClearSearchTreeSQL() {
    return `DELETE FROM search_tree; DELETE FROM frontier_nodes;`;
}

export function getInsertRootNodeSQL(rootIsCheck) {
    return `
        INSERT INTO search_tree (
            id, parent_id, depth, from_sq, to_sq, piece, is_castle, is_promo, is_capture, captured_piece,
            wK_bb, wQ_bb, wR_bb, wB_bb, wN_bb, wP_bb, bK_bb, bQ_bb, bR_bb, bB_bb, bN_bb, bP_bb,
            castling_rights, active_turn, static_eval, minimax_eval, board_hash, wK_sq, bK_sq, all_pieces,
            my_pieces, opponent_pieces, active_king_sq, passive_king_sq, is_check
        )
        SELECT 
            0, NULL, 0, -1, -1, 0, 0, 0, 0, 0, 
            wK_bb, wQ_bb, wR_bb, wB_bb, wN_bb, wP_bb, 
            bK_bb, bQ_bb, bR_bb, bB_bb, bN_bb, bP_bb, 
            castling_rights, active_turn, (${getStaticEvalSQL('v_board_state')})::INTEGER as static_eval, NULL, 0,
            ${getBitIndexSQL('wK_bb')} as wK_sq,
            ${getBitIndexSQL('bK_bb')} as bK_sq,
            (wK_bb | wQ_bb | wR_bb | wB_bb | wN_bb | wP_bb | bK_bb | bQ_bb | bR_bb | bB_bb | bN_bb | bP_bb) as all_pieces,
            (CASE WHEN active_turn = ${TURNS.WHITE} THEN (wK_bb | wQ_bb | wR_bb | wB_bb | wN_bb | wP_bb) ELSE (bK_bb | bQ_bb | bR_bb | bB_bb | bN_bb | bP_bb) END) as my_pieces,
            (CASE WHEN active_turn = ${TURNS.WHITE} THEN (bK_bb | bQ_bb | bR_bb | bB_bb | bN_bb | bP_bb) ELSE (wK_bb | wQ_bb | wR_bb | wB_bb | wN_bb | wP_bb) END) as opponent_pieces,
            CAST((CASE WHEN active_turn = ${TURNS.WHITE} THEN ${getBitIndexSQL('wK_bb')} ELSE ${getBitIndexSQL('bK_bb')} END) AS TINYINT) as active_king_sq,
            CAST((CASE WHEN active_turn = ${TURNS.WHITE} THEN ${getBitIndexSQL('bK_bb')} ELSE ${getBitIndexSQL('wK_bb')} END) AS TINYINT) as passive_king_sq,
            ${rootIsCheck}
        FROM v_board_state;
        
        INSERT INTO frontier_nodes (
            id, parent_id, depth, from_sq, to_sq, piece, is_castle, is_promo, is_capture, captured_piece,
            wK_bb, wQ_bb, wR_bb, wB_bb, wN_bb, wP_bb, bK_bb, bQ_bb, bR_bb, bB_bb, bN_bb, bP_bb,
            castling_rights, active_turn, static_eval, minimax_eval, board_hash, wK_sq, bK_sq, all_pieces,
            my_pieces, opponent_pieces, active_king_sq, passive_king_sq, is_check
        )
        SELECT * FROM search_tree WHERE depth = 0;
    `;
}

export function getNMPConditionSQL(margin, loopAlpha, loopBeta) {
    return `
        is_check = 0 AND (
            (active_turn = 1 AND static_eval - ${margin} >= ${loopBeta}) OR
            (active_turn = -1 AND static_eval + ${margin} <= ${loopAlpha})
        )
    `;
}

export function getSwapFrontiersSQL() {
    return `
        DELETE FROM frontier_nodes;
        INSERT INTO frontier_nodes (
            id, parent_id, depth, from_sq, to_sq, piece, is_castle, is_promo, is_capture, captured_piece,
            wK_bb, wQ_bb, wR_bb, wB_bb, wN_bb, wP_bb, bK_bb, bQ_bb, bR_bb, bB_bb, bN_bb, bP_bb,
            castling_rights, active_turn, static_eval, minimax_eval, board_hash, wK_sq, bK_sq, all_pieces,
            my_pieces, opponent_pieces, active_king_sq, passive_king_sq, is_check
        )
        SELECT 
            id, parent_id, depth, from_sq, to_sq, piece, is_castle, is_promo, is_capture, captured_piece,
            wK_bb, wQ_bb, wR_bb, wB_bb, wN_bb, wP_bb, bK_bb, bQ_bb, bR_bb, bB_bb, bN_bb, bP_bb,
            castling_rights, active_turn, static_eval, minimax_eval, board_hash, wK_sq, bK_sq, all_pieces,
            my_pieces, opponent_pieces, active_king_sq, passive_king_sq, is_check
        FROM next_frontier_nodes;
        DELETE FROM next_frontier_nodes;
    `;
}

export function getMateScoringSQL(targetDepth) {
    return `
        UPDATE search_tree 
        SET minimax_eval = CASE 
            WHEN is_check = 1 THEN (CASE WHEN active_turn = ${TURNS.WHITE} THEN -${SCORE_MATE_THRESHOLD} + depth ELSE ${SCORE_MATE_THRESHOLD} - depth END)
            ELSE 0 
        END
        WHERE depth < ${targetDepth} 
        AND NOT EXISTS (SELECT 1 FROM search_tree child WHERE child.parent_id = search_tree.id)
    `;
}

export function getInitializeLeavesSQL(targetDepth) {
    return `UPDATE search_tree SET minimax_eval = static_eval WHERE minimax_eval IS NULL`;
}

export function getInsertPVSearchFrontierSQL(pvId) {
    return `
        INSERT INTO frontier_nodes (
            id, parent_id, depth, from_sq, to_sq, piece, is_castle, is_promo, is_capture, captured_piece,
            wK_bb, wQ_bb, wR_bb, wB_bb, wN_bb, wP_bb, bK_bb, bQ_bb, bR_bb, bB_bb, bN_bb, bP_bb,
            castling_rights, active_turn, static_eval, minimax_eval, board_hash, wK_sq, bK_sq, all_pieces,
            my_pieces, opponent_pieces, active_king_sq, passive_king_sq, is_check
        )
        SELECT 
            s.id, s.parent_id, s.depth, s.from_sq, s.to_sq, s.piece, s.is_castle, s.is_promo, s.is_capture, s.captured_piece,
            s.wK_bb, s.wQ_bb, s.wR_bb, s.wB_bb, s.wN_bb, s.wP_bb, s.bK_bb, s.bQ_bb, s.bR_bb, s.bB_bb, s.bN_bb, s.bP_bb,
            s.castling_rights, s.active_turn, s.static_eval, s.minimax_eval, s.board_hash, s.wK_sq, s.bK_sq, s.all_pieces,
            s.my_pieces, s.opponent_pieces, s.active_king_sq, s.passive_king_sq, s.is_check
        FROM search_tree s
        LEFT JOIN repetition_history rh ON s.board_hash = rh.board_hash
        WHERE s.id = ${pvId} AND COALESCE(rh.count, 0) < 2
    `;
}

export function getInsertRestParentNodesSQL(pvId) {
    return `
        CREATE TEMPORARY TABLE parent_nodes AS 
        SELECT 
            id, parent_id, depth, from_sq, to_sq, piece, is_castle, is_promo, is_capture, captured_piece,
            wK_bb, wQ_bb, wR_bb, wB_bb, wN_bb, wP_bb, bK_bb, bQ_bb, bR_bb, bB_bb, bN_bb, bP_bb,
            castling_rights, active_turn, static_eval, minimax_eval, board_hash, wK_sq, bK_sq, all_pieces,
            my_pieces, opponent_pieces, active_king_sq, passive_king_sq, is_check
        FROM search_tree WHERE 1=0;
        
        INSERT INTO parent_nodes 
        SELECT 
            s.id, s.parent_id, s.depth, s.from_sq, s.to_sq, s.piece, s.is_castle, s.is_promo, s.is_capture, s.captured_piece,
            s.wK_bb, s.wQ_bb, s.wR_bb, wB_bb, wN_bb, wP_bb, s.bK_bb, s.bQ_bb, s.bR_bb, s.bB_bb, s.bN_bb, s.bP_bb,
            s.castling_rights, s.active_turn, s.static_eval, s.minimax_eval, s.board_hash, s.wK_sq, s.bK_sq, s.all_pieces,
            s.my_pieces, s.opponent_pieces, s.active_king_sq, s.passive_king_sq, s.is_check
        FROM search_tree s
        LEFT JOIN repetition_history rh ON s.board_hash = rh.board_hash
        WHERE s.depth = 1 AND s.id != ${pvId} AND COALESCE(rh.count, 0) < 2;
    `;
}

