/* ==========================================================================
   E3 Fiber Connect · dsa/queue.js
   Queue (FIFO — first in, first out) as a circular buffer, written procedurally.

   A queue is a plain record { items, front, count, capacity }:
     front  index of the oldest item (the next one to be served)
     count  how many items are waiting
   The rear is (front + count) % capacity, so both ends wrap around the array
   instead of shifting it. That makes enqueue and dequeue O(1) — unlike
   arrayRemoveFirst (shift), which moves every item.

   Used for:
     • the application review queue (oldest pending application first)
     • the support-ticket queue ("Serve next")
     • payments waiting to be verified
     • settling a subscriber's oldest unpaid bill first
     • toast notifications (shown one at a time, in order)
     • the recent-operations log on the Algorithms page (a ring buffer)
   ========================================================================== */

'use strict';

/**
 * createQueue — a new, empty queue with room for `capacity` items
 * (it grows automatically when full).
 * Time O(capacity) · Space O(capacity)
 */
function createQueue(capacity) {
  const size = capacity > 0 ? capacity : 8;
  return { items: arrayFilled(size, undefined), front: 0, count: 0, capacity: size };
}

/** queueSize — how many items are waiting. Time O(1) */
function queueSize(queue) {
  return queue.count;
}

/** queueIsEmpty — true when nothing is waiting. Time O(1) */
function queueIsEmpty(queue) {
  return queue.count === 0;
}

/** queueIsFull — true when every slot is used. Time O(1) */
function queueIsFull(queue) {
  return queue.count === queue.capacity;
}

/**
 * queueGrow — double the capacity, copying the items in queue order to the
 * start of the new array. Only happens when the queue is full.
 * Time O(n) · Space O(n)
 */
function queueGrow(queue) {
  const bigger = arrayFilled(queue.capacity * 2, undefined);
  for (let i = 0; i < queue.count; i++) {
    bigger[i] = queue.items[(queue.front + i) % queue.capacity];
  }
  queue.items = bigger;
  queue.front = 0;
  queue.capacity = queue.capacity * 2;
}

/**
 * enqueue — add an item at the rear.
 * Time O(1) amortised (O(n) only on the rare grow) · Space O(1)
 */
function enqueue(queue, item) {
  if (queueIsFull(queue)) {                                   // 1. no free slot → double the array
    queueGrow(queue);
  }
  const rear = (queue.front + queue.count) % queue.capacity;  // 2. the slot after the last item (wraps to 0)
  queue.items[rear] = item;                                   // 3. put the item at the rear
  queue.count = queue.count + 1;
  return queue.count;
}

/**
 * dequeue — remove the front (oldest) item and return it, or null when empty.
 * Only the `front` index moves; no item is shifted.
 * Time O(1) · Space O(1)
 */
function dequeue(queue) {
  if (queue.count === 0) {                             // empty queue → nothing to serve
    return null;
  }
  const item = queue.items[queue.front];               // 1. the oldest item is at the front
  queue.items[queue.front] = undefined;                // 2. clear its slot
  queue.front = (queue.front + 1) % queue.capacity;    // 3. the next item becomes the front (wraps to 0)
  queue.count = queue.count - 1;
  return item;
}

/**
 * queuePeek — read the front item without removing it, or null when empty.
 * Time O(1) · Space O(1)
 */
function queuePeek(queue) {
  if (queue.count === 0) {
    return null;
  }
  return queue.items[queue.front];
}

/**
 * enqueueBounded — add an item; when the queue is already full, first drop the
 * oldest one. This turns the queue into a fixed-size ring buffer (a log that
 * keeps only the latest entries).
 * Time O(1) · Space O(1)
 */
function enqueueBounded(queue, item) {
  if (queueIsFull(queue)) {
    dequeue(queue);
  }
  const rear = (queue.front + queue.count) % queue.capacity;
  queue.items[rear] = item;
  queue.count = queue.count + 1;
  return queue.count;
}

/**
 * queueToArray — the waiting items from front (next) to rear (last), for display.
 * Time O(n) · Space O(n)
 */
function queueToArray(queue) {
  const list = [];
  for (let i = 0; i < queue.count; i++) {
    arrayAppend(list, queue.items[(queue.front + i) % queue.capacity]);
  }
  return list;
}

/** queueClear — remove everything. Time O(capacity) */
function queueClear(queue) {
  queue.items = arrayFilled(queue.capacity, undefined);
  queue.front = 0;
  queue.count = 0;
}
