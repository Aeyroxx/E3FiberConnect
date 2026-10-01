/* ==========================================================================
   E3 Fiber Connect - dsa/sort.js
   Bubble sort, selection sort at insertion sort, mano-mano namin sinulat.

   Rule ng project: bawal ang Array.prototype.sort / toSorted / reverse.
   Bawat sort ay gumagana sa COPY (arrayCopy), para hindi magalaw yung order ng
   "database" tables na kailangan ng mga search (e.g. yung applications naka-sort
   by reference number para sa binary search). O(n) space yung copy; yung sorting
   mismo O(1) extra space lang ang kailangan.

   Sa bawat admin list pwedeng pumili yung user ng algorithm, tapos pinapakita ng
   page kung ilang comparisons at moves yung kinailangan (recordRun -> dsaLastRun).
   ========================================================================== */

'use strict';

const SORT_ALGORITHMS = [
  { id: 'insertion', name: 'Insertion sort', best: 'O(n)', average: 'O(n²)', worst: 'O(n²)', space: 'O(1)', stable: true },
  { id: 'selection', name: 'Selection sort', best: 'O(n²)', average: 'O(n²)', worst: 'O(n²)', space: 'O(1)', stable: false },
  { id: 'bubble', name: 'Bubble sort', best: 'O(n)', average: 'O(n²)', worst: 'O(n²)', space: 'O(1)', stable: true },
];

/**
 * sortAlgorithmInfo - yung SORT_ALGORITHMS record ng isang id (linear search, 3 items lang).
 * Time: O(1) dito (fixed list na 3 lang), Space: O(1)
 */
function sortAlgorithmInfo(algorithmId) {
  for (let i = 0; i < SORT_ALGORITHMS.length; i++) {
    if (SORT_ALGORITHMS[i].id === algorithmId) {
      return SORT_ALGORITHMS[i];
    }
  }
  return SORT_ALGORITHMS[0];
}

/** isEmptyValue - walang maikukumpara sa null, undefined at "". O(1) */
function isEmptyValue(value) {
  return value === null || value === undefined || value === '';
}

/**
 * compareValues - negative kung mauuna si a, positive kung mauuna si b,
 * 0 kung pareho. Yung text kinukumpara nang hindi pinapansin yung capital letters;
 * yung numbers at ISO dates ("2026-09-23") normal lang yung pag-compare.
 * Time: O(n) para sa text na n ang haba, O(1) para sa numbers, Space: O(n)
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
 * compareForOrder - compareValues pero sa napiling direction (1 = ascending,
 * -1 = descending). Laging nasa huli yung mga empty value.
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
 * bubbleSort - paulit-ulit na dinadaanan yung list at pinagpapalit yung magkatabing
 * mali ang order; pagkatapos ng bawat pass, yung pinakamalaking natira ay "nag-bubble" na sa dulo.
 * Titigil agad kapag walang swap sa isang pass (ibig sabihin sorted na).
 * Time: best O(n) (sorted na), average at worst O(n²)
 * Space: O(1) extra (plus yung O(n) na copy), Stable: oo
 */
function bubbleSort(records, field, order) {
  const list = arrayCopy(records);                  // copy yung sinosort, para same order pa rin yung table
  const direction = order === 'desc' ? -1 : 1;      // 1 = A->Z / maliit->malaki, -1 = baliktad
  let comparisons = 0;
  let swaps = 0;
  for (let pass = 0; pass < list.length - 1; pass++) {      // 1. hanggang n - 1 na passes
    let swapped = false;
    for (let i = 0; i < list.length - 1 - pass; i++) {      // 2. daanan yung part na hindi pa sorted
      comparisons++;
      if (compareForOrder(list[i][field], list[i + 1][field], direction) > 0) { // 3. mali ba yung order ng magkatabi?
        arraySwap(list, i, i + 1);                           //    -> i-swap sila
        swaps++;
        swapped = true;
      }
    }
    if (!swapped) {                                          // 4. walang swap sa pass = sorted na -> stop agad
      break;
    }
  }
  recordRun('Bubble sort', comparisons, swaps);              // 5. itabi yung cost para sa screen
  return list;
}

/**
 * selectionSort - sa bawat position, hahanapin sa unsorted part yung item na
 * dapat nandun (pinakamaliit, o pinakamalaki kung descending) tapos i-swap papasok.
 * Laging n(n-1)/2 comparisons pero hanggang n-1 swaps lang.
 * Time: O(n²) kahit anong case, Space: O(1) extra (plus yung copy), Stable: hindi
 */
function selectionSort(records, field, order) {
  const list = arrayCopy(records);                  // copy yung sinosort, para same order pa rin yung table
  const direction = order === 'desc' ? -1 : 1;
  let comparisons = 0;
  let swaps = 0;
  for (let i = 0; i < list.length - 1; i++) {       // 1. punuin ng tamang item yung position i (0, 1, 2 ...)
    let best = i;
    for (let j = i + 1; j < list.length; j++) {     // 2. i-scan lahat ng kasunod nito
      comparisons++;
      if (compareForOrder(list[j][field], list[best][field], direction) < 0) {
        best = j;                                   //    tandaan yung item na dapat mauna
      }
    }
    if (best !== i) {                               // 3. i-swap yung item na yun papunta sa position i
      arraySwap(list, i, best);
      swaps++;
    }
  }
  recordRun('Selection sort', comparisons, swaps);
  return list;
}

/**
 * insertionSort - pinapalaki yung sorted part sa unahan: kinukuha bawat bagong item
 * tapos yung mas malalaki uusog ng isang pwesto pakanan hanggang makita yung pwesto niya.
 * Sobrang bilis sa mga list na halos sorted na (kadalasan ganun yung tables namin).
 * Time: best O(n) (sorted na), average at worst O(n²)
 * Space: O(1) extra (plus yung copy), Stable: oo
 */
function insertionSort(records, field, order) {
  const list = arrayCopy(records);                  // copy yung sinosort, para same order pa rin yung table
  const direction = order === 'desc' ? -1 : 1;
  let comparisons = 0;
  let shifts = 0;
  for (let i = 1; i < list.length; i++) {           // 1. sorted na yung mga item bago ang i
    const current = list[i];                        // 2. kunin yung susunod na item
    let j = i - 1;
    while (j >= 0) {
      comparisons++;
      if (compareForOrder(list[j][field], current[field], direction) > 0) {
        list[j + 1] = list[j];                      // 3. yung mas malaking item uusog ng isang pwesto pakanan
        shifts++;
        j--;
      } else {
        break;                                      //    nahanap na yung pwesto
      }
    }
    list[j + 1] = current;                          // 4. ilagay yung item sa bakanteng pwesto
  }
  recordRun('Insertion sort', comparisons, shifts);
  return list;
}

/**
 * sortRecords - mag-sort gamit yung napiling algorithm id: "insertion", "selection" o "bubble".
 * order: "asc" o "desc". Bagong sorted array ang binabalik.
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
