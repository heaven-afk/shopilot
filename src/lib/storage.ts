import { emptyState, type State } from "./domain.ts";
export type SaveStatus = {
  pendingIds: string[];
  lastSyncedAt: string | null;
  lastLocalSaveAt: string | null;
};
const emptyStatus: SaveStatus = {
  pendingIds: [],
  lastSyncedAt: null,
  lastLocalSaveAt: null,
};
const database = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("shopilot", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("records");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
// The old device-only QA workspace is never loaded into signed-in records.
let scope = "signed-out-v2";
export function setStorageScope(id: string | null) {
  scope = id ? `business:${id}` : "signed-out-v2";
}
const keys = (s: State) => [
  ...s.products.map((x) => "product:" + x.id),
  ...s.movements.map((x) => "movement:" + x.id),
  ...s.sales.map((x) => "sale:" + x.id),
  ...s.payments.map((x) => "payment:" + x.id),
];
async function read<T>(
  suffix: string,
  fallback: T,
  businessId?: string,
): Promise<T> {
  const key = (businessId ? `business:${businessId}` : scope) + suffix,
    db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("records", "readonly");
    const req = tx.objectStore("records").get(key);
    req.onsuccess = () => resolve(req.result ?? fallback);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export async function readState(businessId?: string): Promise<State> {
  return { ...emptyState, ...(await read<Partial<State>>("", {}, businessId)) };
}
export async function readSaveStatus(businessId?: string): Promise<SaveStatus> {
  const status = await read<SaveStatus | null>(
    ":save-status",
    null,
    businessId,
  );
  if (status) return status;
  return { ...emptyStatus, pendingIds: keys(await readState(businessId)) };
}
export async function writeState(
  state: State,
  options: { synced?: boolean; acknowledged?: State; businessId?: string } = {},
) {
  const key = options.businessId ? `business:${options.businessId}` : scope,
    db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("records", "readwrite"),
      store = tx.objectStore("records");
    const previousRequest = store.get(key),
      statusRequest = store.get(key + ":save-status");
    statusRequest.onsuccess = () => {
      const previous: State = { ...emptyState, ...previousRequest.result },
        status: SaveStatus = statusRequest.result ?? {
          ...emptyStatus,
          pendingIds: keys(previous),
        };
      const previousIds = new Set(keys(previous));
      const acknowledgedIds = new Set(
        options.acknowledged ? keys(options.acknowledged) : [],
      );
      const nextStatus: SaveStatus = options.synced
        ? {
            pendingIds: options.acknowledged
              ? keys(state).filter((id) => !acknowledgedIds.has(id))
              : [],
            lastSyncedAt: new Date().toISOString(),
            lastLocalSaveAt: status.lastLocalSaveAt,
          }
        : {
            ...status,
            pendingIds: [
              ...new Set([
                ...status.pendingIds,
                ...keys(state).filter((id) => !previousIds.has(id)),
              ]),
            ],
            lastLocalSaveAt: new Date().toISOString(),
          };
      if (previousRequest.result)
        store.put(previous, key + ":previous-snapshot");
      store.put(state, key);
      store.put(nextStatus, key + ":save-status");
    };
    tx.oncomplete = () => {
      db.close();
      window.dispatchEvent(new Event("shopilot-save-status"));
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export const readPhoto = (businessId?: string) =>
  read<string | null>(":photo", null, businessId);
export async function writePhoto(photo: string | null, businessId?: string) {
  const key = (businessId ? `business:${businessId}` : scope) + ":photo",
    db = await database();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("records", "readwrite"),
      store = tx.objectStore("records");
    if (photo) store.put(photo, key);
    else store.delete(key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}
export function deviceId() {
  let id = localStorage.getItem("shopilot-device-id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("shopilot-device-id", id);
  }
  return id;
}
