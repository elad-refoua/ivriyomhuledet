import { runSecureStorageVerification } from "./verify-secure-storage.mjs";

await runSecureStorageVerification();

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import {
  birthFromHebrew,
  buildCalendarFile,
  buildGoogleCalendarEvents,
  formatHebrewDate,
  getFutureBirthdays,
  parseHebrewYear,
} from "../dist/calendar.js";
import {
  cancelGoogleSync,
  clearGoogleSession,
  connectGoogle,
  disconnectGoogle,
  isGoogleConnected,
  syncGoogleCalendar,
} from "../dist/google-calendar.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const acceptedYears = ["תשמ״ט", "התשמ״ט", "תשמט", "התשמט", "5749"];
for (const value of acceptedYears) {
  assert.equal(parseHebrewYear(value), 5749, `year parser failed for ${value}`);
}

const birth = birthFromHebrew(21, 6, "תשמ״ט");
assert.deepEqual(birth, { yy: 5749, mm: 6, dd: 21 });
assert.equal(formatHebrewDate(birth, true), "כ״א באלול תשמ״ט");

const person = {
  id: "verification-person",
  name: "ישראל ישראלי",
  birth,
  reminder: "evening",
};

const birthdays = getFutureBirthdays(person, 20, new Date("2026-09-03T12:00:00Z"));
assert.equal(birthdays.length, 20, "expected exactly 20 future birthdays");

const ics = buildCalendarFile([person], 20);
const unfoldedIcs = ics.replace(/\r\n[ \t]/g, "");
assert.match(ics, /BEGIN:VCALENDAR/);
assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 20, "ICS event count mismatch");
assert.match(unfoldedIcs, /יום ההולדת העברי של ישראל ישראלי/);
assert.match(unfoldedIcs, /תאריך הלידה העברי/);
assert.match(unfoldedIcs, /כ״א באלול תשמ״ט/);

const googleEvents = buildGoogleCalendarEvents(
  [person],
  20,
  new Date("2026-09-03T12:00:00Z")
);
assert.equal(googleEvents.length, 20, "Google event count mismatch");
assert.ok(googleEvents.every((event) => event.summary.includes("יום ההולדת העברי")));
assert.ok(googleEvents.every((event) => event.description.includes("תאריך הלידה העברי")));

const indexHtml = await readFile(resolve(root, "dist/index.html"), "utf8");
const privacyHtml = await readFile(resolve(root, "dist/privacy.html"), "utf8");
const termsHtml = await readFile(resolve(root, "dist/terms.html"), "utf8");
const accessibilityHtml = await readFile(resolve(root, "dist/accessibility.html"), "utf8");
const googleCalendarSource = await readFile(resolve(root, "dist/google-calendar.js"), "utf8");
const appSource = await readFile(resolve(root, "dist/app.js"), "utf8");
assert.match(appSource, /createVaultStore/);
assert.match(appSource, /await bootstrapVault\(\)/);
assert.match(appSource, /await vaultStore\.save/);
assert.match(appSource, /calendarId:\s*googleCalendarId/);
assert.match(appSource, /onCalendarReady/);
assert.match(appSource, /lifecycleEpoch/);
assert.match(appSource, /writeQueue/);
assert.match(appSource, /resetInProgress/);
assert.match(appSource, /await waitForPendingWrites\(\)/);
assert.match(appSource, /pendingVaultOperation/);
assert.match(appSource, /operationEpoch !== lifecycleEpoch/);
assert.match(appSource, /clearGoogleSession\(\)/);
assert.match(appSource, /invalidateSyncAfterBirthdayMutation/);
assert.ok(
  (appSource.match(/invalidateSyncAfterBirthdayMutation\(\);/g) || []).length >= 2,
  "birthday mutations must invalidate sync before persistence"
);
const addMutationStart = appSource.indexOf("const editingAtSubmit = editingId;");
const addMutationBlock = appSource.slice(addMutationStart, addMutationStart + 900);
assert.ok(
  addMutationBlock.indexOf("invalidateSyncAfterBirthdayMutation();") <
    addMutationBlock.indexOf("await persistState"),
  "birthday sync must be invalidated before add/edit persistence"
);
const deleteMutationStart = appSource.indexOf("const deletion = pendingDelete;");
const deleteMutationBlock = appSource.slice(deleteMutationStart, deleteMutationStart + 700);
assert.ok(
  deleteMutationBlock.indexOf("invalidateSyncAfterBirthdayMutation();") <
    deleteMutationBlock.indexOf("await persistState"),
  "birthday delete/clear sync must be invalidated before persistence"
);
assert.match(appSource, /catch \{\s*resetInProgress = false;/);
assert.match(appSource, /vaultStore\.status\(\)/g);
assert.match(appSource, /vaultSubmit\.disabled = false/);
assert.match(appSource, /לא הצלחנו לאפס את הכספת\. נסו שוב/);
assert.doesNotMatch(appSource, /localStorage/);
assert.doesNotMatch(appSource, /function loadPeople/);
assert.doesNotMatch(appSource, /function savePeople/);
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
assert.match(indexHtml, /dir="rtl"/);
assert.match(
  indexHtml,
  /data-google-client-id="149595455712-o2q44abvsj4i62cfqguggcakgp28crjf\.apps\.googleusercontent\.com"/,
  "public Google OAuth client ID is missing"
);
assert.match(indexHtml, /privacy\.html/);
assert.match(indexHtml, /terms\.html/);
assert.match(privacyHtml, /פרטיות/);
assert.match(privacyHtml, /AES-256-GCM/);
assert.match(privacyHtml, /הסיסמה אינה נשלחת/);
assert.match(privacyHtml, /אינה ניתנת לשחזור/);
assert.match(privacyHtml, /תוסף דפדפן|מכשיר/);
assert.match(termsHtml, /תנאי/);
assert.match(accessibilityHtml, /<html lang="he" dir="rtl">/);
assert.match(accessibilityHtml, /הצהרת נגישות/);
assert.match(accessibilityHtml, /פתיחת הכספת/);
assert.match(accessibilityHtml, /איפוס המידע המקומי/);
assert.match(accessibilityHtml, /eladrefoua@gmail\.com/);
assert.doesNotMatch(googleCalendarSource, /localStorage/);
assert.doesNotMatch(googleCalendarSource, /sessionStorage/);
assert.doesNotMatch(googleCalendarSource, /ivriyomhuledet\.googleCalendarId/);
assert.match(googleCalendarSource, /clearGoogleSession/);
assert.match(googleCalendarSource, /cancelGoogleSync/);
assert.match(googleCalendarSource, /requestGeneration/);
assert.match(googleCalendarSource, /requestGeneration !== connectionGeneration/);
assert.match(appSource, /typeof nextPeople === "function"/);
assert.match(appSource, /currentPeople/);
assert.match(appSource, /isLifecycleAbort\(error\)/);
assert.match(appSource, /syncRun \+= 1/);

for (const [name, html] of [
  ["index", indexHtml],
  ["privacy", privacyHtml],
  ["terms", termsHtml],
  ["accessibility", accessibilityHtml],
]) {
  assert.match(html, /class="skip-link" href="#main-content"/, `${name} is missing a skip link`);
  assert.match(html, /id="main-content"/, `${name} is missing the main-content target`);
  assert.match(html, /accessibility\.html/, `${name} is missing the accessibility link`);
}

globalThis.window = {
  google: {
    accounts: {
      oauth2: {
        initTokenClient: ({ callback }) => ({
          requestAccessToken: () => callback({ access_token: "test-access-token" }),
        }),
        revoke: (_token, callback) => callback(),
      },
    },
  },
};

const submittedGoogleEvents = [];
globalThis.fetch = async (url, options = {}) => {
  if (url.endsWith("/calendars") && options.method === "POST") {
    return jsonResponse({ id: "verification-calendar" });
  }
  if (url.includes("/calendars/verification-calendar/events?") && !options.method) {
    return jsonResponse({ items: [] });
  }
  if (url.endsWith("/calendars/verification-calendar/events") && options.method === "POST") {
    submittedGoogleEvents.push(JSON.parse(options.body));
    return jsonResponse({ id: `event-${submittedGoogleEvents.length}` });
  }
  throw new Error(`Unexpected Google Calendar request: ${options.method || "GET"} ${url}`);
};

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
assert.equal(submittedGoogleEvents.length, 20, "expected 20 submitted Google events");
assert.ok(
  submittedGoogleEvents.every(
    (event) => event.source?.url === "https://elad-refoua.github.io/ivriyomhuledet/"
  ),
  "Google event source URL must point to the public GitHub Pages site"
);

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

await connectGoogle("verification.apps.googleusercontent.com");
clearGoogleSession();
await assert.rejects(
  () => syncGoogleCalendar([person]),
  /צריך להתחבר ל־Google לפני הסנכרון/
);

let releaseCalendarRequest;
let calendarRequestStarted = false;
const calendarRequestGate = new Promise((resolve) => {
  releaseCalendarRequest = resolve;
});
globalThis.fetch = async (url, options = {}) => {
  if (url.includes("/calendars/cancellable-calendar") && !options.method) {
    calendarRequestStarted = true;
    await calendarRequestGate;
    return jsonResponse({ id: "cancellable-calendar" });
  }
  throw new Error(`Unexpected cancellation request: ${options.method || "GET"} ${url}`);
};
await connectGoogle("verification.apps.googleusercontent.com");
const pendingSync = syncGoogleCalendar([person], { calendarId: "cancellable-calendar" });
while (!calendarRequestStarted) await new Promise((resolve) => setImmediate(resolve));
clearGoogleSession();
releaseCalendarRequest();
await assert.rejects(() => pendingSync, /החיבור ל־Google בוטל/);

let deferredTokenCallback;
globalThis.window.google.accounts.oauth2.initTokenClient = ({ callback }) => {
  deferredTokenCallback = callback;
  return { requestAccessToken: () => {} };
};
const pendingConnection = connectGoogle("verification.apps.googleusercontent.com");
while (!deferredTokenCallback) await new Promise((resolve) => setImmediate(resolve));
clearGoogleSession();
deferredTokenCallback({ access_token: "stale-access-token" });
await assert.rejects(() => pendingConnection, /החיבור ל־Google בוטל/);
assert.equal(isGoogleConnected(), false);

globalThis.window.google.accounts.oauth2.initTokenClient = ({ callback }) => ({
  requestAccessToken: () => callback({ access_token: "test-access-token" }),
});
let releaseMutationSync;
let mutationSyncStarted = false;
const mutationSyncGate = new Promise((resolve) => {
  releaseMutationSync = resolve;
});
globalThis.fetch = async (url, options = {}) => {
  if (url.includes("/calendars/mutation-calendar") && !options.method) {
    mutationSyncStarted = true;
    await mutationSyncGate;
    return jsonResponse({ id: "mutation-calendar" });
  }
  throw new Error(`Unexpected mutation cancellation request: ${options.method || "GET"} ${url}`);
};
await connectGoogle("verification.apps.googleusercontent.com");
const pendingMutationSync = syncGoogleCalendar([person], { calendarId: "mutation-calendar" });
while (!mutationSyncStarted) await new Promise((resolve) => setImmediate(resolve));
cancelGoogleSync();
assert.equal(isGoogleConnected(), true);
releaseMutationSync();
await assert.rejects(() => pendingMutationSync, /החיבור ל־Google בוטל/);
assert.equal(isGoogleConnected(), true);
disconnectGoogle();

console.log("✓ בדיקות עבריולדת עברו בהצלחה");

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  };
}

function errorResponse(status, message = "") {
  return {
    ok: false,
    status,
    json: async () => ({ error: { message } }),
  };
}
