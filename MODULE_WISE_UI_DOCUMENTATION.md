# Sirigirvel Admin Panel - Module-wise UI Documentation

## 1. Project UI Structure

- Framework: Next.js App Router (`src/app`)
- Primary app shell for authenticated users: `src/app/(dashboard)/layout.tsx`
- Global dashboard UI elements:
  - Sidebar navigation: `src/components/Sidebar.tsx`
  - Top navbar: `src/components/Navbar.tsx`
  - Global price search modal: `src/components/PriceSearch.tsx` (`Cmd/Ctrl + K`)
  - What's New modal: `src/components/WhatsNewPopup.tsx`

## 2. Navigation Map (User-facing Modules)

- Dashboard: `/dashboard`
- Car ID / Vehicles: `/vehicles`
- Enquiries: `/enquiries`
- Spare Parts: `/inventory`
- Spare Orders: `/orders`
- Price Search: modal trigger via sidebar (`/search` item dispatches event)
- Invoices: `/billing`
- Estimate / Quotations: `/quotations`
- Day Book: `/daybook`
- Day Book History: `/daybook/history`
- Accounts: `/accounts`
- Logs: `/logs`
- Profile & Access Control: `/profile`

## 3. Route-wise UI Modules

### 3.1 Authentication & Entry

#### 3.1.1 Login
- Route: `/` (and `/login` redirects to `/`)
- File: `src/app/page.tsx`, `src/app/login/page.tsx`
- UI:
  - Email + password form
  - Error banner
  - Forgot password link
- Behavior:
  - Checks active session
  - Resolves landing page from module access and redirects to first permitted module

#### 3.1.2 Register
- Route: `/register`
- File: `src/app/register/page.tsx`
- UI:
  - Full name, email, password fields
  - Password strength indicator
- Behavior:
  - Supabase sign-up flow

#### 3.1.3 Forgot Password
- Route: `/forgot-password`
- File: `src/app/forgot-password/page.tsx`
- UI:
  - Email input
  - Reset confirmation state
- Behavior:
  - Sends reset email with redirect to `/reset-password`

#### 3.1.4 Reset Password
- Route: `/reset-password`
- File: `src/app/reset-password/page.tsx`
- UI:
  - New password + confirm password
  - Validation and success states
- Behavior:
  - Consumes recovery tokens from URL/hash
  - Updates user password and signs out

### 3.2 Dashboard Overview

- Route: `/dashboard`
- File: `src/app/(dashboard)/dashboard/page.tsx`
- UI:
  - Financial summary cards (petty cash, bank, credit due)
  - Quick actions grid (vehicle, enquiry, invoice, estimate, search, daybook, history, accounts)
  - "What's New" action button
- Behavior:
  - Loads top-level metrics from `spare_parts` and `transactions`
  - Invoice/quotation quick action pre-generates number and routes to creator

### 3.3 Vehicles (Car ID)

- Route: `/vehicles/[[...slug]]`
- File: `src/app/(dashboard)/vehicles/[[...slug]]/page.tsx`
- Modes:
  - List: `/vehicles`
  - Add new: `/vehicles/add-new`
  - Profile/details: `/vehicles/{id}`
- UI:
  - Vehicle registry list + search
  - Vehicle registration form (owner, vehicle details, odometer, notes)
  - Vehicle image upload (front/back/chassis)
  - Vehicle profile view with linked invoices/quotations
- Key components:
  - `VehicleRegistrationForm`
  - `VehicleProfileView`
  - `ConfirmDeleteModal`

### 3.4 Enquiries

- Route: `/enquiries/[[...slug]]`
- File: `src/app/(dashboard)/enquiries/[[...slug]]/page.tsx`
- Modes:
  - List: `/enquiries`
  - Add new: `/enquiries/add-new`
  - View/edit: `/enquiries/{id}`
- UI:
  - Enquiry list with search + status filter
  - Enquiry form (customer, phone, vehicle details, enquiry date, pickup date, status)
  - Quick status change modal
- Behavior:
  - Tracks enquiry status as `open`/`closed`

### 3.5 Inventory - Spare Parts

- Route: `/inventory/[[...slug]]`
- File: `src/app/(dashboard)/inventory/[[...slug]]/page.tsx`
- Modes:
  - List: `/inventory`
  - Add/edit: `/inventory/add-new`, `/inventory/{id}`
- UI:
  - Spare parts grid/table with search + category/stock filters
  - Batch add/edit part form
  - Barcode render/download using `react-barcode` + `jsbarcode`
  - Purchase due popup + bill image upload
- Behavior:
  - Maintains stock, threshold, seller, purchase mode, purchase due tracking

### 3.6 Orders - Spare Orders

- Route: `/orders/[[...slug]]`
- File: `src/app/(dashboard)/orders/[[...slug]]/page.tsx`
- Modes:
  - List: `/orders`
  - Add new: `/orders/add-new`
  - View/edit: `/orders/{id}`
- UI:
  - Order list with status filtering (`pending`/`completed`)
  - Supplier + parts row builder
  - Vehicle assignment (including INHOUSE vehicle)
  - Bill upload and order status

### 3.7 Billing - Invoices

- Route: `/billing/[[...slug]]`
- File: `src/app/(dashboard)/billing/[[...slug]]/page.tsx`
- Modes:
  - List: `/billing`
  - Create/edit by number: `/billing/{invoiceNumber}`
  - View: `/billing/view/{invoiceId}`
- UI:
  - Invoice listing with search + status tabs
  - Full invoice creator
  - Invoice viewer
- Key components:
  - `InvoiceCreator`
  - `InvoiceViewer`
- Notable UX:
  - Mobile-compatible barcode scanner in creator
  - PDF generation, download/share flows

### 3.8 Quotations - Estimates

- Route: `/quotations/[[...slug]]`
- File: `src/app/(dashboard)/quotations/[[...slug]]/page.tsx`
- Modes:
  - List: `/quotations`
  - Create by number: `/quotations/{quotationNumber}`
  - Edit existing: `/quotations/edit/{id}`
  - View: `/quotations/view/{id}`
- UI:
  - Quotation table + search
  - Quotation creator with parts/labour
  - Quotation viewer
- Key components:
  - `QuotationCreator`
  - `QuotationViewer`

### 3.9 Day Book (Entry)

- Route: `/daybook`
- File: `src/app/(dashboard)/daybook/page.tsx`
- UI:
  - New transaction form
  - Type toggle (`debit` / `credit`)
  - Payment mode toggle (`cash` / `eft`)
  - Suggestions/autocomplete from prior entries
- Behavior:
  - Writes to `transactions`
  - Logs activity record

### 3.10 Day Book History

- Route: `/daybook/history`
- File: `src/app/(dashboard)/daybook/history/page.tsx`
- UI:
  - Transaction ledger table
  - Rich filtering (type, mode, category, created-by, date range, amount range, notes)
  - Edit modal and delete confirmation
  - CSV export

### 3.11 Accounts

- Route: `/accounts`
- File: `src/app/(dashboard)/accounts/page.tsx`
- UI:
  - Cash/bank balance summaries
  - Monthly income/expense visual summary
  - Credit due card/list with pending amounts
  - Transaction feed and filters
- Behavior:
  - Computes derived balances from `transactions`
  - Supports credit due payment action

### 3.12 Logs (Audit Trail)

- Route: `/logs`
- File: `src/app/(dashboard)/logs/page.tsx`
- UI:
  - Activity timeline feed
  - Type tabs (vehicle, enquiry, spare part, spare order, transaction, invoice, quotation, account)
  - Search by label/description/user/action
- Data source:
  - `activity_logs`

### 3.13 Profile & Access Control

- Route: `/profile`
- File: `src/app/(dashboard)/profile/page.tsx`
- UI:
  - Current profile view
  - Managed accounts list
  - Create account form (role + module access)
  - Access toggles per module
- Behavior:
  - Role-based account limits
  - Enable/disable account and module-level permission matrix

### 3.14 Manual

- Route: `/manual`
- File: `src/app/manual/page.tsx`
- UI:
  - Renders `ManualPageClient` user manual interface

## 4. Shared UI Components Used Across Modules

- `LoadingSpinner`
- `ConfirmDeleteModal`
- `Navbar`
- `Sidebar`
- `PriceSearch`
- `WhatsNewPopup`
- Domain-specific creators/viewers:
  - `InvoiceCreator`, `InvoiceViewer`
  - `QuotationCreator`, `QuotationViewer`
  - `VehicleRegistrationForm`, `VehicleProfileView`

## 5. Module Access Control (Functional)

- Access is resolved from `profiles.access` object.
- Gated in:
  - `src/app/(dashboard)/layout.tsx` (route-level guard + fallback redirect)
  - `src/components/Sidebar.tsx` (nav visibility)
- Access keys:
  - `dashboard`, `vehicles`, `enquiries`, `inventory`, `billing`, `estimates`, `daybook`, `accounts`, `logs`, `settings`

## 6. Keyboard/Global UI Shortcuts

- `Cmd/Ctrl + K`: open Price Search modal
- `Cmd/Ctrl + B`: new quotation
- `Cmd/Ctrl + M`: new invoice
- `Cmd/Ctrl + E`: new enquiry

## 7. Notes for Future UI Documentation Updates

- If a route is added under `src/app/(dashboard)`, add it here under section 3.
- If a sidebar item is changed, update section 2 navigation map.
- If access keys are modified, update section 5 to match `AccessMap`.
