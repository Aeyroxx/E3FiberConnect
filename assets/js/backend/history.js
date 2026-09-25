/* ==========================================================================
   E3 Fiber Connect · backend/history.js
   The activity log and the Undo stack.

   Activity log — an append-only array (oldest → newest). Pages read it from
   the end to show the newest first.

   Undo — a STACK (dsa/stack.js). Every admin action pushes one entry that
   remembers how to reverse it; "Undo" pops the newest entry and reverses it
   (last in, first out). An entry holds a list of operations:
     { op: 'update', table, key, before: { field: oldValue, … } }  → restore fields
     { op: 'insert', table, key }                                  → remove the record
   Only the latest UNDO_LIMIT actions are kept (the bottom is dropped).
   ========================================================================== */

'use strict';

const UNDO_LIMIT = 25;
const undoStack = createStack();

/** nameOfActor — the display name for whoever did something. O(1) */
function nameOfActor(actor) {
  return actor ? actor.fullName : 'System';
}

/** logActivity — add one line to the activity log. Time O(1) · Space O(1) */
function logActivity(kind, message, actorName) {
  arrayAppend(activityLog, { at: nowISO(), kind: kind, message: message, actor: actorName || 'System' });
}

/**
 * recentActivity — the newest `limit` log lines, newest first (reads from the end).
 * Time O(limit) · Space O(limit)
 */
function recentActivity(limit) {
  const list = [];
  for (let i = activityLog.length - 1; i >= 0 && list.length < limit; i--) {
    arrayAppend(list, activityLog[i]);
  }
  return list;
}

/**
 * snapshotFields — copy the listed fields of a record before changing them
 * (arrays are copied too, so later changes cannot alter the snapshot).
 * Time O(f + total array length) · Space the same
 */
function snapshotFields(record, fieldNames) {
  const snapshot = {};
  for (let i = 0; i < fieldNames.length; i++) {
    const value = record[fieldNames[i]];
    snapshot[fieldNames[i]] = value instanceof Array ? arrayCopy(value) : value;
  }
  return snapshot;
}

/** updateOperation / insertOperation — the two kinds of reversible change. O(1) */
function updateOperation(tableName, key, before) {
  return { op: 'update', table: tableName, key: key, before: before };
}

function insertOperation(tableName, key) {
  return { op: 'insert', table: tableName, key: key };
}

/**
 * pushUndo — remember an action so it can be reversed. When the stack already
 * holds UNDO_LIMIT entries, the oldest (bottom) one is dropped first.
 * Time O(1), O(n) only when the bottom is dropped · Space O(1)
 */
function pushUndo(label, operations, actorName) {
  if (stackSize(undoStack) >= UNDO_LIMIT) {
    stackRemoveBottom(undoStack);
  }
  stackPush(undoStack, { label: label, operations: operations, at: nowISO(), actor: actorName || 'System' });
}

/** peekUndo — the action Undo would reverse next, without removing it. O(1) */
function peekUndo() {
  return stackPeek(undoStack);
}

/** undoCount — how many actions can be undone. O(1) */
function undoCount() {
  return stackSize(undoStack);
}

/** undoEntries — the whole stack, newest first, for the Activity page. O(n) */
function undoEntries() {
  return stackToArray(undoStack);
}

/** clearUndoHistory — forget every undo step (used when the data is re-seeded). O(1) */
function clearUndoHistory() {
  stackClear(undoStack);
}

/**
 * revertOperation — reverse one stored operation. The record is found with
 * binary search, because every table is sorted by its key.
 * Time O(log n) for updates, O(n) for removing an inserted record
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
 * undoBlockedReason — why an entry can't be reversed safely, or ''. Customers'
 * own actions (payment reports, access requests) are not on the Undo stack, so
 * undoing an older staff action must not leave them without their bill, or
 * create a second waiting report / request for the same bill or e-mail.
 * Time O(k · n) for k operations · Space O(1)
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
 * undoTouchesAccounts — would reversing this entry add, remove or change a
 * staff or subscriber account? Those need a Google Authenticator code, like
 * the change itself. Time O(k) for k operations
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
 * undoLastAction — pop the newest entry and reverse its operations, last one
 * first (an action that changed two tables is unwound in reverse order).
 * Returns the entry, null when there is nothing to undo, a step-up error when
 * it changes an account and no code was verified, or
 * { blocked: true, label, error } when it can't be undone (it stays on the stack).
 * Time O(k · n) for k operations · Space O(1)
 */
function undoLastAction(actorName) {
  const top = stackPeek(undoStack);                   // 1. look at the newest entry first
  if (!top) {
    return null;
  }
  const blocked = undoBlockedReason(top);             // 2. would reversing it break a customer's report or request?
  if (blocked !== '') {
    return { blocked: true, label: top.label, error: 'Can’t undo “' + top.label + '”: ' + blocked };
  }
  if (undoTouchesAccounts(top)) {                     // 3. account changes need a code, also when undone
    const stepUp = stepUpRequired();
    if (stepUp) {
      return stepUp;
    }
  }
  const entry = stackPop(undoStack);                  // 4. pop it and reverse its operations, newest first
  for (let i = entry.operations.length - 1; i >= 0; i--) {
    revertOperation(entry.operations[i]);
  }
  logActivity('undo', 'Undid: ' + entry.label, actorName);
  markDataChanged();
  return entry;
}
