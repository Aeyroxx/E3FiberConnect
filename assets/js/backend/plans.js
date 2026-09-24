/* ==========================================================================
   E3 Fiber Connect · backend/plans.js
   Plan look-ups, labels and the "which plan is right for me?" recommender.
   Defense module: Plan Selection — presented by Joshua Santos.
   ========================================================================== */

'use strict';

// How much speed each device needs for the main activity at home.
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
 * findPlan — the plan record for an id ("power"), or null.
 * Linear search — PLANS has only 5 items. Time O(n) · Space O(1)
 */
function findPlan(planId) {
  const index = linearSearch(PLANS, 'id', planId);
  return index === -1 ? null : PLANS[index];
}

/** planPrice — monthly price in pesos; "custom" plans use the price typed by staff. O(n) */
function planPrice(planId, customPrice) {
  if (planId === 'custom') {
    return Number(customPrice) || 0;
  }
  const plan = findPlan(planId);
  return plan ? plan.price : 0;
}

/** planName — "Power" (or "Custom"). O(n) */
function planName(planId) {
  if (planId === 'custom') {
    return 'Custom';
  }
  const plan = findPlan(planId);
  return plan ? plan.name : 'Unknown';
}

/** planSpeedText — "100 Mbps" (or "Custom speed"). O(n) */
function planSpeedText(planId) {
  const plan = findPlan(planId);
  return plan ? plan.speed + ' Mbps' : 'Custom speed';
}

/** planLabel — "Power · 100 Mbps · ₱1,200/mo" or "Custom · ₱1,800/mo". O(n) */
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

/** sortedPlans — the plans ordered by a field with the chosen sorting algorithm. O(n²) */
function sortedPlans(field, order, algorithmId) {
  return sortRecords(PLANS, field, order, algorithmId);
}

/** findActivity / findDeviceRange — look-ups for the recommender (linear search). O(n) */
function findActivity(activityId) {
  const index = linearSearch(PLAN_ACTIVITIES, 'id', activityId);
  return index === -1 ? PLAN_ACTIVITIES[0] : PLAN_ACTIVITIES[index];
}

function findDeviceRange(rangeId) {
  const index = linearSearch(DEVICE_RANGES, 'id', rangeId);
  return index === -1 ? DEVICE_RANGES[0] : DEVICE_RANGES[index];
}

/**
 * recommendPlan — the slowest (cheapest) plan that is still fast enough.
 * needed speed = devices × Mbps per device for the main activity; then a
 * linear search over the plans in speed order stops at the first plan whose
 * speed is at least that much (or returns the fastest plan).
 * Time O(n) (plans are already in speed order, so insertion sort is O(n)) · Space O(n)
 */
function recommendPlan(rangeId, activityId) {
  const range = findDeviceRange(rangeId);                  // 1. the answers: how many devices …
  const activity = findActivity(activityId);               //    … and what they are mostly used for
  const needed = range.devices * activity.mbpsPerDevice;   // 2. speed needed = devices × Mbps per device
  const bySpeed = insertionSort(PLANS, 'speed', 'asc');    // 3. plans from slowest (cheapest) to fastest
  let checked = 0;
  for (let i = 0; i < bySpeed.length; i++) {               // 4. linear search: the first plan fast enough
    checked++;
    if (bySpeed[i].speed >= needed) {
      return { plan: bySpeed[i], neededMbps: needed, checked: checked, range: range, activity: activity };
    }
  }
  // 5. no plan is fast enough → recommend the fastest one
  return { plan: bySpeed[bySpeed.length - 1], neededMbps: needed, checked: checked, range: range, activity: activity };
}
