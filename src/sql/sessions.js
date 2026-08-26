/**
 * SQL builders for session lifecycle management within the batched PVS
 * search engine (search-bpvs.js).  Owns only:
 *   - getCreateTempTablesSQL() – creates all temporary working tables
 *     (frontier_nodes, search_tree, raw_moves, QS tables, etc.)
 *   - getClearSearchTreeSQL()  – clears per-iteration state
 *   - getInsertRootNodeSQL()   – inserts the root node and seeds the
 *     initial frontier from the current board state
 *
 * All search-algorithm SQL builders (NMP, frontier swaps, mate scoring,
 * leaf initialisation, PV / rest-node insertion) live in search-bpvs.js.
 */

import { TURNS } from '../quackmate-common.js';
import { getBitIndexSQL } from './utils.js';
import { getStaticEvalSQL } from './eval.js';

const BBTYPE = 'UBIGINT';

export function getCreateTempTablesSQL() {
    return `
        CREATE TEMPORARY TABLE IF NOT EXISTS pruned_parents (id INTEGER);
        CREATE TEMPORARY TABLE IF NOT EXISTS parent_nodes AS SELECT * FROM search_tree WHERE 1=0;
        CREATE TEMPORARY TABLE IF NOT EXISTS next_frontier_nodes AS SELECT * FROM search_tree WHERE 1=0;
        CREATE TEMPORARY TABLE IF NOT EXISTS frontier_nodes AS SELECT * FROM search_tree WHERE 1=0;
        CREATE TEMPORARY TABLE IF NOT EXISTS non_mate_nodes (id INTEGER UNIQUE);
        CREATE TEMPORARY TABLE IF NOT EXISTS attempted_expansions (id INTEGER UNIQUE);
        -- Tracks depth=1 (root) nodes whose minimax_eval was established ONLY via an
        -- alpha-beta cutoff bound (i.e. "provably no better than the current best"),
        -- as opposed to an exact, fully-resolved value. Such bound values must NEVER be
        -- treated as exact scores when picking/tying the final best move at the root,
        -- since a bound can coincidentally match the best score numerically while the
        -- move's true value is actually far worse (see getPersistentExpansionSQL callers
        -- in quackmate.js: pruned_parents identifies exactly this class of node).
        CREATE TEMPORARY TABLE IF NOT EXISTS bound_only_nodes (id INTEGER UNIQUE);
        DELETE FROM non_mate_nodes;
        DELETE FROM attempted_expansions;
        DELETE FROM bound_only_nodes;
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
            is_castle INTEGER, is_promo INTEGER, is_capture INTEGER, promo_piece INTEGER,
            is_check INTEGER,
            
            score INTEGER,
            is_processed INTEGER,
            batch_id INTEGER,
            ep_sq TINYINT,
            is_ep TINYINT
        );
        -- Quiescence Search working tables (same schema as search_tree)
        CREATE TEMPORARY TABLE IF NOT EXISTS qs_frontier AS SELECT * FROM search_tree WHERE 1=0;
        CREATE TEMPORARY TABLE IF NOT EXISTS qs_next_frontier AS SELECT * FROM search_tree WHERE 1=0;
        CREATE TEMPORARY TABLE IF NOT EXISTS qs_search_tree AS SELECT * FROM search_tree WHERE 1=0;
        -- Tracks which main-tree horizon leaves (at the current targetDepth) have already
        -- been seeded into a QS pass during this iterative-deepening depth iteration.
        -- This is required because the batched PVS search processes root moves in several
        -- separate batches (PV / captures / quiet chunks), each of which only leaves its OWN
        -- leaves in frontier_nodes/batch_d2_nodes. Without this table, horizon leaves from
        -- already-completed batches would be silently excluded from QS seeding, and any of
        -- them that happen to give check would be incorrectly scored as forced checkmate by
        -- getApplyQSEvalToMainTreeSQL (see getQSInitSQL).
        CREATE TEMPORARY TABLE IF NOT EXISTS qs_covered_nodes (id INTEGER UNIQUE);
        DELETE FROM qs_covered_nodes;
        -- Snapshot of exactly which horizon leaves were seeded into QS during the CURRENT
        -- run_full_scoring_pass call (see getQSInitSQL). Unlike qs_covered_nodes (which
        -- accumulates across the whole id_depth iteration to avoid re-seeding), this table
        -- is reset on every call and is used by getApplyQSEvalToMainTreeSQL to make sure the
        -- "no QS children -> assume mate" fallback only ever considers nodes that were
        -- actually part of THIS pass (whose qs_search_tree children, if any, are still
        -- present). Without this, a node resolved correctly by an earlier pass could be
        -- incorrectly re-flagged as mate by a later pass, once qs_search_tree has been
        -- cleared for the next batch.
        CREATE TEMPORARY TABLE IF NOT EXISTS qs_seed_snapshot (id INTEGER UNIQUE);
        DELETE FROM qs_seed_snapshot;
    `;
}

export function getClearSearchTreeSQL() {
    return `DELETE FROM search_tree; DELETE FROM frontier_nodes; DELETE FROM non_mate_nodes; DELETE FROM attempted_expansions; DELETE FROM qs_covered_nodes;`;
}

export function getInsertRootNodeSQL(rootIsCheck) {
    return `
        INSERT INTO search_tree (
            id, parent_id, depth, from_sq, to_sq, piece, is_castle, is_promo, is_capture, captured_piece, promo_piece,
            wK_bb, wQ_bb, wR_bb, wB_bb, wN_bb, wP_bb, bK_bb, bQ_bb, bR_bb, bB_bb, bN_bb, bP_bb,
            castling_rights, active_turn, ep_sq, is_ep, static_eval, minimax_eval, board_hash, wK_sq, bK_sq, all_pieces,
            my_pieces, opponent_pieces, active_king_sq, passive_king_sq, is_check
        )
        SELECT
            0, NULL, 0, -1, -1, 0, 0, 0, 0, 0, 0,
            wK_bb, wQ_bb, wR_bb, wB_bb, wN_bb, wP_bb,
            bK_bb, bQ_bb, bR_bb, bB_bb, bN_bb, bP_bb,
            castling_rights, active_turn, ep_sq, 0::TINYINT, (${getStaticEvalSQL('v_board_state')})::INTEGER as static_eval, NULL, 0,
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
            id, parent_id, depth, from_sq, to_sq, piece, is_castle, is_promo, is_capture, captured_piece, promo_piece,
            wK_bb, wQ_bb, wR_bb, wB_bb, wN_bb, wP_bb, bK_bb, bQ_bb, bR_bb, bB_bb, bN_bb, bP_bb,
            castling_rights, active_turn, ep_sq, is_ep, static_eval, minimax_eval, board_hash, wK_sq, bK_sq, all_pieces,
            my_pieces, opponent_pieces, active_king_sq, passive_king_sq, is_check
        )
        SELECT * FROM search_tree WHERE depth = 0;
    `;
}

