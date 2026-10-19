# Admin, team access, and recovery upgrade

Billing and subscription entitlements remain on hold. These features are not implemented or represented as active.

## Apply the database upgrade

The existing production database already has migrations 001 and 002. Run **`supabase/upgrade-team-admin.sql` once** in the Supabase SQL editor. This contains migrations 003–005 in a transaction. Do not run both the individual migrations and the combined file. For a new database, apply 001, 002, then the combined upgrade. Regenerate the combined file after editing migrations using `node scripts/prepare-upgrade.mjs`.

After that, run **`supabase/bootstrap-platform-owner.sql` once**. It targets Heaven's supplied email, `ogadizion01@gmail.com`, and requires that account to be registered and confirmed. If your Shopilot login differs, change the email first. The script refuses to bootstrap a second time. No password, private key, or service-role key is in this script.

These SQL scripts require your privileged SQL-editor session. The web application and anonymous key cannot bootstrap an administrator. Existing business sign-in has a compatibility fallback while the upgrade is pending; new features become usable only after the upgrade.

## Private platform dashboard

Visit `/admin` and sign in. Authorisation is checked in PostgreSQL for every privileged request. Business ownership is separate from platform access. The dashboard shows registered accounts and businesses, staff membership count, transaction counts, scan usage, last successful device saves and recent platform-access changes. It does not expose individual customer transactions or claim to monitor server uptime, Vercel CPU usage, or errors outside the connected database.

Only a platform **owner** can grant/revoke platform access. Added users must already have a confirmed account. Admin and viewer roles can monitor the dashboard; neither can change platform access. At least one owner must remain. Platform role tables have no client write policies; there is no self-promotion endpoint. Access changes are audited. The app does not store platform dashboard results in the offline business cache.

## Staff invitations

Business owners use Settings → Team & permissions to create an email-bound invitation. Invitations expire after seven days. Copy and share the invitation link; this release does **not send an invitation email automatically**. The recipient registers or signs in using exactly the invited email, confirms it, and explicitly accepts the invitation. A different account, an expired/revoked invitation, or an unconfirmed email is rejected on the server.

- Owner: business settings, receipt branding, team access, inventory, sales and repayments.
- Manager: inventory, products, sales and repayments. Cannot manage team or business branding.
- Sales staff: sales and repayments. Cannot add products or change stock.

All members can read their business's records in this release. These roles do not offer cost-price masking or granular report restrictions. Business owners can change manager/staff roles and remove members. The owner membership cannot be removed or transferred through staff controls. Multi-business members can use Switch business in Settings.

Removing access prevents further server access. Cached data cannot be remotely erased from a disconnected device. Offline operations use the last prepared membership; new operations are checked against the current server role when uploaded. Retain a backup if a role change prevents previously offline work from uploading.

## Data preservation

Every successful local journal transaction also updates pending-operation metadata. Online changes trigger a save immediately; reconnect/focus and periodic checks retry. Slow account uploads do not hold the local sale-entry lock. Reconciliation preserves records entered while an upload was in flight and acknowledges only the server-confirmed operations.

Settings shows the pending count, last completed account save and browser persistence status. The owner may request persistent storage. The browser decides whether to grant it; neither persistence nor service-worker caching prevents deliberate browser clearing, device loss, or all eviction cases. Work not yet uploaded exists on that device only.

Business backups are version 2 JSON files tied to the business UUID. Recovery previews counts and merges immutable operation references, rejects cross-business files, conflicts, invalid totals and overpayments, and recomputes stock from the merged journal. It does not overwrite current records or replay an already known sale/payment. Older unbound version 1 backups are rejected rather than being assigned to a business by guesswork. Keep a copy before manual recovery. The previous local snapshot is retained as an additional device-local checkpoint; it is not an independent cloud backup.

An owner can restore uploaded records on another device by signing in online. This cannot recover records lost before the first upload. Supabase database backups and tested disaster recovery remain separate operational responsibilities; this upgrade does not claim to provide independent disaster recovery or scheduled external backups.

## Business and receipt settings

Owners can edit business name/type, phone/address, receipt footer, HTTPS logo-image URL and printer width (58 or 80 mm). Each new sale stores a branding snapshot; edits apply to later receipts. Receipts created before branding snapshots existed use the available business details. Logos depend on their image host/browser cache; offline text receipts remain available when images do not load.

## Account recovery

Forgot password now has a dedicated email form and a neutral sent-link screen. Recovery asks for the new password twice, provides strength feedback/show-hide controls, and returns to sign-in after success. Configure Supabase Site URL, allowed redirects and working SMTP email delivery for the production Vercel domain. Validate real confirmation/recovery links on target browsers; local SQL tests cannot exercise an email provider.

## Verification

Automated tests execute the actual SQL migrations against local PostgreSQL/PGlite with an auth shim: wrong-user invite acceptance, staff inventory denial, direct legacy-sync denial, owner-only team/settings actions, invitation revocation, verified-email requirements, no platform self-promotion, owner delegation, last-owner protection, immutable receipt branding and device activity. Domain tests cover business-bound backup restore and writes occurring during an upload. IndexedDB tests cover atomic pending-state metadata and business isolation.

Hosted Supabase auth/email, actual browser storage pressure, physical receipt printers, and long multi-device sessions still require production-like acceptance testing. Do not treat a compiled build as evidence that those external checks passed.
