const DB_NAME = "horseradish-afterimage";
const STORE = "sets";

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listSets(owner) {
  if (!owner) return [];
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    request.onsuccess = () => {
      const rows = (request.result || []).filter((row) => row && row.owner === owner);
      rows.sort((a, b) => b.updated - a.updated);
      resolve(rows);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveSet(set, owner) {
  if (!set || !owner) {
    throw new Error("Sign in before saving an AfterImage.");
  }
  const db = await openDb();
  set.owner = owner;
  set.updated = Date.now();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(set);
    tx.oncomplete = () => resolve(set);
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteSet(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
