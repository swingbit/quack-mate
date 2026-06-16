
    WITH RECURSIVE
        
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
            xor(COALESCE((SELECT bit_xor(zc.val) FROM zobrist_constants zc WHERE (
        (zc.piece = 6 AND (((init_state.wK_bb) & (1::UBIGINT << zc.square::INTEGER)) <> 0)) OR
        (zc.piece = 5 AND (((init_state.wQ_bb) & (1::UBIGINT << zc.square::INTEGER)) <> 0)) OR
        (zc.piece = 4 AND (((init_state.wR_bb) & (1::UBIGINT << zc.square::INTEGER)) <> 0)) OR
        (zc.piece = 3 AND (((init_state.wB_bb) & (1::UBIGINT << zc.square::INTEGER)) <> 0)) OR
        (zc.piece = 2 AND (((init_state.wN_bb) & (1::UBIGINT << zc.square::INTEGER)) <> 0)) OR
        (zc.piece = 1 AND (((init_state.wP_bb) & (1::UBIGINT << zc.square::INTEGER)) <> 0)) OR
        (zc.piece = -6 AND (((init_state.bK_bb) & (1::UBIGINT << zc.square::INTEGER)) <> 0)) OR
        (zc.piece = -5 AND (((init_state.bQ_bb) & (1::UBIGINT << zc.square::INTEGER)) <> 0)) OR
        (zc.piece = -4 AND (((init_state.bR_bb) & (1::UBIGINT << zc.square::INTEGER)) <> 0)) OR
        (zc.piece = -3 AND (((init_state.bB_bb) & (1::UBIGINT << zc.square::INTEGER)) <> 0)) OR
        (zc.piece = -2 AND (((init_state.bN_bb) & (1::UBIGINT << zc.square::INTEGER)) <> 0)) OR
        (zc.piece = -1 AND (((init_state.bP_bb) & (1::UBIGINT << zc.square::INTEGER)) <> 0))
    )), 0::UBIGINT), xor(COALESCE((SELECT zm.val FROM zobrist_misc zm WHERE zm.type = 'turn' AND init_state.active_turn = -1), 0::UBIGINT), COALESCE((SELECT bit_xor(zm.val) FROM zobrist_misc zm WHERE zm.type = 'castle' AND ((((init_state.castling_rights) & (1::UBIGINT << zm.idx::INTEGER)) <> 0))), 0::UBIGINT))) as board_hash,
            init_state.wK_sq,
            init_state.bK_sq,
            ((wK_bb) | (wQ_bb) | (wR_bb) | (wB_bb) | (wN_bb) | (wP_bb) | (bK_bb) | (bQ_bb) | (bR_bb) | (bB_bb) | (bN_bb) | (bP_bb)) as all_pieces,
            init_state.my_pieces, init_state.opponent_pieces,
            init_state.active_king_sq, init_state.passive_king_sq,
            0::TINYINT as is_check
        FROM (
            SELECT *,
                (CASE WHEN active_turn = 1 THEN CAST(floor(log2(CAST(CASE WHEN (wK_bb) = 0 THEN 1 ELSE (wK_bb) END AS DOUBLE)) + 1e-10) AS TINYINT) ELSE CAST(floor(log2(CAST(CASE WHEN (bK_bb) = 0 THEN 1 ELSE (bK_bb) END AS DOUBLE)) + 1e-10) AS TINYINT) END) as active_king_sq,
                (CASE WHEN active_turn = 1 THEN CAST(floor(log2(CAST(CASE WHEN (bK_bb) = 0 THEN 1 ELSE (bK_bb) END AS DOUBLE)) + 1e-10) AS TINYINT) ELSE CAST(floor(log2(CAST(CASE WHEN (wK_bb) = 0 THEN 1 ELSE (wK_bb) END AS DOUBLE)) + 1e-10) AS TINYINT) END) as passive_king_sq,
                CAST(floor(log2(CAST(CASE WHEN (wK_bb) = 0 THEN 1 ELSE (wK_bb) END AS DOUBLE)) + 1e-10) AS TINYINT) as wK_sq,
                CAST(floor(log2(CAST(CASE WHEN (bK_bb) = 0 THEN 1 ELSE (bK_bb) END AS DOUBLE)) + 1e-10) AS TINYINT) as bK_sq,
                ((
        COALESCE((SELECT SUM(SIGN(pst.piece) * (
            CASE ABS(pst.piece)
                WHEN 1 THEN 100
                WHEN 2 THEN 320
                WHEN 3 THEN 330
                WHEN 4 THEN 500
                WHEN 5 THEN 900
                WHEN 6 THEN 20000
                ELSE 0
            END + pst.value
        ))
                    FROM pst_values pst, (VALUES 
                            (1::TINYINT, v_board_state.wP_bb),
                            (2::TINYINT, v_board_state.wN_bb),
                            (3::TINYINT, v_board_state.wB_bb),
                            (4::TINYINT, v_board_state.wR_bb),
                            (5::TINYINT, v_board_state.wQ_bb),
                            (6::TINYINT, v_board_state.wK_bb),
                            (-1::TINYINT, v_board_state.bP_bb),
                            (-2::TINYINT, v_board_state.bN_bb),
                            (-3::TINYINT, v_board_state.bB_bb),
                            (-4::TINYINT, v_board_state.bR_bb),
                            (-5::TINYINT, v_board_state.bQ_bb),
                            (-6::TINYINT, v_board_state.bK_bb)
                        ) AS pb(p, bb)
                    WHERE pst.piece = pb.p AND (((pb.bb) & (1::UBIGINT << pst.square::INTEGER)) <> 0)
        ), 0)
    )::INTEGER)::INTEGER as static_eval,
                (CASE WHEN active_turn = 1 THEN ((wK_bb) | (wQ_bb) | (wR_bb) | (wB_bb) | (wN_bb) | (wP_bb)) ELSE ((bK_bb) | (bQ_bb) | (bR_bb) | (bB_bb) | (bN_bb) | (bP_bb)) END) as my_pieces,
                (CASE WHEN active_turn = 1 THEN ((bK_bb) | (bQ_bb) | (bR_bb) | (bB_bb) | (bN_bb) | (bP_bb)) ELSE ((wK_bb) | (wQ_bb) | (wR_bb) | (wB_bb) | (wN_bb) | (wP_bb)) END) as opponent_pieces
            FROM v_board_state
        ) init_state

        UNION ALL

        -- [Recursive Step] Expand Nodes
        -- For each node at depth d, generate all pseudo-legal moves, 
        -- apply them, filter illegal ones (kings in check), and produce nodes at d+1.
        SELECT
            (nextval('seq_search_tree_id'))::INTEGER as id,
            m_expanded.parent_id, m_expanded.depth, m_expanded.from_sq, m_expanded.to_sq, m_expanded.piece, 
            m_expanded.is_castle, m_expanded.is_promo, m_expanded.is_capture, m_expanded.captured_piece,
            m_expanded.wK_bb, m_expanded.wQ_bb, m_expanded.wR_bb, m_expanded.wB_bb, m_expanded.wN_bb, m_expanded.wP_bb, 
            m_expanded.bK_bb, m_expanded.bQ_bb, m_expanded.bR_bb, m_expanded.bB_bb, m_expanded.bN_bb, m_expanded.bP_bb,
            m_expanded.castling_rights, m_expanded.active_turn,
            (
        COALESCE((SELECT SUM(SIGN(pst.piece) * (
            CASE ABS(pst.piece)
                WHEN 1 THEN 100
                WHEN 2 THEN 320
                WHEN 3 THEN 330
                WHEN 4 THEN 500
                WHEN 5 THEN 900
                WHEN 6 THEN 20000
                ELSE 0
            END + pst.value
        ))
                    FROM pst_values pst, (VALUES 
                            (1::TINYINT, m_expanded.wP_bb),
                            (2::TINYINT, m_expanded.wN_bb),
                            (3::TINYINT, m_expanded.wB_bb),
                            (4::TINYINT, m_expanded.wR_bb),
                            (5::TINYINT, m_expanded.wQ_bb),
                            (6::TINYINT, m_expanded.wK_bb),
                            (-1::TINYINT, m_expanded.bP_bb),
                            (-2::TINYINT, m_expanded.bN_bb),
                            (-3::TINYINT, m_expanded.bB_bb),
                            (-4::TINYINT, m_expanded.bR_bb),
                            (-5::TINYINT, m_expanded.bQ_bb),
                            (-6::TINYINT, m_expanded.bK_bb)
                        ) AS pb(p, bb)
                    WHERE pst.piece = pb.p AND (((pb.bb) & (1::UBIGINT << pst.square::INTEGER)) <> 0)
        ), 0)
    )::INTEGER as static_eval,
            NULL::INTEGER as minimax_eval,
            xor(COALESCE((SELECT bit_xor(zc.val) FROM zobrist_constants zc WHERE (
        (zc.piece = 6 AND (((m_expanded.wK_bb) & (1::UBIGINT << zc.square::INTEGER)) <> 0)) OR
        (zc.piece = 5 AND (((m_expanded.wQ_bb) & (1::UBIGINT << zc.square::INTEGER)) <> 0)) OR
        (zc.piece = 4 AND (((m_expanded.wR_bb) & (1::UBIGINT << zc.square::INTEGER)) <> 0)) OR
        (zc.piece = 3 AND (((m_expanded.wB_bb) & (1::UBIGINT << zc.square::INTEGER)) <> 0)) OR
        (zc.piece = 2 AND (((m_expanded.wN_bb) & (1::UBIGINT << zc.square::INTEGER)) <> 0)) OR
        (zc.piece = 1 AND (((m_expanded.wP_bb) & (1::UBIGINT << zc.square::INTEGER)) <> 0)) OR
        (zc.piece = -6 AND (((m_expanded.bK_bb) & (1::UBIGINT << zc.square::INTEGER)) <> 0)) OR
        (zc.piece = -5 AND (((m_expanded.bQ_bb) & (1::UBIGINT << zc.square::INTEGER)) <> 0)) OR
        (zc.piece = -4 AND (((m_expanded.bR_bb) & (1::UBIGINT << zc.square::INTEGER)) <> 0)) OR
        (zc.piece = -3 AND (((m_expanded.bB_bb) & (1::UBIGINT << zc.square::INTEGER)) <> 0)) OR
        (zc.piece = -2 AND (((m_expanded.bN_bb) & (1::UBIGINT << zc.square::INTEGER)) <> 0)) OR
        (zc.piece = -1 AND (((m_expanded.bP_bb) & (1::UBIGINT << zc.square::INTEGER)) <> 0))
    )), 0::UBIGINT), xor(COALESCE((SELECT zm.val FROM zobrist_misc zm WHERE zm.type = 'turn' AND m_expanded.active_turn = -1), 0::UBIGINT), COALESCE((SELECT bit_xor(zm.val) FROM zobrist_misc zm WHERE zm.type = 'castle' AND ((((m_expanded.castling_rights) & (1::UBIGINT << zm.idx::INTEGER)) <> 0))), 0::UBIGINT))) as board_hash,
            m_expanded.wK_sq, m_expanded.bK_sq, m_expanded.all_pieces,
            m_expanded.my_pieces, m_expanded.opponent_pieces,
            m_expanded.active_king_sq, m_expanded.passive_king_sq,
            0::TINYINT as is_check
        FROM (
            SELECT 
                *,
                ((wK_bb) | (wQ_bb) | (wR_bb) | (wB_bb) | (wN_bb) | (wP_bb) | (bK_bb) | (bQ_bb) | (bR_bb) | (bB_bb) | (bN_bb) | (bP_bb)) as all_pieces,
                (CASE WHEN active_turn = 1 THEN ((wK_bb) | (wQ_bb) | (wR_bb) | (wB_bb) | (wN_bb) | (wP_bb)) ELSE ((bK_bb) | (bQ_bb) | (bR_bb) | (bB_bb) | (bN_bb) | (bP_bb)) END) as my_pieces,
                (CASE WHEN active_turn = 1 THEN ((bK_bb) | (bQ_bb) | (bR_bb) | (bB_bb) | (bN_bb) | (bP_bb)) ELSE ((wK_bb) | (wQ_bb) | (wR_bb) | (wB_bb) | (wN_bb) | (wP_bb)) END) as opponent_pieces,
                (CASE WHEN active_turn = 1 THEN wK_sq ELSE bK_sq END)::TINYINT as active_king_sq,
                (CASE WHEN active_turn = 1 THEN bK_sq ELSE wK_sq END)::TINYINT as passive_king_sq
            FROM (
                SELECT 
                    s_in.id as parent_id, s_in.depth + 1 as depth,
                    m_in.from_sq, m_in.to_sq, m_in.piece, m_in.is_castle, m_in.is_promo,
                    (s_in.active_turn * -1) as active_turn,
                    (CASE WHEN m_in.from_sq = 4 OR m_in.to_sq = 4 THEN (s_in.castling_rights & 12) WHEN m_in.from_sq = 7 OR m_in.to_sq = 7 THEN (s_in.castling_rights & 14) WHEN m_in.from_sq = 0 OR m_in.to_sq = 0 THEN (s_in.castling_rights & 13) WHEN m_in.from_sq = 60 OR m_in.to_sq = 60 THEN (s_in.castling_rights & 3) WHEN m_in.from_sq = 63 OR m_in.to_sq = 63 THEN (s_in.castling_rights & 11) WHEN m_in.from_sq = 56 OR m_in.to_sq = 56 THEN (s_in.castling_rights & 7) ELSE s_in.castling_rights END) as castling_rights,
                    (CASE 
        WHEN ((s_in.wP_bb) & (((1::UBIGINT) << m_in.to_sq::INTEGER))) <> 0 THEN 1
        WHEN ((s_in.wN_bb) & (((1::UBIGINT) << m_in.to_sq::INTEGER))) <> 0 THEN 2
        WHEN ((s_in.wB_bb) & (((1::UBIGINT) << m_in.to_sq::INTEGER))) <> 0 THEN 3
        WHEN ((s_in.wR_bb) & (((1::UBIGINT) << m_in.to_sq::INTEGER))) <> 0 THEN 4
        WHEN ((s_in.wQ_bb) & (((1::UBIGINT) << m_in.to_sq::INTEGER))) <> 0 THEN 5
        WHEN ((s_in.wK_bb) & (((1::UBIGINT) << m_in.to_sq::INTEGER))) <> 0 THEN 6
        WHEN ((s_in.bK_bb) & (((1::UBIGINT) << m_in.to_sq::INTEGER))) <> 0 THEN -6
        WHEN ((s_in.bQ_bb) & (((1::UBIGINT) << m_in.to_sq::INTEGER))) <> 0 THEN -5
        WHEN ((s_in.bR_bb) & (((1::UBIGINT) << m_in.to_sq::INTEGER))) <> 0 THEN -4
        WHEN ((s_in.bB_bb) & (((1::UBIGINT) << m_in.to_sq::INTEGER))) <> 0 THEN -3
        WHEN ((s_in.bN_bb) & (((1::UBIGINT) << m_in.to_sq::INTEGER))) <> 0 THEN -2
        WHEN ((s_in.bP_bb) & (((1::UBIGINT) << m_in.to_sq::INTEGER))) <> 0 THEN -1
        ELSE NULL END) as captured_piece,
                    m_in.is_capture::TINYINT as is_capture,
                    xor(s_in.wP_bb, xor((((1::UBIGINT) << m_in.from_sq::INTEGER) & pm_d.mask_wP), xor((((1::UBIGINT) << m_in.to_sq::INTEGER) & pm_a.mask_wP), (((1::UBIGINT) << m_in.to_sq::INTEGER) & COALESCE(pm_c.mask_wP, 0::UBIGINT))))) AS wP_bb,
        xor(s_in.wN_bb, xor((((1::UBIGINT) << m_in.from_sq::INTEGER) & pm_d.mask_wN), xor((((1::UBIGINT) << m_in.to_sq::INTEGER) & pm_a.mask_wN), (((1::UBIGINT) << m_in.to_sq::INTEGER) & COALESCE(pm_c.mask_wN, 0::UBIGINT))))) AS wN_bb,
        xor(s_in.wB_bb, xor((((1::UBIGINT) << m_in.from_sq::INTEGER) & pm_d.mask_wB), xor((((1::UBIGINT) << m_in.to_sq::INTEGER) & pm_a.mask_wB), (((1::UBIGINT) << m_in.to_sq::INTEGER) & COALESCE(pm_c.mask_wB, 0::UBIGINT))))) AS wB_bb,
        xor(s_in.wR_bb, xor((((1::UBIGINT) << m_in.from_sq::INTEGER) & pm_d.mask_wR), xor((((1::UBIGINT) << m_in.to_sq::INTEGER) & pm_a.mask_wR), xor((((1::UBIGINT) << m_in.to_sq::INTEGER) & COALESCE(pm_c.mask_wR, 0::UBIGINT)), (CASE WHEN m_in.is_castle = 1 AND m_in.piece = 6 THEN xor(((1::UBIGINT) << (CASE 
                WHEN m_in.to_sq = 6 THEN 7::TINYINT
                WHEN m_in.to_sq = 2 THEN 0::TINYINT
                WHEN m_in.to_sq = 62 THEN 63::TINYINT
                WHEN m_in.to_sq = 58 THEN 56::TINYINT
                ELSE m_in.from_sq END)::INTEGER), ((1::UBIGINT) << (CASE 
                WHEN m_in.to_sq = 6 THEN 5::TINYINT 
                WHEN m_in.to_sq = 2 THEN 3::TINYINT 
                WHEN m_in.to_sq = 62 THEN 61::TINYINT 
                WHEN m_in.to_sq = 58 THEN 59::TINYINT 
                ELSE m_in.from_sq END)::INTEGER)) ELSE 0 END))))) AS wR_bb,
        xor(s_in.wQ_bb, xor((((1::UBIGINT) << m_in.from_sq::INTEGER) & pm_d.mask_wQ), xor((((1::UBIGINT) << m_in.to_sq::INTEGER) & pm_a.mask_wQ), (((1::UBIGINT) << m_in.to_sq::INTEGER) & COALESCE(pm_c.mask_wQ, 0::UBIGINT))))) AS wQ_bb,
        xor(s_in.wK_bb, xor((((1::UBIGINT) << m_in.from_sq::INTEGER) & pm_d.mask_wK), xor((((1::UBIGINT) << m_in.to_sq::INTEGER) & pm_a.mask_wK), (((1::UBIGINT) << m_in.to_sq::INTEGER) & COALESCE(pm_c.mask_wK, 0::UBIGINT))))) AS wK_bb,
        xor(s_in.bP_bb, xor((((1::UBIGINT) << m_in.from_sq::INTEGER) & pm_d.mask_bP), xor((((1::UBIGINT) << m_in.to_sq::INTEGER) & pm_a.mask_bP), (((1::UBIGINT) << m_in.to_sq::INTEGER) & COALESCE(pm_c.mask_bP, 0::UBIGINT))))) AS bP_bb,
        xor(s_in.bN_bb, xor((((1::UBIGINT) << m_in.from_sq::INTEGER) & pm_d.mask_bN), xor((((1::UBIGINT) << m_in.to_sq::INTEGER) & pm_a.mask_bN), (((1::UBIGINT) << m_in.to_sq::INTEGER) & COALESCE(pm_c.mask_bN, 0::UBIGINT))))) AS bN_bb,
        xor(s_in.bB_bb, xor((((1::UBIGINT) << m_in.from_sq::INTEGER) & pm_d.mask_bB), xor((((1::UBIGINT) << m_in.to_sq::INTEGER) & pm_a.mask_bB), (((1::UBIGINT) << m_in.to_sq::INTEGER) & COALESCE(pm_c.mask_bB, 0::UBIGINT))))) AS bB_bb,
        xor(s_in.bR_bb, xor((((1::UBIGINT) << m_in.from_sq::INTEGER) & pm_d.mask_bR), xor((((1::UBIGINT) << m_in.to_sq::INTEGER) & pm_a.mask_bR), xor((((1::UBIGINT) << m_in.to_sq::INTEGER) & COALESCE(pm_c.mask_bR, 0::UBIGINT)), (CASE WHEN m_in.is_castle = 1 AND m_in.piece = -6 THEN xor(((1::UBIGINT) << (CASE 
                WHEN m_in.to_sq = 6 THEN 7::TINYINT
                WHEN m_in.to_sq = 2 THEN 0::TINYINT
                WHEN m_in.to_sq = 62 THEN 63::TINYINT
                WHEN m_in.to_sq = 58 THEN 56::TINYINT
                ELSE m_in.from_sq END)::INTEGER), ((1::UBIGINT) << (CASE 
                WHEN m_in.to_sq = 6 THEN 5::TINYINT 
                WHEN m_in.to_sq = 2 THEN 3::TINYINT 
                WHEN m_in.to_sq = 62 THEN 61::TINYINT 
                WHEN m_in.to_sq = 58 THEN 59::TINYINT 
                ELSE m_in.from_sq END)::INTEGER)) ELSE 0 END))))) AS bR_bb,
        xor(s_in.bQ_bb, xor((((1::UBIGINT) << m_in.from_sq::INTEGER) & pm_d.mask_bQ), xor((((1::UBIGINT) << m_in.to_sq::INTEGER) & pm_a.mask_bQ), (((1::UBIGINT) << m_in.to_sq::INTEGER) & COALESCE(pm_c.mask_bQ, 0::UBIGINT))))) AS bQ_bb,
        xor(s_in.bK_bb, xor((((1::UBIGINT) << m_in.from_sq::INTEGER) & pm_d.mask_bK), xor((((1::UBIGINT) << m_in.to_sq::INTEGER) & pm_a.mask_bK), (((1::UBIGINT) << m_in.to_sq::INTEGER) & COALESCE(pm_c.mask_bK, 0::UBIGINT))))) AS bK_bb,
                    (CASE WHEN m_in.piece = 6 THEN m_in.to_sq ELSE s_in.wK_sq END)::TINYINT as wK_sq,
                    (CASE WHEN m_in.piece = -6 THEN m_in.to_sq ELSE s_in.bK_sq END)::TINYINT as bK_sq,
                    s_in.active_turn as active_turn_parent
                FROM search_tree s_in
                JOIN LATERAL ( 
        /* =========================================================
           PART 1: SLIDERS & LEAPERS (N, B, R, Q, K)
           Strategy: Explode Bitboards (LATERAL) -> Hash Join Mobility
           ========================================================= */
        SELECT 
            s_in.id as parent_id, 
            sq.i as from_sq, 
            mp.target_sq AS to_sq, 
            (pt.piece * s_in.active_turn)::TINYINT as piece,
            0::TINYINT as is_castle, 
            0::TINYINT as is_promo,
            
            -- [Capture Logic]
            (CASE WHEN (((s_in.opponent_pieces) & (1::UBIGINT << mp.target_sq::INTEGER)) <> 0) THEN 1 ELSE 0 END)::TINYINT as is_capture,
            (COALESCE((CASE 
        WHEN ((s_in.wP_bb) & (((1::UBIGINT) << mp.target_sq::INTEGER))) <> 0 THEN 1
        WHEN ((s_in.wN_bb) & (((1::UBIGINT) << mp.target_sq::INTEGER))) <> 0 THEN 2
        WHEN ((s_in.wB_bb) & (((1::UBIGINT) << mp.target_sq::INTEGER))) <> 0 THEN 3
        WHEN ((s_in.wR_bb) & (((1::UBIGINT) << mp.target_sq::INTEGER))) <> 0 THEN 4
        WHEN ((s_in.wQ_bb) & (((1::UBIGINT) << mp.target_sq::INTEGER))) <> 0 THEN 5
        WHEN ((s_in.wK_bb) & (((1::UBIGINT) << mp.target_sq::INTEGER))) <> 0 THEN 6
        WHEN ((s_in.bK_bb) & (((1::UBIGINT) << mp.target_sq::INTEGER))) <> 0 THEN -6
        WHEN ((s_in.bQ_bb) & (((1::UBIGINT) << mp.target_sq::INTEGER))) <> 0 THEN -5
        WHEN ((s_in.bR_bb) & (((1::UBIGINT) << mp.target_sq::INTEGER))) <> 0 THEN -4
        WHEN ((s_in.bB_bb) & (((1::UBIGINT) << mp.target_sq::INTEGER))) <> 0 THEN -3
        WHEN ((s_in.bN_bb) & (((1::UBIGINT) << mp.target_sq::INTEGER))) <> 0 THEN -2
        WHEN ((s_in.bP_bb) & (((1::UBIGINT) << mp.target_sq::INTEGER))) <> 0 THEN -1
        ELSE NULL END), 0))::TINYINT as captured_piece
        
        FROM squares sq
        -- 1. Explode: Find occupied squares and identify pieces using LATERAL
        JOIN LATERAL (
            SELECT (CASE WHEN s_in.active_turn = 1 THEN
                (CASE 
                    WHEN (((s_in.wN_bb) & (1::UBIGINT << sq.i::INTEGER)) <> 0) THEN 2
                    WHEN (((s_in.wB_bb) & (1::UBIGINT << sq.i::INTEGER)) <> 0) THEN 3
                    WHEN (((s_in.wR_bb) & (1::UBIGINT << sq.i::INTEGER)) <> 0) THEN 4
                    WHEN (((s_in.wQ_bb) & (1::UBIGINT << sq.i::INTEGER)) <> 0) THEN 5
                    WHEN (((s_in.wK_bb) & (1::UBIGINT << sq.i::INTEGER)) <> 0) THEN 6
                END)
            ELSE
                (CASE 
                    WHEN (((s_in.bN_bb) & (1::UBIGINT << sq.i::INTEGER)) <> 0) THEN 2
                    WHEN (((s_in.bB_bb) & (1::UBIGINT << sq.i::INTEGER)) <> 0) THEN 3
                    WHEN (((s_in.bR_bb) & (1::UBIGINT << sq.i::INTEGER)) <> 0) THEN 4
                    WHEN (((s_in.bQ_bb) & (1::UBIGINT << sq.i::INTEGER)) <> 0) THEN 5
                    WHEN (((s_in.bK_bb) & (1::UBIGINT << sq.i::INTEGER)) <> 0) THEN 6
                END)
            END) as piece
        ) pt ON pt.piece IS NOT NULL
        
        -- 2. Join Mobility
        JOIN mobility_precomputed mp ON mp.from_sq = sq.i AND mp.piece = pt.piece
        
        WHERE 
        -- Blockers
        (mp.ray_mask & s_in.all_pieces) = 0 
        -- Friendly Fire
        AND NOT (((s_in.my_pieces) & (1::UBIGINT << mp.target_sq::INTEGER)) <> 0)

        UNION ALL

        /* =========================================================
           PART 2: PAWNS
           Strategy: Global Bitwise Shifts
           ========================================================= */
        -- SINGLE PUSH (White: << 8, Black: >> 8)
        SELECT 
            s_in.id, sq.i - (CASE WHEN s_in.active_turn = 1 THEN 8 ELSE -8 END), sq.i,
            (CASE WHEN s_in.active_turn = 1 THEN 1 ELSE -1 END)::TINYINT,
            0, 
            (CASE WHEN (sq.i >> 3) = (CASE WHEN s_in.active_turn = 1 THEN 7 ELSE 0 END) THEN 1 ELSE 0 END), -- Promo
            0, 0
        FROM squares sq
        WHERE s_in.active_turn = 1
          AND ((((CAST((CAST(s_in.wP_bb AS HUGEINT) << 8) & CAST(18446744073709551615 AS HUGEINT) AS UBIGINT) & ~s_in.all_pieces)) & (1::UBIGINT << sq.i::INTEGER)) <> 0)
        UNION ALL
        SELECT 
            s_in.id, sq.i + 8, sq.i,
            -1, 0, 
            (CASE WHEN (sq.i >> 3) = 0 THEN 1 ELSE 0 END), 0, 0
        FROM squares sq
        WHERE s_in.active_turn = -1
          AND (((((s_in.bP_bb >> 8) & ~s_in.all_pieces)) & (1::UBIGINT << sq.i::INTEGER)) <> 0)

        UNION ALL

        -- DOUBLE PUSH
        SELECT 
            s_in.id, sq.i - 16, sq.i, 1, 0, 0, 0, 0
        FROM squares sq
        WHERE s_in.active_turn = 1
          AND (((CAST(((CAST((s_in.wP_bb & CAST(65280 AS UBIGINT)) AS HUGEINT) << 16) & CAST(18446744073709551615 AS HUGEINT)) AS UBIGINT) & ~s_in.all_pieces & ~CAST(((CAST(s_in.all_pieces AS HUGEINT) << 8) & CAST(18446744073709551615 AS HUGEINT)) AS UBIGINT)) & (1::UBIGINT << sq.i::INTEGER)) <> 0)
        UNION ALL
        SELECT 
            s_in.id, sq.i + 16, sq.i, -1, 0, 0, 0, 0
        FROM squares sq
        WHERE s_in.active_turn = -1
          AND ((((((s_in.bP_bb & CAST(71776119061217280 AS UBIGINT))) >> 16) & ~s_in.all_pieces & ~(s_in.all_pieces >> 8)) & (1::UBIGINT << sq.i::INTEGER)) <> 0)

        UNION ALL

        -- CAPTURES (Left/Right)
        
        -- W_L (7)
        SELECT s_in.id, sq.i - 7, sq.i, 1, 0, (CASE WHEN (sq.i >> 3) = 7 THEN 1 ELSE 0 END), 1, 
               CAST(COALESCE((CASE 
        WHEN ((s_in.wP_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN 1
        WHEN ((s_in.wN_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN 2
        WHEN ((s_in.wB_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN 3
        WHEN ((s_in.wR_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN 4
        WHEN ((s_in.wQ_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN 5
        WHEN ((s_in.wK_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN 6
        WHEN ((s_in.bK_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN -6
        WHEN ((s_in.bQ_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN -5
        WHEN ((s_in.bR_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN -4
        WHEN ((s_in.bB_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN -3
        WHEN ((s_in.bN_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN -2
        WHEN ((s_in.bP_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN -1
        ELSE NULL END), 0) AS TINYINT)
        FROM squares sq LEFT JOIN LATERAL (SELECT sq.i as to_sq) sq_to ON true
        WHERE s_in.active_turn = 1
          AND (((CAST(((CAST((s_in.wP_bb & ~CAST(72340172838076673 AS UBIGINT)) AS HUGEINT) << 7) & CAST(18446744073709551615 AS HUGEINT)) AS UBIGINT) & s_in.opponent_pieces) & (1::UBIGINT << sq.i::INTEGER)) <> 0)
          
        UNION ALL
        -- W_R (9)
        SELECT s_in.id, sq.i - 9, sq.i, 1, 0, (CASE WHEN (sq.i >> 3) = 7 THEN 1 ELSE 0 END), 1,
               CAST(COALESCE((CASE 
        WHEN ((s_in.wP_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN 1
        WHEN ((s_in.wN_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN 2
        WHEN ((s_in.wB_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN 3
        WHEN ((s_in.wR_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN 4
        WHEN ((s_in.wQ_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN 5
        WHEN ((s_in.wK_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN 6
        WHEN ((s_in.bK_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN -6
        WHEN ((s_in.bQ_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN -5
        WHEN ((s_in.bR_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN -4
        WHEN ((s_in.bB_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN -3
        WHEN ((s_in.bN_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN -2
        WHEN ((s_in.bP_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN -1
        ELSE NULL END), 0) AS TINYINT)
        FROM squares sq LEFT JOIN LATERAL (SELECT sq.i as to_sq) sq_to ON true
        WHERE s_in.active_turn = 1
          AND (((CAST(((CAST((s_in.wP_bb & ~CAST(9259542123273830528 AS UBIGINT)) AS HUGEINT) << 9) & CAST(18446744073709551615 AS HUGEINT)) AS UBIGINT) & s_in.opponent_pieces) & (1::UBIGINT << sq.i::INTEGER)) <> 0)

        UNION ALL
        -- B_L (>> 9) (Mirror of W_R)
        SELECT s_in.id, sq.i + 9, sq.i, -1, 0, (CASE WHEN (sq.i >> 3) = 0 THEN 1 ELSE 0 END), 1,
               CAST(COALESCE((CASE 
        WHEN ((s_in.wP_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN 1
        WHEN ((s_in.wN_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN 2
        WHEN ((s_in.wB_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN 3
        WHEN ((s_in.wR_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN 4
        WHEN ((s_in.wQ_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN 5
        WHEN ((s_in.wK_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN 6
        WHEN ((s_in.bK_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN -6
        WHEN ((s_in.bQ_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN -5
        WHEN ((s_in.bR_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN -4
        WHEN ((s_in.bB_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN -3
        WHEN ((s_in.bN_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN -2
        WHEN ((s_in.bP_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN -1
        ELSE NULL END), 0) AS TINYINT)
        FROM squares sq LEFT JOIN LATERAL (SELECT sq.i as to_sq) sq_to ON true
        WHERE s_in.active_turn = -1
          AND ((((((s_in.bP_bb & ~CAST(72340172838076673 AS UBIGINT))) >> 9) & s_in.opponent_pieces) & (1::UBIGINT << sq.i::INTEGER)) <> 0)

        UNION ALL
        -- B_R (>> 7) (Mirror of W_L)
        SELECT s_in.id, sq.i + 7, sq.i, -1, 0, (CASE WHEN (sq.i >> 3) = 0 THEN 1 ELSE 0 END), 1,
               CAST(COALESCE((CASE 
        WHEN ((s_in.wP_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN 1
        WHEN ((s_in.wN_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN 2
        WHEN ((s_in.wB_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN 3
        WHEN ((s_in.wR_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN 4
        WHEN ((s_in.wQ_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN 5
        WHEN ((s_in.wK_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN 6
        WHEN ((s_in.bK_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN -6
        WHEN ((s_in.bQ_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN -5
        WHEN ((s_in.bR_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN -4
        WHEN ((s_in.bB_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN -3
        WHEN ((s_in.bN_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN -2
        WHEN ((s_in.bP_bb) & (((1::UBIGINT) << sq_to.to_sq::INTEGER))) <> 0 THEN -1
        ELSE NULL END), 0) AS TINYINT)
        FROM squares sq LEFT JOIN LATERAL (SELECT sq.i as to_sq) sq_to ON true
        WHERE s_in.active_turn = -1
          AND ((((((s_in.bP_bb & ~CAST(9259542123273830528 AS UBIGINT))) >> 7) & s_in.opponent_pieces) & (1::UBIGINT << sq.i::INTEGER)) <> 0)

        UNION ALL

        /* =========================================================
           PART 3: CASTLING (Rights & Path Verification)
           Strategy: Subquery Barrier & Consolidated Attack Detection
           ========================================================= */
        SELECT q.parent_id, q.from_sq, q.to_sq, 
               q.piece, 
               1, 0, 0, 0
        FROM (
            SELECT s_in.id as parent_id, cv.from_sq, cv.to_sq, 
                   CAST(CASE WHEN cv.turn = 1 THEN 6 ELSE -6 END AS TINYINT) as piece,
                   cv.s1, cv.s2, cv.s3, cv.turn,
                   s_in.wP_bb, s_in.wN_bb, s_in.wK_bb, s_in.wB_bb, s_in.wR_bb, s_in.wQ_bb,
                   s_in.bP_bb, s_in.bN_bb, s_in.bK_bb, s_in.bB_bb, s_in.bR_bb, s_in.bQ_bb,
                   s_in.all_pieces
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
            
            WHERE s_in.active_turn = cv.turn
              AND (s_in.castling_rights & cv.rights::HUGEINT) <> 0
              AND ((((CASE WHEN cv.turn = 1 THEN s_in.wR_bb ELSE s_in.bR_bb END)) & (1::UBIGINT << cv.rook_sq::INTEGER)) <> 0)
              AND NOT (((s_in.all_pieces) & (1::UBIGINT << cv.e1::INTEGER)) <> 0)
              AND NOT (((s_in.all_pieces) & (1::UBIGINT << cv.e2::INTEGER)) <> 0)
              AND (cv.e3 = -1 OR NOT (((s_in.all_pieces) & (1::UBIGINT << cv.e3::INTEGER)) <> 0))
        ) q
        WHERE NOT ((EXISTS (
            SELECT 1 
            FROM attacks_precomputed ap 
            WHERE ap.square IN (q.s1, q.s2, q.s3) 
            AND (
                ((q.turn * -1) = -1 AND (((q.bP_bb) & (ap.black_pawn_mask)) <> 0 OR ((q.bN_bb) & (ap.knight_mask)) <> 0 OR ((q.bK_bb) & (ap.king_mask)) <> 0))
                OR
                ((q.turn * -1) = 1 AND (((q.wP_bb) & (ap.white_pawn_mask)) <> 0 OR ((q.wN_bb) & (ap.knight_mask)) <> 0 OR ((q.wK_bb) & (ap.king_mask)) <> 0))
            )
            
            UNION ALL
            
            SELECT 1 
            FROM mobility_precomputed mp 
            WHERE mp.target_sq IN (q.s1, q.s2, q.s3) 
            AND mp.piece IN (3, 4, 5) 
            AND (
                ((q.turn * -1) = -1 AND (
                    (mp.piece = 3 AND (((q.bB_bb) & (1::UBIGINT << mp.from_sq::INTEGER)) <> 0) AND (mp.ray_mask & (((q.wK_bb) | (q.wQ_bb) | (q.wR_bb) | (q.wB_bb) | (q.wN_bb) | (q.wP_bb) | (q.bK_bb) | (q.bQ_bb) | (q.bR_bb) | (q.bB_bb) | (q.bN_bb) | (q.bP_bb)))) = 0) OR
                    (mp.piece = 4 AND (((q.bR_bb) & (1::UBIGINT << mp.from_sq::INTEGER)) <> 0) AND (mp.ray_mask & (((q.wK_bb) | (q.wQ_bb) | (q.wR_bb) | (q.wB_bb) | (q.wN_bb) | (q.wP_bb) | (q.bK_bb) | (q.bQ_bb) | (q.bR_bb) | (q.bB_bb) | (q.bN_bb) | (q.bP_bb)))) = 0) OR
                    (mp.piece = 5 AND (((q.bQ_bb) & (1::UBIGINT << mp.from_sq::INTEGER)) <> 0) AND (mp.ray_mask & (((q.wK_bb) | (q.wQ_bb) | (q.wR_bb) | (q.wB_bb) | (q.wN_bb) | (q.wP_bb) | (q.bK_bb) | (q.bQ_bb) | (q.bR_bb) | (q.bB_bb) | (q.bN_bb) | (q.bP_bb)))) = 0)
                ))
                OR
                ((q.turn * -1) = 1 AND (
                    (mp.piece = 3 AND (((q.wB_bb) & (1::UBIGINT << mp.from_sq::INTEGER)) <> 0) AND (mp.ray_mask & (((q.wK_bb) | (q.wQ_bb) | (q.wR_bb) | (q.wB_bb) | (q.wN_bb) | (q.wP_bb) | (q.bK_bb) | (q.bQ_bb) | (q.bR_bb) | (q.bB_bb) | (q.bN_bb) | (q.bP_bb)))) = 0) OR
                    (mp.piece = 4 AND (((q.wR_bb) & (1::UBIGINT << mp.from_sq::INTEGER)) <> 0) AND (mp.ray_mask & (((q.wK_bb) | (q.wQ_bb) | (q.wR_bb) | (q.wB_bb) | (q.wN_bb) | (q.wP_bb) | (q.bK_bb) | (q.bQ_bb) | (q.bR_bb) | (q.bB_bb) | (q.bN_bb) | (q.bP_bb)))) = 0) OR
                    (mp.piece = 5 AND (((q.wQ_bb) & (1::UBIGINT << mp.from_sq::INTEGER)) <> 0) AND (mp.ray_mask & (((q.wK_bb) | (q.wQ_bb) | (q.wR_bb) | (q.wB_bb) | (q.wN_bb) | (q.wP_bb) | (q.bK_bb) | (q.bQ_bb) | (q.bR_bb) | (q.bB_bb) | (q.bN_bb) | (q.bP_bb)))) = 0)
                ))
            )
        )))
         ) m_in ON true
                LEFT JOIN piece_masks pm_d ON pm_d.piece = m_in.piece
                LEFT JOIN piece_masks pm_a ON pm_a.piece = (CASE WHEN m_in.is_promo = 1 THEN (CASE WHEN s_in.active_turn = 1 THEN 5 ELSE -5 END) ELSE m_in.piece END)
                LEFT JOIN piece_masks pm_c ON pm_c.piece = (CASE 
        WHEN ((s_in.wP_bb) & (((1::UBIGINT) << m_in.to_sq::INTEGER))) <> 0 THEN 1
        WHEN ((s_in.wN_bb) & (((1::UBIGINT) << m_in.to_sq::INTEGER))) <> 0 THEN 2
        WHEN ((s_in.wB_bb) & (((1::UBIGINT) << m_in.to_sq::INTEGER))) <> 0 THEN 3
        WHEN ((s_in.wR_bb) & (((1::UBIGINT) << m_in.to_sq::INTEGER))) <> 0 THEN 4
        WHEN ((s_in.wQ_bb) & (((1::UBIGINT) << m_in.to_sq::INTEGER))) <> 0 THEN 5
        WHEN ((s_in.wK_bb) & (((1::UBIGINT) << m_in.to_sq::INTEGER))) <> 0 THEN 6
        WHEN ((s_in.bK_bb) & (((1::UBIGINT) << m_in.to_sq::INTEGER))) <> 0 THEN -6
        WHEN ((s_in.bQ_bb) & (((1::UBIGINT) << m_in.to_sq::INTEGER))) <> 0 THEN -5
        WHEN ((s_in.bR_bb) & (((1::UBIGINT) << m_in.to_sq::INTEGER))) <> 0 THEN -4
        WHEN ((s_in.bB_bb) & (((1::UBIGINT) << m_in.to_sq::INTEGER))) <> 0 THEN -3
        WHEN ((s_in.bN_bb) & (((1::UBIGINT) << m_in.to_sq::INTEGER))) <> 0 THEN -2
        WHEN ((s_in.bP_bb) & (((1::UBIGINT) << m_in.to_sq::INTEGER))) <> 0 THEN -1
        ELSE NULL END)
                WHERE s_in.depth < 3
                
            ) m_inner
        ) m_expanded
        WHERE NOT ((EXISTS (
            SELECT 1 
            FROM attacks_precomputed ap 
            WHERE ap.square = (CASE WHEN m_expanded.active_turn_parent = 1 THEN m_expanded.wK_sq ELSE m_expanded.bK_sq END) 
            AND (
                ((m_expanded.active_turn_parent * -1) = -1 AND (((m_expanded.bP_bb) & (ap.black_pawn_mask)) <> 0 OR ((m_expanded.bN_bb) & (ap.knight_mask)) <> 0 OR ((m_expanded.bK_bb) & (ap.king_mask)) <> 0))
                OR
                ((m_expanded.active_turn_parent * -1) = 1 AND (((m_expanded.wP_bb) & (ap.white_pawn_mask)) <> 0 OR ((m_expanded.wN_bb) & (ap.knight_mask)) <> 0 OR ((m_expanded.wK_bb) & (ap.king_mask)) <> 0))
            )
            
            UNION ALL
            
            SELECT 1 
            FROM mobility_precomputed mp 
            WHERE mp.target_sq = (CASE WHEN m_expanded.active_turn_parent = 1 THEN m_expanded.wK_sq ELSE m_expanded.bK_sq END) 
            AND mp.piece IN (3, 4, 5) 
            AND (
                ((m_expanded.active_turn_parent * -1) = -1 AND (
                    (mp.piece = 3 AND (((m_expanded.bB_bb) & (1::UBIGINT << mp.from_sq::INTEGER)) <> 0) AND (mp.ray_mask & (m_expanded.all_pieces)) = 0) OR
                    (mp.piece = 4 AND (((m_expanded.bR_bb) & (1::UBIGINT << mp.from_sq::INTEGER)) <> 0) AND (mp.ray_mask & (m_expanded.all_pieces)) = 0) OR
                    (mp.piece = 5 AND (((m_expanded.bQ_bb) & (1::UBIGINT << mp.from_sq::INTEGER)) <> 0) AND (mp.ray_mask & (m_expanded.all_pieces)) = 0)
                ))
                OR
                ((m_expanded.active_turn_parent * -1) = 1 AND (
                    (mp.piece = 3 AND (((m_expanded.wB_bb) & (1::UBIGINT << mp.from_sq::INTEGER)) <> 0) AND (mp.ray_mask & (m_expanded.all_pieces)) = 0) OR
                    (mp.piece = 4 AND (((m_expanded.wR_bb) & (1::UBIGINT << mp.from_sq::INTEGER)) <> 0) AND (mp.ray_mask & (m_expanded.all_pieces)) = 0) OR
                    (mp.piece = 5 AND (((m_expanded.wQ_bb) & (1::UBIGINT << mp.from_sq::INTEGER)) <> 0) AND (mp.ray_mask & (m_expanded.all_pieces)) = 0)
                ))
            )
        )))
    ),
        
        
    /* =========================================================
       MINIMAX BACKPROPAGATION
       ========================================================= */
    minimax AS (
        -- Base Case: Leaf nodes (nodes at target depth or nodes that have no children)
        SELECT id, parent_id, depth, static_eval::INTEGER as minimax_eval, 0 as step
        FROM search_tree s
        WHERE s.depth = 3
           OR NOT EXISTS (SELECT 1 FROM search_tree child WHERE child.parent_id = s.id)
        
        UNION ALL
        
        -- Recursive Step: Evaluate parents at depth = depth - (prev.step + 1)
        SELECT 
            parent.id, parent.parent_id, parent.depth,
            (CASE WHEN parent.active_turn = 1 
                  THEN MAX(child.minimax_eval) 
                  ELSE MIN(child.minimax_eval) 
            END)::INTEGER as minimax_eval,
            prev.step + 1 as step
        FROM (SELECT DISTINCT step FROM minimax) prev
        JOIN search_tree parent ON parent.depth = 3 - (prev.step + 1)
        JOIN recurring.minimax child ON child.parent_id = parent.id
        GROUP BY parent.id, parent.parent_id, parent.depth, parent.active_turn, prev.step
    ),
        
        /* =========================================================
           BEST MOVE SELECTION
           
           Selects the move from the root children (depth=1) that 
           matches the root's minimax value.
           ========================================================= */
            best_move AS (
                SELECT from_sq, to_sq, piece, is_castle, is_promo, total_nodes, minimax_eval
                FROM (
                    SELECT st.from_sq, st.to_sq, st.piece, st.is_castle, st.is_promo, (SELECT COUNT(*) FROM search_tree) as total_nodes,
                           ROW_NUMBER() OVER (ORDER BY m.minimax_eval DESC, st.static_eval DESC, st.from_sq ASC, st.to_sq ASC) as rn,
                           m.minimax_eval
                    FROM search_tree st 
                    JOIN minimax m ON st.id = m.id 
                    WHERE st.depth = 1 
                ) t
                WHERE rn = 1
            )
        SELECT 
            from_sq, to_sq, piece, is_castle, is_promo, total_nodes, minimax_eval 
        FROM best_move ;
    
