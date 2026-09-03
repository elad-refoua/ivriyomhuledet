import { buildGoogleCalendarEvents } from "./calendar.js";

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";

const API_ROOT = "https://www.googleapis.com/calendar/v3";
const CALENDAR_STORAGE_KEY = "ivriyomhuledet.googleCalendarId.v1";
const APP_TAG = "ivriyomhuledet";

let currentAccessToken = "";

export function isGoogleConfigured(clientId) {
  return /^[0-9a-z-]+\.apps\.googleusercontent\.com$/i.test(String(clientId || "").trim());
}

export function isGoogleConnected() {
  return Boolean(currentAccessToken);
}

export async function prepareGoogleIdentity() {
  if (window.google?.accounts?.oauth2) return;

  await new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const check = () => {
      if (window.google?.accounts?.oauth2) {
        resolve();
        return;
      }
      if (Date.now() - startedAt > 10000) {
        reject(new Error("שירות החיבור של Google לא נטען. בדקו את החיבור לאינטרנט ונסו שוב."));
        return;
      }
      window.setTimeout(check, 100);
    };
    check();
  });
}

export async function connectGoogle(clientId) {
  if (!isGoogleConfigured(clientId)) {
    throw new Error("חיבור Google עדיין לא הופעל באתר.");
  }

  await prepareGoogleIdentity();

  currentAccessToken = await new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_CALENDAR_SCOPE,
      include_granted_scopes: true,
      callback: (response) => {
        if (response?.access_token) {
          resolve(response.access_token);
          return;
        }
        reject(new Error(authorizationErrorMessage(response?.error)));
      },
      error_callback: (error) => {
        reject(new Error(popupErrorMessage(error?.type)));
      },
    });

    tokenClient.requestAccessToken();
  });

  return currentAccessToken;
}

export function disconnectGoogle() {
  const token = currentAccessToken;
  currentAccessToken = "";
  if (token && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(token, () => {});
  }
}

export async function syncGoogleCalendar(people, { onProgress } = {}) {
  if (!currentAccessToken) {
    throw new Error("צריך להתחבר ל־Google לפני הסנכרון.");
  }

  const calendarId = await ensureCalendar(currentAccessToken);
  const sourceEvents = buildGoogleCalendarEvents(people, 20);
  const desiredEvents = await Promise.all(
    sourceEvents.map(async (event) => ({
      id: await stableEventId(event.personId, event.hebrewYear),
      source: event,
    }))
  );

  const existingEvents = await listManagedEvents(currentAccessToken, calendarId);
  const existingById = new Map(existingEvents.map((event) => [event.id, event]));
  const desiredIds = new Set(desiredEvents.map((event) => event.id));
  const staleEvents = existingEvents.filter((event) => !desiredIds.has(event.id));
  const totalActions = staleEvents.length + desiredEvents.length;
  let completedActions = 0;

  const reportProgress = (label) => {
    completedActions += 1;
    onProgress?.({
      completed: completedActions,
      total: totalActions,
      percent: totalActions ? Math.round((completedActions / totalActions) * 100) : 100,
      label,
    });
  };

  await mapInBatches(staleEvents, 4, async (event) => {
    await apiRequest(
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(event.id)}`,
      currentAccessToken,
      { method: "DELETE" }
    );
    reportProgress("מעדכנים את הרשימה ביומן…");
  });

  await mapInBatches(desiredEvents, 4, async ({ id, source }) => {
    const body = googleEventBody(id, source);
    if (existingById.has(id)) {
      await apiRequest(
        `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(id)}`,
        currentAccessToken,
        { method: "PUT", body: JSON.stringify(body) }
      );
    } else {
      await apiRequest(
        `/calendars/${encodeURIComponent(calendarId)}/events`,
        currentAccessToken,
        { method: "POST", body: JSON.stringify(body) }
      );
    }
    reportProgress("מוסיפים את ימי ההולדת…");
  });

  return { calendarId, eventCount: desiredEvents.length };
}

async function ensureCalendar(accessToken) {
  const storedId = localStorage.getItem(CALENDAR_STORAGE_KEY);
  if (storedId) {
    try {
      await apiRequest(`/calendars/${encodeURIComponent(storedId)}`, accessToken);
      return storedId;
    } catch (error) {
      if (error?.status !== 404) throw error;
      localStorage.removeItem(CALENDAR_STORAGE_KEY);
    }
  }

  const calendar = await apiRequest("/calendars", accessToken, {
    method: "POST",
    body: JSON.stringify({
      summary: "ימי הולדת עבריים",
      description: "ימי הולדת עבריים שנוספו באמצעות עבריולדת",
      timeZone: "Asia/Jerusalem",
    }),
  });

  if (!calendar?.id) throw new Error("Google לא החזיר מזהה ליומן החדש.");
  localStorage.setItem(CALENDAR_STORAGE_KEY, calendar.id);
  return calendar.id;
}

async function listManagedEvents(accessToken, calendarId) {
  const events = [];
  let pageToken = "";

  do {
    const params = new URLSearchParams({
      maxResults: "2500",
      singleEvents: "true",
      showDeleted: "false",
      privateExtendedProperty: `app=${APP_TAG}`,
    });
    if (pageToken) params.set("pageToken", pageToken);

    const response = await apiRequest(
      `/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      accessToken
    );
    events.push(...(response.items || []));
    pageToken = response.nextPageToken || "";
  } while (pageToken);

  return events;
}

function googleEventBody(id, event) {
  const reminders = event.reminderMinutes === null
    ? []
    : [{ method: "popup", minutes: event.reminderMinutes }];

  return {
    id,
    summary: event.summary,
    description: event.description,
    start: { date: event.startDate },
    end: { date: event.endDate },
    transparency: "transparent",
    status: "confirmed",
    reminders: { useDefault: false, overrides: reminders },
    extendedProperties: {
      private: {
        app: APP_TAG,
        personId: event.personId,
        hebrewYear: String(event.hebrewYear),
      },
    },
    source: {
      title: "עבריולדת",
      url: "https://elad-refoua.github.io/ivriyomhuledet/",
    },
  };
}

async function apiRequest(path, accessToken, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  if (response.ok) {
    if (response.status === 204) return null;
    return response.json();
  }

  let serverMessage = "";
  try {
    const payload = await response.json();
    serverMessage = payload?.error?.message || "";
  } catch {
    serverMessage = "";
  }

  const error = new Error(calendarErrorMessage(response.status, serverMessage));
  error.status = response.status;
  throw error;
}

async function stableEventId(personId, hebrewYear) {
  const value = `${APP_TAG}|${personId}|${hebrewYear}`;
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `ivri${hex.slice(0, 32)}`;
}

async function mapInBatches(items, size, task) {
  for (let index = 0; index < items.length; index += size) {
    await Promise.all(items.slice(index, index + size).map(task));
  }
}

function authorizationErrorMessage(code) {
  if (code === "access_denied") return "החיבור בוטל. לא נעשה שום שינוי ביומן.";
  return "לא הצלחנו לקבל הרשאה מ־Google. נסו שוב.";
}

function popupErrorMessage(type) {
  if (type === "popup_closed") return "חלון החיבור נסגר לפני שהסתיים התהליך.";
  if (type === "popup_failed_to_open") return "הדפדפן חסם את חלון Google. אפשרו חלונות קופצים ונסו שוב.";
  return "לא הצלחנו לפתוח את החיבור ל־Google.";
}

function calendarErrorMessage(status, serverMessage) {
  if (status === 401) return "החיבור ל־Google פג. התחברו מחדש ונסו שוב.";
  if (status === 403) return "Google לא אישר את הפעולה. בדקו את ההרשאה ונסו שוב.";
  if (status === 429) return "Google קיבל יותר מדי בקשות בבת אחת. המתינו רגע ונסו שוב.";
  if (status >= 500) return "יש כרגע תקלה זמנית ב־Google Calendar. נסו שוב בעוד כמה דקות.";
  return serverMessage ? `Google Calendar החזיר שגיאה: ${serverMessage}` : "הסנכרון ל־Google Calendar נכשל.";
}
