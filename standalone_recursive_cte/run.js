import { DuckDBInstance } from '@duckdb/node-api';
import fs from 'fs';
import path from 'path';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const MIDGAME_FEN = 'r1bqk2r/pppp1ppp/2n2n2/4p3/1bB1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 4 4';
const CHECK_EVASION_FEN = 'rnbqkbnr/ppppp1pp/8/5p1Q/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 2';

function parseFen(fen) {
    const parts = fen.split(' ');
    const piecePlacement = parts[0];
    const activeTurn = parts[1];
    const castlingRights = parts[2];
    const halfMoveClock = parseInt(parts[4], 10) || 0;
    const fullMoveNumber = parseInt(parts[5], 10) || 1;

    const PIECES = {
        'K': 6, 'Q': 5, 'R': 4, 'B': 3, 'N': 2, 'P': 1,
        'k': -6, 'q': -5, 'r': -4, 'b': -3, 'n': -2, 'p': -1
    };

    const bitboards = {
        6: 0n, 5: 0n, 4: 0n, 3: 0n, 2: 0n, 1: 0n,
        '-6': 0n, '-5': 0n, '-4': 0n, '-3': 0n, '-2': 0n, '-1': 0n
    };

    let y = 8;
    for (const rankString of piecePlacement.split('/')) {
        let x = 1;
        for (const char of rankString) {
            const num = parseInt(char, 10);
            if (!isNaN(num)) {
                x += num;
            } else {
                const pieceVal = PIECES[char];
                if (pieceVal !== undefined) {
                    const squareIndex = (y - 1) * 8 + (x - 1);
                    bitboards[pieceVal] |= (1n << BigInt(squareIndex));
                }
                x++;
            }
        }
        y--;
    }

    let castlingRightsInt = 0;
    if (castlingRights.includes('K')) castlingRightsInt |= 1;
    if (castlingRights.includes('Q')) castlingRightsInt |= 2;
    if (castlingRights.includes('k')) castlingRightsInt |= 4;
    if (castlingRights.includes('q')) castlingRightsInt |= 8;

    const turnVal = activeTurn === 'w' ? 1 : -1;

    return {
        bitboards,
        turnVal,
        castlingRightsInt,
        halfMoveClock,
        fullMoveNumber
    };
}

function squareIndexToAlgebraic(index) {
    const file = String.fromCharCode('a'.charCodeAt(0) + (index % 8));
    const rank = Math.floor(index / 8) + 1;
    return `${file}${rank}`;
}

async function loadPosition(connection, fen) {
    const { bitboards, turnVal, castlingRightsInt, halfMoveClock, fullMoveNumber } = parseFen(fen);

    await connection.runAndReadAll(`DELETE FROM piece_bitboards;`);
    await connection.runAndReadAll(`DELETE FROM game_state;`);

    // Insert bitboards
    const bbValues = Object.entries(bitboards)
        .map(([piece, val]) => `(${piece}, ${val.toString()})`)
        .join(', ');
    await connection.runAndReadAll(`INSERT INTO piece_bitboards VALUES ${bbValues};`);

    // Insert game state
    await connection.runAndReadAll(`
        INSERT INTO game_state (active_turn, castling_rights, halfmove_clock, fullmove_number)
        VALUES (${turnVal}, ${castlingRightsInt}, ${halfMoveClock}, ${fullMoveNumber});
    `);

    // Refresh v_board_state
    await connection.runAndReadAll(`DELETE FROM v_board_state;`);
    await connection.runAndReadAll(`
        INSERT INTO v_board_state
        SELECT
            COALESCE((SELECT bitboard FROM piece_bitboards WHERE piece = 6), 0::UBIGINT) as wK_bb,
            COALESCE((SELECT bitboard FROM piece_bitboards WHERE piece = 5), 0::UBIGINT) as wQ_bb,
            COALESCE((SELECT bitboard FROM piece_bitboards WHERE piece = 4), 0::UBIGINT) as wR_bb,
            COALESCE((SELECT bitboard FROM piece_bitboards WHERE piece = 3), 0::UBIGINT) as wB_bb,
            COALESCE((SELECT bitboard FROM piece_bitboards WHERE piece = 2), 0::UBIGINT) as wN_bb,
            COALESCE((SELECT bitboard FROM piece_bitboards WHERE piece = 1), 0::UBIGINT) as wP_bb,
            COALESCE((SELECT bitboard FROM piece_bitboards WHERE piece = -6), 0::UBIGINT) as bK_bb,
            COALESCE((SELECT bitboard FROM piece_bitboards WHERE piece = -5), 0::UBIGINT) as bQ_bb,
            COALESCE((SELECT bitboard FROM piece_bitboards WHERE piece = -4), 0::UBIGINT) as bR_bb,
            COALESCE((SELECT bitboard FROM piece_bitboards WHERE piece = -3), 0::UBIGINT) as bB_bb,
            COALESCE((SELECT bitboard FROM piece_bitboards WHERE piece = -2), 0::UBIGINT) as bN_bb,
            COALESCE((SELECT bitboard FROM piece_bitboards WHERE piece = -1), 0::UBIGINT) as bP_bb,
            COALESCE((SELECT castling_rights FROM game_state ORDER BY fullmove_number DESC, halfmove_clock DESC LIMIT 1), 0::HUGEINT) as castling_rights,
            COALESCE((SELECT active_turn FROM game_state ORDER BY fullmove_number DESC, halfmove_clock DESC LIMIT 1), 1::TINYINT) as active_turn;
    `);
}

async function runSearch(db, connection, searchQuery, fen, label) {
    console.log(`\n--------------------------------------------------`);
    console.log(`Running search for: ${label}`);
    console.log(`FEN: ${fen}`);
    
    // Load FEN state into tables
    await loadPosition(connection, fen);

    // Reset sequence for clean node ID generation
    await connection.runAndReadAll(`DROP SEQUENCE IF EXISTS seq_search_tree_id; CREATE SEQUENCE seq_search_tree_id START WITH 1;`);

    const start = Date.now();
    const reader = await connection.runAndReadAll(searchQuery);
    const rows = reader.getRows();
    const duration = Date.now() - start;

    if (rows.length === 0) {
        console.log("No moves found.");
        return;
    }

    const [from_sq, to_sq, piece, is_castle, is_promo, total_nodes, minimax_eval] = rows[0];
    const moveStr = `${squareIndexToAlgebraic(from_sq)}-${squareIndexToAlgebraic(to_sq)}`;

    console.log(`Best Move    : ${moveStr}`);
    console.log(`Minimax Score: ${minimax_eval}`);
    console.log(`Total Nodes  : ${total_nodes}`);
    console.log(`Search Time  : ${duration}ms`);
}

async function run() {
    console.log("Initializing Standalone DuckDB Chess Engine...");
    const db = await DuckDBInstance.create(':memory:');
    const connection = await db.connect();

    // Check DuckDB version (minimum 1.5 required for recursive CTE recurring syntax)
    const versionReader = await connection.runAndReadAll("SELECT version();");
    const versionStr = versionReader.getRows()[0][0];
    console.log(`DuckDB Version: ${versionStr}`);

    const match = versionStr.match(/v?(\d+)\.(\d+)/);
    if (!match) {
        throw new Error(`Unable to parse DuckDB version string: ${versionStr}`);
    }
    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10);
    if (major < 1 || (major === 1 && minor < 5)) {
        throw new Error(`DuckDB version 1.5 or greater is required for the recursive CTE recurring syntax. Found version: ${versionStr}`);
    }

    console.log("Loading schema.sql...");
    const schemaSql = fs.readFileSync('./schema.sql', 'utf8');
    const schemaQueries = schemaSql.split(';').map(q => q.trim()).filter(q => q.length > 0);
    for (const q of schemaQueries) {
        await connection.runAndReadAll(q);
    }
    console.log("Database schema and precomputed tables initialized.");

    const searchQuery = fs.readFileSync('./query.sql', 'utf8');

    // Run searches from three example positions
    await runSearch(db, connection, searchQuery, START_FEN, "Starting Position (Depth 3)");
    await runSearch(db, connection, searchQuery, MIDGAME_FEN, "Italian Game Middlegame (Depth 3)");
    await runSearch(db, connection, searchQuery, CHECK_EVASION_FEN, "King in Check Evasion (Depth 3)");

    console.log(`\nAll searches completed successfully!`);
}

run().catch(console.error);
