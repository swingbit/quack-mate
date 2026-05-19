
import { EngineInstance } from '../src/quackmate-node.js';

async function runBenchmark() {
    const instance = new EngineInstance();
    await instance.init();
    
const positions = [
        // 1. Initial Position (Opening)
        { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', depth: 4, name: 'StartPos' },
        // 2. Sicilian Defense (Opening)
        { fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2', depth: 4, name: 'Sicilian' },
        // 3. KiwiPete (Complex Tactics - Middlegame)
        { fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', depth: 4, name: 'KiwiPete' },
        // 4. Quiet Middlegame (Positional)
        { fen: 'r1bqk2r/pppp1ppp/2n2n2/4p3/1bB1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 4 4', depth: 4, name: 'QuietMid' },
        // 5. Endgame (King + Pawn)
        { fen: '8/8/8/4k3/3P4/8/8/4K3 b - - 0 1', depth: 6, name: 'PawnEnd' },
        // 6. Rook Endgame
        { fen: '8/8/4k3/8/8/4R3/2K5/8 b - - 0 1', depth: 6, name: 'RookEnd' }
    ];

    console.log("Running Search Profiling Benchmark...\n");
    console.log("| Position | Depth | PV Accuracy | LMR Researches | Reduction Rate | Parents Pruned | Est. Nodes Saved |");
    console.log("|---|---|---|---|---|---|---|");

    for (const pos of positions) {
        // console.log(`Searching ${pos.name}...`);
        const res = await instance.find_best_move(pos.fen, { 
            strategy: 'batched_pvs', 
            depth: pos.depth, 
            useAlphaBeta: true,
            debug: true
        });

        const stats = res.stats;
        // Calculation
        const pvAcc = stats.pv_accuracy.total > 0 
            ? ((stats.pv_accuracy.correct / stats.pv_accuracy.total) * 100).toFixed(1) + '%' 
            : 'N/A';
        
        // Reduction Rate (Reductions / Total Batches) - approximate
        // Or Reductions / (Total Batches that *could* be reduced?)
        // Just raw count is fine for now
        
        const estSaved = (stats.pruning.estimated_nodes_avoided / 1000).toFixed(1) + 'k';
        console.log(`| ${pos.name} | ${pos.depth} | ${pvAcc} (${stats.pv_accuracy.correct}/${stats.pv_accuracy.total}) | ${stats.lmr.researches} | ${stats.lmr.reductions} | ${stats.pruning.pruned_parents} | ${estSaved} |`);
        
        // Reset game to clear TT for fresh stats
        await instance.resetGame(); 
        // Re-init mainly clears tables.
        await instance.init();
    }
}

runBenchmark().catch(console.error);
