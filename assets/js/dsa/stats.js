/* ==========================================================================
   E3 Fiber Connect - dsa/stats.js
   Mga counter ng operations, para makita sa bawat page kung magkano talaga yung cost ng algorithm.

   dsaLastRun   pinupunan ng bawat search at sort: pangalan ng algorithm, ilang
                comparisons at ilang moves (swaps / shifts).
   DSA_LOG      yung mga pinakabagong operation na nakikita ng user (ring-buffer queue
                galing sa queue.js), pinapakita sa admin "Algorithms" page.
   ========================================================================== */

'use strict';

const dsaLastRun = { algorithm: '', comparisons: 0, moves: 0 };

const DSA_LOG = createQueue(40);

/**
 * recordRun - tandaan yung cost ng search o sort na katatapos lang.
 * Time: O(1), Space: O(1)
 */
function recordRun(algorithm, comparisons, moves) {
  dsaLastRun.algorithm = algorithm;
  dsaLastRun.comparisons = comparisons;
  dsaLastRun.moves = moves;
}

/**
 * logOperation - magdagdag ng isang line sa log ng Algorithms page; pag puno na
 * yung log, matatanggal yung pinakalumang line (enqueueBounded).
 * Time: O(1), Space: O(1)
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
 * logLastRun - i-log kung ano man yung na-record ng huling search o sort sa dsaLastRun.
 * Time: O(1)
 */
function logLastRun(context, n, milliseconds) {
  logOperation(dsaLastRun.algorithm, context, n, dsaLastRun.comparisons, dsaLastRun.moves, milliseconds);
}

/** stopwatchStart / stopwatchMs - pang-time ng operation gamit yung high-resolution clock. */
function stopwatchStart() {
  return performance.now();
}

function stopwatchMs(startedAt) {
  return performance.now() - startedAt;
}
