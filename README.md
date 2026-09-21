# E3 Fiber Connect — Backend Guide (JavaScript + Arrays)

This guide shows your team how to turn the finished front-end (HTML + CSS + Bootstrap) into a
**working website whose "backend" is JavaScript arrays**. Everything runs in the browser — no server,
no database software. The arrays are saved in the browser's `localStorage` so data survives page changes.

> **What is already done:** every screen from the Figma file, as static pages with sample data,
> plus stable ids, `name` attributes and `data-*` hooks for your code.
> **What you build:** the JavaScript files described below (data, helper functions, "services",
> and one small script per page).

---

## Contents

1. [How the pieces fit together](#1-how-the-pieces-fit-together)
2. [Run the site locally](#2-run-the-site-locally)
3. [Files you will add](#3-files-you-will-add)
4. [Step 1 — The database: arrays + localStorage](#4-step-1--the-database-arrays--localstorage)
5. [Step 2 — Helper functions](#5-step-2--helper-functions)
6. [Step 3 — Six patterns every page uses](#6-step-3--six-patterns-every-page-uses)
7. [Step 4 — Build each feature](#7-step-4--build-each-feature)
8. [Where the Data Structures & Algorithms are](#8-where-the-data-structures--algorithms-are)
9. [Validation rules](#9-validation-rules)
10. [Security and data notes](#10-security-and-data-notes)
11. [Testing checklist](#11-testing-checklist)
12. [Suggested team split and order](#12-suggested-team-split-and-order)
13. [Appendix A — Element hooks for every page](#appendix-a--element-hooks-for-every-page)
14. [Appendix B — Status flows](#appendix-b--status-flows)
15. [Appendix C — Troubleshooting](#appendix-c--troubleshooting)

---

## 1. How the pieces fit together

| Page | What it does | Figma frame |
|---|---|---|
| `index.html` | Landing page with the 5 internet plans | Landing page |
| `apply.html` | Public application form | Application Form |
| `application-submitted.html` | Confirmation + reference number | Application Submitted |
| `track.html` | Look up an application by reference number | *(new — the nav link needed a page)* |
| `admin/login.html` | Staff sign-in | Admin Login |
| `admin/applications.html` | All applications, filters, search, approve/reject | Admin — Applications |
| `admin/application-review.html` | One application in detail | Admin — Application Review |
| `admin/new-application.html` | Walk-in application typed by staff | Admin — New Application |
| `admin/subscribers.html` | All subscribers | Admin — Subscribers |
| `admin/subscriber-detail.html` | One subscriber, balance, billing history, change plan | Admin — Subscriber Detail |
| `admin/billing.html` | Monthly bills grouped by due date + "New bill" modal | Admin — Billing, Admin — New Bill |
| `admin/staff.html` | Staff accounts + "Add Staff" + "Temporary Credential" modals | Admin — Staff, Add Staff, Staff Detail |

Your code sits in three layers. Each layer only talks to the one next to it:

```
 HTML page  ──(clicks, submits)──▶  page script           e.g. assets/js/pages/applications.js
 (view)     ◀──(renders rows)────   (reads the DOM, shows results)
                                         │ calls
                                         ▼
                                    service functions      e.g. assets/js/backend/applications.js
                                    (the "backend": search, sort, filter, validate, change status)
                                         │ reads / changes
                                         ▼
                                    arrays in `db`         assets/js/backend/db.js
                                    db.applications, db.subscribers, db.bills, db.staff
                                         │ saveDatabase() / loadDatabase()
                                         ▼
                                    localStorage (the browser keeps it between pages)
```

**Four rules that keep the project clean**

1. Page scripts never loop over `db.applications` themselves — they call a service function.
2. Every function that changes an array calls `saveDatabase()` before it returns.
3. Put user-typed text on the page with `textContent`, or run it through `escapeHTML()` before using `innerHTML` (see §10).
4. Keep the ids, classes and `name` attributes that are already in the HTML — the CSS and this guide depend on them.

---

## 2. Run the site locally

Use a small local web server (recommended) instead of double-clicking the HTML files:

- **VS Code:** install the *Live Server* extension → right-click `index.html` → **Open with Live Server**.
- **Node.js:** `npx http-server -c-1` in the project folder, then open <http://127.0.0.1:8080>.
- **Python:** `python -m http.server 8080` in the project folder.

Why? Some browsers give every `file://` page its own storage, so data saved on `apply.html` would be
missing on `admin/applications.html`. A local server makes all pages share one `localStorage`.

Handy commands for the browser console (F12 → Console):

```js
resetDatabase();                                   // put the sample data back
localStorage.setItem('e3fiber-today', '2026-09-18'); // pretend "today" is Sep 18, 2026 (matches the sample bills)
localStorage.removeItem('e3fiber-today');          // go back to the real date
```

Demo staff login (from the sample data in §4): **juan.delacruz@e3fiberconnect.ph** / **e3admin**.

---

## 3. Files you will add

```
assets/js/
├── ui.js                      ← already there: visuals only (upload file name, filter pills, copy button)
├── backend/                   ← the "backend" (no DOM code in here)
│   ├── db.js                  arrays + sample data + load/save          (§4, complete code)
│   ├── utils.js               formatting, dates, ids, escaping          (§5, complete code)
│   ├── plans.js               plan lookups and labels                   (§7.1, complete code)
│   ├── applications.js        submit, search, sort, approve/reject      (§7.2 + §7.5, complete code)
│   ├── subscribers.js         create/list/suspend/change plan           (§7.8, you write it)
│   ├── bills.js               periods, grouping, totals, settle         (§7.9, key parts given)
│   ├── staff.js               add staff, temp passwords, list           (§7.10, you write it)
│   └── auth.js                login, session, page guard                (§7.4, complete code)
└── pages/                     ← one small script per HTML page
    ├── landing.js  apply.js  submitted.js  track.js
    └── login.js  applications.js  application-review.js  new-application.js
        subscribers.js  subscriber-detail.js  billing.js  staff.js
```

Add the scripts at the end of each page's `<body>`, **after** the two scripts that are already there,
and in this order: `db.js` → `utils.js` → other backend files → the page script. Example for `apply.html`:

```html
  <script src="assets/vendor/bootstrap/bootstrap.bundle.min.js"></script>
  <script src="assets/js/ui.js"></script>
  <!-- backend -->
  <script src="assets/js/backend/db.js"></script>
  <script src="assets/js/backend/utils.js"></script>
  <script src="assets/js/backend/plans.js"></script>
  <script src="assets/js/backend/applications.js"></script>
  <!-- page -->
  <script src="assets/js/pages/apply.js"></script>
</body>
```

Admin pages live in `admin/`, so their paths start with `../` (e.g. `../assets/js/backend/db.js`).

| Page | Backend files it needs (after `db.js` + `utils.js`) | Page script |
|---|---|---|
| `index.html` | `plans.js` | `pages/landing.js` |
| `apply.html`, `application-submitted.html`, `track.html` | `plans.js`, `applications.js` | `apply.js` / `submitted.js` / `track.js` |
| `admin/login.html` | `auth.js` | `login.js` |
| `admin/applications.html`, `application-review.html`, `new-application.html` | `plans.js`, `subscribers.js`, `bills.js`, `applications.js`, `auth.js` | matching name |
| `admin/subscribers.html`, `subscriber-detail.html`, `billing.html` | `plans.js`, `subscribers.js`, `bills.js`, `auth.js` | matching name |
| `admin/staff.html` | `staff.js`, `auth.js` | `staff.js` |

We use plain `<script>` files (not ES modules) so the project works with any simple server. Every
top-level function becomes global, so give functions clear, unique names (`findApplicationByRef`, not `find`).
This matters because an admin page loads several backend files at once: if two files both define
`matchesSearch`, the one loaded last **silently replaces** the other. Put the topic in the name
(`matchesApplicationSearch`, `matchesSubscriberSearch`), and keep page code inside `initPage()` (§7.4).

---

## 4. Step 1 — The database: arrays + localStorage

### 4.1 Why localStorage?

Each HTML page is a fresh start for JavaScript: when you leave `apply.html`, its arrays are gone.
So after every change we **save** the arrays as JSON text in `localStorage`, and every page **loads**
them again when it opens. The arrays are still your data structure — `localStorage` is just the shelf
where they wait between pages.

### 4.2 The data model

Field names match the `name` attributes of the form inputs, so `new FormData(form)` gives you objects
that are almost ready to store.

**Plan** (fixed list — never changes while the site runs)

| Field | Type | Example |
|---|---|---|
| `id` | string | `"power"` (also used in `apply.html?plan=power`) |
| `name` / `shortName` | string | `"Power Plan"` / `"Power"` |
| `speedMbps` | number | `100` |
| `price` | number (pesos per month) | `1200` |

**Application** — `db.applications`

| Field | Type | Example | Comes from |
|---|---|---|---|
| `referenceNo` | string, unique | `"E3-2026-004879"` | `nextReferenceNo()` |
| `fullName`, `email`, `contactNumber` | string | `"Juan Dela Cruz"`, `"juandelacruz@gmail.com"`, `"0921 821 5399"` | form |
| `birthDate` | `"YYYY-MM-DD"` | `"1998-05-14"` | `<input type="date">` |
| `city` | string | `"Santa Maria"` (always) | form (read-only) |
| `barangay` | one of `BARANGAYS` | `"Poblacion"` | form |
| `completeAddress`, `landmark` | string | `"123 Mabini St., Brgy. Poblacion"` | form |
| `planId` | plan id or `"custom"` | `"power"` | hidden input / radio |
| `customPrice` | number or `null` | `null` | admin form only |
| `idType`, `idNumber` | string | `"Driver's License"`, `"N01-23-456780"` | form |
| `idPhotoName` | string | `"juan-license.jpg"` | file input (name only, see §10) |
| `status` | see Appendix B | `"Pending"` | set by code |
| `submittedAt` | `"YYYY-MM-DDTHH:MM:SS"` | `"2026-09-18T08:42:00"` | set by code |
| `source` | `"online"` or `"walk-in"` | `"online"` | set by code |
| `notes`, `coverage` | string | `""`, `"Serviceable — nearest NAP box is 120 m away"` | review page |

**Subscriber** — `db.subscribers` (created when an application becomes *Completed*)

| Field | Type | Example |
|---|---|---|
| `accountNo` | string, unique — **same as the application's `referenceNo`** | `"E3-2026-004872"` |
| `fullName`, `email`, `contactNumber`, `barangay`, `completeAddress`, `landmark` | string | copied from the application |
| `planId`, `customPrice` | as above | `"power"`, `null` |
| `status` | `"Active"`, `"Suspended"`, `"Terminated"` | `"Active"` |
| `since` | date-time string | `"2026-08-15T16:08:00"` |
| `applicationRef` | string or `null` | `null` for the sample subscribers |

**Bill** — `db.bills`

| Field | Type | Example |
|---|---|---|
| `billId` | string, unique | `"BILL-202609-004872"` (`BILL-` + year + month + last 6 digits of the account) |
| `accountNo` | string | `"E3-2026-004872"` |
| `billingYear`, `billingMonth` | numbers | `2026`, `9` |
| `periodStart`, `periodEnd`, `dueDate` | `"YYYY-MM-DD"` | `"2026-09-15"`, `"2026-10-14"`, `"2026-09-30"` |
| `amount` | number | `1200` |
| `status` | `"Unpaid"` or `"Paid"` | `"Unpaid"` |
| `paidOn` | `"YYYY-MM-DD"` or `null` | `null` |

Billing rule used by the sample data: a subscriber's period starts on the same day of the month they
joined (their `since` day), ends the day before that date next month, and is **due 15 days after it starts**.

**Staff** — `db.staff`

| Field | Type | Example |
|---|---|---|
| `id` | string, unique | `"STF-0001"` |
| `fullName`, `email` | string | `"Juan Dela Cruz"`, `"juan.delacruz@e3fiberconnect.ph"` |
| `role` | `"Owner"`, `"Admin"`, `"Support"` | `"Admin"` |
| `status` | `"Active"`, `"Suspended"`, `"Deleted"` | `"Active"` |
| `startDate` | `"YYYY-MM-DD"` | `"2026-01-05"` |
| `lastSignIn` | date-time string or `null` | `"2026-09-18T07:55:00"` |
| `password` | string — **demo only**, see §10 | `"e3admin"` |

**Counters** — `db.counters = { reference: 4883, staff: 4 }` (the last number used; the next reference is `E3-2026-004884`).

### 4.3 `db.js` (complete)

```js
// File: assets/js/backend/db.js
// The "database": plain JavaScript arrays, saved in localStorage between pages.

const DB_KEY = 'e3fiber-db-v1';

// ---- Fixed lists -----------------------------------------------------------------
const PLANS = [
  { id: 'starter', name: 'Starter Plan', shortName: 'Starter', speedMbps: 50, price: 800 },
  { id: 'stream', name: 'Stream Plan', shortName: 'Stream', speedMbps: 70, price: 1000 },
  { id: 'power', name: 'Power Plan', shortName: 'Power', speedMbps: 100, price: 1200 },
  { id: 'pro', name: 'Pro Plan', shortName: 'Pro', speedMbps: 200, price: 1500 },
  { id: 'ultimate', name: 'Ultimate Plan', shortName: 'Ultimate', speedMbps: 300, price: 2000 },
];
const PLAN_FEATURES = ['No Data capping', 'Free or low cost installation', 'No lock in period'];

const BARANGAYS = [
  'Bagbaguin', 'Balasing', 'Buenavista', 'Bulac', 'Camangyanan', 'Catmon', 'Caypombo', 'Caysio',
  'Guyong', 'Lalakhan', 'Mag-asawang Sapa', 'Mahabang Parang', 'Manggahan', 'Parada', 'Poblacion',
  'Pulong Buhangin', 'San Gabriel', 'San Jose Patag', 'San Vicente', 'Santa Clara', 'Santa Cruz',
  'Silangan', 'Tabing Bakod', 'Tumana',
];
const ID_TYPES = [
  "Driver's License", 'Passport', 'PhilSys National ID', 'UMID', 'SSS ID', 'PRC ID', 'Postal ID',
  "Voter's ID", 'PhilHealth ID', 'TIN ID', 'Senior Citizen ID',
];
const STAFF_ROLES = ['Owner', 'Admin', 'Support'];

// ---- Sample data (used the very first time, and by resetDatabase) ----------------
function createSeedData() {
  return {
    // Kept in increasing referenceNo order (new ones are pushed at the end) — track.js relies on it.
    applications: [
      {
        referenceNo: 'E3-2026-004879', fullName: 'Juan Dela Cruz', email: 'juandelacruz@gmail.com',
        contactNumber: '0921 821 5399', birthDate: '1998-05-14', city: 'Santa Maria', barangay: 'Poblacion',
        completeAddress: '123 Mabini St., Brgy. Poblacion', landmark: 'Near Sta. Maria Public Market',
        planId: 'power', customPrice: null, idType: "Driver's License", idNumber: 'N01-23-456780',
        idPhotoName: 'juan-license.jpg', status: 'Pending', submittedAt: '2026-09-18T08:42:00',
        source: 'online', notes: '', coverage: 'Serviceable — nearest NAP box is 80 m away',
      },
      {
        referenceNo: 'E3-2026-004880', fullName: 'Sample Applicant', email: 'SampleEmail@gmail.com',
        contactNumber: '0921 555 0101', birthDate: '1995-02-10', city: 'Santa Maria', barangay: 'Bagbaguin',
        completeAddress: '12 Luna St., Brgy. Bagbaguin', landmark: 'Across Bagbaguin Chapel',
        planId: 'starter', customPrice: null, idType: 'PhilSys National ID', idNumber: '1234-5678-9012-3456',
        idPhotoName: 'sample-id.png', status: 'Approved', submittedAt: '2026-09-03T06:03:00',
        source: 'online', notes: '', coverage: 'Serviceable — nearest NAP box is 60 m away',
      },
      {
        referenceNo: 'E3-2026-004881', fullName: 'Sample Applicant 2', email: 'SampleEmail@gmail.com',
        contactNumber: '0921 555 0102', birthDate: '1990-11-23', city: 'Santa Maria', barangay: 'Tumana',
        completeAddress: '8 Del Pilar St., Brgy. Tumana', landmark: 'Near Tumana Elementary School',
        planId: 'stream', customPrice: null, idType: 'Passport', idNumber: 'P1234567A',
        idPhotoName: 'passport.jpg', status: 'Rejected', submittedAt: '2026-09-01T14:17:00',
        source: 'online', notes: 'No fiber line in the area yet.', coverage: 'Not serviceable — no NAP box within 500 m',
      },
      {
        referenceNo: 'E3-2026-004882', fullName: 'Sample Applicant 3', email: 'SampleEmail@gmail.com',
        contactNumber: '0921 555 0134', birthDate: '1998-05-14', city: 'Santa Maria', barangay: 'Guyong',
        completeAddress: '45 Rizal Ave., Brgy. Guyong', landmark: 'Beside Guyong Barangay Hall',
        planId: 'power', customPrice: null, idType: "Driver's License", idNumber: 'N01-23-456789',
        idPhotoName: 'license.jpg', status: 'Pending', submittedAt: '2026-08-13T15:08:00',
        source: 'online', notes: '', coverage: 'Serviceable — nearest NAP box is 120 m away',
      },
      {
        referenceNo: 'E3-2026-004883', fullName: 'Sample Applicant 4', email: 'SampleEmail@gmail.com',
        contactNumber: '0921 555 0104', birthDate: '1988-07-30', city: 'Santa Maria', barangay: 'Caysio',
        completeAddress: '27 Bonifacio St., Brgy. Caysio', landmark: 'Near Caysio Covered Court',
        planId: 'power', customPrice: null, idType: 'UMID', idNumber: '0111-2345678-9',
        idPhotoName: 'umid.png', status: 'For Installation', submittedAt: '2026-08-27T20:24:00',
        source: 'walk-in', notes: 'Install on a weekend.', coverage: 'Serviceable — nearest NAP box is 45 m away',
      },
    ],
    subscribers: [
      { accountNo: 'E3-2026-004871', fullName: 'Sample Subscriber', email: 'SampleEmail@gmail.com', contactNumber: '0921 555 0171', barangay: 'Santa Clara', completeAddress: '5 Mabini St., Brgy. Santa Clara', landmark: 'Near Santa Clara Church', planId: 'starter', customPrice: null, status: 'Active', since: '2026-09-03T06:03:00', applicationRef: null },
      { accountNo: 'E3-2026-004872', fullName: 'Sample Subscriber 3', email: 'SampleEmail@gmail.com', contactNumber: '0921 555 0172', barangay: 'Silangan', completeAddress: '45 Rizal Ave., Brgy. Silangan', landmark: 'Beside Silangan Barangay Hall', planId: 'power', customPrice: null, status: 'Active', since: '2026-08-15T16:08:00', applicationRef: null },
      { accountNo: 'E3-2026-004873', fullName: 'Sample Subscriber 4', email: 'SampleEmail@gmail.com', contactNumber: '0921 555 0173', barangay: 'Parada', completeAddress: '9 Aguinaldo St., Brgy. Parada', landmark: 'Near Parada Elementary School', planId: 'power', customPrice: null, status: 'Terminated', since: '2026-08-29T20:24:00', applicationRef: null },
      { accountNo: 'E3-2026-004874', fullName: 'Sample Unpaid Subscriber', email: 'unpaid1@gmail.com', contactNumber: '0921 555 0174', barangay: 'Poblacion', completeAddress: '14 Burgos St., Brgy. Poblacion', landmark: 'Near the municipal hall', planId: 'starter', customPrice: null, status: 'Active', since: '2026-07-01T09:00:00', applicationRef: null },
      { accountNo: 'E3-2026-004875', fullName: 'Sample Unpaid Subscriber 2', email: 'unpaid2@gmail.com', contactNumber: '0921 555 0175', barangay: 'Bulac', completeAddress: '3 Sampaguita St., Brgy. Bulac', landmark: 'Near Bulac Chapel', planId: 'stream', customPrice: null, status: 'Active', since: '2026-06-09T10:00:00', applicationRef: null },
      { accountNo: 'E3-2026-004876', fullName: 'Sample Unpaid Subscriber 3', email: 'unpaid3@gmail.com', contactNumber: '0921 555 0176', barangay: 'Catmon', completeAddress: '21 Rosal St., Brgy. Catmon', landmark: 'Near Catmon Health Center', planId: 'power', customPrice: null, status: 'Active', since: '2026-06-30T11:00:00', applicationRef: null },
      { accountNo: 'E3-2026-004877', fullName: 'Sample Paid Subscriber', email: 'paid1@gmail.com', contactNumber: '0921 555 0177', barangay: 'Manggahan', completeAddress: '7 Ilang-Ilang St., Brgy. Manggahan', landmark: 'Near Manggahan Bridge', planId: 'power', customPrice: null, status: 'Active', since: '2026-06-01T08:00:00', applicationRef: null },
      { accountNo: 'E3-2026-004878', fullName: 'Sample Paid Subscriber 2', email: 'paid2@gmail.com', contactNumber: '0921 555 0178', barangay: 'San Vicente', completeAddress: '16 Jasmin St., Brgy. San Vicente', landmark: 'Near San Vicente Plaza', planId: 'stream', customPrice: null, status: 'Active', since: '2026-06-01T13:00:00', applicationRef: null },
    ],
    bills: [
      { billId: 'BILL-202608-004872', accountNo: 'E3-2026-004872', billingYear: 2026, billingMonth: 8, periodStart: '2026-08-15', periodEnd: '2026-09-14', dueDate: '2026-08-30', amount: 1200, status: 'Paid', paidOn: '2026-08-20' },
      { billId: 'BILL-202609-004872', accountNo: 'E3-2026-004872', billingYear: 2026, billingMonth: 9, periodStart: '2026-09-15', periodEnd: '2026-10-14', dueDate: '2026-09-30', amount: 1200, status: 'Unpaid', paidOn: null },
      { billId: 'BILL-202609-004874', accountNo: 'E3-2026-004874', billingYear: 2026, billingMonth: 9, periodStart: '2026-09-01', periodEnd: '2026-09-30', dueDate: '2026-09-16', amount: 800, status: 'Unpaid', paidOn: null },
      { billId: 'BILL-202609-004875', accountNo: 'E3-2026-004875', billingYear: 2026, billingMonth: 9, periodStart: '2026-09-09', periodEnd: '2026-10-08', dueDate: '2026-09-24', amount: 1000, status: 'Unpaid', paidOn: null },
      { billId: 'BILL-202609-004876', accountNo: 'E3-2026-004876', billingYear: 2026, billingMonth: 9, periodStart: '2026-09-30', periodEnd: '2026-10-29', dueDate: '2026-10-15', amount: 1200, status: 'Unpaid', paidOn: null },
      { billId: 'BILL-202609-004877', accountNo: 'E3-2026-004877', billingYear: 2026, billingMonth: 9, periodStart: '2026-09-01', periodEnd: '2026-09-30', dueDate: '2026-09-16', amount: 1200, status: 'Paid', paidOn: '2026-09-08' },
      { billId: 'BILL-202609-004878', accountNo: 'E3-2026-004878', billingYear: 2026, billingMonth: 9, periodStart: '2026-09-01', periodEnd: '2026-09-30', dueDate: '2026-09-16', amount: 1000, status: 'Paid', paidOn: '2026-09-06' },
    ],
    staff: [
      { id: 'STF-0001', fullName: 'Juan Dela Cruz', email: 'juan.delacruz@e3fiberconnect.ph', role: 'Admin', status: 'Active', startDate: '2026-01-05', lastSignIn: '2026-09-18T07:55:00', password: 'e3admin' },
      { id: 'STF-0002', fullName: 'Sample Admin', email: 'SampleAdmin1@gmail.com', role: 'Owner', status: 'Active', startDate: '2025-11-03', lastSignIn: '2026-09-03T06:03:00', password: 'owner123' },
      { id: 'STF-0003', fullName: 'Sample Admin2', email: 'SampleAdmin2@gmail.com', role: 'Support', status: 'Suspended', startDate: '2026-02-16', lastSignIn: '2026-08-15T16:08:00', password: 'support123' },
      { id: 'STF-0004', fullName: 'Sample Admin3', email: 'SampleAdmin3@gmail.com', role: 'Admin', status: 'Deleted', startDate: '2026-03-02', lastSignIn: '2026-08-29T20:24:00', password: 'admin123' },
    ],
    counters: { reference: 4883, staff: 4 },
  };
}

// ---- Load / save ------------------------------------------------------------------
function loadDatabase() {
  const saved = localStorage.getItem(DB_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (error) {
      console.warn('Saved data could not be read, so the sample data was restored.', error);
    }
  }
  const fresh = createSeedData();
  localStorage.setItem(DB_KEY, JSON.stringify(fresh));
  return fresh;
}

function saveDatabase() {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function resetDatabase() {
  localStorage.removeItem(DB_KEY);
  db = loadDatabase();
}

let db = loadDatabase(); // every other file reads and changes this object
```

> The sample data uses real Santa Maria barangays. The static HTML still shows the placeholder names from
> Figma (e.g. "Brgy. Malanday") until your page scripts replace them.

---

## 5. Step 2 — Helper functions

```js
// File: assets/js/backend/utils.js
// Small helpers used by every page: money, dates, ids, safe HTML, the URL and [data-field] filling.

// ---- Money ----------------------------------------------------------------------
function formatNumber(amount) {           // 1200 → "1,200"
  return Number(amount).toLocaleString('en-PH');
}
function formatPeso(amount) {             // 1200 → "₱ 1,200"
  return `₱ ${formatNumber(amount)}`;
}

// ---- Dates ----------------------------------------------------------------------
// "2026-09-18" is read as local midnight (new Date('2026-09-18') would use UTC).
function parseDate(value) {
  if (value instanceof Date) return new Date(value.getTime());
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }
  return new Date(value);
}
const pad2 = (number) => String(number).padStart(2, '0');
function toISODate(date) {                // Date → "2026-09-18"
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}
function toISODateTime(date) {            // Date → "2026-09-18T08:42:05"
  return `${toISODate(date)}T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
}
const DATE_OPTIONS = { month: 'short', day: 'numeric', year: 'numeric' };
function formatDate(value) {              // → "Sep 18, 2026"
  return parseDate(value).toLocaleDateString('en-US', DATE_OPTIONS);
}
function formatDateTime(value) {          // → "Sep 18, 2026, 08:42 AM"
  return parseDate(value).toLocaleString('en-US', { ...DATE_OPTIONS, hour: '2-digit', minute: '2-digit' });
}
function formatShortDate(value) {         // → "Sep 1"
  return parseDate(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function formatPeriod(start, end) {       // → "Sep 1 – Sep 30"
  return `${formatShortDate(start)} – ${formatShortDate(end)}`;
}
function formatBirthDate(value) {         // "1998-05-14" → "05/14/1998"
  const [year, month, day] = value.split('-');
  return `${month}/${day}/${year}`;
}
function formatMonthYear(year, month) {   // (2026, 9) → "September 2026"
  return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
function addDays(value, days) {
  const date = parseDate(value);
  date.setDate(date.getDate() + days);
  return date;
}
function daysBetween(from, to) {          // whole days from → to (negative when "to" is earlier)
  const start = parseDate(from);
  const end = parseDate(to);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return Math.round((end - start) / 86400000);
}
function getToday() {                     // honours the 'e3fiber-today' override from §2
  const override = localStorage.getItem('e3fiber-today');
  const today = override ? parseDate(override) : new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

// ---- Text, ids, URL ---------------------------------------------------------------
function slugify(text) {                  // "For Installation" → "for-installation"
  return String(text).trim().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');          // letters, digits and dashes only — safe inside class="…"
}
function statusClass(status) {            // "For Installation" → "status-for-installation"
  return `status-${slugify(status)}`;
}
function escapeHTML(value) {              // makes user text safe inside innerHTML
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
function getQueryParam(name) {            // apply.html?plan=stream → getQueryParam('plan') === 'stream'
  return new URLSearchParams(window.location.search).get(name);
}
function nextReferenceNo() {              // "E3-2026-004884", "E3-2026-004885", …
  db.counters.reference += 1;
  saveDatabase();
  return `E3-${new Date().getFullYear()}-${String(db.counters.reference).padStart(6, '0')}`;
}

// ---- Page helpers -----------------------------------------------------------------
function fillFields(view, root = document) {   // puts view[fieldName] into every [data-field="fieldName"]
  root.querySelectorAll('[data-field]').forEach((element) => {
    const value = view[element.dataset.field];
    if (value !== undefined && value !== null) element.textContent = value;
  });
}
function setStatusBadge(element, status) {     // keeps size modifiers like status-badge--lg
  [...element.classList].filter((name) => /^status-(?!badge)/.test(name)).forEach((name) => element.classList.remove(name));
  element.classList.add(statusClass(status));
  element.textContent = status;
}
function showAlert(element, messages) {
  element.textContent = Array.isArray(messages) ? messages.join(' ') : messages;
  element.classList.remove('d-none');
}
function hideAlert(element) {
  element.textContent = '';
  element.classList.add('d-none');
}
```

---

## 6. Step 3 — Six patterns every page uses

Learn these once; every page is a combination of them.

**Pattern A — render a list.** Clear the container, build one row per item with the *same markup* as the
sample rows in the HTML, insert, and show the empty-state message when nothing matched.

```js
function renderRows(tbody, items, renderRow, emptyElement) {
  tbody.innerHTML = items.map(renderRow).join('');
  emptyElement.classList.toggle('d-none', items.length > 0);
}
```

**Pattern B — filter pills + search.** Keep the current choices in variables and re-render whenever one
changes. (`ui.js` already moves the white "active" pill — you only read `data-filter`.)

```js
let currentFilter = 'all';
filterGroup.addEventListener('click', (event) => {
  const pill = event.target.closest('.filter-pill');
  if (!pill) return;
  currentFilter = pill.dataset.filter;   // "all", "pending", "for-installation", …
  render();
});
searchInput.addEventListener('input', render);
```

**Pattern C — row buttons (event delegation).** One listener on the `<tbody>`/`<ul>` handles every
button, even rows rendered later. Buttons carry `data-action` and `data-id`.

```js
tbody.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  if (button.dataset.action === 'approve') advanceApplication(button.dataset.id);
  render();
});
```

**Pattern D — form submit.** Stop the browser's own submit, read the fields, let the service validate,
then show errors or move on.

```js
form.addEventListener('submit', (event) => {
  event.preventDefault();                          // we handle it in JavaScript
  const data = Object.fromEntries(new FormData(form));
  const result = someServiceFunction(data);        // returns { ok: true, … } or { ok: false, errors: [...] }
  if (!result.ok) return showAlert(alertBox, result.errors);
  // success: redirect, close the modal, or re-render
});
```

The HTML already has `required`, `type="email"`, `pattern` etc., so the browser blocks obviously wrong
input before your `submit` handler even runs. Your service validation is the second line of defence
(and handles rules HTML can't express, like "must be 18 or older").

**Pattern E — detail page.** Read the id from the URL, find the record, turn it into display strings
(a "view"), and fill every `[data-field]`.

```js
const application = findApplicationByRef(getQueryParam('ref'));
if (application) fillFields(applicationView(application));
```

**Pattern F — Bootstrap modals.** Open and close them from code with Bootstrap's API.

```js
const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('addStaffModal'));
modal.show();   // …later: modal.hide();
document.getElementById('addStaffModal').addEventListener('hidden.bs.modal', () => form.reset());
```

---

## 7. Step 4 — Build each feature

Each section lists: the backend functions, the page wiring, and a "done when" check.
Sections 7.1–7.5 include complete, tested code you can copy; later sections give you the plan and the
tricky parts, and leave the rest for your team.

### 7.1 Plans (landing page + the selected plan on the form)

```js
// File: assets/js/backend/plans.js
function findPlanById(planId) {                     // linear search — PLANS is tiny, so O(n) is fine
  for (let i = 0; i < PLANS.length; i++) {
    if (PLANS[i].id === planId) return PLANS[i];
  }
  return null;
}
function planPrice(planId, customPrice) {
  return planId === 'custom' ? Number(customPrice) : findPlanById(planId).price;
}
function planLabel(planId, customPrice) {          // "Power - 100 Mbps - 1,200 /mo"
  if (planId === 'custom') return `Custom - ${formatNumber(customPrice)} /mo`;
  const plan = findPlanById(planId);
  return `${plan.shortName} - ${plan.speedMbps} Mbps - ${formatNumber(plan.price)} /mo`;
}
function planTableName(planId) {                    // "Power Plan 100" (table cells)
  if (planId === 'custom') return 'Custom Offer';
  const plan = findPlanById(planId);
  return `${plan.name} ${plan.speedMbps}`;
}
function renderPlanCard(plan) {                     // same markup as index.html
  const features = PLAN_FEATURES.map((feature) => `<li>${escapeHTML(feature)}</li>`).join('');
  return `
    <article class="plan-card" data-plan-id="${plan.id}">
      <h3 class="plan-card__name">${escapeHTML(plan.name)}</h3>
      <p class="plan-card__price"><span class="plan-card__amount">${formatPeso(plan.price)}</span><span class="plan-card__per">/mo</span></p>
      <p class="plan-card__speed">Up to ${plan.speedMbps} Mbps</p>
      <hr class="plan-card__divider">
      <ul class="plan-card__features">${features}</ul>
      <a class="btn btn-e3-outline btn-e3-tall plan-card__select" href="apply.html?plan=${plan.id}" data-plan-id="${plan.id}" aria-label="Select ${escapeHTML(plan.name)}">SELECT</a>
    </article>`;
}
```

```js
// File: assets/js/pages/landing.js
document.getElementById('planCards').innerHTML = PLANS.map(renderPlanCard).join('');
```

**Done when:** changing a price in `PLANS` changes the landing page, and each SELECT opens `apply.html?plan=<id>`.

### 7.2 Apply → Application Submitted (complete example)

```js
// File: assets/js/backend/applications.js  (part 1 — submitting)
const ID_PHOTO_TYPES = ['image/jpeg', 'image/png', 'application/pdf']; // `accept` on the input is only a hint

function ageOn(birthDate, onDate) {
  const birth = parseDate(birthDate);
  let age = onDate.getFullYear() - birth.getFullYear();
  const hadBirthday = onDate.getMonth() > birth.getMonth()
    || (onDate.getMonth() === birth.getMonth() && onDate.getDate() >= birth.getDate());
  return hadBirthday ? age : age - 1;
}

function validateApplication(data) {
  const errors = [];
  if (String(data.fullName || '').trim().length < 2) errors.push('Enter the full name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(data.email || '').trim())) errors.push('Enter a valid email address.');
  if (!/^09\d{2}\s?\d{3}\s?\d{4}$/.test(String(data.contactNumber || '').trim())) errors.push('Enter an 11-digit mobile number like 0921 821 5399.');
  if (!data.birthDate || ageOn(data.birthDate, new Date()) < 18) errors.push('The applicant must be at least 18 years old.');
  if (!BARANGAYS.includes(data.barangay)) errors.push('Choose a barangay.');
  if (!String(data.completeAddress || '').trim()) errors.push('Enter the complete address.');
  if (!ID_TYPES.includes(data.idType)) errors.push('Choose an ID type.');
  if (!String(data.idNumber || '').trim()) errors.push('Enter the ID number.');
  if (!data.idPhotoName) errors.push('Upload a photo of the ID.');
  else if (!ID_PHOTO_TYPES.includes(data.idPhotoType)) errors.push('The ID photo must be a JPG, PNG or PDF file.');
  if (data.idPhotoSize > 10 * 1024 * 1024) errors.push('The ID photo must be 10 MB or smaller.');
  if (data.planId === 'custom') {
    if (!(Number(data.customPrice) > 0)) errors.push('Enter the custom monthly price.');
  } else if (!findPlanById(data.planId)) {
    errors.push('Choose a plan.');
  }
  return errors;
}

// source: 'online' (apply.html) or 'walk-in' (admin/new-application.html)
function submitApplication(data, source) {
  const errors = validateApplication(data);
  if (errors.length > 0) return { ok: false, errors };

  const application = {
    referenceNo: nextReferenceNo(),
    fullName: data.fullName.trim(),
    email: data.email.trim(),
    contactNumber: data.contactNumber.trim(),
    birthDate: data.birthDate,
    city: 'Santa Maria',
    barangay: data.barangay,
    completeAddress: data.completeAddress.trim(),
    landmark: String(data.landmark || '').trim(),
    planId: data.planId,
    customPrice: data.planId === 'custom' ? Number(data.customPrice) : null,
    idType: data.idType,
    idNumber: data.idNumber.trim(),
    idPhotoName: data.idPhotoName,
    status: 'Pending',
    submittedAt: toISODateTime(new Date()),
    source,
    notes: '',
    coverage: 'Not checked yet',
  };
  db.applications.push(application);                 // O(1) — and keeps the array sorted by referenceNo
  saveDatabase();
  return { ok: true, application };
}

function findApplicationByRef(referenceNo) {         // linear search — O(n)
  for (let i = 0; i < db.applications.length; i++) {
    if (db.applications[i].referenceNo === referenceNo) return db.applications[i];
  }
  return null;
}

function applicationView(app) {                      // display strings for [data-field] elements
  return {
    referenceNo: app.referenceNo,
    fullName: app.fullName,
    email: app.email,
    contactNumber: app.contactNumber,
    birthDate: formatBirthDate(app.birthDate),
    city: app.city,
    barangay: `Brgy. ${app.barangay}`,
    completeAddress: app.completeAddress,
    landmark: app.landmark || '—',
    planLabel: planLabel(app.planId, app.customPrice),
    submittedAt: formatDateTime(app.submittedAt),
    idType: app.idType,
    idNumber: app.idNumber,
  };
}
```

```js
// File: assets/js/pages/apply.js
const form = document.getElementById('applicationForm');
const alertBox = document.getElementById('applicationFormAlert');

// Show the plan picked on the landing page (apply.html?plan=stream). Default: Power.
const chosenPlan = findPlanById(getQueryParam('plan')) || findPlanById('power');
form.elements.planId.value = chosenPlan.id;
document.getElementById('selectedPlanLabel').textContent = planLabel(chosenPlan.id);

form.addEventListener('submit', (event) => {
  event.preventDefault();
  hideAlert(alertBox);
  const data = Object.fromEntries(new FormData(form));
  const photo = form.elements.idPhoto.files[0];
  data.idPhotoName = photo ? photo.name : '';          // we keep the file name only (see §10)
  data.idPhotoType = photo ? photo.type : '';
  data.idPhotoSize = photo ? photo.size : 0;

  const result = submitApplication(data, 'online');
  if (!result.ok) {
    showAlert(alertBox, result.errors);
    alertBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  window.location.href = `application-submitted.html?ref=${encodeURIComponent(result.application.referenceNo)}`;
});
```

```js
// File: assets/js/pages/submitted.js
const application = findApplicationByRef(getQueryParam('ref'));
if (application) {
  document.getElementById('referenceNo').textContent = application.referenceNo;
  setStatusBadge(document.getElementById('applicationStatus'), application.status);
  fillFields(applicationView(application));
} else {
  window.location.replace('track.html');              // unknown or missing ?ref=
}
```

**Done when:** submitting the form shows the new reference (e.g. `E3-2026-004884`) with your typed data,
and the same application appears in `admin/applications.html` after §7.5.

### 7.3 Track application (linear search → binary search)

Wire `#trackForm` like Pattern D: read `trackReference`, look the application up, then either fill
`#trackResult` (`#trackReferenceNo`, `#trackStatus`, `[data-field]`) and remove `d-none`, or show
`#trackNotFound`. Add `d-none` to `#trackResult` in the HTML first so it starts hidden.

Start with `findApplicationByRef` (linear search). Then — because references are issued in increasing
order and new applications are **pushed at the end** — `db.applications` is already sorted by
`referenceNo`, so you can use **binary search** (O(log n)):

```js
function binarySearchByRef(sortedApplications, referenceNo) {
  let low = 0;
  let high = sortedApplications.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const midRef = sortedApplications[mid].referenceNo;
    if (midRef === referenceNo) return sortedApplications[mid];
    if (midRef < referenceNo) low = mid + 1;     // same-length strings compare like numbers here
    else high = mid - 1;
  }
  return null;
}
```

Try both on a big array (e.g. 100,000 fake applications) and count the loop steps — a good
report item for your DSA class. Normalise input first: `value.trim().toUpperCase()`.

### 7.4 Admin login + protecting admin pages (complete code)

```js
// File: assets/js/backend/auth.js
const SESSION_KEY = 'e3fiber-session';            // sessionStorage: cleared when the browser closes

function findStaffByEmail(email) {                 // linear search, case-insensitive
  const wanted = String(email).trim().toLowerCase();
  for (const member of db.staff) {
    if (member.email.toLowerCase() === wanted) return member;
  }
  return null;
}

function login(email, password) {
  const member = findStaffByEmail(email);
  if (!member || member.password !== password) return { ok: false, error: 'Incorrect email or password.' };
  if (member.status !== 'Active') return { ok: false, error: `This account is ${member.status.toLowerCase()}.` };
  member.lastSignIn = toISODateTime(new Date());
  saveDatabase();
  sessionStorage.setItem(SESSION_KEY, member.id);
  return { ok: true, staff: member };
}

function getCurrentStaff() {                        // the signed-in staff member, or null
  const id = sessionStorage.getItem(SESSION_KEY);
  const member = id ? db.staff.find((m) => m.id === id) : null;
  if (member && member.status === 'Active') return member;
  sessionStorage.removeItem(SESSION_KEY);          // no session, or the account was suspended/deleted since
  return null;
}

function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  window.location.href = 'login.html';
}

// Call at the top of every admin page script (not login.js). Returns the staff member or null.
function requireLogin() {
  const member = getCurrentStaff();
  if (!member) {
    window.location.replace('login.html');
    return null;
  }
  document.getElementById('adminName').textContent = member.fullName;
  document.getElementById('adminRole').textContent = member.role;
  document.getElementById('logoutLink').addEventListener('click', (event) => {
    event.preventDefault();
    logout();
  });
  return member;
}
```

```js
// File: assets/js/pages/login.js
const form = document.getElementById('loginForm');
const errorBox = document.getElementById('loginError');

if (getCurrentStaff()) window.location.replace('applications.html');   // already signed in

form.addEventListener('submit', (event) => {
  event.preventDefault();
  hideAlert(errorBox);
  const result = login(form.elements.email.value, form.elements.password.value);
  if (!result.ok) return showAlert(errorBox, result.error);
  window.location.href = 'applications.html';
});
```

Every admin page script then starts like this:

```js
function initPage() {
  // …everything for this page…
}
if (requireLogin()) initPage();
```

**Done when:** opening any admin page while signed out lands on the login page; signing in shows your
name in the sidebar; Logout returns to the login page; a *Suspended* staff member can't sign in.

### 7.5 Applications list: filter, search, sort, approve/reject (complete example)

```js
// File: assets/js/backend/applications.js  (part 2 — listing and status changes)
const NEXT_STATUS = { Pending: 'Approved', Approved: 'For Installation', 'For Installation': 'Completed' };
const NEXT_ACTION_LABEL = { Pending: 'Approve', Approved: 'Schedule Installation', 'For Installation': 'Mark as Installed' };

function matchesApplicationSearch(app, query) {    // topic-specific name: see "unique names" in §3
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  return app.fullName.toLowerCase().includes(q)
    || app.email.toLowerCase().includes(q)
    || app.referenceNo.toLowerCase().includes(q);
}

// Is record a newer than record b? ISO date strings compare correctly as plain text.
// Same time? The larger id wins, because ids are handed out in increasing order.
function isNewer(a, b, dateField, idField) {
  if (a[dateField] !== b[dateField]) return a[dateField] > b[dateField];
  return a[idField] > b[idField];
}

// Insertion sort, newest first — O(n²) but easy to follow. Exercise: rewrite it as merge sort (§8).
function sortNewestFirst(list, dateField, idField) {
  const result = list.slice();                     // never sort db arrays in place
  for (let i = 1; i < result.length; i++) {
    const current = result[i];
    let j = i - 1;
    while (j >= 0 && isNewer(current, result[j], dateField, idField)) {
      result[j + 1] = result[j];
      j--;
    }
    result[j + 1] = current;
  }
  return result;
}

// filter: "all" or a data-filter value such as "for-installation"
function listApplications(filter = 'all', search = '') {
  const matches = [];
  for (const app of db.applications) {
    const statusMatches = filter === 'all' || slugify(app.status) === filter;
    if (statusMatches && matchesApplicationSearch(app, search)) matches.push(app);
  }
  return sortNewestFirst(matches, 'submittedAt', 'referenceNo');
}

function advanceApplication(referenceNo) {         // Pending → Approved → For Installation → Completed
  const app = findApplicationByRef(referenceNo);
  if (!app || !NEXT_STATUS[app.status]) return null;
  app.status = NEXT_STATUS[app.status];
  if (app.status === 'Completed') createSubscriberFromApplication(app);   // subscribers.js (§7.8)
  saveDatabase();
  return app;
}

function rejectApplication(referenceNo) {
  const app = findApplicationByRef(referenceNo);
  if (!app || app.status !== 'Pending') return null;
  app.status = 'Rejected';
  saveDatabase();
  return app;
}
```

```js
// File: assets/js/pages/applications.js
function initPage() {
  const tbody = document.getElementById('applicationsTableBody');
  const emptyState = document.getElementById('applicationsEmpty');
  const searchInput = document.getElementById('applicationSearch');
  let currentFilter = 'all';

  function renderStatusCell(app) {
    if (app.status !== 'Pending') {
      return `<span class="status-badge status-badge--outline ${statusClass(app.status)}">${escapeHTML(app.status)}</span>`;
    }
    const name = escapeHTML(app.fullName);
    const ref = escapeHTML(app.referenceNo);
    return `
      <div class="row-actions">
        <button type="button" class="btn btn-e3 btn-e3-sm" data-action="approve" data-id="${ref}" aria-label="Approve ${name}">Approve</button>
        <button type="button" class="btn btn-e3-ghost btn-e3-sm" data-action="reject" data-id="${ref}" aria-label="Reject ${name}">Reject</button>
      </div>`;
  }

  function renderRow(app) {
    return `
      <tr data-id="${escapeHTML(app.referenceNo)}">
        <td>
          <a class="cell-link cell-primary" href="application-review.html?ref=${encodeURIComponent(app.referenceNo)}">${escapeHTML(app.fullName)}</a>
          <span class="cell-secondary">${escapeHTML(app.email)}</span>
        </td>
        <td class="text-center">
          <span class="cell-primary">${escapeHTML(planTableName(app.planId))}</span>
          <span class="cell-secondary">${formatNumber(planPrice(app.planId, app.customPrice))}/mo</span>
        </td>
        <td><span class="cell-secondary">Brgy. ${escapeHTML(app.barangay)}</span></td>
        <td class="text-center"><span class="cell-secondary">${formatDateTime(app.submittedAt)}</span></td>
        <td class="text-center">${renderStatusCell(app)}</td>
      </tr>`;
  }

  function render() {
    const apps = listApplications(currentFilter, searchInput.value);
    tbody.innerHTML = apps.map(renderRow).join('');
    emptyState.classList.toggle('d-none', apps.length > 0);
  }

  document.getElementById('applicationFilters').addEventListener('click', (event) => {
    const pill = event.target.closest('.filter-pill');
    if (!pill) return;
    currentFilter = pill.dataset.filter;
    render();
  });
  searchInput.addEventListener('input', render);

  tbody.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const ref = button.dataset.id;
    if (button.dataset.action === 'approve') advanceApplication(ref);
    if (button.dataset.action === 'reject' && window.confirm('Reject this application?')) rejectApplication(ref);
    render();
  });

  render();
}
if (requireLogin()) initPage();
```

**Done when:** the tabs filter, typing "004882" or part of a name filters live, the newest application is
on top, Approve/Reject change the row, and everything is still there after a page reload.

### 7.6 Application review

- Read `?ref=`, find the application (`findApplicationByRef`), `fillFields(applicationView(app))`,
  set `#applicationStatus` with `setStatusBadge`, set `data-id` on both buttons.
- The Approve button moves the application one step (`advanceApplication`). Change its text with
  `NEXT_ACTION_LABEL[app.status]` ("Approve" → "Schedule Installation" → "Mark as Installed"). Show **Reject**
  only while the status is *Pending* (the only time `rejectApplication` works), and hide both buttons when the
  status is *Completed* or *Rejected*.
- `#coverageStatus` shows `app.coverage`; `#installationNotes` saves to `app.notes` on `change`
  (remember `saveDatabase()`).
- `#idPhotoPreview` shows `app.idPhotoName` with **`textContent`** (or an `<img>` if you decide to store small
  previews, §10). The file name was chosen by the applicant on the public form, so treat it exactly like
  typed text — never put it into `innerHTML` unescaped.

**Done when:** approving from this page updates the list page, and a *Completed* application creates a subscriber.

### 7.7 New application (walk-in)

Same as §7.2 with `source = 'walk-in'` — the form uses the same field names. Copy the three
`data.idPhotoName` / `idPhotoType` / `idPhotoSize` lines from `apply.js` too: `new FormData(form)` only gives
a `File` object, and the validator checks those three fields. Differences:
`planId` comes from the radio buttons (`new FormData(form)` handles that), and `customPrice` is only
required when `planId === 'custom'` (the input appears automatically). After success, redirect to
`application-review.html?ref=<new reference>`.

### 7.8 Subscribers (list + detail)

Write `assets/js/backend/subscribers.js`:

| Function | What it does |
|---|---|
| `createSubscriberFromApplication(app)` | Push `{ accountNo: app.referenceNo, …contact/address fields, planId, customPrice, status: 'Active', since: now, applicationRef: app.referenceNo }` — skip if the account already exists. |
| `findSubscriber(accountNo)` | Linear search in `db.subscribers`. |
| `listSubscribers(filter, search)` | Same idea as `listApplications` (filters `all/active/suspended/terminated`; search name, email, account number), newest first with `sortNewestFirst(list, 'since', 'accountNo')`. |
| `setSubscriberStatus(accountNo, status)` | Suspend ↔ Active, or Terminated (final). |
| `changeSubscriberPlan(accountNo, planId)` | Update `planId`; future bills use the new price. |

List page (`subscribers.html`): copy the §7.5 page script structure — rows link to
`subscriber-detail.html?account=<accountNo>`, badges use `status-badge` without `--outline`.

Detail page (`subscriber-detail.html`): fill `[data-field]` (`fullName`, `accountNo`, `since` → `formatDate`,
`email`, `contactNumber`, `barangay`, `completeAddress`, `landmark`, `planLabel`, `nextBillDate`,
`outstandingBalance`, `paidToDate`), render `#billingHistoryBody` from `billsForAccount(accountNo)` (§7.9),
make **Suspend** toggle to **Reactivate**, and handle `#changePlanForm` (pre-check the current plan's radio
when the modal opens). **Settle** pays the oldest unpaid bill of this account.
`nextBillDate` is the due date of the oldest unpaid bill (`formatDate`); when everything is paid, use the start
of the next billing period from `billingPeriod(...)`. `outstandingBalance` and `paidToDate` use `formatPeso`.

### 7.9 Billing

`assets/js/backend/bills.js` — the date maths is the tricky part, so here it is:

```js
// File: assets/js/backend/bills.js  (key parts — add createBill, settleBill, billsForAccount yourself)
function daysInMonth(year, month) {                // month is 1–12
  return new Date(year, month, 0).getDate();
}

function billingPeriod(subscriber, year, month) {  // anniversary billing, e.g. joined Aug 15 → Sep 15 – Oct 14
  const day = parseDate(subscriber.since).getDate();
  const start = new Date(year, month - 1, Math.min(day, daysInMonth(year, month)));
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextStart = new Date(nextYear, nextMonth - 1, Math.min(day, daysInMonth(nextYear, nextMonth)));
  return {
    periodStart: toISODate(start),
    periodEnd: toISODate(addDays(nextStart, -1)),
    dueDate: toISODate(addDays(start, 15)),
  };
}

function billsForMonth(year, month) {
  return db.bills.filter((bill) => bill.billingYear === year && bill.billingMonth === month);
}

function groupBills(bills, today) {                // bucket each bill into one of four arrays
  const groups = { overdue: [], dueThisWeek: [], upcoming: [], paid: [] };
  for (const bill of bills) {
    if (bill.status === 'Paid') {
      groups.paid.push(bill);
      continue;
    }
    const daysLeft = daysBetween(today, bill.dueDate);
    if (daysLeft < 0) groups.overdue.push(bill);
    else if (daysLeft <= 7) groups.dueThisWeek.push(bill);
    else groups.upcoming.push(bill);
  }
  return groups;
}

function summarizeBills(bills) {                  // one pass with reduce: O(n)
  return bills.reduce((totals, bill) => {
    totals.expected += bill.amount;
    if (bill.status === 'Paid') totals.collected += bill.amount;
    else totals.outstanding += bill.amount;
    return totals;
  }, { expected: 0, collected: 0, outstanding: 0 });
}

function dueText(bill, today) {                    // the coloured words after the period
  if (bill.status === 'Paid') return { text: `paid ${formatShortDate(bill.paidOn)}`, className: 'text-green' };
  const daysLeft = daysBetween(today, bill.dueDate);
  if (daysLeft < 0) return { text: `${-daysLeft} day${daysLeft === -1 ? '' : 's'} overdue`, className: 'text-red' };
  if (daysLeft === 0) return { text: 'due today', className: 'text-amber' };
  if (daysLeft <= 7) return { text: `in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`, className: 'text-amber' };
  return null;                                     // upcoming bills show only the period
}
```

Then write, in the same file:

- `hasBill(accountNo, year, month)` — search `db.bills`; used to block duplicates and to label
  "Already Billed" / "Not yet Billed" in the New Bill list.
- `createBill(accountNo, year, month)` — only for *Active* subscribers without a bill that month; amount =
  `planPrice(subscriber.planId, subscriber.customPrice)`; id = `BILL-${year}${pad2(month)}-${accountNo.slice(-6)}`;
  period/due from `billingPeriod`; `status: 'Unpaid'`, `paidOn: null`.
- `settleBill(billId)` — set `status: 'Paid'`, `paidOn: toISODate(getToday())`.
- `billsForAccount(accountNo)` — the history table, newest `periodStart` first.
- `outstandingBalance(accountNo)` / `paidToDate(accountNo)` — sums of unpaid / paid amounts (reduce).

Page (`billing.html`):
1. Keep `viewYear`/`viewMonth` (start at today's month). `#prevMonthBtn`/`#nextMonthBtn` change them and re-render;
   `#billingMonthLabel` and `#billingSummaryPeriod` show `formatMonthYear(viewYear, viewMonth)`.
2. `bills = billsForMonth(…)` → apply `#billFilters` (all/unpaid/paid) and `#billSearch` (subscriber name,
   email or account number — look the subscriber up for each bill).
3. `summarizeBills(allBillsOfTheMonth)` → `#billingExpected`, `#billingCollected`, `#billingOutstanding` (`formatPeso`).
4. `groupBills(filteredBills, getToday())` → render each group into `#overdueBills`, `#dueThisWeekBills`,
   `#upcomingBills`, `#paidBills`; write "`count` - `total`" into `#overdueSummary` etc.; hide a group's
   `<section>` when it is empty; show `#billsEmpty` when all four are empty.
5. Settle buttons: Pattern C with `data-action="settle"` → `settleBill` → re-render.
6. New Bill modal: when it opens, render `#newBillSubscriberList` from the *Active* subscribers
   (radio `name="accountNo"`, `disabled` + "Already Billed" when `hasBill(...)` for the chosen
   `#billingMonth`/`#billingYear`); `#newBillSearch` filters that list; on submit call `createBill`,
   hide the modal and re-render.

**Done when:** with "today" set to `2026-09-18` (§2), September 2026 shows 1 overdue, 1 due this week,
2 upcoming and 2 paid bills, totals ₱ 6,400 / ₱ 2,200 / ₱ 4,200, and settling a bill moves it to *Paid*.

### 7.10 Staff

`assets/js/backend/staff.js`:

- `listStaff(filter, search)` — filters `all/active/suspended/deleted`; search name, email or role ("job title").
- `generateTempPassword(length = 12)` — random characters from `ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*`
  using `crypto.getRandomValues` (don't use `Math.random` for passwords).
- `addStaff({ fullName, email, startDate, role })` — validate (name, email format, **email not already used**
  — a search!, role in `STAFF_ROLES`), create `STF-0005`-style id from `db.counters.staff`, `status: 'Active'`,
  `lastSignIn: null`, `password: generateTempPassword()`; return `{ ok: true, staff, tempPassword }`.

Page: render `#staffTableBody` (Pattern A–B). On `#addStaffForm` submit: call `addStaff`; on success hide
`#addStaffModal`, put the email and password into `#tempCredentialEmail` / `#tempCredentialPassword`, show
`#tempCredentialModal` (Pattern F). The **Copy to Clipboard** button already works (`ui.js`).

Optional: the Figma file has no buttons for suspending or deleting staff (only the filter tabs). If your
instructor wants them, add `setStaffStatus(id, status)` and a small action in each row — `getCurrentStaff()`
already signs out anyone who is no longer *Active*.

---

## 8. Where the Data Structures & Algorithms are

| Concept | Where in this project | Complexity |
|---|---|---|
| **Array** (the "table") | `db.applications`, `db.subscribers`, `db.bills`, `db.staff` | — |
| **Linear search** | `findPlanById`, `findApplicationByRef`, `findStaffByEmail`, `hasBill` | O(n) |
| **Binary search** | Track page on the reference-sorted `db.applications` (§7.3) | O(log n) |
| **Sorting** | `sortNewestFirst` (insertion sort); your merge sort; bills by period | O(n²) / O(n log n) |
| **Filtering** | Status tabs, month filter, "Unpaid/Paid" | O(n) |
| **String search** | Search boxes (`includes`, case-insensitive) | O(n·m) |
| **Grouping / bucketing** | `groupBills` → 4 arrays | O(n) |
| **Aggregation (reduce)** | `summarizeBills`, balances | O(n) |
| **State machine** | Application status flow (Appendix B) | — |
| **Counter / id generator** | `nextReferenceNo`, staff ids | O(1) |
| **Hash map (index)** | optional: `new Map(db.applications.map((a) => [a.referenceNo, a]))` for O(1) look-ups | O(n) to build |
| **Queue (FIFO)** | optional "Review next" button: pending applications oldest-first, `queue.shift()` | O(1) enqueue |
| **Stack (LIFO)** | optional "Undo" for the last status change: push `{ ref, oldStatus }`, pop to undo | O(1) |

Ideas that make a stronger DSA report:

- **Merge sort** exercise — replace `sortNewestFirst` (keep using `isNewer` to compare):
  ```
  mergeSort(list):
    if list has 0 or 1 item: return list
    split list into left half and right half
    left  = mergeSort(left);  right = mergeSort(right)
    return merge(left, right)          // repeatedly take the newer of left[0] / right[0]
  ```
- **Compare** linear vs. binary search and insertion vs. merge sort on 1,000 / 10,000 / 100,000 generated
  records using `performance.now()` and put the table in your report.
- **Queue** — show "Next in line" on the Applications page: `const queue = listApplications('pending').reverse();`
  then `queue.shift()` each time staff finishes a review.

---

## 9. Validation rules

| Field | Rule | Message |
|---|---|---|
| Full name | required, at least 2 characters | "Enter the full name." |
| Email | `something@something.domain` | "Enter a valid email address." |
| Contact number | `^09\d{2}\s?\d{3}\s?\d{4}$` (e.g. `0921 821 5399`) | "Enter an 11-digit mobile number like 0921 821 5399." |
| Birth date | required, age 18+ | "The applicant must be at least 18 years old." |
| Barangay | one of the 24 in `BARANGAYS` | "Choose a barangay." |
| Complete address | required | "Enter the complete address." |
| ID type / ID number | from `ID_TYPES` / required | "Choose an ID type." / "Enter the ID number." |
| ID photo | required, JPG/PNG/PDF, ≤ 10 MB | "Upload a photo of the ID." / "The ID photo must be a JPG, PNG or PDF file." / "The ID photo must be 10 MB or smaller." |
| Plan | a plan id, or `custom` with a price above 0 | "Choose a plan." / "Enter the custom monthly price." |
| Staff email | valid and not used by another staff member | "That email already has an account." |
| Reference number (track) | `^E3-\d{4}-\d{6}$` | "Use the format E3-2026-004879." |

---

## 10. Security and data notes

- **Cross-site scripting (XSS):** anything that came from a user — typed text (names, addresses, notes) **and
  uploaded file names** — must go through `escapeHTML()` before it is placed inside an `innerHTML` template,
  or be set with `textContent`. This matters most on admin pages: they show data typed on the public form.
  Try submitting the name `<img src=x onerror=alert(1)>` (and, on macOS/Linux, an ID photo with that file
  name) — nothing should pop up. Values such as status classes should come from fixed lists (`statusClass`
  strips anything that isn't a letter, digit or dash).
- **Passwords:** this project stores them as plain text in `localStorage`, which is fine for a class demo
  but never for a real system. Stretch goal: store a SHA-256 hash (`crypto.subtle.digest`) and compare hashes.
  Real systems check passwords on a server.
- **The admin "login" only hides pages.** Anyone can open DevTools and read `localStorage`. That is expected
  for a front-end-only project — mention it in your documentation.
- **ID photos:** `localStorage` holds only about 5 MB in total, so store the **file name** (and maybe type/size),
  not the image. If you want previews, shrink the image to a small thumbnail with a `<canvas>` first.
- **Dates:** always store `YYYY-MM-DD` / `YYYY-MM-DDTHH:MM:SS` strings (they sort correctly as text and survive
  JSON); format them only when displaying.

---

## 11. Testing checklist

Public
- [ ] Landing: 5 plans render from `PLANS`; every SELECT pre-selects that plan on the form.
- [ ] Apply: empty or invalid fields are blocked; under-18 birth date shows the error; a valid form lands on
      the submitted page with a new reference number and your data.
- [ ] Track: the new reference and a sample one (`E3-2026-004882`) are found; `E3-2026-999999` shows "not found".

Admin
- [ ] Admin pages redirect to login when signed out; wrong password and suspended account are rejected.
- [ ] Applications: every tab, search by name/email/reference, newest first, Approve/Reject, still saved after reload.
- [ ] Review: status steps Pending → Approved → For Installation → Completed; Completed creates a subscriber.
- [ ] New Application: walk-in with a custom price shows "Custom - 1,800 /mo".
- [ ] Subscribers: tabs + search; detail shows balance and history; Suspend/Reactivate and Change Plan still show after a reload.
- [ ] Billing: month arrows; groups and totals (use `e3fiber-today` = `2026-09-18`); Settle and New Bill still show after a reload; New Bill blocks duplicates.
- [ ] Staff: Add Staff shows the temporary credential; duplicate email is rejected; the new staff member can sign in.
- [ ] `resetDatabase()` restores everything.

---

## 12. Suggested team split and order

| Order | Work | Who |
|---|---|---|
| 1 | `db.js`, `utils.js`, `plans.js`, landing page | Member 1 |
| 2 | Apply → Submitted → Track (§7.2–7.3) | Member 2 |
| 3 | `auth.js` + login + `requireLogin` on every admin page (§7.4) | Member 1 |
| 4 | Applications list + review + new application (§7.5–7.7) | Member 3 |
| 5 | Subscribers list + detail (§7.8) | Member 4 |
| 6 | Billing (§7.9) | Members 2 + 4 |
| 7 | Staff (§7.10) | Member 3 |
| 8 | DSA extras (binary search, merge sort, queue, benchmarks) + report | Everyone |

Merge often, and keep the ids in Appendix A unchanged so everyone's code lines up.

---

## Appendix A — Element hooks for every page

`name` attributes equal the data field names from §4.2 unless noted.

**Public**

| Page | Hooks |
|---|---|
| `index.html` | `#planCards` (container of `.plan-card[data-plan-id]`), SELECT links `apply.html?plan=<id>` |
| `apply.html` | `#applicationForm`, `#applicationFormAlert`, `#selectedPlanLabel`, `#changePlanLink`, hidden `#planId`, `#fullName`, `#email`, `#contactNumber`, `#birthDate`, `#city`, `#barangay`, `#completeAddress`, `#landmark`, `#idType`, `#idNumber`, `#idPhoto` (+ `#idPhotoName`), `#submitApplicationBtn` |
| `application-submitted.html` | `#referenceNo`, `#applicationStatus`, `#applicationSummary`, `[data-field]`: `fullName`, `contactNumber`, `email`, `birthDate`, `completeAddress`, `landmark`, `planLabel`, `submittedAt` |
| `track.html` | `#trackForm`, `#trackReference` (`name="referenceNo"`), `#trackBtn`, `#trackNotFound`, `#trackResult`, `#trackReferenceNo`, `#trackStatus`, `[data-field]`: `fullName`, `contactNumber`, `planLabel`, `submittedAt` |

**Admin (every admin page except `login.html`)**: `#adminSidebar`, `#adminName`, `#adminRole`, `#logoutLink`.

| Page | Hooks |
|---|---|
| `login.html` | `#loginForm`, `#loginError`, `#loginEmail` (`name="email"`), `#loginPassword` (`name="password"`), `#loginBtn` |
| `applications.html` | `#applicationFilters` (`data-filter`: `all`, `pending`, `for-installation`, `completed`, `rejected`), `#applicationSearch`, `#applicationsTableBody` (`tr[data-id]`), `[data-action="approve"|"reject"][data-id]`, `#applicationsEmpty` |
| `application-review.html` | `#applicationStatus`, `#rejectApplicationBtn`, `#approveApplicationBtn`, `#idPhotoPreview`, `#coverageStatus`, `#installationNotes` (`name="notes"`), `[data-field]`: `fullName`, `referenceNo`, `submittedAt`, `email`, `contactNumber`, `birthDate`, `city`, `barangay`, `completeAddress`, `landmark`, `planLabel`, `idType`, `idNumber` |
| `new-application.html` | `#newApplicationForm`, `#newApplicationAlert`, same field ids as `apply.html`, plan radios `name="planId"` (`#planStarter` … `#planUltimate`, `#planCustom`), `#customPrice`, `#createApplicationBtn` |
| `subscribers.html` | `#subscriberFilters` (`all`, `active`, `suspended`, `terminated`), `#subscriberSearch`, `#subscribersTableBody`, `#subscribersEmpty` |
| `subscriber-detail.html` | `#subscriberStatus`, `#suspendSubscriberBtn`, `#changePlanBtn`, `#settleBalanceBtn`, `#billingHistoryBody`, `#changePlanModal`, `#changePlanForm` (radios `name="planId"`, `#changePlanStarter` …), `#saveChangePlanBtn`, `[data-field]`: `fullName`, `accountNo`, `since`, `email`, `contactNumber`, `barangay`, `completeAddress`, `landmark`, `planLabel`, `nextBillDate`, `outstandingBalance`, `paidToDate` |
| `billing.html` | `#newBillBtn`, `#billingSummaryPeriod`, `#billingExpected`, `#billingCollected`, `#billingOutstanding`, `#prevMonthBtn`, `#billingMonthLabel`, `#nextMonthBtn`, `#billFilters` (`all`, `unpaid`, `paid`), `#billSearch`, `#billGroups` with `section[data-group]`, `#overdueSummary`/`#overdueBills`, `#dueThisWeekSummary`/`#dueThisWeekBills`, `#upcomingSummary`/`#upcomingBills`, `#paidSummary`/`#paidBills`, `.bill-row[data-id]`, `[data-action="settle"][data-id]`, `#billsEmpty`; modal `#newBillModal`, `#newBillForm`, `#newBillSearch`, `#newBillSubscriberList` (radios `name="accountNo"`), `#billingMonth` (1–12), `#billingYear`, `#createBillBtn` |
| `staff.html` | `#addStaffBtn`, `#staffFilters` (`all`, `active`, `suspended`, `deleted`), `#staffSearch`, `#staffTableBody`, `#staffEmpty`; modal `#addStaffModal`, `#addStaffForm`, `#addStaffAlert`, `#staffFullName`, `#staffEmail`, `#staffStartDate`, `#staffRole`, `#addStaffSubmitBtn`; modal `#tempCredentialModal`, `#tempCredentialEmail`, `#tempCredentialPassword`, `#copyCredentialBtn` |

Status badge classes (already styled): `status-pending`, `status-approved`, `status-for-installation`,
`status-completed`, `status-rejected`, `status-active`, `status-suspended`, `status-terminated`,
`status-deleted`, `status-paid`, `status-unpaid`, `status-overdue` — always via `statusClass(status)`.

---

## Appendix B — Status flows

```
Applications:   Pending ──Approve──▶ Approved ──Schedule──▶ For Installation ──Mark installed──▶ Completed
                   │                                                                            (creates a subscriber)
                   └──Reject──▶ Rejected

Subscribers:    Active ◀──Suspend / Reactivate──▶ Suspended          Active / Suspended ──▶ Terminated

Bills:          Unpaid ──Settle──▶ Paid                  (overdue / due this week / upcoming are computed, not stored)

Staff:          Active ◀──▶ Suspended ──▶ Deleted        (only Active staff can sign in;
                                                          no buttons for this in the design — optional, §7.10)
```

---

## Appendix C — Troubleshooting

| Symptom | Likely cause |
|---|---|
| `db is not defined` / `formatPeso is not defined` | Script order: `db.js` and `utils.js` must come before the other backend files and the page script. |
| A function suddenly behaves like it belongs to another file | Two scripts define a function with the same name; the one loaded last silently wins. Use topic-specific names (§3). |
| `Identifier 'form' has already been declared` | Two scripts on the same page declare the same top-level `const`/`let`/function name (plain scripts share one global scope). Rename one, or keep page code inside `initPage()` as in §7.4. |
| Data disappears when changing pages | Page opened with `file://` instead of a local server, or a function forgot `saveDatabase()`. |
| The form reloads the page and adds `?fullName=…` to the URL | The page script isn't loaded, or `event.preventDefault()` is missing. |
| "Sign In" shows *Cannot POST* / *405* | Same cause on `admin/login.html` — its form uses `method="post"` on purpose so a password can never end up in the URL. Load `login.js`. |
| Dates show one day early | A `YYYY-MM-DD` string was passed to `new Date()` directly — use `parseDate()`. |
| Sample data changed and you want it back | Run `resetDatabase()` in the console. |
| Billing groups look "wrong" | They depend on today's date; set `e3fiber-today` to `2026-09-18` to match the sample data. |
