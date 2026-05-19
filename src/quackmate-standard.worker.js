/**
 * quackmate-standard.worker.js
 * 
 * Web Worker for running the Standard JS Chess Engine off the main thread.
 * Handles 'init' and 'search' messages.
 */

import { init, find_best_move } from './quackmate-standard.js';

let isInitialized = false;

self.onmessage = async (e) => {
    const { type, id } = e.data;

    try {
        if (type === 'init') {
            await init();
            isInitialized = true;
            self.postMessage({ type: 'init_ack', id });
        } else if (type === 'search') {
            if (!isInitialized) await init();
            
            const { fen, options } = e.data;
            // Run search (this blocks the worker thread, but not UI)
            const result = await find_best_move(fen, options);
            
            self.postMessage({ type: 'search_result', id, result });
        } else {
            throw new Error(`Unknown message type: ${type}`);
        }
    } catch (err) {
        self.postMessage({ type: 'error', id, error: err.toString() });
    }
};
