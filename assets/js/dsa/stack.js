/* ==========================================================================
   E3 Fiber Connect · dsa/stack.js
   Stack (LIFO — last in, first out), written procedurally.

   A stack is a plain record { items: [], top: -1 }: `top` is the index of the
   newest item (-1 when empty). Only the top can be added, read or removed.

   Used for:
     • the Undo button — every admin action is pushed; Undo pops the newest
     • the in-app Back button — each visited screen is pushed with its scroll
     • open sheets (dialogs) — Esc always closes the top one
   ========================================================================== */

'use strict';

/**
 * createStack — a new, empty stack.
 * Time O(1) · Space O(1) (grows to O(n) as items are pushed)
 */
function createStack() {
  return { items: [], top: -1 };
}

/**
 * stackPush — put an item on top.
 * Time O(1) · Space O(1)
 */
function stackPush(stack, item) {
  stack.top = stack.top + 1;        // 1. move the top marker up one slot
  stack.items[stack.top] = item;    // 2. write the new item there
  return stack.top + 1;             // the new size
}

/**
 * stackPop — remove the top item and return it, or null when empty.
 * Time O(1) · Space O(1)
 */
function stackPop(stack) {
  if (stack.top < 0) {                  // empty stack → nothing to pop
    return null;
  }
  const item = stack.items[stack.top];  // 1. read the newest item (last in)
  stack.top = stack.top - 1;            // 2. move the top marker down
  stack.items.length = stack.top + 1;   // 3. forget the removed slot
  return item;                          //    first out
}

/**
 * stackPeek — read the top item without removing it, or null when empty.
 * Time O(1) · Space O(1)
 */
function stackPeek(stack) {
  if (stack.top < 0) {
    return null;
  }
  return stack.items[stack.top];
}

/** stackIsEmpty — true when nothing is on the stack. Time O(1) */
function stackIsEmpty(stack) {
  return stack.top < 0;
}

/** stackSize — how many items are on the stack. Time O(1) */
function stackSize(stack) {
  return stack.top + 1;
}

/**
 * stackToArray — every item from the top (newest) down to the bottom (oldest),
 * for displaying the stack. Does not change it.
 * Time O(n) · Space O(n)
 */
function stackToArray(stack) {
  const list = [];
  for (let i = stack.top; i >= 0; i--) {
    arrayAppend(list, stack.items[i]);
  }
  return list;
}

/**
 * stackRemoveBottom — drop the oldest item. Keeps a capped stack (e.g. the last
 * 25 undo steps) from growing forever. Everything above slides down one slot.
 * Time O(n) · Space O(1)
 */
function stackRemoveBottom(stack) {
  if (stack.top < 0) {
    return null;
  }
  const bottom = arrayRemoveFirst(stack.items);
  stack.top = stack.top - 1;
  return bottom;
}

/**
 * stackRemoveWhere — remove the items whose `field` equals `value`, keeping the
 * order of the rest (used when an open sheet is closed out of order).
 * Time O(n) · Space O(n)
 */
function stackRemoveWhere(stack, field, value) {
  const kept = [];
  for (let i = 0; i <= stack.top; i++) {
    if (stack.items[i][field] !== value) {
      arrayAppend(kept, stack.items[i]);
    }
  }
  stack.items = kept;
  stack.top = kept.length - 1;
}

/** stackClear — empty the stack. Time O(1) */
function stackClear(stack) {
  arrayClear(stack.items);
  stack.top = -1;
}
