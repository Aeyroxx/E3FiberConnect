/* ==========================================================================
   E3 Fiber Connect · views/admin/algorithms.js
   A window into the data structures: live sizes of every array, stack, queue
   and the hash table; the log of recent searches and sorts; and a benchmark
   that races the algorithms on the same random data.
   ========================================================================== */

'use strict';

const benchmarkState = { size: 1000, running: false };

function dsBoxes(labels, highlightFirst) {
  let html = '';
  for (let i = 0; i < labels.length; i++) {
    html += '<span class="ds-box' + (highlightFirst && i === 0 ? ' is-top' : '') + '">' + escapeHTML(labels[i]) + '</span>';
  }
  return html || '<span class="caption-text">empty</span>';
}

function dsCard(iconName, tone, title, text, visual) {
  return '<div class="ds-card"><div class="d-flex align-items-center gap-2"><span class="icon-bubble tone-' + tone + '">' + iconHTML(iconName) + '</span>'
    + '<p class="panel-title">' + escapeHTML(title) + '</p></div>'
    + '<p class="caption-text">' + text + '</p><div class="ds-visual">' + visual + '</div></div>';
}

function renderAlgorithmStructures() {
  const tables = [
    'applications ' + applications.length, 'subscribers ' + subscribers.length, 'bills ' + bills.length,
    'payments ' + payments.length, 'tickets ' + tickets.length, 'staff ' + staffMembers.length,
    'registrations ' + registrations.length, 'activity ' + activityLog.length,
  ];
  const undo = undoEntries();
  const undoLabels = [];
  for (let i = 0; i < undo.length && i < 6; i++) {
    arrayAppend(undoLabels, undo[i].label);
  }
  const back = stackToArray(routerState.backStack);
  const backLabels = [];
  for (let i = 0; i < back.length && i < 6; i++) {
    arrayAppend(backLabels, back[i].title);
  }
  const review = queueToArray(buildReviewQueue());
  const reviewLabels = [];
  for (let i = 0; i < review.length; i++) {
    arrayAppend(reviewLabels, textSlice(review[i].referenceNo, 8));
  }
  const support = queueToArray(buildSupportQueue());
  const supportLabels = [];
  for (let i = 0; i < support.length; i++) {
    arrayAppend(supportLabels, support[i].ticketNo);
  }
  const stats = hashStats(staffEmailIndex);
  const referenceStats = hashStats(paymentReferenceIndex);
  const waitingPayments = queueToArray(paymentsQueue());
  const paymentLabels = [];
  for (let i = 0; i < waitingPayments.length; i++) {
    arrayAppend(paymentLabels, waitingPayments[i].paymentId);
  }
  const waitingRequests = queueToArray(registrationQueue());
  const requestLabels = [];
  for (let i = 0; i < waitingRequests.length; i++) {
    arrayAppend(requestLabels, waitingRequests[i].registrationId);
  }

  setHTML('algoStructures',
    dsCard('layers', 'blue', 'Arrays — the database', 'Eight tables, each kept sorted by its key so binary search works.', dsBoxes(tables, false))
    + dsCard('undo', 'red', 'Stack — Undo', stackSize(undoStack) + ' of ' + UNDO_LIMIT + ' actions. Push on every change, pop on Undo, peek for the button label.', dsBoxes(undoLabels, true))
    + dsCard('chevron-left', 'purple', 'Stack — Back button', stackSize(routerState.backStack) + ' screens remembered with their scroll position.', dsBoxes(backLabels, true))
    + dsCard('queue', 'orange', 'Queue — Review', 'Pending applications, oldest at the front (circular buffer).', dsBoxes(reviewLabels, true))
    + dsCard('ticket', 'teal', 'Queue — Support', 'Open tickets; “Serve next” dequeues the front.', dsBoxes(supportLabels, true))
    + dsCard('card', 'orange', 'Queue — Payment validation', 'Customer reports, oldest at the front; the front one is checked first.', dsBoxes(paymentLabels, true))
    + dsCard('key', 'purple', 'Queue — Staff requests', 'Registrations waiting for an Owner or Admin, first come, first served.', dsBoxes(requestLabels, true))
    + dsCard('hash', 'green', 'Hash table — Staff e-mails', stats.size + ' e-mails in ' + stats.buckets + ' buckets · load ' + (Math.round(stats.loadFactor * 100) / 100) + ' · longest chain ' + stats.longestChain + ' · ' + pluralize(stats.collisions, 'collision') + '.',
      dsBoxes(['djb2 hash', 'separate chaining', 'resize at 0.75'], false))
    + dsCard('hash', 'teal', 'Hash table — Payment references', referenceStats.size + ' references in ' + referenceStats.buckets + ' buckets · load ' + (Math.round(referenceStats.loadFactor * 100) / 100) + ' · longest chain ' + referenceStats.longestChain + '. Finds a re-used reference in one look-up.',
      dsBoxes(['key “METHOD:REFERENCE”', 'value: payment ids'], false)));
}

function renderAlgorithmLog() {
  const entries = queueToArray(DSA_LOG);
  let html = '';
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    html += '<tr><td class="cell-main"><span class="cell-primary">' + escapeHTML(entry.algorithm) + '</span></td>'
      + '<td data-label="Where">' + escapeHTML(entry.context) + '</td>'
      + '<td data-label="n" class="num">' + formatNumber(entry.n) + '</td>'
      + '<td data-label="Comparisons" class="num">' + formatNumber(entry.comparisons) + '</td>'
      + '<td data-label="Moves" class="num">' + formatNumber(entry.moves) + '</td>'
      + '<td data-label="Time" class="num">' + escapeHTML(formatMs(entry.ms)) + '</td></tr>';
  }
  setHTML('algoLog', html || '<tr><td colspan="6" class="text-center caption-text py-4">Search or sort a list to see it here.</td></tr>');
}

/** makeBenchmarkData — n records with random values, identical for every algorithm. O(n) */
function makeBenchmarkData(n) {
  const records = [];
  for (let i = 0; i < n; i++) {
    arrayAppend(records, { value: Math.floor(Math.random() * n * 10) });
  }
  return records;
}

function benchRowHTML(name, value, max, detail) {
  const width = max > 0 ? Math.max(1, Math.round((value / max) * 100)) : 0;
  return '<div class="bench-row"><span class="bench-name">' + escapeHTML(name) + '</span>'
    + '<span class="bench-bar"><span class="bench-fill" data-width="' + width + '"></span></span>'
    + '<span class="bench-value">' + escapeHTML(detail) + '</span></div>';
}

function runBenchmark() {
  const n = benchmarkState.size;
  const data = makeBenchmarkData(n);
  const sortedData = insertionSort(data, 'value', 'asc');

  // Searching: 200 look-ups of values that exist, with each algorithm.
  const lookups = 200;
  let linearTotal = 0;
  let binaryTotal = 0;
  let started = stopwatchStart();
  for (let i = 0; i < lookups; i++) {
    linearSearch(data, 'value', data[Math.floor(Math.random() * n)].value);
    linearTotal += dsaLastRun.comparisons;
  }
  const linearMs = stopwatchMs(started);
  started = stopwatchStart();
  for (let i = 0; i < lookups; i++) {
    binarySearch(sortedData, 'value', sortedData[Math.floor(Math.random() * n)].value);
    binaryTotal += dsaLastRun.comparisons;
  }
  const binaryMs = stopwatchMs(started);
  const linearAvg = Math.round(linearTotal / lookups);
  const binaryAvg = Math.max(1, Math.round(binaryTotal / lookups));
  logOperation('Linear search', 'Benchmark (avg of 200)', n, linearAvg, 0, linearMs / lookups);
  logOperation('Binary search', 'Benchmark (avg of 200)', n, binaryAvg, 0, binaryMs / lookups);

  // Sorting: the same unsorted data for all three.
  const results = [];
  for (let i = 0; i < SORT_ALGORITHMS.length; i++) {
    const info = SORT_ALGORITHMS[i];
    started = stopwatchStart();
    sortRecords(data, 'value', 'asc', info.id);
    const ms = stopwatchMs(started);
    arrayAppend(results, { name: info.name, comparisons: dsaLastRun.comparisons, moves: dsaLastRun.moves, ms: ms });
    logOperation(info.name, 'Benchmark', n, dsaLastRun.comparisons, dsaLastRun.moves, ms);
  }
  let maxComparisons = 0;
  for (let i = 0; i < results.length; i++) {
    if (results[i].comparisons > maxComparisons) {
      maxComparisons = results[i].comparisons;
    }
  }
  let html = '<p class="form-label mt-1">Searching ' + formatNumber(n) + ' records — average comparisons per look-up</p>'
    + benchRowHTML('Linear search', linearAvg, linearAvg, formatNumber(linearAvg) + ' · O(n)')
    + benchRowHTML('Binary search', binaryAvg, linearAvg, formatNumber(binaryAvg) + ' · O(log n)')
    + '<p class="form-label mt-3">Sorting ' + formatNumber(n) + ' records — comparisons</p>';
  for (let i = 0; i < results.length; i++) {
    html += benchRowHTML(results[i].name, results[i].comparisons, maxComparisons, formatNumber(results[i].comparisons) + ' · ' + formatMs(results[i].ms));
  }
  html += '<p class="caption-text mt-2">Moves (swaps or shifts): ';
  for (let i = 0; i < results.length; i++) {
    html += (i > 0 ? ' · ' : '') + escapeHTML(results[i].name) + ' ' + formatNumber(results[i].moves);
  }
  html += '. Binary search needs the data sorted first; selection sort always makes n(n−1)/2 comparisons.</p>';
  setHTML('benchResults', html);
  requestAnimationFrame(function () {
    const fills = qsa('.bench-fill', byId('benchResults'));
    for (let i = 0; i < fills.length; i++) {
      fills[i].style.width = fills[i].getAttribute('data-width') + '%';
    }
  });
  renderAlgorithmLog();
}

function renderAlgorithmsView() {
  renderAdminChrome();
  markSegment(byId('benchSize'), String(benchmarkState.size));
  renderAlgorithmStructures();
  renderAlgorithmLog();
}

function initAlgorithmsView() {
  onSegmentChange(byId('benchSize'), function (value) {
    benchmarkState.size = Number(value);
  });
  onClick('benchRun', function () {
    if (benchmarkState.running) {
      return;
    }
    benchmarkState.running = true;
    const button = byId('benchRun');
    button.disabled = true;
    setHTML('benchResults', '<p class="caption-text">Running on ' + formatNumber(benchmarkState.size) + ' records…</p>');
    setTimeout(function () {
      runBenchmark();
      benchmarkState.running = false;
      button.disabled = false;
    }, 30);
  });
}
