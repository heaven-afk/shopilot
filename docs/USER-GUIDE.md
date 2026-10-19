# Shopilot owner guide

## Your first setup

Choose Create an account from the opening screen, enter your owner details, confirm your email, and sign in. Complete business setup with your business name, type, optional phone and address. Your business starts with empty records. Returning owners sign in to the same business. Account creation requires the administrator to connect Supabase first.

Add products in Inventory. Enter prices in naira; the app stores exact kobo amounts internally. Choose an explicit unit, for example `bottle` or `carton of 24`. Do not record bottles against a carton product: automatic conversions are not implemented in this build.

### Passwords and autofill

Sign-up and password reset include a live strength guide and a checklist for length, uppercase/lowercase letters, numbers, and symbols/spaces. At least eight characters are required; twelve or more are recommended. The checklist is guidance, not an additional composition requirement: a long, unique passphrase is also supported. Strength is an estimate, not a breach check. Use the eye button to show or hide the password without submitting the form. Login does not apply new password-composition rules to an existing account.

Account and business fields have autofill names and autocomplete hints. Password managers can generate and fill new passwords; submission reads current form values even when autofill did not dispatch a React change event. Mobile input sizes and toggle touch targets are designed for small screens. Actual password-manager behaviour can vary by browser/provider.

Opening stock is the quantity already held. Receive stock adds a later delivery. Counting goods already on the shelf is not a delivery: calculate the difference and record a reasoned adjustment instead.

## Sell goods

### On a phone

The mobile app uses bottom navigation: Home, Stock, Sell, Credit, and More. More contains sales history, business insights, settings, help, and sign-out. The home screen has a daily sales summary, collected money, customer credit, quick stock actions, a weekly sales view, and receipt cards. Stock and sales lists use phone-friendly cards instead of wide tables. While recording a sale, the Review sale bar jumps to the checkout summary. Desktop retains its sidebar and table layouts.

### Record a sale

Open Record sale, select products, and set quantities. Leave the payment amount blank for full payment or enter an amount, including zero, for a credit sale. A customer name/phone/reference is required if a balance remains. Select the payment method actually used. Card and transfer labels record staff entries; Shopilot does not contact the terminal or bank to verify them.

Confirm once. Saving is protected against repeated clicks, and database replay uses the sale reference to avoid a second deduction. The receipt opens after a successful local save. Print / Save PDF opens the browser print dialog. Reprinting a receipt from history does not create a sale.

## Customer repayments

In Customers & credit, choose Record debt repayment. Select the original sale and amount received. The app maintains separate payment entries; previous payments are preserved. Repayments increase money collected and reduce debt, not sales revenue. Payment history appears below outstanding sales. Due dates are not implemented, so outstanding balances are not automatically described as overdue.

## Photo-assisted receiving

Take a clear photo of delivered goods. Keep all counted cartons visible and avoid mixing loose units with cartons in a pile. Upload it in Scan stock and request suggestions when connected. Map each row to the right product and verify quantities against that product's stock unit. A suggestion of four visible cartons does not establish the number of bottles inside. Confirming reviewed rows adds stock; uploading or analysing does not.

Manual rows can be added if recognition is not configured or fails. Product registration is separate from receiving: new products need to be created in Inventory first.

The most recent uploaded photo is saved as a device-local draft so it can be reopened after a reload while offline. It is removed after successful receiving confirmation. Recognition suggestions are not retained across reloads; review rows can be rebuilt when connected. Photos are not uploaded by cloud sync.

## Offline and sync

Open the production application online once and wait for device storage/offline preparation. Prepare the cloud workspace and catalogue before disconnecting. Keep using the same browser profile and device. Saved sales persist locally; pending sync is not proof of cloud backup.

When connected, each local change triggers an account save; periodic, focus and reconnect checks retry. You can keep entering sales while an upload is in progress. Settings → Sync now retries immediately. Browser background execution is not guaranteed: reopening the app may be necessary. A signed-out visitor cannot open business records.

If two devices sell the same stock offline, reconcile any negative balance after sync using a physical count and a reasoned adjustment. Do not erase completed sales. If payments conflict, export a backup and retain the device records until an owner resolves the discrepancy.

## Protect your records

Settings → Keep your records recoverable shows pending changes and the last completed account save. Request persistent browser storage to reduce automatic eviction risk. Export a business backup before changing devices or troubleshooting. The JSON backup is bound to your business; an owner or manager can inspect and merge it through the recovery control without duplicating known sales or payments. Other-business files and conflicting references are rejected. Sign in online on a replacement device to restore records already uploaded to your account. Unsynced work lost with a device cannot be recovered from the account.

Keep customer records and backups private. Do not share a browser profile between unrelated businesses or users. Signing out does not securely erase cached records from a shared device. Persistent storage does not prevent deliberate clearing.

## Team and branding

Owners can invite staff from Settings, copy the email-bound invitation link and share it. The recipient signs in with the invited, confirmed email and accepts the invitation. Invitations expire in seven days and can be revoked. Managers can manage products/stock and record sales; sales staff record sales/repayments. Owners manage team roles and business branding. All members can read business records in this release.

Owners can change business details, receipt message, HTTPS logo URL and 58mm/80mm width in Settings. New sales keep a copy of that branding. Later changes do not rewrite those receipt snapshots. If you belong to more than one business, use Switch business in Settings.

## Recover your account

Choose Forgot password on the sign-in screen, enter your account email and open the recovery link from your inbox. Choose and confirm the new password, then sign in again. If the link has expired, request a new one. A neutral sent-link screen protects whether a particular email has an account.

Use sales and margin insights as evidence to review, not automatic financial decisions. Gross profit excludes rent, wages, electricity, and other expenses.
