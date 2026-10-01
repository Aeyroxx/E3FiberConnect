/* ==========================================================================
   E3 Fiber Connect - dsa/queue.js
   Queue (FIFO - first in, first out) na circular buffer, procedural yung pagkakasulat.

   Yung queue ay simpleng record { items, front, count, capacity }:
     front  index ng pinakalumang item (siya yung susunod na ise-serve)
     count  ilan yung items na naghihintay
   Yung rear ay (front + count) % capacity, kaya umiikot lang yung dalawang dulo
   sa array imbes na iusog lahat. Dahil dun, O(1) yung enqueue at dequeue - hindi
   tulad ng arrayRemoveFirst (shift) na ginagalaw lahat ng item.

   Saan ginamit:
     - application review queue (pinakalumang pending application muna)
     - support-ticket queue ("Serve next")
     - mga payment na naghihintay ma-verify
     - pagbayad muna sa pinakalumang unpaid bill ng subscriber
     - toast notifications (isa-isa lumalabas, in order)
     - recent-operations log sa Algorithms page (ring buffer)
   ========================================================================== */

'use strict';

/**
 * createQueue - bagong empty na queue na may space para sa `capacity` na items
 * (kusa siyang lalaki pag puno na).
 * Time: O(n), Space: O(n)
 */
function createQueue(capacity) {
  const size = capacity > 0 ? capacity : 8;
  return { items: arrayFilled(size, undefined), front: 0, count: 0, capacity: size };
}

/** queueSize - ilan yung items na naghihintay. Time: O(1) */
function queueSize(queue) {
  return queue.count;
}

/** queueIsEmpty - true kung walang naghihintay. Time: O(1) */
function queueIsEmpty(queue) {
  return queue.count === 0;
}

/** queueIsFull - true kung gamit na lahat ng slot. Time: O(1) */
function queueIsFull(queue) {
  return queue.count === queue.capacity;
}

/**
 * queueGrow - doblehin yung capacity, tapos kopyahin yung items (in queue order)
 * sa simula ng bagong array. Nangyayari lang ito pag puno na yung queue.
 * Time: O(n), Space: O(n)
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
 * enqueue - idagdag yung item sa rear.
 * Time: O(1) amortised (O(n) lang sa bihirang pag-grow), Space: O(1)
 */
function enqueue(queue, item) {
  if (queueIsFull(queue)) {                                   // 1. wala nang bakanteng slot -> doblehin yung array
    queueGrow(queue);
  }
  const rear = (queue.front + queue.count) % queue.capacity;  // 2. yung slot pagkatapos ng huling item (babalik sa 0)
  queue.items[rear] = item;                                   // 3. ilagay yung item sa rear
  queue.count = queue.count + 1;
  return queue.count;
}

/**
 * dequeue - tanggalin yung item sa front (pinakaluma) tapos i-return, o null kung empty.
 * Yung `front` index lang ang gumagalaw; walang item na inuusog.
 * Time: O(1), Space: O(1)
 */
function dequeue(queue) {
  if (queue.count === 0) {                             // empty yung queue -> walang ise-serve
    return null;
  }
  const item = queue.items[queue.front];               // 1. nasa front yung pinakalumang item
  queue.items[queue.front] = undefined;                // 2. linisin yung slot niya
  queue.front = (queue.front + 1) % queue.capacity;    // 3. yung kasunod na ang magiging front (babalik sa 0)
  queue.count = queue.count - 1;
  return item;
}

/**
 * queuePeek - silipin yung item sa front nang hindi tinatanggal, o null kung empty.
 * Time: O(1), Space: O(1)
 */
function queuePeek(queue) {
  if (queue.count === 0) {
    return null;
  }
  return queue.items[queue.front];
}

/**
 * enqueueBounded - mag-add ng item; pero kung puno na yung queue, tanggalin muna
 * yung pinakaluma. Dahil dito nagiging fixed-size ring buffer yung queue (log na
 * yung pinakabagong entries lang ang tinatago).
 * Time: O(1), Space: O(1)
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
 * queueToArray - yung mga naghihintay na items mula front (susunod) hanggang rear (huli), pang-display.
 * Time: O(n), Space: O(n)
 */
function queueToArray(queue) {
  const list = [];
  for (let i = 0; i < queue.count; i++) {
    arrayAppend(list, queue.items[(queue.front + i) % queue.capacity]);
  }
  return list;
}

/** queueClear - tanggalin lahat. Time: O(n) */
function queueClear(queue) {
  queue.items = arrayFilled(queue.capacity, undefined);
  queue.front = 0;
  queue.count = 0;
}
