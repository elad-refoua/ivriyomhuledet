import { birthFromHebrew } from "./calendar.js";

export const VAULT_STORAGE_KEY = "ivriyomhuledet.vault.v1";
export const LEGACY_PEOPLE_KEY = "ivriyomhuledet.people.v1";
export const LEGACY_CALENDAR_KEY = "ivriyomhuledet.googleCalendarId.v1";
export const PBKDF2_ITERATIONS = 600_000;
export const MIN_PASSPHRASE_LENGTH = 12;

const AAD = new TextEncoder().encode("ivriyomhuledet-vault-envelope-v1");
const SALT_BYTES = 16;
const IV_BYTES = 12;
const REMINDER_VALUES = new Set(["evening", "morning-before", "three-days", "none"]);
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

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
  const saltBytes = requireByteLength(salt, SALT_BYTES, "מלח ההצפנה אינו תקין.");
  const material = await cryptoImpl.subtle.importKey(
    "raw",
    new TextEncoder().encode(validatePassphrase(passphrase)),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return cryptoImpl.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: saltBytes, iterations: PBKDF2_ITERATIONS },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function sealVaultData(data, key, salt, cryptoImpl = globalThis.crypto) {
  requireCrypto(cryptoImpl);
  validateVaultData(data);
  const saltBytes = requireByteLength(salt, SALT_BYTES, "מלח ההצפנה אינו תקין.");
  const iv = cryptoImpl.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const ciphertext = await cryptoImpl.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: AAD },
    key,
    plaintext
  );

  return {
    version: 1,
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(saltBytes),
    },
    cipher: {
      name: "AES-GCM",
      iv: bytesToBase64(iv),
    },
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function openVaultData(envelope, key, cryptoImpl = globalThis.crypto) {
  requireCrypto(cryptoImpl);
  const encoded = validateVaultEnvelope(envelope);
  const plaintext = await cryptoImpl.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(encoded.iv), additionalData: AAD },
    key,
    base64ToBytes(encoded.ciphertext)
  );

  let data;
  try {
    data = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new Error("נתוני הכספת אינם תקינים.");
  }
  validateVaultData(data);
  return data;
}

export function createVaultStore({
  storage = globalThis.localStorage,
  cryptoImpl = globalThis.crypto,
} = {}) {
  let activeKey = null;
  let activeSalt = null;

  function status() {
    if (readStorage(VAULT_STORAGE_KEY) !== null) return "locked";
    if (readStorage(LEGACY_PEOPLE_KEY) !== null || readStorage(LEGACY_CALENDAR_KEY) !== null) {
      return "legacy";
    }
    return "empty";
  }

  async function create(passphrase, data) {
    const validatedPassphrase = validatePassphrase(passphrase);
    if (readStorage(VAULT_STORAGE_KEY) !== null) throw new Error("כבר קיימת כספת מוצפנת.");

    try {
      const salt = cryptoImpl.getRandomValues(new Uint8Array(SALT_BYTES));
      const key = await deriveVaultKey(validatedPassphrase, salt, cryptoImpl);
      await writeAndVerifyVault(data, key, salt);
      activeKey = key;
      activeSalt = salt;
    } catch {
      throw new Error("לא הצלחנו ליצור את הכספת המוצפנת.");
    }
  }

  async function migrate(passphrase) {
    const validatedPassphrase = validatePassphrase(passphrase);
    if (readStorage(VAULT_STORAGE_KEY) !== null) throw new Error("כבר קיימת כספת מוצפנת.");
    if (status() !== "legacy") throw new Error("לא נמצאו נתונים ישנים להעברה.");

    let data;
    try {
      data = readLegacyData();
    } catch {
      throw new Error("הנתונים הישנים אינם תקינים.");
    }

    const snapshot = snapshotMigrationState();
    let encryptedWriteSucceeded = false;
    try {
      const salt = cryptoImpl.getRandomValues(new Uint8Array(SALT_BYTES));
      const key = await deriveVaultKey(validatedPassphrase, salt, cryptoImpl);
      await writeAndVerifyVault(data, key, salt);
      encryptedWriteSucceeded = true;
      removeAndVerifyLegacyData();
      activeKey = key;
      activeSalt = salt;
      return data;
    } catch {
      if (encryptedWriteSucceeded) {
        try {
          restoreMigrationState(snapshot);
        } catch {
          lock();
        }
      }
      lock();
      throw new Error("לא הצלחנו להעביר את הנתונים לכספת המוצפנת.");
    }
  }

  async function unlock(passphrase) {
    const validatedPassphrase = validatePassphrase(passphrase);
    let envelope;
    try {
      envelope = readSerializedEnvelope();
      if (!envelope) throw new Error("missing vault");
      const salt = base64ToBytes(envelope.kdf.salt);
      const key = await deriveVaultKey(validatedPassphrase, salt, cryptoImpl);
      const data = await openVaultData(envelope, key, cryptoImpl);
      activeKey = key;
      activeSalt = salt;
      return data;
    } catch {
      throw new Error("לא הצלחנו לפתוח את הכספת. בדקו את הסיסמה ונסו שוב.");
    }
  }

  async function save(data) {
    if (!activeKey || !activeSalt) throw new Error("הכספת נעולה. יש לפתוח אותה לפני השמירה.");
    try {
      await writeAndVerifyVault(data, activeKey, activeSalt);
    } catch {
      throw new Error("לא הצלחנו לשמור את הנתונים המוצפנים.");
    }
  }

  function lock() {
    activeKey = null;
    activeSalt = null;
  }

  function reset() {
    lock();
    let removalFailed = false;
    for (const key of [VAULT_STORAGE_KEY, LEGACY_PEOPLE_KEY, LEGACY_CALENDAR_KEY]) {
      try {
        storage.removeItem(key);
      } catch {
        removalFailed = true;
      }
    }
    try {
      if (
        removalFailed ||
        readStorage(VAULT_STORAGE_KEY) !== null ||
        readStorage(LEGACY_PEOPLE_KEY) !== null ||
        readStorage(LEGACY_CALENDAR_KEY) !== null
      ) {
        throw new Error("reset failed");
      }
    } catch {
      throw new Error("לא הצלחנו לאפס את הכספת.");
    }
  }

  function readStorage(key) {
    try {
      return storage.getItem(key);
    } catch {
      throw new Error("לא הצלחנו לגשת לאחסון המקומי.");
    }
  }

  function readSerializedEnvelope() {
    const serialized = readStorage(VAULT_STORAGE_KEY);
    if (serialized === null) return null;
    if (typeof serialized !== "string") throw new Error("invalid vault");
    let envelope;
    try {
      envelope = JSON.parse(serialized);
    } catch {
      throw new Error("invalid vault");
    }
    validateVaultEnvelope(envelope);
    return envelope;
  }

  function readLegacyData() {
    const serializedPeople = readStorage(LEGACY_PEOPLE_KEY);
    const googleCalendarId = readStorage(LEGACY_CALENDAR_KEY);
    const people = serializedPeople === null ? [] : JSON.parse(serializedPeople);
    const data = {
      version: 1,
      people,
      googleCalendarId: googleCalendarId === null ? "" : googleCalendarId,
    };
    validateVaultData(data);
    return data;
  }

  function removeAndVerifyLegacyData() {
    let removalFailed = false;
    for (const key of [LEGACY_PEOPLE_KEY, LEGACY_CALENDAR_KEY]) {
      try {
        storage.removeItem(key);
      } catch {
        removalFailed = true;
      }
    }
    if (
      removalFailed ||
      readStorage(LEGACY_PEOPLE_KEY) !== null ||
      readStorage(LEGACY_CALENDAR_KEY) !== null
    ) {
      throw new Error("legacy removal failed");
    }
  }

  function snapshotMigrationState() {
    return {
      vault: readStorage(VAULT_STORAGE_KEY),
      people: readStorage(LEGACY_PEOPLE_KEY),
      calendar: readStorage(LEGACY_CALENDAR_KEY),
    };
  }

  function restoreMigrationState(snapshot) {
    restoreStorageValue(LEGACY_PEOPLE_KEY, snapshot.people);
    restoreStorageValue(LEGACY_CALENDAR_KEY, snapshot.calendar);
    restoreStorageValue(VAULT_STORAGE_KEY, snapshot.vault);
    if (
      readStorage(LEGACY_PEOPLE_KEY) !== snapshot.people ||
      readStorage(LEGACY_CALENDAR_KEY) !== snapshot.calendar ||
      readStorage(VAULT_STORAGE_KEY) !== snapshot.vault
    ) {
      throw new Error("migration rollback failed");
    }
  }

  function restoreStorageValue(key, value) {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  }

  async function writeAndVerifyVault(data, key, salt) {
    const previousEnvelope = readStorage(VAULT_STORAGE_KEY);
    let attemptedWrite = false;
    try {
      const serialized = JSON.stringify(await sealVaultData(data, key, salt, cryptoImpl));
      attemptedWrite = true;
      storage.setItem(VAULT_STORAGE_KEY, serialized);
      const readBack = readStorage(VAULT_STORAGE_KEY);
      if (readBack !== serialized) throw new Error("vault read-back failed");
      const verifiedEnvelope = readSerializedEnvelope();
      await openVaultData(verifiedEnvelope, key, cryptoImpl);
    } catch (error) {
      if (attemptedWrite) restorePreviousEnvelope(previousEnvelope);
      throw error;
    }
  }

  function restorePreviousEnvelope(previousEnvelope) {
    if (previousEnvelope === null) storage.removeItem(VAULT_STORAGE_KEY);
    else storage.setItem(VAULT_STORAGE_KEY, previousEnvelope);
  }

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

function requireCrypto(cryptoImpl) {
  if (
    !cryptoImpl ||
    typeof cryptoImpl.getRandomValues !== "function" ||
    !cryptoImpl.subtle ||
    typeof cryptoImpl.subtle.importKey !== "function" ||
    typeof cryptoImpl.subtle.deriveKey !== "function" ||
    typeof cryptoImpl.subtle.encrypt !== "function" ||
    typeof cryptoImpl.subtle.decrypt !== "function"
  ) {
    throw new Error("הדפדפן אינו תומך בהצפנה הנדרשת.");
  }
}

function validateVaultEnvelope(envelope) {
  if (!isPlainRecord(envelope) || !hasExactKeys(envelope, ["version", "kdf", "cipher", "ciphertext"])) {
    throw new Error("מעטפת הכספת אינה תקינה.");
  }
  const { version, kdf, cipher, ciphertext } = envelope;
  if (
    version !== 1 ||
    !isPlainRecord(kdf) ||
    !hasExactKeys(kdf, ["name", "hash", "iterations", "salt"]) ||
    kdf.name !== "PBKDF2" ||
    kdf.hash !== "SHA-256" ||
    kdf.iterations !== PBKDF2_ITERATIONS ||
    !isPlainRecord(cipher) ||
    !hasExactKeys(cipher, ["name", "iv"]) ||
    cipher.name !== "AES-GCM" ||
    typeof ciphertext !== "string"
  ) {
    throw new Error("מעטפת הכספת אינה תקינה.");
  }

  assertBase64Length(kdf.salt, SALT_BYTES);
  assertBase64Length(cipher.iv, IV_BYTES);
  assertBase64Length(ciphertext, null, true);
  return { iv: cipher.iv, ciphertext };
}

function validateVaultData(data) {
  if (!isPlainRecord(data) || !hasExactKeys(data, ["version", "people", "googleCalendarId"])) {
    throw new Error("נתוני הכספת אינם תקינים.");
  }
  if (data.version !== 1 || !Array.isArray(data.people) || typeof data.googleCalendarId !== "string") {
    throw new Error("נתוני הכספת אינם תקינים.");
  }
  for (const person of data.people) validatePerson(person);
}

function validatePerson(person) {
  if (
    !isPlainRecord(person) ||
    !hasExactKeys(person, ["id", "name", "birth", "reminder"]) ||
    typeof person.id !== "string" ||
    !person.id ||
    typeof person.name !== "string" ||
    !person.name.trim() ||
    !REMINDER_VALUES.has(person.reminder) ||
    !isPlainRecord(person.birth) ||
    !hasExactKeys(person.birth, ["yy", "mm", "dd"]) ||
    !Number.isInteger(person.birth.yy) ||
    !Number.isInteger(person.birth.mm) ||
    !Number.isInteger(person.birth.dd) ||
    !isValidHebrewBirth(person.birth)
  ) {
    throw new Error("נתוני הכספת אינם תקינים.");
  }
}

function isValidHebrewBirth(birth) {
  try {
    birthFromHebrew(birth.dd, birth.mm, birth.yy);
    return true;
  } catch {
    return false;
  }
}

function requireByteLength(value, expectedLength, errorMessage) {
  if (!(value instanceof Uint8Array) || value.byteLength !== expectedLength) throw new Error(errorMessage);
  return value;
}

function isPlainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value, expectedKeys) {
  const keys = Object.keys(value);
  return keys.length === expectedKeys.length && expectedKeys.every((key) => Object.hasOwn(value, key));
}

function assertBase64Length(value, expectedLength, requireNonEmpty = false) {
  if (
    typeof value !== "string" ||
    !BASE64_PATTERN.test(value) ||
    !isCanonicalBase64(value) ||
    (requireNonEmpty && !value)
  ) {
    throw new Error("מעטפת הכספת אינה תקינה.");
  }
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const byteLength = (value.length / 4) * 3 - padding;
  if (expectedLength !== null && byteLength !== expectedLength) throw new Error("מעטפת הכספת אינה תקינה.");
}

function isCanonicalBase64(value) {
  if (value.endsWith("==")) return BASE64_ALPHABET.indexOf(value.at(-3)) % 16 === 0;
  if (value.endsWith("=")) return BASE64_ALPHABET.indexOf(value.at(-2)) % 4 === 0;
  return true;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    throw new Error("מעטפת הכספת אינה תקינה.");
  }
}
