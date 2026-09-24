/* ==========================================================================
   E3 Fiber Connect · dsa/search.js
   Searching, written by hand.

   Project rule: no indexOf, lastIndexOf, includes, find, findIndex, filter,
   some or every. Every function below walks the array itself and reports
   how many comparisons it made (recordRun → dsaLastRun), so the admin pages
   can show the real cost of each search.

   Linear search  → works on any array, checks items one by one      O(n)
   Binary search  → needs an array sorted by the key; halves it each step O(log n)
   ========================================================================== */

'use strict';

/**
 * linearSearch — index of the first record whose `field` equals `value`, or -1.
 * Time: best O(1) (first record), average and worst O(n) · Space O(1)
 */
function linearSearch(records, field, value) {
  let comparisons = 0;
  for (let i = 0; i < records.length; i++) {        // 1. look at the records one by one
    comparisons++;
    if (records[i][field] === value) {              // 2. stop at the first match
      recordRun('Linear search', comparisons, 0);
      return i;
    }
  }
  recordRun('Linear search', comparisons, 0);       // 3. checked all n records, nothing matched
  return -1;
}

/**
 * linearSearchValue — index of `value` in an array of plain values, or -1.
 * Time O(n) · Space O(1)
 */
function linearSearchValue(values, value) {
  for (let i = 0; i < values.length; i++) {
    if (values[i] === value) {
      return i;
    }
  }
  return -1;
}

/**
 * linearSearchAll — every record whose `field` equals `value`, in their
 * original order (replaces filter). Always visits all n records.
 * Time O(n) · Space O(k) for the k matches
 */
function linearSearchAll(records, field, value) {
  const matches = [];
  for (let i = 0; i < records.length; i++) {
    if (records[i][field] === value) {
      arrayAppend(matches, records[i]);
    }
  }
  recordRun('Linear search', records.length, 0);
  return matches;
}

/**
 * countMatches — how many records have `field` equal to `value`.
 * Time O(n) · Space O(1)
 */
function countMatches(records, field, value) {
  let count = 0;
  for (let i = 0; i < records.length; i++) {
    if (records[i][field] === value) {
      count++;
    }
  }
  return count;
}

/**
 * binarySearch — index of the record whose `field` equals `value`, or -1.
 * The records MUST be sorted by `field` in ascending order. Each step looks at
 * the middle record and discards the half that cannot contain the value.
 * Time O(log n) — about 17 steps for 100,000 records · Space O(1)
 */
function binarySearch(sortedRecords, field, value) {
  let low = 0;                                      // 1. start with the whole table as the range
  let high = sortedRecords.length - 1;
  let comparisons = 0;
  while (low <= high) {                             // 2. repeat while the range still has records
    const middle = Math.floor((low + high) / 2);    // 3. look at the middle record
    const middleValue = sortedRecords[middle][field];
    comparisons++;
    if (middleValue === value) {                    // 4. found it
      recordRun('Binary search', comparisons, 0);
      return middle;
    }
    if (middleValue < value) {
      low = middle + 1;   // the value can only be in the right half
    } else {
      high = middle - 1;  // the value can only be in the left half
    }
  }
  recordRun('Binary search', comparisons, 0);
  return -1;
}

/**
 * binarySearchValue — binary search in a sorted array of plain values.
 * Time O(log n) · Space O(1)
 */
function binarySearchValue(sortedValues, value) {
  let low = 0;
  let high = sortedValues.length - 1;
  let comparisons = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    comparisons++;
    if (sortedValues[middle] === value) {
      recordRun('Binary search', comparisons, 0);
      return middle;
    }
    if (sortedValues[middle] < value) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  recordRun('Binary search', comparisons, 0);
  return -1;
}

/**
 * lowerBound — the first position whose `field` is >= `value` in a sorted array
 * (records.length when every key is smaller). This is where `value` belongs.
 * Time O(log n) · Space O(1)
 */
function lowerBound(sortedRecords, field, value) {
  let low = 0;                                      // 1. the answer is somewhere in 0 … n
  let high = sortedRecords.length;
  let comparisons = 0;
  while (low < high) {                              // 2. halve the range until one position is left
    const middle = Math.floor((low + high) / 2);
    comparisons++;
    if (sortedRecords[middle][field] < value) {
      low = middle + 1;                             //    middle is smaller → the spot is to the right
    } else {
      high = middle;                                //    middle is bigger or equal → the spot is here or left
    }
  }
  recordRun('Binary search (position)', comparisons, 0);
  return low;                                       // 3. the first position whose key is ≥ value
}

/**
 * sortedInsert — "put" a record into an array kept sorted by `field`:
 * binary search finds the position, then the later records shift right.
 * Returns the position used.
 * Time O(log n) to find + O(n) to shift = O(n) · Space O(1)
 */
function sortedInsert(sortedRecords, field, record) {
  const position = lowerBound(sortedRecords, field, record[field]);   // 1. binary search for the right spot
  arrayInsertAt(sortedRecords, position, record);                      // 2. shift the later records right, write it
  return position;
}

/**
 * sortedRemove — remove the record with key `value` from a sorted array.
 * Returns the removed record, or null.
 * Time O(log n) + O(n) shift · Space O(1)
 */
function sortedRemove(sortedRecords, field, value) {
  const position = binarySearch(sortedRecords, field, value);
  if (position === -1) {
    return null;
  }
  return arrayRemoveAt(sortedRecords, position);
}

/**
 * rangeWithPrefix — every record whose `field` starts with `prefix`, from an
 * array sorted by `field`. Binary search jumps to the first candidate, then a
 * short scan collects the neighbours. (Bill ids start with "BILL-YYYYMM-",
 * so this finds one month's bills without reading the whole table.)
 * Time O(log n + k) for k matches · Space O(k)
 */
function rangeWithPrefix(sortedRecords, field, prefix) {
  const matches = [];
  let position = lowerBound(sortedRecords, field, prefix);
  let comparisons = dsaLastRun.comparisons;          // 1. the binary-search steps
  while (position < sortedRecords.length && textStartsWith(sortedRecords[position][field], prefix)) {
    arrayAppend(matches, sortedRecords[position]);   // 2. collect while the prefix matches
    position++;
    comparisons++;
  }
  if (position < sortedRecords.length) {
    comparisons++;                                   // 3. the check that ended the scan (none at the array's end)
  }
  recordRun('Binary search + scan', comparisons, 0);
  return matches;
}

/**
 * textSearchRecords — records where any of `fields` contains `query`,
 * ignoring capital letters ("jua" finds "Juan Dela Cruz"). An empty query
 * returns every record. Linear search + naive string matching per field.
 * Time O(n · f · L · m), n records, f fields, L field length, m query length
 * Space O(k) for the k matches
 */
function textSearchRecords(records, fields, query) {
  const needle = toLowerText(trimText(query));
  const matches = [];
  if (needle === '') {
    for (let i = 0; i < records.length; i++) {
      arrayAppend(matches, records[i]);
    }
    return matches;
  }
  for (let i = 0; i < records.length; i++) {        // 1. every record (linear search)
    for (let f = 0; f < fields.length; f++) {       // 2. every searchable field of it
      if (textContains(toLowerText(records[i][fields[f]]), needle)) {  // 3. naive string match, ignoring capitals
        arrayAppend(matches, records[i]);
        break; // one matching field is enough
      }
    }
  }
  recordRun('Linear search (text)', records.length, 0);
  return matches;
}
