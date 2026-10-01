/* ==========================================================================
   E3 Fiber Connect - dsa/stack.js
   Stack (LIFO - last in, first out), procedural yung pagkakasulat.

   Yung stack ay simpleng record lang { items: [], top: -1 }: yung `top` ay index
   ng pinakabagong item (-1 pag empty). Sa top lang pwedeng mag-add, magbasa o magtanggal.

   Saan ginamit:
     - Undo button - bawat admin action pinu-push; pag nag-Undo, pop yung pinakabago
     - Back button sa loob ng app - pinu-push bawat screen na binisita kasama yung scroll
     - mga bukas na sheet (dialogs) - pag Esc, laging yung nasa top ang nasasara
   ========================================================================== */

'use strict';

/**
 * createStack - gumawa ng bagong empty na stack.
 * Time: O(1), Space: O(1) (lalaki hanggang O(n) habang nagpu-push)
 */
function createStack() {
  return { items: [], top: -1 };
}

/**
 * stackPush - ilagay yung item sa top.
 * Time: O(1), Space: O(1)
 */
function stackPush(stack, item) {
  stack.top = stack.top + 1;        // 1. iakyat ng isang slot yung top marker
  stack.items[stack.top] = item;    // 2. doon isulat yung bagong item
  return stack.top + 1;             // yung bagong size
}

/**
 * stackPop - tanggalin yung item sa top tapos i-return, o null kung empty.
 * Time: O(1), Space: O(1)
 */
function stackPop(stack) {
  if (stack.top < 0) {                  // empty yung stack -> walang ipo-pop
    return null;
  }
  const item = stack.items[stack.top];  // 1. basahin yung pinakabagong item (last in)
  stack.top = stack.top - 1;            // 2. ibaba yung top marker
  stack.items.length = stack.top + 1;   // 3. kalimutan na yung slot na tinanggal
  return item;                          //    first out
}

/**
 * stackPeek - silipin yung item sa top nang hindi tinatanggal, o null kung empty.
 * Time: O(1), Space: O(1)
 */
function stackPeek(stack) {
  if (stack.top < 0) {
    return null;
  }
  return stack.items[stack.top];
}

/** stackIsEmpty - true kung walang laman yung stack. Time: O(1) */
function stackIsEmpty(stack) {
  return stack.top < 0;
}

/** stackSize - ilan yung items sa stack. Time: O(1) */
function stackSize(stack) {
  return stack.top + 1;
}

/**
 * stackToArray - lahat ng items mula top (pinakabago) pababa sa bottom (pinakaluma),
 * para sa pag-display ng stack. Hindi nito binabago yung stack.
 * Time: O(n), Space: O(n)
 */
function stackToArray(stack) {
  const list = [];
  for (let i = stack.top; i >= 0; i--) {
    arrayAppend(list, stack.items[i]);
  }
  return list;
}

/**
 * stackRemoveBottom - tanggalin yung pinakalumang item. Para hindi lumaki nang
 * lumaki yung stack na may limit (e.g. yung huling 25 undo steps). Lahat ng nasa
 * taas uusog pababa ng isang slot.
 * Time: O(n), Space: O(1)
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
 * stackRemoveWhere - tanggalin yung mga item na yung `field` ay equal sa `value`,
 * pero same order pa rin yung natira (gamit ito pag may sheet na sinara nang hindi sunod-sunod).
 * Time: O(n), Space: O(n)
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

/** stackClear - i-empty yung stack. Time: O(1) */
function stackClear(stack) {
  arrayClear(stack.items);
  stack.top = -1;
}
