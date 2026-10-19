# Shopilot owner guide

## Your first setup

Choose Create an account from the opening screen, enter your owner details, confirm your email, and sign in. Complete business setup with your business name, type, optional phone and address. Your business starts with empty records. Returning owners sign in to the same business. Account creation requires the administrator to connect Supabase first.

Add products in Inventory. Enter prices in naira; the app stores exact kobo amounts internally. Choose an explicit unit, for example `bottle` or `carton of 24`. Do not record bottles against a carton product: automatic conversions are not implemented in this build.

Opening stock is the quantity already held. Receive stock adds a later delivery. Counting goods already on the shelf is not a delivery: calculate the difference and record a reasoned adjustment instead.

## Sell goods

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

When connected, a business workspace synchronises periodically while the page stays open. Settings → Sync now retries immediately. Browser background execution is not guaranteed: reopening the app may be necessary. A signed-out visitor cannot open business records.

If two devices sell the same stock offline, reconcile any negative balance after sync using a physical count and a reasoned adjustment. Do not erase completed sales. If payments conflict, export a backup and retain the device records until an owner resolves the discrepancy.

## Protect your records

Export a device backup in Settings regularly, especially before changing devices or troubleshooting. CSV exports are for analysis; the JSON backup contains the journal. This first build does not yet expose backup restoration in the UI. Keep customer records and backups private. Do not share a browser profile between unrelated businesses or users. Signing out does not securely erase cached records from a shared device.

Use sales and margin insights as evidence to review, not automatic financial decisions. Gross profit excludes rent, wages, electricity, and other expenses.
