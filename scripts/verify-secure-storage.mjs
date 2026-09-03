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

  const impossibleBirth = structuredClone(sampleData);
  impossibleBirth.people[0].birth = { yy: -1, mm: 99, dd: 0 };
  await assert.rejects(() => sealVaultData(impossibleBirth, key, salt, crypto));

  const tampered = structuredClone(envelope);
  tampered.ciphertext = `${tampered.ciphertext.slice(0, -2)}AA`;
  await assert.rejects(() => openVaultData(tampered, key, crypto));

  const nonCanonicalBase64 = structuredClone(envelope);
  nonCanonicalBase64.kdf.salt = `${nonCanonicalBase64.kdf.salt.slice(0, -3)}B==`;
  await assert.rejects(() => openVaultData(nonCanonicalBase64, key, crypto));
}
