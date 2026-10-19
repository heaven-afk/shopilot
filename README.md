# Shopilot

An initial working implementation of the agreed small-shop and wholesaler SaaS. Mobile-friendly Next.js application with an IndexedDB local workspace, offline page caching, Supabase account/workspace integration, and Gemini-assisted stock review.

**Development build, not a production launch.** Local workflows have automated and browser verification. The migration, access policies and sync functions are tested in a local PostgreSQL runtime. Hosted authentication, live cloud sync, and Gemini results require integration verification against configured services before accepting live business records.

## Run locally

Requires Node.js 22.18+ (Node 24 recommended).

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Open http://127.0.0.1:3000. The app opens at sign-in. Without Supabase configuration, sign-in and account creation are visibly unavailable; no login or business creation is simulated. After sign-in, owners without a business go through business setup. Each business starts empty, with no seeded sales or fake metrics. Legacy local QA records are preserved separately and are never loaded into a business.

For offline page preparation, use the production build:

```powershell
npm run build
npm run start
```

Development mode deliberately does not register the service worker. On localhost, run production mode from a clean browser profile or unregister old workers after code changes. New deployments should bump the service worker cache version when the shell changes.

## Configure Supabase

1. Create a Supabase project; retain its database password securely.
2. For a new database, apply `001_foundation.sql`, `002_business_onboarding.sql`, then `supabase/upgrade-team-admin.sql`. Existing databases with 001 and 002 need only the combined upgrade. Do not rerun applied migrations. For platform access, follow `docs/ADMIN-TEAM-RECOVERY.md` and run the separate privileged owner bootstrap once.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`. The latter is the public client key, not a service-role key. Never expose the service-role key in a browser variable.
4. Configure Authentication site/redirect URLs for localhost and the eventual Vercel address. Keep email confirmation enabled and configure a suitable email sender before production.
5. Restart the app. Choose Create an account on the opening page, enter owner name/email/password, confirm email if required, and sign in.
6. Complete business setup: name, business type, optional phone and address. Returning owners enter their existing business directly. Each business uses a separate device database key. Existing device-only records are retained separately; they are not silently moved into an account.
7. Add products to the workspace. Changes trigger an online save immediately, with periodic, reconnect and focus retries. Settings → Sync now retries manually. Pending records remain local if an upload fails; the app shows the pending count and last completed save.

The migrations use server-side membership/role checks, row-level security, composite tenant foreign keys, exact integer kobo values, immutable sales/items and payment entries, per-business sync locks, and audit records. Staff invitations are email-bound and confirmed-email-only. Managers may change stock; sales staff may record sales/repayments; only business owners manage team/settings. Private platform roles are separate from business roles. Do not add broad client write policies.

### Sync boundaries

Sync sends the bounded workspace journal and retrieves its current projection. Local writes remain available during the network request; operations created in flight remain pending after the acknowledged snapshot is merged. This is suitable for a small pilot, not unbounded histories. Incremental cursors, batching, server pagination, configurable retry backoff, duplicate-content checks and dedicated conflict-resolution tooling remain required before large-scale use. The platform dashboard reports successful save activity, not complete server monitoring.

Different offline devices can sell the same remaining stock. Both completed sales are retained when uploaded, and a negative derived stock balance is surfaced for reconciliation. No system can guarantee a globally current stock balance between disconnected devices without preallocating stock. Review physical stock and record a reasoned adjustment. Duplicate operation IDs are imported only once.

Competing debt repayments that exceed a current server balance cause the sync transaction to roll back. Local entries stay intact and the error is displayed; owner reconciliation tooling is a follow-up requirement. Never clear local data as a retry strategy.

## Configure photo recognition

1. Create a Gemini API key in your Google account.
2. Set server-only `GEMINI_API_KEY` and `GEMINI_MODEL` in the environment.
3. Configure Supabase and sign in to a workspace. The recognition route requires a valid Supabase user and reserves a database-enforced allowance (30 requests per user per UTC database day).
4. In Inventory → Receive from photo, upload a JPEG/PNG/WebP within the displayed size limit.
5. Choose Suggest stock from photo. Photos are sent to the configured Google Gemini API. Tell pilot users about this processing before collecting real images and review the provider's current data-handling terms.
6. Match each suggestion to a catalogue product, correct quantities in that product's unit, remove mistakes, and confirm. Recognition itself never updates stock. Carton contents and obscured goods must be checked by a person.

No public unauthenticated paid-model endpoint is provided. Failures remain visible and manual review rows are always available. No successful recognition is simulated. Model output is validated on the server. Evaluate accuracy with representative photos before launch.

## Vercel deployment

1. Push the repository to your Git host and import it into Vercel as a Next.js project.
2. Configure the environment variables from `.env.example` using Vercel project settings. Use separate Supabase projects/keys for preview and production environments.
3. Build command: `npm run build`; default Next.js output settings.
4. Deploy to the provided Vercel address. A custom domain can be added later.
5. Update Supabase Authentication URLs to match the deployed address. Check the selected Vercel plan's commercial-use terms, function/body-size limits, and service budgets before launch.
6. Run the acceptance checks below against the deployed project before real shop use.

No deployment or external account setup is performed by this source repository itself.

## Checks

```powershell
npm run typecheck
npm test
npm run build
```

Automated tests cover stock deduction, duplicate sale replay, insufficient stock, duplicate-line stock bypasses, zero/partial payment, overpayment, stale prices, fractional quantities, exact money parsing, historical price preservation, and repayment history without inflated revenue.

The database test executes the actual migration in PGlite (local PostgreSQL) with a test-only Supabase authentication shim. It checks cross-tenant denial, direct-write RLS denial, idempotent sync, transaction rollback, repayment constraints, offline oversell preservation, and recognition quota enforcement. This does not replace testing hosted Supabase Auth and network failures.

See `docs/ACCEPTANCE.md` for cloud, offline, concurrency, printer, and recognition checks that require configured services or target devices.

## Current limitations / remaining work

- Returns/reversals, split-payment breakdowns, stock-unit conversions, price editing/archiving, product CSV import, and complete customer profiles.
- Subscription billing and entitlements are explicitly on hold. Staff permissions are role-based rather than field/report-level restrictions.
- Payment acknowledgement receipts, physical 58mm/80mm printer validation, automated PDFs, report filters/pagination, richer growth/action-plan workflows.
- Production-quality incremental sync and reconciliation; verified tenant isolation and database backup/restore drills.
- Persistent-storage requests, atomic pending-state metadata, immediate upload, business-bound JSON backup recovery and account restoration reduce device-storage risk. Browsers can still clear/evict unsynced records, and independent database disaster recovery remains necessary. See the upgrade guide for exact guarantees and deployment steps.

See `PRODUCT-SCOPE.md` for the agreed direction and `docs/USER-GUIDE.md` for usage.
