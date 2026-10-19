# Shopilot — agreed product direction

Status: Initial development scope, 19 October 2026. Production launch requires implementation and verification; this document does not imply launch readiness.

Implementation milestone: initial local application, offline shell/storage, products, receiving and adjustments, itemised sales, partial credit and repayments, receipts, CSV/JSON exports, basic rule-based insights, Supabase account/workspace/sync source and database migration, and authenticated Gemini review endpoint are implemented. Local domain and database tests pass; hosted integration and the remaining workflows listed in README.md are not complete. Vercel deployment has not been performed.

Owner entry flow updated: explicit sign-in/account creation, email confirmation, business onboarding (name/type/phone/address), private empty dashboard after setup, returning business restoration, and sign-out. Dashboard access requires an account/business; old device-only QA records are isolated from the owner flow. Supabase configuration is required to use registration.

Admin/team/recovery upgrade: private platform roles/dashboard, email-bound staff invitation links, owner/manager/staff write permissions, business/receipt settings, branded sale snapshots, dedicated recovery UX, persistent-storage request, pending-save metadata, immediate nonblocking uploads, and business-bound backup restore are implemented in source. Production activation requires migrations 003–005 and privileged owner bootstrap. Billing and subscription entitlements are explicitly on hold. Browser eviction of unsynced work remains an inherent risk; the app mitigates it and reports pending work rather than promising permanent device storage.

## Customers and purpose

General small shops, retailers, and wholesalers, initially in Nigeria. Help owners manage stock, sales, customer credit, and business performance. Large supermarkets, mall management, and external retail POS integrations are excluded from this product's initial scope.

## Required workflows

- Separate businesses with private records, configurable business details, owner and staff permissions.
- Products, categories, prices, purchase costs, explicit carton/pack/unit conversion rules, and opening stock.
- Stock receiving with supplier details, physical counts, damaged stock, and reasoned adjustments.
- Photo-assisted stock receiving: upload or take photos, suggest product matches and quantities, review and edit, then explicitly confirm. No inventory mutation before confirmation. Unknown products and uncertain quantities require resolution. Recognition failure must leave manual receiving available.
- Record itemised sales; support cash, externally processed card payments, bank transfers, credit, partial payments, and split payments. Distinguish recorded payment method from verified payment status.
- Track customers, outstanding balances, and repayment history without counting repayments as new sales.
- Receipts, sale history, returns and reversals with preserved audit history.
- Reports distinguishing sales value, money collected, outstanding credit, cost of goods sold, and estimated gross profit. Do not label gross profit as net profit.
- Business Insights: explain sales trends, fast/slow movers, low-stock suggestions, margin observations, and debt follow-up. Show evidence and data limitations; suppress unsupported recommendations. User-selected actions may have targets and due dates.
- CSV product import and record exports.
- SaaS onboarding and subscription/access lifecycle. Billing provider remains undecided.

## Reliability requirements

Business data isolation enforced on the server; atomic sale and inventory updates; duplicate-request protection; historical prices and costs; exact monetary arithmetic; audit trails; secure sessions; recoverable backups; migrations; tested critical flows. No fabricated production data or simulated successful image analysis.

## Deferred

Barcode scanning, external POS connectors, enterprise warehouse operations, open-ended AI analyst chat, advanced forecasting, returnable packaging deposits, and payment-terminal replacement.

## Confirmed infrastructure and offline requirements

- User preference: Vercel hosting, Supabase database, and Google Gemini image recognition. Use these as the implementation direction; review specific plans and credentials before deployment. User-selected hosting supersedes default Sites hosting.
- Offline sales and documentation are required. Interpret documentation initially as access to saved sale records, receipts, and an offline usage guide; confirm any additional document types during workflow design.
- Build an installable web app with local durable storage, a pending operation queue, unique operation references, explicit sync states, and server-side idempotent processing.
- Initial online sign-in and device preparation are necessary. Offline access is for previously authorised devices and cached business data.
- Offline payment records do not establish bank/card verification. Gemini photo recognition requires connectivity; allow photo capture and draft receiving offline, with recognition queued until connected.
- Multiple offline devices cannot guarantee a globally current stock balance. Preserve completed sale records and surface stock conflicts for owner resolution; never silently discard a sale or present pending sync as confirmed server acceptance. Final stock policy must be documented and tested before rollout.
- Include setup/deployment instructions, owner/staff usage guides, offline/sync troubleshooting, backups/recovery guidance, and environment variable documentation without secrets.
- User-selected working name: Shopilot. Domain and trademark availability have not been checked.

## Defaults pending user input

Mobile-friendly web application; NGN; Africa/Lagos business time; neutral placeholder branding. Hosting and model credentials must be held server-side. Never collect secrets in source control.

## Decisions to resolve

- Product name and branding (can remain provisional).
- Detailed offline conflict and device-specific stock policies before implementation of checkout.
- Pilot access, representative product lists, and representative stock photos for validation.
- Service account configuration, specific service plans, and subscription collection approach before live deployment.

## Delivery sequence

1. Finalise architecture and acceptance criteria; establish application and data foundations.
2. Deliver products, receiving, sales, credit, receipts, returns, and basic reporting as a working vertical slice.
3. Add photo recognition with mandatory review and measured evaluation on representative photos.
4. Add evidence-based insights, subscription lifecycle, operational controls, and production verification.

Use staged delivery without treating a UI preview as a production-ready service.
