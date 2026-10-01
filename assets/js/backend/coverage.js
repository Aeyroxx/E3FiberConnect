/* ==========================================================================
   E3 Fiber Connect - backend/coverage.js
   "May fiber na ba sa barangay ko?" - binary search sa naka-sort na BARANGAYS
   table para sa exact na pangalan, linear text search naman para sa suggestions.
   ========================================================================== */

'use strict';

/**
 * normalizeBarangayName - "  Brgy.  POBLACION " -> "poblacion" (yung key sa table).
 * Time: O(n), Space: O(n)
 */
function normalizeBarangayName(value) {
  let name = toLowerText(collapseSpaces(value));
  const prefixes = ['barangay ', 'brgy. ', 'brgy.', 'brgy '];
  for (let i = 0; i < prefixes.length; i++) {
    if (textStartsWith(name, prefixes[i])) {
      name = trimText(textSlice(name, prefixes[i].length));
      break;
    }
  }
  return name;
}

/**
 * findBarangay - yung barangay record ng tinype na pangalan, o null kung wala.
 * Binary search sa `key` field (naka-sort kasi by key yung BARANGAYS).
 * Time: O(log n), Space: O(1)
 */
function findBarangay(name) {
  const index = binarySearch(BARANGAYS, 'key', normalizeBarangayName(name));
  return index === -1 ? null : BARANGAYS[index];
}

/**
 * suggestBarangays - hanggang `limit` na barangay na may laman ng query sa pangalan
 * ("san" -> San Gabriel, San Jose Patag, San Vicente ...).
 * Linear search + naive string matching. Time: O(n²), Space: O(n)
 */
function suggestBarangays(query, limit) {
  const matches = textSearchRecords(BARANGAYS, ['name'], normalizeBarangayName(query));
  return arrayRange(matches, 0, limit);
}

/**
 * listBarangays - pwedeng "all", "available" o "coming-soon".
 * Time: O(n), Space: O(n)
 */
function listBarangays(filter) {
  if (filter === 'available' || filter === 'coming-soon') {
    return linearSearchAll(BARANGAYS, 'status', filter);
  }
  return arrayCopy(BARANGAYS);
}

/** coverageSummary - mga bilang para sa coverage page. Time: O(n), Space: O(1) */
function coverageSummary() {
  let available = 0;
  let accessPoints = 0;
  for (let i = 0; i < BARANGAYS.length; i++) {
    if (BARANGAYS[i].status === 'available') {
      available++;
      accessPoints += BARANGAYS[i].accessPoints;
    }
  }
  return { total: BARANGAYS.length, available: available, comingSoon: BARANGAYS.length - available, accessPoints: accessPoints };
}

/** isBarangayServiceable - true kung may fiber na talaga dun. O(log n) */
function isBarangayServiceable(name) {
  const record = findBarangay(name);
  return record !== null && record.status === 'available';
}

/**
 * coverageDetail - yung sentence na nakikita ng staff sa application, halimbawa:
 * "Available - 12 fiber access points in Brgy. Poblacion".
 * Time: O(log n)
 */
function coverageDetail(name) {
  const record = findBarangay(name);
  if (!record) {
    return { tone: 'red', text: 'Unknown barangay' };
  }
  if (record.status === 'available') {
    return { tone: 'green', text: 'Available — ' + pluralize(record.accessPoints, 'fiber access point') + ' in Brgy. ' + record.name };
  }
  return { tone: 'orange', text: 'Not yet available — fiber survey in progress in Brgy. ' + record.name };
}
