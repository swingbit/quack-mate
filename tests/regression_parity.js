import assert from 'assert';
import { EngineInstance } from '../src/quackmate-node.js';
import { init as initStd, find_best_move as findBestMoveStd } from '../src/quackmate-js-dfs.js';

const FEN = 'rn1qk2r/1ppbbppp/p3p3/1N1p2Bn/Q1PP4/5N2/PP2PPPP/R3KB1R w KQkq - 0 1';

async function run() {
    await initStd();
    const sqlEngine = new EngineInstance();
    await sqlEngine.init();

    console.log("=== RUNNING REGRESSION PARITY TEST SUITE ===");

    // Test Case 1: Pure Alpha-Beta + QS
    console.log("\n--- TEST CASE 1: Pure Alpha-Beta + QS Parity ---");
    const optPureAB = {
        useAlphaBeta: true,
        useTT: false,
        useRFP: false,
        useFFP: false,
        useLMR: false,
        useLMP: false,
        useHistory: false,
        useKillers: false,
        maxDepthQS: 1
    };
    for (let d = 1; d <= 3; d++) {
        const stdRes = await findBestMoveStd(FEN, { ...optPureAB, maxDepth: d, resetContext: true });
        const sqlRes = await sqlEngine.find_best_move(FEN, { ...optPureAB, maxDepth: d, strategy: 'batched_pvs', maxThreads: 1 });
        
        const stdMoveStr = `${stdRes.move?.from}-${stdRes.move?.to}`;
        const sqlMoveStr = `${sqlRes.move?.from}-${sqlRes.move?.to}`;
        
        console.log(`Depth ${d}: JS Engine = ${stdMoveStr} (Score: ${stdRes.score}) | SQL Engine = ${sqlMoveStr} (Score: ${sqlRes.score})`);
        
        assert.strictEqual(sqlMoveStr, stdMoveStr, `Depth ${d} Move Mismatch!`);
        assert.strictEqual(sqlRes.score, stdRes.score, `Depth ${d} Score Mismatch!`);
    }

    // Test Case 2: Full Selective Pruning + QS
    console.log("\n--- TEST CASE 2: E2E Selective Pruning Parity ---");
    const optFullPruning = {
        useAlphaBeta: true,
        useTT: true,
        useRFP: true,
        useFFP: true,
        useLMR: true,
        useLMP: true,
        useHistory: true,
        useKillers: true,
        maxDepthQS: 1
    };
    for (let d = 1; d <= 3; d++) {
        const stdRes = await findBestMoveStd(FEN, { ...optFullPruning, maxDepth: d, resetContext: true });
        const sqlRes = await sqlEngine.find_best_move(FEN, { ...optFullPruning, maxDepth: d, strategy: 'batched_pvs', maxThreads: 1 });
        
        const stdMoveStr = `${stdRes.move?.from}-${stdRes.move?.to}`;
        const sqlMoveStr = `${sqlRes.move?.from}-${sqlRes.move?.to}`;
        
        console.log(`Depth ${d}: JS Engine = ${stdMoveStr} (Score: ${stdRes.score}) | SQL Engine = ${sqlMoveStr} (Score: ${sqlRes.score})`);
        
        // With selective pruning, minor heuristic differences may arise, but best moves must match.
        assert.strictEqual(sqlMoveStr, stdMoveStr, `Depth ${d} Move Mismatch under Selective Pruning!`);
    }

    // Test Case 3: Unpruned Minimax
    console.log("\n--- TEST CASE 3: Unpruned Minimax Parity ---");
    const optUnpruned = {
        useAlphaBeta: false,
        useTT: false,
        useRFP: false,
        useFFP: false,
        useLMR: false,
        useLMP: false,
        useHistory: false,
        useKillers: false,
        maxDepthQS: 1
    };
    for (let d = 1; d <= 2; d++) {
        const stdRes = await findBestMoveStd(FEN, { ...optUnpruned, maxDepth: d, resetContext: true });
        const sqlRes = await sqlEngine.find_best_move(FEN, { ...optUnpruned, maxDepth: d, strategy: 'batched_pvs', maxThreads: 1 });
        
        const stdMoveStr = `${stdRes.move?.from}-${stdRes.move?.to}`;
        const sqlMoveStr = `${sqlRes.move?.from}-${sqlRes.move?.to}`;
        
        console.log(`Depth ${d}: JS Engine = ${stdMoveStr} (Score: ${stdRes.score}) | SQL Engine = ${sqlMoveStr} (Score: ${sqlRes.score})`);
        
        assert.strictEqual(sqlMoveStr, stdMoveStr, `Depth ${d} Move Mismatch!`);
        assert.strictEqual(sqlRes.score, stdRes.score, `Depth ${d} Score Mismatch!`);
    }

    // Test Case 4: Black to Move Mating Sequence Parity
    console.log("\n--- TEST CASE 4: Black Mating Parity (FEN: 3rk2r/ppp2ppp/2n5/2p2q1P/P2n3K/6P1/8/3q4 b k - 0 1) ---");
    const FEN_BLACK = '3rk2r/ppp2ppp/2n5/2p2q1P/P2n3K/6P1/8/3q4 b k - 0 1';
    const optBlackMate = {
        useAlphaBeta: true,
        useTT: true,
        useRFP: true,
        useFFP: true,
        useLMR: true,
        useLMP: true,
        useHistory: true,
        useKillers: true,
        maxDepthQS: 1
    };
    
    const stdBlackRes = await findBestMoveStd(FEN_BLACK, { ...optBlackMate, maxDepth: 4, resetContext: true });
    const sqlBlackRes = await sqlEngine.find_best_move(FEN_BLACK, { ...optBlackMate, maxDepth: 4, strategy: 'batched_pvs', maxThreads: 1 });
    
    const stdBlackMoveStr = `${stdBlackRes.move?.from}-${stdBlackRes.move?.to}`;
    const sqlBlackMoveStr = `${sqlBlackRes.move?.from}-${sqlBlackRes.move?.to}`;
    
    console.log(`Depth 4: JS Engine = ${stdBlackMoveStr} (Score: ${stdBlackRes.score}) | SQL Engine = ${sqlBlackMoveStr} (Score: ${sqlBlackRes.score})`);
    
    assert.strictEqual(sqlBlackMoveStr, stdBlackMoveStr, "Depth 4 Move Mismatch for Black mate!");
    assert.strictEqual(sqlBlackRes.score, stdBlackRes.score, "Depth 4 Score Mismatch for Black mate!");

    console.log("\n🎉 ALL PARITY REGRESSION TESTS PASSED SUCCESSFULLY!");
}

run().catch(err => {
    console.error("\n❌ REGRESSION TEST FAILED:", err.stack);
    process.exit(1);
});
