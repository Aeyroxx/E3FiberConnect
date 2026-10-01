/* ==========================================================================
   E3 Fiber Connect - dsa/hashtable.js
   Hash table na separate chaining, procedural yung pagkakasulat (walang Map / Set).

   Yung table ay simpleng record { buckets: [[...], [...], ...], size }. Yung key (text)
   ginagawang bucket number ni hashText; bawat bucket ay maliit na array ng
   { key, value } entries, kaya kung dalawang key ang napunta sa iisang bucket
   (tinatawag na "collision"), magkasama lang sila doon.

   Saan ginamit: staff e-mail -> staff id (staffEmailIndex), para yung sign in at
   yung "e-mail already used" check ay O(1) on average imbes na linear search;
   payment "METHOD:REFERENCE" -> payment ids (paymentReferenceIndex), para sa
   check na "hindi pa nagamit yung reference number"; at yung bilang ng maling
   sign-in tries per e-mail.
   ========================================================================== */

'use strict';

const HASH_MAX_LOAD = 0.75; // lalaki yung table pag lumampas ng 0.75 entries per bucket

/**
 * createHashTable - empty na table na may `bucketCount` na buckets (mas maganda kung prime, mas kalat yung keys).
 * Time: O(n), Space: O(n)
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
 * hashText - yung djb2 string hash: magsimula sa 5381, tapos bawat character
 * hash = hash × 33 + character code. Pinapanatiling below 2^32, tapos ginagawang bucket number.
 * Time: O(n), n = haba ng key, Space: O(1)
 */
function hashText(key, bucketCount) {
  const text = textOf(key);
  let hash = 5381;                                              // 1. sa 5381 nagsisimula yung djb2
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 33 + text.charCodeAt(i)) % 4294967296;       // 2. ihalo bawat character, dapat below 2^32
  }
  return hash % bucketCount;                                    // 3. yung remainder ang bucket number
}

/**
 * hashFindInBucket - position ng `key` sa loob ng isang bucket, o -1 (linear search
 * lang sa ilang entries na magkasama sa bucket).
 * Time: O(n), Space: O(1)
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
 * hashResize - gawin ulit yung table na halos doble yung buckets, tapos ilipat
 * bawat entry sa bago niyang bucket ("rehashing").
 * Time: O(n), Space: O(n)
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
 * hashPut - i-store yung `value` sa ilalim ng `key`; kung meron na yung key, papalitan yung value.
 * Time: O(1) average, O(n) worst (pag lahat napunta sa isang bucket), Space: O(1)
 */
function hashPut(table, key, value) {
  const bucket = table.buckets[hashText(key, table.buckets.length)];  // 1. i-hash yung key -> bucket niya
  const position = hashFindInBucket(bucket, key);                      // 2. naka-store na ba?
  if (position !== -1) {
    bucket[position].value = value;                                    //    oo -> palitan yung value
    return;
  }
  arrayAppend(bucket, { key: key, value: value });                     // 3. hindi -> idagdag sa chain ng bucket
  table.size = table.size + 1;
  if (table.size / table.buckets.length > HASH_MAX_LOAD) {             // 4. masyado nang puno -> halos doblehin yung buckets
    hashResize(table);
  }
}

/**
 * hashGet - yung value na naka-store sa `key`, o null.
 * Time: O(1) average, Space: O(1)
 */
function hashGet(table, key) {
  const bucket = table.buckets[hashText(key, table.buckets.length)];  // 1. diretso agad sa bucket ng key
  const position = hashFindInBucket(bucket, key);                      // 2. i-check yung ilang keys sa bucket na yun
  return position === -1 ? null : bucket[position].value;
}

/** hashHas - true kung naka-store yung `key`. Time: O(1) average */
function hashHas(table, key) {
  const bucket = table.buckets[hashText(key, table.buckets.length)];
  return hashFindInBucket(bucket, key) !== -1;
}

/**
 * hashRemove - burahin yung `key` (pati value niya). True kung may natanggal.
 * Time: O(1) average, Space: O(1)
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
 * hashStats - mga numbers para sa Algorithms page: size, buckets, load factor,
 * pinakamahabang chain at ilang entries ang nag-collide sa naunang entry.
 * Time: O(n), Space: O(1)
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
