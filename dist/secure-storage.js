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
