# Acceptance checks

## Verified locally during initial implementation

- TypeScript validation and production compilation.
- Automated domain test suite.
- Browser: create a labelled test product with 50 cartons; sell 8; stock becomes 42; receipt total is ₦40,000 at ₦5,000 per carton; reload retains records.
- Browser: create a ₦5,000 sale with ₦2,000 paid, post a ₦1,000 repayment, and verify total sales ₦45,000, total money collected ₦43,000, outstanding credit ₦2,000 across the test records.
- Cached production app reloads and inventory navigation remains interactive after the local HTTP server is stopped. This is a server-unavailable test; target-device network-offline checks remain required.
- Actual SQL migration executed using local PostgreSQL/PGlite with a test-only auth shim: tenant read/write isolation, repeat sync without duplicate stock/sales/payments, repayment overpayment rollback, invalid-sale rollback, offline oversell preservation, and recognition quota enforcement passed.
- Business onboarding migration tested: name/type/phone/address persistence; a new business has empty products, sales, movements and payments; duplicate business setup is rejected; invalid business types roll back creation.
- Browser: signed-out entry opens sign-in, account creation shows owner name/email/password, and the disconnected account-service state disables authentication without revealing the old dashboard or QA figures. Hosted confirmation/setup/recovery still need configured-service tests.

## Required against configured services before launch

1. Create two unrelated Supabase users/workspaces. Verify each cannot read or invoke sync for the other's business. Repeat with direct REST/RPC requests, including fabricated tenant and product references.
2. Sync an operation repeatedly and concurrently. Verify one sale, one stock deduction, one repayment. Disconnect during responses and retry. Verify server rollback does not silently discard local records.
3. Exercise authenticated and expired-session photo requests. Verify missing key, invalid images, quota exhaustion, model refusal, malformed output, and timeout produce explicit errors without inventory changes. Verify no private key is bundled into browser assets.
4. On target phones, prepare offline while online. Disconnect Wi-Fi/mobile data, reload, record sales and print/view receipts, then reconnect. Verify every operation appears once in the cloud. Test multiple tabs, app restarts, browser quota errors, revoked sessions, and evicted caches.
5. Sell the same remaining stock on two offline devices. Verify both sales survive sync, negative inventory is flagged, and reconciliation is auditable. Try concurrent repayments and verify overpayment is rejected without losing local history.
6. Test carton/bottle mismatches in recognition review, obscured products, similar packaging, low light, delivery notes, and recognition errors against measured expected outcomes.
7. Verify Lagos day boundaries, large values, zero-value sales policy, returns/reversals once implemented, full historical pricing, and consistent report totals.
8. Check keyboard navigation, dialog focus management, small-screen layout, readable error states, thermal printer fit, and PDF output on target devices. Dedicated 58mm output is still outstanding.
9. Run Supabase backups and a restore drill; test recoverability from local/cloud interruption before onboarding live businesses.

## Not yet verified

Hosted cloud integration, live Gemini recognition, deployment, physical printer output, true network-offline device behaviour, backup restoration, and simultaneous multi-device conflicts require further validation. Local PostgreSQL checks use an auth shim; do not infer hosted Supabase authentication passed from those checks.
