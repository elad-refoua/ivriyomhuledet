import assert from "node:assert/strict";
import {
  LEGACY_CALENDAR_KEY,
  LEGACY_PEOPLE_KEY,
  PBKDF2_ITERATIONS,
  VAULT_STORAGE_KEY,
  VAULT_ERROR_CODES,
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

function expectVaultError(code, message) {
  return (error) => {
    assert.equal(error?.code, code);
    assert.match(error?.message ?? "", message);
    assert.doesNotMatch(error?.message ?? "", /quota exceeded|raw storage failure/i);
    return true;
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
  assert.equal(validatePassphrase("123456"), "123456");
  assert.throws(() => validatePassphrase("12345"), /6/);
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

  const unsupportedCrypto = {};
  const cryptoUnsupported = expectVaultError(VAULT_ERROR_CODES.CRYPTO_UNSUPPORTED, /דפדפן מודרני ומעודכן/);
  await assert.rejects(() => deriveVaultKey("סיסמת בדיקה ארוכה 2026", salt, unsupportedCrypto), cryptoUnsupported);
  await assert.rejects(() => sealVaultData(sampleData, key, salt, unsupportedCrypto), cryptoUnsupported);
  await assert.rejects(() => openVaultData(envelope, key, unsupportedCrypto), cryptoUnsupported);
  await assert.rejects(
    () => createVaultStore({ storage: memoryStorage(), cryptoImpl: unsupportedCrypto })
      .create("סיסמת בדיקה ארוכה 2026", sampleData),
    cryptoUnsupported
  );
  await assert.rejects(
    () => createVaultStore({
      storage: memoryStorage({
        [LEGACY_PEOPLE_KEY]: JSON.stringify(sampleData.people),
        [LEGACY_CALENDAR_KEY]: sampleData.googleCalendarId,
      }),
      cryptoImpl: unsupportedCrypto,
    }).migrate("סיסמת בדיקה ארוכה 2026"),
    cryptoUnsupported
  );
  await assert.rejects(
    () => createVaultStore({
      storage: memoryStorage({ [VAULT_STORAGE_KEY]: serialized }),
      cryptoImpl: unsupportedCrypto,
    }).unlock("סיסמת בדיקה ארוכה 2026"),
    cryptoUnsupported
  );

  const inaccessibleStorage = {
    getItem: () => { throw new Error("raw storage failure"); },
    setItem: () => {},
    removeItem: () => {},
  };
  await assert.rejects(
    () => createVaultStore({ storage: inaccessibleStorage, cryptoImpl: crypto })
      .create("סיסמת בדיקה ארוכה 2026", sampleData),
    expectVaultError(VAULT_ERROR_CODES.STORAGE_ACCESS, /אחסון המקומי/)
  );

  const unwritableStorage = memoryStorage();
  unwritableStorage.setItem = () => { throw new Error("quota exceeded"); };
  await assert.rejects(
    () => createVaultStore({ storage: unwritableStorage, cryptoImpl: crypto })
      .create("סיסמת בדיקה ארוכה 2026", sampleData),
    expectVaultError(VAULT_ERROR_CODES.STORAGE_WRITE, /אחסון המקומי/)
  );

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
  await assert.rejects(
    () => store.unlock("סיסמה שגויה וארוכה 2026"),
    (error) => {
      assert.equal(error?.code, undefined);
      assert.match(error?.message ?? "", /לא הצלחנו לפתוח את הכספת/);
      return true;
    }
  );
  assert.deepEqual(await store.unlock("סיסמת בדיקה ארוכה 2026"), sampleData);

  const tamperedVaultStore = createVaultStore({
    storage: memoryStorage({ [VAULT_STORAGE_KEY]: JSON.stringify(tampered) }),
    cryptoImpl: crypto,
  });
  await assert.rejects(
    () => tamperedVaultStore.unlock("סיסמת בדיקה ארוכה 2026"),
    /לא הצלחנו לפתוח את הכספת/
  );
  const rawDecryptCrypto = {
    getRandomValues: crypto.getRandomValues.bind(crypto),
    subtle: {
      importKey: crypto.subtle.importKey.bind(crypto.subtle),
      deriveKey: crypto.subtle.deriveKey.bind(crypto.subtle),
      encrypt: crypto.subtle.encrypt.bind(crypto.subtle),
      decrypt: async () => { throw new DOMException("raw decrypt detail", "OperationError"); },
    },
  };
  await assert.rejects(
    () => createVaultStore({
      storage: memoryStorage({ [VAULT_STORAGE_KEY]: serialized }),
      cryptoImpl: rawDecryptCrypto,
    }).unlock("סיסמת בדיקה ארוכה 2026"),
    (error) => {
      assert.equal(error?.code, undefined);
      assert.equal(error?.message, "לא הצלחנו לפתוח את הכספת. בדקו את הסיסמה ונסו שוב.");
      assert.doesNotMatch(error?.message ?? "", /raw decrypt detail|OperationError/);
      return true;
    }
  );

  const reloadStorage = memoryStorage();
  const initialReloadStore = createVaultStore({ storage: reloadStorage, cryptoImpl: crypto });
  await initialReloadStore.create("סיסמת טעינה מחדש 2026", sampleData);
  const secondPerson = {
    id: "person-2",
    name: "בדיקת טעינה מחדש",
    birth: { yy: 5750, mm: 7, dd: 2 },
    reminder: "morning-before",
  };
  const reloadedData = { ...sampleData, people: [...sampleData.people, secondPerson] };
  await initialReloadStore.save(reloadedData);
  initialReloadStore.lock();
  const freshReloadStore = createVaultStore({ storage: reloadStorage, cryptoImpl: crypto });
  assert.deepEqual(
    await freshReloadStore.unlock("סיסמת טעינה מחדש 2026"),
    reloadedData
  );

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
    expectVaultError(VAULT_ERROR_CODES.STORAGE_WRITE, /אחסון המקומי/)
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
  await assert.rejects(
    () => failedMigrationStore.migrate("סיסמת הגירה ארוכה 2026"),
    expectVaultError(VAULT_ERROR_CODES.STORAGE_WRITE, /אחסון המקומי/)
  );
  assert.equal(failedMigrationStorage.getItem(LEGACY_PEOPLE_KEY), migrationSeed[LEGACY_PEOPLE_KEY]);
  assert.equal(failedMigrationStorage.getItem(LEGACY_CALENDAR_KEY), migrationSeed[LEGACY_CALENDAR_KEY]);
  failedMigrationStorage.setItem = originalSetItem;

  for (const [failedKey, silentlyFails, expectedError] of [
    [LEGACY_PEOPLE_KEY, false, expectVaultError(VAULT_ERROR_CODES.STORAGE_WRITE, /אחסון המקומי/)],
    [LEGACY_CALENDAR_KEY, false, expectVaultError(VAULT_ERROR_CODES.STORAGE_WRITE, /אחסון המקומי/)],
    [LEGACY_CALENDAR_KEY, true, /לא הצלחנו להעביר/],
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
      expectedError
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
