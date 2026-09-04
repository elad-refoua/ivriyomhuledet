# Accessible Guided UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Ivriyomhuledet into a calm, guided, accessible Hebrew RTL experience for first-time and returning visitors without weakening its encrypted local vault or Google Calendar security model.

**Architecture:** Keep the static HTML/CSS/JavaScript application and existing single-page data flow. Add progressive UX states through semantic HTML, CSS state selectors, and focused DOM-controller helpers in `dist/app.js`; extend the existing zero-dependency Node verification script before each production change and verify the rendered flow as a participant.

**Tech Stack:** Static HTML5, CSS, browser ES modules, Web Crypto, Google Identity Services, Google Calendar API, local vendored `@hebcal/hdate`, Node.js built-in assertions, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-04-accessible-guided-ux-design.md`

## Global Constraints

- Keep the existing repository, GitHub Pages URL, OAuth client, workflow, and OpenAI Sites project ID `appgprj_6a99a74da9208191b3b784944453aa7a`.
- Keep the site static, Hebrew, and RTL; production files remain in `dist/` and there is no build step.
- Add no framework, remote font, icon package, analytics, tracking, backend, database, or client secret.
- Keep Google scope exactly `https://www.googleapis.com/auth/calendar.app.created` and keep the access token in memory only.
- Keep persisted app state inside the existing authenticated AES-256-GCM envelope using PBKDF2-HMAC-SHA-256 at 600,000 iterations, a random 16-byte salt, a fresh 12-byte IV, and the current AAD.
- Keep the passphrase, derived key, Google access token, and post-migration birthday plaintext out of browser persistence, URLs, logs, and source.
- Keep explicit 20-year Hebrew birthday occurrences; do not replace them with Gregorian annual recurrence.
- Preserve transactional encrypted writes, migration rollback, lifecycle cancellation, CSP, strict payload validation, and `dist/vendor/hdate/LICENSE`.
- Target WCAG 2.2 AA behavior without making a formal certification claim.
- Use visible labels, status text in addition to color, 44-by-44-pixel controls, keyboard-operable interactions, and `prefers-reduced-motion` support.
- Use `apply_patch` for source edits. Run the focused failing assertion before implementation, then the full `node scripts/verify.mjs` suite after each task.
- Do not select, authorize, or modify a real Google account during browser verification without separate explicit permission.

---

### Task 1: Make the vault entry calm, explanatory, and single-scroll

**Files:**
- Modify: `scripts/verify.mjs:49-122`
- Modify: `dist/index.html:303-373`
- Modify: `dist/styles.css:1289-1430,1583-1807`
- Modify: `dist/app.js:70-115,329-490`

**Interfaces:**
- Consumes: Existing `setVaultMode(mode)`, `handleVaultSubmit(event)`, `handleVaultReset()`, and `vaultStore` create/migrate/unlock lifecycle.
- Produces: DOM IDs `vault-scroll`, `vault-security-summary`, `vault-passphrase-toggle`, `vault-confirm-toggle`, `vault-length-status`, and `vault-match-status`; helpers `setPasswordVisibility(input, button, visible)` and `updateVaultRequirements()`.

- [ ] **Step 1: Add failing vault UX assertions**

Add a CSS source read and the following contract near the existing vault assertions in `scripts/verify.mjs`:

```js
const stylesSource = await readFile(resolve(root, "dist/styles.css"), "utf8");

for (const id of [
  "vault-scroll",
  "vault-security-summary",
  "vault-passphrase-toggle",
  "vault-confirm-toggle",
  "vault-length-status",
  "vault-match-status",
]) {
  assert.match(indexHtml, new RegExp(`id="${id}"`), `missing vault UX control: ${id}`);
}
assert.match(indexHtml, /aria-pressed="false"/);
assert.match(indexHtml, /הסיסמה לא נשמרת/);
assert.match(indexHtml, /Google מקבלת מידע רק בסנכרון יזום/);
assert.match(appSource, /function setPasswordVisibility\(/);
assert.match(appSource, /function updateVaultRequirements\(/);
assert.match(stylesSource, /body:has\(\.vault-dialog\[open\]\)\s*\{[^}]*overflow:\s*hidden/s);
assert.match(stylesSource, /@media \(max-width: 650px\)[\s\S]*\.vault-dialog[\s\S]*height:\s*100dvh/);
```

- [ ] **Step 2: Run the suite and verify the new contract fails**

Run:

```powershell
node scripts/verify.mjs
```

Expected: FAIL at `missing vault UX control: vault-scroll` because the guided vault markup does not yet exist. Existing secure-storage tests must run before that failure.

- [ ] **Step 3: Add semantic vault guidance and controls**

In `dist/index.html`, retain the native dialog and existing form IDs, wrap its content in `#vault-scroll`, and add this structure inside `.vault-card` before the fields:

```html
<ul id="vault-security-summary" class="vault-security-summary" aria-label="איך הכספת שומרת על המידע">
  <li>השמות והתאריכים מוצפנים במכשיר הזה</li>
  <li>הסיסמה לא נשמרת ולא ניתנת לשחזור</li>
  <li>Google מקבלת מידע רק בסנכרון יזום</li>
</ul>
```

Wrap each password input in `.password-control` with a `type="button"` toggle. Use `aria-controls`, `aria-pressed="false"`, and the visible label `הצגת הסיסמה`. Add factual requirement rows:

```html
<p id="vault-length-status" class="requirement-status" data-state="pending">לפחות 12 תווים</p>
<p id="vault-match-status" class="requirement-status" data-state="pending">שתי הסיסמאות זהות</p>
```

Keep create, migrate, and unlock copy distinct. Preserve the generic wrong-passphrase/corrupt-vault message and the existing reset disclosure.

- [ ] **Step 4: Implement password visibility and requirement behavior**

In `dist/app.js`, bind the new elements and add:

```js
const vaultPassphraseToggle = document.getElementById("vault-passphrase-toggle");
const vaultConfirmToggle = document.getElementById("vault-confirm-toggle");
const vaultLengthStatus = document.getElementById("vault-length-status");
const vaultMatchStatus = document.getElementById("vault-match-status");

function setPasswordVisibility(input, button, visible) {
  input.type = visible ? "text" : "password";
  button.setAttribute("aria-pressed", String(visible));
  button.querySelector("span").textContent = visible ? "הסתרת הסיסמה" : "הצגת הסיסמה";
}

function updateVaultRequirements() {
  const longEnough = vaultPassphrase.value.length >= 12;
  const matches = vaultConfirm.value.length > 0 && vaultPassphrase.value === vaultConfirm.value;
  vaultLengthStatus.dataset.state = longEnough ? "complete" : "pending";
  vaultMatchStatus.dataset.state = matches ? "complete" : "pending";
}
```

Wire both toggle buttons and both password inputs. Reset visibility, `aria-pressed`, requirement states, and password values whenever the vault mode changes or an operation completes. In unlock mode, hide confirmation and match status; in create and migrate modes show them.

- [ ] **Step 5: Remove nested scrolling and meet touch/contrast requirements**

In `dist/styles.css`:

- Lock document overflow while `.vault-dialog[open]` exists.
- Make `.vault-dialog` itself non-scrolling and let `#vault-scroll` own the only scroll area.
- Set password toggles and all vault buttons to at least 44 pixels high.
- At 650 pixels or less, set the dialog to `inset: 0`, `width: 100%`, `height: 100dvh`, `max-height: none`, `border-radius: 0`, and remove translate positioning.
- Keep the action area sticky at the bottom of the dialog scroll surface with an opaque white background.
- Give complete/pending requirement states an icon or text marker as well as color.

Use this layout contract:

```css
body:has(.vault-dialog[open]) {
  overflow: hidden;
}

.vault-dialog {
  overflow: hidden;
}

#vault-scroll {
  max-height: calc(100dvh - 24px);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.password-toggle,
.vault-actions button {
  min-height: 44px;
}

.requirement-status::before {
  content: "○";
}

.requirement-status[data-state="complete"]::before {
  content: "✓";
}

@media (max-width: 650px) {
  .vault-dialog {
    inset: 0;
    width: 100%;
    height: 100dvh;
    max-height: none;
    border-radius: 0;
    transform: none;
  }

  #vault-scroll {
    height: 100dvh;
    max-height: none;
  }

  .vault-actions {
    position: sticky;
    bottom: 0;
    background: #fff;
  }
}
```

- [ ] **Step 6: Verify and commit the vault task**

Run:

```powershell
node scripts/verify.mjs
git diff --check
```

Expected: both commands exit 0 and the suite prints `✓ בדיקות עבריולדת עברו בהצלחה`.

Commit:

```powershell
git add scripts/verify.mjs dist/index.html dist/styles.css dist/app.js
git commit -m "Improve accessible vault onboarding"
```

---

### Task 2: Convert the marketing header into a guided, state-aware workspace

**Files:**
- Modify: `scripts/verify.mjs:49-145`
- Modify: `dist/index.html:20-77`
- Modify: `dist/styles.css:72-340,1583-1725`
- Modify: `dist/app.js:45-90,329-440,672-883`

**Interfaces:**
- Consumes: Existing `people`, `renderPeople()`, `updateFlow(hasPeople, connected, synced)`, and successful vault data returned by `vaultSubmitOperation()`.
- Produces: DOM IDs `workspace-title`, `vault-status`, and one `[data-flow-status]` element per step; helper `focusAfterVaultOpen()`; `data-list-state="empty|ready"` on `#app-shell`.

- [ ] **Step 1: Add failing workspace-state assertions**

Add to `scripts/verify.mjs`:

```js
assert.match(indexHtml, /id="workspace-title"[^>]*tabindex="-1"/);
assert.match(indexHtml, /id="vault-status"/);
assert.equal((indexHtml.match(/data-flow-status/g) || []).length, 3);
assert.match(indexHtml, /מוגן במכשיר הזה/);
assert.match(appSource, /function focusAfterVaultOpen\(/);
assert.match(appSource, /appShell\.dataset\.listState/);
assert.match(appSource, /setAttribute\("aria-current", "step"\)/);
```

- [ ] **Step 2: Run the suite and verify the workspace contract fails**

Run `node scripts/verify.mjs`.

Expected: FAIL because `workspace-title` is absent.

- [ ] **Step 3: Simplify the header and progress landmark**

In `dist/index.html`:

- Keep the current brand and calendar-check SVG.
- Replace the long top-bar privacy sentence with a compact `#vault-status` link reading `מוגן במכשיר הזה` and a visually subordinate `פרטים` label for wide screens.
- Change the hero into a concise workspace introduction headed by `#workspace-title` with `tabindex="-1"` and the copy `מוסיפים יום הולדת עברי ליומן — פעם אחת, ל־20 השנים הבאות.`
- Keep the ordered three-step sequence, adding `<small data-flow-status>עכשיו</small>` to each step.
- Make the sequence a labeled navigation/progress landmark and retain the actual ordered list semantics.

Use this semantic shape:

```html
<section class="workspace-intro" aria-labelledby="workspace-title">
  <h1 id="workspace-title" tabindex="-1">ימי הולדת עבריים, ישר ליומן</h1>
  <p>מוסיפים יום הולדת עברי ליומן — פעם אחת, ל־20 השנים הבאות.</p>
</section>
<nav class="journey" aria-label="התקדמות בהכנת היומן">
  <ol class="flow">
    <li class="flow-step is-active" data-flow-step="people">
      <span class="flow-number" aria-hidden="true">1</span>
      <span><strong>מוסיפים</strong><small data-flow-status>עכשיו</small></span>
    </li>
  </ol>
</nav>
```

Repeat the same list-item structure for `connect` and `sync`, with visible labels `מחברים` and `מסנכרנים`.

- [ ] **Step 4: Implement returning-user focus and textual progress states**

Add:

```js
const workspaceTitle = document.getElementById("workspace-title");

function focusAfterVaultOpen() {
  if (people.length === 0) {
    nameInput.focus();
    return;
  }
  workspaceTitle.focus();
}
```

Replace the unconditional `nameInput.focus()` after vault success with `focusAfterVaultOpen()`. In `renderPeople()`, set `appShell.dataset.listState` to `ready` or `empty`. In `updateFlow()`, clear old `aria-current`, set each `[data-flow-status]` to `הושלם`, `עכשיו`, or `בהמשך`, and set `aria-current="step"` only on the active step.

Use one helper so text and ARIA state cannot drift:

```js
function setFlowStepState(step, state) {
  step.classList.toggle("is-active", state === "active");
  step.classList.toggle("is-complete", state === "complete");
  step.querySelector("[data-flow-status]").textContent =
    state === "complete" ? "הושלם" : state === "active" ? "עכשיו" : "בהמשך";
  if (state === "active") step.setAttribute("aria-current", "step");
  else step.removeAttribute("aria-current");
}
```

- [ ] **Step 5: Refine the workspace hierarchy responsively**

In `dist/styles.css`:

- Reduce hero height and remove decorative weight that competes with the task.
- Make the progress landmark compact and readable at 375 pixels without hiding its status text.
- Use a quieter privacy/vault-status link and keep Lock visually separate.
- Preserve the two-column desktop workspace and one-column tablet/mobile flow.
- Ensure the active and complete states differ by icon/text, border, and color.

Apply a compact hierarchy rather than the former large promotional panel:

```css
.workspace-intro {
  max-width: 720px;
  padding: 42px 0 20px;
}

.workspace-intro h1 {
  max-width: 14ch;
  margin: 0;
  color: var(--navy-950);
  font-size: clamp(2rem, 5vw, 3.35rem);
  line-height: 1.05;
}

.journey .flow {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.flow-step[aria-current="step"] {
  border-color: var(--blue-600);
}

@media (max-width: 650px) {
  .workspace-intro {
    padding-top: 28px;
  }

  .flow-step small {
    display: block;
  }
}
```

- [ ] **Step 6: Verify and commit the workspace task**

Run:

```powershell
node scripts/verify.mjs
git diff --check
```

Expected: exit 0 for both.

Commit:

```powershell
git add scripts/verify.mjs dist/index.html dist/styles.css dist/app.js
git commit -m "Guide first-time and returning visitors"
```

---

### Task 3: Add field-level validation and clearer birthday entry

**Files:**
- Modify: `scripts/verify.mjs:49-165`
- Modify: `dist/index.html:78-187`
- Modify: `dist/styles.css:342-650,1583-1765`
- Modify: `dist/app.js:30-47,127-190,603-670,777-824,898-910`

**Interfaces:**
- Consumes: `birthFromGregorian()`, `birthFromHebrew()`, `updateGregorianPreview()`, `updateHebrewPreview()`, and transactional `persistState()`.
- Produces: DOM IDs `form-error-summary`, `form-error-list`, `person-name-error`, `gregorian-date-error`, and `hebrew-date-error`; helpers `clearFormErrors()`, `setFieldError(control, errorElement, message)`, and `showFormErrorSummary(errors)`.

- [ ] **Step 1: Add failing accessible-form assertions**

Add to `scripts/verify.mjs`:

```js
for (const id of [
  "form-error-summary",
  "form-error-list",
  "person-name-error",
  "gregorian-date-error",
  "hebrew-date-error",
]) {
  assert.match(indexHtml, new RegExp(`id="${id}"`), `missing form error target: ${id}`);
}
assert.match(indexHtml, /<details class="after-sunset-help">/);
assert.match(appSource, /function clearFormErrors\(/);
assert.match(appSource, /function setFieldError\(/);
assert.match(appSource, /function showFormErrorSummary\(/);
assert.match(appSource, /setAttribute\("aria-invalid", "true"\)/);
assert.match(appSource, /submitLabel\.textContent = editingAtSubmit \? "שומר שינויים…" : "מוסיף לרשימה…"/);
```

- [ ] **Step 2: Run the suite and verify the form contract fails**

Run `node scripts/verify.mjs`.

Expected: FAIL because `form-error-summary` is absent.

- [ ] **Step 3: Add error targets and point-of-need help**

In `dist/index.html`:

- Add a focusable `#form-error-summary` with `role="alert"`, a short heading, and a list for linked errors.
- Give each relevant control a persistent `aria-describedby` containing its existing hint/preview ID plus its field-error ID.
- Add hidden `.field-error` elements immediately after the name, Gregorian date, and Hebrew date group.
- Place a native `<details class="after-sunset-help">` after the sunset checkbox. Its summary is `לא בטוחים אם זה היה אחרי השקיעה?` and its body explains that selecting the option advances the Hebrew day because the Hebrew date changes at sunset.
- Keep date previews as polite live regions and add a visible confirmation icon/text that does not rely on green alone.

Use this error-summary and field-error structure:

```html
<section id="form-error-summary" class="form-error-summary" role="alert" tabindex="-1" hidden>
  <strong>יש כמה פרטים שצריך לתקן</strong>
  <ul id="form-error-list"></ul>
</section>

<label class="field" for="person-name">
  <span>שם</span>
  <input id="person-name" aria-describedby="person-name-error" />
  <small id="person-name-error" class="field-error" hidden></small>
</label>

<details class="after-sunset-help">
  <summary>לא בטוחים אם זה היה אחרי השקיעה?</summary>
  <p>אחרי השקיעה מתחיל היום העברי הבא. סמנו את האפשרות רק אם הלידה הייתה אחרי השקיעה.</p>
</details>
```

- [ ] **Step 4: Implement validation associations without clearing input**

Add these controller helpers in `dist/app.js`:

```js
const formErrorSummary = document.getElementById("form-error-summary");
const formErrorList = document.getElementById("form-error-list");
const personNameError = document.getElementById("person-name-error");
const gregorianDateError = document.getElementById("gregorian-date-error");
const hebrewDateError = document.getElementById("hebrew-date-error");
const fieldErrorPairs = [
  [nameInput, personNameError],
  [gregorianInput, gregorianDateError],
  [hebrewYearInput, hebrewDateError],
];

function clearFormErrors() {
  formErrorSummary.hidden = true;
  formErrorList.replaceChildren();
  for (const [control, errorElement] of fieldErrorPairs) {
    control.removeAttribute("aria-invalid");
    errorElement.hidden = true;
    errorElement.textContent = "";
  }
}

function setFieldError(control, errorElement, message) {
  control.setAttribute("aria-invalid", "true");
  errorElement.textContent = message;
  errorElement.hidden = false;
  return { control, message };
}

function showFormErrorSummary(errors) {
  for (const error of errors) {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = `#${error.control.id}`;
    link.textContent = error.message;
    item.append(link);
    formErrorList.append(item);
  }
  formErrorSummary.hidden = false;
  formErrorSummary.focus();
}
```

Validate name first, then the active date mode. Preserve all entered values on validation failure. Clear the affected field error on input/change. During encrypted save, change the submit label to `מוסיף לרשימה…` or `שומר שינויים…`; restore the correct stable label in `finally`. Do not alter the existing save-before-commit behavior.

- [ ] **Step 5: Style clear validation, preview, and saving states**

In `dist/styles.css`:

- Give `[aria-invalid="true"]` a high-contrast border plus an adjacent textual error.
- Style the summary as a compact error panel with underlined focusable links.
- Ensure help summaries are 44 pixels tall and visibly interactive.
- Keep form controls at least 48 pixels tall on touch layouts.
- Reserve preview/error space where practical to avoid large layout jumps.
- Keep disabled saving buttons legible and expose `aria-busy="true"` on the form during persistence.

Use these visual and state rules:

```css
.field input[aria-invalid="true"],
.field select[aria-invalid="true"] {
  border-color: var(--red-700);
  box-shadow: 0 0 0 3px var(--red-100);
}

.field-error {
  color: var(--red-700);
  font-weight: 650;
}

.form-error-summary {
  padding: 14px 16px;
  border: 1px solid #d77a8d;
  border-radius: var(--radius-sm);
  background: var(--red-100);
}

.after-sunset-help summary {
  display: flex;
  min-height: 44px;
  align-items: center;
  color: var(--blue-700);
  cursor: pointer;
}
```

Set `form.setAttribute("aria-busy", "true")` immediately before encrypted persistence and remove the attribute in `finally`.

- [ ] **Step 6: Verify and commit the form task**

Run:

```powershell
node scripts/verify.mjs
git diff --check
```

Expected: exit 0 for both and no existing calendar or vault test regression.

Commit:

```powershell
git add scripts/verify.mjs dist/index.html dist/styles.css dist/app.js
git commit -m "Clarify accessible birthday entry"
```

---

### Task 4: Make the birthday list efficient for returning visitors

**Files:**
- Modify: `scripts/verify.mjs:49-180`
- Modify: `dist/index.html:188-217`
- Modify: `dist/styles.css:654-990,1583-1780`
- Modify: `dist/app.js:191-267,672-824`

**Interfaces:**
- Consumes: `renderPeople()`, `createPersonCard(person, birthdays)`, `createIconButton(action, person, label, iconPath)`, `startEditing(person)`, and existing confirmation lifecycle.
- Produces: Visible `.action-label` content inside edit/delete buttons and stable list states `empty` and `ready`.

- [ ] **Step 1: Add failing list UX assertions**

Add to `scripts/verify.mjs`:

```js
assert.match(appSource, /className = "action-label"/);
assert.match(appSource, /button\.append\(icon, actionLabel\)/);
assert.match(stylesSource, /\.icon-button\s*\{[^}]*min-height:\s*44px/s);
assert.match(stylesSource, /\.icon-button\s*\{[^}]*min-width:\s*44px/s);
assert.match(indexHtml, /הוספת יום הולדת ראשון/);
assert.match(appSource, /people\.length === 1 \? "יום הולדת אחד" : `\$\{people\.length\} ימי הולדת`/);
```

- [ ] **Step 2: Run the suite and verify the list contract fails**

Run `node scripts/verify.mjs`.

Expected: FAIL because `.action-label` is not created.

- [ ] **Step 3: Improve list copy and action semantics**

Keep the existing ordered list, cards, date tiles, and native `<details>` schedule. Change the list count to `יום הולדת אחד` or `<number> ימי הולדת`. Keep the empty state focused on one action and change its explanatory sentence to `כאן תראו את התאריך העברי ואת 20 המועדים הבאים.`

Refactor `createIconButton()` to create DOM nodes rather than concatenating the visible label into HTML:

```js
const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
icon.setAttribute("viewBox", "0 0 24 24");
icon.setAttribute("aria-hidden", "true");
icon.innerHTML = iconPath;
const actionLabel = document.createElement("span");
actionLabel.className = "action-label";
actionLabel.textContent = label;
button.append(icon, actionLabel);
```

Preserve the precise `aria-label` containing the person’s name. Keep delete confirmation and encrypted persistence behavior unchanged.

- [ ] **Step 4: Improve returning layout and responsive actions**

In `dist/styles.css`:

- Give the list greater visual priority when `#app-shell[data-list-state="ready"]`.
- Keep edit/delete labels visible on desktop and tablet; visually hide only the text at the narrowest breakpoint while retaining 44-by-44-pixel buttons and accessible names.
- Do not translate cards on hover; use border/shadow/color so the page does not shift.
- Keep long names ellipsized visually while retaining their full accessible text.
- Keep the 20-date expansion readable at 200% zoom and on 375-pixel screens.

Use explicit action sizing and state-aware emphasis:

```css
.icon-button {
  min-width: 44px;
  min-height: 44px;
  padding: 0 12px;
}

.person-card:hover {
  transform: none;
  border-color: #c7d0ef;
  box-shadow: 0 8px 24px rgba(28, 39, 82, 0.1);
}

#app-shell[data-list-state="ready"] .list-surface {
  border-color: #cbd4f3;
}

@media (max-width: 420px) {
  .icon-button .action-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }
}
```

- [ ] **Step 5: Verify and commit the list task**

Run:

```powershell
node scripts/verify.mjs
git diff --check
```

Expected: exit 0 for both.

Commit:

```powershell
git add scripts/verify.mjs dist/index.html dist/styles.css dist/app.js
git commit -m "Improve returning birthday workflow"
```

---

### Task 5: Turn Google synchronization into a clear decision checkpoint

**Files:**
- Modify: `scripts/verify.mjs:49-205`
- Modify: `dist/index.html:217-271`
- Modify: `dist/styles.css:992-1215,1583-1795`
- Modify: `dist/app.js:53-68,268-326,825-897`

**Interfaces:**
- Consumes: Existing `updateGoogleUI()`, `setSyncing(active, label, percent)`, `connectGoogle()`, `syncGoogleCalendar()`, `disconnectGoogle()`, and `people` state.
- Produces: DOM IDs `sync-event-count`, `sync-privacy-points`, and `sync-progressbar`; determinate progress ARIA attributes and explicit synchronization-state copy.

- [ ] **Step 1: Add failing synchronization UX assertions**

Add to `scripts/verify.mjs`:

```js
for (const id of ["sync-event-count", "sync-privacy-points", "sync-progressbar"]) {
  assert.match(indexHtml, new RegExp(`id="${id}"`), `missing sync explanation: ${id}`);
}
assert.match(indexHtml, /יומן נפרד בשם ”ימי הולדת עבריים”/);
assert.match(indexHtml, /לא נקרא את היומנים האחרים/);
assert.match(indexHtml, /המידע נשלח ל־Google רק אחרי לחיצה על הכפתור/);
assert.match(appSource, /syncEventCount\.textContent = String\(people\.length \* 20\)/);
assert.match(appSource, /setAttribute\("aria-valuenow", String\(boundedPercent\)\)/);
assert.match(appSource, /removeAttribute\("aria-valuenow"\)/);
```

- [ ] **Step 2: Run the suite and verify the synchronization contract fails**

Run `node scripts/verify.mjs`.

Expected: FAIL because `sync-event-count` is absent.

- [ ] **Step 3: Add pre-action Google explanations and progress semantics**

In `dist/index.html`, add a concise summary before the Google action:

```html
<p class="sync-count-copy"><strong id="sync-event-count">0</strong> מועדים מוכנים לסנכרון</p>
<ul id="sync-privacy-points" class="sync-privacy-points">
  <li>יומן נפרד בשם ”ימי הולדת עבריים” ייווצר או יעודכן</li>
  <li>לא נקרא את היומנים האחרים שלך</li>
  <li>המידע נשלח ל־Google רק אחרי לחיצה על הכפתור</li>
</ul>
```

Give the progress track `id="sync-progressbar"`, `role="progressbar"`, `aria-valuemin="0"`, and `aria-valuemax="100"`. Keep the progress text in a polite live region. Keep ICS download visibly secondary.

- [ ] **Step 4: Update synchronization state text without changing the API contract**

In `updateGoogleUI()`, always set `syncEventCount.textContent = String(people.length * 20)`. Use these stable action labels:

- No token: `חיבור Google והוספת המועדים`
- Token ready: `סנכרון עכשיו`
- Completed: `סנכרון מחדש`

Bind the new elements with the other top-level DOM references, then calculate the determinate state in `setSyncing()`:

```js
const syncEventCount = document.getElementById("sync-event-count");
const syncProgressbar = document.getElementById("sync-progressbar");

const boundedPercent = Math.max(0, Math.min(100, Math.round(percent)));
progressBar.style.width = `${Math.max(5, boundedPercent)}%`;
syncProgressbar.setAttribute("aria-valuenow", String(boundedPercent));
syncProgressbar.setAttribute("aria-valuetext", label);
```

Remove `aria-valuenow` and `aria-valuetext` when progress is hidden. Preserve cancellation generations, token clearing, calendar-ID encrypted persistence before event writes, and error handling. OAuth popup closure must return a neutral retry message; it must not imply that data changed.

- [ ] **Step 5: Style the Google checkpoint and states**

In `dist/styles.css`:

- Use a clear border and calendar-color accent only when the panel becomes actionable.
- Present the event count as text, not a decorative metric.
- Give the Google button, disconnect action, and ICS alternative at least 44-pixel targets.
- Keep success, error, connected, and disconnected states distinct with icon/text plus color.
- Reserve progress space while active and avoid layout-shifting animations.

Use this checkpoint layout:

```css
.sync-privacy-points {
  display: grid;
  gap: 8px;
  margin: 14px 0 18px;
  padding-right: 20px;
  color: var(--muted);
}

.sync-count-copy {
  margin: 14px 0 0;
  color: var(--navy-900);
}

#sync-progressbar {
  min-height: 8px;
}

.google-button,
.quiet-button,
.alternative-action button {
  min-height: 44px;
}
```

- [ ] **Step 6: Verify and commit the synchronization task**

Run:

```powershell
node scripts/verify.mjs
git diff --check
```

Expected: exit 0 for both. The mocked Google tests must still submit exactly 20 events and preserve create-persist-event ordering.

Commit:

```powershell
git add scripts/verify.mjs dist/index.html dist/styles.css dist/app.js
git commit -m "Clarify deliberate Google synchronization"
```

---

### Task 6: Align legal pages and run the complete local accessibility/security audit

**Files:**
- Modify: `scripts/verify.mjs:80-150`
- Modify: `dist/accessibility.html`
- Modify: `dist/privacy.html` only if the final UI wording requires factual alignment
- Modify: `dist/styles.css:1518-1581`

**Interfaces:**
- Consumes: The completed vault, workspace, form, list, and Google UX behavior from Tasks 1–5.
- Produces: Updated accessibility disclosure describing password visibility, field-error navigation, progress announcements, returning-user focus, and the single-scroll mobile vault.

- [ ] **Step 1: Add failing disclosure and invariant assertions**

Add to `scripts/verify.mjs`:

```js
assert.match(accessibilityHtml, /הצגה והסתרה של הסיסמה/);
assert.match(accessibilityHtml, /שגיאות המקושרות לשדות/);
assert.match(accessibilityHtml, /מצב הסנכרון מוקרא/);
assert.match(accessibilityHtml, /ללא גלילה כפולה/);
assert.doesNotMatch(accessibilityHtml, /עומד בתקן|תואם באופן מלא|נגיש לחלוטין/);
assert.doesNotMatch(appSource, /localStorage|sessionStorage/);
assert.doesNotMatch(indexHtml, /client[_-]?secret|GOCSPX-|AIza[0-9A-Za-z_-]{20,}/i);
assert.match(stylesSource, /@media \(prefers-reduced-motion: reduce\)/);
```

- [ ] **Step 2: Run the suite and verify the disclosure contract fails**

Run `node scripts/verify.mjs`.

Expected: FAIL because the accessibility page does not yet mention password visibility.

- [ ] **Step 3: Update factual accessibility guidance**

Update `dist/accessibility.html` to describe:

- Show/hide password operation and the fact that password-manager behavior varies by browser.
- Error summary links and field-level errors.
- Polite progress and success announcements.
- Empty-vault versus returning-vault focus destination.
- Keyboard access to date mode, help disclosures, schedule details, edit, delete, lock, reset, Google, and ICS actions.
- The single-scroll mobile vault and 200% zoom/reflow support.

Retain the existing contact path and explicit statement that the page is not a formal certification. Update `dist/privacy.html` only where exact UI terms changed; preserve AES-256-GCM, passphrase-recovery, malicious-extension/browser-profile, shared-origin, memory-only token, and no-backend disclosures.

Add a factual section with this copy:

```html
<h2>הנגשת תהליך העבודה</h2>
<ul>
  <li>אפשר לעבור בין הצגה והסתרה של הסיסמה באמצעות כפתור נגיש למקלדת.</li>
  <li>שגיאות מוצגות בסיכום ובצמוד לשדות שאליהם הן מקושרות.</li>
  <li>מצב הסנכרון מוקרא לקוראי מסך ואינו מסומן בצבע בלבד.</li>
  <li>במסכים צרים הכספת משתמשת באזור גלילה יחיד, ללא גלילה כפולה.</li>
</ul>
```

- [ ] **Step 4: Apply the shared visual system to legal pages**

In `dist/styles.css`, align legal-page header, body line length, focus states, mobile padding, and footer with the main page. Keep body copy at least 16 pixels on mobile and do not hide legal navigation labels behind icon-only controls.

Apply:

```css
.legal-card p,
.legal-card li {
  max-width: 72ch;
  font-size: 1rem;
  line-height: 1.7;
}

@media (max-width: 650px) {
  .legal-card p,
  .legal-card li {
    font-size: 1rem;
  }
}
```

- [ ] **Step 5: Run the complete local automated audit**

Run:

```powershell
node scripts/verify.mjs
git diff --check
rg -n --hidden --glob '!.git/**' --glob '!docs/**' --glob '!_context.md' "client_secret|GOCSPX-|AIza[0-9A-Za-z_-]{20,}" .
Get-Content -Raw .openai/hosting.json
```

Expected:

- `node scripts/verify.mjs` exits 0.
- `git diff --check` exits 0.
- Credential scan returns no matches.
- Hosting JSON still contains `appgprj_6a99a74da9208191b3b784944453aa7a` and `"directory": "dist"`.

- [ ] **Step 6: Commit the legal and audit task**

```powershell
git add scripts/verify.mjs dist/accessibility.html dist/privacy.html dist/styles.css
git commit -m "Document the guided accessible experience"
```

If `dist/privacy.html` has no factual change, omit it from `git add`.

---

### Task 7: Verify as a participant, deploy to the existing site, and close the branch

**Files:**
- Verify: `dist/index.html`
- Verify: `dist/privacy.html`
- Verify: `dist/accessibility.html`
- Verify: `.github/workflows/pages.yml`
- Verify: `.openai/hosting.json`
- Delete after completion: `_context.md`

**Interfaces:**
- Consumes: All Tasks 1–6 and the existing GitHub Pages workflow.
- Produces: Participant-view evidence across viewport sizes, a clean branch, merged `main`, successful GitHub Pages deployment, and a verified live URL.

- [ ] **Step 1: Start a local participant-view server**

Run from the repository root:

```powershell
py -3 -m http.server 8767 --directory dist
```

Open `http://127.0.0.1:8767/` in a browser profile used only for synthetic QA data.

- [ ] **Step 2: Verify every vault mode and security boundary**

Use only synthetic birthday data. Verify:

1. Create mode explains local encryption, non-recoverability, and deliberate Google sending.
2. Requirement indicators update without claiming password strength.
3. Both show/hide controls update visible text and `aria-pressed`.
4. Create succeeds with a 12-plus-character test passphrase.
5. Lock hides and makes the app shell inert, clears rendered plaintext, and clears Google session state.
6. Wrong passphrase produces the generic error and leaves ciphertext unchanged.
7. Correct passphrase restores the synthetic birthday.
8. Reset confirmation distinguishes local deletion from Google Calendar data.
9. Migration mode appears in a separate disposable origin populated only with synthetic legacy keys, writes a verified encrypted envelope, and removes the legacy keys.
10. At 375 pixels the vault has one scroll surface, no horizontal overflow, and no double scrollbar.

- [ ] **Step 3: Verify the complete birthday and calendar journey**

As a participant:

1. Empty vault focuses the name field; returning vault focuses `#workspace-title`.
2. Submit an empty form and confirm focus moves to the linked error summary.
3. Follow each error link and confirm it focuses the invalid field.
4. Add `בדיקת נגישות` with Gregorian date `1989-09-21`; confirm `כ״א באלול תשמ״ט`.
5. Confirm the form saves, the list reports one birthday, and the progress landmark advances textually.
6. Expand the card and confirm exactly 20 rows.
7. Edit the synthetic name and reminder; verify the encrypted save survives reload.
8. Download ICS and confirm the success announcement names one person and 20 years.
9. Confirm Google copy reports exactly 20 prepared events, a separate calendar, no reading of other calendars, and deliberate sending.
10. Open the OAuth chooser and verify the exact origin, public client ID, and `calendar.app.created` scope; close it without selecting an account.
11. Confirm popup cancellation returns an actionable neutral message and no synchronized-success state.
12. Delete the synthetic person and reset the synthetic vault before ending QA.

- [ ] **Step 4: Verify accessibility and responsive behavior**

At approximately 375, 768, 1024, and 1440 pixels:

- Confirm no horizontal overflow.
- Confirm 44-by-44-pixel touch targets for password toggles, primary/secondary actions, edit/delete, details summaries, Google, disconnect, and ICS.
- Navigate the entire flow with keyboard only and verify visible focus.
- Verify dialog focus entry and safe return, ordered headings/landmarks, labels, status announcements, and no unexpected focus movement.
- Emulate reduced motion and confirm smooth scrolling/nonessential transitions are disabled.
- Test 200% zoom or equivalent narrow reflow.
- Open Privacy and Accessibility pages, follow their skip links, and confirm readable line length and mobile navigation.
- Confirm the browser console has no errors or warnings caused by the application.

- [ ] **Step 5: Run final verification and remove session context**

Delete `_context.md` using `apply_patch`, then run:

```powershell
node scripts/verify.mjs
git diff --check
git status --short
git log --oneline main..HEAD
```

Expected: tests and diff check exit 0; `_context.md` is absent; status contains only intentional committed branch changes or is clean.

- [ ] **Step 6: Merge and push the existing project**

From the existing repository:

```powershell
git switch main
git pull --ff-only
git merge --ff-only codex/accessible-guided-ux
node scripts/verify.mjs
git push origin main
```

Do not create another repository, GitHub Pages project, OpenAI Site, OAuth client, or project identifier.

- [ ] **Step 7: Verify the GitHub Pages deployment and live participant view**

Run:

```powershell
$runId = gh run list --repo elad-refoua/ivriyomhuledet --workflow pages.yml --limit 1 --json databaseId --jq '.[0].databaseId'
gh run watch $runId --repo elad-refoua/ivriyomhuledet --exit-status
```

Open `https://elad-refoua.github.io/ivriyomhuledet/?verify=<deployed-commit>` and repeat create/unlock, responsive vault, form validation, one synthetic birthday, 20-row expansion, Google chooser-without-account-selection, Privacy, Accessibility, console, cleanup, and reset checks. Confirm the deployed commit matches `main` and the deployment concludes successfully.

- [ ] **Step 8: Remove the merged feature branch**

After successful deployment and live verification:

```powershell
git branch -d codex/accessible-guided-ux
git status --short
git rev-list --left-right --count main...origin/main
```

Expected: clean status and `0 0` divergence.
