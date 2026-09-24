/* ==========================================================================
   E3 Fiber Connect · dsa/hashtable.js
   Hash table with separate chaining, written procedurally (no Map / Set).

   A table is a plain record { buckets: [[…], […], …], size }. A key (text) is
   turned into a bucket number by hashText; each bucket is a small array of
   { key, value } entries, so two keys that land in the same bucket (a
   "collision") simply share it.

   Used for: staff e-mail → staff id (staffEmailIndex), so signing in and the
   "e-mail already used" check take O(1) on average instead of a linear search;
   payment "METHOD:REFERENCE" → payment ids (paymentReferenceIndex), for the
   "reference number not used before" check; and wrong sign-in tries per e-mail.
   ========================================================================== */

'use strict';

const HASH_MAX_LOAD = 0.75; // grow when there are more than 0.75 entries per bucket

/**
 * createHashTable — an empty table with `bucketCount` buckets (a prime spreads keys better).
 * Time O(b) · Space O(b)
 */
function createHashTable(bucketCount) {
  const count = bucketCount > 0 ? bucketCount : 17;
  const buckets = [];
  for (let i = 0; i < count; i++) {
    buckets[i] = [];
  }
  return { buckets: buckets, size: 0 };
}

/**
 * hashText — the djb2 string hash: start at 5381, then for every character
 * hash = hash × 33 + character code. Kept below 2^32, then reduced to a bucket.
 * Time O(k), k = key length · Space O(1)
 */
function hashText(key, bucketCount) {
  const text = textOf(key);
  let hash = 5381;                                              // 1. djb2 starts at 5381
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 33 + text.charCodeAt(i)) % 4294967296;       // 2. mix in each character, stay below 2^32
  }
  return hash % bucketCount;                                    // 3. the remainder is the bucket number
}

/**
 * hashFindInBucket — position of `key` inside one bucket, or -1 (linear search
 * over the few entries that share the bucket).
 * Time O(chain length) · Space O(1)
 */
function hashFindInBucket(bucket, key) {
  for (let i = 0; i < bucket.length; i++) {
    if (bucket[i].key === key) {
      return i;
    }
  }
  return -1;
}

/**
 * hashResize — rebuild the table with about twice as many buckets and put
 * every entry into its new bucket ("rehashing").
 * Time O(n + b) · Space O(n + b)
 */
function hashResize(table) {
  const old = table.buckets;
  const fresh = createHashTable(old.length * 2 + 1);
  for (let b = 0; b < old.length; b++) {
    for (let e = 0; e < old[b].length; e++) {
      const entry = old[b][e];
      arrayAppend(fresh.buckets[hashText(entry.key, fresh.buckets.length)], entry);
    }
  }
  table.buckets = fresh.buckets;
}

/**
 * hashPut — store `value` under `key`; replaces the value if the key exists.
 * Time O(1) average, O(n) worst (everything in one bucket) · Space O(1)
 */
function hashPut(table, key, value) {
  const bucket = table.buckets[hashText(key, table.buckets.length)];  // 1. hash the key → its bucket
  const position = hashFindInBucket(bucket, key);                      // 2. already stored?
  if (position !== -1) {
    bucket[position].value = value;                                    //    yes → replace the value
    return;
  }
  arrayAppend(bucket, { key: key, value: value });                     // 3. no → add it to the bucket's chain
  table.size = table.size + 1;
  if (table.size / table.buckets.length > HASH_MAX_LOAD) {             // 4. too full → about double the buckets
    hashResize(table);
  }
}

/**
 * hashGet — the value stored under `key`, or null.
 * Time O(1) average · Space O(1)
 */
function hashGet(table, key) {
  const bucket = table.buckets[hashText(key, table.buckets.length)];  // 1. jump straight to the key's bucket
  const position = hashFindInBucket(bucket, key);                      // 2. check the few keys in that bucket
  return position === -1 ? null : bucket[position].value;
}

/** hashHas — true when `key` is stored. Time O(1) average */
function hashHas(table, key) {
  const bucket = table.buckets[hashText(key, table.buckets.length)];
  return hashFindInBucket(bucket, key) !== -1;
}

/**
 * hashRemove — delete `key` (and its value). Returns true if something was removed.
 * Time O(1) average · Space O(1)
 */
function hashRemove(table, key) {
  const bucket = table.buckets[hashText(key, table.buckets.length)];
  const position = hashFindInBucket(bucket, key);
  if (position === -1) {
    return false;
  }
  arrayRemoveAt(bucket, position);
  table.size = table.size - 1;
  return true;
}

/**
 * hashStats — numbers for the Algorithms page: size, buckets, load factor,
 * the longest chain and how many entries collided with an earlier one.
 * Time O(b) · Space O(1)
 */
function hashStats(table) {
  let longest = 0;
  let collisions = 0;
  let used = 0;
  for (let b = 0; b < table.buckets.length; b++) {
    const length = table.buckets[b].length;
    if (length > longest) {
      longest = length;
    }
    if (length > 0) {
      used++;
      collisions += length - 1;
    }
  }
  return {
    size: table.size,
    buckets: table.buckets.length,
    usedBuckets: used,
    loadFactor: table.size / table.buckets.length,
    longestChain: longest,
    collisions: collisions,
  };
}
