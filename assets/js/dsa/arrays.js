/* ==========================================================================
   E3 Fiber Connect · dsa/arrays.js
   Hand-written array operations.

   Project rule: no built-in array methods (push, pop, shift, unshift, splice,
   slice, concat, reverse, fill …). Each function below moves the elements
   itself with a loop, so the cost of every operation is visible in the code.

   The only built-in array features used anywhere in this project:
     array[i]        read / write one slot ....................... O(1)
     array.length    read the size, or cut items off the end ...... O(1)
   ========================================================================== */

'use strict';

/**
 * arrayAppend — add an item after the last one (replaces push).
 * Time O(1) · Space O(1)
 */
function arrayAppend(array, item) {
  array[array.length] = item;
  return array.length;
}

/**
 * arrayRemoveLast — take the last item off and return it (replaces pop).
 * Time O(1) · Space O(1)
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
 * arrayPrepend — add an item before the first one (replaces unshift).
 * Every item moves one slot to the right to make room.
 * Time O(n) · Space O(1)
 */
function arrayPrepend(array, item) {
  for (let i = array.length; i > 0; i--) {
    array[i] = array[i - 1];
  }
  array[0] = item;
  return array.length;
}

/**
 * arrayRemoveFirst — take the first item off and return it (replaces shift).
 * Every other item moves one slot to the left to close the gap.
 * Time O(n) · Space O(1)
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
 * arrayInsertAt — put an item at a position (replaces splice(index, 0, item)).
 * Items from `index` onward move one slot to the right.
 * Time O(n − index), O(n) worst · Space O(1)
 */
function arrayInsertAt(array, index, item) {
  let position = index;
  if (position < 0) {                                // keep the position inside the array
    position = 0;
  }
  if (position > array.length) {
    position = array.length;
  }
  for (let i = array.length; i > position; i--) {    // 1. from the end, move each item one slot right
    array[i] = array[i - 1];
  }
  array[position] = item;                            // 2. the gap is now at `position` → write the item
  return array.length;
}

/**
 * arrayRemoveAt — take out the item at a position (replaces splice(index, 1)).
 * Items after it move one slot to the left.
 * Time O(n − index), O(n) worst · Space O(1)
 */
function arrayRemoveAt(array, index) {
  if (index < 0 || index >= array.length) {
    return undefined;
  }
  const removed = array[index];                      // 1. keep the item being removed
  for (let i = index; i < array.length - 1; i++) {   // 2. move every later item one slot left
    array[i] = array[i + 1];
  }
  array.length = array.length - 1;                   // 3. drop the duplicate last slot
  return removed;
}

/**
 * arrayCopy — a new array holding the same items (replaces slice()).
 * The sorts work on a copy, so the "database" tables keep their own order.
 * Time O(n) · Space O(n)
 */
function arrayCopy(array) {
  const copy = [];
  for (let i = 0; i < array.length; i++) {
    copy[i] = array[i];
  }
  return copy;
}

/**
 * arrayRange — up to `count` items starting at `start` (replaces slice(start, start + count)).
 * Used to show long lists one page at a time.
 * Time O(count) · Space O(count)
 */
function arrayRange(array, start, count) {
  const part = [];
  for (let i = start; i < array.length && i < start + count; i++) {
    arrayAppend(part, array[i]);
  }
  return part;
}

/**
 * arrayReverseCopy — a new array with the items in the opposite order (replaces reverse()).
 * Time O(n) · Space O(n)
 */
function arrayReverseCopy(array) {
  const reversed = [];
  for (let i = array.length - 1; i >= 0; i--) {
    arrayAppend(reversed, array[i]);
  }
  return reversed;
}

/**
 * arrayFilled — a new array with `count` copies of `value` (replaces new Array(n).fill(value)).
 * Time O(n) · Space O(n)
 */
function arrayFilled(count, value) {
  const filled = [];
  for (let i = 0; i < count; i++) {
    filled[i] = value;
  }
  return filled;
}

/**
 * arraySwap — exchange the items in two slots. Used by bubble sort and selection sort.
 * Time O(1) · Space O(1)
 */
function arraySwap(array, i, j) {
  const temp = array[i];
  array[i] = array[j];
  array[j] = temp;
}

/**
 * arrayClear — remove every item but keep the same array (other code may hold it).
 * Time O(1) · Space O(1)
 */
function arrayClear(array) {
  array.length = 0;
}
