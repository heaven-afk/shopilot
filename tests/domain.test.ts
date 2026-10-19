import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyState,
  paidFor,
  recordPayment,
  recordSale,
  toKobo,
  type Product,
  type Sale,
  type State,
} from "../src/lib/domain.ts";
const p: Product = {
  id: "p1",
  name: "Coke",
  category: "Drinks",
  unit: "carton of 24",
  stock: 50,
  cost: 400000,
  price: 500000,
  threshold: 5,
};
const state = (): State => ({ ...emptyState, products: [{ ...p }] });
const sale = (): Sale => ({
  id: "s1",
  createdAt: new Date().toISOString(),
  lines: [
    {
      productId: p.id,
      name: p.name,
      quantity: 8,
      unit: p.unit,
      price: p.price,
      cost: p.cost,
    },
  ],
  total: 4000000,
  paid: 4000000,
  method: "Cash",
  customer: "",
  sync: "pending",
});
test("50 cartons less 8 leaves 42 and preserves historical prices", () => {
  const next = recordSale(state(), sale());
  assert.equal(next.products[0].stock, 42);
  next.products[0].price = 900000;
  assert.equal(next.sales[0].lines[0].price, 500000);
});
test("replaying a sale does not deduct stock twice", () => {
  const first = recordSale(state(), sale());
  assert.deepEqual(recordSale(first, sale()), first);
});
test("insufficient stock rejected without mutating input", () => {
  const s = state();
  s.products[0].stock = 7;
  assert.throws(() => recordSale(s, sale()), /Insufficient/);
  assert.equal(s.products[0].stock, 7);
  assert.equal(s.sales.length, 0);
});
test("duplicate product lines cannot bypass stock checks", () => {
  const s = sale();
  s.lines.push({ ...s.lines[0], quantity: 45 });
  s.total = 53 * p.price;
  s.paid = s.total;
  assert.throws(() => recordSale(state(), s), /Insufficient/);
});
test("credit and zero payment require an identifiable customer", () => {
  const s = sale();
  s.paid = 0;
  assert.throws(() => recordSale(state(), s), /Identify/);
  s.customer = "Ada 08000000000";
  assert.equal(recordSale(state(), s).sales[0].paid, 0);
});
test("partial payments retain balance and overpayments rejected", () => {
  const s = sale();
  s.paid = 100000;
  s.customer = "Ada";
  assert.equal(recordSale(state(), s).sales[0].total - s.paid, 3900000);
  s.paid = s.total + 1;
  assert.throws(() => recordSale(state(), s), /Invalid/);
});
test("fractional quantities and stale prices rejected", () => {
  const s = sale();
  s.lines[0].quantity = 1.5;
  assert.throws(() => recordSale(state(), s), /whole/);
  s.lines[0].quantity = 8;
  s.lines[0].price = 1;
  assert.throws(() => recordSale(state(), s), /pricing/);
});
test("kobo conversion remains exact and rejects invalid values", () => {
  assert.equal(toKobo("0.10") + toKobo("0.20"), 30);
  assert.equal(toKobo("1500.05"), 150005);
  for (const value of ["-1", "1.999", "NaN", "1e3", ""])
    assert.throws(() => toKobo(value));
});
test("repayments preserve original sale revenue and payment history", () => {
  const s = sale();
  s.paid = 200000;
  s.customer = "Ada";
  const initial = recordSale(state(), s);
  const payment = {
    id: "pay1",
    saleId: s.id,
    amount: 600000,
    method: "Cash",
    createdAt: s.createdAt,
  };
  const next = recordPayment(initial, payment);
  assert.equal(paidFor(next, s), 800000);
  assert.equal(next.sales[0].total, 4000000);
  assert.equal(next.sales[0].paid, 200000);
  assert.deepEqual(recordPayment(next, payment), next);
  assert.throws(
    () => recordPayment(next, { ...payment, id: "pay2", amount: 3200001 }),
    /outstanding/,
  );
  assert.equal(next.payments.length, 1);
});
