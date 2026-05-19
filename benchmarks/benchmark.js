import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { find_best_move, init, close } from '../src/quackmate-node.js';
import { find_best_move as find_best_move_std } from '../src/quackmate-standard.js';
import { DEFAULT_OPTIONS } from '../src/quackmate-common.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Auto-relaunch with --expose-gc to allow forced memory release
if (!global.gc) {
    const child = spawn(process.execPath, ['--expose-gc', ...process.argv.slice(1)], {
        stdio: 'inherit'
    });
    child.on('close', (code) => {
        process.exit(code);
    });
    // Pause execution of the parent process
    await new Promise(() => {});
}

const TEST_FENS = [
    { name: 'Perft Pos 1 (Start)', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
    { name: 'Perft Pos 2 (Complex Mid-game)', fen: 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10' },
    { name: 'Perft Pos 3 (KiwiPete)', fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1' },
    { name: 'Perft Pos 4 (Endgame)', fen: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1' }
];

let MAX_DEPTH = 4;
let MAX_QS_DEPTH = 0;

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node benchmarks/benchmark.js [options]

Options:
  -h, --help           Show this help message and exit
  --only-qs            Only execute the Quiescence Search (QS) vs Depth +1 comparison
  --only-threads       Only execute the thread scalability benchmark (+ LMR configuration across 1, 2, 4, 8, 16 threads)
  --threads <n>        Set the maximum threads to use (default: ${DEFAULT_OPTIONS.maxThreads})
  --max-depth <n>      Set the search depth (default: ${MAX_DEPTH})
  --max-qs-depth <n>   Set the quiescence search depth (default: ${MAX_QS_DEPTH})

Examples:
  node benchmarks/benchmark.js --max-depth=5
  node benchmarks/benchmark.js --only-threads --max-depth=5
  node benchmarks/benchmark.js --only-qs --max-depth=4 --max-qs-depth=2
`);
    process.exit(0);
}

const onlyQs = args.includes('--only-qs');
const onlyThreads = args.includes('--only-threads');

let maxThreads = DEFAULT_OPTIONS.maxThreads;
const threadsArg = args.find(arg => arg.startsWith('--threads'));
if (threadsArg) {
    if (threadsArg.includes('=')) {
        const val = parseInt(threadsArg.split('=')[1], 10);
        if (!isNaN(val)) maxThreads = val;
    } else {
        const idx = args.indexOf('--threads');
        if (idx !== -1 && idx + 1 < args.length) {
            const val = parseInt(args[idx + 1], 10);
            if (!isNaN(val)) maxThreads = val;
        }
    }
}

const depthArg = args.find(arg => arg.startsWith('--max-depth'));
if (depthArg) {
    if (depthArg.includes('=')) {
        const val = parseInt(depthArg.split('=')[1], 10);
        if (!isNaN(val)) MAX_DEPTH = val;
    } else {
        const idx = args.indexOf('--max-depth');
        if (idx !== -1 && idx + 1 < args.length) {
            const val = parseInt(args[idx + 1], 10);
            if (!isNaN(val)) MAX_DEPTH = val;
        }
    }
}

const qsDepthArg = args.find(arg => arg.startsWith('--max-qs-depth'));
if (qsDepthArg) {
    if (qsDepthArg.includes('=')) {
        const val = parseInt(qsDepthArg.split('=')[1], 10);
        if (!isNaN(val)) MAX_QS_DEPTH = val;
    } else {
        const idx = args.indexOf('--max-qs-depth');
        if (idx !== -1 && idx + 1 < args.length) {
            const val = parseInt(args[idx + 1], 10);
            if (!isNaN(val)) MAX_QS_DEPTH = val;
        }
    }
}

const CONFIGURATIONS = [
    // Baseline
    { name: 'Recursive (Exhaustive)', strategy: 'recursive', maxDepth: MAX_DEPTH, options: { useAlphaBeta: false } },
    { name: 'ID (Exhaustive)', strategy: 'batched_pvs', maxDepth: MAX_DEPTH, options: { maxDepthQS: MAX_QS_DEPTH, useAlphaBeta: false, useMVVLVA: false, useTT: false, useKillers: false, useHistory: false, useLMP: false, useRFP: false, useFFP: false, useLMR: false, usePST: false } },
    // Phase 1: BPVS (AB + LMP = minimum viable batched search)
    { name: 'BPVS (ID + AB + LMP + Batches)', strategy: 'batched_pvs', maxDepth: MAX_DEPTH, options: { maxDepthQS: MAX_QS_DEPTH, useAlphaBeta: true, useMVVLVA: false, useTT: false, useKillers: false, useHistory: false, useLMP: true, useRFP: false, useFFP: false, useLMR: false, usePST: false } },
    // Phase 2: Move Ordering (improves AB cutoff efficiency)
    { name: '+ MVVLVA', strategy: 'batched_pvs', maxDepth: MAX_DEPTH, options: { maxDepthQS: MAX_QS_DEPTH, useAlphaBeta: true, useMVVLVA: true, useTT: false, useKillers: false, useHistory: false, useLMP: true, useRFP: false, useFFP: false, useLMR: false, usePST: false } },
    { name: '+ TT', strategy: 'batched_pvs', maxDepth: MAX_DEPTH, options: { maxDepthQS: MAX_QS_DEPTH, useAlphaBeta: true, useMVVLVA: true, useTT: true, useKillers: false, useHistory: false, useLMP: true, useRFP: false, useFFP: false, useLMR: false, usePST: false } },
    { name: '+ PST', strategy: 'batched_pvs', maxDepth: MAX_DEPTH, options: { maxDepthQS: MAX_QS_DEPTH, useAlphaBeta: true, useMVVLVA: true, useTT: true, useKillers: false, useHistory: false, useLMP: true, useRFP: false, useFFP: false, useLMR: false, usePST: true } },
    { name: '+ Killers', strategy: 'batched_pvs', maxDepth: MAX_DEPTH, options: { maxDepthQS: MAX_QS_DEPTH, useAlphaBeta: true, useMVVLVA: true, useTT: true, useKillers: true, useHistory: false, useLMP: true, useRFP: false, useFFP: false, useLMR: false, usePST: true } },
    { name: '+ History', strategy: 'batched_pvs', maxDepth: MAX_DEPTH, options: { maxDepthQS: MAX_QS_DEPTH, useAlphaBeta: true, useMVVLVA: true, useTT: true, useKillers: true, useHistory: true, useLMP: true, useRFP: false, useFFP: false, useLMR: false, usePST: true } },
    // Phase 3: Aggressive Pruning (safe because ordering is good)
    { name: '+ RFP', strategy: 'batched_pvs', maxDepth: MAX_DEPTH, options: { maxDepthQS: MAX_QS_DEPTH, useAlphaBeta: true, useMVVLVA: true, useTT: true, useKillers: true, useHistory: true, useLMP: true, useRFP: true, useFFP: false, useLMR: false, usePST: true } },
    { name: '+ FFP', strategy: 'batched_pvs', maxDepth: MAX_DEPTH, options: { maxDepthQS: MAX_QS_DEPTH, useAlphaBeta: true, useMVVLVA: true, useTT: true, useKillers: true, useHistory: true, useLMP: true, useRFP: true, useFFP: true, useLMR: false, usePST: true } },
    { name: '+ LMR', strategy: 'batched_pvs', maxDepth: MAX_DEPTH, options: { maxDepthQS: MAX_QS_DEPTH, useAlphaBeta: true, useMVVLVA: true, useTT: true, useKillers: true, useHistory: true, useLMP: true, useRFP: true, useFFP: true, useLMR: true, usePST: true } },
    // Reference
    { name: 'JS DFS Reference', strategy: 'standard', maxDepth: MAX_DEPTH, options: { maxDepthQS: MAX_QS_DEPTH, useAlphaBeta: true, useTT: true, useKillers: true, useHistory: true, useRFP: true, useFFP: true, useLMR: true, resetContext: true } },
];



async function runBenchmark() {
    if (!onlyQs) {
        console.log(`Starting Benchmark at Max Depth ${MAX_DEPTH} + QS ${MAX_QS_DEPTH}, with ${maxThreads} Threads...\n`);
        
        // Output headers for Markdown

        for (let i = 0; i < TEST_FENS.length; i++) {
            const testCase = TEST_FENS[i];
            
            console.log('### Board: ' + testCase.name + ': ' + testCase.fen);
            console.log('| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |');
            console.log('|---|---|---|---|---|---|');

            for (const config of CONFIGURATIONS) {
                // if ((i === 1 || i === 2) && config.name.includes('Exhaustive')) {
                //     // OOM
                //     console.log(`| ${config.name} | - | - | - | - | OOM |`);
                //     continue;
                // }
                const runOptions = { 
                    ...DEFAULT_OPTIONS, 
                    ...config.options, 
                    strategy: config.strategy || 'batched_pvs', 
                    maxDepth: config.maxDepth, 
                    maxThreads: maxThreads
                };

                // Force Garbage Collection to reset RSS baseline
                if (global.gc) {
                    global.gc();
                    await new Promise(resolve => setTimeout(resolve, 50));
                    global.gc();
                }

                // --- RSS Memory Tracking ---
                let peakRss = 0;
                const sampleRss = () => {
                    const rss = process.memoryUsage().rss;
                    if (rss > peakRss) peakRss = rss;
                };
                sampleRss(); // baseline
                const rssInterval = setInterval(sampleRss, 50);

                const start = performance.now();
                
                try {
                    let result;
                    if (config.strategy === 'standard') {
                        result = await find_best_move_std(testCase.fen, runOptions);
                    } else {
                        // Initialize engine instance per test
                        await init();
                        result = await find_best_move(testCase.fen, runOptions);
                    }
                    const end = performance.now();

                    clearInterval(rssInterval);
                    sampleRss(); // one final sample

                    const durationMs = end - start;
                    const peakMB = (peakRss / (1024 * 1024)).toFixed(1);
                    
                    const moveStr = result.move ? `${result.move.from}${result.move.to}` : (result.reason || 'none');
                    
                    console.log(`| ${config.name} | ${moveStr} | ${result.score} | ${result.nodes} | ${Math.round(durationMs)} | ${peakMB} |`);
                } catch (err) {
                    const peakMB = (peakRss / (1024 * 1024)).toFixed(1);
                    clearInterval(rssInterval);
                    console.log(`| ${config.name} | ERROR | ERROR | ERROR | ERROR | ${peakMB} |`);
                    console.error(err);
                } finally {
                    if (config.strategy !== 'standard') {
                        await close();
                    }
                }
            }
            console.log('\n');
        }
    }

    console.log("================================================================================\n");
    console.log("## QUIESCENCE SEARCH (QS) VS. DEPTH +1 COMPARISON\n");
    
    const QS_CONFIGURATIONS = [
        // Baseline configurations at MAX_DEPTH
        { name: `BPVS + LMR (${MAX_DEPTH} + QS=0)`, strategy: 'batched_pvs', maxDepth: MAX_DEPTH, options: { maxDepthQS: 0, useAlphaBeta: true, useMVVLVA: true, useTT: true, useKillers: true, useHistory: true, useLMP: true, useRFP: true, useFFP: true, useLMR: true, usePST: true } },
        { name: `BPVS + LMR (${MAX_DEPTH} + QS=1)`, strategy: 'batched_pvs', maxDepth: MAX_DEPTH, options: { maxDepthQS: 1, useAlphaBeta: true, useMVVLVA: true, useTT: true, useKillers: true, useHistory: true, useLMP: true, useRFP: true, useFFP: true, useLMR: true, usePST: true } },
        { name: `BPVS + LMR (${MAX_DEPTH} + QS=2)`, strategy: 'batched_pvs', maxDepth: MAX_DEPTH, options: { maxDepthQS: 2, useAlphaBeta: true, useMVVLVA: true, useTT: true, useKillers: true, useHistory: true, useLMP: true, useRFP: true, useFFP: true, useLMR: true, usePST: true } },
        
        // Depth + 1 configuration (to show if depth + QS is comparable/better than depth+1 + 0)
        { name: `BPVS + LMR (${MAX_DEPTH + 1} + QS=0)`, strategy: 'batched_pvs', maxDepth: MAX_DEPTH + 1, options: { maxDepthQS: 0, useAlphaBeta: true, useMVVLVA: true, useTT: true, useKillers: true, useHistory: true, useLMP: true, useRFP: true, useFFP: true, useLMR: true, usePST: true } },
        
        // Standard DFS Engine matching equivalents
        { name: `JS DFS (${MAX_DEPTH} + QS=0)`, strategy: 'standard', maxDepth: MAX_DEPTH, options: { maxDepthQS: 0, useAlphaBeta: true, useTT: true, useKillers: true, useHistory: true, useRFP: true, useFFP: true, useLMR: true, resetContext: true } },
        { name: `JS DFS (${MAX_DEPTH} + QS=1)`, strategy: 'standard', maxDepth: MAX_DEPTH, options: { maxDepthQS: 1, useAlphaBeta: true, useTT: true, useKillers: true, useHistory: true, useRFP: true, useFFP: true, useLMR: true, resetContext: true } },
        { name: `JS DFS (${MAX_DEPTH} + QS=2)`, strategy: 'standard', maxDepth: MAX_DEPTH, options: { maxDepthQS: 2, useAlphaBeta: true, useTT: true, useKillers: true, useHistory: true, useRFP: true, useFFP: true, useLMR: true, resetContext: true } },
        { name: `JS DFS (${MAX_DEPTH + 1} + QS=0)`, strategy: 'standard', maxDepth: MAX_DEPTH + 1, options: { maxDepthQS: 0, useAlphaBeta: true, useTT: true, useKillers: true, useHistory: true, useRFP: true, useFFP: true, useLMR: true, resetContext: true } }
    ];

    for (let i = 0; i < TEST_FENS.length; i++) {
        const testCase = TEST_FENS[i];
        
        console.log('### Board: ' + testCase.name + ': ' + testCase.fen);
        console.log('| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |');
        console.log('|---|---|---|---|---|---|');

        for (const config of QS_CONFIGURATIONS) {
            const runOptions = { 
                ...DEFAULT_OPTIONS, 
                ...config.options, 
                strategy: config.strategy || 'batched_pvs', 
                maxDepth: config.maxDepth, 
                maxThreads: maxThreads
            };

            // Force Garbage Collection to reset RSS baseline
            if (global.gc) {
                global.gc();
                await new Promise(resolve => setTimeout(resolve, 50));
                global.gc();
            }

            let peakRss = 0;
            const sampleRss = () => {
                const rss = process.memoryUsage().rss;
                if (rss > peakRss) peakRss = rss;
            };
            sampleRss();
            const rssInterval = setInterval(sampleRss, 50);

            const start = performance.now();
            
            try {
                let result;
                if (config.strategy === 'standard') {
                    result = await find_best_move_std(testCase.fen, runOptions);
                } else {
                    await init();
                    result = await find_best_move(testCase.fen, runOptions);
                }
                const end = performance.now();

                clearInterval(rssInterval);
                sampleRss();

                const durationMs = end - start;
                const peakMB = (peakRss / (1024 * 1024)).toFixed(1);
                const moveStr = result.move ? `${result.move.from}${result.move.to}` : (result.reason || 'none');
                
                console.log(`| ${config.name} | ${moveStr} | ${result.score} | ${result.nodes} | ${Math.round(durationMs)} | ${peakMB} |`);
            } catch (err) {
                const peakMB = (peakRss / (1024 * 1024)).toFixed(1);
                clearInterval(rssInterval);
                console.log(`| ${config.name} | ERROR | ERROR | ERROR | ERROR | ${peakMB} |`);
                console.error(err);
            } finally {
                if (config.strategy !== 'standard') {
                    await close();
                }
            }
        }
        console.log('\n');
    }
}

async function runThreadsBenchmark() {
    const threadCounts = [1, 2, 3, 4, 6, 8, 16];
    const targetDepth = MAX_DEPTH;
    console.log(`Starting Threads Benchmark at Depth ${targetDepth} for threads [${threadCounts.join(', ')}]...\n`);

    for (const threads of threadCounts) {
        const fileLines = [];
        fileLines.push("Precomputed tables initialized.");
        const startMsg = `Starting Benchmark at Depth ${targetDepth} with ${threads} Threads...`;
        console.log(startMsg);
        fileLines.push(startMsg);
        fileLines.push("");

        for (let i = 0; i < TEST_FENS.length; i++) {
            const testCase = TEST_FENS[i];
            
            const boardHeader = `### Board: ${testCase.name}: ${testCase.fen}`;
            console.log(boardHeader);
            fileLines.push(boardHeader);
            
            const tableHeader1 = `| Config | Move | Score | Nodes | Time (ms) | Peak RSS (MB) |`;
            const tableHeader2 = `|---|---|---|---|---|---|`;
            console.log(tableHeader1);
            console.log(tableHeader2);
            fileLines.push(tableHeader1);
            fileLines.push(tableHeader2);

            const runOptions = { 
                ...DEFAULT_OPTIONS, 
                maxDepthQS: 0, 
                useAlphaBeta: true, 
                useMVVLVA: true, 
                useTT: true, 
                useKillers: true, 
                useHistory: true, 
                useLMP: true, 
                useRFP: true, 
                useFFP: true, 
                useLMR: true, 
                usePST: true,
                strategy: 'batched_pvs', 
                maxDepth: targetDepth, 
                maxThreads: threads
            };

            // Force Garbage Collection to reset RSS baseline
            if (global.gc) {
                global.gc();
                await new Promise(resolve => setTimeout(resolve, 50));
                global.gc();
            }

            let peakRss = 0;
            const sampleRss = () => {
                const rss = process.memoryUsage().rss;
                if (rss > peakRss) peakRss = rss;
            };
            sampleRss();
            const rssInterval = setInterval(sampleRss, 50);

            const start = performance.now();
            
            try {
                await init();
                const result = await find_best_move(testCase.fen, runOptions);
                const end = performance.now();

                clearInterval(rssInterval);
                sampleRss();

                const durationMs = end - start;
                const peakMB = (peakRss / (1024 * 1024)).toFixed(1);
                const moveStr = result.move ? `${result.move.from}${result.move.to}` : (result.reason || 'none');
                
                const rowStr = `| + LMR | ${moveStr} | ${result.score} | ${result.nodes} | ${Math.round(durationMs)} | ${peakMB} |`;
                console.log(rowStr);
                fileLines.push(rowStr);
            } catch (err) {
                const peakMB = (peakRss / (1024 * 1024)).toFixed(1);
                clearInterval(rssInterval);
                const errRow = `| + LMR | ERROR | ERROR | ERROR | ERROR | ${peakMB} |`;
                console.log(errRow);
                fileLines.push(errRow);
                console.error(err);
            } finally {
                await close();
            }
            console.log('\n');
            fileLines.push("");
            fileLines.push("");
        }

        const completionMsg = "Benchmark Complete.";
        console.log(completionMsg);
        fileLines.push(completionMsg);
        fileLines.push("");

        // Write to file
        const filePath = path.join(__dirname, 'threads', `benchmark.results.threads_${threads}.md`);
        fs.writeFileSync(filePath, fileLines.join('\n'));
        console.log(`Saved results for ${threads} threads to ${filePath}\n`);
    }
}

const mainPromise = onlyThreads ? runThreadsBenchmark() : runBenchmark();

mainPromise.then(() => {
    console.log("Benchmark Complete.");
    process.exit(0);
}).catch((e) => {
    console.error(e);
    process.exit(1);
});
