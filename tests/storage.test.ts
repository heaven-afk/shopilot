import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  readState,
  writeState,
  readSaveStatus,
  setStorageScope,
  writePhoto,
  readPhoto,
} from "../src/lib/storage.ts";
import { emptyState, recordSale, type State } from "../src/lib/domain.ts";
import { reconcileUpload } from "../src/lib/reconcile.ts";
Object.defineProperty(globalThis, "window", {
  value: new EventTarget(),
  configurable: true,
});
test("local records and pending-save metadata commit together and remain business scoped", async () => {
  const businessId = randomUUID();
  setStorageScope(businessId);
  assert.equal((await readSaveStatus()).pendingIds.length, 0);
  const p = {
    id: randomUUID(),
    name: "Rice",
    category: "Food",
    unit: "bag",
    stock: 10,
    cost: 100,
    price: 200,
    threshold: 2,
  };
  const s: State = {
    ...emptyState,
    products: [p],
    movements: [
      {
        id: randomUUID(),
        productId: p.id,
        quantity: 10,
        reason: "Opening",
        createdAt: new Date().toISOString(),
      },
    ],
  };
  await writeState(s);
  assert.equal((await readSaveStatus()).pendingIds.length, 2);
  await writeState(s, { synced: true });
  assert.equal((await readSaveStatus()).pendingIds.length, 0);
  assert.ok((await readSaveStatus()).lastSyncedAt);
  await writePhoto("data:image/png;base64,AAA");
  assert.ok(await readPhoto());
  setStorageScope(randomUUID());
  assert.equal((await readState()).products.length, 0);
  assert.equal((await readSaveStatus()).pendingIds.length, 0);
  assert.equal(await readPhoto(), null);
  assert.ok(await readPhoto(businessId));
  assert.equal((await readState(businessId)).products.length, 1);
});
test("sales recorded during upload remain in stock and pending until their own acknowledgement", async () => {
  const businessId = randomUUID();
  setStorageScope(businessId);
  const p = {
      id: randomUUID(),
      name: "Rice",
      category: "Food",
      unit: "bag",
      stock: 10,
      cost: 100,
      price: 200,
      threshold: 2,
    },
    stamp = new Date().toISOString();
  const sent: State = {
    ...emptyState,
    products: [p],
    movements: [
      {
        id: randomUUID(),
        productId: p.id,
        quantity: 10,
        reason: "Opening",
        createdAt: stamp,
      },
    ],
  };
  await writeState(sent);
  const sale = {
    id: randomUUID(),
    createdAt: stamp,
    total: 200,
    paid: 200,
    customer: "",
    method: "Cash",
    sync: "pending" as const,
    lines: [
      {
        productId: p.id,
        name: p.name,
        quantity: 1,
        unit: p.unit,
        price: p.price,
        cost: p.cost,
      },
    ],
  };
  const current = recordSale(sent, sale);
  await writeState(current);
  const combined = reconcileUpload(sent, current, sent);
  assert.equal(combined.sales.length, 1);
  assert.equal(combined.products[0].stock, 9);
  await writeState(combined, { synced: true, acknowledged: sent });
  assert.deepEqual((await readSaveStatus()).pendingIds, ["sale:" + sale.id]);
  const acknowledged = {
    ...combined,
    sales: combined.sales.map((s) => ({ ...s, sync: "synced" as const })),
  };
  await writeState(acknowledged, { synced: true, acknowledged });
  assert.equal((await readSaveStatus()).pendingIds.length, 0);
  assert.equal((await readState()).products[0].stock, 9);
});
