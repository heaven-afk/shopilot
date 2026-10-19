import { emptyState, type State } from "./domain";
const database = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("shopilot", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("records");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
// Legacy device-only test records remain archived under "state". They are
// never loaded into a signed-in business or a signed-out screen.
let scope = "signed-out-v2";
export function setStorageScope(businessId: string | null) {
  scope = businessId ? `business:${businessId}` : "signed-out-v2";
}
export async function readState(): Promise<State> {
  const key = scope,
    db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("records", "readonly");
    const request = tx.objectStore("records").get(key);
    request.onsuccess = () => resolve({ ...emptyState, ...request.result });
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}
export async function writeState(state: State) {
  const key = scope,
    db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("records", "readwrite");
    tx.objectStore("records").put(state, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export async function readPhoto(): Promise<string | null> {
  const key = scope + ":photo",
    db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("records", "readonly");
    const request = tx.objectStore("records").get(key);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}
export async function writePhoto(photo: string | null) {
  const key = scope + ":photo",
    db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("records", "readwrite");
    if (photo) tx.objectStore("records").put(photo, key);
    else tx.objectStore("records").delete(key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
