# Encrypted Browser Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encrypt all locally persisted Ivriyomhuledet birthday and Google calendar state behind a visitor-supplied passphrase while preserving the existing static deployment and user experience.

**Architecture:** A new `secure-storage.js` module owns Web Crypto, the versioned ciphertext envelope, in-memory key state, legacy migration, and reset behavior. `app.js` becomes an asynchronous, transactional consumer of that vault, while `google-calendar.js` receives and returns calendar identifiers without touching browser storage. An accessible vault dialog gates the existing interface, and a restrictive meta CSP limits executable third-party code to Google Identity Services.

**Tech Stack:** Static HTML/CSS, browser ES modules, Web Crypto API, PBKDF2-HMAC-SHA-256, AES-256-GCM, Node.js `assert` verification scripts, GitHub Actions, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-03-encrypted-browser-storage-design.md`

## Global Constraints

- Production remains the static `dist/` directory; no framework or build step is introduced.
- Use PBKDF2-HMAC-SHA-256 with exactly 600,000 iterations, a random 16-byte salt, and AES-256-GCM with a fresh random 12-byte IV for every write.
- The passphrase must contain at least 12 Unicode code points and at least one non-whitespace character.
- The passphrase, derived `CryptoKey`, Google access token, client secret, and refresh token must never enter persistent storage, URLs, logs, or source code.
- Persist all application state only under `ivriyomhuledet.vault.v1`; the two legacy keys exist only for migration.
- Never fall back to plaintext if Web Crypto, encryption, storage, or migration fails.
- Keep the current Google scope `https://www.googleapis.com/auth/calendar.app.created` and keep its access token in memory only.
- Preserve 20 explicit birthday events per person and all existing Hebrew-date behavior.
- Preserve the current RTL design, responsive behavior, accessibility features, public GitHub repository, GitHub Pages URL, and `.openai/hosting.json` project ID.
- Do not claim formal security certification.

## File Structure

- Create `dist/secure-storage.js`: cryptographic primitives, envelope and payload validation, stateful unlocked vault, migration, lock, and reset.
- Create `scripts/verify-secure-storage.mjs`: deterministic tests for encryption, integrity, wrong passphrases, IV uniqueness, transactional persistence, migration, and reset.
- Modify `scripts/verify.mjs`: run the secure-storage suite and verify CSP, vault markup, legal copy, and absence of direct Google-module storage access.
- Modify `dist/google-calendar.js`: remove its local-storage dependency and accept the calendar identifier through its public sync interface.
- Modify `dist/index.html`: add CSP, vault dialog, locked shell state, lock control, and explanatory Hebrew copy.
- Modify `dist/styles.css`: style the vault states and preserve keyboard, mobile, focus, and reduced-motion behavior.
- Modify `dist/app.js`: async vault bootstrap, transactional encrypted saves, lock/reset lifecycle, and encrypted calendar-ID updates.
- Modify `dist/privacy.html`: describe encryption, in-memory decryption, forgotten-passphrase behavior, and threat limitations.
- Modify `dist/accessibility.html`: document the new accessible unlock and reset controls without asserting certification.

---

### Task 1: Authenticated cryptographic envelope

**Files:**
- Create: `dist/secure-storage.js`
- Create: `scripts/verify-secure-storage.mjs`
- Modify: `scripts/verify.mjs:1-8`

**Interfaces:**
- Produces: `deriveVaultKey(passphrase, salt, cryptoImpl) -> Promise<CryptoKey>`
- Produces: `sealVaultData(data, key, salt, cryptoImpl) -> Promise<VaultEnvelope>`
- Produces: `openVaultData(envelope, key, cryptoImpl) -> Promise<VaultData>`
- Produces: `validatePassphrase(passphrase) -> string`
- Produces constants: `VAULT_STORAGE_KEY`, `LEGACY_PEOPLE_KEY`, `LEGACY_CALENDAR_KEY`, `PBKDF2_ITERATIONS`, `MIN_PASSPHRASE_LENGTH`
- Consumes: standards-compliant `crypto.getRandomValues()` and `crypto.subtle`.

- [ ] **Step 1: Create the failing crypto tests**

Create `scripts/verify-secure-storage.mjs` with a callable suite and explicit test data:

```js
import assert from "node:assert/strict";
import {
  MIN_PASSPHRASE_LENGTH,
  PBKDF2_ITERATIONS,
  deriveVaultKey,
  openVaultData,
  sealVaultData,
  validatePassphrase,
} from "../dist/secure-storage.js";

const sampleData = {
  version: 1,
  people: [{
    id: "person-1",
    name: "נועה בדיקה",
    birth: { yy: 5749, mm: 6, dd: 21 },
    reminder: "evening",
  }],
  googleCalendarId: "private-calendar@group.calendar.google.com",
};

export async function runSecureStorageVerification() {
  assert.equal(PBKDF2_ITERATIONS, 600_000);
  assert.equal(MIN_PASSPHRASE_LENGTH, 12);
  assert.throws(() => validatePassphrase("קצרה"), /12/);
  assert.throws(() => validatePassphrase("            "), /אות/);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveVaultKey("סיסמת בדיקה ארוכה 2026", salt, crypto);
  await assert.rejects(() => crypto.subtle.exportKey("raw", key), /InvalidAccess|extractable/i);

  const envelope = await sealVaultData(sampleData, key, salt, crypto);
  const serialized = JSON.stringify(envelope);
  assert.equal(envelope.version, 1);
  assert.equal(envelope.kdf.iterations, 600_000);
  assert.doesNotMatch(serialized, /נועה בדיקה/);
  assert.doesNotMatch(serialized, /private-calendar/);
  assert.deepEqual(await openVaultData(envelope, key, crypto), sampleData);

  const second = await sealVaultData(sampleData, key, salt, crypto);
  assert.notEqual(second.cipher.iv, envelope.cipher.iv, "every write needs a unique IV");

  const wrongKey = await deriveVaultKey("סיסמה אחרת לגמרי 2026", salt, crypto);
  await assert.rejects(() => openVaultData(envelope, wrongKey, crypto));

  const tampered = structuredClone(envelope);
  tampered.ciphertext = `${tampered.ciphertext.slice(0, -2)}AA`;
  await assert.rejects(() => openVaultData(tampered, key, crypto));
}
```

At the top of `scripts/verify.mjs`, import and execute the new suite before existing application assertions:

```js
import { runSecureStorageVerification } from "./verify-secure-storage.mjs";

await runSecureStorageVerification();
```

- [ ] **Step 2: Run the suite and verify the expected failure**

Run: `node scripts/verify.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `dist/secure-storage.js`.

- [ ] **Step 3: Implement the envelope primitives**

Create `dist/secure-storage.js` with these exact constants and data flow:

```js
export const VAULT_STORAGE_KEY = "ivriyomhuledet.vault.v1";
export const LEGACY_PEOPLE_KEY = "ivriyomhuledet.people.v1";
export const LEGACY_CALENDAR_KEY = "ivriyomhuledet.googleCalendarId.v1";
export const PBKDF2_ITERATIONS = 600_000;
export const MIN_PASSPHRASE_LENGTH = 12;

const AAD = new TextEncoder().encode("ivriyomhuledet-vault-envelope-v1");

export function validatePassphrase(passphrase) {
  const value = String(passphrase ?? "").normalize("NFC");
  if ([...value].length < MIN_PASSPHRASE_LENGTH) {
    throw new Error("הסיסמה צריכה לכלול לפחות 12 תווים.");
  }
  if (!/\S/u.test(value)) throw new Error("הסיסמה צריכה לכלול לפחות אות או סימן אחד.");
  return value;
}

export async function deriveVaultKey(passphrase, salt, cryptoImpl = globalThis.crypto) {
  requireCrypto(cryptoImpl);
  const material = await cryptoImpl.subtle.importKey(
    "raw",
    new TextEncoder().encode(validatePassphrase(passphrase)),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return cryptoImpl.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}
```

Implement `sealVaultData()` so it validates `VaultData`, generates a new 12-byte IV, encrypts UTF-8 JSON with `{name: "AES-GCM", iv, additionalData: AAD}`, and returns the exact versioned envelope from the spec. Implement `openVaultData()` so it validates the envelope before allocating decoded buffers, decrypts with the same AAD, parses JSON, validates the payload, and returns a fresh object. Add strict base64 helpers that reject malformed input and a `requireCrypto()` guard that throws a Hebrew unsupported-browser error.

Payload validation must require `version === 1`, an array of people, a string `googleCalendarId`, and valid person records with the existing reminder values `evening`, `morning-before`, `three-days`, or `none`. Envelope validation must require version 1, PBKDF2/SHA-256/600000, AES-GCM, a 16-byte salt, a 12-byte IV, and non-empty ciphertext.

- [ ] **Step 4: Run the tests and verify green**

Run: `node scripts/verify.mjs`

Expected: PASS and the existing Hebrew verification success line.

- [ ] **Step 5: Commit the cryptographic unit**

```bash
git add dist/secure-storage.js scripts/verify-secure-storage.mjs scripts/verify.mjs
git commit -m "Add authenticated browser vault primitives"
```

---

### Task 2: Transactional vault persistence and legacy migration

**Files:**
- Modify: `dist/secure-storage.js`
- Modify: `scripts/verify-secure-storage.mjs`

**Interfaces:**
- Consumes: `deriveVaultKey`, `sealVaultData`, `openVaultData`, and the storage-key constants from Task 1.
- Produces: `createVaultStore({ storage, cryptoImpl }) -> VaultStore`
- Produces methods: `status()`, `create(passphrase, data)`, `migrate(passphrase)`, `unlock(passphrase)`, `save(data)`, `lock()`, `reset()`, `isUnlocked()`.
- Produces statuses: `empty`, `legacy`, `locked`.

- [ ] **Step 1: Add failing lifecycle and migration tests**

Append a deterministic storage double and lifecycle assertions to `runSecureStorageVerification()`:

```js
function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    snapshot: () => Object.fromEntries(values),
  };
}

const storage = memoryStorage();
const store = createVaultStore({ storage, cryptoImpl: crypto });
assert.equal(store.status(), "empty");
await store.create("סיסמת בדיקה ארוכה 2026", sampleData);
assert.equal(store.status(), "locked");
assert.equal(store.isUnlocked(), true);
assert.doesNotMatch(storage.getItem(VAULT_STORAGE_KEY), /נועה בדיקה/);

store.lock();
assert.equal(store.isUnlocked(), false);
await assert.rejects(() => store.save(sampleData), /נעולה/);
await assert.rejects(() => store.unlock("סיסמה שגויה וארוכה 2026"));
assert.deepEqual(await store.unlock("סיסמת בדיקה ארוכה 2026"), sampleData);

const legacyStorage = memoryStorage({
  [LEGACY_PEOPLE_KEY]: JSON.stringify(sampleData.people),
  [LEGACY_CALENDAR_KEY]: sampleData.googleCalendarId,
});
const legacyStore = createVaultStore({ storage: legacyStorage, cryptoImpl: crypto });
assert.equal(legacyStore.status(), "legacy");
assert.deepEqual(await legacyStore.migrate("סיסמת הגירה ארוכה 2026"), sampleData);
assert.equal(legacyStorage.getItem(LEGACY_PEOPLE_KEY), null);
assert.equal(legacyStorage.getItem(LEGACY_CALENDAR_KEY), null);
assert.doesNotMatch(legacyStorage.getItem(VAULT_STORAGE_KEY), /נועה בדיקה|private-calendar/);
```

Extend the Task 1 import with `createVaultStore`, `VAULT_STORAGE_KEY`, `LEGACY_PEOPLE_KEY`, and `LEGACY_CALENDAR_KEY`. Add explicit failure and reset assertions:

```js
const previousEnvelope = storage.getItem(VAULT_STORAGE_KEY);
const failingStorage = {
  getItem: (key) => storage.getItem(key),
  setItem: () => { throw new Error("quota exceeded"); },
  removeItem: (key) => storage.removeItem(key),
};
const failingStore = createVaultStore({ storage: failingStorage, cryptoImpl: crypto });
await failingStore.unlock("סיסמת בדיקה ארוכה 2026");
await assert.rejects(
  () => failingStore.save({ ...sampleData, people: [] }),
  /לא הצלחנו לשמור/
);
assert.equal(storage.getItem(VAULT_STORAGE_KEY), previousEnvelope);

const migrationSeed = {
  [LEGACY_PEOPLE_KEY]: JSON.stringify(sampleData.people),
  [LEGACY_CALENDAR_KEY]: sampleData.googleCalendarId,
};
const failedMigrationStorage = memoryStorage(migrationSeed);
const originalSetItem = failedMigrationStorage.setItem;
failedMigrationStorage.setItem = () => { throw new Error("quota exceeded"); };
const failedMigrationStore = createVaultStore({
  storage: failedMigrationStorage,
  cryptoImpl: crypto,
});
await assert.rejects(() => failedMigrationStore.migrate("סיסמת הגירה ארוכה 2026"));
assert.equal(failedMigrationStorage.getItem(LEGACY_PEOPLE_KEY), migrationSeed[LEGACY_PEOPLE_KEY]);
assert.equal(failedMigrationStorage.getItem(LEGACY_CALENDAR_KEY), migrationSeed[LEGACY_CALENDAR_KEY]);
failedMigrationStorage.setItem = originalSetItem;

legacyStore.reset();
assert.equal(legacyStore.isUnlocked(), false);
assert.equal(legacyStorage.getItem(VAULT_STORAGE_KEY), null);
assert.equal(legacyStorage.getItem(LEGACY_PEOPLE_KEY), null);
assert.equal(legacyStorage.getItem(LEGACY_CALENDAR_KEY), null);
```

- [ ] **Step 2: Run the suite and verify the expected failure**

Run: `node scripts/verify.mjs`

Expected: FAIL because `createVaultStore` is not exported.

- [ ] **Step 3: Implement the stateful vault store**

Add this public constructor shape to `dist/secure-storage.js`:

```js
export function createVaultStore({
  storage = globalThis.localStorage,
  cryptoImpl = globalThis.crypto,
} = {}) {
  let activeKey = null;
  let activeSalt = null;

  return {
    status,
    create,
    migrate,
    unlock,
    save,
    lock,
    reset,
    isUnlocked: () => Boolean(activeKey),
  };
}
```

Implement these rules exactly:

- `status()` returns `locked` when a vault envelope exists, otherwise `legacy` when either legacy key exists, otherwise `empty`.
- `create()` refuses to overwrite an existing vault, derives a new key and salt, transactionally writes and verifies an envelope, and retains only the derived key and salt in closure state.
- `unlock()` derives a candidate key from the envelope salt, opens the envelope, and assigns closure state only after authenticated decryption and payload validation succeed.
- `save()` refuses while locked and uses a fresh IV through `sealVaultData()`.
- Transactional write saves the prior serialized envelope, writes the new serialized value, checks exact read-back, decrypts it as a self-check, and restores the prior value if any step fails.
- `migrate()` parses both legacy values, validates the resulting version-1 payload, writes and verifies the vault, removes and verifies removal of both legacy keys, and never removes either legacy key before the encrypted self-check succeeds.
- `lock()` assigns `null` to both closure references.
- `reset()` locks first, removes all three keys, verifies they are absent, and throws a Hebrew storage error if removal did not succeed.
- All public errors shown to the UI are stable Hebrew messages; raw DOMException details are not logged.

- [ ] **Step 4: Run the tests and verify green**

Run: `node scripts/verify.mjs`

Expected: PASS, including wrong-passphrase, tampering, migration, failed-write rollback, and reset assertions.

- [ ] **Step 5: Commit the vault lifecycle**

```bash
git add dist/secure-storage.js scripts/verify-secure-storage.mjs
git commit -m "Add encrypted vault persistence and migration"
```

---

### Task 3: Remove Google Calendar's browser-storage dependency

**Files:**
- Modify: `dist/google-calendar.js:5-6,76-163`
- Modify: `scripts/verify.mjs:84-126`

**Interfaces:**
- Consumes: optional `calendarId` string supplied by `app.js`.
- Produces: `syncGoogleCalendar(people, { calendarId, onCalendarReady, onProgress })`.
- Produces: `onCalendarReady(calendarId) -> Promise<void>`, awaited before event writes when a new/replacement calendar is created.
- Preserves: return value `{ calendarId, eventCount }`.

- [ ] **Step 1: Write failing tests for injected calendar state**

Change the Google integration portion of `scripts/verify.mjs` to call:

```js
let persistedCalendarId = "";
await connectGoogle("verification.apps.googleusercontent.com");
const syncResult = await syncGoogleCalendar([person], {
  calendarId: "",
  onCalendarReady: async (calendarId) => {
    persistedCalendarId = calendarId;
  },
});
disconnectGoogle();

assert.equal(persistedCalendarId, "verification-calendar");
assert.equal(syncResult.calendarId, "verification-calendar");
```

Read `dist/google-calendar.js` in the verification script and assert:

```js
const googleCalendarSource = await readFile(resolve(root, "dist/google-calendar.js"), "utf8");
assert.doesNotMatch(googleCalendarSource, /localStorage/);
assert.doesNotMatch(googleCalendarSource, /ivriyomhuledet\.googleCalendarId/);
```

Add a second fetch scenario with `calendarId: "missing-calendar"`: GET returns 404, POST creates `replacement-calendar`, and `onCalendarReady` receives the replacement before any event POST occurs. Track ordering explicitly:

```js
const requestOrder = [];
globalThis.fetch = async (url, options = {}) => {
  if (url.includes("/calendars/missing-calendar") && !options.method) {
    requestOrder.push("missing");
    return errorResponse(404, "Not Found");
  }
  if (url.endsWith("/calendars") && options.method === "POST") {
    requestOrder.push("created");
    return jsonResponse({ id: "replacement-calendar" });
  }
  if (url.includes("/calendars/replacement-calendar/events?") && !options.method) {
    return jsonResponse({ items: [] });
  }
  if (url.endsWith("/calendars/replacement-calendar/events") && options.method === "POST") {
    if (!requestOrder.includes("event")) requestOrder.push("event");
    return jsonResponse({ id: "replacement-event" });
  }
  throw new Error(`Unexpected replacement request: ${options.method || "GET"} ${url}`);
};

await connectGoogle("verification.apps.googleusercontent.com");
await syncGoogleCalendar([person], {
  calendarId: "missing-calendar",
  onCalendarReady: async (calendarId) => {
    assert.equal(calendarId, "replacement-calendar");
    requestOrder.push("persisted");
  },
});
disconnectGoogle();
assert.deepEqual(requestOrder.slice(0, 4), ["missing", "created", "persisted", "event"]);
```

Implement `errorResponse(status, message = "")` beside `jsonResponse()` so the mock returns `{ ok: false, status, json: async () => ({ error: { message } }) }`.

- [ ] **Step 2: Run the suite and verify the expected failure**

Run: `node scripts/verify.mjs`

Expected: FAIL because the module still reads and writes `localStorage`, and the callback is not invoked.

- [ ] **Step 3: Refactor calendar creation and recovery**

Change the public call to:

```js
export async function syncGoogleCalendar(
  people,
  { calendarId = "", onCalendarReady, onProgress } = {}
) {
  if (!currentAccessToken) throw new Error("צריך להתחבר ל־Google לפני הסנכרון.");

  const ensured = await ensureCalendar(currentAccessToken, calendarId);
  if (ensured.created || ensured.calendarId !== calendarId) {
    await onCalendarReady?.(ensured.calendarId);
  }
  // Continue with existing event reconciliation using ensured.calendarId.
}
```

Make `ensureCalendar(accessToken, candidateId)` return `{ calendarId, created }`. Validate a candidate with GET, create a replacement only on 404, and propagate every other error. Remove `CALENDAR_STORAGE_KEY` and every `localStorage` call. Await `onCalendarReady` before listing or writing events so `app.js` can persist the identifier inside the vault first.

- [ ] **Step 4: Run the tests and verify green**

Run: `node scripts/verify.mjs`

Expected: PASS with 20 submitted events, correct source URL, no Google-module storage access, and callback ordering confirmed.

- [ ] **Step 5: Commit the decoupled Google integration**

```bash
git add dist/google-calendar.js scripts/verify.mjs
git commit -m "Decouple Google Calendar from browser storage"
```

---

### Task 4: Add the accessible vault gate and CSP

**Files:**
- Modify: `dist/index.html:3-16,17-40,292-309`
- Modify: `dist/styles.css:72-91,1323-1410,1430-1590`
- Modify: `scripts/verify.mjs:60-85`

**Interfaces:**
- Produces DOM IDs: `app-shell`, `lock-vault`, `vault-dialog`, `vault-form`, `vault-title`, `vault-copy`, `vault-passphrase`, `vault-confirm`, `vault-confirm-field`, `vault-submit`, `vault-error`, `vault-reset`, `vault-reset-confirm`, `vault-reset-cancel`, `vault-reset-approve`.
- Consumes: mode changes and event handlers from Task 5.

- [ ] **Step 1: Add failing static-interface and CSP assertions**

Extend `scripts/verify.mjs`:

```js
assert.match(indexHtml, /http-equiv="Content-Security-Policy"/);
assert.match(indexHtml, /id="vault-dialog"/);
assert.match(indexHtml, /id="vault-form"/);
assert.match(indexHtml, /id="vault-passphrase"[^>]+type="password"/);
assert.match(indexHtml, /id="vault-confirm"[^>]+type="password"/);
assert.match(indexHtml, /id="lock-vault"/);
assert.match(indexHtml, /id="app-shell"[^>]+inert/);

const csp = indexHtml.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1] || "";
assert.match(csp, /default-src 'self'/);
assert.match(csp, /object-src 'none'/);
assert.match(csp, /script-src 'self' https:\/\/accounts\.google\.com/);
assert.doesNotMatch(csp, /script-src[^;]*(?:'unsafe-inline'|'unsafe-eval')/);
assert.match(csp, /connect-src[^;]*https:\/\/www\.googleapis\.com/);
```

- [ ] **Step 2: Run the suite and verify the expected failure**

Run: `node scripts/verify.mjs`

Expected: FAIL because the CSP and vault controls are absent.

- [ ] **Step 3: Add the CSP and locked markup**

Add the meta policy before loading CSS or scripts:

```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self'; base-uri 'self'; object-src 'none'; script-src 'self' https://accounts.google.com; connect-src 'self' https://accounts.google.com https://www.googleapis.com; frame-src https://accounts.google.com; img-src 'self' data:; style-src 'self' 'unsafe-inline' https://accounts.google.com; form-action 'self' https://accounts.google.com"
/>
```

Give the existing shell `id="app-shell"`, `inert`, and `aria-hidden="true"`. Wrap the privacy pill and a hidden `lock-vault` button in `.topbar-actions` without changing brand placement.

Add a non-dismissible dialog after the shell. Its form contains visible Hebrew labels, `autocomplete="current-password"` for unlock mode, `autocomplete="new-password"` for create/migration mode, 12-character hints, a hidden confirmation field, an alert region, a submit button, and an inline reset-confirmation panel. Use the Hebrew copy from the spec, including the warning that the site owner cannot recover a forgotten passphrase and that reset does not delete Google data.

- [ ] **Step 4: Add responsive and focus-safe styling**

Add `.vault-dialog`, `.vault-card`, `.vault-illustration`, `.vault-actions`, `.vault-reset-panel`, and `.topbar-actions` styles using the existing color variables and button patterns. Ensure:

- the dialog width is `min(460px, calc(100% - 24px))`;
- the backdrop obscures the locked application without revealing data;
- password inputs inherit existing field focus styles;
- the destructive reset action uses the existing red palette;
- mobile layout stacks actions at `max-width: 650px`;
- no animation remains when `prefers-reduced-motion: reduce` is active.

- [ ] **Step 5: Run the tests and inspect the static dialog**

Run: `node scripts/verify.mjs`

Expected: PASS for the static markup and CSP assertions.

Serve locally with `py -m http.server 8000 --bind 127.0.0.1 --directory dist`. Load `http://127.0.0.1:8000/` in Chrome and verify the locked shell is inert, the dialog is readable at desktop and mobile widths, and Tab focus remains on dialog controls. At this task boundary, controls may not yet unlock; the purpose is markup, focus order, and CSP compatibility.

- [ ] **Step 6: Commit the vault interface**

```bash
git add dist/index.html dist/styles.css scripts/verify.mjs
git commit -m "Add accessible encrypted-vault gate"
```

---

### Task 5: Integrate transactional encrypted state into the application

**Files:**
- Modify: `dist/app.js:1-128,164-193,211-253,574-609`
- Modify: `dist/index.html:15-40,292-330`
- Modify: `scripts/verify.mjs`

**Interfaces:**
- Consumes: `createVaultStore()` from Task 2 and the DOM IDs from Task 4.
- Consumes: `syncGoogleCalendar(..., { calendarId, onCalendarReady, onProgress })` from Task 3.
- Produces internal helpers: `bootstrapVault()`, `setVaultMode(mode)`, `persistState(nextPeople, nextCalendarId)`, `lockApplication()`, `showVaultError(message)`.

- [ ] **Step 1: Add failing source-level integration assertions**

Extend `scripts/verify.mjs` to read `dist/app.js` and assert the intended boundary:

```js
const appSource = await readFile(resolve(root, "dist/app.js"), "utf8");
assert.match(appSource, /createVaultStore/);
assert.match(appSource, /await bootstrapVault\(\)/);
assert.match(appSource, /await vaultStore\.save/);
assert.match(appSource, /calendarId:\s*googleCalendarId/);
assert.match(appSource, /onCalendarReady/);
assert.doesNotMatch(appSource, /localStorage/);
assert.doesNotMatch(appSource, /function loadPeople/);
assert.doesNotMatch(appSource, /function savePeople/);
```

Extend the secure-storage suite with a save-then-reload scenario: create a vault, save a second Hebrew person, lock, instantiate a fresh store over the same storage, unlock, and assert both people are returned.

- [ ] **Step 2: Run the suite and verify the expected failure**

Run: `node scripts/verify.mjs`

Expected: FAIL because `app.js` still owns plaintext local storage and does not bootstrap the vault.

- [ ] **Step 3: Add asynchronous vault bootstrap**

Import `createVaultStore` and replace `let people = loadPeople()` with:

```js
const vaultStore = createVaultStore();
let people = [];
let googleCalendarId = "";

await bootstrapVault();
initializeForm();
renderPeople();
```

`bootstrapVault()` must inspect `vaultStore.status()`, configure the dialog as `create`, `migrate`, or `unlock`, call `showModal()`, prevent the dialog `cancel` event, and resolve only after successful create/migration/unlock. On success it assigns validated data to `people` and `googleCalendarId`, removes `inert` and `aria-hidden` from `app-shell`, closes the dialog, and focuses the name field or main heading.

The vault form submit handler must:

- compare confirmation only in create/migration modes;
- reject passphrases below the shared minimum through the storage module;
- disable its submit button while PBKDF2 runs;
- call the appropriate store method;
- clear both password fields in `finally`;
- show stable Hebrew errors without logging the passphrase or raw exception.

- [ ] **Step 4: Make birthday mutations transactional**

Replace mutation-before-save with save-before-commit:

```js
async function persistState(nextPeople, nextCalendarId = googleCalendarId) {
  await vaultStore.save({
    version: 1,
    people: nextPeople,
    googleCalendarId: nextCalendarId,
  });
  people = nextPeople;
  googleCalendarId = nextCalendarId;
}
```

Make the birthday form and confirm-dialog close handlers `async`. Build immutable `nextPeople` arrays, await `persistState(nextPeople)`, and only then update toasts, forms, and rendering. If saving fails, leave the prior UI state intact and show “השינוי לא נשמר. המידע הקודם נשאר ללא שינוי.”

Delete `STORAGE_KEY`, `loadPeople()`, and `savePeople()` completely.

- [ ] **Step 5: Encrypt the Google calendar identifier**

Call synchronization with:

```js
const result = await syncGoogleCalendar(people, {
  calendarId: googleCalendarId,
  onCalendarReady: async (calendarId) => {
    if (calendarId !== googleCalendarId) {
      await persistState(people, calendarId);
    }
  },
  onProgress: ({ percent, label }) => {
    const visiblePercent = 14 + Math.round(percent * 0.86);
    setSyncing(true, label, visiblePercent);
  },
});
```

Do not store the Google access token. Preserve existing disconnect behavior.

- [ ] **Step 6: Implement lock and reset behavior**

The lock button must call `disconnectGoogle()`, clear rendered people before the shell can be inspected, reset edit/sync state, call `vaultStore.lock()`, set the shell inert/hidden, and return to unlock mode.

The reset-confirmation approval must call `vaultStore.reset()`, clear all in-memory state and rendered people, explain that Google data remains untouched, and switch to create mode. It must not call Google APIs or imply that remote calendars were deleted.

- [ ] **Step 7: Run automated verification**

Run: `node scripts/verify.mjs`

Expected: PASS for encryption, persistence, Google integration, Hebrew dates, 20 events, ICS, accessibility, CSP, and removal of direct plaintext storage.

- [ ] **Step 8: Run participant-view lifecycle verification**

In Chrome at the local server:

1. Create a vault with `סיסמת בדיקה מאובטחת 2026`.
2. Add `בדיקת הצפנה` with Gregorian date `1989-09-21`.
3. Inspect storage read-only and confirm the entered name and date do not appear in the serialized vault.
4. Reload; confirm no name is rendered before unlock.
5. Enter a wrong passphrase; confirm the generic error and unchanged ciphertext.
6. Unlock correctly; confirm `כ״א באלול תשמ״ט` and exactly 20 dates.
7. Lock manually; confirm the list disappears and Google disconnects.
8. Verify the reset warning without approving destructive reset during this check.

- [ ] **Step 9: Commit application integration**

```bash
git add dist/app.js dist/index.html scripts/verify.mjs scripts/verify-secure-storage.mjs
git commit -m "Encrypt persisted birthday and calendar state"
```

---

### Task 6: Update privacy and accessibility disclosures

**Files:**
- Modify: `dist/privacy.html:23-42`
- Modify: `dist/accessibility.html:24-48`
- Modify: `scripts/verify.mjs:60-85`

**Interfaces:**
- Consumes: the completed behavior from Tasks 1-5.
- Produces: accurate user-facing Hebrew disclosure and recovery instructions.

- [ ] **Step 1: Add failing disclosure assertions**

Extend `scripts/verify.mjs`:

```js
assert.match(privacyHtml, /AES-256-GCM/);
assert.match(privacyHtml, /הסיסמה אינה נשלחת/);
assert.match(privacyHtml, /אינה ניתנת לשחזור/);
assert.match(privacyHtml, /תוסף דפדפן|מכשיר/);
assert.match(accessibilityHtml, /פתיחת הכספת/);
assert.match(accessibilityHtml, /איפוס המידע המקומי/);
```

- [ ] **Step 2: Run the suite and verify the expected failure**

Run: `node scripts/verify.mjs`

Expected: FAIL because the current legal pages still describe plaintext browser storage.

- [ ] **Step 3: Update the privacy page with exact behavior**

Replace the local-storage section with this Hebrew copy, split into paragraphs consistent with the page's existing layout:

```html
<h2>הצפנת המידע במכשיר</h2>
<p>שמות, תאריכי לידה ומזהה היומן שיצרה עבריולדת נשמרים בדפדפן רק לאחר הצפנה באמצעות AES-256-GCM. מפתח ההצפנה נגזר מהסיסמה שבחרת ואינו נשמר בדפדפן.</p>
<p>הסיסמה אינה נשלחת לעבריולדת או ל־Google, אינה נשמרת אצלנו ואינה ניתנת לשחזור על ידינו. בזמן שהכספת פתוחה, המידע המפוענח נמצא בזיכרון הדפדפן כדי שהאתר יוכל לפעול.</p>

<h2>סיסמה שנשכחה ואיפוס</h2>
<p>אם הסיסמה נשכחה, אין אפשרות לשחזר את המידע המקומי המוצפן ויש לאפס אותו. האיפוס מוחק את המידע מהמכשיר בלבד ואינו מוחק יומן או אירועים שכבר סונכרנו לחשבון Google.</p>

<h2>מגבלות ההצפנה</h2>
<p>ההצפנה מגינה על המידע כשהכספת נעולה. היא אינה יכולה להגן על מידע שכבר נפתח במכשיר או בדפדפן שנפרצו, או מפני תוסף דפדפן זדוני שפועל בעמוד.</p>
```

Keep the existing explanation that there is no Ivriyomhuledet backend database or analytics, and keep the paragraph stating that event details are sent directly to Google only after explicit synchronization.

- [ ] **Step 4: Update the accessibility statement**

Add the vault dialog to the implemented accessibility measures: labeled password inputs, status/error announcements, keyboard containment in the modal, predictable focus after unlock, and an explicit reset confirmation. Add a known limitation that password managers and platform password controls vary by browser.

- [ ] **Step 5: Run the tests and inspect both pages**

Run: `node scripts/verify.mjs`

Expected: PASS.

Load `privacy.html` and `accessibility.html` at desktop and mobile widths. Verify heading order, keyboard navigation, footer links, readable line length, and no claim of formal certification.

- [ ] **Step 6: Commit the disclosure updates**

```bash
git add dist/privacy.html dist/accessibility.html scripts/verify.mjs
git commit -m "Document encrypted local storage behavior"
```

---

### Task 7: Final security verification and deployment

**Files:**
- Modify only if a failing verification reveals a defect in files owned by Tasks 1-6.
- Verify: `.openai/hosting.json`
- Verify: `.github/workflows/pages.yml`

**Interfaces:**
- Consumes: all completed tasks.
- Produces: a clean commit history, successful GitHub Pages run, and participant-view evidence.

- [ ] **Step 1: Run the complete local verification gate**

Run:

```powershell
node scripts/verify.mjs
git diff --check
git status --short
Get-Content -Raw .openai/hosting.json
```

Expected: tests pass; `git diff --check` is silent; the worktree contains only intended plan-progress changes; project ID remains `appgprj_6a99a74da9208191b3b784944453aa7a`.

- [ ] **Step 2: Audit persisted-data and credential boundaries**

Run:

```powershell
rg -n "localStorage|sessionStorage|access_token|refresh_token|client_secret|ivriyomhuledet\.people\.v1|ivriyomhuledet\.googleCalendarId\.v1" dist scripts
```

Expected:

- legacy key strings appear only in `secure-storage.js` migration/reset logic and tests;
- `localStorage` appears only as the injected default inside `secure-storage.js`;
- `access_token` remains only in Google callback handling and a test token;
- no refresh token or client secret value exists;
- `google-calendar.js` has no persistent-storage access.

- [ ] **Step 3: Push the completed commits**

Run: `git push origin main`

Expected: `main` advances without force-push and triggers the existing Pages workflow.

- [ ] **Step 4: Verify GitHub Actions**

Run:

```powershell
$latestRun = gh run list --repo elad-refoua/ivriyomhuledet --workflow pages.yml --limit 1 --json databaseId,status,conclusion,headSha,url | ConvertFrom-Json
gh run watch $latestRun[0].databaseId --repo elad-refoua/ivriyomhuledet --exit-status
```

Expected: the `Verify site`, `Configure Pages`, `Upload site`, and `Deploy` steps all succeed for the final commit.

- [ ] **Step 5: Verify the deployed participant experience**

Open `https://elad-refoua.github.io/ivriyomhuledet/` in Chrome with a cache-busting query and repeat the Task 5 lifecycle check. Verify the CSP generates no blocking console errors for the site or Google Identity Services.

With explicit account-level permission at the moment of authorization, select the intended Google account and grant only `calendar.app.created`. Synchronize the test birthday, confirm the success message reports 20 events, and confirm persistent storage contains neither the access token nor plaintext birthday/calendar data. Do not create or delete a test Google calendar without that explicit confirmation.

- [ ] **Step 6: Final commit if verification required fixes**

If verification required a code correction, first add a failing regression assertion, implement the minimal fix, rerun all checks, then commit only that correction:

```bash
git add dist scripts
git commit -m "Fix encrypted vault verification issue"
git push origin main
```

If no correction was required, do not create an empty commit.
