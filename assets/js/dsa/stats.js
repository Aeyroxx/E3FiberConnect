/* ==========================================================================
   E3 Fiber Connect · dsa/stats.js
   Operation counters, so every page can show what an algorithm really cost.

   dsaLastRun   filled in by every search and sort: algorithm name, number of
                comparisons and number of moves (swaps / shifts).
   DSA_LOG      the latest user-visible operations (a ring-buffer queue from
                queue.js), shown on the admin "Algorithms" page.
   ========================================================================== */

'use strict';

const dsaLastRun = { algorithm: '', comparisons: 0, moves: 0 };

const DSA_LOG = createQueue(40);

/**
 * recordRun — remember the cost of the search or sort that just finished.
 * Time O(1) · Space O(1)
 */
function recordRun(algorithm, comparisons, moves) {
  dsaLastRun.algorithm = algorithm;
  dsaLastRun.comparisons = comparisons;
  dsaLastRun.moves = moves;
}

/**
 * logOperation — add one line to the Algorithms page log; when the log is
 * full, the oldest line is dropped (enqueueBounded).
 * Time O(1) · Space O(1)
 */
function logOperation(algorithm, context, n, comparisons, moves, milliseconds) {
  enqueueBounded(DSA_LOG, {
    algorithm: algorithm,
    context: context,
    n: n,
    comparisons: comparisons,
    moves: moves,
    ms: milliseconds,
    at: Date.now(),
  });
}

/**
 * logLastRun — log whatever the last search or sort recorded in dsaLastRun.
 * Time O(1)
 */
function logLastRun(context, n, milliseconds) {
  logOperation(dsaLastRun.algorithm, context, n, dsaLastRun.comparisons, dsaLastRun.moves, milliseconds);
}

/** stopwatchStart / stopwatchMs — time an operation with the high-resolution clock. */
function stopwatchStart() {
  return performance.now();
}

function stopwatchMs(startedAt) {
  return performance.now() - startedAt;
}
