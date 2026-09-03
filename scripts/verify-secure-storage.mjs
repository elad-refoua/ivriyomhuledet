import assert from "node:assert/strict";
import {
  LEGACY_CALENDAR_KEY,
  LEGACY_PEOPLE_KEY,
  MIN_PASSPHRASE_LENGTH,
  PBKDF2_ITERATIONS,
  VAULT_STORAGE_KEY,
  createVaultStore,
  deriveVaultKey,
  openVaultData,
  sealVaultData,
  validatePassphrase,
} from "../dist/secure-storage.js";

function memoryStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    snapshot: () => Object.fromEntries(values),
  };
}

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

  const storage = memoryStorage();
  const store = createVaultStore({ storage, cryptoImpl: crypto });
  assert.equal(store.status(), "empty");
  await store.create("סיסמת בדיקה ארוכה 2026", sampleData);
  assert.equal(store.status(), "locked");
  assert.equal(store.isUnlocked(), true);
  assert.doesNotMatch(storage.getItem(VAULT_STORAGE_KEY), /נועה בדיקה/);

  store.lock();
  assert.equal(store.isUnlocked(), false);
  await assert.rejects(() => store.save(sampleData), /נעולה/);
  await assert.rejects(() => store.unlock("סיסמה שגויה וארוכה 2026"));
  assert.deepEqual(await store.unlock("סיסמת בדיקה ארוכה 2026"), sampleData);

  const legacyStorage = memoryStorage({
    [LEGACY_PEOPLE_KEY]: JSON.stringify(sampleData.people),
    [LEGACY_CALENDAR_KEY]: sampleData.googleCalendarId,
  });
  const legacyStore = createVaultStore({ storage: legacyStorage, cryptoImpl: crypto });
  assert.equal(legacyStore.status(), "legacy");
  assert.deepEqual(await legacyStore.migrate("סיסמת הגירה ארוכה 2026"), sampleData);
  assert.equal(legacyStorage.getItem(LEGACY_PEOPLE_KEY), null);
  assert.equal(legacyStorage.getItem(LEGACY_CALENDAR_KEY), null);
  assert.doesNotMatch(legacyStorage.getItem(VAULT_STORAGE_KEY), /נועה בדיקה|private-calendar/);

  const previousEnvelope = storage.getItem(VAULT_STORAGE_KEY);
  const failingStorage = {
    getItem: (key) => storage.getItem(key),
    setItem: () => { throw new Error("quota exceeded"); },
    removeItem: (key) => storage.removeItem(key),
  };
  const failingStore = createVaultStore({ storage: failingStorage, cryptoImpl: crypto });
  await failingStore.unlock("סיסמת בדיקה ארוכה 2026");
  await assert.rejects(
    () => failingStore.save({ ...sampleData, people: [] }),
    /לא הצלחנו לשמור/
  );
  assert.equal(storage.getItem(VAULT_STORAGE_KEY), previousEnvelope);

  const migrationSeed = {
    [LEGACY_PEOPLE_KEY]: JSON.stringify(sampleData.people),
    [LEGACY_CALENDAR_KEY]: sampleData.googleCalendarId,
  };
  const failedMigrationStorage = memoryStorage(migrationSeed);
  const originalSetItem = failedMigrationStorage.setItem;
  failedMigrationStorage.setItem = () => { throw new Error("quota exceeded"); };
  const failedMigrationStore = createVaultStore({
    storage: failedMigrationStorage,
    cryptoImpl: crypto,
  });
  await assert.rejects(() => failedMigrationStore.migrate("סיסמת הגירה ארוכה 2026"));
  assert.equal(failedMigrationStorage.getItem(LEGACY_PEOPLE_KEY), migrationSeed[LEGACY_PEOPLE_KEY]);
  assert.equal(failedMigrationStorage.getItem(LEGACY_CALENDAR_KEY), migrationSeed[LEGACY_CALENDAR_KEY]);
  failedMigrationStorage.setItem = originalSetItem;

  for (const [failedKey, silentlyFails] of [
    [LEGACY_PEOPLE_KEY, false],
    [LEGACY_CALENDAR_KEY, false],
    [LEGACY_CALENDAR_KEY, true],
  ]) {
    const cleanupFailureStorage = memoryStorage(migrationSeed);
    const originalRemoveItem = cleanupFailureStorage.removeItem;
    cleanupFailureStorage.removeItem = (key) => {
      if (key !== failedKey) return originalRemoveItem(key);
      if (silentlyFails) return undefined;
      throw new Error("remove failed");
    };
    const cleanupFailureStore = createVaultStore({
      storage: cleanupFailureStorage,
      cryptoImpl: crypto,
    });
    await assert.rejects(
      () => cleanupFailureStore.migrate("סיסמת הגירה ארוכה 2026"),
      /לא הצלחנו להעביר/
    );
    assert.equal(cleanupFailureStorage.getItem(VAULT_STORAGE_KEY), null);
    assert.equal(cleanupFailureStorage.getItem(LEGACY_PEOPLE_KEY), migrationSeed[LEGACY_PEOPLE_KEY]);
    assert.equal(cleanupFailureStorage.getItem(LEGACY_CALENDAR_KEY), migrationSeed[LEGACY_CALENDAR_KEY]);
    assert.equal(cleanupFailureStore.isUnlocked(), false);
    assert.equal(cleanupFailureStore.status(), "legacy");
  }

  legacyStore.reset();
  assert.equal(legacyStore.isUnlocked(), false);
  assert.equal(legacyStorage.getItem(VAULT_STORAGE_KEY), null);
  assert.equal(legacyStorage.getItem(LEGACY_PEOPLE_KEY), null);
  assert.equal(legacyStorage.getItem(LEGACY_CALENDAR_KEY), null);
}
