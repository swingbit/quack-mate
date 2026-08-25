import assert from 'assert';
import { init as initNode, EngineInstance, try_apply_move } from '../src/quackmate-node.js';
import { init as initStd, find_best_move as findBestMoveStd } from '../src/quackmate-js-dfs.js';

async function run() {
    console.log("=== RUNNING PROMOTION AND UNDERPROMOTION TEST SUITE ===");

    await initNode();
    const sqlEngine = new EngineInstance();
    await sqlEngine.init();
    await initStd();

    // -------------------------------------------------------------
    // TEST 1: try_apply_move human arbiter for all 4 pieces
    // -------------------------------------------------------------
    console.log("\n--- TEST 1: try_apply_move Arbiter for Q, R, B, N ---");
    const whitePromoFEN = '8/4P3/8/8/8/8/k6K/8 w - - 0 1';
    
    for (const piece of ['q', 'r', 'b', 'n']) {
        const resFEN = await try_apply_move(whitePromoFEN, 'e7', 'e8', piece);
        assert.ok(!resFEN.includes('illegal'), `White promotion to ${piece} should be legal`);
        const targetPieceChar = piece.toUpperCase();
        assert.ok(resFEN.split(' ')[0].includes(targetPieceChar), `Resulting FEN should contain ${targetPieceChar}: ${resFEN}`);
        console.log(`✓ White promote to ${targetPieceChar}: ${resFEN}`);
    }

    const blackPromoFEN = '8/k6K/8/8/8/8/4p3/8 b - - 0 1';
    for (const piece of ['q', 'r', 'b', 'n']) {
        const resFEN = await try_apply_move(blackPromoFEN, 'e2', 'e1', piece);
        assert.ok(!resFEN.includes('illegal'), `Black promotion to ${piece} should be legal`);
        const targetPieceChar = piece.toLowerCase();
        assert.ok(resFEN.split(' ')[0].includes(targetPieceChar), `Resulting FEN should contain ${targetPieceChar}: ${resFEN}`);
        console.log(`✓ Black promote to ${targetPieceChar}: ${resFEN}`);
    }

    // -------------------------------------------------------------
    // TEST 2: Tactical Knight Underpromotion (Royal Fork)
    // Position: White Pawn on c7, Black King on a7, Black Queen on e7, White King on h1
    // Promoting to Queen allows Queen checks/moves.
    // Promoting to Knight gives check (forking King on a7 and Queen on e7), winning the Queen!
    // -------------------------------------------------------------
    console.log("\n--- TEST 2: Tactical Knight Underpromotion (Fork) ---");
    const forkFEN = '8/k1P1q3/8/8/8/8/8/7K w - - 0 1';
    
    const stdRes = await findBestMoveStd(forkFEN, { depth: 3, useAlphaBeta: true, useTT: false });
    const sqlRes = await sqlEngine.find_best_move(forkFEN, { maxDepth: 3, strategy: 'batched_pvs', useTT: false, useAlphaBeta: true });
    
    console.log(`JS DFS Engine move : ${stdRes.move?.from}-${stdRes.move?.to}=${stdRes.move?.promotion} (Score: ${stdRes.score})`);
    console.log(`SQL Engine move    : ${sqlRes.move?.from}-${sqlRes.move?.to}=${sqlRes.move?.promotion} (Score: ${sqlRes.score})`);

    assert.strictEqual(stdRes.move?.promotion, 'n', "JS DFS engine should find knight promotion");
    assert.strictEqual(sqlRes.move?.promotion, 'n', "SQL engine should find knight promotion");
    assert.strictEqual(sqlRes.move?.from, 'c7');
    assert.strictEqual(sqlRes.move?.to, 'c8');
    console.log("✓ Both engines successfully found the tactical knight underpromotion!");

    // -------------------------------------------------------------
    // TEST 3: Standard Queen Promotion Selection
    // Position: Clear path to promotion with nothing to fork
    // Both engines should pick Queen promotion as it yields maximum material (+900)
    // -------------------------------------------------------------
    console.log("\n--- TEST 3: Queen Promotion Maximizing Material ---");
    const standardPromoFEN = '8/4P1k1/8/8/8/8/8/7K w - - 0 1';
    
    const stdQRes = await findBestMoveStd(standardPromoFEN, { depth: 2, useAlphaBeta: true, useTT: false });
    const sqlQRes = await sqlEngine.find_best_move(standardPromoFEN, { maxDepth: 2, strategy: 'batched_pvs', useTT: false, useAlphaBeta: true });

    console.log(`JS DFS Engine move : ${stdQRes.move?.from}-${stdQRes.move?.to}=${stdQRes.move?.promotion} (Score: ${stdQRes.score})`);
    console.log(`SQL Engine move    : ${sqlQRes.move?.from}-${sqlQRes.move?.to}=${sqlQRes.move?.promotion} (Score: ${sqlQRes.score})`);

    assert.strictEqual(stdQRes.move?.promotion, 'q', "JS DFS engine should promote to queen");
    assert.strictEqual(sqlQRes.move?.promotion, 'q', "SQL engine should promote to queen");
    console.log("✓ Both engines successfully choose Queen promotion when optimal!");

    // -------------------------------------------------------------
    // TEST 4: Black Promotion Parity
    // -------------------------------------------------------------
    console.log("\n--- TEST 4: Black Tactical Knight Underpromotion ---");
    const blackForkFEN = '7k/8/8/8/8/8/K1p1Q3/8 b - - 0 1';
    
    const stdBlackRes = await findBestMoveStd(blackForkFEN, { depth: 3, useAlphaBeta: true, useTT: false });
    const sqlBlackRes = await sqlEngine.find_best_move(blackForkFEN, { maxDepth: 3, strategy: 'batched_pvs', useTT: false, useAlphaBeta: true });

    console.log(`JS DFS Engine move : ${stdBlackRes.move?.from}-${stdBlackRes.move?.to}=${stdBlackRes.move?.promotion} (Score: ${stdBlackRes.score})`);
    console.log(`SQL Engine move    : ${sqlBlackRes.move?.from}-${sqlBlackRes.move?.to}=${sqlBlackRes.move?.promotion} (Score: ${sqlBlackRes.score})`);

    assert.strictEqual(stdBlackRes.move?.promotion, 'n', "JS DFS engine should find black knight underpromotion");
    assert.strictEqual(sqlBlackRes.move?.promotion, 'n', "SQL engine should find black knight underpromotion");
    console.log("✓ Black underpromotion parity confirmed!");

    console.log("\n=======================================================");
    console.log(" ALL PROMOTION & UNDERPROMOTION TESTS PASSED (4/4)! ");
    console.log("=======================================================");
    
    sqlEngine.close();
}

run().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
