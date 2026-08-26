import assert from 'assert';
import { init as initNode, EngineInstance, try_apply_move } from '../src/quackmate-node.js';
import { init as initStd, find_best_move as findBestMoveStd } from '../src/quackmate-js-dfs.js';

async function run() {
    console.log("=== RUNNING EN PASSANT TEST SUITE ===");

    await initNode();
    const sqlEngine = new EngineInstance();
    await sqlEngine.init();
    await initStd();

    // -------------------------------------------------------------
    // TEST 1: try_apply_move White En Passant Capture
    // -------------------------------------------------------------
    console.log("\n--- TEST 1: White En Passant Capture ---");
    const whiteEpFEN = 'rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
    const resWhiteFEN = await try_apply_move(whiteEpFEN, 'e5', 'd6');
    assert.ok(!resWhiteFEN.includes('illegal'), `White en passant should be legal: ${resWhiteFEN}`);
    const [placementW, turnW, , epTargetW] = resWhiteFEN.split(' ');
    assert.strictEqual(turnW, 'b', "Active turn should be black after move");
    assert.strictEqual(epTargetW, '-', "En passant square should reset to '-'");
    // Verify d5 pawn was removed and pawn is now on d6
    const ranksW = placementW.split('/');
    assert.ok(!ranksW[3].includes('p'), `Black pawn on d5 (rank 5) should be removed: ${ranksW[3]}`);
    assert.ok(ranksW[2].includes('P'), `White pawn should now be on d6 (rank 6): ${ranksW[2]}`);
    console.log(`✓ White en passant executed successfully: ${resWhiteFEN}`);

    // -------------------------------------------------------------
    // TEST 2: try_apply_move Black En Passant Capture
    // -------------------------------------------------------------
    console.log("\n--- TEST 2: Black En Passant Capture ---");
    const blackEpFEN = 'rnbqkbnr/pppp1ppp/8/8/3pP3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 2';
    const resBlackFEN = await try_apply_move(blackEpFEN, 'd4', 'e3');
    assert.ok(!resBlackFEN.includes('illegal'), `Black en passant should be legal: ${resBlackFEN}`);
    const [placementB, turnB, , epTargetB] = resBlackFEN.split(' ');
    assert.strictEqual(turnB, 'w', "Active turn should be white after move");
    assert.strictEqual(epTargetB, '-', "En passant square should reset to '-'");
    // Verify e4 pawn was removed and pawn is now on e3
    const ranksB = placementB.split('/');
    assert.ok(!ranksB[4].includes('P'), `White pawn on e4 (rank 4) should be removed: ${ranksB[4]}`);
    assert.ok(ranksB[5].includes('p'), `Black pawn should now be on e3 (rank 3): ${ranksB[5]}`);
    console.log(`✓ Black en passant executed successfully: ${resBlackFEN}`);

    // -------------------------------------------------------------
    // TEST 3: Double Push sets FEN ep target, subsequent quiet move clears it
    // -------------------------------------------------------------
    console.log("\n--- TEST 3: Double Push FEN generation and resetting ---");
    const startFEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const fenAfterE4 = await try_apply_move(startFEN, 'e2', 'e4');
    assert.strictEqual(fenAfterE4.split(' ')[3], 'e3', "Double push e2-e4 should set ep target to e3");
    console.log(`✓ e2-e4 produced ep target e3: ${fenAfterE4}`);

    const fenAfterNf6 = await try_apply_move(fenAfterE4, 'g8', 'f6');
    assert.strictEqual(fenAfterNf6.split(' ')[3], '-', "Quiet move should clear ep target");
    console.log(`✓ g8-f6 reset ep target to -: ${fenAfterNf6}`);

    // -------------------------------------------------------------
    // TEST 4: En Passant Legality & Horizontal Discovered Check Pin
    // -------------------------------------------------------------
    console.log("\n--- TEST 4: Discovered Check En Passant Pin Legality ---");
    // White King on e5, White Pawn on f5, Black Pawn on g5 (ep target g6), Black Rook on a5
    // If White plays f5xg6 e.p., both f5 and g5 leave the 5th rank, exposing Ke5 to Ra5!
    const pinFEN = '8/8/8/r3KPp1/8/8/8/7k w - g6 0 1';
    const illegalEpRes = await try_apply_move(pinFEN, 'f5', 'g6');
    assert.ok(illegalEpRes.includes('illegal'), `En passant that exposes king to check should be illegal: ${illegalEpRes}`);
    console.log(`✓ Correctly identified illegal en passant due to discovered pin check: ${illegalEpRes}`);

    // -------------------------------------------------------------
    // TEST 5: Tactical En Passant Search Parity (JS DFS vs SQL Engine PVS & Recursive)
    // -------------------------------------------------------------
    console.log("\n--- TEST 5: Tactical En Passant Search & Best Move Parity ---");
    // Position: White Pawn on e5, Black just played d7-d5 (ep d6).
    // Black king on a8, White king on h1.
    // If White plays exd6, White wins a pawn and opens the position.
    const tacticalEpFEN = 'k7/8/8/3pP3/8/8/8/7K w - d6 0 1';
    const stdRes = await findBestMoveStd(tacticalEpFEN, { depth: 2, useAlphaBeta: true, useTT: false });
    const sqlRes = await sqlEngine.find_best_move(tacticalEpFEN, { maxDepth: 2, strategy: 'batched_pvs', useTT: false, useAlphaBeta: true });
    const sqlRecRes = await sqlEngine.find_best_move(tacticalEpFEN, { maxDepth: 2, strategy: 'recursive' });

    console.log(`JS DFS Engine move    : ${stdRes.move?.from}-${stdRes.move?.to} (Score: ${stdRes.score})`);
    console.log(`SQL Batched PVS move  : ${sqlRes.move?.from}-${sqlRes.move?.to} (Score: ${sqlRes.score})`);
    console.log(`SQL Recursive CTE move: ${sqlRecRes.move?.from}-${sqlRecRes.move?.to} (Score: ${sqlRecRes.score})`);

    assert.strictEqual(stdRes.move?.from, 'e5', "JS DFS engine should play e5");
    assert.strictEqual(stdRes.move?.to, 'd6', "JS DFS engine should play d6 (en passant)");
    assert.strictEqual(sqlRes.move?.from, 'e5', "SQL PVS engine should play e5");
    assert.strictEqual(sqlRes.move?.to, 'd6', "SQL PVS engine should play d6 (en passant)");
    assert.strictEqual(sqlRecRes.move?.from, 'e5', "SQL Recursive engine should play e5");
    assert.strictEqual(sqlRecRes.move?.to, 'd6', "SQL Recursive engine should play d6 (en passant)");
    assert.strictEqual(sqlRes.score, stdRes.score, "Scores should match between JS and SQL engine");
    assert.strictEqual(sqlRecRes.score, stdRes.score, "Scores should match between JS and SQL Recursive engine");
    console.log("✓ All engines found the en passant capture with identical score!");

    // -------------------------------------------------------------
    // TEST 6: Black En Passant Search Parity
    // -------------------------------------------------------------
    console.log("\n--- TEST 6: Black Tactical En Passant Search Parity ---");
    const blackTacticalEpFEN = '7k/8/8/8/3pP3/8/8/K7 b - e3 0 1';
    const stdBlackRes = await findBestMoveStd(blackTacticalEpFEN, { depth: 2, useAlphaBeta: true, useTT: false });
    const sqlBlackRes = await sqlEngine.find_best_move(blackTacticalEpFEN, { maxDepth: 2, strategy: 'batched_pvs', useTT: false, useAlphaBeta: true });
    const sqlBlackRecRes = await sqlEngine.find_best_move(blackTacticalEpFEN, { maxDepth: 2, strategy: 'recursive' });

    console.log(`JS DFS Engine move    : ${stdBlackRes.move?.from}-${stdBlackRes.move?.to} (Score: ${stdBlackRes.score})`);
    console.log(`SQL Batched PVS move  : ${sqlBlackRes.move?.from}-${sqlBlackRes.move?.to} (Score: ${sqlBlackRes.score})`);
    console.log(`SQL Recursive CTE move: ${sqlBlackRecRes.move?.from}-${sqlBlackRecRes.move?.to} (Score: ${sqlBlackRecRes.score})`);

    assert.strictEqual(stdBlackRes.move?.from, 'd4');
    assert.strictEqual(stdBlackRes.move?.to, 'e3');
    assert.strictEqual(sqlBlackRes.move?.from, 'd4');
    assert.strictEqual(sqlBlackRes.move?.to, 'e3');
    assert.strictEqual(sqlBlackRecRes.move?.from, 'd4');
    assert.strictEqual(sqlBlackRecRes.move?.to, 'e3');
    assert.strictEqual(sqlBlackRes.score, stdBlackRes.score);
    assert.strictEqual(sqlBlackRecRes.score, stdBlackRes.score);
    console.log("✓ Black en passant parity confirmed across all engines!");

    console.log("\n=======================================================");
    console.log(" ALL EN PASSANT TESTS PASSED (6/6)! ");
    console.log("=======================================================");
    
    sqlEngine.close();
}

run().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
