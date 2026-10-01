/* ==========================================================================
   E3 Fiber Connect - dsa/search.js
   Mga searching algorithm, mano-mano namin sinulat.

   Rule ng project: bawal ang indexOf, lastIndexOf, includes, find, findIndex,
   filter, some at every. Bawat function dito ay sariling loop sa array tapos
   nirereport kung ilang comparisons yung ginawa (recordRun -> dsaLastRun), para
   makita sa admin pages yung totoong cost ng bawat search.

   Linear search  -> pwede sa kahit anong array, isa-isang chine-check yung items   O(n)
   Binary search  -> kailangan naka-sort by key yung array; hinahati sa dalawa bawat step O(log n)
   ========================================================================== */

'use strict';

/**
 * linearSearch - index ng unang record na yung `field` ay equal sa `value`, o -1.
 * Time: best O(1) (unang record pa lang), average at worst O(n), Space: O(1)
 */
function linearSearch(records, field, value) {
  let comparisons = 0;
  for (let i = 0; i < records.length; i++) {        // 1. tingnan isa-isa yung mga record
    comparisons++;
    if (records[i][field] === value) {              // 2. tumigil sa unang match
      recordRun('Linear search', comparisons, 0);
      return i;
    }
  }
  recordRun('Linear search', comparisons, 0);       // 3. na-check na lahat ng n records, walang tumugma
  return -1;
}

/**
 * linearSearchValue - index ng `value` sa array ng plain values, o -1.
 * Time: O(n), Space: O(1)
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
 * linearSearchAll - lahat ng record na yung `field` ay equal sa `value`, same
 * order pa rin gaya ng original (kapalit ng filter). Lagi niyang dinadaanan lahat ng n records.
 * Time: O(n), Space: O(n) para sa matches
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
 * countMatches - ilang records yung may `field` na equal sa `value`.
 * Time: O(n), Space: O(1)
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
 * binarySearch - index ng record na yung `field` ay equal sa `value`, o -1.
 * DAPAT naka-sort ascending by `field` yung records. Bawat step titingnan yung
 * nasa gitna tapos itatapon yung kalahati na imposibleng nandun yung value.
 * Time: O(log n) - mga 17 steps lang para sa 100,000 records, Space: O(1)
 */
function binarySearch(sortedRecords, field, value) {
  let low = 0;                                      // 1. buong table muna yung range
  let high = sortedRecords.length - 1;
  let comparisons = 0;
  while (low <= high) {                             // 2. ulitin habang may laman pa yung range
    const middle = Math.floor((low + high) / 2);    // 3. tingnan yung record sa gitna
    const middleValue = sortedRecords[middle][field];
    comparisons++;
    if (middleValue === value) {                    // 4. nahanap na
      recordRun('Binary search', comparisons, 0);
      return middle;
    }
    if (middleValue < value) {
      low = middle + 1;   // sa right half lang pwedeng nandun yung value
    } else {
      high = middle - 1;  // sa left half lang pwedeng nandun yung value
    }
  }
  recordRun('Binary search', comparisons, 0);
  return -1;
}

/**
 * binarySearchValue - binary search sa sorted array ng plain values.
 * Time: O(log n), Space: O(1)
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
 * lowerBound - yung unang position na yung `field` ay >= `value` sa sorted array
 * (records.length kung mas maliit lahat ng key). Dito dapat mapunta yung `value`.
 * Time: O(log n), Space: O(1)
 */
function lowerBound(sortedRecords, field, value) {
  let low = 0;                                      // 1. nasa 0 ... n lang yung sagot
  let high = sortedRecords.length;
  let comparisons = 0;
  while (low < high) {                              // 2. hatiin yung range hanggang isang position na lang
    const middle = Math.floor((low + high) / 2);
    comparisons++;
    if (sortedRecords[middle][field] < value) {
      low = middle + 1;                             //    mas maliit yung middle -> nasa kanan yung pwesto
    } else {
      high = middle;                                //    mas malaki o equal yung middle -> dito o sa kaliwa yung pwesto
    }
  }
  recordRun('Binary search (position)', comparisons, 0);
  return low;                                       // 3. unang position na yung key ay ≥ value
}

/**
 * sortedInsert - "ilagay" yung record sa array na naka-sort by `field`:
 * binary search muna para mahanap yung position, tapos uusog pakanan yung mga kasunod.
 * Binabalik yung position na ginamit.
 * Time: O(log n) para mahanap + O(n) para mag-usog = O(n), Space: O(1)
 */
function sortedInsert(sortedRecords, field, record) {
  const position = lowerBound(sortedRecords, field, record[field]);   // 1. binary search para sa tamang pwesto
  arrayInsertAt(sortedRecords, position, record);                      // 2. iusog pakanan yung kasunod, tapos isulat
  return position;
}

/**
 * sortedRemove - tanggalin yung record na may key na `value` sa sorted array.
 * Binabalik yung natanggal na record, o null.
 * Time: O(log n) + O(n) na pag-usog, Space: O(1)
 */
function sortedRemove(sortedRecords, field, value) {
  const position = binarySearch(sortedRecords, field, value);
  if (position === -1) {
    return null;
  }
  return arrayRemoveAt(sortedRecords, position);
}

/**
 * rangeWithPrefix - lahat ng record na yung `field` ay nagsisimula sa `prefix`, galing
 * sa array na naka-sort by `field`. Tatalon muna yung binary search sa unang candidate,
 * tapos maikling scan lang para kunin yung mga katabi. (Yung bill ids nagsisimula sa
 * "BILL-YYYYMM-", kaya nakukuha nito yung bills ng isang buwan nang hindi binabasa yung buong table.)
 * Time: O(log n) para sa una + O(n) para kunin yung matches, Space: O(n)
 */
function rangeWithPrefix(sortedRecords, field, prefix) {
  const matches = [];
  let position = lowerBound(sortedRecords, field, prefix);
  let comparisons = dsaLastRun.comparisons;          // 1. yung steps ng binary search
  while (position < sortedRecords.length && textStartsWith(sortedRecords[position][field], prefix)) {
    arrayAppend(matches, sortedRecords[position]);   // 2. kunin habang tugma pa yung prefix
    position++;
    comparisons++;
  }
  if (position < sortedRecords.length) {
    comparisons++;                                   // 3. yung check na nagpatigil sa scan (wala nito pag dulo na ng array)
  }
  recordRun('Binary search + scan', comparisons, 0);
  return matches;
}

/**
 * textSearchRecords - mga record na kahit isa sa `fields` ay may `query`,
 * hindi pinapansin yung capital letters ("jua" -> makikita si "Juan Dela Cruz"). Pag empty
 * yung query, lahat ng record ang balik. Linear search + naive string matching per field.
 * Time: O(n²) - sinusubukan yung query sa bawat position ng bawat field ng bawat record
 * Space: O(n) para sa matches
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
  for (let i = 0; i < records.length; i++) {        // 1. bawat record (linear search)
    for (let f = 0; f < fields.length; f++) {       // 2. bawat field nito na pwedeng i-search
      if (textContains(toLowerText(records[i][fields[f]]), needle)) {  // 3. naive string match, walang pakialam sa capitals
        arrayAppend(matches, records[i]);
        break; // sapat na yung isang field na tumugma
      }
    }
  }
  recordRun('Linear search (text)', records.length, 0);
  return matches;
}
