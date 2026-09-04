import {
  HEBREW_MONTHS,
  birthFromGregorian,
  birthFromHebrew,
  buildCalendarFile,
  formatGregorianDate,
  formatHebrewDate,
  formatHebrewNumber,
  getCurrentHebrewYear,
  getFutureBirthdays,
  isHebrewLeapYear,
  parseHebrewYear,
  relativeDayLabel,
} from "./calendar.js?v=20260904";
import {
  cancelGoogleSync,
  clearGoogleSession,
  connectGoogle,
  disconnectGoogle,
  isGoogleConfigured,
  isGoogleConnected,
  prepareGoogleIdentity,
  syncGoogleCalendar,
} from "./google-calendar.js?v=20260904";
import { createVaultStore } from "./secure-storage.js?v=20260904";

const GOOGLE_CLIENT_ID = document.body.dataset.googleClientId?.trim() || "";
const SAVE_FAILURE_MESSAGE = "השינוי לא נשמר. המידע הקודם נשאר ללא שינוי.";

const form = document.getElementById("birthday-form");
const formTitle = document.getElementById("form-title");
const nameInput = document.getElementById("person-name");
const gregorianFields = document.getElementById("gregorian-fields");
const gregorianInput = document.getElementById("gregorian-date");
const afterSunsetInput = document.getElementById("after-sunset");
const gregorianDatePreview = document.getElementById("gregorian-date-preview");
const hebrewFields = document.getElementById("hebrew-fields");
const hebrewDayInput = document.getElementById("hebrew-day");
const hebrewMonthInput = document.getElementById("hebrew-month");
const hebrewYearInput = document.getElementById("hebrew-year");
const hebrewDatePreview = document.getElementById("hebrew-date-preview");
const reminderInput = document.getElementById("reminder");
const formMessage = document.getElementById("form-message");
const submitLabel = document.getElementById("submit-label");
const cancelEditButton = document.getElementById("cancel-edit");
const emptyState = document.getElementById("empty-state");
const emptyFocusButton = document.getElementById("empty-focus-form");
const peopleList = document.getElementById("people-list");
const peopleCount = document.getElementById("people-count");
const clearButton = document.getElementById("clear-all");
const downloadButton = document.getElementById("download-calendar");
const downloadStatus = document.getElementById("download-status");
const syncCard = document.getElementById("sync-card");
const syncDescription = document.getElementById("sync-description");
const connectionBadge = document.getElementById("connection-badge");
const googleActionButton = document.getElementById("google-action");
const googleButtonLabel = document.getElementById("google-button-label");
const disconnectButton = document.getElementById("disconnect-google");
const syncProgress = document.getElementById("sync-progress");
const progressBar = document.getElementById("progress-bar");
const progressText = document.getElementById("progress-text");
const syncSuccess = document.getElementById("sync-success");
const syncSuccessCopy = document.getElementById("sync-success-copy");
const syncError = document.getElementById("sync-error");
const confirmDialog = document.getElementById("confirm-dialog");
const confirmTitle = document.getElementById("confirm-title");
const confirmCopy = document.getElementById("confirm-copy");
const toast = document.getElementById("toast");
const flowSteps = [...document.querySelectorAll("[data-flow-step]")];
const appShell = document.getElementById("app-shell");
const lockButton = document.getElementById("lock-vault");
const vaultDialog = document.getElementById("vault-dialog");
const vaultForm = document.getElementById("vault-form");
const vaultTitle = document.getElementById("vault-title");
const vaultCopy = document.getElementById("vault-copy");
const vaultPassphrase = document.getElementById("vault-passphrase");
const vaultConfirm = document.getElementById("vault-confirm");
const vaultConfirmField = document.getElementById("vault-confirm-field");
const vaultError = document.getElementById("vault-error");
const vaultSubmit = document.getElementById("vault-submit");
const vaultReset = document.getElementById("vault-reset");
const vaultResetConfirm = document.getElementById("vault-reset-confirm");
const vaultResetCancel = document.getElementById("vault-reset-cancel");
const vaultResetApprove = document.getElementById("vault-reset-approve");
const birthdaySubmit = form.querySelector('button[type="submit"]');

const vaultStore = createVaultStore();
let people = [];
let googleCalendarId = "";
let editingId = null;
let pendingDelete = null;
let isSyncing = false;
let hasSynced = false;
let toastTimer = null;
let vaultMode = "unlock";
let vaultReadyResolver = null;
let syncRun = 0;
let lifecycleEpoch = 0;
let writeQueue = Promise.resolve();
let pendingVaultOperation = Promise.resolve();
let resetInProgress = false;

vaultDialog.addEventListener("cancel", (event) => event.preventDefault());
vaultForm.addEventListener("submit", handleVaultSubmit);
vaultReset.addEventListener("click", () => {
  vaultResetConfirm.hidden = false;
  vaultReset.focus();
});
vaultResetCancel.addEventListener("click", () => {
  vaultResetConfirm.hidden = true;
  vaultReset.focus();
});
vaultResetApprove.addEventListener("click", handleVaultReset);

await bootstrapVault();

initializeForm();
renderPeople();
document.getElementById("footer-year").textContent = String(new Date().getFullYear());

if (isGoogleConfigured(GOOGLE_CLIENT_ID)) {
  prepareGoogleIdentity().catch(() => {
    showSyncError("שירות החיבור של Google לא נטען. בדקו את החיבור לאינטרנט ורעננו את הדף.");
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (birthdaySubmit.disabled) return;
  hideFormMessage();
  let saveAttempted = false;
  birthdaySubmit.disabled = true;
  const operationEpoch = lifecycleEpoch;

  try {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      throw new Error("נא להזין שם.");
    }

    const mode = form.elements.dateMode.value;
    const birth = mode === "gregorian"
      ? birthFromGregorian(gregorianInput.value, afterSunsetInput.checked)
      : birthFromHebrew(hebrewDayInput.value, hebrewMonthInput.value, hebrewYearInput.value);

    const editingAtSubmit = editingId;
    const person = {
      id: editingAtSubmit || createId(),
      name,
      birth,
      reminder: reminderInput.value,
    };

    invalidateSyncAfterBirthdayMutation();
    saveAttempted = true;
    await persistState((currentPeople) => editingAtSubmit
      ? currentPeople.map((item) => (item.id === editingAtSubmit ? person : item))
      : [...currentPeople, person]);
    showToast(editingAtSubmit ? `הפרטים של ${name} עודכנו` : `${name} נוסף לרשימה`);
    renderPeople();
    resetForm();
    nameInput.focus();
  } catch (error) {
    if (isLifecycleAbort(error)) return;
    const message = saveAttempted
      ? SAVE_FAILURE_MESSAGE
      : error instanceof Error ? error.message : "לא הצלחנו להוסיף את התאריך.";
    showFormMessage(message);
    if (form.elements.dateMode.value === "gregorian" && !gregorianInput.value) gregorianInput.focus();
    if (form.elements.dateMode.value === "hebrew" && !hebrewYearInput.value.trim()) hebrewYearInput.focus();
  } finally {
    if (lifecycleEpoch === operationEpoch && !resetInProgress) birthdaySubmit.disabled = false;
  }
});

form.addEventListener("change", (event) => {
  if (event.target.name === "dateMode") updateMode();
  if (event.target === hebrewYearInput) updateHebrewMonths();
  if ([hebrewDayInput, hebrewMonthInput, hebrewYearInput].includes(event.target)) updateHebrewPreview();
  if ([gregorianInput, afterSunsetInput].includes(event.target)) updateGregorianPreview();
});

gregorianInput.addEventListener("input", updateGregorianPreview);

hebrewYearInput.addEventListener("input", () => {
  updateHebrewMonths();
  updateHebrewPreview();
});

peopleList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const person = people.find((item) => item.id === button.dataset.personId);
  if (!person) return;

  if (button.dataset.action === "edit") startEditing(person);
  if (button.dataset.action === "delete") requestPersonDeletion(person);
});

cancelEditButton.addEventListener("click", () => {
  resetForm();
  nameInput.focus();
});

emptyFocusButton.addEventListener("click", () => {
  nameInput.focus();
  document.querySelector(".form-surface").scrollIntoView({ behavior: "smooth", block: "start" });
});

clearButton.addEventListener("click", () => {
  pendingDelete = { type: "all" };
  confirmTitle.textContent = "למחוק את כל הרשימה?";
  confirmCopy.textContent = "כל ימי ההולדת יימחקו מהמכשיר הזה. בסנכרון הבא הם יוסרו גם מהיומן שיצרה עבריולדת.";
  openConfirmDialog();
});

confirmDialog.addEventListener("close", async () => {
  if (confirmDialog.returnValue !== "confirm" || !pendingDelete) {
    pendingDelete = null;
    return;
  }

  const deletion = pendingDelete;
  pendingDelete = null;
  invalidateSyncAfterBirthdayMutation();
  try {
    await persistState((currentPeople) => deletion.type === "person"
      ? currentPeople.filter((person) => person.id !== deletion.id)
      : []);
  } catch (error) {
    if (isLifecycleAbort(error)) return;
    showToast(SAVE_FAILURE_MESSAGE);
    showFormMessage(SAVE_FAILURE_MESSAGE);
    return;
  }

  if (deletion.type === "person") {
    const removed = people.find((person) => person.id === deletion.id);
    if (editingId === deletion.id) resetForm();
    showToast(removed ? `${removed.name} הוסר מהרשימה` : "יום ההולדת הוסר");
  } else {
    resetForm();
    showToast("הרשימה נמחקה");
  }

  hasSynced = false;
  syncSuccess.hidden = true;
  renderPeople();
});

downloadButton.addEventListener("click", () => {
  if (!people.length) return;
  const calendar = buildCalendarFile(people, 20);
  const blob = new Blob([calendar], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ימי-הולדת-עבריים.ics";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  downloadStatus.textContent = `הקובץ הוכן עבור ${people.length} ${people.length === 1 ? "אדם" : "אנשים"}, ל־20 השנים הבאות.`;
  showToast("קובץ היומן מוכן");
});

googleActionButton.addEventListener("click", async () => {
  if (!people.length || isSyncing) return;
  const currentSyncRun = ++syncRun;
  hideSyncError();
  syncSuccess.hidden = true;
  hasSynced = false;
  setSyncing(true, "מתחברים ל־Google…", 7);

  try {
    if (!isGoogleConnected()) {
      await connectGoogle(GOOGLE_CLIENT_ID);
      if (currentSyncRun !== syncRun) return;
      setSyncing(true, "החיבור אושר. מכינים יומן נפרד…", 14);
      updateGoogleUI();
    }

    const result = await syncGoogleCalendar(people, {
      calendarId: googleCalendarId,
      onCalendarReady: async (calendarId) => {
        if (currentSyncRun !== syncRun) return;
        if (calendarId !== googleCalendarId) {
          await persistState((currentPeople) => currentPeople, calendarId);
        }
      },
      onProgress: ({ percent, label }) => {
        if (currentSyncRun !== syncRun) return;
        const visiblePercent = 14 + Math.round(percent * 0.86);
        setSyncing(true, label, visiblePercent);
      },
    });

    if (currentSyncRun !== syncRun) return;
    hasSynced = true;
    syncSuccessCopy.textContent = `${result.eventCount} מועדים נוספו ל־20 השנים הבאות.`;
    syncSuccess.hidden = false;
    showToast("הסנכרון הסתיים בהצלחה");
  } catch (error) {
    if (currentSyncRun !== syncRun) return;
    const message = error instanceof Error ? error.message : "הסנכרון נכשל. נסו שוב.";
    showSyncError(message);
    if (message.includes("פג")) disconnectGoogle();
  } finally {
    if (currentSyncRun !== syncRun) return;
    setSyncing(false);
    updateGoogleUI();
  }
});

disconnectButton.addEventListener("click", () => {
  syncRun += 1;
  disconnectGoogle();
  setSyncing(false);
  hasSynced = false;
  syncSuccess.hidden = true;
  hideSyncError();
  updateGoogleUI();
  showToast("חשבון Google נותק");
});

lockButton.addEventListener("click", lockApplication);

function bootstrapVault() {
  return new Promise((resolve) => {
    vaultReadyResolver = resolve;
    let status;
    try {
      status = vaultStore.status();
    } catch {
      status = "locked";
      showVaultError("לא הצלחנו לגשת לאחסון המקומי. נסו לרענן את הדף.");
    }

    setVaultMode(status === "legacy" ? "migrate" : status === "empty" ? "create" : "unlock");
    appShell.setAttribute("aria-hidden", "true");
    appShell.setAttribute("inert", "");
    lockButton.hidden = true;
    showVaultDialog();
    vaultPassphrase.focus();
  });
}

function setVaultMode(mode) {
  vaultMode = mode;
  vaultResetConfirm.hidden = true;
  vaultConfirmField.hidden = mode === "unlock";
  vaultConfirm.required = mode !== "unlock";
  vaultReset.hidden = mode !== "unlock";
  vaultTitle.textContent = mode === "create"
    ? "יוצרים כספת לרשימת ימי ההולדת"
    : mode === "migrate"
      ? "מעבירים את הרשימה לכספת מוצפנת"
      : "פותחים את רשימת ימי ההולדת";
  vaultCopy.textContent = mode === "create"
    ? "בחרו סיסמה שתצפין את הרשימה במכשיר הזה בלבד. אם תשכחו אותה, גם בעלי האתר לא יכולים לשחזר את המידע."
    : mode === "migrate"
      ? "מצאנו רשימת ימי הולדת קיימת. הסיסמה שתבחרו תצפין אותה במכשיר הזה, והנתונים הישנים יימחקו רק אחרי בדיקת ההצפנה."
      : "הסיסמה שלך מצפינה את הרשימה במכשיר הזה בלבד. אם תשכחו אותה, גם בעלי האתר לא יכולים לשחזר אותה.";
  vaultSubmit.textContent = mode === "unlock"
    ? "פתיחת הכספת"
    : mode === "migrate" ? "הצפנת הרשימה ופתיחת הכספת" : "יצירת הכספת";
  vaultPassphrase.autocomplete = mode === "unlock" ? "current-password" : "new-password";
  hideVaultError();
}

function showVaultDialog() {
  if (vaultDialog.open) vaultDialog.close();
  vaultDialog.showModal();
}

async function handleVaultSubmit(event) {
  event.preventDefault();
  if (vaultSubmit.disabled) return;
  hideVaultError();
  vaultSubmit.disabled = true;
  const operationEpoch = lifecycleEpoch;
  const operation = vaultSubmitOperation(operationEpoch, vaultPassphrase.value);
  const trackedOperation = operation.catch(() => {});
  pendingVaultOperation = trackedOperation;

  try {
    const data = await operation;
    if (operationEpoch !== lifecycleEpoch || resetInProgress) throw lifecycleAbort();
    lifecycleEpoch += 1;
    resetInProgress = false;
    people = data.people;
    googleCalendarId = data.googleCalendarId;
    appShell.removeAttribute("inert");
    appShell.removeAttribute("aria-hidden");
    lockButton.hidden = false;
    vaultResetConfirm.hidden = true;
    renderPeople();
    vaultDialog.close();
    nameInput.focus();
    vaultReadyResolver?.();
    vaultReadyResolver = null;
  } catch (error) {
    if (isLifecycleAbort(error)) {
      vaultStore.lock();
      return;
    }
    showVaultError(vaultErrorMessage(error));
    vaultPassphrase.focus();
  } finally {
    if (pendingVaultOperation === trackedOperation) pendingVaultOperation = Promise.resolve();
    vaultPassphrase.value = "";
    vaultConfirm.value = "";
    if (!resetInProgress) vaultSubmit.disabled = false;
  }
}

async function vaultSubmitOperation(operationEpoch, passphrase) {
  if (operationEpoch !== lifecycleEpoch || resetInProgress) throw lifecycleAbort();
  await waitForPendingWrites();
  if (operationEpoch !== lifecycleEpoch || resetInProgress) throw lifecycleAbort();
  if (vaultMode !== "unlock" && passphrase !== vaultConfirm.value) {
    throw new Error("הסיסמאות אינן תואמות.");
  }

  let data;
  if (vaultMode === "create") {
    data = { version: 1, people: [], googleCalendarId: "" };
    await vaultStore.create(passphrase, data);
  } else if (vaultMode === "migrate") {
    data = await vaultStore.migrate(passphrase);
  } else {
    data = await vaultStore.unlock(passphrase);
  }
  if (operationEpoch !== lifecycleEpoch || resetInProgress) {
    vaultStore.lock();
    throw lifecycleAbort();
  }
  return data;
}

async function handleVaultReset() {
  if (vaultResetApprove.disabled) return;
  vaultResetApprove.disabled = true;
  hideVaultError();
  resetInProgress = true;
  lifecycleEpoch += 1;
  syncRun += 1;
  clearGoogleSession();
  clearApplicationState();
  vaultStore.lock();
  try {
    await pendingVaultOperation.catch(() => {});
    await waitForPendingWrites();
    vaultStore.reset();
    resetInProgress = false;
    appShell.setAttribute("aria-hidden", "true");
    appShell.setAttribute("inert", "");
    lockButton.hidden = true;
    vaultSubmit.disabled = false;
    setVaultMode("create");
    vaultPassphrase.focus();
  } catch {
    resetInProgress = false;
    vaultStore.lock();
    keepVaultShellLocked();
    const status = safeVaultStatus();
    setVaultMode(status === "legacy" ? "migrate" : status === "empty" ? "create" : "unlock");
    showVaultError("לא הצלחנו לאפס את הכספת. נסו שוב.");
    vaultPassphrase.focus();
  } finally {
    vaultResetApprove.disabled = false;
    if (!resetInProgress) vaultSubmit.disabled = false;
  }
}

function safeVaultStatus() {
  try {
    return vaultStore.status();
  } catch {
    return "locked";
  }
}

function keepVaultShellLocked() {
  appShell.setAttribute("aria-hidden", "true");
  appShell.setAttribute("inert", "");
  lockButton.hidden = true;
}

function lockApplication() {
  lifecycleEpoch += 1;
  syncRun += 1;
  disconnectGoogle();
  clearApplicationState();
  vaultStore.lock();
  appShell.setAttribute("aria-hidden", "true");
  appShell.setAttribute("inert", "");
  lockButton.hidden = true;
  setVaultMode("unlock");
  showVaultDialog();
  vaultPassphrase.focus();
}

async function persistState(nextPeople, nextCalendarId) {
  const operationEpoch = lifecycleEpoch;
  if (resetInProgress) throw lifecycleAbort();
  const operation = writeQueue.then(async () => {
    if (operationEpoch !== lifecycleEpoch || resetInProgress) throw lifecycleAbort();
    const resolvedPeople = typeof nextPeople === "function" ? nextPeople(people) : nextPeople;
    const resolvedCalendarId = nextCalendarId === undefined ? googleCalendarId : nextCalendarId;
    await vaultStore.save({
      version: 1,
      people: resolvedPeople,
      googleCalendarId: resolvedCalendarId,
    });
    if (operationEpoch !== lifecycleEpoch || resetInProgress) throw lifecycleAbort();
    people = resolvedPeople;
    googleCalendarId = resolvedCalendarId;
  });
  writeQueue = operation.catch(() => {});
  return operation;
}

async function waitForPendingWrites() {
  await writeQueue.catch(() => {});
}

function lifecycleAbort() {
  const error = new Error("פעולת הכספת בוטלה.");
  error.code = "VAULT_LIFECYCLE_ABORTED";
  return error;
}

function isLifecycleAbort(error) {
  return error?.code === "VAULT_LIFECYCLE_ABORTED";
}

function invalidateSyncAfterBirthdayMutation() {
  syncRun += 1;
  cancelGoogleSync();
  setSyncing(false);
  hasSynced = false;
  syncSuccess.hidden = true;
  hideSyncError();
}

function clearApplicationState() {
  people = [];
  googleCalendarId = "";
  editingId = null;
  pendingDelete = null;
  hasSynced = false;
  isSyncing = false;
  syncProgress.hidden = true;
  progressBar.style.width = "0%";
  progressText.textContent = "";
  syncSuccess.hidden = true;
  hideSyncError();
  hideFormMessage();
  downloadStatus.textContent = "";
  peopleList.replaceChildren();
  birthdaySubmit.disabled = false;
  if (confirmDialog.open) confirmDialog.close("cancel");
  resetForm();
  renderPeople();
  window.clearTimeout(toastTimer);
  toast.hidden = true;
  toast.textContent = "";
}

function showVaultError(message) {
  vaultError.textContent = message;
  vaultError.hidden = false;
}

function hideVaultError() {
  vaultError.hidden = true;
  vaultError.textContent = "";
}

function vaultErrorMessage(error) {
  if (error instanceof Error && /[\u0590-\u05ff]/u.test(error.message)) return error.message;
  return "לא הצלחנו לפתוח את הכספת. נסו שוב.";
}

function initializeForm() {
  const now = new Date();
  gregorianInput.max = toIsoDate(now);

  for (let day = 1; day <= 30; day += 1) {
    const option = document.createElement("option");
    option.value = String(day);
    option.textContent = formatHebrewNumber(day);
    hebrewDayInput.appendChild(option);
  }

  hebrewDayInput.value = "1";
  hebrewYearInput.placeholder = `למשל ${formatHebrewNumber(getCurrentHebrewYear(now) - 30)}`;
  updateHebrewMonths();
}

function updateMode() {
  const isGregorian = form.elements.dateMode.value === "gregorian";
  gregorianFields.hidden = !isGregorian;
  hebrewFields.hidden = isGregorian;
  gregorianInput.required = isGregorian;
  hebrewDayInput.required = !isGregorian;
  hebrewMonthInput.required = !isGregorian;
  hebrewYearInput.required = !isGregorian;
  hideFormMessage();
  updateHebrewPreview();
  updateGregorianPreview();
}

function updateHebrewMonths() {
  const previous = Number(hebrewMonthInput.value) || 7;
  const year = parseHebrewYear(hebrewYearInput.value);
  const leap = Number.isInteger(year) && isHebrewLeapYear(year);

  hebrewMonthInput.replaceChildren();
  for (const month of HEBREW_MONTHS) {
    if (month.leapOnly && !leap) continue;
    const option = document.createElement("option");
    option.value = String(month.value);
    option.textContent = month.value === 12 && leap ? "אדר א׳" : month.name;
    hebrewMonthInput.appendChild(option);
  }

  const available = [...hebrewMonthInput.options].some((option) => Number(option.value) === previous);
  hebrewMonthInput.value = String(available ? previous : 12);
}

function updateHebrewPreview() {
  if (form.elements.dateMode.value !== "hebrew") {
    hebrewDatePreview.hidden = true;
    return;
  }

  const yy = parseHebrewYear(hebrewYearInput.value);
  const mm = Number(hebrewMonthInput.value);
  const dd = Number(hebrewDayInput.value);
  if (!Number.isInteger(yy) || !mm || !dd) {
    hebrewDatePreview.hidden = true;
    return;
  }

  try {
    const birth = birthFromHebrew(dd, mm, yy);
    hebrewDatePreview.innerHTML = `כך יישמר: <strong>${formatHebrewDate(birth, true)}</strong>`;
    hebrewDatePreview.hidden = false;
  } catch {
    hebrewDatePreview.hidden = true;
  }
}

function updateGregorianPreview() {
  if (form.elements.dateMode.value !== "gregorian" || !gregorianInput.value) {
    gregorianDatePreview.hidden = true;
    return;
  }

  try {
    const birth = birthFromGregorian(gregorianInput.value, afterSunsetInput.checked);
    gregorianDatePreview.innerHTML = `התאריך העברי: <strong>${formatHebrewDate(birth, true)}</strong>`;
    gregorianDatePreview.hidden = false;
  } catch {
    gregorianDatePreview.hidden = true;
  }
}

function renderPeople() {
  const withNextBirthday = people
    .map((person) => ({ person, birthdays: getFutureBirthdays(person, 20) }))
    .filter((item) => item.birthdays.length)
    .sort((a, b) => a.birthdays[0].gregorian - b.birthdays[0].gregorian);

  peopleList.replaceChildren();
  for (const item of withNextBirthday) {
    peopleList.appendChild(createPersonCard(item.person, item.birthdays));
  }

  const hasPeople = people.length > 0;
  emptyState.hidden = hasPeople;
  clearButton.hidden = !hasPeople;
  downloadButton.disabled = !hasPeople;
  peopleCount.textContent = hasPeople
    ? `${people.length} ${people.length === 1 ? "אדם מוכן לסנכרון" : "אנשים מוכנים לסנכרון"}`
    : "עוד לא הוספת אנשים";
  if (!hasPeople) downloadStatus.textContent = "";
  updateGoogleUI();
}

function createPersonCard(person, birthdays) {
  const next = birthdays[0];
  const card = document.createElement("li");
  card.className = "person-card";

  const main = document.createElement("div");
  main.className = "person-card-main";

  const tile = document.createElement("div");
  tile.className = "date-tile";
  tile.setAttribute("aria-hidden", "true");
  const shortHebrewDate = formatHebrewDate(next.hdate, false);
  const [day, ...monthParts] = shortHebrewDate.split(" ");
  const tileDay = document.createElement("strong");
  tileDay.textContent = day;
  const tileMonth = document.createElement("small");
  tileMonth.textContent = monthParts.join(" ").replace(/^ב/, "");
  tile.append(tileDay, tileMonth);

  const info = document.createElement("div");
  info.className = "person-info";
  const titleRow = document.createElement("div");
  titleRow.className = "person-title-row";
  const title = document.createElement("h3");
  title.textContent = person.name;
  const age = document.createElement("span");
  age.className = "age-badge";
  age.textContent = `גיל ${next.age}`;
  titleRow.append(title, age);

  const nextLine = document.createElement("p");
  nextLine.className = "person-next";
  const gregorianDate = document.createElement("strong");
  gregorianDate.textContent = formatGregorianDate(next.gregorian);
  nextLine.append(gregorianDate, document.createTextNode(` · ${relativeDayLabel(next.gregorian)}`));

  const original = document.createElement("p");
  original.className = "person-original";
  original.textContent = `תאריך לידה: ${formatHebrewDate(person.birth, true)} · ${reminderLabel(person.reminder)}`;
  info.append(titleRow, nextLine, original);

  const actions = document.createElement("div");
  actions.className = "person-actions";
  actions.append(
    createIconButton("edit", person, "עריכה", '<path d="m4 16-.7 4.7L8 20l11-11-4-4L4 16Z"></path><path d="m13.5 6.5 4 4"></path>'),
    createIconButton("delete", person, "מחיקה", '<path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"></path>')
  );

  main.append(tile, info, actions);

  const upcoming = document.createElement("details");
  upcoming.className = "upcoming-dates";
  const summary = document.createElement("summary");
  summary.innerHTML = `<span>כל ${birthdays.length} המועדים של ${escapeHtml(person.name)}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"></path></svg>`;
  const datesList = document.createElement("ol");
  for (const birthday of birthdays) {
    const row = document.createElement("li");
    const hebrew = document.createElement("strong");
    hebrew.textContent = formatHebrewDate(birthday.hdate, true);
    const gregorian = document.createElement("span");
    gregorian.textContent = formatGregorianDate(birthday.gregorian, true);
    const rowAge = document.createElement("small");
    rowAge.textContent = `גיל ${birthday.age}`;
    row.append(hebrew, gregorian, rowAge);
    datesList.appendChild(row);
  }
  upcoming.append(summary, datesList);

  card.append(main, upcoming);
  return card;
}

function createIconButton(action, person, label, iconPath) {
  const button = document.createElement("button");
  button.className = `icon-button ${action === "delete" ? "delete" : ""}`;
  button.type = "button";
  button.dataset.action = action;
  button.dataset.personId = person.id;
  button.setAttribute("aria-label", `${label}: ${person.name}`);
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${iconPath}</svg>`;
  return button;
}

function startEditing(person) {
  editingId = person.id;
  formTitle.textContent = `עריכת ${person.name}`;
  submitLabel.textContent = "שמור שינויים";
  cancelEditButton.hidden = false;
  nameInput.value = person.name;
  form.elements.dateMode.value = "hebrew";
  hebrewDayInput.value = String(person.birth.dd);
  hebrewYearInput.value = formatHebrewNumber(person.birth.yy);
  updateHebrewMonths();
  hebrewMonthInput.value = String(person.birth.mm);
  reminderInput.value = person.reminder || "evening";
  updateMode();
  updateHebrewPreview();
  document.querySelector(".form-surface").scrollIntoView({ behavior: "smooth", block: "start" });
  nameInput.focus();
}

function resetForm() {
  editingId = null;
  form.reset();
  formTitle.textContent = "הוספת יום הולדת";
  submitLabel.textContent = "הוסף לרשימה";
  cancelEditButton.hidden = true;
  hebrewDayInput.value = "1";
  hebrewYearInput.value = "";
  updateHebrewMonths();
  updateMode();
  hideFormMessage();
}

function requestPersonDeletion(person) {
  pendingDelete = { type: "person", id: person.id };
  confirmTitle.textContent = `למחוק את ${person.name}?`;
  confirmCopy.textContent = "יום ההולדת יימחק מהרשימה במכשיר הזה. בסנכרון הבא הוא יוסר גם מהיומן שיצרה עבריולדת.";
  openConfirmDialog();
}

function openConfirmDialog() {
  confirmDialog.returnValue = "cancel";
  if (typeof confirmDialog.showModal === "function") {
    confirmDialog.showModal();
  } else if (window.confirm(confirmCopy.textContent)) {
    confirmDialog.returnValue = "confirm";
    confirmDialog.dispatchEvent(new Event("close"));
  }
}

function updateGoogleUI() {
  const hasPeople = people.length > 0;
  const configured = isGoogleConfigured(GOOGLE_CLIENT_ID);
  const connected = isGoogleConnected();

  syncCard.classList.toggle("is-ready", hasPeople);
  connectionBadge.classList.toggle("is-connected", connected && !hasSynced);
  connectionBadge.classList.toggle("is-synced", hasSynced);
  disconnectButton.hidden = !connected;

  if (!hasPeople) {
    syncDescription.textContent = "הוסיפו אדם אחד לפחות כדי להמשיך.";
    connectionBadge.textContent = connected ? "מחובר" : "לא מחובר";
    googleButtonLabel.textContent = "חבר את Google וסנכרן";
    googleActionButton.disabled = true;
  } else if (!configured) {
    syncDescription.textContent = "הרשימה מוכנה. חיבור Google יופעל לפני הפרסום.";
    connectionBadge.textContent = "בהכנה";
    googleButtonLabel.textContent = "חיבור Google בהכנה";
    googleActionButton.disabled = true;
  } else if (connected) {
    syncDescription.textContent = `יומן נפרד עם ${people.length} ${people.length === 1 ? "אדם" : "אנשים"} ו־20 שנים קדימה.`;
    connectionBadge.textContent = hasSynced ? "מסונכרן" : "מחובר";
    googleButtonLabel.textContent = hasSynced ? "סנכרן שוב" : "סנכרן עכשיו";
    googleActionButton.disabled = isSyncing;
  } else {
    syncDescription.textContent = `נוסיף ${people.length * 20} מועדים ליומן נפרד בחשבון שלך.`;
    connectionBadge.textContent = "לא מחובר";
    googleButtonLabel.textContent = "חבר את Google וסנכרן";
    googleActionButton.disabled = isSyncing;
  }

  updateFlow(hasPeople, connected, hasSynced);
}

function updateFlow(hasPeople, connected, synced) {
  for (const step of flowSteps) {
    step.classList.remove("is-active", "is-complete");
  }

  const peopleStep = flowSteps.find((step) => step.dataset.flowStep === "people");
  const connectStep = flowSteps.find((step) => step.dataset.flowStep === "connect");
  const syncStep = flowSteps.find((step) => step.dataset.flowStep === "sync");

  if (!hasPeople) {
    peopleStep.classList.add("is-active");
    return;
  }
  peopleStep.classList.add("is-complete");

  if (!connected) {
    connectStep.classList.add("is-active");
    return;
  }
  connectStep.classList.add("is-complete");

  if (synced) syncStep.classList.add("is-complete");
  else syncStep.classList.add("is-active");
}

function setSyncing(active, label = "", percent = 0) {
  isSyncing = active;
  syncProgress.hidden = !active;
  if (active) {
    progressText.textContent = label;
    progressBar.style.width = `${Math.max(5, Math.min(100, percent))}%`;
  } else {
    progressText.textContent = "";
    progressBar.style.width = "0%";
  }
  updateGoogleUI();
}

function showFormMessage(message) {
  formMessage.textContent = message;
  formMessage.hidden = false;
}

function hideFormMessage() {
  formMessage.hidden = true;
  formMessage.textContent = "";
}

function showSyncError(message) {
  syncError.textContent = message;
  syncError.hidden = false;
}

function hideSyncError() {
  syncError.hidden = true;
  syncError.textContent = "";
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 2600);
}

function reminderLabel(value) {
  if (value === "evening") return "תזכורת בערב שלפני";
  if (value === "morning-before") return "תזכורת בבוקר שלפני";
  if (value === "three-days") return "תזכורת 3 ימים לפני";
  return "ללא תזכורת";
}

function createId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toIsoDate(date) {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
