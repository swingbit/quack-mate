const BBTYPE = 'UBIGINT';

import { PIECES, TURNS } from '../quackmate-common.js';
import { getPopulateBoardStateTableSQL } from './schema.js';

/**
 * Checks if a specific bit index is set inside a 64-bit integer bitboard.
 */
export function getIsBitSetSQL(bb, sq) {
    return `(((${bb}) & (1::${BBTYPE} << ${sq}::INTEGER)) <> 0)`;
}

/**
 * Groups multiple SQL values or column names into a bitwise OR operation.
 */
export function getOrSQL(...args) {
    if (args.length === 1 && Array.isArray(args[0])) {
        return getOrSQL(...args[0]);
    }
    if (args.length === 0) return '0';
    if (args.length === 1) return args[0];

    return `((${args.join(') | (')}))`;
}

/**
 * Groups multiple SQL values into nested bitwise XOR operations.
 */
export function getXorSQL(...args) {
    if (args.length === 1 && Array.isArray(args[0])) {
        return getXorSQL(...args[0]);
    }
    if (args.length === 0) return '0';
    if (args.length === 1) return args[0];

    let res = args[args.length - 1];
    for (let i = args.length - 2; i >= 0; i--) {
        res = `xor(${args[i]}, ${res})`;
    }
    return res;
}

/**
 * Finds the bit coordinate (0-63) of a single set bit in a bitboard.
 * Designed to extract King squares (which always have exactly one bit set).
 */
export function getBitIndexSQL(val) {
    return `CAST(floor(log2(CAST(CASE WHEN (${val}) = 0 THEN 1 ELSE (${val}) END AS DOUBLE)) + 1e-10) AS TINYINT)`;
}

/**
 * Performs a safe bitwise left-shift.
 */
export function getSafeLSH(val, amount) {
    return `((${val}) << ${amount}::INTEGER)`;
}

/**
 * Fetches the next value of a sequence.
 */
export function getNextValSQL(seqName) {
    return `nextval('${seqName}')`;
}

/**
 * Clears all rows in a table.
 */
export function getClearTableSQL(tableName) {
    return `DELETE FROM ${tableName};`;
}

/**
 * Helper to construct batch SQL inserts.
 */
export function getInsertValuesSQL(tableName, columns, valueLists) {
    if (!valueLists || valueLists.length === 0) return '';
    return `INSERT INTO ${tableName} (${columns}) VALUES ${valueLists.join(', ')};`;
}

/**
 * Returns queries to fetch the complete active board state.
 */
export function getBoardStateSQLs() {
    return [
        'SELECT piece, COALESCE(bitboard, 0) as bitboard FROM piece_bitboards;',
        'SELECT * FROM game_state;'
    ];
}

/**
 * Restores a previously saved board state and updates views.
 */
export function getRevertStateSQL(originalBitboards, originalGameState) {
    const bbInserts = originalBitboards.map(row => 
        `(${row.piece}, ${row.bitboard})`
    ).join(', ');
    
    let gsInsert = '';
    if (originalGameState) {
        const { active_turn, castling_rights, halfmove_clock, fullmove_number } = originalGameState;
        gsInsert = `INSERT INTO game_state (active_turn, castling_rights, halfmove_clock, fullmove_number) VALUES (${active_turn}, ${castling_rights}, ${halfmove_clock}, ${fullmove_number});`;
    }

    return [
        'DELETE FROM piece_bitboards;',
        bbInserts ? `INSERT INTO piece_bitboards (piece, bitboard) VALUES ${bbInserts};` : '',
        'DELETE FROM game_state;',
        gsInsert,
        'DELETE FROM v_board_state;',
        getPopulateBoardStateTableSQL()
    ].filter(q => q.length > 0);
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