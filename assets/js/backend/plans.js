/* ==========================================================================
   E3 Fiber Connect - backend/plans.js
   Dito yung plan lookups, labels, at yung "which plan is right for me?" na recommender.
   Module sa defense: Plan Selection (si Joshua Santos ang mag-eexplain)
   ========================================================================== */

'use strict';

// Gaano kabilis yung kailangan ng bawat device para sa main na gamit sa bahay.
const PLAN_ACTIVITIES = [
  { id: 'browsing', label: 'Browsing & social', mbpsPerDevice: 4 },
  { id: 'streaming', label: 'Streaming', mbpsPerDevice: 8 },
  { id: 'work', label: 'Work & school', mbpsPerDevice: 10 },
  { id: 'gaming', label: 'Gaming & downloads', mbpsPerDevice: 16 },
];

const DEVICE_RANGES = [
  { id: '1-3', label: '1–3', devices: 3 },
  { id: '4-6', label: '4–6', devices: 6 },
  { id: '7-10', label: '7–10', devices: 10 },
  { id: '11+', label: '11+', devices: 14 },
];

/**
 * findPlan - yung plan record ng id ("power"), o null.
 * Linear search lang - 5 items lang naman yung PLANS. Time: O(n), Space: O(1)
 */
function findPlan(planId) {
  const index = linearSearch(PLANS, 'id', planId);
  return index === -1 ? null : PLANS[index];
}

/** planPrice - monthly na presyo in pesos; pag "custom" plan, yung presyong tinype ng staff. O(n) */
function planPrice(planId, customPrice) {
  if (planId === 'custom') {
    return Number(customPrice) || 0;
  }
  const plan = findPlan(planId);
  return plan ? plan.price : 0;
}

/** planName - "Power" (o "Custom"). O(n) */
function planName(planId) {
  if (planId === 'custom') {
    return 'Custom';
  }
  const plan = findPlan(planId);
  return plan ? plan.name : 'Unknown';
}

/** planSpeedText - "100 Mbps" (o "Custom speed"). O(n) */
function planSpeedText(planId) {
  const plan = findPlan(planId);
  return plan ? plan.speed + ' Mbps' : 'Custom speed';
}

/** planLabel - "Power · 100 Mbps · ₱1,200/mo" o "Custom · ₱1,800/mo". O(n) */
function planLabel(planId, customPrice) {
  if (planId === 'custom') {
    return 'Custom · ' + formatPeso(customPrice) + '/mo';
  }
  const plan = findPlan(planId);
  if (!plan) {
    return 'No plan';
  }
  return plan.name + ' · ' + plan.speed + ' Mbps · ' + formatPeso(plan.price) + '/mo';
}

/** sortedPlans - yung plans naka-order by field gamit yung napiling sorting algorithm. O(n²) */
function sortedPlans(field, order, algorithmId) {
  return sortRecords(PLANS, field, order, algorithmId);
}

/** findActivity / findDeviceRange - mga lookup para sa recommender (linear search). O(n) */
function findActivity(activityId) {
  const index = linearSearch(PLAN_ACTIVITIES, 'id', activityId);
  return index === -1 ? PLAN_ACTIVITIES[0] : PLAN_ACTIVITIES[index];
}

function findDeviceRange(rangeId) {
  const index = linearSearch(DEVICE_RANGES, 'id', rangeId);
  return index === -1 ? DEVICE_RANGES[0] : DEVICE_RANGES[index];
}

/**
 * recommendPlan - yung pinakamabagal (pinakamura) na plan na sapat pa rin ang bilis.
 * Kailangang speed = devices × Mbps per device para sa main activity; tapos linear
 * search sa plans na naka-order by speed, titigil sa unang plan na ang speed ay
 * at least ganun (kung wala, yung pinakamabilis na plan ang ibabalik).
 * Time: O(n) (naka-order na by speed yung plans, kaya O(n) lang yung insertion sort), Space: O(n)
 */
function recommendPlan(rangeId, activityId) {
  const range = findDeviceRange(rangeId);                  // 1. yung mga sagot: ilang devices...
  const activity = findActivity(activityId);               //    ...at saan madalas ginagamit
  const needed = range.devices * activity.mbpsPerDevice;   // 2. kailangang speed = devices × Mbps per device
  const bySpeed = insertionSort(PLANS, 'speed', 'asc');    // 3. plans mula pinakamabagal (pinakamura) hanggang pinakamabilis
  let checked = 0;
  for (let i = 0; i < bySpeed.length; i++) {               // 4. linear search: unang plan na sapat ang bilis
    checked++;
    if (bySpeed[i].speed >= needed) {
      return { plan: bySpeed[i], neededMbps: needed, checked: checked, range: range, activity: activity };
    }
  }
  // 5. walang plan na sapat ang bilis -> yung pinakamabilis na lang i-recommend
  return { plan: bySpeed[bySpeed.length - 1], neededMbps: needed, checked: checked, range: range, activity: activity };
}
