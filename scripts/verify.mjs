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
  connectGoogle,
  disconnectGoogle,
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
assert.match(indexHtml, /dir="rtl"/);
assert.match(
  indexHtml,
  /data-google-client-id="149595455712-o2q44abvsj4i62cfqguggcakgp28crjf\.apps\.googleusercontent\.com"/,
  "public Google OAuth client ID is missing"
);
assert.match(indexHtml, /privacy\.html/);
assert.match(indexHtml, /terms\.html/);
assert.match(privacyHtml, /פרטיות/);
assert.match(termsHtml, /תנאי/);
assert.match(accessibilityHtml, /<html lang="he" dir="rtl">/);
assert.match(accessibilityHtml, /הצהרת נגישות/);
assert.match(accessibilityHtml, /eladrefoua@gmail\.com/);

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

const storedValues = new Map();
globalThis.localStorage = {
  getItem: (key) => storedValues.get(key) ?? null,
  setItem: (key, value) => storedValues.set(key, String(value)),
  removeItem: (key) => storedValues.delete(key),
};

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

await connectGoogle("verification.apps.googleusercontent.com");
await syncGoogleCalendar([person]);
disconnectGoogle();

assert.equal(submittedGoogleEvents.length, 20, "expected 20 submitted Google events");
assert.ok(
  submittedGoogleEvents.every(
    (event) => event.source?.url === "https://elad-refoua.github.io/ivriyomhuledet/"
  ),
  "Google event source URL must point to the public GitHub Pages site"
);

console.log("✓ בדיקות עבריולדת עברו בהצלחה");

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  };
}
