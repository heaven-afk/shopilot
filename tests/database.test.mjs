import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

test("database migration, isolation, idempotency, repayments, rollback, and scan quota", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
   create table auth.users(id uuid primary key);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth,public to authenticated;
   grant execute on function auth.uid() to authenticated;`);
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/001_foundation.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/002_business_onboarding.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      "grant select,insert,update,delete on all tables in schema public to authenticated; revoke all on public.scan_usage from authenticated;",
    );
    const userA = randomUUID(),
      userB = randomUUID();
    await db.query("insert into auth.users values($1),($2)", [userA, userB]);
    await db.exec("set role authenticated");
    async function identity(id) {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
    }
    await identity(userA);
    const bidA = (
      await db.query(
        "select public.setup_business('Shop A','Wholesaler','08000000000','Jos') as id",
      )
    ).rows[0].id;
    const business = (
      await db.query("select * from public.businesses where id=$1", [bidA])
    ).rows[0];
    assert.equal(business.name, "Shop A");
    assert.equal(business.business_type, "Wholesaler");
    assert.equal(business.phone, "08000000000");
    assert.equal(business.address, "Jos");
    const blank = (
      await db.query("select public.sync_workspace($1,$2::jsonb) as state", [
        bidA,
        JSON.stringify({
          products: [],
          sales: [],
          movements: [],
          payments: [],
        }),
      ])
    ).rows[0].state;
    assert.deepEqual(blank, {
      products: [],
      sales: [],
      movements: [],
      payments: [],
    });
    await assert.rejects(
      db.query(
        "select public.setup_business('Second shop','Retail shop','','')",
      ),
      /already has a workspace/,
    );
    await identity(userB);
    await assert.rejects(
      db.query(
        "select public.setup_business('Invalid shop','Invalid type','','')",
      ),
      /check constraint/,
    );
    const bidB = (
      await db.query(
        "select public.setup_business('Shop B','Retail shop','','') as id",
      )
    ).rows[0].id;
    const product = {
      id: randomUUID(),
      name: "Cola",
      category: "Drinks",
      unit: "carton of 24",
      cost: 400000,
      price: 500000,
      threshold: 5,
      stock: 42,
    };
    const sale = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      total: 4000000,
      paid: 200000,
      method: "Cash",
      customer: "Test customer",
      sync: "pending",
      lines: [
        {
          productId: product.id,
          name: product.name,
          quantity: 8,
          unit: product.unit,
          price: product.price,
          cost: product.cost,
        },
      ],
    };
    const payload = {
      products: [product],
      sales: [sale],
      payments: [],
      movements: [
        {
          id: randomUUID(),
          productId: product.id,
          quantity: 50,
          reason: "Opening stock",
          createdAt: sale.createdAt,
        },
      ],
    };
    const sync = async (bid, data) =>
      (
        await db.query("select public.sync_workspace($1,$2::jsonb) as state", [
          bid,
          JSON.stringify(data),
        ])
      ).rows[0].state;
    await identity(userA);
    let result = await sync(bidA, payload);
    assert.equal(result.products[0].stock, 42);
    assert.equal(result.sales[0].sync, "synced");
    result = await sync(bidA, payload);
    assert.equal(result.sales.length, 1);
    assert.equal(result.products[0].stock, 42);
    const payment = {
      id: randomUUID(),
      saleId: sale.id,
      amount: 600000,
      method: "Cash",
      createdAt: sale.createdAt,
    };
    result = await sync(bidA, { ...payload, payments: [payment] });
    assert.equal(result.payments.length, 1);
    assert.equal(result.sales[0].paid, 200000);
    assert.equal(result.sales[0].total, 4000000);
    result = await sync(bidA, { ...payload, payments: [payment] });
    assert.equal(result.payments.length, 1);
    await assert.rejects(
      sync(bidA, {
        ...payload,
        payments: [payment, { ...payment, id: randomUUID(), amount: 3200001 }],
      }),
      /exceeds current balance/,
    );
    result = await sync(bidA, { ...payload, payments: [payment] });
    assert.equal(result.payments.length, 1);
    const corrupt = { ...sale, id: randomUUID(), total: 1 };
    await assert.rejects(
      sync(bidA, { ...payload, sales: [corrupt] }),
      /Invalid sale total/,
    );
    assert.equal(
      (await db.query("select count(*)::integer as n from public.sales"))
        .rows[0].n,
      1,
    );
    // RLS must apply even if a caller bypasses the app and writes directly.
    await assert.rejects(
      db.query("insert into public.products values($1,$2,$3,$4,$5,$6,$7,$8)", [
        bidA,
        randomUUID(),
        "Injected",
        "X",
        "unit",
        1,
        1,
        1,
      ]),
      /row-level security/,
    );
    await identity(userB);
    assert.equal(
      (await db.query("select * from public.products")).rows.length,
      0,
    );
    assert.equal((await db.query("select * from public.sales")).rows.length, 0);
    await assert.rejects(sync(bidA, payload), /access denied/);
    await assert.rejects(
      sync(bidB, { products: [], sales: [sale], movements: [], payments: [] }),
      /foreign key/,
    );
    for (let i = 0; i < 30; i++)
      assert.equal(
        (await db.query("select reserve_scan() as ok")).rows[0].ok,
        true,
      );
    assert.equal(
      (await db.query("select reserve_scan() as ok")).rows[0].ok,
      false,
    );
    await identity(userA);
    // Completed offline sales are preserved; negative stock is surfaced to reconcile.
    const otherSale = {
      ...sale,
      id: randomUUID(),
      paid: 4000000,
      lines: [{ ...sale.lines[0], quantity: 50 }],
      total: 25000000,
    };
    otherSale.paid = otherSale.total;
    result = await sync(bidA, {
      ...payload,
      sales: [sale, otherSale],
      payments: [payment],
    });
    assert.equal(result.products[0].stock, -8);
    assert.equal(result.sales.length, 2);
  } finally {
    await db.close();
  }
});
