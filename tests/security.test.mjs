import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
test("platform security, email-bound invitations, business permissions, branding and device saves", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to authenticated;grant execute on function auth.uid() to authenticated;alter default privileges in schema public grant select,insert,update,delete on tables to authenticated;`,
    );
    for (const file of ["001_foundation.sql", "002_business_onboarding.sql"])
      await db.exec(
        await readFile(
          new URL("../supabase/migrations/" + file, import.meta.url),
          "utf8",
        ),
      );
    const upgrade = await readFile(
      new URL("../supabase/upgrade-team-admin.sql", import.meta.url),
      "utf8",
    );
    for (const file of [
      "003_team_and_business_settings.sql",
      "004_platform_admin.sql",
      "005_authorised_sync_and_receipts.sql",
    ])
      assert.ok(
        upgrade.includes(
          await readFile(
            new URL("../supabase/migrations/" + file, import.meta.url),
            "utf8",
          ),
        ),
        "Upgrade bundle matches " + file,
      );
    await db.exec(upgrade);
    const owner = randomUUID(),
      staff = randomUUID(),
      manager = randomUUID(),
      outsider = randomUUID(),
      unconfirmed = randomUUID();
    for (const [id, email, confirmed] of [
      [owner, "owner@example.test", true],
      [staff, "staff@example.test", true],
      [manager, "manager@example.test", true],
      [outsider, "other@example.test", true],
      [unconfirmed, "unconfirmed@example.test", false],
    ])
      await db.query("insert into auth.users values($1,$2,$3)", [
        id,
        email,
        confirmed ? new Date().toISOString() : null,
      ]);
    const identity = async (id) => {
      await db.exec("set role authenticated");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        id,
      ]);
    };
    const rpc = async (name, args = []) => {
      const params = args.map((_, i) => "$" + (i + 1)).join(",");
      return (
        await db.query(`select public.${name}(${params}) as result`, args)
      ).rows[0].result;
    };
    const sync = (bid, payload) =>
      rpc("sync_workspace", [bid, JSON.stringify(payload)]);
    await identity(owner);
    const bid = await rpc("setup_business", [
      "Owner shop",
      "Retail shop",
      "",
      "",
    ]);
    assert.equal(await rpc("platform_access"), null);
    await assert.rejects(rpc("platform_dashboard"), /administrator access/);
    const invitation = await rpc("invite_staff", [
      bid,
      " STAFF@example.test ",
      "staff",
    ]);
    await identity(outsider);
    await assert.rejects(
      rpc("accept_staff_invitation", [invitation]),
      /unavailable/,
    );
    await identity(staff);
    assert.equal((await rpc("my_invitations")).length, 1);
    assert.equal(await rpc("accept_staff_invitation", [invitation]), bid);
    assert.equal(await rpc("business_role", [bid]), "staff");
    assert.equal(await rpc("may_scan_stock"), false);
    await assert.rejects(
      rpc("accept_staff_invitation", [invitation]),
      /already been accepted/,
    );
    await assert.rejects(
      rpc("sync_workspace_core", [
        bid,
        JSON.stringify({
          products: [],
          movements: [],
          sales: [],
          payments: [],
        }),
      ]),
      /permission denied/,
    );
    await assert.rejects(
      rpc("invite_staff", [bid, "other@example.test", "manager"]),
      /Only the business owner/,
    );
    await assert.rejects(
      rpc("update_business_settings", [
        bid,
        JSON.stringify({ name: "Hijacked" }),
      ]),
      /Only the business owner/,
    );
    await db.query(
      "update public.memberships set role='owner' where business_id=$1 and user_id=$2",
      [bid, staff],
    );
    assert.equal(await rpc("business_role", [bid]), "staff");
    await identity(owner);
    assert.equal(await rpc("may_scan_stock"), true);
    const p = {
        id: randomUUID(),
        name: "Rice",
        category: "Food",
        unit: "bag",
        stock: 20,
        cost: 10000,
        price: 15000,
        threshold: 3,
      },
      movement = {
        id: randomUUID(),
        productId: p.id,
        quantity: 20,
        reason: "Opening stock",
        createdAt: new Date().toISOString(),
      };
    const base = {
      products: [p],
      movements: [movement],
      sales: [],
      payments: [],
      deviceId: randomUUID(),
    };
    await sync(bid, base);
    const settings = {
      name: "New shop name",
      business_type: "Retail shop",
      phone: "08000000000",
      address: "Jos",
      receipt_footer: "Thank you from our team",
      receipt_width: 58,
      logo_url: "https://example.test/logo.png",
    };
    await rpc("update_business_settings", [bid, JSON.stringify(settings)]);
    const sale = {
      id: randomUUID(),
      createdAt: movement.createdAt,
      total: 15000,
      paid: 15000,
      method: "Cash",
      customer: "",
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
    await identity(staff);
    let state = await sync(bid, { ...base, sales: [sale] });
    assert.equal(state.products[0].stock, 19);
    assert.equal(state.sales[0].branding.name, "New shop name");
    assert.equal(state.sales[0].branding.width, 58);
    await assert.rejects(
      sync(bid, {
        ...base,
        products: [p, { ...p, id: randomUUID() }],
        sales: [sale],
      }),
      /owner or manager/,
    );
    const more = {
      id: randomUUID(),
      productId: p.id,
      quantity: 5,
      reason: "Delivery",
      createdAt: movement.createdAt,
    };
    await assert.rejects(
      sync(bid, { ...base, movements: [movement, more], sales: [sale] }),
      /owner or manager/,
    );
    await identity(owner);
    const managerInvite = await rpc("invite_staff", [
      bid,
      "manager@example.test",
      "manager",
    ]);
    await identity(manager);
    await rpc("accept_staff_invitation", [managerInvite]);
    assert.equal(await rpc("may_scan_stock"), true);
    state = await sync(bid, {
      ...base,
      movements: [movement, more],
      sales: [sale],
    });
    assert.equal(state.products[0].stock, 24);
    await assert.rejects(
      rpc("business_team", [bid]),
      /Only the business owner/,
    );
    await identity(owner);
    await rpc("update_business_settings", [
      bid,
      JSON.stringify({ ...settings, name: "Latest branding" }),
    ]);
    state = await sync(bid, {
      ...base,
      movements: [movement, more],
      sales: [sale],
    });
    assert.equal(state.sales[0].branding.name, "New shop name");
    await rpc("update_team_access", [bid, staff, "remove"]);
    await identity(staff);
    await assert.rejects(sync(bid, base), /access denied/);
    await identity(owner);
    const revoked = await rpc("invite_staff", [
      bid,
      "other@example.test",
      "staff",
    ]);
    await rpc("revoke_staff_invitation", [bid, revoked]);
    await identity(outsider);
    await assert.rejects(
      rpc("accept_staff_invitation", [revoked]),
      /unavailable/,
    );
    await identity(owner);
    const unconfirmedInvite = await rpc("invite_staff", [
      bid,
      "unconfirmed@example.test",
      "staff",
    ]);
    await identity(unconfirmed);
    assert.deepEqual(await rpc("my_invitations"), []);
    await assert.rejects(
      rpc("accept_staff_invitation", [unconfirmedInvite]),
      /confirmed email/,
    );
    await identity(outsider);
    await assert.rejects(
      db.query(
        "insert into public.platform_admins(user_id,role) values($1,'owner')",
        [outsider],
      ),
      /permission denied/,
    );
    await db.exec("reset role");
    const bootstrap = (
      await readFile(
        new URL("../supabase/bootstrap-platform-owner.sql", import.meta.url),
        "utf8",
      )
    ).replaceAll("ogadizion01@gmail.com", "owner@example.test");
    await db.exec(bootstrap);
    await assert.rejects(db.exec(bootstrap), /already configured/);
    await identity(owner);
    const dashboard = await rpc("platform_dashboard");
    assert.equal(dashboard.businessCount, 1);
    assert.equal(dashboard.activeBusinesses, 1);
    assert.equal(dashboard.salesCount, 1);
    assert.equal(dashboard.businesses[0].name, "Latest branding");
    await rpc("set_platform_access", ["other@example.test", "viewer"]);
    await assert.rejects(
      rpc("set_platform_access", ["owner@example.test", "remove"]),
      /owner must remain/,
    );
    await assert.rejects(
      rpc("set_platform_access", ["unconfirmed@example.test", "admin"]),
      /confirm their email/,
    );
    await identity(outsider);
    assert.equal(await rpc("platform_access"), "viewer");
    assert.equal((await rpc("platform_dashboard")).businessCount, 1);
    await assert.rejects(
      rpc("set_platform_access", ["manager@example.test", "owner"]),
      /Only the platform owner/,
    );
    assert.equal((await db.query("select * from public.sales")).rows.length, 0);
  } finally {
    await db.close();
  }
});
