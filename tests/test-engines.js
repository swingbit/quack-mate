import { init as initNode, EngineInstance } from '../src/quackmate-node.js';
import { init as initStd, find_best_move as findBestMoveStd } from '../src/quackmate-standard.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const MIDGAME_FEN = 'r1bqk2r/pppp1ppp/2n2n2/4p3/1bB1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 4 4';

async function verifyPosition(nodeInstance, positionName, fen, depth, customOptions = {}) {
    console.log(`\nVerifying Position: ${positionName}`);
    console.log(`FEN: ${fen}`);

    // 1. Run Native SQL Engine
    const sqlOptions = {
        strategy: customOptions.strategy || 'standard', 
        maxDepth: depth,
        useAlphaBeta: true,
        useTranspositionTable: false, // Disable TT to ensure deterministic pure minimax comparison
        maxDepthQS: customOptions.maxDepthQS || 0,
        ...customOptions
    };
    if (sqlOptions.strategy === 'batched_pvs') {
        sqlOptions.useTT = false;
        sqlOptions.useRFP = false;
        sqlOptions.useFFP = false;
        sqlOptions.useLMR = false;
        sqlOptions.useLMP = false;
    }
    const nodeRes = await nodeInstance.find_best_move(fen, sqlOptions);
    const nodeMove = (nodeRes.move && typeof nodeRes.move === 'object') ? `${nodeRes.move.from}-${nodeRes.move.to}` : 'none';
    console.log(`-> SQL Engine      : Move = ${nodeMove}, Score = ${nodeRes.score}, Nodes = ${nodeRes.nodes}`);

    // 2. Run Pure JS Standard Engine
    const stdOptions = {
        depth: depth,
        useAlphaBeta: true,
        useTT: false,
        maxDepthQS: customOptions.maxDepthQS || 0,
        useRFP: false,
        useFFP: false,
        useLMR: false,
        useLMP: false
    };
    const stdRes = await findBestMoveStd(fen, stdOptions);
    const stdMove = (stdRes.move && typeof stdRes.move === 'object') ? `${stdRes.move.from}-${stdRes.move.to}` : 'none';
    console.log(`-> JS DFS Engine   : Move = ${stdMove}, Score = ${stdRes.score}, Nodes = ${stdRes.nodes}`);

    // 3. Differential Assertions
    if (nodeMove !== stdMove) {
        throw new Error(`Move mismatch on ${positionName}! SQL got ${nodeMove}, JS got ${stdMove}`);
    }
    const isWhiteTurn = fen.split(' ')[1] === 'w';
    const normalizedStdScore = stdRes.score * (isWhiteTurn ? 1 : -1);
    
    const isNodeMate = nodeRes.score === -Infinity || nodeRes.score === Infinity || Math.abs(nodeRes.score) >= 800000;
    const isStdMate = normalizedStdScore === -Infinity || normalizedStdScore === Infinity || Math.abs(normalizedStdScore) >= 800000;
    
    let scoresMatch = nodeRes.score === normalizedStdScore;
    if (isNodeMate && isStdMate) {
        const signNode = nodeRes.score === -Infinity ? -1 : (nodeRes.score === Infinity ? 1 : Math.sign(nodeRes.score));
        const signStd = normalizedStdScore === -Infinity ? -1 : (normalizedStdScore === Infinity ? 1 : Math.sign(normalizedStdScore));
        scoresMatch = signNode === signStd;
    }
    
    if (!scoresMatch) {
        throw new Error(`Score mismatch on ${positionName}! SQL evaluated ${nodeRes.score}, JS evaluated ${stdRes.score} (Normalized: ${normalizedStdScore})`);
    }

    console.log(`✓ Parity confirmed: Engine outputs match perfectly.`);
}

async function main() {
    console.log('==================================================');
    console.log(' Starting Differential Engine Verification Suite  ');
    console.log('==================================================');

    console.log('Initializing engines...');
    const nodeInstance = new EngineInstance();
    await nodeInstance.init();
    await initStd();
    console.log('Both engines successfully initialized.\n');

    // Run differential checks on multiple FEN positions
    await verifyPosition(nodeInstance, 'Initial Starting Position', START_FEN, 3);
    await verifyPosition(nodeInstance, 'Quiet Italian Middlegame', MIDGAME_FEN, 3);
    
    // Check-focused positions
    await verifyPosition(nodeInstance, 'King in Check (Single Evasion)', 'rnbqkbnr/ppppp1pp/8/5p1Q/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 2', 3);
    await verifyPosition(nodeInstance, 'King in Check (Single Evasion, Depth 1)', 'rnbqkbnr/ppppp1pp/8/5p1Q/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 2', 1);
    await verifyPosition(nodeInstance, 'King in Check (Multiple Evasions)', 'rnbqk1nr/pppp1ppp/8/4p3/1b1P4/2N5/PPP1PPPP/R1BQKBNR w KQkq - 2 3', 3);
    await verifyPosition(nodeInstance, 'King in Checkmate (No Evasions)', 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3', 1);

    // Quiescence Search (QS) Check-handling positions
    await verifyPosition(nodeInstance, 'QS Opening Check Evasion', 'rnbqkbnr/ppppp1pp/8/5p1Q/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 1 2', 1, { strategy: 'batched_pvs', maxDepthQS: 2 });
    await verifyPosition(nodeInstance, 'QS Italian Middlegame', MIDGAME_FEN, 1, { strategy: 'batched_pvs', maxDepthQS: 2 });

    console.log('\n==================================================');
    console.log(' SUCCESS: Differential Engine Parity Confirmed!   ');
    console.log('==================================================');
}

main().catch(err => {
    console.error('\n❌ Verification Failed:');
    console.error(err.message || err);
    process.exit(1);
});
