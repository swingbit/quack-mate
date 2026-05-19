import { init, find_best_move } from '../src/quackmate-node.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const MAX_MOVES = 5;

async function runTest() {
    console.log('Initializing self-play database...');
    await init();
    console.log('Database initialized successfully.');

    let currentFEN = START_FEN;
    for (let i = 0; i < MAX_MOVES; i++) {
        const result = await find_best_move(currentFEN);
        console.log(`Move ${i + 1}: ${result.move?.from}-${result.move?.to} (Score: ${result.score}, Nodes: ${result.nodes})`);
        console.log(`New FEN: ${result.fen}`);
        currentFEN = result.fen;
    }

    console.log('\n======================================');
    console.log('Self-Play Verification Successful!');
    console.log('======================================');
}

runTest().catch(err => {
    console.error('Self-play test failed:');
    console.error(err);
    process.exit(1);
});
