/* ==========================================================================
   E3 Fiber Connect · dsa/sort.js
   Bubble sort, selection sort and insertion sort, written by hand.

   Project rule: no Array.prototype.sort / toSorted / reverse.
   Every sort works on a COPY (arrayCopy), so the "database" tables keep the
   order the searches depend on (e.g. applications stay sorted by reference
   number for binary search). The copy costs O(n) space; the sorting itself
   only needs O(1) extra space.

   Each admin list lets the user pick the algorithm, and the page shows how
   many comparisons and moves it needed (recordRun → dsaLastRun).
   ========================================================================== */

'use strict';

const SORT_ALGORITHMS = [
  { id: 'insertion', name: 'Insertion sort', best: 'O(n)', average: 'O(n²)', worst: 'O(n²)', space: 'O(1)', stable: true },
  { id: 'selection', name: 'Selection sort', best: 'O(n²)', average: 'O(n²)', worst: 'O(n²)', space: 'O(1)', stable: false },
  { id: 'bubble', name: 'Bubble sort', best: 'O(n)', average: 'O(n²)', worst: 'O(n²)', space: 'O(1)', stable: true },
];

/**
 * sortAlgorithmInfo — the SORT_ALGORITHMS record for an id (linear search, 3 items).
 * Time O(1) here (fixed list of 3) · Space O(1)
 */
function sortAlgorithmInfo(algorithmId) {
  for (let i = 0; i < SORT_ALGORITHMS.length; i++) {
    if (SORT_ALGORITHMS[i].id === algorithmId) {
      return SORT_ALGORITHMS[i];
    }
  }
  return SORT_ALGORITHMS[0];
}

/** isEmptyValue — null, undefined and "" have no value to compare. O(1) */
function isEmptyValue(value) {
  return value === null || value === undefined || value === '';
}

/**
 * compareValues — negative when a comes first, positive when b comes first,
 * 0 when equal. Text is compared without regard to capital letters; numbers
 * and ISO dates ("2026-09-23") compare naturally.
 * Time O(L) for text of length L, O(1) for numbers · Space O(L)
 */
function compareValues(a, b) {
  let left = a;
  let right = b;
  if (typeof left === 'string' && typeof right === 'string') {
    left = toLowerText(left);
    right = toLowerText(right);
  }
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

/**
 * compareForOrder — compareValues in the chosen direction (1 = ascending,
 * -1 = descending). Empty values always go last.
 */
function compareForOrder(a, b, direction) {
  const aEmpty = isEmptyValue(a);
  const bEmpty = isEmptyValue(b);
  if (aEmpty || bEmpty) {
    if (aEmpty && bEmpty) {
      return 0;
    }
    return aEmpty ? 1 : -1;
  }
  return compareValues(a, b) * direction;
}

/**
 * bubbleSort — repeatedly walks the list swapping neighbours that are out of
 * order; after each pass the largest remaining item has "bubbled" to the end.
 * Stops early when a pass makes no swap (the list is already sorted).
 * Time: best O(n) (already sorted), average and worst O(n²)
 * Space: O(1) extra (plus the O(n) copy) · Stable: yes
 */
function bubbleSort(records, field, order) {
  const list = arrayCopy(records);                  // sort a copy, so the table keeps its own order
  const direction = order === 'desc' ? -1 : 1;      // 1 = A→Z / small→big, -1 = the reverse
  let comparisons = 0;
  let swaps = 0;
  for (let pass = 0; pass < list.length - 1; pass++) {      // 1. make up to n − 1 passes
    let swapped = false;
    for (let i = 0; i < list.length - 1 - pass; i++) {      // 2. walk the part not sorted yet
      comparisons++;
      if (compareForOrder(list[i][field], list[i + 1][field], direction) > 0) { // 3. neighbours in the wrong order?
        arraySwap(list, i, i + 1);                           //    → swap them
        swaps++;
        swapped = true;
      }
    }
    if (!swapped) {                                          // 4. a pass with no swap = already sorted → stop early
      break;
    }
  }
  recordRun('Bubble sort', comparisons, swaps);              // 5. remember the cost for the screen
  return list;
}

/**
 * selectionSort — for each position, scans the unsorted part for the item
 * that belongs there (the smallest, or largest when descending) and swaps it in.
 * Always makes n(n−1)/2 comparisons but at most n−1 swaps.
 * Time: O(n²) in every case · Space: O(1) extra (plus the copy) · Stable: no
 */
function selectionSort(records, field, order) {
  const list = arrayCopy(records);                  // sort a copy, so the table keeps its own order
  const direction = order === 'desc' ? -1 : 1;
  let comparisons = 0;
  let swaps = 0;
  for (let i = 0; i < list.length - 1; i++) {       // 1. fill position i (0, 1, 2 …) with the right item
    let best = i;
    for (let j = i + 1; j < list.length; j++) {     // 2. scan everything after it
      comparisons++;
      if (compareForOrder(list[j][field], list[best][field], direction) < 0) {
        best = j;                                   //    remember the item that should come first
      }
    }
    if (best !== i) {                               // 3. swap that item into position i
      arraySwap(list, i, best);
      swaps++;
    }
  }
  recordRun('Selection sort', comparisons, swaps);
  return list;
}

/**
 * insertionSort — grows a sorted part at the front: each new item is taken out
 * and the larger items slide one place right until its spot is found.
 * Very fast on lists that are already almost sorted (our tables usually are).
 * Time: best O(n) (already sorted), average and worst O(n²)
 * Space: O(1) extra (plus the copy) · Stable: yes
 */
function insertionSort(records, field, order) {
  const list = arrayCopy(records);                  // sort a copy, so the table keeps its own order
  const direction = order === 'desc' ? -1 : 1;
  let comparisons = 0;
  let shifts = 0;
  for (let i = 1; i < list.length; i++) {           // 1. items before i are already sorted
    const current = list[i];                        // 2. take out the next item
    let j = i - 1;
    while (j >= 0) {
      comparisons++;
      if (compareForOrder(list[j][field], current[field], direction) > 0) {
        list[j + 1] = list[j];                      // 3. a bigger item slides one place right
        shifts++;
        j--;
      } else {
        break;                                      //    found the spot
      }
    }
    list[j + 1] = current;                          // 4. drop the item into the gap
  }
  recordRun('Insertion sort', comparisons, shifts);
  return list;
}

/**
 * sortRecords — sort with the chosen algorithm id: "insertion", "selection" or "bubble".
 * order: "asc" or "desc". Returns a new, sorted array.
 */
function sortRecords(records, field, order, algorithmId) {
  if (algorithmId === 'bubble') {
    return bubbleSort(records, field, order);
  }
  if (algorithmId === 'selection') {
    return selectionSort(records, field, order);
  }
  return insertionSort(records, field, order);
}
