/* ==========================================================================
   E3 Fiber Connect · backend/database.js
   The "database": plain JavaScript arrays that live in memory.

   The whole website is ONE page (index.html), so these arrays stay alive while
   you move between screens — nothing has to "transfer" between pages, and no
   localStorage or server is needed. Reloading the browser starts again from
   the sample data created by seedDatabase().

   Every table is kept sorted by its key, so records can be binary-searched:
     applications  by referenceNo   issued in increasing order → appended
     subscribers   by accountNo     sortedInsert (accounts open in any order)
     bills         by billId        sortedInsert
     payments      by paymentId     issued in increasing order → appended
     tickets       by ticketNo      issued in increasing order → appended
     staffMembers  by id            issued in increasing order → appended
     registrations by registrationId issued in increasing order → appended
     activityLog   oldest → newest  append only

   Two hash tables sit next to the arrays as indexes:
     staffEmailIndex        e-mail → staff id                (sign-in, "e-mail used?")
     paymentReferenceIndex  "METHOD:REFERENCE" → payment ids (duplicate-reference check)
   ========================================================================== */

'use strict';

/* --------------------------------------------------------------------------
   Fixed lists (they never change while the site runs)
   -------------------------------------------------------------------------- */

const PLANS = [
  { id: 'starter', name: 'Starter', speed: 50, price: 800, bestFor: 'Browsing, social media and HD video', devices: '1–3 devices', popular: false },
  { id: 'stream', name: 'Stream', speed: 70, price: 1000, bestFor: 'HD streaming and video calls', devices: '3–5 devices', popular: false },
  { id: 'power', name: 'Power', speed: 100, price: 1200, bestFor: 'Work, school and 4K streaming', devices: '5–8 devices', popular: true },
  { id: 'pro', name: 'Pro', speed: 200, price: 1500, bestFor: 'Online gaming and big downloads', devices: '8–12 devices', popular: false },
  { id: 'ultimate', name: 'Ultimate', speed: 300, price: 2000, bestFor: 'Large households and home offices', devices: '12+ devices', popular: false },
];

const PLAN_FEATURES = ['No data capping', 'Free or low-cost installation', 'No lock-in period'];

const SERVICE_CITY = 'Santa Maria';
const SERVICE_PROVINCE = 'Bulacan';

// Sorted by `key` (lower-case name) so coverage look-ups can use binary search.
const BARANGAYS = [
  { name: 'Bagbaguin', key: 'bagbaguin', status: 'available', accessPoints: 7 },
  { name: 'Balasing', key: 'balasing', status: 'available', accessPoints: 5 },
  { name: 'Buenavista', key: 'buenavista', status: 'available', accessPoints: 4 },
  { name: 'Bulac', key: 'bulac', status: 'available', accessPoints: 6 },
  { name: 'Camangyanan', key: 'camangyanan', status: 'coming-soon', accessPoints: 0 },
  { name: 'Catmon', key: 'catmon', status: 'available', accessPoints: 8 },
  { name: 'Caypombo', key: 'caypombo', status: 'available', accessPoints: 5 },
  { name: 'Caysio', key: 'caysio', status: 'available', accessPoints: 6 },
  { name: 'Guyong', key: 'guyong', status: 'available', accessPoints: 9 },
  { name: 'Lalakhan', key: 'lalakhan', status: 'coming-soon', accessPoints: 0 },
  { name: 'Mag-asawang Sapa', key: 'mag-asawang sapa', status: 'coming-soon', accessPoints: 0 },
  { name: 'Mahabang Parang', key: 'mahabang parang', status: 'coming-soon', accessPoints: 0 },
  { name: 'Manggahan', key: 'manggahan', status: 'available', accessPoints: 7 },
  { name: 'Parada', key: 'parada', status: 'available', accessPoints: 6 },
  { name: 'Poblacion', key: 'poblacion', status: 'available', accessPoints: 12 },
  { name: 'Pulong Buhangin', key: 'pulong buhangin', status: 'available', accessPoints: 10 },
  { name: 'San Gabriel', key: 'san gabriel', status: 'coming-soon', accessPoints: 0 },
  { name: 'San Jose Patag', key: 'san jose patag', status: 'available', accessPoints: 5 },
  { name: 'San Vicente', key: 'san vicente', status: 'available', accessPoints: 8 },
  { name: 'Santa Clara', key: 'santa clara', status: 'available', accessPoints: 9 },
  { name: 'Santa Cruz', key: 'santa cruz', status: 'available', accessPoints: 7 },
  { name: 'Silangan', key: 'silangan', status: 'available', accessPoints: 6 },
  { name: 'Tabing Bakod', key: 'tabing bakod', status: 'available', accessPoints: 4 },
  { name: 'Tumana', key: 'tumana', status: 'coming-soon', accessPoints: 0 },
];

const ID_TYPES = [
  "Driver's License", 'Passport', 'PhilSys National ID', 'UMID', 'SSS ID', 'PRC ID', 'Postal ID',
  "Voter's ID", 'PhilHealth ID', 'TIN ID', 'Senior Citizen ID',
];

const STAFF_ROLES = ['Owner', 'Admin', 'Support'];
const TICKET_CATEGORIES = ['No connection', 'Slow connection', 'Billing', 'Installation', 'Relocation', 'Other'];
const PAYMENT_METHODS = ['GCash', 'Maya', 'Bank transfer', 'Over the counter'];
const INSTALL_SLOTS = ['Morning (8 AM – 12 PM)', 'Afternoon (1 PM – 5 PM)'];
const REJECT_REASONS = ['Outside the coverage area', 'ID could not be verified', 'Could not reach the applicant', 'Duplicate application', 'Other'];
const REGISTRATION_ROLES = ['Admin', 'Support'];   // an Owner account is never self-registered
const REGISTRATION_REJECT_REASONS = ['Not on the E3 staff list', 'Wrong role requested', 'Duplicate request', 'Other'];
const STAFF_EMAIL_DOMAIN = '@e3fiberconnect.ph';

/* --------------------------------------------------------------------------
   Tables — `const` so a table is never replaced, only changed in place
   -------------------------------------------------------------------------- */

const applications = [];
const subscribers = [];
const bills = [];
const payments = [];
const tickets = [];
const staffMembers = [];
const registrations = [];
const activityLog = [];

const counters = { reference: 0, ticket: 0, payment: 0, staff: 0, registration: 0 };

// e-mail (lower case) → staff id; kept in step with staffMembers (dsa/hashtable.js)
const staffEmailIndex = createHashTable(17);

// "GCASH:5012873246119" → ids of the payments that used it (payments.js, duplicate check)
const paymentReferenceIndex = createHashTable(17);

const databaseState = { changed: false };

// Table directory for the undo feature: name → array + key field.
const TABLE_DIRECTORY = [
  { name: 'applications', rows: applications, keyField: 'referenceNo' },
  { name: 'subscribers', rows: subscribers, keyField: 'accountNo' },
  { name: 'bills', rows: bills, keyField: 'billId' },
  { name: 'payments', rows: payments, keyField: 'paymentId' },
  { name: 'tickets', rows: tickets, keyField: 'ticketNo' },
  { name: 'staffMembers', rows: staffMembers, keyField: 'id' },
  { name: 'registrations', rows: registrations, keyField: 'registrationId' },
];

/** findTable — the directory entry for a table name (linear search, 7 tables). O(1) */
function findTable(name) {
  for (let i = 0; i < TABLE_DIRECTORY.length; i++) {
    if (TABLE_DIRECTORY[i].name === name) {
      return TABLE_DIRECTORY[i];
    }
  }
  return null;
}

/** findRecordIndex — position of a record by key; every table is sorted by its key. O(log n) */
function findRecordIndex(tableName, key) {
  const table = findTable(tableName);
  return table ? binarySearch(table.rows, table.keyField, key) : -1;
}

/** markDataChanged — remember that something changed (used to warn before a reload). O(1) */
function markDataChanged() {
  databaseState.changed = true;
}

/** rebuildStaffEmailIndex — refill the e-mail hash table from staffMembers. O(n) */
function rebuildStaffEmailIndex() {
  const fresh = createHashTable(17);
  staffEmailIndex.buckets = fresh.buckets;
  staffEmailIndex.size = 0;
  for (let i = 0; i < staffMembers.length; i++) {
    hashPut(staffEmailIndex, toLowerText(staffMembers[i].email), staffMembers[i].id);
  }
}

/** rebuildPaymentReferenceIndex — refill the reference hash table from payments. O(n) */
function rebuildPaymentReferenceIndex() {
  const fresh = createHashTable(17);
  paymentReferenceIndex.buckets = fresh.buckets;
  paymentReferenceIndex.size = 0;
  for (let i = 0; i < payments.length; i++) {
    indexPaymentReference(payments[i]);
  }
}

/** notInFuture — a sample date-time, or `minutesAgo` minutes ago if it would be in the future. O(1) */
function notInFuture(isoDateTime, minutesAgo) {
  return isoDateTime > nowISO() ? minutesAgoISO(minutesAgo) : isoDateTime;
}

/* --------------------------------------------------------------------------
   Sample data — dates are relative to today, so the demo always looks current
   -------------------------------------------------------------------------- */

const SEED_STAFF = [
  { fullName: 'Maria Santos', email: 'maria.santos@e3fiberconnect.ph', role: 'Owner', status: 'Active', startDate: '2025-11-03', password: 'owner123', lastSignInDaysAgo: 1 },
  { fullName: 'Juan Dela Cruz', email: 'juan.delacruz@e3fiberconnect.ph', role: 'Admin', status: 'Active', startDate: '2026-01-05', password: 'e3admin', lastSignInDaysAgo: 0 },
  { fullName: 'Paolo Reyes', email: 'paolo.reyes@e3fiberconnect.ph', role: 'Support', status: 'Active', startDate: '2026-02-16', password: 'support123', lastSignInDaysAgo: 2 },
  { fullName: 'Grace Lim', email: 'grace.lim@e3fiberconnect.ph', role: 'Support', status: 'Suspended', startDate: '2026-03-02', password: 'grace1234', lastSignInDaysAgo: 30 },
  { fullName: 'Daniel Tan', email: 'daniel.tan@e3fiberconnect.ph', role: 'Admin', status: 'Deleted', startDate: '2026-03-20', password: 'daniel1234', lastSignInDaysAgo: 45 },
];

// Staff registrations ("Request access"), oldest first. Grace Lim's account came
// from an approved request; Kevin asked for the wrong role; two are waiting.
const SEED_REGISTRATIONS = [
  { fullName: 'Grace Lim', email: 'grace.lim@e3fiberconnect.ph', mobile: '0917 555 0129', role: 'Support', note: 'Customer support — starting March 2.', password: 'grace1234', submittedAt: '2026-02-26T09:12:00', outcome: 'Approved', reviewedAt: '2026-02-27T10:05:00', reviewedBy: 'Maria Santos' },
  { fullName: 'Kevin Aquino', email: 'kevin.aquino@e3fiberconnect.ph', mobile: '0917 555 0126', role: 'Admin', note: 'Field technician — needs to see the installation schedule.', password: 'kevin2026', daysAgo: 6, hour: 14, minute: 30, outcome: 'Rejected', reviewDaysAgo: 5, reviewedBy: 'Maria Santos', reason: 'Wrong role requested — please send a new request for Support access.' },
  { fullName: 'Lorenzo Pascual', email: 'lorenzo.pascual@e3fiberconnect.ph', mobile: '0918 555 0137', role: 'Admin', note: 'New branch supervisor for the Poblacion office.', password: 'lorenzo2026', daysAgo: 1, hour: 16, minute: 45, outcome: 'Pending' },
  { fullName: 'Trisha Manalo', email: 'trisha.manalo@e3fiberconnect.ph', mobile: '0919 555 0146', role: 'Support', note: 'Cashier at the main office — will validate payments.', password: 'trisha2026', daysAgo: 0, outcome: 'Pending' },
];

// daysAgo = when the application was sent; outcome = where it is today.
const SEED_APPLICANTS = [
  { fullName: 'Liza Fernandez', email: 'liza.fernandez@gmail.com', contactNumber: '0917 555 0141', birthDate: '1987-03-12', barangay: 'Santa Clara', completeAddress: '18 Mabini St., Purok 2', landmark: 'Near Santa Clara Chapel', planId: 'starter', idType: 'PhilSys National ID', idNumber: '4827-1930-5561-2048', idPhotoName: 'liza-philsys.jpg', source: 'online', daysAgo: 78, outcome: 'Completed', account: 'Active' },
  { fullName: 'Ramon Villareal', email: 'ramon.villareal@yahoo.com', contactNumber: '0918 555 0172', birthDate: '1979-11-02', barangay: 'Silangan', completeAddress: '45 Rizal Ave.', landmark: 'Beside Silangan Barangay Hall', planId: 'power', idType: "Driver's License", idNumber: 'N02-14-778120', idPhotoName: 'ramon-license.jpg', source: 'walk-in', daysAgo: 74, outcome: 'Completed', account: 'Active' },
  { fullName: 'Jerome Santiago', email: 'jerome.santiago@gmail.com', contactNumber: '0919 555 0133', birthDate: '1992-06-21', barangay: 'Parada', completeAddress: '9 Aguinaldo St.', landmark: 'Near Parada Elementary School', planId: 'power', idType: 'UMID', idNumber: '0111-2345678-9', idPhotoName: 'jerome-umid.png', source: 'online', daysAgo: 71, outcome: 'Completed', account: 'Terminated' },
  { fullName: 'Kristine Ramos', email: 'kristine.ramos@gmail.com', contactNumber: '0927 555 0164', birthDate: '1995-01-30', barangay: 'Poblacion', completeAddress: '14 Burgos St.', landmark: 'Near the municipal hall', planId: 'starter', idType: 'Postal ID', idNumber: 'PRN-100-2394-1188', idPhotoName: 'kristine-postal.jpg', source: 'online', daysAgo: 68, outcome: 'Completed', account: 'Active' },
  { fullName: 'Mark Bautista', email: 'mark.bautista@outlook.com', contactNumber: '0935 555 0115', birthDate: '1990-08-08', barangay: 'Bulac', completeAddress: '3 Sampaguita St.', landmark: 'Near Bulac Chapel', planId: 'stream', idType: 'SSS ID', idNumber: '34-5678901-2', idPhotoName: 'mark-sss.jpg', source: 'online', daysAgo: 65, outcome: 'Completed', account: 'Active' },
  { fullName: 'Patricia Gonzales', email: 'patricia.gonzales@gmail.com', contactNumber: '0945 555 0176', birthDate: '1984-12-17', barangay: 'Catmon', completeAddress: '21 Rosal St.', landmark: 'Near Catmon Health Center', planId: 'power', idType: 'Passport', idNumber: 'P4567890B', idPhotoName: 'patricia-passport.pdf', source: 'online', daysAgo: 63, outcome: 'Completed', account: 'Suspended' },
  { fullName: 'Carlo Mendoza', email: 'carlo.mendoza@gmail.com', contactNumber: '0956 555 0127', birthDate: '1989-04-25', barangay: 'Manggahan', completeAddress: '7 Ilang-Ilang St.', landmark: 'Near Manggahan Bridge', planId: 'pro', idType: 'PRC ID', idNumber: '0123456', idPhotoName: 'carlo-prc.jpg', source: 'walk-in', daysAgo: 60, outcome: 'Completed', account: 'Active' },
  { fullName: 'Angelica Cruz', email: 'angelica.cruz@gmail.com', contactNumber: '0966 555 0188', birthDate: '1997-09-09', barangay: 'San Vicente', completeAddress: '16 Jasmin St.', landmark: 'Near San Vicente Plaza', planId: 'stream', idType: 'PhilHealth ID', idNumber: '12-345678901-2', idPhotoName: 'angelica-philhealth.png', source: 'online', daysAgo: 57, outcome: 'Completed', account: 'Active' },
  { fullName: 'Andrea Villanueva', email: 'andrea.villanueva@gmail.com', contactNumber: '0977 555 0139', birthDate: '1993-02-14', barangay: 'Tumana', completeAddress: '8 Del Pilar St.', landmark: 'Near Tumana Elementary School', planId: 'stream', idType: 'Passport', idNumber: 'P1234567A', idPhotoName: 'andrea-passport.jpg', source: 'online', daysAgo: 20, outcome: 'Rejected' },
  { fullName: 'Noel Garcia', email: 'noel.garcia@gmail.com', contactNumber: '0998 555 0150', birthDate: '1985-10-05', barangay: 'Guyong', completeAddress: '45 Rizal Ave., Purok 4', landmark: 'Beside Guyong Barangay Hall', planId: 'ultimate', idType: "Driver's License", idNumber: 'N01-23-456789', idPhotoName: 'noel-license.jpg', source: 'online', daysAgo: 12, outcome: 'For Installation', installInDays: 3, slot: 0 },
  { fullName: 'Maricel Dizon', email: 'maricel.dizon@gmail.com', contactNumber: '0917 555 0161', birthDate: '1991-07-19', barangay: 'Caysio', completeAddress: '27 Bonifacio St.', landmark: 'Near Caysio Covered Court', planId: 'power', idType: 'UMID', idNumber: '0111-9876543-2', idPhotoName: 'maricel-umid.jpg', source: 'walk-in', daysAgo: 9, outcome: 'For Installation', installInDays: 1, slot: 1 },
  { fullName: 'Joshua Navarro', email: 'joshua.navarro@gmail.com', contactNumber: '0920 555 0112', birthDate: '1999-03-03', barangay: 'Bagbaguin', completeAddress: '12 Luna St.', landmark: 'Across Bagbaguin Chapel', planId: 'starter', idType: 'PhilSys National ID', idNumber: '1234-5678-9012-3456', idPhotoName: 'joshua-philsys.png', source: 'online', daysAgo: 6, outcome: 'Approved' },
  { fullName: 'Rhea Castillo', email: 'rhea.castillo@gmail.com', contactNumber: '0921 555 0145', birthDate: '1996-05-27', barangay: 'Pulong Buhangin', completeAddress: '33 Kalayaan St.', landmark: 'Near Pulong Buhangin Market', planId: 'pro', idType: "Voter's ID", idNumber: '1234-5678A-B123', idPhotoName: 'rhea-voters-id.jpg', source: 'online', daysAgo: 4, outcome: 'Pending' },
  { fullName: 'Jasmine Ocampo', email: 'jasmine.ocampo@gmail.com', contactNumber: '0922 555 0168', birthDate: '1998-05-14', barangay: 'Poblacion', completeAddress: '123 Mabini St.', landmark: 'Near Sta. Maria Public Market', planId: 'power', idType: "Driver's License", idNumber: 'N01-23-456780', idPhotoName: 'jasmine-license.jpg', source: 'online', daysAgo: 2, outcome: 'Pending' },
  { fullName: 'Bea Soriano', email: 'bea.soriano@gmail.com', contactNumber: '0923 555 0190', birthDate: '2000-12-01', barangay: 'Lalakhan', completeAddress: '5 Mapagmahal St.', landmark: 'Near Lalakhan Chapel', planId: 'stream', idType: 'TIN ID', idNumber: '123-456-789-000', idPhotoName: 'bea-tin.jpg', source: 'online', daysAgo: 1, outcome: 'Pending' },
  { fullName: 'Miguel Torres', email: 'miguel.torres@gmail.com', contactNumber: '0924 555 0103', birthDate: '1983-01-22', barangay: 'Santa Cruz', completeAddress: '60 Quezon St.', landmark: 'Near Santa Cruz Elementary School', planId: 'ultimate', idType: 'SSS ID', idNumber: '33-1234567-8', idPhotoName: 'miguel-sss.jpg', source: 'online', daysAgo: 0, outcome: 'Pending' },
];

/**
 * seedDatabase — empty every table and load the sample data.
 * Runs once when the page opens (app.js). Time O(n log n) overall for the
 * sorted inserts of bills · Space O(n)
 */
function seedDatabase() {
  arrayClear(applications);
  arrayClear(subscribers);
  arrayClear(bills);
  arrayClear(payments);
  arrayClear(tickets);
  arrayClear(staffMembers);
  arrayClear(registrations);
  arrayClear(activityLog);
  counters.reference = 4870;
  counters.ticket = 98;
  counters.payment = 0;
  counters.staff = 0;
  counters.registration = 0;

  seedStaffMembers();
  rebuildStaffEmailIndex();
  seedApplicationsAndSubscribers();
  seedBills();
  seedPayments();
  seedTickets();
  seedRegistrations();
  seedActivity();

  clearUndoHistory();
  databaseState.changed = false;
}

/** seedStaffMembers — the five staff accounts (passwords are stored hashed). */
function seedStaffMembers() {
  for (let i = 0; i < SEED_STAFF.length; i++) {
    const seed = SEED_STAFF[i];
    counters.staff = counters.staff + 1;
    const id = formatStaffId(counters.staff);
    const signIn = seed.lastSignInDaysAgo === 0 ? minutesAgoISO(35) : atTime(addDaysISO(todayISO(), -seed.lastSignInDaysAgo), 17, 40);
    arrayAppend(staffMembers, {
      id: id,
      fullName: seed.fullName,
      email: seed.email,
      role: seed.role,
      status: seed.status,
      startDate: seed.startDate,
      lastSignIn: signIn,
      passwordHash: hashPassword(seed.password, id),
      passwordSalt: id,
      mustChangePassword: false,
    });
  }
}

/** seedTime — the date `daysAgo` days before today at a fixed time (never in the future). */
function seedTime(daysAgo, hour, minute) {
  if (daysAgo <= 0) {
    return minutesAgoISO(95);
  }
  return atTime(addDaysISO(todayISO(), -daysAgo), hour, minute);
}

/** seedApplicationsAndSubscribers — 16 applications; the completed ones become subscribers. */
function seedApplicationsAndSubscribers() {
  const today = todayISO();
  for (let i = 0; i < SEED_APPLICANTS.length; i++) {
    const seed = SEED_APPLICANTS[i];
    const submittedAt = seedTime(seed.daysAgo, 8 + (i % 9), (i * 7) % 60);
    counters.reference = counters.reference + 1;
    const referenceNo = formatReferenceNo(parseISODate(submittedAt).year, counters.reference);
    const submittedBy = seed.source === 'walk-in' ? 'Juan Dela Cruz (walk-in)' : 'Online form';

    const app = {
      referenceNo: referenceNo,
      fullName: seed.fullName,
      email: seed.email,
      contactNumber: seed.contactNumber,
      birthDate: seed.birthDate,
      city: SERVICE_CITY,
      barangay: seed.barangay,
      completeAddress: seed.completeAddress,
      landmark: seed.landmark,
      planId: seed.planId,
      customPrice: null,
      idType: seed.idType,
      idNumber: seed.idNumber,
      idPhotoName: seed.idPhotoName,
      status: 'Pending',
      submittedAt: submittedAt,
      source: seed.source,
      notes: '',
      installDate: null,
      installSlot: null,
      rejectReason: '',
      history: [{ status: 'Pending', at: submittedAt, by: submittedBy, note: seed.source === 'walk-in' ? 'Walk-in application at the office' : 'Application received online' }],
    };

    const day1 = addDaysISO(datePart(submittedAt), 1);
    if (seed.outcome === 'Rejected') {
      app.status = 'Rejected';
      app.rejectReason = 'Outside the coverage area';
      app.notes = 'Brgy. ' + seed.barangay + ' has no fiber line yet. Customer added to the waitlist.';
      arrayAppend(app.history, { status: 'Rejected', at: atTime(day1, 11, 5), by: 'Juan Dela Cruz', note: 'Outside the coverage area' });
    }
    if (seed.outcome === 'Approved' || seed.outcome === 'For Installation' || seed.outcome === 'Completed') {
      app.status = 'Approved';
      arrayAppend(app.history, { status: 'Approved', at: atTime(day1, 10, 15), by: i % 2 === 0 ? 'Maria Santos' : 'Juan Dela Cruz', note: 'Documents verified' });
    }
    if (seed.outcome === 'For Installation' || seed.outcome === 'Completed') {
      const installDate = seed.outcome === 'Completed' ? addDaysISO(datePart(submittedAt), 4) : addDaysISO(today, seed.installInDays);
      const slot = INSTALL_SLOTS[seed.slot === undefined ? 0 : seed.slot];
      app.status = 'For Installation';
      app.installDate = installDate;
      app.installSlot = slot;
      arrayAppend(app.history, { status: 'For Installation', at: atTime(day1, 15, 40), by: 'Maria Santos', note: 'Installation set for ' + formatDate(installDate) + ', ' + slot });
    }
    if (seed.outcome === 'Completed') {
      const installedAt = atTime(app.installDate, 14, 20);
      app.status = 'Completed';
      arrayAppend(app.history, { status: 'Completed', at: installedAt, by: 'Paolo Reyes', note: 'Installed and connected' });
      sortedInsert(subscribers, 'accountNo', {
        accountNo: referenceNo,
        fullName: app.fullName,
        email: app.email,
        contactNumber: app.contactNumber,
        barangay: app.barangay,
        completeAddress: app.completeAddress,
        landmark: app.landmark,
        planId: app.planId,
        customPrice: null,
        status: seed.account,
        since: installedAt,
        statusChangedAt: seed.account === 'Active' ? installedAt : null,
        applicationRef: referenceNo,
      });
    }
    arrayAppend(applications, app);
  }
}

/**
 * seedBills — every month's bill from each subscriber's first month to now.
 * Past bills are paid, except for the late payers who show the overdue flow;
 * two customers pay early. Kristine Ramos has one overdue bill (and reports a
 * payment for it); Patricia Gonzales has two, which is why she is suspended.
 */
function seedBills() {
  const today = todayISO();
  const clock = readClock();
  for (let s = 0; s < subscribers.length; s++) {
    const subscriber = subscribers[s];
    const since = parseISODate(subscriber.since);
    const personal = [];
    let terminatedOn = null;
    if (subscriber.status === 'Terminated') {
      terminatedOn = addDaysISO(today, -20);
      subscriber.statusChangedAt = atTime(terminatedOn, 16, 10);
    }
    let cursor = { year: since.year, month: since.month };
    while (cursor.year < clock.year || (cursor.year === clock.year && cursor.month <= clock.month)) {
      const period = billingPeriod(subscriber, cursor.year, cursor.month);
      if (terminatedOn && period.periodStart >= terminatedOn) {
        break;
      }
      arrayAppend(personal, {
        billId: makeBillId(cursor.year, cursor.month, subscriber.accountNo),
        accountNo: subscriber.accountNo,
        billingYear: cursor.year,
        billingMonth: cursor.month,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        dueDate: period.dueDate,
        amount: planPrice(subscriber.planId, subscriber.customPrice),
        status: 'Unpaid',
        paidOn: null,
        paymentRef: '',
        createdAt: atTime(period.periodStart, 7, 0),
      });
      cursor = addMonths(cursor.year, cursor.month, 1);
    }

    const name = subscriber.fullName;
    let pastDueSeen = 0;
    for (let b = personal.length - 1; b >= 0; b--) {   // newest bill first
      const bill = personal[b];
      const isPastDue = bill.dueDate < today;
      if (isPastDue) {
        pastDueSeen++;
        const stayUnpaid = (name === 'Kristine Ramos' && pastDueSeen === 1) || (name === 'Patricia Gonzales' && pastDueSeen <= 2);
        if (!stayUnpaid) {
          bill.status = 'Paid';
          bill.paidOn = addDaysISO(bill.dueDate, -2);
        }
      } else if ((name === 'Carlo Mendoza' || name === 'Angelica Cruz') && bill.periodStart <= today) {
        bill.status = 'Paid';
        bill.paidOn = addDaysISO(bill.periodStart, 1) <= today ? addDaysISO(bill.periodStart, 1) : today;
      }
    }

    if (name === 'Patricia Gonzales') {
      // Suspended a week after her second missed due date; no bills after that.
      let suspendedOn = today;
      for (let b = 0; b < personal.length; b++) {
        if (personal[b].status === 'Unpaid' && personal[b].dueDate < today) {
          suspendedOn = addDaysISO(personal[b].dueDate, 7) < today ? addDaysISO(personal[b].dueDate, 7) : today;
        }
      }
      subscriber.statusChangedAt = atTime(suspendedOn, 9, 30);
      for (let b = 0; b < personal.length; b++) {
        if (personal[b].periodStart <= suspendedOn) {
          sortedInsert(bills, 'billId', personal[b]);
        }
      }
    } else {
      for (let b = 0; b < personal.length; b++) {
        sortedInsert(bills, 'billId', personal[b]);
      }
    }
  }
}

/**
 * seedPayments — one confirmed GCash payment, then four reports waiting in the
 * validation queue (oldest first). Kristine's passes every check; each of the
 * others breaks one rule, so the Payments page can show every kind of failure:
 * Liza also paid the same bill at the office, Patricia sent less than her bill,
 * and Mark typed a GCash reference number that was already used.
 */
function seedPayments() {
  const usedReference = '5012873246119';
  const angelica = findSubscriberByName('Angelica Cruz');
  const angelicaBill = angelica ? newestBillWithStatus(angelica.accountNo, 'Paid') : null;
  if (angelicaBill) {
    const payment = seedPaymentReport(angelica, angelicaBill, angelicaBill.amount, 'GCash', usedReference, notInFuture(atTime(angelicaBill.paidOn, 19, 12), 50));
    payment.status = 'Confirmed';
    payment.reviewedBy = 'Juan Dela Cruz';
    payment.reviewedAt = notInFuture(atTime(angelicaBill.paidOn, 20, 3), 20);
    angelicaBill.paymentRef = payment.paymentId;
  }
  const kristine = findSubscriberByName('Kristine Ramos');
  const kristineBill = kristine ? newestOverdueBill(kristine.accountNo) : null;
  if (kristineBill) {
    seedPaymentReport(kristine, kristineBill, kristineBill.amount, 'GCash', '7204519833102', seedTime(1, 19, 40));
  }
  const liza = findSubscriberByName('Liza Fernandez');
  const lizaBill = liza ? newestBillWithStatus(liza.accountNo, 'Unpaid') : null;
  if (lizaBill) {
    seedPaymentReport(liza, lizaBill, lizaBill.amount, 'Maya', '4F7K2M9Q1T8B', seedTime(1, 20, 15));
    lizaBill.status = 'Paid'; // …and this morning she paid the same bill at the office
    lizaBill.paidOn = todayISO();
    lizaBill.paymentRef = 'Office payment';
  }
  const patricia = findSubscriberByName('Patricia Gonzales');
  const patriciaBill = patricia ? newestOverdueBill(patricia.accountNo) : null;
  if (patriciaBill) {
    seedPaymentReport(patricia, patriciaBill, patriciaBill.amount - 200, 'GCash', '8830146527015', seedTime(1, 21, 5));
  }
  const mark = findSubscriberByName('Mark Bautista');
  const markBill = mark ? newestBillWithStatus(mark.accountNo, 'Unpaid') : null;
  if (markBill) {
    seedPaymentReport(mark, markBill, markBill.amount, 'GCash', usedReference, seedTime(0, 0, 0));
  }
  rebuildPaymentReferenceIndex();
}

/** seedPaymentReport — append one report (ids only grow, so the table stays sorted). O(1) */
function seedPaymentReport(subscriber, bill, amount, method, referenceCode, submittedAt) {
  counters.payment = counters.payment + 1;
  const payment = {
    paymentId: formatPaymentId(counters.payment), accountNo: subscriber.accountNo, billId: bill.billId, fullName: subscriber.fullName,
    amount: amount, method: method, referenceCode: referenceCode, submittedAt: submittedAt,
    status: 'For verification', reviewedBy: '', reviewedAt: null, note: '',
  };
  arrayAppend(payments, payment);
  return payment;
}

/** findSubscriberByName — linear search by full name (used only by the sample data). O(n) */
function findSubscriberByName(fullName) {
  const index = linearSearch(subscribers, 'fullName', fullName);
  return index === -1 ? null : subscribers[index];
}

/** newestBillWithStatus — the latest bill of an account with the given status. O(n) */
function newestBillWithStatus(accountNo, status) {
  let newest = null;
  for (let i = 0; i < bills.length; i++) {
    if (bills[i].accountNo === accountNo && bills[i].status === status) {
      if (newest === null || bills[i].periodStart > newest.periodStart) {
        newest = bills[i];
      }
    }
  }
  return newest;
}

/** newestOverdueBill — the latest unpaid bill of an account that is past its due date. O(n) */
function newestOverdueBill(accountNo) {
  const today = todayISO();
  let newest = null;
  for (let i = 0; i < bills.length; i++) {
    const bill = bills[i];
    if (bill.accountNo === accountNo && bill.status === 'Unpaid' && bill.dueDate < today) {
      if (newest === null || bill.periodStart > newest.periodStart) {
        newest = bill;
      }
    }
  }
  return newest;
}

/** seedTickets — four support tickets in every state. */
function seedTickets() {
  const liza = findSubscriberByName('Liza Fernandez');
  const ramon = findSubscriberByName('Ramon Villareal');
  const angelica = findSubscriberByName('Angelica Cruz');
  const samples = [
    { fullName: 'Arnel Dominguez', contactNumber: '0928 555 0110', email: 'arnel.dominguez@gmail.com', accountNo: '', category: 'Other', message: 'Is fiber already available in Brgy. Lalakhan? We would like to apply for the Power plan.', createdAt: seedTime(3, 9, 20), status: 'Resolved', assignedTo: 'Paolo Reyes', startedAt: seedTime(3, 10, 2), resolution: 'Lalakhan is still being surveyed. Customer added to the waitlist and will be called once available.', resolvedAt: seedTime(3, 10, 25) },
    { fullName: 'Liza Fernandez', contactNumber: '0917 555 0141', email: 'liza.fernandez@gmail.com', accountNo: liza ? liza.accountNo : '', category: 'Billing', message: 'Please send a copy of my last statement to my e-mail for my records.', createdAt: seedTime(1, 13, 5), status: 'In progress', assignedTo: 'Paolo Reyes', startedAt: seedTime(1, 14, 30), resolution: '', resolvedAt: null },
    { fullName: 'Ramon Villareal', contactNumber: '0918 555 0172', email: 'ramon.villareal@yahoo.com', accountNo: ramon ? ramon.accountNo : '', category: 'No connection', message: 'The LOS light on our modem has been blinking red since this morning. No internet at all.', createdAt: minutesAgoISO(300), status: 'Open', assignedTo: '', startedAt: null, resolution: '', resolvedAt: null },
    { fullName: 'Angelica Cruz', contactNumber: '0966 555 0188', email: 'angelica.cruz@gmail.com', accountNo: angelica ? angelica.accountNo : '', category: 'Slow connection', message: 'Our speed drops to around 5 Mbps every night from 8 to 11 PM.', createdAt: minutesAgoISO(120), status: 'Open', assignedTo: '', startedAt: null, resolution: '', resolvedAt: null },
  ];
  for (let i = 0; i < samples.length; i++) {
    counters.ticket = counters.ticket + 1;
    const ticket = samples[i];
    ticket.ticketNo = formatTicketNo(counters.ticket);
    arrayAppend(tickets, ticket);
  }
}

/** seedRegistrations — the staff access requests (passwords stored as salted hashes). */
function seedRegistrations() {
  for (let i = 0; i < SEED_REGISTRATIONS.length; i++) {
    const seed = SEED_REGISTRATIONS[i];
    counters.registration = counters.registration + 1;
    const id = formatRegistrationId(counters.registration);
    const member = seed.outcome === 'Approved' ? findStaffByEmail(seed.email) : null;
    arrayAppend(registrations, {
      registrationId: id,
      fullName: seed.fullName,
      email: seed.email,
      mobile: seed.mobile,
      role: seed.role,
      note: seed.note,
      passwordHash: hashPassword(seed.password, id),
      passwordSalt: id,
      status: seed.outcome,
      submittedAt: seed.submittedAt || seedTime(seed.daysAgo, seed.hour, seed.minute),
      reviewedBy: seed.reviewedBy || '',
      reviewedAt: seed.reviewedAt || (seed.outcome === 'Rejected' ? seedTime(seed.reviewDaysAgo, 9, 10) : null),
      rejectReason: seed.reason || '',
      staffId: member ? member.id : '',
    });
  }
}

/**
 * seedActivity — build the recent-activity feed from the sample records
 * (last 10 days), then order it by time with insertion sort.
 */
function seedActivity() {
  const since = addDaysISO(todayISO(), -10);
  const events = [];
  for (let i = 0; i < applications.length; i++) {
    const app = applications[i];
    for (let h = 0; h < app.history.length; h++) {
      const step = app.history[h];
      if (datePart(step.at) < since) {
        continue;
      }
      let message = '';
      if (step.status === 'Pending') {
        message = (app.source === 'walk-in' ? 'Walk-in application ' : 'New online application ') + app.referenceNo + ' from ' + app.fullName;
      } else if (step.status === 'Approved') {
        message = 'Approved ' + app.referenceNo + ' (' + app.fullName + ')';
      } else if (step.status === 'For Installation') {
        message = 'Scheduled installation for ' + app.referenceNo + ' on ' + formatDate(app.installDate);
      } else if (step.status === 'Rejected') {
        message = 'Rejected ' + app.referenceNo + ' (' + app.fullName + ')';
      } else {
        message = 'Installed ' + app.referenceNo + ' — new subscriber ' + app.fullName;
      }
      arrayAppend(events, { at: step.at, kind: 'application', message: message, actor: textStartsWith(step.by, 'Online') ? 'Customer' : step.by });
    }
  }
  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i];
    if (datePart(ticket.createdAt) >= since) {
      arrayAppend(events, { at: ticket.createdAt, kind: 'ticket', message: 'New ticket ' + ticket.ticketNo + ' — ' + ticket.category + ' (' + ticket.fullName + ')', actor: 'Customer' });
    }
    if (ticket.startedAt && datePart(ticket.startedAt) >= since) {
      arrayAppend(events, { at: ticket.startedAt, kind: 'ticket', message: 'Started working on ' + ticket.ticketNo, actor: ticket.assignedTo });
    }
    if (ticket.resolvedAt && datePart(ticket.resolvedAt) >= since) {
      arrayAppend(events, { at: ticket.resolvedAt, kind: 'ticket', message: 'Resolved ' + ticket.ticketNo, actor: ticket.assignedTo });
    }
  }
  for (let i = 0; i < payments.length; i++) {
    const payment = payments[i];
    if (datePart(payment.submittedAt) >= since) {
      arrayAppend(events, { at: payment.submittedAt, kind: 'payment', message: 'Payment ' + payment.paymentId + ' reported by ' + payment.fullName + ' (' + formatPeso(payment.amount) + ' via ' + payment.method + ')', actor: 'Customer' });
    }
  }
  for (let i = 0; i < bills.length; i++) {
    const bill = bills[i];
    if (bill.paymentRef === 'Office payment' && bill.paidOn >= since) {
      const subscriber = findSubscriber(bill.accountNo);
      arrayAppend(events, { at: bill.paidOn === todayISO() ? minutesAgoISO(40) : atTime(bill.paidOn, 10, 0), kind: 'billing', message: 'Settled ' + formatMonthYear(bill.billingYear, bill.billingMonth) + ' bill of ' + (subscriber ? subscriber.fullName : bill.accountNo) + ' at the office (' + formatPeso(bill.amount) + ')', actor: 'Juan Dela Cruz' });
    }
  }
  for (let i = 0; i < registrations.length; i++) {
    const request = registrations[i];
    if (datePart(request.submittedAt) >= since) {
      arrayAppend(events, { at: request.submittedAt, kind: 'staff', message: 'Staff registration ' + request.registrationId + ' from ' + request.fullName + ' (' + request.role + ')', actor: request.fullName });
    }
    if (request.reviewedAt && datePart(request.reviewedAt) >= since) {
      arrayAppend(events, { at: request.reviewedAt, kind: 'staff', message: (request.status === 'Approved' ? 'Approved' : 'Rejected') + ' registration ' + request.registrationId + ' (' + request.fullName + ')', actor: request.reviewedBy });
    }
  }
  const ordered = insertionSort(events, 'at', 'asc');
  for (let i = 0; i < ordered.length; i++) {
    arrayAppend(activityLog, ordered[i]);
  }
}
