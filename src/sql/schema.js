import { 
    PIECES,
    TURNS,
    PIECE_VALUES,
    COMPUTED_PST,
    ZOBRIST_CONSTANTS,
    ZOBRIST_MISC
} from '../quackmate-common.js';

const BBTYPE = 'UBIGINT';

export function getInitSchemaSQL() {
    return `
        DROP TABLE IF EXISTS piece_bitboards;
        CREATE TABLE piece_bitboards(piece TINYINT PRIMARY KEY, bitboard ${BBTYPE});
        INSERT INTO piece_bitboards VALUES
        (${PIECES.K}, 1::${BBTYPE} << 4), -- e1
        (${PIECES.Q}, 1::${BBTYPE} << 3), -- d1
        (${PIECES.R}, (1::${BBTYPE} << 0) | (1::${BBTYPE} << 7)), -- a1, h1
        (${PIECES.B}, (1::${BBTYPE} << 2) | (1::${BBTYPE} << 5)), -- c1, f1
        (${PIECES.N}, (1::${BBTYPE} << 1) | (1::${BBTYPE} << 6)), -- b1, g1
        (${PIECES.P}, 255::${BBTYPE} << 8), -- Rank 2
        (${PIECES.k}, 1::${BBTYPE} << 60), -- e8
        (${PIECES.q}, 1::${BBTYPE} << 59), -- d8
        (${PIECES.r}, (1::${BBTYPE} << 56) | (1::${BBTYPE} << 63)), -- a8, h8
        (${PIECES.b}, (1::${BBTYPE} << 58) | (1::${BBTYPE} << 61)), -- c8, f8
        (${PIECES.n}, (1::${BBTYPE} << 57) | (1::${BBTYPE} << 62)), -- b8, g8
        (${PIECES.p}, 255::${BBTYPE} << 48); -- Rank 7

        DROP TABLE IF EXISTS piece_characteristics;
        CREATE TABLE piece_characteristics (
            piece TINYINT PRIMARY KEY,
            base_value INTEGER,
            color_mult TINYINT, --1 for White, -1 for Black
            is_pawn TINYINT DEFAULT 0,
            is_king TINYINT DEFAULT 0
        );
        INSERT INTO piece_characteristics (piece, base_value, color_mult, is_pawn, is_king) VALUES
        (${PIECES.P}, ${PIECE_VALUES[PIECES.P]}, 1, 1, 0), (${PIECES.N}, ${PIECE_VALUES[PIECES.N]}, 1, 0, 0), (${PIECES.B}, ${PIECE_VALUES[PIECES.B]}, 1, 0, 0), (${PIECES.R}, ${PIECE_VALUES[PIECES.R]}, 1, 0, 0), (${PIECES.Q}, ${PIECE_VALUES[PIECES.Q]}, 1, 0, 0), (${PIECES.K}, ${PIECE_VALUES[PIECES.K]}, 1, 0, 1),
        (${PIECES.p}, ${PIECE_VALUES[PIECES.p]}, -1, 1, 0), (${PIECES.n}, ${PIECE_VALUES[PIECES.n]}, -1, 0, 0), (${PIECES.b}, ${PIECE_VALUES[PIECES.b]}, -1, 0, 0), (${PIECES.r}, ${PIECE_VALUES[PIECES.r]}, -1, 0, 0), (${PIECES.q}, ${PIECE_VALUES[PIECES.q]}, -1, 0, 0), (${PIECES.k}, ${PIECE_VALUES[PIECES.k]}, -1, 0, 1);

        DROP TABLE IF EXISTS turn_data;
        CREATE TABLE turn_data(
            active_turn TINYINT PRIMARY KEY,
            opponent_turn TINYINT,
            pawn_dir TINYINT,
            start_rank TINYINT,
            promo_rank TINYINT
        );
        INSERT INTO turn_data VALUES (${TURNS.WHITE}, ${TURNS.BLACK}, 1, 1, 7), (${TURNS.BLACK}, ${TURNS.WHITE}, -1, 6, 0);

        DROP TABLE IF EXISTS piece_masks;
        CREATE TABLE piece_masks (
            piece TINYINT PRIMARY KEY,
            mask_wK ${BBTYPE}, mask_wQ ${BBTYPE}, mask_wR ${BBTYPE}, mask_wB ${BBTYPE}, mask_wN ${BBTYPE}, mask_wP ${BBTYPE},
            mask_bK ${BBTYPE}, mask_bQ ${BBTYPE}, mask_bR ${BBTYPE}, mask_bB ${BBTYPE}, mask_bN ${BBTYPE}, mask_bP ${BBTYPE}
        );
        INSERT INTO piece_masks VALUES ${(() => {
            // Helper to generate the mask rows
            const pieceOrder = [PIECES.K, PIECES.Q, PIECES.R, PIECES.B, PIECES.N, PIECES.P, PIECES.k, PIECES.q, PIECES.r, PIECES.b, PIECES.n, PIECES.p];
            const allOnesSQL = `(~0::${BBTYPE})`;
            const zeroSQL = `0::${BBTYPE}`;
            
            return Object.values(PIECES).map(pVal => {
                const masks = pieceOrder.map(targetP => 
                    (pVal === targetP) ? allOnesSQL : zeroSQL
                );
                return `(${pVal}, ${masks.join(', ')})`;
            }).join(', ');
        })()};

        DROP TABLE IF EXISTS game_state;
        CREATE TABLE game_state(
            active_turn TINYINT,
            castling_rights HUGEINT,
            halfmove_clock INTEGER,
            fullmove_number INTEGER
        );
        INSERT INTO game_state (active_turn, castling_rights, halfmove_clock, fullmove_number)
        VALUES (${TURNS.WHITE}, 15, 0, 1);

        DROP TABLE IF EXISTS v_board_state;
        CREATE TABLE v_board_state (
            wK_bb ${BBTYPE}, wQ_bb ${BBTYPE}, wR_bb ${BBTYPE}, wB_bb ${BBTYPE}, wN_bb ${BBTYPE}, wP_bb ${BBTYPE},
            bK_bb ${BBTYPE}, bQ_bb ${BBTYPE}, bR_bb ${BBTYPE}, bB_bb ${BBTYPE}, bN_bb ${BBTYPE}, bP_bb ${BBTYPE},
            castling_rights HUGEINT, active_turn TINYINT
        );

        DROP TABLE IF EXISTS pst_values;
        CREATE TABLE pst_values (piece TINYINT, square TINYINT, value INTEGER, PRIMARY KEY(piece, square));
        INSERT INTO pst_values VALUES ${(() => {
            const vals = [];
            for (const p in COMPUTED_PST) {
                for (const sq in COMPUTED_PST[p]) {
                    vals.push(`(${p}, ${sq}, ${COMPUTED_PST[p][sq]})`);
                }
            }
            return vals.join(', ');
        })()};

        DROP TABLE IF EXISTS zobrist_constants;
        CREATE TABLE zobrist_constants (piece TINYINT, square TINYINT, val ${BBTYPE}, PRIMARY KEY(piece, square));
        INSERT INTO zobrist_constants VALUES ${(() => {
            const vals = [];
            for (const p in ZOBRIST_CONSTANTS) {
                for (let sq = 0; sq < 64; sq++) {
                    vals.push(`(${PIECES[p]}, ${sq}, ${ZOBRIST_CONSTANTS[p][sq]})`);
                }
            }
            return vals.join(', ');
        })()};

        DROP TABLE IF EXISTS zobrist_misc;
        CREATE TABLE zobrist_misc (type VARCHAR, idx TINYINT, val ${BBTYPE});
        INSERT INTO zobrist_misc VALUES 
        ('turn', 0, ${ZOBRIST_MISC.turn}),
        ('castle', 0, ${ZOBRIST_MISC.castle[0]}),
        ('castle', 1, ${ZOBRIST_MISC.castle[1]}),
        ('castle', 2, ${ZOBRIST_MISC.castle[2]}),
        ('castle', 3, ${ZOBRIST_MISC.castle[3]});

        DROP TABLE IF EXISTS repetition_history;
        CREATE TABLE repetition_history (board_hash ${BBTYPE}, count INTEGER);

        -- Killer Moves (Depth-based)
        CREATE TABLE killer_moves (
            depth TINYINT,
            slot TINYINT,
            from_sq TINYINT,
            to_sq TINYINT,
            PRIMARY KEY(depth, slot)
        );

        DROP TABLE IF EXISTS squares;
        CREATE TABLE squares (i TINYINT PRIMARY KEY);
        INSERT INTO squares SELECT CAST(i AS TINYINT) FROM generate_series(0, 63) AS t(i);

        DROP TABLE IF EXISTS frontier_nodes;
        CREATE TABLE frontier_nodes (
            from_sq TINYINT, to_sq TINYINT, piece TINYINT,
            wK_bb ${BBTYPE}, wQ_bb ${BBTYPE}, wR_bb ${BBTYPE}, wB_bb ${BBTYPE}, wN_bb ${BBTYPE}, wP_bb ${BBTYPE},
            bK_bb ${BBTYPE}, bQ_bb ${BBTYPE}, bR_bb ${BBTYPE}, bB_bb ${BBTYPE}, bN_bb ${BBTYPE}, bP_bb ${BBTYPE},
            castling_rights HUGEINT, active_turn TINYINT, eval INTEGER, board_hash ${BBTYPE}, id INTEGER,
            wK_sq TINYINT, bK_sq TINYINT, all_pieces ${BBTYPE}, depth TINYINT
        );

        DROP TABLE IF EXISTS next_frontier_nodes;
        CREATE TABLE next_frontier_nodes (
            from_sq TINYINT, to_sq TINYINT, piece TINYINT,
            wK_bb ${BBTYPE}, wQ_bb ${BBTYPE}, wR_bb ${BBTYPE}, wB_bb ${BBTYPE}, wN_bb ${BBTYPE}, wP_bb ${BBTYPE},
            bK_bb ${BBTYPE}, bQ_bb ${BBTYPE}, bR_bb ${BBTYPE}, bB_bb ${BBTYPE}, bN_bb ${BBTYPE}, bP_bb ${BBTYPE},
            castling_rights HUGEINT, active_turn TINYINT, eval INTEGER, board_hash ${BBTYPE}, id INTEGER,
            wK_sq TINYINT, bK_sq TINYINT, all_pieces ${BBTYPE}, depth TINYINT
        );

        -- Persistent Search Tree (modified for ID)
        DROP TABLE IF EXISTS search_tree;
        CREATE TABLE search_tree (
            id INTEGER PRIMARY KEY, parent_id INTEGER, depth TINYINT, from_sq TINYINT, to_sq TINYINT, piece TINYINT,
            is_castle TINYINT, is_promo TINYINT, is_capture TINYINT, captured_piece TINYINT,
            wK_bb ${BBTYPE}, wQ_bb ${BBTYPE}, wR_bb ${BBTYPE}, wB_bb ${BBTYPE}, wN_bb ${BBTYPE}, wP_bb ${BBTYPE},
            bK_bb ${BBTYPE}, bQ_bb ${BBTYPE}, bR_bb ${BBTYPE}, bB_bb ${BBTYPE}, bN_bb ${BBTYPE}, bP_bb ${BBTYPE},
            castling_rights HUGEINT, active_turn TINYINT,
            static_eval INTEGER, minimax_eval INTEGER, board_hash ${BBTYPE}, 
            wK_sq TINYINT, bK_sq TINYINT, all_pieces ${BBTYPE},
            my_pieces ${BBTYPE}, opponent_pieces ${BBTYPE},
            active_king_sq TINYINT, passive_king_sq TINYINT,
            is_check TINYINT DEFAULT 0
        );
        DROP SEQUENCE IF EXISTS seq_search_tree_id;
        CREATE SEQUENCE seq_search_tree_id START WITH 1;

        DROP TABLE IF EXISTS mobility_precomputed;
        CREATE TABLE mobility_precomputed (piece TINYINT, from_sq TINYINT, target_sq TINYINT, ray_mask ${BBTYPE});
        CREATE INDEX idx_mobility_target ON mobility_precomputed(target_sq);
        CREATE INDEX idx_mobility_from_piece ON mobility_precomputed(piece, from_sq);

        DROP TABLE IF EXISTS leaper_precomputed;
        CREATE TABLE leaper_precomputed (piece TINYINT, from_sq TINYINT, to_sq TINYINT);
        CREATE INDEX idx_leaper_from ON leaper_precomputed(piece, from_sq);

        DROP TABLE IF EXISTS attacks_precomputed;
        CREATE TABLE attacks_precomputed (square TINYINT PRIMARY KEY, knight_mask ${BBTYPE}, king_mask ${BBTYPE}, white_pawn_mask ${BBTYPE}, black_pawn_mask ${BBTYPE});
        
        DROP TABLE IF EXISTS history_moves;
        CREATE TABLE history_moves (piece TINYINT, to_sq TINYINT, score INTEGER);
        CREATE INDEX idx_history ON history_moves(piece, to_sq);
    `;
}


export function getClearBoardSQL() { return `DELETE FROM piece_bitboards; DELETE FROM game_state; DELETE FROM v_board_state; DELETE FROM repetition_history; `; }


export function getPopulateBoardStateTableSQL() {
    return `
        INSERT INTO v_board_state
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
            COALESCE((SELECT castling_rights FROM game_state ORDER BY fullmove_number DESC, halfmove_clock DESC LIMIT 1), 0::HUGEINT) as castling_rights,
            COALESCE((SELECT active_turn FROM game_state ORDER BY fullmove_number DESC, halfmove_clock DESC LIMIT 1), 1::TINYINT) as active_turn;
    `;
}

export function getClearSearchSQL() {
    return `DELETE FROM search_tree; DELETE FROM transposition_table; DELETE FROM history_moves; DELETE FROM killer_moves; DROP SEQUENCE IF EXISTS seq_search_tree_id; CREATE SEQUENCE seq_search_tree_id START 1; `;
}

export function getPopulatePstSQL(values) { return `INSERT INTO pst_values VALUES ${values.join(', ')}; `; }

export function getPopulateAttacksSQL(values) { return `INSERT INTO attacks_precomputed VALUES ${values.join(', ')}; `; }

export function getPopulateMobilitySQL(values) { return `INSERT INTO mobility_precomputed (piece, from_sq, target_sq, ray_mask) VALUES ${values}; `; }

export function getPopulateZobristSQL(zcValues, zmValues) { return `INSERT INTO zobrist_constants VALUES ${zcValues.join(', ')}; INSERT INTO zobrist_misc VALUES ${zmValues.join(', ')}; `; }


export function getInitSearchTablesSQL() {
    return `
        -- Search Tree
        DROP TABLE IF EXISTS search_tree;
        CREATE TABLE search_tree (
            id INTEGER PRIMARY KEY, parent_id INTEGER, depth TINYINT, from_sq TINYINT, to_sq TINYINT, piece TINYINT,
            is_castle TINYINT, is_promo TINYINT, is_capture TINYINT, captured_piece TINYINT,
            wK_bb ${BBTYPE}, wQ_bb ${BBTYPE}, wR_bb ${BBTYPE}, wB_bb ${BBTYPE}, wN_bb ${BBTYPE}, wP_bb ${BBTYPE},
            bK_bb ${BBTYPE}, bQ_bb ${BBTYPE}, bR_bb ${BBTYPE}, bB_bb ${BBTYPE}, bN_bb ${BBTYPE}, bP_bb ${BBTYPE},
            castling_rights HUGEINT, active_turn TINYINT,
            static_eval INTEGER, minimax_eval INTEGER, board_hash ${BBTYPE}, 
            wK_sq TINYINT, bK_sq TINYINT, all_pieces ${BBTYPE},
            my_pieces ${BBTYPE}, opponent_pieces ${BBTYPE},
            active_king_sq TINYINT, passive_king_sq TINYINT,
            is_check TINYINT DEFAULT 0::TINYINT
        );
        CREATE INDEX idx_st_parent ON search_tree(parent_id);
        CREATE INDEX idx_st_depth ON search_tree(depth);
        -- Hash index for merging
        CREATE INDEX idx_st_hash ON search_tree(board_hash);

        -- Frontier Nodes
        DROP TABLE IF EXISTS frontier_nodes;
        CREATE TABLE frontier_nodes (
            id INTEGER PRIMARY KEY, parent_id INTEGER, depth TINYINT, from_sq TINYINT, to_sq TINYINT, piece TINYINT,
            is_castle TINYINT, is_promo TINYINT, is_capture TINYINT, captured_piece TINYINT,
            wK_bb ${BBTYPE}, wQ_bb ${BBTYPE}, wR_bb ${BBTYPE}, wB_bb ${BBTYPE}, wN_bb ${BBTYPE}, wP_bb ${BBTYPE},
            bK_bb ${BBTYPE}, bQ_bb ${BBTYPE}, bR_bb ${BBTYPE}, bB_bb ${BBTYPE}, bN_bb ${BBTYPE}, bP_bb ${BBTYPE},
            castling_rights HUGEINT, active_turn TINYINT,
            static_eval INTEGER, minimax_eval INTEGER, board_hash ${BBTYPE}, 
            wK_sq TINYINT, bK_sq TINYINT, all_pieces ${BBTYPE},
            my_pieces ${BBTYPE}, opponent_pieces ${BBTYPE},
            active_king_sq TINYINT, passive_king_sq TINYINT,
            is_check TINYINT DEFAULT 0::TINYINT
        );

        DROP TABLE IF EXISTS next_frontier_nodes;
        CREATE TABLE next_frontier_nodes (
            id INTEGER PRIMARY KEY, parent_id INTEGER, depth TINYINT, from_sq TINYINT, to_sq TINYINT, piece TINYINT,
            is_castle TINYINT, is_promo TINYINT, is_capture TINYINT, captured_piece TINYINT,
            wK_bb ${BBTYPE}, wQ_bb ${BBTYPE}, wR_bb ${BBTYPE}, wB_bb ${BBTYPE}, wN_bb ${BBTYPE}, wP_bb ${BBTYPE},
            bK_bb ${BBTYPE}, bQ_bb ${BBTYPE}, bR_bb ${BBTYPE}, bB_bb ${BBTYPE}, bN_bb ${BBTYPE}, bP_bb ${BBTYPE},
            castling_rights HUGEINT, active_turn TINYINT,
            static_eval INTEGER, minimax_eval INTEGER, board_hash ${BBTYPE}, 
            wK_sq TINYINT, bK_sq TINYINT, all_pieces ${BBTYPE},
            my_pieces ${BBTYPE}, opponent_pieces ${BBTYPE},
            active_king_sq TINYINT, passive_king_sq TINYINT,
            is_check TINYINT DEFAULT 0::TINYINT
        );

        -- Candidates
        DROP TABLE IF EXISTS candidates_v2;
        CREATE TABLE candidates_v2 (
            id INTEGER PRIMARY KEY, parent_id INTEGER, depth TINYINT, from_sq TINYINT, to_sq TINYINT, piece TINYINT,
            is_castle TINYINT, is_promo TINYINT, is_capture TINYINT, captured_piece TINYINT,
            wK_bb ${BBTYPE}, wQ_bb ${BBTYPE}, wR_bb ${BBTYPE}, wB_bb ${BBTYPE}, wN_bb ${BBTYPE}, wP_bb ${BBTYPE},
            bK_bb ${BBTYPE}, bQ_bb ${BBTYPE}, bR_bb ${BBTYPE}, bB_bb ${BBTYPE}, bN_bb ${BBTYPE}, bP_bb ${BBTYPE},
            castling_rights HUGEINT, active_turn TINYINT,
            static_eval INTEGER, minimax_eval INTEGER, board_hash ${BBTYPE}, 
            wK_sq TINYINT, bK_sq TINYINT, all_pieces ${BBTYPE},
            my_pieces ${BBTYPE}, opponent_pieces ${BBTYPE},
            active_king_sq TINYINT, passive_king_sq TINYINT,
            is_check TINYINT DEFAULT 0::TINYINT
        );

        -- Search Space (Expanded from Frontier Nodes)
        DROP TABLE IF EXISTS search_space;
        CREATE TABLE search_space (
            id INTEGER PRIMARY KEY, parent_id INTEGER, depth TINYINT, from_sq TINYINT, to_sq TINYINT, piece TINYINT,
            is_castle TINYINT, is_promo TINYINT, is_capture TINYINT, captured_piece TINYINT,
            wK_bb ${BBTYPE}, wQ_bb ${BBTYPE}, wR_bb ${BBTYPE}, wB_bb ${BBTYPE}, wN_bb ${BBTYPE}, wP_bb ${BBTYPE},
            bK_bb ${BBTYPE}, bQ_bb ${BBTYPE}, bR_bb ${BBTYPE}, bB_bb ${BBTYPE}, bN_bb ${BBTYPE}, bP_bb ${BBTYPE},
            castling_rights HUGEINT, active_turn TINYINT,
            static_eval INTEGER, minimax_eval INTEGER, board_hash ${BBTYPE}, 
            wK_sq TINYINT, bK_sq TINYINT, all_pieces ${BBTYPE},
            my_pieces ${BBTYPE}, opponent_pieces ${BBTYPE},
            active_king_sq TINYINT, passive_king_sq TINYINT,
            is_check TINYINT DEFAULT 0::TINYINT
        );
        
        -- All Moves (for basic search)
        DROP TABLE IF EXISTS all_moves;
        CREATE TABLE all_moves (
            parent_id INTEGER, from_sq INTEGER, to_sq INTEGER, piece TINYINT, is_castle TINYINT, is_promo TINYINT
        );

        -- Expanded (Derived States)
        DROP TABLE IF EXISTS expanded;
        CREATE TABLE expanded (
            id INTEGER PRIMARY KEY, parent_id INTEGER, depth TINYINT, from_sq TINYINT, to_sq TINYINT, piece TINYINT,
            is_castle TINYINT, is_promo TINYINT, is_capture TINYINT, captured_piece TINYINT,
            wK_bb ${BBTYPE}, wQ_bb ${BBTYPE}, wR_bb ${BBTYPE}, wB_bb ${BBTYPE}, wN_bb ${BBTYPE}, wP_bb ${BBTYPE},
            bK_bb ${BBTYPE}, bQ_bb ${BBTYPE}, bR_bb ${BBTYPE}, bB_bb ${BBTYPE}, bN_bb ${BBTYPE}, bP_bb ${BBTYPE},
            castling_rights HUGEINT, active_turn TINYINT,
            static_eval INTEGER, minimax_eval INTEGER, board_hash ${BBTYPE}, 
            wK_sq TINYINT, bK_sq TINYINT, all_pieces ${BBTYPE},
            my_pieces ${BBTYPE}, opponent_pieces ${BBTYPE},
            active_king_sq TINYINT, passive_king_sq TINYINT,
            is_check TINYINT DEFAULT 0::TINYINT
        );

        -- Legal Expanded (Same as Expanded)
        DROP TABLE IF EXISTS legal_expanded;
        CREATE TABLE legal_expanded (
            id INTEGER PRIMARY KEY, parent_id INTEGER, depth TINYINT, from_sq TINYINT, to_sq TINYINT, piece TINYINT,
            is_castle TINYINT, is_promo TINYINT, is_capture TINYINT, captured_piece TINYINT,
            wK_bb ${BBTYPE}, wQ_bb ${BBTYPE}, wR_bb ${BBTYPE}, wB_bb ${BBTYPE}, wN_bb ${BBTYPE}, wP_bb ${BBTYPE},
            bK_bb ${BBTYPE}, bQ_bb ${BBTYPE}, bR_bb ${BBTYPE}, bB_bb ${BBTYPE}, bN_bb ${BBTYPE}, bP_bb ${BBTYPE},
            castling_rights HUGEINT, active_turn TINYINT,
            static_eval INTEGER, minimax_eval INTEGER, board_hash ${BBTYPE}, 
            wK_sq TINYINT, bK_sq TINYINT, all_pieces ${BBTYPE},
            my_pieces ${BBTYPE}, opponent_pieces ${BBTYPE},
            active_king_sq TINYINT, passive_king_sq TINYINT,
            is_check TINYINT DEFAULT 0::TINYINT
        );

        -- Legal Hashed (Legal Expanded + Hash + Evaluation)
        DROP TABLE IF EXISTS legal_hashed_v2;
        CREATE TABLE legal_hashed_v2 (
            id INTEGER PRIMARY KEY, parent_id INTEGER, depth TINYINT, from_sq TINYINT, to_sq TINYINT, piece TINYINT,
            is_castle TINYINT, is_promo TINYINT, is_capture TINYINT, captured_piece TINYINT,
            wK_bb ${BBTYPE}, wQ_bb ${BBTYPE}, wR_bb ${BBTYPE}, wB_bb ${BBTYPE}, wN_bb ${BBTYPE}, wP_bb ${BBTYPE},
            bK_bb ${BBTYPE}, bQ_bb ${BBTYPE}, bR_bb ${BBTYPE}, bB_bb ${BBTYPE}, bN_bb ${BBTYPE}, bP_bb ${BBTYPE},
            castling_rights HUGEINT, active_turn TINYINT,
            static_eval INTEGER, minimax_eval INTEGER, board_hash ${BBTYPE}, 
            wK_sq TINYINT, bK_sq TINYINT, all_pieces ${BBTYPE},
            my_pieces ${BBTYPE}, opponent_pieces ${BBTYPE},
            active_king_sq TINYINT, passive_king_sq TINYINT,
            is_check TINYINT DEFAULT 0::TINYINT
        );

        -- Transposition Table
        DROP TABLE IF EXISTS transposition_table;
        CREATE TABLE transposition_table(board_hash ${BBTYPE} PRIMARY KEY, static_eval INTEGER, depth TINYINT, best_move_from TINYINT, best_move_to TINYINT);

        -- Repetition History
        DROP TABLE IF EXISTS repetition_history;
        CREATE TABLE repetition_history (board_hash ${BBTYPE}, count INTEGER);

        -- History Moves (Butterfly Heuristic)
        DROP TABLE IF EXISTS history_moves;
        CREATE TABLE history_moves (piece TINYINT, to_sq TINYINT, score INTEGER, PRIMARY KEY(piece, to_sq));
    `;
}


export function getRecreateCandidatesV2SQL() {
    return `
        DROP TABLE IF EXISTS candidates_v2;
        CREATE TABLE candidates_v2 (
            id INTEGER,
            parent_id INTEGER,
            from_sq TINYINT,
            to_sq TINYINT,
            piece TINYINT,
            is_capture TINYINT,
            is_check TINYINT,
            static_eval INTEGER
        );
    `;
}


export function getRecreateFrontierNodesSQL() {
    return `
        DROP TABLE IF EXISTS frontier_nodes;
        CREATE TABLE frontier_nodes (
            id INTEGER PRIMARY KEY, parent_id INTEGER, depth TINYINT, from_sq TINYINT, to_sq TINYINT, piece TINYINT,
            is_castle TINYINT, is_promo TINYINT, is_capture TINYINT, captured_piece TINYINT,
            wK_bb ${BBTYPE}, wQ_bb ${BBTYPE}, wR_bb ${BBTYPE}, wB_bb ${BBTYPE}, wN_bb ${BBTYPE}, wP_bb ${BBTYPE},
            bK_bb ${BBTYPE}, bQ_bb ${BBTYPE}, bR_bb ${BBTYPE}, bB_bb ${BBTYPE}, bN_bb ${BBTYPE}, bP_bb ${BBTYPE},
            castling_rights HUGEINT, active_turn TINYINT,
            static_eval INTEGER, minimax_eval INTEGER, board_hash ${BBTYPE}, 
            wK_sq TINYINT, bK_sq TINYINT, all_pieces ${BBTYPE},
            my_pieces ${BBTYPE}, opponent_pieces ${BBTYPE},
            active_king_sq TINYINT, passive_king_sq TINYINT,
            is_check TINYINT DEFAULT 0::TINYINT
        );
    `;
}




