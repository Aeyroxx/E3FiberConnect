# E3 Fiber Connect — Data Structures & Algorithms Guide

This guide explains where every data structure and algorithm lives in the website, how it works, what it
costs (time and space complexity), and how to show it live during a presentation.

> **n** = number of records in a table · **m** = length of the text being searched for ·
> **k** = number of results · **b** = number of hash-table buckets

---

## 1. The rules the code follows

| Rule | How it is met |
|---|---|
| Data lives in **arrays** | `applications`, `subscribers`, `bills`, `payments`, `tickets`, `staffMembers`, `registrations`, `activityLog` in `assets/js/backend/database.js` |
| **Data cannot transfer** between pages (arrays live in memory) | The site is **one page** (`index.html`); screens are shown and hidden, so the arrays survive every screen change. A reload restarts from the sample data. No `localStorage`, no server. |
| **Procedural, not OOP** | Only `function` declarations and plain records. No `class`, `this`, prototypes or methods on data. A stack is the record `{ items, top }` plus functions such as `stackPush(stack, item)`. |
| **No built-in search / sort / stack / queue helpers** | Never used: `push pop shift unshift splice slice concat sort reverse indexOf lastIndexOf includes find findIndex filter map forEach reduce some every join` and the string versions `search indexOf includes startsWith split replace trim toLowerCase toUpperCase padStart substring`, nor regular expressions. |
| **Time and space complexity** | Written above every function in `assets/js/dsa/` and `assets/js/backend/`, summarised in §6, and measured live on the admin **Algorithms** page. |

Built-ins that *are* used are only for input/output: the browser's DOM (showing and reading the page), `Date`
(once, to read the clock — all date maths is hand-written), `Math`, `Number`, `String`, `charCodeAt`,
`String.fromCharCode`, the `length` of an array or string, timers, `performance.now()` for timing and
`crypto.getRandomValues()` for temporary passwords.

---

## 2. Arrays — the database

Each table is an array of plain records. Every table is **kept sorted by its key**, which is what makes binary
search possible:

| Table | Key | How the order is kept |
|---|---|---|
| `applications` | `referenceNo` (`E3-2026-004887`) | New numbers are always larger → **append** at the end, O(1) |
| `subscribers` | `accountNo` | Installations finish in any order → **sorted insert** ("put"), O(n) |
| `bills` | `billId` (`BILL-202609-004872`) | **Sorted insert**, O(n) |
| `payments`, `tickets`, `staffMembers`, `registrations` | `paymentId`, `ticketNo`, `id`, `registrationId` | New ids are always larger → append, O(1) |
| `activityLog` | time | Append only; read from the end for "newest first" |

### Hand-written array operations — `assets/js/dsa/arrays.js`

| Function | Replaces | Time | Space | How |
|---|---|---|---|---|
| `arrayAppend(a, x)` | `push` | O(1) | O(1) | writes `a[a.length]` |
| `arrayRemoveLast(a)` | `pop` | O(1) | O(1) | reads the last slot, shortens `length` by 1 |
| `arrayPrepend(a, x)` | `unshift` | O(n) | O(1) | moves every item one slot right |
| `arrayRemoveFirst(a)` | `shift` | O(n) | O(1) | moves every item one slot left |
| `arrayInsertAt(a, i, x)` | `splice(i, 0, x)` | O(n) | O(1) | shifts the tail right, then writes |
| `arrayRemoveAt(a, i)` | `splice(i, 1)` | O(n) | O(1) | shifts the tail left |
| `arrayCopy(a)` | `slice()` | O(n) | O(n) | loop copy (sorts work on copies) |
| `arrayRange(a, s, c)` | `slice(s, s + c)` | O(c) | O(c) | used for "show more" lists |
| `arrayReverseCopy(a)` | `reverse()` | O(n) | O(n) | |
| `arraySwap(a, i, j)` | — | O(1) | O(1) | used by bubble and selection sort |

---

## 3. Searching — `assets/js/dsa/search.js`

### Linear search — O(n) time, O(1) space
Checks records one by one until one matches. Works on any array, sorted or not.

```
for i from 0 to n − 1:
    if records[i][field] == value: return i
return −1
```

**Used for:** plan look-ups (`findPlan`), the plan recommender (first plan fast enough), duplicate-application
checks, filters by status (`linearSearchAll`), and every search box (combined with string matching below).

### Binary search — O(log n) time, O(1) space
Needs an array **sorted by the key**. Looks at the middle record and throws away the half that cannot hold the
value — about 17 steps for 100,000 records.

```
low = 0, high = n − 1
while low ≤ high:
    middle = ⌊(low + high) / 2⌋
    if records[middle].key == value: return middle
    if records[middle].key < value: low = middle + 1
    else: high = middle − 1
return −1
```

**Used for:** finding an application by reference number (tracker, detail pages), a subscriber by account
number, a bill by id, a ticket, a staff member by id, a barangay by name (coverage), and by Undo to find the
record to restore.

### Lower bound, sorted insert ("put") and prefix range
- `lowerBound` — binary search for the **first position ≥ value** (where a new key belongs). O(log n).
- `sortedInsert` — "put" a record in key order: lower bound + shift the tail. O(log n) + O(n) = **O(n)**.
- `rangeWithPrefix` — all bills of one month: bill ids start with `BILL-YYYYMM-`, so a binary search jumps to
  the first one and a short scan collects the rest. **O(log n + k)** instead of O(n).

### Text search — naive string matching, O(n · m)
`textFind` (in `strings.js`) tries every starting position and compares character by character.
`textSearchRecords` runs it over several fields of every record (case-insensitive via `toLowerText`):
**O(n · f · L · m)** for n records, f fields of length L. Used by every search box and the barangay suggestions.

---

## 4. Sorting — `assets/js/dsa/sort.js`

Every admin list lets you **pick the algorithm** (Applications, Subscribers, Payments, Staff), and the line under the list
shows the real number of comparisons and moves. Sorting always works on a **copy** (`arrayCopy`, O(n) space), so
the tables keep the key order that binary search needs; the algorithms themselves use O(1) extra space.

| Algorithm | Idea | Best | Average | Worst | Extra space | Stable |
|---|---|---|---|---|---|---|
| **Bubble sort** | swap neighbours that are out of order; stop early when a pass makes no swap | O(n) | O(n²) | O(n²) | O(1) | yes |
| **Selection sort** | find the smallest (or largest) remaining item and swap it into place | O(n²) | O(n²) | O(n²) | O(1) | no |
| **Insertion sort** | take the next item and slide larger ones right until its spot is found | O(n) | O(n²) | O(n²) | O(1) | yes |

- **Insertion sort** is the default — our tables are usually almost sorted already, which is its best case.
- The **Plans** page sorts the plan cards with **selection sort** (the note under the cards shows the count).
- Schedules, bill groups and "oldest bill first" use insertion sort by date.
- Try it: on *Applications*, sort "Newest first" with insertion sort → 16 records in reverse order is the worst
  case, n(n−1)/2 = **120** comparisons. Switch to "Oldest first" → only **15** (already sorted, best case).

---

## 5. Stacks, queues and the hash table

### Stack (LIFO) — `assets/js/dsa/stack.js`
Record `{ items: [], top: −1 }`; `stackPush`, `stackPop`, `stackPeek`, `stackIsEmpty`, `stackSize` — all **O(1)**.

| Where | What is pushed / popped |
|---|---|
| **Undo** (`backend/history.js`) | Every admin action pushes how to reverse it; Undo pops the newest (Undo button, toast, Ctrl/⌘ + Z). The button label uses **peek**. Capped at 25 — the oldest is dropped with `stackRemoveBottom` (O(n)). Cleared at sign-in and sign-out. Refused (`undoBlockedReason`) when a customer's own report or request depends on it, e.g. a bill that already has a payment report. |
| **Back button** (`ui/router.js`) | Every screen you leave is pushed with its scroll position; the in-app Back button pops it. Its label ("‹ Applications") comes from **peek**. |
| **Open dialogs** (`ui/sheets.js`) | Each open sheet is pushed; Esc closes the top one and focus returns to what opened it. |

### Queue (FIFO) — `assets/js/dsa/queue.js`
A **circular buffer**: record `{ items, front, count, capacity }`. The rear is `(front + count) % capacity`, so
`enqueue`, `dequeue` and `queuePeek` are **O(1)** — nothing is shifted (unlike `arrayRemoveFirst`, which is O(n)).
When full, the buffer doubles (`queueGrow`, O(n), amortised O(1)).

| Where | Front of the queue |
|---|---|
| **Review queue** (`buildReviewQueue`) | Oldest pending application — Dashboard "Next up" (peek) and "Review next" |
| **Support queue** (`buildSupportQueue`) | Oldest open ticket — "Serve next" **dequeues** it and assigns it to you |
| **Payment validation** (`paymentsQueue`) | First payment reported by a customer — the Payments page runs the five checks on it |
| **Staff requests** (`registrationQueue`) | Oldest staff registration — reviewed first on the Registrations page |
| **Oldest bill first** (`unpaidBillsQueue`) | "Mark oldest bill paid" settles the front bill |
| **Installation schedule** (`buildInstallQueue`) | Earliest visit (insertion-sorted by date, then enqueued) |
| **Notifications** (`ui/toasts.js`) | Toasts appear one at a time in arrival order |
| **Operation log** (`dsa/stats.js`) | A fixed-size **ring buffer** (`enqueueBounded`) of the last 40 searches and sorts |

### Hash table — `assets/js/dsa/hashtable.js`
Separate chaining: an array of buckets, each a small array of `{ key, value }`.
- `hashText` — the **djb2** hash (`hash × 33 + character`), O(key length).
- `hashPut` / `hashGet` / `hashRemove` — **O(1) average**, O(n) worst case (everything in one bucket).
- Grows (rehashes into about twice as many buckets) when the load factor passes 0.75.
- **Used for:**
  - staff e-mail → staff id (`staffEmailIndex`). Signing in, the "e-mail already has an account" check and the
    registration review are O(1) instead of a linear search.
  - payment reference → payment ids (`paymentReferenceIndex`, key `"GCASH:5012873246119"`). Payment validation
    finds a re-used reference number with one look-up.
  - e-mail → wrong sign-in tries in a row (`authState.failedByEmail`); the 5th pauses sign-in for 30 seconds.
- The Algorithms page shows buckets, load factor, longest chain and collisions for both tables.

### Payment validation — `assets/js/backend/payments.js`
`validatePayment` runs five checks on a reported payment; **Confirm** is allowed only when all of them pass.

| # | Check | How | Time |
|---|---|---|---|
| 1 | The bill belongs to the account | binary search on `bills` by `billId`, then compare `accountNo` | O(log n) |
| 2 | The bill is still unpaid (or was settled by this same payment) | read `status` / `paymentRef` | O(1) |
| 3 | Amount paid = amount billed | one comparison | O(1) |
| 4 | Reference fits the method (GCash 13 digits, Maya 12 characters, bank / counter 8–20) | scan the characters | O(k) |
| 5 | Reference not used before — no confirmed payment and no earlier waiting report has it (the later report is the duplicate) | hash-table look-up | O(1) average |

### Two-step verification — `assets/js/backend/twofactor.js`, `assets/js/backend/qrcode.js`
Google Authenticator codes are **TOTP** (RFC 6238): `code = HMAC-SHA1(secret, ⌊time / 30 s⌋)`, cut to 6 digits.
All of it is hand-written on arrays of bytes:

| Piece | What it does | Time |
|---|---|---|
| `sha1Bytes` | SHA-1: pad the message, then 80 rounds of 32-bit rotations and additions per 64-byte block | O(n) |
| `hmacSha1` | HMAC: SHA1((key ⊕ opad) + SHA1((key ⊕ ipad) + message)) | O(n) |
| `base32Encode` / `base32Decode` | the setup key: 5 bits per letter (A–Z, 2–7) | O(n) |
| `hotpCode` / `matchTotp` | 8-byte counter → HMAC → dynamic truncation → 6 digits; accepts ±1 step (clock drift), refuses a step already used | O(1) |
| `makeQrMatrix` | QR code: bytes → codewords → Reed–Solomon error correction in GF(256) → zig-zag placement → the best of 8 masks | O(s²) |

Checked against the RFC 3174 / RFC 6238 test vectors, and every QR code is decoded by an independent reader in the tests.

Every account-changing backend function (`addStaff`, `approveRegistration`, `setStaffStatus`, `resetStaffPassword`,
`resetStaffTwoFactor`, `changeOwnPassword`, `setSubscriberStatus`, `changeSubscriberPlan`) starts with
`stepUpRequired()`, and `undoLastAction` does too when `undoTouchesAccounts(entry)` finds a `staffMembers` or
`subscribers` operation in the entry (O(k)). First setup needs the password (`startTotpSetup`); five wrong
tries pause entry for 30 s, doubling each time up to 15 minutes.

### Staff registration and approval — `assets/js/backend/registrations.js`
A request is validated field by field (work e-mail, mobile, strong password) and **appended** (ids only grow).
Pending requests form a **FIFO queue**. Approving checks the e-mail in the staff **hash table**, appends the staff
record and puts the e-mail in the hash table (O(1) average); one Undo removes the account again.

### Hand-written text and date helpers
- `strings.js`: `toLowerText`, `trimText`, `textFind`, `splitText`, `joinText`, `padLeft`, `digitsOnly`, `parseDigits` — each O(n).
- `backend/utils.js`: dates become day numbers with the **days-from-civil** algorithm, so adding days or
  counting days between dates is O(1) integer maths. Validators (e-mail, mobile, reference) are written without
  regular expressions.

---

## 6. Complexity summary

| Operation | Time | Space |
|---|---|---|
| Linear search | O(n) (best O(1)) | O(1) |
| Binary search | O(log n) | O(1) |
| Naive string search over a table | O(n · m) | O(1) |
| Bubble / insertion sort | O(n²) (best O(n)) | O(1) + O(n) copy |
| Selection sort | O(n²) always | O(1) + O(n) copy |
| Append new application / payment / ticket | O(1) | O(1) |
| Sorted insert of a subscriber / bill ("put") | O(n) | O(1) |
| One month's bills (`rangeWithPrefix`) | O(log n + k) | O(k) |
| Stack push / pop / peek | O(1) | O(n) total |
| Queue enqueue / dequeue / peek | O(1) amortised | O(n) total |
| Hash table put / get | O(1) average | O(n + b) |
| Validate one payment (5 checks) | O(log n + k) | O(1) |
| Approve a staff registration | O(log n) + O(1) average | O(1) |
| Create a subscriber account (sorted insert) | O(n) | O(1) |
| Undo an action | O(log n), or O(n) if it removes a record | O(1) |

---

## 7. Presentation walkthrough (about 10 minutes)

1. **Apply** (`#/apply`) — fill the five steps; show the inline validation (under-18, bad e-mail). Submit and
   copy the reference number. *Append to a sorted array = O(1).*
2. **Track** — paste the reference. The note under the result says how many comparisons **binary search**
   needed — never more than ⌈log₂(n + 1)⌉, i.e. at most 5 for 17 applications (a linear search could need 17).
3. **Coverage** — type `san`: suggestions come from **linear search + naive string matching**. Press Enter on
   a barangay: the answer comes from **binary search** on the 24 barangays.
4. **Plans** — change the recommender answers (**linear search** for the first plan that is fast enough), then
   sort the cards (**selection sort** with its comparison count).
5. **Sign in** as Admin — the e-mail is found in the **hash table**. Try a wrong password five times to see
   the pause.
6. **Dashboard** — the review **queue** drawn front to rear; "Next up" is a **peek**.
7. **Applications** — switch the algorithm between insertion, selection and bubble and compare the numbers
   in the caption. Approve your application, then press **Undo** (**stack pop**). Open **Activity** to see the
   undo stack.
8. **Application → Schedule → Installed — create account** — the sheet shows where **binary search** will put
   the new account; "Create account" does the **sorted insert**.
9. **Billing** — "Generate bills" (one undo step for all of them) and "Mark oldest bill paid" on a subscriber
   (**queue**).
10. **Payments** — the validation **queue**: confirm the front payment (all five checks pass), then see the next
    ones fail one check each (bill already paid, amount short, re-used reference found by the **hash table**).
11. **Request staff access** (sign-in page) → **Registrations** — a new request joins the approval **queue**;
    approve it and sign in with the password chosen at registration.
12. **Support** — "Serve next" **dequeues** the oldest ticket.
13. **Algorithms** — the live structures, the log of every operation you just did, and the **benchmark**:
    run 1,000 records and compare linear vs binary search and the three sorts.

For the full defense reviewer (one section per module with input → process → output, complexity and a
demonstration), see **`docs/E3-Fiber-Connect-Defense-Reviewer.pdf`**.

---

## 8. Where to find things

| Topic | File |
|---|---|
| Array, string, search, sort, stack, queue, hash table | `assets/js/dsa/*.js` |
| Tables + sample data | `assets/js/backend/database.js` |
| Business rules (one file per topic) | `assets/js/backend/*.js` |
| Undo stack + activity log | `assets/js/backend/history.js` |
| Payment validation | `assets/js/backend/payments.js`, `assets/js/views/admin/payments.js` |
| Staff registration + approval | `assets/js/backend/registrations.js`, `assets/js/views/admin/register.js`, `assets/js/views/admin/registrations.js` |
| Router + back stack | `assets/js/ui/router.js` |
| Sheets (dialog stack) + spring animation | `assets/js/ui/sheets.js`, `assets/js/ui/spring.js` |
| Toast queue | `assets/js/ui/toasts.js` |
| Screens | `assets/js/views/public/*.js`, `assets/js/views/admin/*.js` |
