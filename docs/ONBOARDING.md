# Owner account and business setup

Shopilot now opens at sign-in. The dashboard is mounted only after an authenticated owner's business has been selected. Without configured Supabase environment variables, the login form explains that the account service is unavailable; it does not simulate successful account creation.

1. Choose **Create an account**, enter owner name, email and password.
2. Confirm the account email when required by Supabase.
3. Sign in. An owner with no workspace is taken to **Tell us about your business**.
4. Enter business name and type, with optional phone and address.
5. **Create my business** creates a business and owner membership in one database transaction. It starts with no inventory, sales, payments or customers. Add opening inventory after setup.
6. Returning owners sign in directly to their existing business. Settings shows its details and provides sign-out.

Apply migrations `001_foundation.sql` then `002_business_onboarding.sql` in order. Existing projects that already ran 001 need only 002. Configure Supabase email confirmation, redirect URLs and recovery email delivery before accepting owner accounts.

Business data is scoped to the business UUID in both PostgreSQL and the device cache. Legacy browser QA records from the original device-only workspace remain preserved under the old IndexedDB key for recoverability, but no application path loads them into a business. No broad browser-storage deletion is performed.

Offline access requires a previously signed-in account and a prepared business on this device. Signed-out visitors cannot use offline access as a dashboard bypass. The cache is not an encryption boundary: keep the device/browser profile private. Hosted authentication, confirmation email, recovery links and logout across devices still require verification against configured Supabase.
