# Sirigirvel Mobile App - UI Documentation

## 1. Objective

Convert the existing web admin panel into a mobile-first app for workshop operators with:
- Fast daily operations
- One-hand usage on phones
- Clear status-driven workflows
- Offline-tolerant interaction patterns (where possible)

## 2. Recommended Mobile IA (Information Architecture)

### 2.1 Primary Navigation (Bottom Tabs)

1. Home
2. Vehicles
3. Billing
4. Inventory
5. More

Bottom tab icons (recommended `Ionicons` names):
- Home: `home-outline` (active: `home`)
- Vehicles: `car-sport-outline` (active: `car-sport`)
- Billing: `receipt-outline` (active: `receipt`)
- Inventory: `cube-outline` (active: `cube`)
- More: `menu-outline` (active: `menu`)

### 2.2 "More" Stack

- Enquiries
- Orders
- Quotations
- Day Book
- Day Book History
- Accounts
- Logs
- Profile
- Manual

More stack icon names (recommended `Ionicons`):
- Enquiries: `chatbubble-ellipses-outline`
- Orders: `bag-handle-outline`
- Quotations: `document-text-outline`
- Day Book: `book-outline`
- Day Book History: `time-outline`
- Accounts: `wallet-outline`
- Logs: `list-outline`
- Profile: `person-circle-outline`
- Manual: `help-circle-outline`

## 3. Route Mapping (Web -> Mobile Screen)

- `/dashboard` -> `HomeScreen`
- `/vehicles` -> `VehiclesListScreen`
- `/vehicles/add-new` -> `VehicleCreateScreen`
- `/vehicles/{id}` -> `VehicleDetailScreen`
- `/enquiries` -> `EnquiryListScreen`
- `/enquiries/add-new` -> `EnquiryCreateScreen`
- `/enquiries/{id}` -> `EnquiryDetailScreen`
- `/inventory` -> `InventoryListScreen`
- `/inventory/add-new` -> `InventoryCreateScreen`
- `/inventory/{id}` -> `InventoryDetailScreen`
- `/orders` -> `OrderListScreen`
- `/orders/add-new` -> `OrderCreateScreen`
- `/orders/{id}` -> `OrderDetailScreen`
- `/billing` -> `InvoiceListScreen`
- `/billing/{invoiceNumber}` -> `InvoiceCreateScreen`
- `/billing/view/{invoiceId}` -> `InvoiceDetailScreen`
- `/quotations` -> `QuotationListScreen`
- `/quotations/{quotationNumber}` -> `QuotationCreateScreen`
- `/quotations/edit/{id}` -> `QuotationEditScreen`
- `/quotations/view/{id}` -> `QuotationDetailScreen`
- `/daybook` -> `DayBookEntryScreen`
- `/daybook/history` -> `DayBookHistoryScreen`
- `/accounts` -> `AccountsScreen`
- `/logs` -> `LogsScreen`
- `/profile` -> `ProfileScreen`
- `/manual` -> `ManualScreen`

## 4. Global Mobile UI Rules

1. Use sticky top app bar with page title + context actions.
2. Use bottom sheets for quick edit/create interactions.
3. Use full-screen forms for multi-step data entry.
4. Keep primary CTA fixed near thumb zone (bottom area).
5. Prefer segmented controls and chips over dense dropdown-heavy desktop patterns.
6. Replace large tables with card lists + expandable details.

## 5. Screen Specs by Module

## 5.1 Home

- KPI cards: petty cash, bank, credit due
- Quick actions: vehicle, enquiry, invoice, quotation, search, day book
- What's new entry point
- Use vertical scrolling cards; no multi-column desktop grids

## 5.2 Vehicles

- List: search + status chips + recent activity
- Add/Edit form:
  - Owner info
  - Vehicle details
  - Odometer + notes
  - Image upload (camera/gallery)
- Detail:
  - Vehicle profile summary
  - Linked invoices and quotations

## 5.3 Enquiries

- List with status chips (`open`, `closed`)
- Card item fields: name, phone, vehicle, pickup date, status
- Quick status update via bottom sheet
- Create/edit form optimized for numeric keyboard and phone autofill

## 5.4 Inventory

- List with search, category filters, low-stock highlight
- Item card: part name, stock, sell price, threshold
- Detail:
  - Editable pricing
  - Stock adjustments
  - Due/purchase details
- Barcode display full-screen action for scanning/printing workflows

## 5.5 Orders

- List with `pending/completed` segmented filter
- Order detail cards:
  - Supplier block
  - Assigned vehicle
  - Parts rows
  - Bill image preview
- Completion action with confirmation dialog

## 5.6 Billing (Invoices)

- Invoice list with search + status chips
- Invoice create:
  - Vehicle selector
  - Parts + labour rows
  - Payment mode toggle
  - Live total summary card (sticky)
- Barcode scanner:
  - Explicit camera permission request
  - If denied/unavailable -> open manual part search directly
- Detail screen:
  - Readable invoice summary
  - Download/share PDF actions

## 5.7 Quotations

- Similar UX to invoices for consistency
- Date range controls (start/end)
- Create/edit/view flows with same spare/labour interaction model

## 5.8 Day Book + History

- Entry screen:
  - `debit/credit` segmented toggle
  - `cash/eft` segmented toggle
  - Amount-first flow
- History screen:
  - Filter chips + date range
  - Transaction cards
  - Edit/delete actions in contextual menu

## 5.9 Accounts

- Balance summary cards
- Monthly trend block
- Credit due list with settle action
- Transaction feed with compact filter chips

## 5.10 Logs

- Activity timeline list
- Type tabs as horizontal chips
- Search box with debounced filtering

## 5.11 Profile & Access

- Profile summary
- Managed user cards
- Create account form
- Module access toggles in grouped sections

## 6. Shared Components (Mobile Design System)

1. AppHeader
2. BottomTabBar
3. SearchField
4. FilterChipRow
5. StatCard
6. EntityCard (vehicle/enquiry/order/common)
7. EmptyState
8. ErrorState + Retry
9. PrimaryButton / SecondaryButton / DangerButton
10. ScannerModal
11. ConfirmSheet
12. FormSection + FieldRow

## 7. Visual Tokens (Suggested)

- Corner radius:
  - Cards: 14
  - Inputs/buttons: 12
  - Bottom sheets: 20 (top corners)
- Spacing scale: 4, 8, 12, 16, 20, 24
- Font sizes:
  - Title: 22
  - Section: 18
  - Body: 14/16
  - Caption: 12
- Touch target minimum: 44x44

## 8. Color Theme and Icon System

### 8.1 Brand Theme (Light) - Default

- `primary`: `#0B6E4F` (brand green)
- `primary-600`: `#095D43`
- `accent`: `#F4A300` (highlight amber)
- `background`: `#F7FAF8`
- `surface`: `#FFFFFF`
- `surface-alt`: `#EEF3F0`
- `text-primary`: `#101828`
- `text-secondary`: `#475467`
- `border`: `#D0D5DD`
- `success`: `#16A34A`
- `warning`: `#D97706`
- `error`: `#DC2626`
- `info`: `#0284C7`

### 8.2 Night Theme (Dark)

- `primary`: `#34D399`
- `primary-600`: `#10B981`
- `accent`: `#FBBF24`
- `background`: `#0B1210`
- `surface`: `#111A17`
- `surface-alt`: `#1A2622`
- `text-primary`: `#F5F7FA`
- `text-secondary`: `#B8C2CC`
- `border`: `#2A3A35`
- `success`: `#22C55E`
- `warning`: `#F59E0B`
- `error`: `#F87171`
- `info`: `#38BDF8`

### 8.3 Semantic Color Usage

1. `open/pending`: warning color
2. `closed/completed/paid`: success color
3. `overdue/credit due urgent`: error color
4. `neutral/info`: info color
5. Primary CTA buttons: `primary`
6. Destructive actions (delete/cancel order): `error`

### 8.4 Icon Rules

1. Use one icon library across the app (`Ionicons` recommended).
2. Tab icons: 24px.
3. List/action icons: 20px.
4. Icon color:
   - active/tab selected -> `primary`
   - inactive -> `text-secondary`
   - destructive action icon -> `error`
5. Do not mix filled + outline randomly. Use:
   - outline in inactive state
   - filled in active/selected state

## 9. Mobile Interaction and Permission Patterns

1. Camera permission (barcode/image capture):
   - Ask only on user action
   - Show fallback manual entry immediately if denied
2. File/photo uploads:
   - Offer `Take Photo` and `Choose from Gallery`
3. Network issues:
   - Show inline retry states instead of silent failures
4. Long forms:
   - Auto-save drafts where practical
   - Preserve unsaved fields on navigation back

## 10. QA Checklist for UI Completion

1. Works on small phones (360px width) and large phones
2. All primary flows reachable within 2 taps from a root tab
3. No horizontal scrolling in data lists
4. Form fields remain visible above keyboard
5. Scanner fallback works when camera permission is denied
6. PDF actions work from invoice/quotation detail screens
7. Role/module access rules are reflected in navigation visibility
