# Restaurant POS System — Project Specification v1.0

## 1. System Overview & Architecture

### Technology Stack
- **Frontend**: Next.js 14 (App Router), React 18, Tailwind CSS, Socket.io Client
- **Backend**: Express.js + TypeScript, PostgreSQL 16, Socket.io Server
- **Auth**: 4–6 digit PIN-based login stored in `users.pin_code` (VARCHAR(6), plain-text)

### Route Map

| Route | Description | Access |
|-------|-------------|--------|
| `/` | **Waiter Terminal** — Shows PIN Pad if unauthenticated; Waiter ordering UI if authenticated | `waiter`, `admin`, `cashier` |
| `/admin/login` | **Admin PIN Pad** — sends `expectedRole: 'admin'` to the backend | Public |
| `/admin` | **Admin Dashboard** — KPI cards, revenue chart, order history, menu/user CRUD | `admin` only |
| `/kitchen/login` | **Kitchen PIN Pad** — sends `expectedRole: 'kitchen_staff'` to the backend | Public |
| `/kitchen` | **Kitchen Display** — ticket cards grouped by order, status progression buttons | `kitchen_staff` only |

### Auth Provider (`apps/waiter/src/app/AuthProvider.tsx`)

**Login flow**:
1. User enters PIN on a `PinPad` component → calls `login(pin, expectedRole?)`
2. `POST /api/auth/pin-login` with `{ pin, expectedRole? }`
3. Backend finds active user with matching `pin_code`; rejects if `expectedRole` mismatches
4. On success: saves user JSON to `localStorage` under `pos_auth_user`, calls `setUser()`, `router.replace(home)`

**Route guard**:
- Unauthenticated users are redirected to `/` (except `/admin/login` and `/kitchen/login` which remain public)
- Authenticated users on wrong-role pages are redirected to their correct home route
- Authenticated users visiting a login page are redirected to their home

**Lock button (`logout()`) — Path-Based Redirect**:
- Reads `window.location.pathname` **before** clearing state
- Hard-navigates via `window.location.href` to bypass React route guard interference:
  - `/admin/*` → `/admin/login`
  - `/kitchen/*` → `/kitchen/login`
  - default → `/`

---

## 2. Kitchen vs Admin Data Separation

### Backend Endpoint (`server/src/controllers/data.controller.ts`)

A single `GET /api/data/orders` endpoint serves both dashboards by reading an optional query parameter:

| Scenario | Query | SQL WHERE Clause | Limit |
|----------|-------|-------------------|-------|
| **Admin** (default) | `GET /api/data/orders` | `WHERE o.created_at > NOW() - INTERVAL '7 days'` | 200 |
| **Kitchen** | `GET /api/data/orders?filter=active` | `WHERE o.created_at > NOW() - INTERVAL '24 hours' AND o.status IN ('pending', 'cooking', 'ready')` | 50 |

**Critical rule**: The Admin query places NO status filter — all historical statuses (`pending`, `cooking`, `ready`, `served`, `paid`, `cancelled`) are returned so totals and analytics remain correct.

### Frontend State Separation (`apps/waiter/src/app/SocketProvider.tsx`)

The `SocketProvider` fetches the **unfiltered** endpoint (`GET /api/data/orders` without `?filter=active`) once on mount and separates the data into two structures:

- **`recentOrders`** (Admin "Live Orders" + "All Orders" tab): Includes ALL statuses — `served`, `paid`, `cancelled`, etc. No filtering applied.
- **`kitchenTickets`** (Kitchen Display): Freshly constructed from the same response, but filtered in JavaScript:
  ```js
  if (o.status === 'paid' || o.status === 'cancelled' || o.status === 'served') return;
  // Also per-item: if (itemStatus === 'served') return;
  ```
- The kitchen page (`kitchen/page.tsx`) applies an additional guard: `state.kitchenTickets.filter(t => t.status !== 'served')`

---

## 3. Order Status Mutation Lifecycle

### Creating an Order (Waiter)
1. Waiter taps menu items, confirms cart, clicks "Place Order"
2. `emitOrderCreated({ tableNumber, tableId, items, total })` → `POST /api/data/save-order`
3. Order inserted with `status = 'pending'`; all items inserted with `status = 'pending'`
4. Socket.io emits `place_order` to `room:kitchen` and all restaurant tabs

### Kitchen Status Progression
Buttons on each ticket card cycle through: **pending → cooking → ready → served**

| Action | Frontend Handler | API Call |
|--------|-----------------|----------|
| "Start Cooking" | `updateStatus(ticketId, 'pending')` | `PATCH /api/data/order-status { status: 'cooking' }` |
| "Ready" | `updateStatus(ticketId, 'cooking')` | `PATCH /api/data/order-status { status: 'ready' }` |
| "Served" | `updateStatus(ticketId, 'ready')` | `PATCH /api/data/order-status { status: 'served' }` |

### PATCH Handler (`PATCH /api/data/order-status`)
1. Derives deterministic UUID from client `orderId` via `uuid_generate_v5(uuid_ns_dns(), orderId)`
2. Updates the specific `order_item` (identified by ticketId index extraction)
3. **Always** propagates status to the parent `orders` row: `UPDATE orders SET status = $1 WHERE id = $2`
4. Commits the transaction and returns `{ success: true }`

### Real-time Broadcast Sequence
1. `emitTicketStatusUpdate()` performs an **optimistic** local state update (instant UI feedback)
2. `PATCH /api/data/order-status` is called to persist in the database
3. **Only after** the PATCH succeeds (`.then()`), Socket.io emits `update_ticket_status`
4. All browser tabs receive `ticket:status_changed` → kitchen tickets and admin recentOrders update in real time

### Refresh Behavior
Because the kitchen query uses `o.status IN ('pending', 'cooking', 'ready')`, an order promoted to `served` is **permanently excluded at the SQL level** on any subsequent page refresh. Admin queries the unfiltered endpoint and continues to see the complete history.

---

## 4. Database Schema Summary

### Core Tables

**`orders`** — Parent order records
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID (PK) | Generated via `uuid_generate_v4()` |
| `order_number` | SERIAL | Auto-incrementing display number |
| `restaurant_id` | UUID | Hardcoded to `00000000-0000-0000-0000-000000000001` |
| `table_id` | UUID (FK → tables) | Resolved at order time; table row created if needed |
| `waiter_id` | UUID (FK → users) | Hardcoded to system user |
| `status` | ENUM `order_status` | `draft, pending, cooking, ready, served, billed, paid, cancelled` |
| `subtotal`, `tax_total`, `service_charge`, `grand_total` | DECIMAL(12,2) | Financial breakdown |
| `created_at`, `updated_at` | TIMESTAMPTZ | Auto-managed via triggers |

**`order_items`** — Individual line items within an order
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID (PK) | Generated via `uuid_generate_v4()` |
| `order_id` | UUID (FK → orders ON DELETE CASCADE) | Parent order |
| `menu_item_id` | UUID (FK → menu_items) | Resolved by name lookup |
| `quantity` | INT | Default 1 |
| `unit_price`, `total_price` | DECIMAL(12,2) | Snapshot at order time |
| `status` | ENUM `order_item_status` | `pending, cooking, ready, served, cancelled` |
| `created_at` | TIMESTAMPTZ | |

**`tables`** — Restaurant floor plan tables
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID (PK) | |
| `table_number` | VARCHAR(20) | e.g., "A1", "B2", "T1" |
| `status` | ENUM `table_status` | `available, occupied, order_placed, bill_requested` |
| `pos_x`, `pos_y` | FLOAT | Coordinates on floor plan |

**`users`** — Staff accounts
| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID (PK) | |
| `role` | ENUM `user_role` | `admin, manager, cashier, waiter, kitchen_staff` |
| `pin_code` | VARCHAR(6) | Plain-text 4-6 digit PIN for login |
| `is_active` | BOOLEAN | Soft-delete flag |
| `first_name`, `last_name`, `email` | VARCHAR | |

### Key Constraints
- `order_items.order_id` → `orders.id` ON DELETE CASCADE
- `orders.table_id` → `tables.id` (nullable)
- Unique index on `tables(restaurant_id, table_number)` where `merged_into_table_id IS NULL`
- Triggers auto-update `updated_at` on orders, order_items, and other tables

---

## 5. Component & File Reference

| File | Purpose |
|------|---------|
| `apps/waiter/src/app/AuthProvider.tsx` | Central auth context — login, logout, route guard, localStorage |
| `apps/waiter/src/app/SocketProvider.tsx` | Real-time state management — fetches DB on mount, Socket.io listeners, order/ticket emitters |
| `apps/waiter/src/app/page.tsx` | Waiter root — PIN pad when unauthenticated, table grid + cart when logged in |
| `apps/waiter/src/app/admin/page.tsx` | Admin dashboard — KPIs, revenue chart, order tables, menu CRUD, user CRUD |
| `apps/waiter/src/app/kitchen/page.tsx` | Kitchen display — ticket cards grouped by order, status buttons |
| `apps/waiter/src/app/admin/login/page.tsx` | Admin PIN pad (expectedRole: 'admin') |
| `apps/waiter/src/app/kitchen/login/page.tsx` | Kitchen PIN pad (expectedRole: 'kitchen_staff') |
| `apps/waiter/src/app/components/PinPad.tsx` | Reusable dark-themed PIN pad (4-digit auto-submit) |
| `server/src/controllers/data.controller.ts` | REST API — save-order (POST), orders fetch (GET with filter), order-status (PATCH), analytics |
| `server/src/controllers/auth.controller.ts` | PIN login endpoint (POST /api/auth/pin-login) |
| `server/src/controllers/user.controller.ts` | User CRUD (GET, POST, PUT, DELETE) |
| `server/src/socket/index.ts` | Socket.io server — room joins, event broadcasts |
| `server/prisma/schema.sql` | Full PostgreSQL schema (enums, tables, indexes, triggers) |