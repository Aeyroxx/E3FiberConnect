/* ==========================================================================
   E3 Fiber Connect · backend/coverage.js
   "Is fiber available in my barangay?" — binary search on the sorted
   BARANGAYS table for exact names, linear text search for suggestions.
   ========================================================================== */

'use strict';

/**
 * normalizeBarangayName — "  Brgy.  POBLACION " → "poblacion" (the table key).
 * Time O(n) · Space O(n)
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
 * findBarangay — the barangay record for a typed name, or null.
 * Binary search on the `key` field (BARANGAYS is sorted by it).
 * Time O(log n) · Space O(1)
 */
function findBarangay(name) {
  const index = binarySearch(BARANGAYS, 'key', normalizeBarangayName(name));
  return index === -1 ? null : BARANGAYS[index];
}

/**
 * suggestBarangays — up to `limit` barangays whose name contains the query
 * ("san" → San Gabriel, San Jose Patag, San Vicente …).
 * Linear search + naive string matching. Time O(n · m) · Space O(k)
 */
function suggestBarangays(query, limit) {
  const matches = textSearchRecords(BARANGAYS, ['name'], normalizeBarangayName(query));
  return arrayRange(matches, 0, limit);
}

/**
 * listBarangays — "all", "available" or "coming-soon".
 * Time O(n) · Space O(n)
 */
function listBarangays(filter) {
  if (filter === 'available' || filter === 'coming-soon') {
    return linearSearchAll(BARANGAYS, 'status', filter);
  }
  return arrayCopy(BARANGAYS);
}

/** coverageSummary — counts for the coverage page. Time O(n) · Space O(1) */
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

/** isBarangayServiceable — true when fiber is already available there. O(log n) */
function isBarangayServiceable(name) {
  const record = findBarangay(name);
  return record !== null && record.status === 'available';
}

/**
 * coverageDetail — the sentence staff see on an application:
 * "Available — 12 fiber access points in Brgy. Poblacion".
 * Time O(log n)
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
