
import { getRecursiveSearchQuery } from '../src/sql/search.js';

// Default to DuckDB logic implicitly
try {
    const sql = getRecursiveSearchQuery(1, true, 10);
    console.log(sql);
} catch (e) {
    console.error(e);
}
