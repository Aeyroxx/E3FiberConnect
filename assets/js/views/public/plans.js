/* ==========================================================================
   E3 Fiber Connect · views/public/plans.js
   Plans page: the recommender (linear search for the first plan that is
   fast enough), plan cards sorted with SELECTION SORT, and a comparison table.
   Defense module: Plan Selection — presented by Joshua Santos.
   ========================================================================== */

'use strict';

const plansViewState = { devices: '4-6', activity: 'streaming', sort: 'speed-asc', recommendedId: '' };

function renderRecommendation() {
  const result = recommendPlan(plansViewState.devices, plansViewState.activity);
  const plan = result.plan;
  plansViewState.recommendedId = plan.id;
  markSegment(byId('recDevices'), plansViewState.devices);
  markSegment(byId('recActivity'), plansViewState.activity);
  setHTML('recResult',
    '<div class="flex-grow-1">'
    + '<p class="plan-flag text-green">Recommended for you</p>'
    + '<p class="plan-name">' + escapeHTML(plan.name) + '</p>'
    + '<p class="plan-speed"><strong>' + plan.speed + '</strong><span>Mbps</span></p>'
    + '<p class="caption-text mt-1">About ' + result.neededMbps + ' Mbps for ' + escapeHTML(result.range.label) + ' devices mainly used for '
    + escapeHTML(toLowerText(result.activity.label)) + '. Found by checking ' + pluralize(result.checked, 'plan') + ' in speed order (linear search).</p>'
    + '<a class="btn btn-accent btn-sm mt-3" href="#/apply/' + plan.id + '">Choose ' + escapeHTML(plan.name) + ' · ' + formatPeso(plan.price) + '/mo</a>'
    + '</div>');
}

function renderPlansRail() {
  const sortChoice = splitSortValue(plansViewState.sort);
  const started = stopwatchStart();
  const sorted = selectionSort(PLANS, sortChoice.field, sortChoice.order);
  const ms = stopwatchMs(started);
  logOperation('Selection sort', 'Plans page', PLANS.length, dsaLastRun.comparisons, dsaLastRun.moves, ms);
  let html = '';
  for (let i = 0; i < sorted.length; i++) {
    html += planTileHTML(sorted[i], 'plans', plansViewState.recommendedId);
  }
  setHTML('plansRail', html);
  setText('plansSortNote', 'Sorted with selection sort: ' + pluralize(dsaLastRun.comparisons, 'comparison') + ', ' + pluralize(dsaLastRun.moves, 'swap') + '.');
}

const COMPARE_ROWS = [
  { key: 'speed', label: 'Download speed' },
  { key: 'price', label: 'Monthly price' },
  { key: 'bestFor', label: 'Best for' },
  { key: 'devices', label: 'Devices' },
  { key: 'dataCap', label: 'Data cap' },
  { key: 'installation', label: 'Installation' },
  { key: 'lockIn', label: 'Lock-in period' },
];

/** compareCellHTML — the text for one cell of the comparison table. O(1) */
function compareCellHTML(plan, key) {
  if (key === 'speed') {
    return '<strong>' + plan.speed + ' Mbps</strong>';
  }
  if (key === 'price') {
    return formatPeso(plan.price);
  }
  if (key === 'bestFor') {
    return escapeHTML(plan.bestFor);
  }
  if (key === 'devices') {
    return escapeHTML(plan.devices);
  }
  if (key === 'installation') {
    return 'Free or low-cost';
  }
  return 'None'; // data cap and lock-in period
}

function renderCompareTable() {
  let head = '<thead><tr><th scope="col"><span class="visually-hidden">Feature</span></th>';
  for (let i = 0; i < PLANS.length; i++) {
    head += '<th scope="col">' + escapeHTML(PLANS[i].name) + '</th>';
  }
  head += '</tr></thead>';
  let body = '<tbody>';
  for (let r = 0; r < COMPARE_ROWS.length; r++) {
    body += '<tr><th scope="row">' + escapeHTML(COMPARE_ROWS[r].label) + '</th>';
    for (let i = 0; i < PLANS.length; i++) {
      body += '<td>' + compareCellHTML(PLANS[i], COMPARE_ROWS[r].key) + '</td>';
    }
    body += '</tr>';
  }
  body += '<tr><th scope="row"><span class="visually-hidden">Apply</span></th>';
  for (let i = 0; i < PLANS.length; i++) {
    body += '<td><a class="btn btn-tinted btn-xs" href="#/apply/' + PLANS[i].id + '">Choose</a></td>';
  }
  body += '</tr></tbody>';
  setHTML('plansCompare', head + body);
}

function renderPlansView() {
  renderRecommendation();
  renderPlansRail();
  renderCompareTable();
}

function initPlansView() {
  onSegmentChange(byId('recDevices'), function (value) {
    plansViewState.devices = value;
    renderRecommendation();
    renderPlansRail();
  });
  onSegmentChange(byId('recActivity'), function (value) {
    plansViewState.activity = value;
    renderRecommendation();
    renderPlansRail();
  });
  byId('plansSort').addEventListener('change', function (event) {
    plansViewState.sort = event.target.value;
    renderPlansRail();
  });
}
