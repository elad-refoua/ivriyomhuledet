# Accessible Guided UX Design

Date: 2026-09-04
Project: Ivriyomhuledet

## Objective

Make the existing Hebrew RTL site pleasant and immediately understandable for a first-time visitor, efficient for a returning visitor, and accessible across keyboard, screen-reader, mobile, tablet, and desktop use. The change must preserve the current repository, GitHub Pages deployment, OpenAI Sites project identifier, Google OAuth client and scope, encrypted browser vault, and local-first data model.

Success means a visitor can understand why a passphrase is required, add a birthday without guessing, see what will be added to Google Calendar, synchronize intentionally, and recover from errors without losing context.

## Product principles

1. **One clear next action.** Each state emphasizes the action that advances the visitor: create or unlock the vault, add the first birthday, or synchronize the prepared list.
2. **Progressive disclosure.** Essential instructions remain visible; technical and exceptional details are available at the point where they matter.
3. **Security explained in plain language.** The interface states what is encrypted, what is never stored, when Google receives data, and what reset does without claiming absolute protection.
4. **Fast return visits.** Visitors with saved birthdays reach their list quickly and can add, edit, download, synchronize, or lock without replaying first-run education.
5. **Accessibility is behavior.** Semantics, focus, announcements, target sizes, contrast, error recovery, and responsive reading order are part of the flow rather than a separate visual layer.

## Chosen approach

Use a hybrid guided workspace. First entry is a focused vault experience. After unlock, the site remains a single page but changes emphasis according to state:

- With an empty list, the add form is the primary task and the three-step journey is visible.
- With saved birthdays, the list becomes the primary workspace and the add form remains immediately available without a new route.
- Google synchronization becomes visually active only after at least one valid birthday exists.

This retains the speed of the current single-page application while removing the cognitive load of presenting every feature at equal weight.

Rejected alternatives:

- A strict multi-page wizard would be clear for first use but unnecessarily slow for repeat entry and editing.
- A visual-only polish of the current dashboard would not resolve the dense vault entry, competing calls to action, or unclear state transitions.

## Information architecture and journey

### 1. Vault entry

The vault remains a blocking native dialog and the application shell remains inert and hidden from assistive technology until successful unlock. The dialog has one scrolling surface only; the document behind it must not scroll while it is open.

Three modes use the same stable layout:

- **Create:** “Create a private vault on this device.” Explain that the passphrase encrypts names, birth dates, preferences, and the dedicated Google calendar identifier. State that the passphrase cannot be recovered.
- **Migrate:** “Protect your existing list.” Explain that the old local list will be deleted only after encrypted storage is written and verified.
- **Unlock:** “Welcome back.” Keep the explanation short and make the password field and open action immediately available.

Create and migrate modes include:

- A short three-item security summary: encrypted on this device; passphrase is not saved; Google receives birthday data only after an explicit synchronization action.
- Password and confirmation fields.
- User-controlled show/hide password buttons with visible text or an accessible label and `aria-pressed`.
- A factual requirement indicator for at least 12 characters and a separate confirmation-match indicator. It must not be described as a security-strength score.
- A primary action whose label describes the result.

Unlock mode includes a single password field, a show/hide control, and a primary “Open my list” action. Reset remains secondary and opens an explicit confirmation panel that distinguishes local encrypted data from previously synchronized Google events. Authentication failures remain generic so corrupted data and an incorrect passphrase are not distinguishable.

At viewport widths of 650 pixels or less, the dialog becomes a full-height sheet whose content is the only scrolling surface; its primary action region stays sticky at the bottom. The document behind it remains fixed, so page and dialog scrollbars never appear together.

### 2. Workspace header

Replace the long privacy sentence in the top bar with a compact, meaningful vault status:

- “Protected on this device” with a shield icon and a link to the privacy explanation.
- “Lock” remains a separate, visible action and never looks like sign-out from Google.

The brand remains “עבריולדת” and the current calendar-check symbol remains the product mark. No new remote font, icon library, image service, analytics, or UI framework will be added.

### 3. Guided progress

Keep the genuine three-step sequence—add, review, synchronize—but present it as a compact progress landmark rather than a large marketing panel. Each step has a textual status in addition to color:

- Current: “Now”
- Complete: check mark plus “Done”
- Future: neutral number

The step labels stay stable throughout the journey. Progress changes are announced politely but do not move keyboard focus unexpectedly.

### 4. Birthday form

The form uses one-column reading order on mobile and a restrained grid only for Hebrew day/month/year fields on wider screens.

Required improvements:

- Visible labels remain present at all times; placeholders are examples only.
- The Gregorian/Hebrew selector remains a two-option segmented control with a real `fieldset` and `legend`.
- “Born after sunset” includes a concise explanation and a discoverable “Not sure?” disclosure. Leaving it unchecked remains safe and reversible.
- The calculated Hebrew date appears in a distinct confirmation panel before save and is announced politely.
- Reminder language states when the notification occurs.
- Validation appears next to the relevant field and in a short focusable error summary when submission fails. Invalid controls receive `aria-invalid` and `aria-describedby` without clearing valid input.
- During save, the submit button is disabled and displays a stable saving state. Success returns a clear confirmation and leaves the next useful action available.
- Editing is visibly distinct from adding; the card title, submit label, and cancel action all use consistent wording.

For an empty vault, the name field receives focus after entry. For a vault with saved birthdays, focus moves to the workspace heading; it must not force the visitor into the add form.

### 5. Birthday list

The list is the primary surface for returning visitors. Its heading shows a human-readable count. Each card prioritizes:

1. Person name.
2. Next Gregorian occurrence and relative timing.
3. Original Hebrew birth date and reminder choice.
4. Expandable list of all 20 calculated occurrences.

Edit and delete actions retain SVG icons but gain visible text at sizes where space permits. Icon-only variants keep precise accessible names and 44 by 44 pixel targets. Delete actions continue to require confirmation and explain that Google changes occur on the next synchronization.

The empty state gives one direct action—add the first birthday—and briefly previews what will appear. Decorative calendar content remains hidden from assistive technology.

### 6. Google Calendar synchronization

The Google panel is a decision checkpoint, not merely another card. Before connection it states:

- The exact number of events to be prepared: 20 per person.
- A separate calendar named “ימי הולדת עבריים” will be created or updated.
- The app does not read the visitor’s other calendars.
- The birthday list is sent to Google only after the visitor activates this action.

The main action remains a single efficient flow: connect the visitor’s own Google account and synchronize. After an in-memory token exists, the label changes to “Synchronize now” or “Synchronize again.” Connection, synchronization, success, cancellation, and error states have distinct text and do not rely on color alone.

The progress indicator exposes `aria-valuemin`, `aria-valuemax`, and the current value when determinate. Errors say what happened and what the visitor can do next. Disconnect continues to clear the in-memory token only and explicitly does not imply deletion of the created Google calendar.

ICS download remains available as a clearly labeled alternative, not a competing primary action.

## Visual system

Preserve and refine the product-specific calendar aesthetic rather than replacing it.

### Color tokens

- Midnight Hebrew ink: `#10183B`
- Calendar navy: `#172554`
- Action cobalt: `#3346CC`
- Quiet cobalt tint: `#E9EDFF`
- Calendar-page gold: `#F6B94D`
- Verified green: `#167354`
- Canvas: `#F4F6FB`
- Surface: `#FFFFFF`

Existing error colors remain, subject to contrast verification. Color is never the only status signal.

### Typography

Continue using the local system Hebrew stack to avoid an external font request and preserve fast, private loading. Establish a calmer scale: one strong page heading, compact section headings, and body text of at least 16 pixels on mobile with 1.55–1.7 line height. Limit explanatory text to approximately 65–75 characters per line.

### Layout and identity

The memorable element is the Hebrew calendar page: date tiles, the progress landmark, and restrained gold details. Remove decorative visual weight that competes with the task. Surfaces use hierarchy-specific radii and shadows instead of identical cards. Hover effects change color, border, or shadow without shifting layout.

Desktop keeps a clear two-column workspace. Tablet becomes one column. Mobile uses a single reading order with at least 12-pixel outer gutters and no horizontal overflow.

## Accessibility requirements

The implementation targets WCAG 2.2 AA behavior and must not claim formal certification.

- Semantic landmarks, headings, lists, fieldsets, labels, and native dialogs.
- Logical DOM and tab order matching the visual order in RTL.
- Visible focus rings with at least 3:1 contrast against adjacent colors.
- Normal text contrast of at least 4.5:1.
- Minimum 44 by 44 pixel pointer targets for actionable controls.
- Status updates through appropriate polite live regions; destructive or blocking errors through assertive alerts.
- Focus enters and returns from dialogs predictably.
- Escape closes only dialogs that are safe to dismiss.
- No content revealed solely on hover.
- `prefers-reduced-motion` removes smooth scrolling and nonessential transitions.
- 200% zoom and narrow viewport use must retain content and actions without two-dimensional scrolling.
- Legal pages inherit the same typography, focus, header, footer, and mobile standards.

## Security and privacy invariants

The UX work must not weaken or bypass the existing security design:

- Persisted app data remains one PBKDF2-derived AES-256-GCM authenticated envelope.
- PBKDF2 remains SHA-256 with 600,000 iterations, a random 16-byte salt, a fresh 12-byte IV for every write, and the current authenticated additional data.
- New writes never persist the passphrase, derived key, Google access token, or birthday plaintext outside the encrypted envelope. Pre-existing legacy plaintext remains readable only for the transactional migration path and is removed only after encrypted write-and-decrypt verification succeeds.
- The access token remains memory-only and is cleared on lock, reset, disconnect, and lifecycle cancellation.
- No client secret, backend, database, analytics, tracking, or remote logging is introduced.
- Google scope remains `https://www.googleapis.com/auth/calendar.app.created`.
- The site never synchronizes automatically. Google receives data only after an explicit visitor action.
- Reset deletes local encrypted state only and does not claim to remove Google Calendar data.
- Existing lifecycle cancellation, transactional encrypted writes, migration rollback, CSP, and strict payload validation remain intact.
- The privacy page continues to disclose the shared-origin limitation of `elad-refoua.github.io` and recommend a dedicated custom origin for stronger isolation.

## Implementation boundaries

Expected production changes are limited to:

- `dist/index.html`: semantics, structure, labels, hints, status regions, and progressive-disclosure controls.
- `dist/styles.css`: responsive hierarchy, vault sizing, interaction states, contrast, touch targets, and reduced motion.
- `dist/app.js`: UI state, focus, validation associations, password visibility, progress semantics, and returning-user emphasis.
- `scripts/verify.mjs`: regression checks for the new structure and all security invariants.
- `dist/privacy.html` and `dist/accessibility.html`: only if interface wording or documented behavior changes.

The date engine, Google API contract, OAuth client, encrypted envelope format, Sites project ID, repository, deployment workflow, and vendor library remain unchanged unless a failing regression proves a focused compatibility change is required.

## Error and recovery model

- Vault create/unlock/migration errors remain in the dialog, preserve input focus, and never expose cryptographic detail.
- Form validation preserves entered values and places focus on a summary that links to the first invalid field.
- Encrypted-save failure does not commit the visible mutation.
- OAuth cancellation returns to the Google panel with a neutral retry instruction.
- Google API failure preserves the local list, explains that the visitor can retry, and never reports synchronization success.
- Lock or reset cancels pending UI and Google work so stale operations cannot restore data or session state.

## Verification plan

Implementation follows test-driven development. Static and behavioral assertions are added first and observed failing for the missing UX behavior before production changes.

Automated verification must cover:

- Existing Hebrew date conversion and 20-occurrence behavior.
- Existing cryptographic constants, authenticated encryption, strict parsing, rollback, and lifecycle tests.
- Vault modes, password visibility controls, requirement states, and reset disclosure.
- Focus destinations for empty and returning vaults.
- Field-level error associations and progressive state text.
- Google event count explanation, deliberate-action copy, memory-only token guarantees, and unchanged scope.
- Required landmarks, live regions, labels, target-size classes, reduced-motion rules, and absence of inline script or unsafe-eval.
- Existing Sites project ID and GitHub Pages source directory.

Participant-view verification must load the site as a visitor and cover create, migrate, unlock, wrong passphrase, correct passphrase, add, edit, delete, expand 20 dates, ICS, lock, reset confirmation, Google chooser opening, privacy, and accessibility pages. Layout checks run at approximately 375, 768, 1024, and 1440 pixels, including keyboard-only navigation, focus visibility, 200% zoom or equivalent narrow reflow, no horizontal overflow, and no nested vault scrolling. A real Google account will not be selected or modified without separate explicit permission.

After local verification, changes are committed to the existing branch, merged into the existing `main`, pushed to the existing GitHub repository, and verified on the existing GitHub Pages URL. The existing OpenAI Sites project identifier remains unchanged.
