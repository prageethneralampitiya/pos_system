# Walkthrough - PRINT X POS System

We have successfully resolved compilation bugs, finalized dynamic branding configurations, and added workflow enhancements to the **PRINT X POS System**. Below is a summary of the accomplishments and verification outcomes.

---

## 1. Resolved Issues & New Accomplishments

* **Resolved JSX Compilation Fix (`/customers/page.js`):** Resolved the premature closing `</div>` tag at line 376 that was breaking build compilation. The entire page and right sidebar panel (Lifetime Deal statistics, Contact info, Billing history tabs) now render flawlessly.
* **Mock Database Client Builder Fix (`src/lib/supabaseClient.js`):** Resolved a critical builder pattern execution bug where updates to customer outstanding balances (and order updates) were running immediately on the mock table before filters (like `.eq("id", customerId)`) could be chained. This was causing all customer records to update to the same outstanding balance value. We deferred updates until execution (`execute()`), ensuring only targeted rows are modified.
* **Orders Page ReferenceError Fix (`/orders/page.js`):** Imported the `Receipt` icon from `lucide-react` to resolve a runtime ReferenceError.
* **Owner Account Bootstrapping & Sign Up (`/login` and `AuthGuard.js`):** Added support for direct onboarding of owner accounts. The system now automatically grants the `owner` role to the very first user who registers, or to any user signing up with an email containing "owner" (e.g., `owner@printx.lk`). We also added a **Sign Up** option to the login page to enable initial account creation in production.
* **Responsive Sidebar & Navigation Fix (`layout.js` and `globals.css`):** Fixed a layout bug where the sidebar container's responsive properties (like `left: -280px` on mobile) were written as inline React styles, overriding CSS media queries and causing the sidebar to be completely hidden off-screen (left: -280px) on desktop screens too. Moved the responsive rules (sidebar positions, main content padding shift, and mobile header displays) to standard CSS classes, making the sidebar and its **Log Out** button fully visible on desktop.
* **Dynamic Shop Branding on Customer Statements (`/customers/[id]/print/page.js`):** Modified the customer account statement print template to load configurations dynamically from `localStorage` (matching the invoice print page). The statement printout now dynamically renders:
    - **Global Logo Rendering**:
   - Modified the print layout templates (for both invoice receipts and customer account statement print pages) to load settings dynamically from the database on mount.
   - This ensures all computers (Owner dashboard, Staff checkout terminals, and Customer statements opened from portal links) display the company branding and business logo correctly.
   - **Print Loader Race Condition Fix:** Implemented a `settingsLoading` tracking state to ensure that automatic printer triggering (`window.print()`) is put on hold until **both** the invoice database record and the large business configuration logo payload have completed their fetch operations. This resolves cases where the browser's print dialog opened before the logo state finished binding, causing empty print headers.
   - **Hardcoded Static Public Logo:** Extracted and decoded the database Base64 logo data directly into a static image file stored in the project directory at `public/logo.png`. Updated the print layout rendering logic (`src/app/orders/[id]/print/page.js` and `src/app/customers/[id]/print/page.js`) to render `/logo.png` directly as a static server asset, resolving print rendering failures across incognito sessions and remote devices instantly.
    - **Invoice Print Integration:** The printed receipt slip now displays the actual percentage or cash discounts in its "Discount" column instead of a hardcoded `0.00%`.

---

## 5. Teacher Outstanding Balances Ledger (restricted to Owner/Manager)

We have built a dedicated **Outstanding Balances** ledger tab in the Reports Center and integrated it directly into the navigation:

1. **Direct Sidebar Navigation:** Added a dedicated **Teacher Balances** option to the left navigation panel (restricted exclusively to `owner` and `manager` profiles) pointing to `/reports?tab=outstanding`.
2. **Tab URL Syncing:** Updated `/reports` to read search parameters (`?tab=...`), ensuring direct links immediately select the requested view.
3. **Smart Active Highlights:** Configured layout navigation matching to correctly highlight "Teacher Balances" in the sidebar when visiting `/reports?tab=outstanding`, separating it from the general "Reports" sidebar highlight.
4. **Owner/Manager Access Control:** Only users with `owner` or `manager` roles can view and access this tab.
5. **Aggregated Financial Metrics:**
   - **Total Outstanding Debt:** Sum of all outstanding debts across all teacher/customer profile ledgers.
   - **Active Clients in Debt:** Total count of teachers/students currently carrying an unpaid balance.
6. **Ledger Table:**
   - Lists all teachers currently carrying debt.
   - Shows customer name, contact phone, current outstanding balance, and **Last Deal Date** (automatically calculated from the database as the timestamp of their most recent transaction).
   - Allows search filtering by teacher name or phone.
7. **Action Hooks:**
   - **View Statement:** Changes the active tab to *Customer Statements* and auto-selects that customer so the owner can instantly inspect their itemized billing timeline.
   - **Print Statement:** Opens their official statement print sheet in a new tab.
  - Shop Logo (loaded from owner settings)
  - Address Lines 1, 2, and 3
  - Shop Contact Phone, Email, and Footer Info
* **POS UX & Navigation Enhancements (`/pos/page.js`):**
  - **Client Selector Modal:** Automatically focuses the customer directory search box upon loading or resetting the screen. Added direct **Exit to Dashboard** and **Sign Out** buttons underneath the customer selection to prevent cashiers from getting locked inside the POS dialog when they want to change users or navigate away.
* **Inactivity Passcode Blocker:** Automatically focuses the passcode input field when the 2-minute lock screen triggers, and added a **Sign Out / Switch Account** shortcut button inside the locker overlay.
* **Owner Balancing Logs Tab (`src/app/(authenticated)/reports/page.js`):**
  - Added a **Day/Week Balancing Logs** tab restricted to owner/manager profiles.
  - Renders tables displaying all submitted Day End shift records and Week End Sunday audits.
* **Lock Global Name Collision Resolution (`src/app/(authenticated)/settings/page.js`):**
  - Resolved a runtime `Illegal constructor` error caused by a missing import of the `Lock` icon from `lucide-react`. The absence of this import caused React to resolve `<Lock>` to the browser's global Web Locks API constructor (`window.Lock`), which threw an illegal constructor exception when rendered.
* **Staff Full Name Option & Registry Overhaul (`settings/page.js` & `supabaseClient.js`):**
  - Added a **Staff Full Name** input field to the user registration card for owners.
  - Saves the full name to Supabase Auth metadata and profiles table.
  - Overhauled the User Registry table to display the staff full name and `@username` together.
  - Seeded initial profiles with names and added a dynamic caching migration system to auto-upgrade existing localStorage user records.
* **Google Sheets Balancing Audits Sync (`dashboard/page.js`):**
  - Automatically dispatches `DAY_END` and `WEEK_END` audit payloads to Google Sheets via `/api/sync-sheets` upon submission.
  - Includes the active auditor's full name and username in the sheets sync request to track authorizations and prevent spams or false results.
* **Automatic WhatsApp Bill Sharing (`pos/page.js` and `orders/page.js`):** Added a feature that automatically generates a formatted WhatsApp message when checking out a registered customer. It cleans and normalizes their database phone number to international format and redirects to WhatsApp Web or the WhatsApp client with the receipt invoice link, items list, and outstanding debt. Added a **Send WhatsApp** button to the Orders manager details panel as a manual fallback.
* **WhatsApp Link & PDF Sharing Workflow:** Web browsers cannot attach files directly to WhatsApp Web links for security reasons. To make this extremely smooth for the cashier, we developed a two-step flow:
  1. Triggering WhatsApp automatically opens the print layout in a new tab, prompting the print-to-PDF save dialog.
  2. A confirmation prompt guides the cashier to open WhatsApp Web next with pre-filled message text, so they can send the message link and easily drag/attach the saved PDF file.
* **Reports & Operations Center (`/reports/page.js`):** Implemented an interactive dashboard featuring date-range and time gap filtering. Supports:
  - **Profit & Financials:** Aggregates gross sales revenue, collections, outstanding credit, and estimated net profit (with 45% margin assumption) over custom date ranges, broken down in a daily summary log.
  - **Customer Statements:** Computes period sales, collections, and pending balance for a selected customer. Includes a **Print Statement Range** button that opens a printed A4 report filtered to the exact duration.
  - **Print Item Sales:** Computes sold units, transaction counts, and total revenue grouped by catalog print service items in the selected period.
* **Navigation Sidebar Addition (`layout.js`):** Added a link to the "Reports" page in the navigation sidebar (using the Lucide `BarChart2` icon), restricted exclusively to `owner` and `manager` roles (hidden from `staff`).
* **JSX Duplicate Styles Fix (`reports/page.js`):** Fixed duplicate style attribute syntax on table headers, merging them cleanly to preserve both base header styling and custom alignment overrides.
* **POS Item Catalog Settings (`/settings/page.js` and `/pos/page.js`):** Added a new tab "POS Catalog" in the settings center that allows owners and managers to add new items, modify existing items (price, name, category), and delete items. The POS billing interface now dynamically loads items from this list (saving changes in `localStorage`), and dynamically computes categories (so that user-added categories show up instantly on the POS filter bar).
* **Direct Logo File Upload (`/settings/page.js`):** Removed the manual text-link input for the shop logo. Added a direct file uploader with image preview. It reads the uploaded file as a base64 encoded data URL, storing it in the shop settings profile. This ensures all print templates (invoices and client statements) render the logo image without needing external links.
* **Resolved Styling Warnings (Rerender Conflicts):** Resolved Console style warnings regarding "Removing a style property during rerender (borderColor) when a conflicting property is set (border)". Replaced shorthand `border: "1px solid var(--border)"` with separate values (`borderWidth`, `borderStyle`, `borderColor`) in:
  - `src/app/(authenticated)/customers/page.js` (`custRow`)
  - `src/app/(authenticated)/orders/page.js` (`orderItem`)
  - `src/app/(authenticated)/quotations/page.js` (`quoteItem`)
  - `src/app/(authenticated)/pos/page.js` (`cartRow` and `methodBtn`)
  This prevents DOM layout engine warnings during React active/inactive style transitions.
* **POS Catalog Access for Staff:** Enabled users with the `staff` role to view the Settings page and add/manage POS catalog items:
  - Allowed `staff` to navigate to the Settings page from the sidebar menu.
  - Automatically redirects `staff` to the "POS Catalog" tab in Settings.
  - Completely hides and secures "Branding details" and "Staff management" configurations from `staff` role sessions.
* **Google Sheets Two-Way Lookup API (`/api/sync-sheets`):** Added an HTTP `GET` handler to the sync-sheets route. This allows the POS backend to call the Google Apps Script Web App on-demand, enabling real-time lookups of a teacher's/customer's current outstanding balance directly from the spreadsheet (if they perform manual edits or payments inside Google Sheets).
* **Automatic Customer Registration Sheet Sync:** Triggered the `/api/sync-sheets` endpoint when registering a new customer profile. When a client is created (either in the Customers directory or via the POS registration modal), it automatically posts a `"REGISTRATION"` payload to Google Sheets, adding the customer to the master directory and automatically creating their individual student/teacher sheet tab with a 0 outstanding balance. This prepares their profile on your Cloudflare website immediately.
* **Build Verification:** Verified the entire Next.js codebase builds cleanly under production conditions (`npm run build`).
* **Print Billing Invoice Styling Refinements (`/orders/[id]/print/page.js`):** Fully overhauled the printed invoice layout to match the provided invoice mockup with pixel-perfect accuracy.

---

## 2. Teacher / Customer Portal Integration

We have built a dedicated, secure, and real-time **Teacher / Customer Portal** inside the Next.js POS app at `/portal`:

1. **Passcode (PIN) Management**:
   - Added a `portal_passcode` field to the `customers` database schema.
   - Cashiers can view and set an optional passcode in the customer creation modal. Leaving it blank defaults to the standard default PIN `"1234"`.
   - Integrated an **Edit Passcode** section inside the Customer details sidebar in the registry view. Cashiers can change a customer's login PIN at any time.

2. **Customizable Statement Durations**:
   - Added a `portal_duration_limit` database column to the `customers` schema (defaults to `"2m"` / 2 months).
   - Cashiers can modify each customer's portal view limit individually from the Customer Registry view sidebar using a dropdown (Last 1 Month, Last 2 Months, Last 6 Months, or All Time).
   - Removed the duration filter select from the customer's portal view.
   - The portal dashboard dynamically applies the customer's assigned duration limit and displays a clean, read-only status badge showing the current view range.

3. **Public Portal Screen (`/portal`)**:
   - Built a public login interface requesting Phone Number and Portal PIN.
   - Uses local/live Supabase database queries to check credentials.
   - Saves customer session in `localStorage` for continuous log-in state.
   - **First Login PIN Change Enforcement**: Intercepts logins utilizing the default passcode `"1234"` and presents an automated **Change Passcode** screen. Teachers must choose a new PIN code (which cannot be `"1234"`) to unlock their statement dashboard, securing their account instantly.

4. **Stunning Dashboard Experience**:
   - Displays a custom welcome header.
   - Features a glassmorphic summary card showing their real-time **Outstanding Balance** (instant database query).
   - Lists their complete billing history (Orders, Invoices, Status, and Balances).
   - Features a **Print** action button for each order which opens the print receipt layout directly.

---

## 6. Staff & Owner Security Tab Fixes

We have resolved a set of issues that prevented the passcode security tab from working as expected, and extended its features to cover account password updates:

1. **Staff Tab Redirection Fix:** Adjusted the redirect condition in Settings' `useEffect` loop. Staff users are now allowed to access both `"catalog"` and `"security"` tabs in Settings, rather than being forcefully redirected to the catalog view.
2. **Reactive Profile Updates:** Introduced a new `refreshProfile()` function in the global authentication context (`AuthGuard.js`). When a user updates their passcode PIN in Settings, the context profile is re-fetched and updated reactively. This ensures components like warning banners immediately recognize the change without requiring a full page refresh.
3. **New User Default Passcode:** Configured the database profile creation to automatically assign a default fast unlock passcode PIN of `"1234"` to newly registered users during registration.
4. **Seed Owner Passcode Pad Compatibility:** Changed the owner profile's default fast unlock PIN in `supabaseClient.js` from `'owner123'` to `'1234'`, making it fully numeric and compatible with the touch screen keypad overlay.
5. **Login Password Change Support:** Added a new **Change login password** form panel right inside the "My Security" tab. This form integrates with `supabase.auth.updateUser` to allow cashiers, managers, and owners to change their main account login password securely, providing clear and separate fields for fast unlock PINs and main account passwords.

---

## 7. Database Reset (Customers & Bills)

We have built a secure database maintenance feature to allow clearing transaction logs:

1. **Danger Zone Panel:** Added a new panel at the bottom of the **Branding details** settings tab (restricted to `owner` and `manager` profiles).
2. **Bulk Deletion:** Executes a targeted delete query across `orders`, `quotations`, and `customers` tables (using a `.gte("created_at", "2000-01-01")` clause for cross-platform compatibility).
3. **Seed Recovery:** Automatically re-seeds default starting profiles (`John Doe` and `Jane Smith`) with zeroed balances after clearing the database so the system remains functional.
4. **Safety Prompts:** Configured a two-step verification workflow, requiring the user to confirm the alert and manually type the word `"RESET"` before initiating the deletion.

---

## 8. Redesigned Premium A4 Printed Invoice

We converted the invoice printed template into a modern, high-end A4 design:

1. **Micro-Typography:** Preserved clean, compact, print-friendly text sizes (9px - 11px) to fit all columns without upscaling or spilling onto unnecessary pages.
2. **Modern Layout:** 
   - Restructured the header with prominent uppercase document labels and clean contact line heights.
   - Wrapped customer profiles in a stylized **Bill To** info card (`#f8fafc` background with a solid left border band).
3. **Clean SaaS Table Design:** Removed thick, legacy black borders. Swapped them for a modern borderless style with a dark slate header accent (`#0f172a`), zebra-striping rows (`#f8fafc`), and thin light gray row dividers (`#e2e8f0`).
4. **Structured Totals Panel:** Enclosed total calculations and payment methods in an outlined, shaded summary card with clear bold pricing hierarchy.

---

## 16. Disaster Recovery: Google Sheets Backup Restore Option

We implemented a disaster recovery backup import system to restore full POS databases from your connected Google Sheet:

1. **Google Apps Script Export API**:
   - Upgraded the script template `google_apps_script.js` to version 3.0.
   - Added a new `action=export_backup` lookup handler inside `doGet(e)` to dump all rows from all backup tabs (Customers, Orders, Day End Details, Weekend Details) in a single unified JSON payload.

2. **Next.js Sync-Sheets API Route Integration**:
   - Extended the local `/api/sync-sheets` REST router to support fetching full backups securely using the backend environment variable script web app link.

3. **Database Upsert Reconstruction Logic**:
   - Added a new **Disaster Recovery & Sheet Backup Import** dashboard panel under Settings.
   - Clicking **Import & Restore Backup from Google Sheet** triggers:
     - **Customers**: Restores names, phones, and historical outstanding debt balances. Assigns secure auto-generated 4-digit portal PINs.
     - **Invoices**: Resolves foreign key UUIDs based on restored customer phone numbers, generates placeholder item rows (`Restored Transaction`) mapping correct invoice amounts and statuses, and upserts transactions back to Supabase.
     - **Day End & Weekend Audits**: Reconstructs all historic cash drawer closing records and weekly reconciliation audits.

---

## 17. Quick Outstanding Balance Payments

We added a dedicated payments workflow directly inside client registry cards to record debt payments:

1. **Payments Button UI**:
   - Added a new, prominent **Payments** button (`Check` icon, orange accent theme) inside the customer detail registry panel.
   - Triggers an inline, clean form where cashiers can quickly enter the cash payment amount received from the teacher/customer.

2. **Supabase Multi-Table updates**:
   - **Customers table**: Subtracts the payment amount from the selected customer's `outstanding_balance` in Supabase, keeping their credit/debt state fully up to date.
   - **Orders table**: Creates a special payment ledger transaction (prefixed as `PAY-YYYY-XXXX`) with `total_amount = 0`, `paid_amount = X`, and `balance_amount = -X`. 
   - This ensures the daily collections metrics on the dashboard and day-end shift audits automatically include the debt collections money, maintaining 100% accurate financial counts.

3. **Google Sheets Syncing**:
   - Automatically posts the payment order row to the backend Google Sheet API, ensuring remote spreadsheets record the payment transaction and reduce outstanding balances in real-time.

---

## 18. Sequence Numbering Optimization (Duplicate Key Fix)

We resolved a duplicate key constraint error (`duplicate key value violates unique constraint "orders_order_number_key"`) on checkout:

1. **Root Cause**:
   - Previously, the POS generated invoice/quotation sequence numbers (e.g., `ORD-2026-0034`) by counting the total rows in the database table (`countData.length`).
   - If any historical record was deleted, or if custom transaction numbers (like `PAY-` payments) were inserted, the row count was lower than the actual highest sequence number.
   - This resulted in generating a sequence number that had already been used, causing a unique database constraint violation and crashing the checkout process.

2. **True Maximum Sequence Tracking**:
   - Replaced row counts in the POS system checkout, advance payments, and customer ledger panels.
   - The app now queries all existing codes for the current year, parses the suffix integers of codes matching the current prefix, identifies the actual maximum sequence number, and increments it by `1`.
   - This guarantees that sequence codes always grow sequentially (e.g. `ORD-2026-0001` -> `ORD-2026-0002` -> `ORD-2026-0003`) and never duplicate, even if rows are deleted, payments are registered, or multiple checkout points are used.

---

## 19. Debt Allocation & Payment Offsets

We upgraded the client account payments module to allocate incoming cash payments to outstanding/unpaid invoices:

1. **Root Cause of Overpaid/Negative Labels**:
   - Previously, clicking the "Payments" button on a customer's registry card registered a standalone invoice `PAY-XXXX` with a negative balance (`balance_amount = -amount`), without modifying the original unpaid invoice(s) (`ORD-XXXX`).
   - This left the original invoice marked as unpaid, while the payment transaction itself showed a confusing negative balance (which the system styled as an "overpayment" or "credit balance" on that specific invoice slip).

2. **Automated FIFO Debt Allocation**:
   - Updated `handleRecordPayment` to query all unpaid/partially paid invoices for the customer, ordered oldest first (First-In, First-Out).
   - The received payment amount is sequentially allocated to pay off the outstanding balance of these invoices:
     - Reduces the target order's `balance_amount` to `0` (or partial) and increases its `paid_amount` by the offset.
     - Automatically updates the order's status to `paid` or `partially_paid` inside Supabase and updates the synced row in Google Sheets.
   - Any leftover payment is recorded as the credit balance of the `PAY-XXXX` payment receipt itself (showing `0` if fully settled, or a negative value only if they paid more than their entire outstanding debt).
   - The UI local cache is immediately refreshed by re-fetching the customer's database history so invoice list updates are instantly visible.

---

## 20. Order Voiding Outstanding Balance Correction

We corrected a critical discrepancy where voiding a customer payment or order failed to reconcile the customer's outstanding balance:

1. **Root Cause**:
   - When an order was voided, the system checked if `selectedOrder.balance_amount > 0` before modifying the customer's `outstanding_balance`.
   - Because payment records `PAY-XXXX` have negative balances (`balance_amount < 0`), voiding a payment record skipped this block entirely. This caused the customer's outstanding balance to remain reduced even after the payment was voided, falsely marking them in credit (e.g. Miss. Saumya Jayakodi was incorrectly shown in credit for `-600 LKR` because a voided payment of `600 LKR` did not add back to her balance).
   - In addition, the use of `Math.max(0, ...)` prevented customer balances from properly reflecting account credits.

2. **Accurate Void Offset & Database Repair**:
   - Updated the conditional check in `orders/page.js` to `Number(selectedOrder.balance_amount || 0) !== 0`, ensuring both positive invoice voids and negative payment voids trigger the adjustment.
   - Removed `Math.max(0, ...)` to support negative credit limits cleanly.
   - Wrote and executed a database audit script (`audit_balances.js`) that inspected all customer records, recalculated their true balances based on their active (non-voided) invoice histories, and automatically repaired 6 affected customer accounts (including Miss. Saumya Jayakodi and Mr. Dilhara Dasanayake) back to perfect alignment.

---

## 3. Verification

### Build Success
```bash
npm run build
```
Result: **Compiled successfully** in 2.6s. All pages (including `/portal`) generated.
