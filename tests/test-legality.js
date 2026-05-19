import { Chess } from 'chess.js';
import { EngineInstance } from '../src/quackmate-node.js';

let engine;

async function getBestMove(fen) {
    return await engine.find_best_move(fen, {
        strategy: 'batched_pvs',
        maxDepth: 4,
        useTranspositionTable: true,
        maxThreads: 4
    });
}

async function playMatch() {
    engine = new EngineInstance();
    await engine.init();

    const chess = new Chess();
    console.log("Starting Legality Match: Native AI vs Native AI (Self-Initialized)");

    let moveCount = 0;
    while (!chess.isGameOver() && moveCount < 100) {
        moveCount++;
        const turn = chess.turn() === 'w' ? "White" : "Black";
        console.log(`\nMove ${moveCount} (${turn}): FEN ${chess.fen()}`);

        try {
            const result = await getBestMove(chess.fen());
            if (result.fen === chess.fen()) {
                console.log("Engine returned NO MOVE (Stalemate/Checkmate/Error)");
                break;
            }

            const move = result.move; // expect {from: 'e2', to: 'e4'}
            console.log(`Engine suggests: ${move.from}-${move.to}`);

            // Validate using standard reference chess.js library
            const moves = chess.moves({ verbose: true });
            const valid = moves.find(m => m.from === move.from && m.to === move.to);

            if (!valid) {
                console.error("!!! ILLEGAL MOVE DETECTED !!!");
                console.error(`Engine tried: ${move.from}-${move.to}`);
                console.error(`Valid moves for ${move.from}:`, moves.filter(m => m.from === move.from).map(m => m.to).join(', '));
                process.exit(1);
            }

            chess.move({ from: move.from, to: move.to });
            console.log("Move accepted.");

        } catch (e) {
            console.error("Error asking engine:", e);
            break;
        }
    }

    console.log("\n======================================");
    console.log("Match ended.");
    if (chess.isCheckmate()) console.log("Checkmate! Move validation complete.");
    if (chess.isDraw()) console.log("Draw! Move validation complete.");
    console.log("======================================\n");
}

console.log("Validate Legality Script Loaded");

try {
    playMatch();
} catch (e) {
    console.error("Top level error:", e);
}
