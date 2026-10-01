/* ==========================================================================
   E3 Fiber Connect - backend/qrcode.js
   QR code encoder na ginawa namin by hand, para sa setup link ng Google Authenticator
   (otpauth://...). Sinusunod nito yung QR standard (ISO/IEC 18004):

     1. data  -> bits: mode "byte" (0100), character count, yung bytes, padding;
     2. bits  -> codewords, hinahati sa blocks, tapos bawat isa may Reed-Solomon error
                correction (level M: kahit ~15% ng code masira, mababasa pa rin);
     3. ilagay yung finder, timing at alignment patterns, tapos yung data na pa-zig-zag
        simula sa bottom-right na corner;
     4. subukan lahat ng 8 masks at piliin yung may pinakamababang penalty score, tapos
        isulat yung format information (at simula version 7, pati version information).

   Versions 1-10 lang yung supported (hanggang 213 bytes sa level M) - sobra na yun
   para sa otpauth link. Yung result ay square grid ng true (dark) / false (light).
   ========================================================================== */

'use strict';

// Level M: total na codewords, error-correction codewords kada block, blocks [count, data codewords].
const QR_M_BLOCKS = [
  null,
  { total: 26, ec: 10, groups: [[1, 16]] },
  { total: 44, ec: 16, groups: [[1, 28]] },
  { total: 70, ec: 26, groups: [[1, 44]] },
  { total: 100, ec: 18, groups: [[2, 32]] },
  { total: 134, ec: 24, groups: [[2, 43]] },
  { total: 172, ec: 16, groups: [[4, 27]] },
  { total: 196, ec: 18, groups: [[4, 31]] },
  { total: 242, ec: 22, groups: [[2, 38], [2, 39]] },
  { total: 292, ec: 22, groups: [[3, 36], [2, 37]] },
  { total: 346, ec: 26, groups: [[4, 43], [1, 44]] },
];
const QR_ALIGNMENT = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const QR_EC_LEVEL_M = 0;   // format bits para sa level M

/* ----------------------------------------------------- Galois field GF(256) */

const qrGf = { exp: [], log: [] };

/** qrInitGalois - exponent / logarithm tables para sa GF(256) gamit yung polynomial 0x11D. O(1) */
function qrInitGalois() {
  if (qrGf.exp.length > 0) {
    return;
  }
  let x = 1;
  for (let i = 0; i < 255; i++) {
    qrGf.exp[i] = x;
    qrGf.log[x] = i;
    x = x << 1;
    if (x & 0x100) {
      x = x ^ 0x11d;
    }
  }
  for (let i = 255; i < 512; i++) {
    qrGf.exp[i] = qrGf.exp[i - 255];
  }
}

/** qrMultiply - multiplication sa loob ng GF(256). O(1) */
function qrMultiply(a, b) {
  if (a === 0 || b === 0) {
    return 0;
  }
  return qrGf.exp[qrGf.log[a] + qrGf.log[b]];
}

/** qrGenerator - yung Reed-Solomon generator polynomial (x - α⁰)(x - α¹)..., nauuna yung pinakamataas na power. O(n²) */
function qrGenerator(degree) {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = [];
    for (let j = 0; j <= poly.length; j++) {
      next[j] = 0;
    }
    for (let j = 0; j < poly.length; j++) {
      next[j] = next[j] ^ poly[j];
      next[j + 1] = next[j + 1] ^ qrMultiply(poly[j], qrGf.exp[i]);
    }
    poly = next;
  }
  return poly;
}

/** qrErrorCorrection - yung remainder ng data * xⁿ na hinati sa generator = yung EC codewords. O(n²) */
function qrErrorCorrection(data, degree) {
  const generator = qrGenerator(degree);
  const work = [];
  for (let i = 0; i < data.length; i++) {
    arrayAppend(work, data[i]);
  }
  for (let i = 0; i < degree; i++) {
    arrayAppend(work, 0);
  }
  for (let i = 0; i < data.length; i++) {
    const factor = work[i];
    if (factor !== 0) {
      for (let j = 0; j < generator.length; j++) {
        work[i + j] = work[i + j] ^ qrMultiply(generator[j], factor);
      }
    }
  }
  const ec = [];
  for (let i = data.length; i < work.length; i++) {
    arrayAppend(ec, work[i]);
  }
  return ec;
}

/* ------------------------------------------------------ pag-encode ng data */

/** qrAppendBits - idagdag yung `length` na bits ng `value` (most significant muna). O(n) */
function qrAppendBits(bits, value, length) {
  for (let i = length - 1; i >= 0; i--) {
    arrayAppend(bits, (value >>> i) & 1);
  }
}

/** qrDataCapacity - ilang data codewords kasya sa isang version sa level M. O(1) */
function qrDataCapacity(version) {
  const groups = QR_M_BLOCKS[version].groups;
  let total = 0;
  for (let i = 0; i < groups.length; i++) {
    total += groups[i][0] * groups[i][1];
  }
  return total;
}

/**
 * qrCodewords - 1. piliin yung pinakamaliit na version na kasya; 2. buuin yung bit
 * stream; 3. pad; 4. hatiin sa blocks, lagyan ng EC, tapos i-interleave.
 * Time: O(n²)
 */
function qrCodewords(bytes) {
  let version = 1;
  while (version <= 10 && 4 + (version < 10 ? 8 : 16) + bytes.length * 8 > qrDataCapacity(version) * 8) {
    version++;
  }
  if (version > 10) {
    return null;
  }
  const capacity = qrDataCapacity(version);
  const bits = [];
  qrAppendBits(bits, 4, 4);                                  // byte mode yung gamit natin
  qrAppendBits(bits, bytes.length, version < 10 ? 8 : 16);  // bilang ng characters
  for (let i = 0; i < bytes.length; i++) {
    qrAppendBits(bits, bytes[i], 8);
  }
  const terminator = capacity * 8 - bits.length < 4 ? capacity * 8 - bits.length : 4;
  qrAppendBits(bits, 0, terminator);
  while (bits.length % 8 !== 0) {
    arrayAppend(bits, 0);
  }
  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | bits[i + j];
    }
    arrayAppend(data, byte);
  }
  for (let pad = 0; data.length < capacity; pad++) {
    arrayAppend(data, pad % 2 === 0 ? 0xec : 0x11);          // yung standard na pad bytes
  }

  qrInitGalois();
  const info = QR_M_BLOCKS[version];
  const dataBlocks = [];
  const ecBlocks = [];
  let offset = 0;
  for (let g = 0; g < info.groups.length; g++) {
    for (let b = 0; b < info.groups[g][0]; b++) {
      const block = [];
      for (let i = 0; i < info.groups[g][1]; i++) {
        arrayAppend(block, data[offset + i]);
      }
      offset += info.groups[g][1];
      arrayAppend(dataBlocks, block);
      arrayAppend(ecBlocks, qrErrorCorrection(block, info.ec));
    }
  }
  const result = [];
  let longest = 0;
  for (let b = 0; b < dataBlocks.length; b++) {
    longest = dataBlocks[b].length > longest ? dataBlocks[b].length : longest;
  }
  for (let i = 0; i < longest; i++) {                        // interleave: unang byte ng bawat block, tapos yung pangalawa...
    for (let b = 0; b < dataBlocks.length; b++) {
      if (i < dataBlocks[b].length) {
        arrayAppend(result, dataBlocks[b][i]);
      }
    }
  }
  for (let i = 0; i < info.ec; i++) {
    for (let b = 0; b < ecBlocks.length; b++) {
      arrayAppend(result, ecBlocks[b][i]);
    }
  }
  return { version: version, codewords: result };
}

/* ------------------------------------------------------ yung matrix ng QR */

/** qrGrid - size × size na grid na puro `value` ang laman. O(n²) */
function qrGrid(size, value) {
  const grid = [];
  for (let y = 0; y < size; y++) {
    const row = [];
    for (let x = 0; x < size; x++) {
      arrayAppend(row, value);
    }
    arrayAppend(grid, row);
  }
  return grid;
}

/** qrSet - mag-set ng function-pattern module (hindi na ito gagalawin ng data o ng masks). O(1) */
function qrSet(qr, x, y, dark) {
  qr.modules[y][x] = dark;
  qr.reserved[y][x] = true;
}

/** qrFinder - yung 7×7 na "eye" kasama yung light na separator, naka-center sa (cx, cy). O(1) */
function qrFinder(qr, cx, cy) {
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x >= 0 && x < qr.size && y >= 0 && y < qr.size) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        qrSet(qr, x, y, distance !== 2 && distance !== 4);
      }
    }
  }
}

/** qrAlignment - 5×5 na alignment pattern na naka-center sa (cx, cy). O(1) */
function qrAlignment(qr, cx, cy) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      qrSet(qr, cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
}

/** qrFormatBits - 15 bits: level + mask, BCH error correction, tapos XOR 0x5412. O(1) */
function qrFormatBits(mask) {
  const data = (QR_EC_LEVEL_M << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) {
    rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  }
  return ((data << 10) | rem) ^ 0x5412;
}

/** qrDrawFormat - isulat yung dalawang kopya ng format information. O(1) */
function qrDrawFormat(qr, mask) {
  const bits = qrFormatBits(mask);
  const bit = function (i) { return ((bits >>> i) & 1) === 1; };
  for (let i = 0; i <= 5; i++) {
    qrSet(qr, 8, i, bit(i));
  }
  qrSet(qr, 8, 7, bit(6));
  qrSet(qr, 8, 8, bit(7));
  qrSet(qr, 7, 8, bit(8));
  for (let i = 9; i < 15; i++) {
    qrSet(qr, 14 - i, 8, bit(i));
  }
  for (let i = 0; i < 8; i++) {
    qrSet(qr, qr.size - 1 - i, 8, bit(i));
  }
  for (let i = 8; i < 15; i++) {
    qrSet(qr, 8, qr.size - 15 + i, bit(i));
  }
  qrSet(qr, 8, qr.size - 8, true);    // ito yung tinatawag na "dark module"
}

/** qrDrawVersion - pag version 7 pataas, may 18-bit na version block sa dalawang corner. O(1) */
function qrDrawVersion(qr) {
  if (qr.version < 7) {
    return;
  }
  let rem = qr.version;
  for (let i = 0; i < 12; i++) {
    rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  }
  const bits = (qr.version << 12) | rem;
  for (let i = 0; i < 18; i++) {
    const dark = ((bits >>> i) & 1) === 1;
    const a = qr.size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    qrSet(qr, a, b, dark);
    qrSet(qr, b, a, dark);
  }
}

/** qrMaskHit - yung 8 standard na mask rules: true kung saan ifi-flip yung data module. O(1) */
function qrMaskHit(mask, x, y) {
  if (mask === 0) { return (x + y) % 2 === 0; }
  if (mask === 1) { return y % 2 === 0; }
  if (mask === 2) { return x % 3 === 0; }
  if (mask === 3) { return (x + y) % 3 === 0; }
  if (mask === 4) { return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; }
  if (mask === 5) { return (x * y) % 2 + (x * y) % 3 === 0; }
  if (mask === 6) { return ((x * y) % 2 + (x * y) % 3) % 2 === 0; }
  return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
}

/** qrPenalty - yung standard na 4-rule penalty (mahahabang runs, 2×2 blocks, runs na kamukha ng finder, balance ng dark). O(n²) */
function qrPenalty(qr) {
  const size = qr.size;
  const m = qr.modules;
  let score = 0;
  let dark = 0;
  for (let pass = 0; pass < 2; pass++) {                  // rule 1 + rule 3, rows muna tapos columns
    for (let a = 0; a < size; a++) {
      let run = 1;
      for (let b = 0; b < size; b++) {
        const cur = pass === 0 ? m[a][b] : m[b][a];
        if (b > 0) {
          const prev = pass === 0 ? m[a][b - 1] : m[b - 1][a];
          if (cur === prev) {
            run++;
            if (run === 5) { score += 3; } else if (run > 5) { score += 1; }
          } else {
            run = 1;
          }
        }
        if (b + 6 < size) {
          const at = function (k) { return pass === 0 ? m[a][b + k] : m[b + k][a]; };
          if (at(0) && !at(1) && at(2) && at(3) && at(4) && !at(5) && at(6)) {
            let lightBefore = true;
            let lightAfter = true;
            for (let k = 1; k <= 4; k++) {
              if (b - k >= 0 && (pass === 0 ? m[a][b - k] : m[b - k][a])) { lightBefore = false; }
              if (b + 6 + k < size && (pass === 0 ? m[a][b + 6 + k] : m[b + 6 + k][a])) { lightAfter = false; }
            }
            if (lightBefore || lightAfter) { score += 40; }
          }
        }
      }
    }
  }
  for (let y = 0; y < size; y++) {                        // rule 2 + rule 4 naman dito
    for (let x = 0; x < size; x++) {
      if (m[y][x]) { dark++; }
      if (y + 1 < size && x + 1 < size && m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) {
        score += 3;
      }
    }
  }
  const total = size * size;
  const deviation = Math.abs(dark * 20 - total * 10);
  score += Math.floor(deviation / total) * 10;
  return score;
}

/**
 * makeQrMatrix - yung buong QR code para sa `text` (ASCII), o null kung masyadong mahaba.
 * Binabalik: { size, version, mask, modules } kung saan true yung modules[y][x] pag dark.
 * Time: O(n²), Space: O(n²)
 */
function makeQrMatrix(text) {
  const bytes = [];
  for (let i = 0; i < text.length; i++) {
    arrayAppend(bytes, text.charCodeAt(i) & 0xff);
  }
  const encoded = qrCodewords(bytes);                     // 1-2. gawin yung bits, blocks at error correction
  if (!encoded) {
    return null;
  }
  const size = 17 + encoded.version * 4;
  const qr = { version: encoded.version, size: size, modules: qrGrid(size, false), reserved: qrGrid(size, false) };

  qrFinder(qr, 3, 3);                                     // 3. ilagay yung function patterns
  qrFinder(qr, size - 4, 3);
  qrFinder(qr, 3, size - 4);
  for (let i = 0; i < size; i++) {
    if (!qr.reserved[6][i]) { qrSet(qr, i, 6, i % 2 === 0); }
    if (!qr.reserved[i][6]) { qrSet(qr, 6, i, i % 2 === 0); }
  }
  const centres = QR_ALIGNMENT[encoded.version];
  for (let i = 0; i < centres.length; i++) {
    for (let j = 0; j < centres.length; j++) {
      const nearFinder = (i === 0 && j === 0) || (i === 0 && j === centres.length - 1) || (i === centres.length - 1 && j === 0);
      if (!nearFinder) {
        qrAlignment(qr, centres[i], centres[j]);
      }
    }
  }
  qrDrawFormat(qr, 0);                                    // i-reserve muna yung format areas
  qrDrawVersion(qr);

  const bitCount = encoded.codewords.length * 8;          // paglagay ng data pa-zig-zag
  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) {
      right = 5;                                          // laktawan yung vertical na timing line
    }
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!qr.reserved[y][x] && bitIndex < bitCount) {
          const byte = encoded.codewords[bitIndex >>> 3];
          qr.modules[y][x] = ((byte >>> (7 - (bitIndex & 7))) & 1) === 1;
          bitIndex++;
        }
      }
    }
  }

  let bestMask = 0;                                       // 4. hanapin yung mask na pinakamababa ang penalty
  let bestScore = -1;
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const trial = { version: qr.version, size: size, modules: qrGrid(size, false), reserved: qr.reserved };
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const flip = !qr.reserved[y][x] && qrMaskHit(mask, x, y);
        trial.modules[y][x] = flip ? !qr.modules[y][x] : qr.modules[y][x];
      }
    }
    qrDrawFormat(trial, mask);
    const score = qrPenalty(trial);
    if (bestScore === -1 || score < bestScore) {
      bestScore = score;
      bestMask = mask;
      best = trial;
    }
  }
  return { size: size, version: qr.version, mask: bestMask, modules: best.modules };
}
