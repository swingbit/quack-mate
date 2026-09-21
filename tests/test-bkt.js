/**
 * tests/test-bkt.js
 * 
 * Bratko-Kopec Test (BKT) Benchmark Suite for Quack-Mate.
 * 
 * The Bratko-Kopec Test consists of 24 standard positions (12 tactical, 12 positional)
 * designed to assess chess engine strength and calculate an empirical Elo estimate.
 * 
 * Usage:
 *   node tests/test-bkt.js [--depth=3] [--strategy=batched_pvs|standard|recursive] [--engine=sql|js] [--verbose]
 */

import { EngineInstance } from '../src/quackmate-node.js';
import { init as initJs, find_best_move as findBestMoveJs } from '../src/quackmate-js-dfs.js';

// The 24 Standard Bratko-Kopec Test positions
export const BKT_POSITIONS = [
    {
        id: 1,
        type: 'Tactical',
        name: 'BKT 01 - Pin/Deflection',
        fen: '1k1r4/pp1b1R2/1rq4p/4p2p/P3P3/1B1P2P1/1PP5/2K2RQ1 w - - 0 1',
        solutions: ['b3d5', 'd3d4', 'f7f8']
    },
    {
        id: 2,
        type: 'Positional',
        name: 'BKT 02 - Central Pawn Break',
        fen: '3r1k2/4npp1/1ppr3p/p6P/P2PPPP1/1NR5/5K2/2R5 w - - 0 1',
        solutions: ['d4d5']
    },
    {
        id: 3,
        type: 'Positional',
        name: 'BKT 03 - King-side Pawn Lever',
        fen: '2q1rr1k/3bbnnp/p2p1pp1/2pPp3/PpP1P1P1/1P1BBRNP/3Q1KN1/5R2 b - - 0 1',
        solutions: ['f6f5']
    },
    {
        id: 4,
        type: 'Tactical',
        name: 'BKT 04 - Pawn Advance Sacrifice',
        fen: 'rnbqkb1r/p3pppp/1p6/2ppP3/3N4/2P5/PPP1QPPP/R1B1KB1R w KQkq - 0 1',
        solutions: ['e5e6']
    },
    {
        id: 5,
        type: 'Tactical',
        name: 'BKT 05 - Flank Counter & Knight Outpost',
        fen: 'r1b2rk1/2q1b1pp/p2ppn2/1p6/3QP3/1BN1B3/PPP3PP/R4RK1 w - - 0 1',
        solutions: ['a2a4', 'c3d5']
    },
    {
        id: 6,
        type: 'Tactical',
        name: 'BKT 06 - Knight Penetration',
        fen: '2r3k1/pppR1pp1/4p1qp/5n2/2P1N3/5Q2/PP3PPP/6K1 w - - 0 1',
        solutions: ['e4c5', 'g2g4', 'f3f4']
    },
    {
        id: 7,
        type: 'Tactical',
        name: 'BKT 07 - Bishop Outpost Pin',
        fen: '1r1qr1k1/p1p2pbp/2p3p1/1b2p3/8/1PN1P1P1/P1QB1P1P/R2R2K1 b - - 0 1',
        solutions: ['b5d3']
    },
    {
        id: 8,
        type: 'Positional',
        name: 'BKT 08 - Pawn Defense / Attack on Queen',
        fen: '1r3rk1/p1p2pbp/3p2p1/1p1QP3/5P2/1N4P1/PPP4P/2KRR3 b - - 0 1',
        solutions: ['c7c6', 'd6e5']
    },
    {
        id: 9,
        type: 'Tactical',
        name: 'BKT 09 - Long Diagonal Attack',
        fen: 'r1b2rk1/p2p1ppp/1p6/8/1QP1n3/4B3/Pq2BPPP/R4RK1 w - - 0 1',
        solutions: ['e2f3', 'b4b2']
    },
    {
        id: 10,
        type: 'Positional',
        name: 'BKT 10 - King Safety Castling',
        fen: 'qn2k1r1/p1pp1p1p/3b4/5b2/3P1p2/5N2/PPP3PP/R1B1K2R w KQ - 0 1',
        solutions: ['e1g1']
    },
    {
        id: 11,
        type: 'Tactical',
        name: 'BKT 11 - Central Knight Sacrifice / Discovery',
        fen: 'r1bqr1k1/pp1n1ppp/2p5/4P3/2B2Q2/2N5/PPP2PPP/R3R1K1 b - - 0 1',
        solutions: ['d7e5']
    },
    {
        id: 12,
        type: 'Positional',
        name: 'BKT 12 - Knight Repositioning',
        fen: 'r2q1rk1/1pp1bppp/p2p1n2/4n3/4PP2/1BN5/PPP3PP/R1BQ1RK1 b - - 0 1',
        solutions: ['e5c6', 'e5g6']
    },
    {
        id: 13,
        type: 'Tactical',
        name: 'BKT 13 - Center Pawn Strike',
        fen: 'r1bqkb1r/pppp1ppp/2n5/4P3/2B1n3/5N2/PPP2PPP/RNBQK2R b KQkq - 0 1',
        solutions: ['d7d5', 'e4c5']
    },
    {
        id: 14,
        type: 'Tactical',
        name: 'BKT 14 - Rook Lift & King Attack',
        fen: 'r1b2rk1/1p1n1ppp/p2p4/3N2q1/3QPR2/8/PPP1B1PP/R5K1 w - - 0 1',
        solutions: ['f4g4', 'f4f5']
    },
    {
        id: 15,
        type: 'Positional',
        name: 'BKT 15 - Queenside Pressure',
        fen: 'r1b2rk1/ppp1bppp/2n1pn2/q5B1/2BP4/2N2N2/PPP2PPP/R2QR1K1 w - - 0 1',
        solutions: ['c3e4', 'a2a3', 'g5f6', 'c4d3']
    },
    {
        id: 16,
        type: 'Tactical',
        name: 'BKT 16 - Greek Gift / Kingside Attack',
        fen: 'r2q1rk1/pb1nbppp/1pn1p3/2ppP3/3P4/2PB1NN1/PP3PPP/R1BQR1K1 w - - 0 1',
        solutions: ['h2h4', 'd3h7']
    },
    {
        id: 17,
        type: 'Positional',
        name: 'BKT 17 - Central Outpost Knight',
        fen: 'r1b1qrk1/ppp2pbp/2np1np1/6B1/2PP4/2N1PN2/PP3PPP/R2QKB1R b KQ - 0 1',
        solutions: ['f6e4', 'c6e7']
    },
    {
        id: 18,
        type: 'Positional',
        name: 'BKT 18 - Central Counterstrike',
        fen: 'r1bqk2r/pp1nbp1p/2p1p1p1/3pP3/3P4/2PB1N2/PP1N1PPP/R2Q1RK1 b kq - 0 1',
        solutions: ['c6c5', 'e8g8']
    },
    {
        id: 19,
        type: 'Tactical',
        name: 'BKT 19 - Flank Expansion / Trapping',
        fen: 'r1b2rk1/pp1n1p1p/2p1p1p1/q2pP3/3P4/2PB1N2/PP1N1PPP/R2Q1RK1 w - - 0 1',
        solutions: ['b2b4', 'd2b3']
    },
    {
        id: 20,
        type: 'Positional',
        name: 'BKT 20 - Active Bishop Development',
        fen: 'r1b2rk1/pp2ppbp/2np1np1/8/2PP4/2N2NP1/PP3PBP/R1BQ1RK1 b - - 0 1',
        solutions: ['c8g4', 'c8f5', 'd6d5']
    },
    {
        id: 21,
        type: 'Positional',
        name: 'BKT 21 - King Bishop Development',
        fen: 'r1b2rk1/ppp2ppp/2n1pn2/8/2PP4/2N2N2/PP3PPP/R2QKB1R w KQ - 0 1',
        solutions: ['f1d3', 'd4d5', 'f1e2']
    },
    {
        id: 22,
        type: 'Positional',
        name: 'BKT 22 - Center Pawn Exchange',
        fen: 'r1bqk2r/pp2bppp/2n1p3/3p4/2PP4/2NB1N2/PP3PPP/R1BQK2R b KQkq - 0 1',
        solutions: ['d5c4', 'e8g8']
    },
    {
        id: 23,
        type: 'Positional',
        name: 'BKT 23 - Knight Maneuver to Kingside',
        fen: 'r1b2rk1/pp3ppp/2n1pn2/8/2PP4/2N2N2/PP3PPP/R2QKB1R b KQ - 0 1',
        solutions: ['c6e7', 'f8d8', 'b7b6']
    },
    {
        id: 24,
        type: 'Positional',
        name: 'BKT 24 - Pawn Structure Liquidation',
        fen: 'r1bqk2r/ppp1bppp/2n1pn2/3p4/2PP4/2NB1N2/PP3PPP/R1BQK2R w KQkq - 0 1',
        solutions: ['c4d5', 'e1g1', 'c1e3']
    }
];

function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        depth: 3,
        qs: 0,
        strategy: 'batched_pvs',
        engine: 'sql',
        sweep: false,
        maxSweepDepth: 4,
        verbose: false
    };

    for (const arg of args) {
        if (arg.startsWith('--depth=')) options.depth = parseInt(arg.split('=')[1], 10);
        else if (arg.startsWith('--qs=')) options.qs = parseInt(arg.split('=')[1], 10);
        else if (arg.startsWith('--strategy=')) options.strategy = arg.split('=')[1];
        else if (arg.startsWith('--engine=')) options.engine = arg.split('=')[1];
        else if (arg === '--sweep') options.sweep = true;
        else if (arg.startsWith('--max-depth=')) options.maxSweepDepth = parseInt(arg.split('=')[1], 10);
        else if (arg === '--verbose') options.verbose = true;
    }
    return options;
}

/**
 * Calculates empirical Elo rating from BKT score.
 * Formula: Elo = 1000 + (solved / 24) * 1300
 */
function calculateElo(solvedCount, totalPositions = 24) {
    const minElo = 1000;
    const maxElo = 2300;
    return Math.round(minElo + (solvedCount / totalPositions) * (maxElo - minElo));
}

async function runSingleDepthBenchmark(engineInstance, depth, opts, printIndividual = true) {
    let solvedTotal = 0;
    let solvedTactical = 0;
    let solvedPositional = 0;
    let totalNodes = 0;
    let totalTimeMs = 0;

    const results = [];

    for (let i = 0; i < BKT_POSITIONS.length; i++) {
        const test = BKT_POSITIONS[i];
        const startTime = performance.now();

        let moveStr = 'none';
        let score = 0;
        let nodes = 0;

        if (opts.engine === 'sql') {
            const res = await engineInstance.find_best_move(test.fen, {
                strategy: opts.strategy,
                maxDepth: depth,
                maxDepthQS: opts.qs,
                useAlphaBeta: true,
                useTT: true
            });
            if (res.move && typeof res.move === 'object') {
                moveStr = `${res.move.from}${res.move.to}${res.move.promotion || ''}`;
            }
            score = res.score;
            nodes = res.nodes || 0;
        } else {
            const res = await findBestMoveJs(test.fen, {
                depth: depth,
                maxDepthQS: opts.qs,
                useAlphaBeta: true,
                useTT: true
            });
            if (res.move && typeof res.move === 'object') {
                moveStr = `${res.move.from}${res.move.to}${res.move.promotion || ''}`;
            }
            score = res.score;
            nodes = res.nodes || 0;
        }

        const elapsedMs = performance.now() - startTime;
        totalTimeMs += elapsedMs;
        totalNodes += nodes;

        const isSolved = test.solutions.includes(moveStr);
        if (isSolved) {
            solvedTotal++;
            if (test.type === 'Tactical') solvedTactical++;
            else solvedPositional++;
        }

        if (printIndividual) {
            const statusSymbol = isSolved ? '✓ SOLVED' : '✗ FAILED';
            console.log(`[${String(test.id).padStart(2, '0')}/24] ${test.name.padEnd(38, ' ')} | Move: ${moveStr.padEnd(5, ' ')} (Target: ${test.solutions.join('/')}) | ${statusSymbol.padEnd(8, ' ')} | ${elapsedMs.toFixed(0).padStart(5, ' ')} ms | ${nodes.toLocaleString().padStart(8, ' ')} nodes`);
        }

        results.push({
            id: test.id,
            name: test.name,
            type: test.type,
            move: moveStr,
            expected: test.solutions,
            solved: isSolved,
            score,
            nodes,
            timeMs: elapsedMs
        });
    }

    const estimatedElo = calculateElo(solvedTotal, BKT_POSITIONS.length);
    const nps = totalTimeMs > 0 ? Math.round((totalNodes / totalTimeMs) * 1000) : 0;

    return {
        depth,
        solvedTotal,
        solvedTactical,
        solvedPositional,
        estimatedElo,
        totalNodes,
        totalTimeMs,
        nps,
        results
    };
}

async function runBenchmark() {
    const opts = parseArgs();

    console.log('===============================================================');
    console.log('        Quack-Mate Bratko-Kopec Test (BKT) Benchmark           ');
    console.log('===============================================================');
    console.log(`Engine   : ${opts.engine.toUpperCase()} (${opts.strategy})`);
    console.log(`Mode     : ${opts.sweep ? `Depth Sweep (1..${opts.maxSweepDepth})` : `Single Depth (${opts.depth})`}`);
    console.log(`QS Depth : ${opts.qs > 0 ? opts.qs : 'Disabled (0)'}`);
    console.log(`Positions: ${BKT_POSITIONS.length} (12 Tactical, 12 Positional)\n`);

    let engineInstance = null;
    if (opts.engine === 'sql') {
        engineInstance = new EngineInstance();
        await engineInstance.init();
    } else {
        await initJs();
    }

    if (!opts.sweep) {
        const res = await runSingleDepthBenchmark(engineInstance, opts.depth, opts, true);
        console.log('\n===============================================================');
        console.log('                      BENCHMARK RESULTS                        ');
        console.log('===============================================================');
        console.log(`Depth            : ${res.depth}`);
        console.log(`Total Score      : ${res.solvedTotal} / 24 (${((res.solvedTotal / 24) * 100).toFixed(1)}%)`);
        console.log(`Tactical Solved  : ${res.solvedTactical} / 12 (${((res.solvedTactical / 12) * 100).toFixed(1)}%)`);
        console.log(`Positional Solved: ${res.solvedPositional} / 12 (${((res.solvedPositional / 12) * 100).toFixed(1)}%)`);
        console.log(`Total Nodes      : ${res.totalNodes.toLocaleString()}`);
        console.log(`Total Time       : ${(res.totalTimeMs / 1000).toFixed(2)} s`);
        console.log(`Average NPS      : ${res.nps.toLocaleString()} nodes/sec`);
        console.log('---------------------------------------------------------------');
        console.log(`🎯 ESTIMATED ELO RATING: ~${res.estimatedElo} Elo (±75)`);
        console.log('===============================================================\n');
    } else {
        console.log('Running depth sweep...\n');
        const sweepResults = [];
        for (let d = 1; d <= opts.maxSweepDepth; d++) {
            process.stdout.write(`Evaluating Depth ${d}... `);
            const res = await runSingleDepthBenchmark(engineInstance, d, opts, false);
            sweepResults.push(res);
            console.log(`Done! Solved: ${res.solvedTotal}/24 | Elo: ~${res.estimatedElo} | Time: ${(res.totalTimeMs / 1000).toFixed(2)}s`);
        }

        console.log('\n========================================================================================');
        console.log('                                DEPTH vs. ELO SUMMARY TABLE                              ');
        console.log('========================================================================================');
        console.log(' Depth | Solved (Total) | Tactical (12) | Positional (12) | Time (s) | Nodes     | Est. Elo  ');
        console.log('-------+----------------+---------------+-----------------+----------+-----------+-----------');
        for (const r of sweepResults) {
            console.log(`   ${r.depth}   |   ${String(r.solvedTotal).padStart(2, ' ')}/24 (${((r.solvedTotal/24)*100).toFixed(0)}%)   |     ${String(r.solvedTactical).padStart(2, ' ')}/12    |      ${String(r.solvedPositional).padStart(2, ' ')}/12     |   ${(r.totalTimeMs/1000).toFixed(2).padStart(5, ' ')}s | ${r.totalNodes.toLocaleString().padStart(9, ' ')} | ~${r.estimatedElo} Elo `);
        }
        console.log('========================================================================================\n');
    }
}

runBenchmark().catch(err => {
    console.error('Benchmark execution error:', err);
    process.exit(1);
});
