# E3 Fiber Connect

A complete website for **E3 Fiber Connect**, a fiber internet provider in Santa Maria, Bulacan — built for a
Data Structures & Algorithms project with **HTML, CSS, Bootstrap 5 and plain JavaScript** (JavaScript is the
"backend"). The interface follows Apple's design language: system typography, translucent materials, large
rounded surfaces, sheets and a dark mode.

## Open it

Double-click **`index.html`**. That's it — no server, no install, and it works offline.
(A local server such as VS Code *Live Server* works too.)

**Staff demo accounts** (also one tap away on the sign-in screen):

| Role | E-mail | Password |
|---|---|---|
| Owner | `maria.santos@e3fiberconnect.ph` | `owner123` |
| Admin | `juan.delacruz@e3fiberconnect.ph` | `e3admin` |
| Support | `paolo.reyes@e3fiberconnect.ph` | `support123` |

**Staff registration demo:** on the sign-in page choose *Request staff access* to send a new request, or use
the sample requests already waiting for approval:

| Request | E-mail | Password | Status |
|---|---|---|---|
| REG-000003 | `lorenzo.pascual@e3fiberconnect.ph` | `lorenzo2026` | Pending — Admin access |
| REG-000004 | `trisha.manalo@e3fiberconnect.ph` | `trisha2026` | Pending — Support access |
| REG-000002 | `kevin.aquino@e3fiberconnect.ph` | `kevin2026` | Rejected |

Signing in with a pending or rejected request explains its status. After an Owner or Admin approves it on
**Registrations**, the same e-mail and password open the admin app.

**Customer demo:** the Pay Bills page shows a sample account number and mobile number with a *Fill in* button;
the Track page has a *Try the sample* link. **Payments** starts with four reports in the validation queue: the
first passes all five checks, and each of the other three fails one (bill already paid, amount short, reference
number already used).

## How the "backend" works

- **Arrays are the database.** Applications, subscribers, bills, payments, support tickets, staff, staff
  registrations and the activity log are plain JavaScript arrays (`assets/js/backend/database.js`).
- **One page, many screens.** Arrays live in memory, and memory is wiped whenever a browser opens a new page —
  data can't transfer between separate HTML files. So the whole site is a single `index.html`: moving between
  screens only shows and hides sections (the part after `#` in the address picks the screen, e.g.
  `#/admin/applications`). Everything you do stays in the arrays for the whole visit; **reloading starts again
  from the sample data** (the site warns you before a reload if you changed something).
- **Sample data is generated relative to today**, so bills are always "due this week", "overdue", etc.

## Project rules

1. **Procedural, not object-oriented** — only functions and plain records. No `class`, no `this`, no methods on data.
2. **No built-in helpers for data work.** The code never calls `push`, `pop`, `shift`, `unshift`, `splice`,
   `slice`, `concat`, `sort`, `reverse`, `indexOf`, `includes`, `find`, `filter`, `map`, `forEach`, `reduce`,
   `join`, `split`, `replace`, `trim`, `toLowerCase` or regular expressions. Hand-written versions live in
   `assets/js/dsa/`, each with its time and space complexity.
3. **Searching, sorting, stacks and queues are written by hand** — linear and binary search; bubble, selection
   and insertion sort; stacks (Undo, Back button, dialogs); queues (review, support, payment validation, staff
   requests, notifications); plus hash tables for staff e-mails and payment reference numbers.

See **[docs/DSA-GUIDE.md](docs/DSA-GUIDE.md)** for every structure and algorithm, where it runs, its complexity,
and a step-by-step demo script for the class presentation. The admin **Algorithms** page shows the live data
structures, a log of every search and sort, and a benchmark that races the algorithms.

## Screens

| Public website | Admin app (`#/admin`) |
|---|---|
| Home — hero, plans, how it works | Sign in (5 wrong tries → 30-second pause) · Request staff access |
| Plans — recommender, sorting, comparison table | Dashboard — review queue, installs, billing, support, activity |
| Coverage — barangay search with suggestions | Applications — filter, search, choose the sorting algorithm |
| Apply — 5-step application with live validation | Application — approve, reject, schedule, create account, notes, timeline |
| Application received — reference number | New walk-in application (custom price option) |
| Track — status timeline (personal details masked) | Subscribers + subscriber detail (plan change, suspend, settle) |
| Pay Bills — balance, bills, report a payment (amount + reference) | Billing — month view, generate bills, overdue bills |
| Support — FAQ, send a message, check a ticket | Payments — validation queue, 5 checks, confirm / decline |
| 404 page | Support — FIFO ticket queue, serve next, resolve |
| | Staff — add (temporary password), suspend, reset, delete |
| | Registrations — approval queue for staff requests, approve / reject |
| | Activity — log + the Undo stack · Algorithms · Account (change password) |

**Flow in one sentence:** a customer applies → tracks the application → staff approve, schedule and install it and
create the subscriber account → bills are generated → the customer reports a payment → staff validate and confirm it.
New employees request staff access, and an Owner or Admin approves them.
Every admin action can be undone (Undo button, the toast's *Undo*, or Ctrl/⌘ + Z).

## Folder structure

```
index.html                  the whole website (all screens, dialogs and the icon set)
assets/
  css/app.css               design system on top of Bootstrap (light + dark, motion, accessibility)
  js/dsa/                   hand-written data structures & algorithms (arrays, strings, stack, queue,
                            hash table, search, sort, operation counters)
  js/backend/               the "backend": database arrays + business rules (applications, billing …)
  js/ui/                    page helpers: router (back stack), sheets, toasts (queue), forms, components
  js/views/public/          one script per public screen
  js/views/admin/           one script per admin screen
  js/app.js                 start-up: sample data → route table → first screen
  img/                      logos
  vendor/bootstrap/         Bootstrap 5.3.8 (CSS + the bundle, used for the FAQ accordion)
docs/
  DSA-GUIDE.md              data structures, algorithms, complexity and demo script
  E3-Fiber-Connect-Defense-Reviewer.pdf
                            the defense reviewer: every module (input → process → output, complexity,
                            justification, demonstration, code walkthrough), grouped by team member
  reviewer/                 the reviewer's HTML source and screenshots (print it again from any browser)
  figma/                    renders of the original (v1) Figma design, for reference
```

Scripts are plain `<script>` files loaded in order (DSA → backend → UI → screens → app), so the site runs from
`file://` without any build step.

## Design notes

- System font (SF Pro on Apple devices, Segoe UI on Windows) with size-specific letter spacing.
- Translucent navigation bar, sidebar drawer and notification HUD (`backdrop-filter`), with solid fallbacks.
- Sheets open centred on computers and slide up from the bottom on phones, where they can be dragged down to
  close (spring physics with velocity hand-off, `assets/js/ui/spring.js`).
- Buttons respond on press; confirmations use a toast with *Undo* instead of "Are you sure?" pop-ups —
  those are kept for actions that are hard to take back (terminating an account, deleting staff).
- Opens in **light mode**; the moon/sun button (site navigation, staff toolbar and sign-in page,
  `assets/js/ui/theme.js`) switches to dark mode. Like the data, the choice lives in memory, so a
  reload starts light again. Respects *reduce motion*, *reduce transparency* and *increase contrast*.
  Tables turn into cards on phones and tablets.

## Data privacy (RA 10173)

The site is designed to comply with the **Data Privacy Act of 2012 (Republic Act No. 10173)**:

- A full **Privacy Notice** (`#/privacy`, linked from the footer and every form): who controls the data and how to reach
  the Data Protection Officer, what each form collects and why, the lawful basis for each (Sec. 12–13), security
  measures (Sec. 20), sharing, retention, the rights of data subjects (Sec. 16–18), breach notification within
  72 hours (NPC Circular 16-03) and the National Privacy Commission.
- **Consent**: the online application asks for informed consent (with a link to the notice); walk-in applications
  require staff to confirm the customer agreed. The time of consent is stored with each application (`consentAt`).
- Short privacy notes on the support, payment and staff-request forms, a dismissible privacy bar, a compliance
  statement in the footer, and a confidentiality reminder for staff at sign-in and in the staff sidebar.
- No cookies, trackers or storage — as a class demo, everything stays in the browser’s memory.

## Security notes (it's a demo)

User text is always escaped before it reaches the page. Passwords are stored as a salted hash, but the hash
function is a simple teaching hash, and — as with any front-end-only site — anyone can open the browser's
developer tools. A real deployment would keep the data and the sign-in on a server.

## Credits

Bootstrap © The Bootstrap Authors (MIT License, `assets/vendor/bootstrap/LICENSE`).
