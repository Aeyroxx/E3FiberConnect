/* ==========================================================================
   E3 Fiber Connect - dsa/arrays.js
   Mga array operation na kami mismo ang sumulat.

   Rule ng project: bawal gumamit ng built-in array methods (push, pop, shift,
   unshift, splice, slice, concat, reverse, fill ...). Kaya bawat function dito
   ay nagli-loop at ginagalaw yung mga element nang mano-mano, para kita agad
   sa code kung magkano yung cost ng bawat operation.

   Ito lang yung built-in array features na ginamit namin sa buong project:
     array[i]        basa / sulat sa isang slot ................... O(1)
     array.length    kunin yung size, o putulin yung dulo ......... O(1)
   ========================================================================== */

'use strict';

/**
 * arrayAppend - idagdag yung item pagkatapos ng huli (kapalit ng push).
 * Time: O(1), Space: O(1)
 */
function arrayAppend(array, item) {
  array[array.length] = item;
  return array.length;
}

/**
 * arrayRemoveLast - tanggalin yung huling item tapos i-return (kapalit ng pop).
 * Time: O(1), Space: O(1)
 */
function arrayRemoveLast(array) {
  if (array.length === 0) {
    return undefined;
  }
  const last = array[array.length - 1];
  array.length = array.length - 1;
  return last;
}

/**
 * arrayPrepend - ilagay yung item sa unahan (kapalit ng unshift).
 * Lahat ng item ay uusog ng isang slot pakanan para magkaroon ng space.
 * Time: O(n), Space: O(1)
 */
function arrayPrepend(array, item) {
  for (let i = array.length; i > 0; i--) {
    array[i] = array[i - 1];
  }
  array[0] = item;
  return array.length;
}

/**
 * arrayRemoveFirst - tanggalin yung unang item tapos i-return (kapalit ng shift).
 * Yung ibang item uusog ng isang slot pakaliwa para matakpan yung butas.
 * Time: O(n), Space: O(1)
 */
function arrayRemoveFirst(array) {
  if (array.length === 0) {
    return undefined;
  }
  const first = array[0];
  for (let i = 0; i < array.length - 1; i++) {
    array[i] = array[i + 1];
  }
  array.length = array.length - 1;
  return first;
}

/**
 * arrayInsertAt - isingit yung item sa isang position (kapalit ng splice(index, 0, item)).
 * Yung mga item simula sa `index` ay uusog ng isang slot pakanan.
 * Time: O(n) - yung mga record lang after ng index ang gagalaw, Space: O(1)
 */
function arrayInsertAt(array, index, item) {
  let position = index;
  if (position < 0) {                                // siguraduhin na nasa loob ng array yung position
    position = 0;
  }
  if (position > array.length) {
    position = array.length;
  }
  for (let i = array.length; i > position; i--) {    // 1. simula sa dulo, iusog pakanan yung bawat item
    array[i] = array[i - 1];
  }
  array[position] = item;                            // 2. bakante na yung `position` -> dito isulat yung item
  return array.length;
}

/**
 * arrayRemoveAt - tanggalin yung item sa isang position (kapalit ng splice(index, 1)).
 * Yung mga item pagkatapos nito uusog ng isang slot pakaliwa.
 * Time: O(n) - yung mga record lang after ng index ang gagalaw, Space: O(1)
 */
function arrayRemoveAt(array, index) {
  if (index < 0 || index >= array.length) {
    return undefined;
  }
  const removed = array[index];                      // 1. itabi muna yung item na tatanggalin
  for (let i = index; i < array.length - 1; i++) {   // 2. iusog pakaliwa lahat ng kasunod
    array[i] = array[i + 1];
  }
  array.length = array.length - 1;                   // 3. tanggalin yung huling slot kasi doble na siya
  return removed;
}

/**
 * arrayCopy - bagong array na pareho yung laman (kapalit ng slice()).
 * Sa copy nagso-sort yung mga sort natin, para hindi magulo yung order ng "database" tables.
 * Time: O(n), Space: O(n)
 */
function arrayCopy(array) {
  const copy = [];
  for (let i = 0; i < array.length; i++) {
    copy[i] = array[i];
  }
  return copy;
}

/**
 * arrayRange - hanggang `count` na item simula sa `start` (kapalit ng slice(start, start + count)).
 * Ginagamit para ipakita yung mahahabang list nang paisa-isang page.
 * Time: O(n), Space: O(n)
 */
function arrayRange(array, start, count) {
  const part = [];
  for (let i = start; i < array.length && i < start + count; i++) {
    arrayAppend(part, array[i]);
  }
  return part;
}

/**
 * arrayReverseCopy - bagong array na baliktad yung order ng items (kapalit ng reverse()).
 * Time: O(n), Space: O(n)
 */
function arrayReverseCopy(array) {
  const reversed = [];
  for (let i = array.length - 1; i >= 0; i--) {
    arrayAppend(reversed, array[i]);
  }
  return reversed;
}

/**
 * arrayFilled - bagong array na may `count` na kopya ng `value` (kapalit ng new Array(n).fill(value)).
 * Time: O(n), Space: O(n)
 */
function arrayFilled(count, value) {
  const filled = [];
  for (let i = 0; i < count; i++) {
    filled[i] = value;
  }
  return filled;
}

/**
 * arraySwap - pagpalitin yung laman ng dalawang slot. Gamit ito ng bubble sort at selection sort.
 * Time: O(1), Space: O(1)
 */
function arraySwap(array, i, j) {
  const temp = array[i];
  array[i] = array[j];
  array[j] = temp;
}

/**
 * arrayClear - burahin lahat ng item pero same array pa rin (baka may ibang code na may hawak nito).
 * Time: O(1), Space: O(1)
 */
function arrayClear(array) {
  array.length = 0;
}
