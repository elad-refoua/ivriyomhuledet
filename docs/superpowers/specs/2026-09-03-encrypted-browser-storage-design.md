# Encrypted Browser Storage Design

**Project:** Ivriyomhuledet  
**Date:** 2026-09-03  
**Status:** Approved in chat; awaiting review of this written specification

## Objective

Replace plaintext browser persistence with a passphrase-protected local vault. Birthday records and the identifier of the Google calendar created by the application must never be written to browser storage in plaintext. The site remains static, local-first, and deployed from the existing GitHub repository without changing the existing OpenAI Sites project identifier.

## Security goals

The design must:

- Protect stored birthday records if another page under the shared `elad-refoua.github.io` origin reads this site's storage.
- Protect stored data copied from the browser profile after the vault has been locked or the page has been closed.
- Keep the passphrase and derived encryption key out of persistent storage, URLs, logs, analytics, and source code.
- Preserve the existing rule that the Google OAuth access token exists only in memory.
- Fail closed: if encryption is unavailable or saving encrypted data fails, the application must not fall back to plaintext persistence.

## Explicit limitations

Encryption at rest cannot protect an unlocked page from a compromised browser, malicious extension, keylogger, injected script, or attacker controlling the device. A weak passphrase can be guessed offline after ciphertext is copied. Data already synchronized to Google remains subject to the security and privacy of the visitor's Google account.

A dedicated custom domain would still provide stronger origin isolation. This design materially reduces the current shared-origin storage risk but does not replace device security or a dedicated origin.

## User experience

### First visit

Before the birthday form becomes available, the visitor creates and confirms a vault passphrase. The interface explains that:

- the passphrase is not sent anywhere or recoverable by the site owner;
- it will be required again after a reload or a new browser session;
- losing it means the local encrypted data cannot be recovered.

The passphrase must be at least 12 characters. Spaces and Hebrew characters are allowed. The application does not impose arbitrary composition rules.

### Existing visitors

If either legacy key (`ivriyomhuledet.people.v1` or `ivriyomhuledet.googleCalendarId.v1`) exists, the visitor is shown a migration screen and asked to create a passphrase. The application encrypts the legacy payload, immediately decrypts it as a self-check, and only then removes both legacy keys. If any step fails, the legacy data remains untouched and the site shows an actionable error.

### Returning visitors

If an encrypted vault exists, the page initially shows an unlock screen. A successful passphrase decrypts the state into memory and enables the existing interface. A wrong passphrase or corrupted vault produces the same generic error and does not alter stored data.

The header gains a “lock data” control. Locking clears the in-memory birthday data, calendar identifier, passphrase-derived key, edit state, and Google access token, and returns to the unlock screen.

### Forgotten passphrase

The unlock screen offers “reset local data.” A confirmation dialog clearly states that reset deletes the encrypted birthday list and the locally stored Google calendar identifier, but does not delete any calendar or event already stored in Google. After confirmation, the visitor receives a new-vault setup screen.

## Cryptographic design

The implementation uses the browser's native Web Crypto API only; no custom cryptography or third-party crypto package is introduced.

- **Key derivation:** PBKDF2-HMAC-SHA-256, 600,000 iterations.
- **Salt:** 16 cryptographically random bytes per vault, stored in the envelope.
- **Encryption:** AES-256-GCM.
- **IV:** 12 cryptographically random bytes generated for every write and never reused with the same key.
- **Key properties:** non-extractable `CryptoKey`, permitted only for encryption and decryption.
- **Associated data:** a fixed versioned application context string, binding ciphertext to the Ivriyomhuledet vault format.
- **Encoding:** UTF-8 JSON encrypted as bytes; binary fields encoded with base64.

The only persistent item used by the new implementation is `ivriyomhuledet.vault.v1`, containing a versioned envelope similar to:

```json
{
  "version": 1,
  "kdf": {
    "name": "PBKDF2",
    "hash": "SHA-256",
    "iterations": 600000,
    "salt": "base64"
  },
  "cipher": {
    "name": "AES-GCM",
    "iv": "base64"
  },
  "ciphertext": "base64"
}
```

The encrypted plaintext payload is versioned separately and contains:

```json
{
  "version": 1,
  "people": [],
  "googleCalendarId": ""
}
```

No password hash or reusable key is stored. Successful AES-GCM authenticated decryption serves as the passphrase and integrity check.

## Application architecture

### New secure-storage module

Add `dist/secure-storage.js` with narrowly scoped, testable responsibilities:

- derive a non-extractable key from a passphrase and salt;
- encrypt and decrypt a validated vault payload;
- create, unlock, save, migrate, and reset a versioned vault;
- keep the active key and decrypted state in memory only;
- expose explicit error types for unsupported cryptography, invalid passphrase/corruption, invalid data, and storage-write failure.

Storage access is injected or wrapped so tests can use an isolated in-memory implementation.

### Application bootstrap

Refactor `dist/app.js` to use an asynchronous bootstrap:

1. Inspect storage for an encrypted vault or legacy data.
2. Render the appropriate setup, migration, or unlock state.
3. Only after unlock, initialize the form and render decrypted people.
4. Await every encrypted save before reporting success.
5. If a save fails, retain the prior encrypted vault, revert the attempted in-memory change, and show an error.

The main application must not render decrypted names before the vault is unlocked.

### Google Calendar integration

Remove direct `localStorage` access from `dist/google-calendar.js`. The application passes the decrypted calendar identifier into the synchronization function. Synchronization returns the active identifier, including a replacement identifier when a previously created calendar no longer exists. `app.js` then saves it inside the encrypted vault.

The Google OAuth access token remains a module-scoped in-memory value and is never added to the vault.

### Interface additions

Add an accessible native dialog or equivalent modal surface for:

- initial passphrase creation and confirmation;
- legacy-data migration;
- returning-visitor unlock;
- local-data reset confirmation.

All fields have visible labels, errors use `role="alert"`, focus moves predictably, keyboard operation is complete, and reduced-motion preferences remain honored. The existing visual design, RTL layout, and mobile behavior remain intact.

## Content Security Policy

Add a restrictive CSP using a `<meta http-equiv="Content-Security-Policy">` element because GitHub Pages does not provide repository-controlled response headers. The policy will default to same-origin assets and allow only the specific Google Identity and Calendar endpoints required by the existing connection flow. Inline scripts and unrestricted third-party script origins remain disallowed.

The CSP is defense in depth. It does not isolate different paths hosted on the same origin and cannot provide the response-header-only `frame-ancestors` protection.

## Privacy and legal-page updates

Update the privacy and accessibility pages to state accurately that:

- birthday records and the application-created Google calendar identifier are encrypted at rest with the visitor's passphrase;
- the passphrase is never transmitted or recoverable;
- data is decrypted in memory while the vault is unlocked;
- the stated limitations still apply to compromised devices, extensions, active-page scripts, and Google-synchronized data.

No claim of formal security certification will be added.

## Error handling

- **Web Crypto unavailable:** block persistence and explain that a supported modern browser is required.
- **Wrong passphrase or corrupt envelope:** show one generic unlock error and leave storage unchanged.
- **Invalid envelope or payload version:** stop and offer export-free reset after confirmation; never attempt lossy guessing.
- **Quota or storage failure:** keep the previous ciphertext, revert the UI change, and report that the change was not saved.
- **Interrupted migration:** preserve legacy plaintext until a verified encrypted vault exists.
- **Google error:** retain the existing behavior; never write the access token to storage while recovering.

## Testing strategy

Implementation follows test-driven development. Each production behavior is preceded by a failing test.

Automated tests will cover:

- encryption/decryption round trip with Hebrew names and dates;
- stored envelope does not contain plaintext names, dates, or calendar identifier;
- wrong passphrase and tampered ciphertext fail without modifying storage;
- repeated saves use different IVs;
- passphrase-derived key is non-extractable;
- legacy migration removes plaintext only after verified encrypted persistence;
- failed migration and failed saves preserve the previous data;
- reset removes encrypted and legacy keys;
- Google synchronization no longer reads or writes `localStorage` directly;
- existing Hebrew date, 20-event, ICS, Google-event, accessibility, and deployment checks continue to pass;
- CSP contains only the required origins and does not allow inline scripts.

Participant-view browser verification will cover:

1. Create a vault and add a Hebrew birthday.
2. Confirm browser storage contains ciphertext and no entered name or calendar identifier.
3. Reload and verify that data is hidden until the correct passphrase is entered.
4. Verify the wrong passphrase path and reset confirmation.
5. Edit, delete, download ICS, and test responsive and keyboard behavior while unlocked.
6. Complete a Google connection and synchronization only with explicit account-level permission, then confirm the token remains absent from persistent storage.
7. Verify the deployed GitHub Pages build as a visitor.

## Deployment and compatibility

The production files remain in `dist/` with no build step. Changes deploy through the existing GitHub Pages workflow and repository. The OpenAI Sites identifier in `.openai/hosting.json` remains unchanged. The design targets current Chrome, Edge, Firefox, and Safari versions that support Web Crypto, PBKDF2, and AES-GCM.

## Acceptance criteria

The change is complete when:

- no birthday record or Google calendar identifier is persisted in plaintext;
- no encryption key, passphrase, Google access token, client secret, or refresh token is persisted;
- existing plaintext data migrates without silent loss;
- reload requires unlock and a wrong passphrase reveals no data;
- all automated checks pass;
- the deployed site is verified in a real browser;
- the existing repository, visual identity, and Sites project identifier are preserved.

## Security references

- [W3C Web Cryptography Level 2](https://www.w3.org/TR/WebCryptoAPI/)
- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [Google Identity Services token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
