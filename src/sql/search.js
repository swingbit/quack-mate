/**
 * ROUTER FOR SEARCH ALGORITHMS
 * 
 * Re-exports the recursive (CTE-based) search engine and 
 * the persistent (table-based, unrolled BPSV) search engine.
 */

export {
    getRecursiveSearchQuery
} from './search-recursive.js';

export {
    getMergeTT_SQL,
    getLMPFilterSQL,
    getFFPFilterSQL,
    getRFPUpdateSQL,
    getRFPDeleteSQL,
    getLMRCheckSQL,
    getLMRPruneSQL,
    getMoveOrderingScoreSQL,
    getTTJoinSQL,
    getMoveOrderingHeuristicJoinsSQL,
    getPersistentExpansionSQL,
    getPersistentMinimaxSQL,
    getUpdateHistorySQL,
    getBatchUpdateKillersSQL,
    getQSInitSQL,
    getQSExpansionSQL,
    getQSMinimaxBackpropSQL,
    getApplyQSEvalToMainTreeSQL
} from './search-persistent.js';
