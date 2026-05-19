import { 
    PIECES,
    PIECE_VALUES,
    COMPUTED_PST,
    TURNS,
} from '../quackmate-common.js';

import { getIsBitSetSQL } from './utils.js';


export function getStaticEvalSQL(alias, options = {}) {
    if (options.usePST === false) {
        return `(
            COALESCE((
                SELECT SUM(${getPieceValueCaseSQL('pb.p')} * bit_count(pb.bb) * SIGN(pb.p))
                FROM (VALUES 
                        (${PIECES.P}::TINYINT, ${alias}.wP_bb),
                        (${PIECES.N}::TINYINT, ${alias}.wN_bb),
                        (${PIECES.B}::TINYINT, ${alias}.wB_bb),
                        (${PIECES.R}::TINYINT, ${alias}.wR_bb),
                        (${PIECES.Q}::TINYINT, ${alias}.wQ_bb),
                        (${PIECES.K}::TINYINT, ${alias}.wK_bb),
                        (${PIECES.p}::TINYINT, ${alias}.bP_bb),
                        (${PIECES.n}::TINYINT, ${alias}.bN_bb),
                        (${PIECES.b}::TINYINT, ${alias}.bB_bb),
                        (${PIECES.r}::TINYINT, ${alias}.bR_bb),
                        (${PIECES.q}::TINYINT, ${alias}.bQ_bb),
                        (${PIECES.k}::TINYINT, ${alias}.bK_bb)
                    ) AS pb(p, bb)
                WHERE pb.bb > 0
            ), 0)
        )::INTEGER`;
    }
    return `(
        COALESCE((SELECT SUM(SIGN(pst.piece) * (
            CASE ABS(pst.piece)
                WHEN ${PIECES.P} THEN ${PIECE_VALUES[PIECES.P]}
                WHEN ${PIECES.N} THEN ${PIECE_VALUES[PIECES.N]}
                WHEN ${PIECES.B} THEN ${PIECE_VALUES[PIECES.B]}
                WHEN ${PIECES.R} THEN ${PIECE_VALUES[PIECES.R]}
                WHEN ${PIECES.Q} THEN ${PIECE_VALUES[PIECES.Q]}
                WHEN ${PIECES.K} THEN ${PIECE_VALUES[PIECES.K]}
                ELSE 0
            END + pst.value
        ))
                    FROM pst_values pst, (VALUES 
                            (${PIECES.P}::TINYINT, ${alias}.wP_bb),
                            (${PIECES.N}::TINYINT, ${alias}.wN_bb),
                            (${PIECES.B}::TINYINT, ${alias}.wB_bb),
                            (${PIECES.R}::TINYINT, ${alias}.wR_bb),
                            (${PIECES.Q}::TINYINT, ${alias}.wQ_bb),
                            (${PIECES.K}::TINYINT, ${alias}.wK_bb),
                            (${PIECES.p}::TINYINT, ${alias}.bP_bb),
                            (${PIECES.n}::TINYINT, ${alias}.bN_bb),
                            (${PIECES.b}::TINYINT, ${alias}.bB_bb),
                            (${PIECES.r}::TINYINT, ${alias}.bR_bb),
                            (${PIECES.q}::TINYINT, ${alias}.bQ_bb),
                            (${PIECES.k}::TINYINT, ${alias}.bK_bb)
                        ) AS pb(p, bb)
                    WHERE pst.piece = pb.p AND ${getIsBitSetSQL('pb.bb', 'pst.square')}
        ), 0)
    )::INTEGER`;
}



export function getPieceValueCaseSQL(pieceColumn) {
    return `(CASE 
        WHEN ABS(${pieceColumn}) = ${PIECES.Q} THEN ${PIECE_VALUES[PIECES.Q]}
        WHEN ABS(${pieceColumn}) = ${PIECES.R} THEN ${PIECE_VALUES[PIECES.R]}
        WHEN ABS(${pieceColumn}) = ${PIECES.B} THEN ${PIECE_VALUES[PIECES.B]}
        WHEN ABS(${pieceColumn}) = ${PIECES.N} THEN ${PIECE_VALUES[PIECES.N]}
        WHEN ABS(${pieceColumn}) = ${PIECES.P} THEN ${PIECE_VALUES[PIECES.P]}
        WHEN ABS(${pieceColumn}) = ${PIECES.K} THEN 1000 -- Positional King Value
        ELSE 0
    END)`;
}

export function getMVVLVAScoreSQL(capturedPieceCol, attackerPieceCol) {
    return `(ABS(${capturedPieceCol}) * 10 - ABS(${attackerPieceCol}))`;
}

export function getIncrementalEvalSQL(mAlias) {
    return `(
        ${mAlias}.static_eval_parent 
        + (CASE 
            WHEN ${mAlias}.is_capture = 1 AND ${mAlias}.captured_piece <> 0 THEN (
                CASE ABS(${mAlias}.captured_piece)
                    WHEN ${PIECES.P} THEN ${PIECE_VALUES[PIECES.P]}
                    WHEN ${PIECES.N} THEN ${PIECE_VALUES[PIECES.N]}
                    WHEN ${PIECES.B} THEN ${PIECE_VALUES[PIECES.B]}
                    WHEN ${PIECES.R} THEN ${PIECE_VALUES[PIECES.R]}
                    WHEN ${PIECES.Q} THEN ${PIECE_VALUES[PIECES.Q]}
                    WHEN ${PIECES.K} THEN ${PIECE_VALUES[PIECES.K]}
                    ELSE 0
                END
            ) ELSE 0 END) * (${mAlias}.active_turn_parent)
        + (CASE WHEN ${mAlias}.is_promo = 1 THEN (${PIECE_VALUES[PIECES.Q]} - ${PIECE_VALUES[PIECES.P]}) ELSE 0 END) * (${mAlias}.active_turn_parent)
        + COALESCE((SELECT value * SIGN(piece) FROM pst_values WHERE piece = (CASE WHEN ${mAlias}.is_promo = 1 THEN (CASE WHEN ${mAlias}.active_turn_parent = ${TURNS.WHITE} THEN ${PIECES.Q} ELSE ${PIECES.q} END) ELSE ${mAlias}.piece END) AND square = ${mAlias}.to_sq), 0)
        - COALESCE((SELECT value * SIGN(piece) FROM pst_values WHERE piece = ${mAlias}.piece AND square = ${mAlias}.from_sq), 0)
        - CASE WHEN ${mAlias}.is_capture = 1 THEN COALESCE((SELECT value * SIGN(piece) FROM pst_values WHERE piece = ${mAlias}.captured_piece AND square = ${mAlias}.to_sq), 0) ELSE 0 END
        + CASE WHEN ${mAlias}.is_castle = 1 THEN (
            CASE 
                WHEN ${mAlias}.to_sq = 6  THEN (SELECT (r2.value - r1.value) * SIGN(r1.piece) FROM pst_values r1, pst_values r2 WHERE r1.piece = ${PIECES.R} AND r1.square = 7  AND r2.piece = ${PIECES.R} AND r2.square = 5)
                WHEN ${mAlias}.to_sq = 2  THEN (SELECT (r2.value - r1.value) * SIGN(r1.piece) FROM pst_values r1, pst_values r2 WHERE r1.piece = ${PIECES.R} AND r1.square = 0  AND r2.piece = ${PIECES.R} AND r2.square = 3)
                WHEN ${mAlias}.to_sq = 62 THEN (SELECT (r2.value - r1.value) * SIGN(r1.piece) FROM pst_values r1, pst_values r2 WHERE r1.piece = ${PIECES.r} AND r1.square = 63 AND r2.piece = ${PIECES.r} AND r2.square = 61)
                WHEN ${mAlias}.to_sq = 58 THEN (SELECT (r2.value - r1.value) * SIGN(r1.piece) FROM pst_values r1, pst_values r2 WHERE r1.piece = ${PIECES.r} AND r1.square = 56 AND r2.piece = ${PIECES.r} AND r2.square = 59)
                ELSE 0
            END
        ) ELSE 0 END
    )`;
}
