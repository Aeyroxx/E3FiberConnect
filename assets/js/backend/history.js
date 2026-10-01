/* ==========================================================================
   E3 Fiber Connect - backend/history.js
   Dito yung activity log at yung Undo stack.

   Activity log - array na append lang (oldest -> newest). Binabasa ng mga page
   mula sa dulo para mauna yung pinakabago.

   Undo - isang STACK (dsa/stack.js). Bawat action ng admin, nagpu-push ng isang
   entry na alam kung paano ibabalik yung ginawa. Pag pinindot yung "Undo", pino-pop
   yung pinakabagong entry tapos ire-reverse (last in, first out). Bawat entry may
   listahan ng operations:
     { op: 'update', table, key, before: { field: oldValue, ... } }  -> ibalik yung fields
     { op: 'insert', table, key }                                    -> tanggalin yung record
   UNDO_LIMIT lang na pinakabagong actions yung tinatago (tinatapon yung nasa bottom).
   ========================================================================== */

'use strict';

const UNDO_LIMIT = 25;
const undoStack = createStack();

/** nameOfActor - yung pangalan na ipapakita para sa gumawa ng action. O(1) */
function nameOfActor(actor) {
  return actor ? actor.fullName : 'System';
}

/** logActivity - magdagdag ng isang line sa activity log. Time: O(1), Space: O(1) */
function logActivity(kind, message, actorName) {
  arrayAppend(activityLog, { at: nowISO(), kind: kind, message: message, actor: actorName || 'System' });
}

/**
 * recentActivity - kunin yung `limit` na pinakabagong log lines, newest first
 * (sa dulo nagsisimula magbasa).
 * Time: O(n), Space: O(n)
 */
function recentActivity(limit) {
  const list = [];
  for (let i = activityLog.length - 1; i >= 0 && list.length < limit; i--) {
    arrayAppend(list, activityLog[i]);
  }
  return list;
}

/**
 * snapshotFields - kopyahin muna yung mga nakalistang field ng record bago galawin
 * (kinokopya rin yung arrays, para hindi maapektuhan yung snapshot ng mga susunod na pagbabago).
 * Time: O(n), Space: ganun din
 */
function snapshotFields(record, fieldNames) {
  const snapshot = {};
  for (let i = 0; i < fieldNames.length; i++) {
    const value = record[fieldNames[i]];
    snapshot[fieldNames[i]] = value instanceof Array ? arrayCopy(value) : value;
  }
  return snapshot;
}

/** updateOperation / insertOperation - yung dalawang klase ng change na pwedeng i-undo. O(1) */
function updateOperation(tableName, key, before) {
  return { op: 'update', table: tableName, key: key, before: before };
}

function insertOperation(tableName, key) {
  return { op: 'insert', table: tableName, key: key };
}

/**
 * pushUndo - i-save yung action para ma-reverse later. Kung puno na yung stack
 * (UNDO_LIMIT entries na), tatanggalin muna yung pinakaluma sa bottom.
 * Time: O(1), O(n) lang pag may tinanggal sa bottom, Space: O(1)
 */
function pushUndo(label, operations, actorName) {
  if (stackSize(undoStack) >= UNDO_LIMIT) {
    stackRemoveBottom(undoStack);
  }
  stackPush(undoStack, { label: label, operations: operations, at: nowISO(), actor: actorName || 'System' });
}

/** peekUndo - silipin kung anong action yung susunod na ma-undo, hindi tinatanggal. O(1) */
function peekUndo() {
  return stackPeek(undoStack);
}

/** undoCount - ilan pa yung actions na pwedeng i-undo. O(1) */
function undoCount() {
  return stackSize(undoStack);
}

/** undoEntries - buong stack, newest first, para sa Activity page. O(n) */
function undoEntries() {
  return stackToArray(undoStack);
}

/** clearUndoHistory - burahin lahat ng undo steps (ginagamit pag nire-seed ulit yung data). O(1) */
function clearUndoHistory() {
  stackClear(undoStack);
}

/**
 * revertOperation - i-reverse yung isang naka-save na operation. Binary search
 * ang gamit para mahanap yung record, kasi naka-sort lahat ng table by key.
 * Time: O(log n) sa updates, O(n) pag tatanggalin yung na-insert na record
 */
function revertOperation(operation) {
  const table = findTable(operation.table);
  if (!table) {
    return;
  }
  const index = binarySearch(table.rows, table.keyField, operation.key);
  if (index === -1) {
    return;
  }
  if (operation.op === 'update') {
    const record = table.rows[index];
    for (const field in operation.before) {
      const value = operation.before[field];
      record[field] = value instanceof Array ? arrayCopy(value) : value;
    }
  } else if (operation.op === 'insert') {
    arrayRemoveAt(table.rows, index);
  }
  if (operation.table === 'staffMembers') {
    rebuildStaffEmailIndex();
  }
}

/**
 * undoBlockedReason - kung bakit hindi safe i-undo yung entry, or '' kung okay.
 * Wala sa Undo stack yung mga ginawa mismo ng customer (payment reports, access
 * requests), kaya pag nag-undo ng lumang staff action, hindi dapat mawalan sila
 * ng bill, at hindi rin dapat magkaroon ng pangalawang naghihintay na report /
 * request para sa parehong bill o e-mail.
 * Time: O(n²) - O(n) bawat operation (pag nag-remove ng record, usog yung iba), Space: O(1)
 */
function undoBlockedReason(entry) {
  for (let i = 0; i < entry.operations.length; i++) {
    const operation = entry.operations[i];
    if (operation.table === 'bills' && operation.op === 'insert' && pendingPaymentForBill(operation.key)) {
      return 'a customer has already reported a payment for one of its bills, so it can no longer be undone.';
    }
    if (operation.table === 'payments' && operation.op === 'update' && operation.before.status === 'For verification') {
      const payment = findPayment(operation.key);
      const waiting = payment ? pendingPaymentForBill(payment.billId) : null;
      if (waiting && waiting.paymentId !== payment.paymentId) {
        return 'the customer already sent a new report for this bill (' + waiting.paymentId + ').';
      }
    }
    if (operation.table === 'registrations' && operation.op === 'update' && operation.before.status === 'Pending') {
      const request = findRegistration(operation.key);
      const waiting = request ? pendingRegistrationFor(request.email) : null;
      if (waiting && waiting.registrationId !== request.registrationId) {
        return 'a newer request for this e-mail is waiting (' + waiting.registrationId + ').';
      }
    }
  }
  return '';
}

/**
 * undoTouchesAccounts - may madadagdag, matatanggal o mababago bang staff o
 * subscriber account pag ni-reverse ito? Kung oo, kailangan ng Google Authenticator
 * code, same lang nung ginawa yung change. Time: O(n) para sa n operations
 */
function undoTouchesAccounts(entry) {
  for (let i = 0; i < entry.operations.length; i++) {
    if (entry.operations[i].table === 'staffMembers' || entry.operations[i].table === 'subscribers') {
      return true;
    }
  }
  return false;
}

/**
 * undoLastAction - i-pop yung pinakabagong entry tapos i-reverse yung operations
 * nito, simula sa huli (kung dalawang table yung nagalaw, pabaliktad yung pag-undo).
 * Binabalik: yung entry; null kung wala nang ma-undo; step-up error kung account
 * yung nabago at wala pang na-verify na code; o kaya
 * { blocked: true, label, error } kung hindi pwedeng i-undo (maiiwan lang sa stack).
 * Time: O(n²) - O(n) bawat operation (pag nag-remove ng record, usog yung iba), Space: O(1)
 */
function undoLastAction(actorName) {
  const top = stackPeek(undoStack);                   // 1. silipin muna yung pinakabagong entry
  if (!top) {
    return null;
  }
  const blocked = undoBlockedReason(top);             // 2. masisira ba yung report o request ng customer pag ni-reverse?
  if (blocked !== '') {
    return { blocked: true, label: top.label, error: 'Can’t undo “' + top.label + '”: ' + blocked };
  }
  if (undoTouchesAccounts(top)) {                     // 3. pag account yung nabago, kailangan ng code kahit undo lang
    const stepUp = stepUpRequired();
    if (stepUp) {
      return stepUp;
    }
  }
  const entry = stackPop(undoStack);                  // 4. i-pop na tapos i-reverse yung operations, newest first
  for (let i = entry.operations.length - 1; i >= 0; i--) {
    revertOperation(entry.operations[i]);
  }
  logActivity('undo', 'Undid: ' + entry.label, actorName);
  markDataChanged();
  return entry;
}
