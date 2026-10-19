import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { parseBackup, mergeBackup } from "../src/lib/backup.ts";
import { emptyState, type State } from "../src/lib/domain.ts";
test("business backups validate ownership and restore without duplicate stock or money", () => {
  const businessId = randomUUID(),
    productId = randomUUID(),
    saleId = randomUUID(),
    stamp = new Date().toISOString();
  const state: State = {
    products: [
      {
        id: productId,
        name: "Rice",
        category: "Food",
        unit: "bag",
        stock: 9,
        cost: 100,
        price: 200,
        threshold: 2,
      },
    ],
    sales: [
      {
        id: saleId,
        createdAt: stamp,
        total: 200,
        paid: 100,
        method: "Cash",
        customer: "Ada",
        sync: "pending",
        lines: [
          {
            productId,
            name: "Rice",
            quantity: 1,
            unit: "bag",
            price: 200,
            cost: 100,
          },
        ],
      },
    ],
    movements: [
      {
        id: randomUUID(),
        productId,
        quantity: 10,
        reason: "Opening",
        createdAt: stamp,
      },
    ],
    payments: [],
  };
  const text = JSON.stringify({ version: 2, businessId, ...state });
  const parsed = parseBackup(text, businessId);
  const restored = mergeBackup(emptyState, parsed);
  assert.equal(restored.products[0].stock, 9);
  assert.equal(mergeBackup(restored, parsed).sales.length, 1);
  assert.equal(mergeBackup(restored, parsed).products[0].stock, 9);
  const line = state.sales[0].lines[0];
  const reordered = {
    ...state,
    sales: [
      {
        ...state.sales[0],
        lines: [
          {
            cost: line.cost,
            price: line.price,
            unit: line.unit,
            quantity: line.quantity,
            name: line.name,
            productId: line.productId,
          },
        ],
      },
    ],
  };
  assert.equal(mergeBackup(state, reordered).sales.length, 1);
  assert.throws(() => parseBackup(text, randomUUID()), /different business/);
  assert.throws(
    () => parseBackup(JSON.stringify({ version: 1, ...state }), businessId),
    /supported/,
  );
  const bad = { ...state, sales: [{ ...state.sales[0], total: 999 }] };
  assert.throws(
    () =>
      parseBackup(
        JSON.stringify({ version: 2, businessId, ...bad }),
        businessId,
      ),
    /invalid sale/,
  );
  assert.throws(
    () =>
      mergeBackup(state, {
        ...state,
        sales: [{ ...state.sales[0], customer: "Different" }],
      }),
    /conflict/,
  );
});
