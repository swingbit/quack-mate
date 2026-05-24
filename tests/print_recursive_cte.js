import { getRecursiveSearchQuery } from '../src/sql/search.js';

const args = process.argv.slice(2);
if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    console.error('Usage: node tests/print_recursive_cte.js <depth>');
    console.error('Example: node tests/print_recursive_cte.js 3');
    process.exit(1);
}

const depth = parseInt(args[0], 10);
if (isNaN(depth) || depth < 1) {
    console.error('Error: Depth must be a positive integer.');
    console.error('Usage: node tests/print_recursive_cte.js <depth>');
    process.exit(1);
}

try {
    const sql = getRecursiveSearchQuery(depth, true);
    console.log(sql);
} catch (e) {
    console.error('Error generating query:', e.message);
    process.exit(1);
}
