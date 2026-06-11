# 🍽️ Restaurant POS — Production-Ready Point of Sale System

A full-featured restaurant POS application supporting **Dine-in**, **Takeaway**, and **Delivery** services, built with a clean architecture and real-time capabilities.

---

## 📐 Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                     Client Apps                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │  Waiter  │  │ Cashier  │  │ Kitchen  │  │  Admin  │ │
│  │ (Tablet) │  │(Desktop) │  │ (Screen) │  │(Desktop)│ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬────┘ │
│       │              │              │              │      │
│       └──────────────┴──────────────┴──────────────┘      │
│                      │  HTTP + WebSocket                  │
└──────────────────────┼───────────────────────────────────┘
                       │
┌──────────────────────┼───────────────────────────────────┐
│                  Express API Server                        │
│  ┌───────────────────┴─────────────────────────────┐     │
│  │  JWT Auth  │  RBAC Middleware  │  Socket.io     │     │
│  └───────────────────┬─────────────────────────────┘     │
│  ┌───────────────────┴─────────────────────────────┐     │
│  │        Order Service (Transactional)             │     │
│  │  • SELECT ... FOR UPDATE (row-level locks)       │     │
│  │  • Optimistic concurrency (version column)       │     │
│  │  • Idempotency keys (double-submit prevention)   │     │
│  └───────────────────┬─────────────────────────────┘     │
└──────────────────────┼───────────────────────────────────┘
                       │
┌──────────────────────┼───────────────────────────────────┐
│              PostgreSQL 16 Database                       │
│  • 20+ tables with proper indexes & FK constraints       │
│  • JSONB for flexible modifier snapshots                  │
│  • Row-level security capable                            │
│  • Audit logging via triggers                             │
└───────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** 20+
- **PostgreSQL** 16
- **pnpm** (recommended) or npm

### Setup

```bash
# 1. Clone & install dependencies
cd restaurant-pos
pnpm install

# 2. Create PostgreSQL database
createdb restaurant_pos
psql restaurant_pos < server/prisma/schema.sql

# 3. Start the backend
cd server
pnpm dev

# 4. Start the frontend (Waiter app example)
cd apps/waiter
pnpm dev
```

The API runs on **http://localhost:4000** and WebSocket is available at the same port.

---

## 📂 Project Structure

```
restaurant-pos/
├── apps/
│   ├── waiter/          # Next.js — Waiter tablet app
│   ├── cashier/         # Next.js — Cashier dashboard
│   ├── kitchen/         # Next.js — Kitchen Display System
│   └── admin/           # Next.js — Admin/reports panel
├── packages/
│   ├── shared-types/    # TypeScript interfaces & enums
│   └── ui/              # Shared React components & hooks
│       ├── components/
│       │   ├── TableGrid.tsx       # Interactive floor plan
│       │   ├── CartSidebar.tsx     # Cart, checkout, split bill
│       │   └── KitchenDisplay.tsx  # KDS ticket board
│       └── hooks/
│           └── useSocket.ts        # Socket.io React hook
├── server/
│   ├── src/
│   │   ├── index.ts                # Express + Socket.io entry
│   │   ├── middleware/auth.ts      # JWT auth + RBAC
│   │   ├── controllers/
│   │   │   └── order.controller.ts # Order REST endpoints
│   │   ├── services/
│   │   │   └── order.service.ts    # Transactional business logic
│   │   └── socket/
│   │       └── index.ts            # Socket.io event handlers
│   └── prisma/
│       └── schema.sql              # Full PostgreSQL DDL
└── docker-compose.yml
```

---

## 🔑 Core Features Implemented

### 1. Table Management & Floor Plan
- Visual table grid with real-time status colors (Available/Occupied/Order Placed/Bill Requested)
- Section tabs (Main Hall, Terrace, Private Room)
- Right-click context menu with New Order, Merge, Transfer, Bill actions
- Table merge mode with visual indicator
- Seat capacity display
- **File:** `packages/ui/components/TableGrid.tsx`

### 2. Dynamic Menu & Modifier System
- Multi-level categories with sub-categories
- Item variations (Small/Medium/Large) with price adjustments
- Modifier groups (single-select, multi-select, text input)
- Modifier price adjustments (+$1.50 for Extra Cheese)
- Price snapshots frozen at order time (no retroactive price changes)
- **Schema:** `server/prisma/schema.sql` — tables: `categories`, `menu_items`, `item_variations`, `modifiers`, `menu_item_modifiers`

### 3. Real-time Kitchen Order Ticket (KOT/KDS)
- Instant WebSocket push from waiter → kitchen on order placement
- Kitchen station routing (Main, Grill, Fry, Bar)
- Status progression: Pending → Cooking → Ready → Served
- Optional notification sound on new orders
- Elapsed time tracking per ticket
- Station-filtered views with badge counts
- **Files:** `server/src/socket/index.ts`, `packages/ui/components/KitchenDisplay.tsx`

### 4. Billing, Splitting, and Payments
- Flexible checkout supporting Cash, Card, Mobile, QR Code
- Split bill by Equal / By Seat / By Item
- Discount application (percentage or fixed amount) with RBAC gating
- Tax auto-calculation (VAT per order type)
- Multi-payment support for split bills
- **Files:** `packages/ui/components/CartSidebar.tsx`, `server/src/services/order.service.ts` (processPayment)

### 5. Role-Based Access Control (RBAC)
- 5 roles: Admin, Manager, Cashier, Waiter, Kitchen Staff
- Granular permissions: `orders:create`, `payments:process`, `discounts:apply`, `bills:split`, etc.
- JWT access tokens (15min) + refresh tokens (7d) with rotation
- Role-specific Socket.io room routing
- **File:** `server/src/middleware/auth.ts` with `ROLE_PERMISSIONS` map

---

## 🛡️ Race Condition Prevention Strategy

| Layer | Technique |
|---|---|
| **Database** | `SELECT ... FOR UPDATE` on `tables` and `orders` during mutations; `SERIALIZABLE` isolation for order creation |
| **Application** | Optimistic locking via `version` column; idempotency keys to prevent double-submits |
| **Transaction** | All order mutations wrapped in `BEGIN/COMMIT/ROLLBACK` with explicit error handling |

---

## 🔌 API Endpoints

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/api/orders` | Waiter/Cashier | Create order (transactional) |
| GET | `/api/orders/:id` | All | Get order details |
| PATCH | `/api/orders/:orderId/items/:itemId/status` | Kitchen | Update item status |
| POST | `/api/orders/:id/bill` | Waiter | Request bill |
| POST | `/api/orders/:id/pay` | Cashier | Process payment (single or split) |
| POST | `/api/orders/:id/discount` | Cashier/Manager | Apply discount |
| POST | `/api/tables/merge` | Waiter/Manager | Merge two tables |
| POST | `/api/tables/transfer` | Waiter/Manager | Transfer order to another table |
| POST | `/api/auth/login` | Public | Login |
| POST | `/api/auth/refresh` | Public | Refresh token |
| GET | `/api/health` | Public | Health check |

---

## 🔐 Authentication Flow

1. Client sends `POST /api/auth/login` with email + password
2. Server validates, returns `{ accessToken, refreshToken, user }`
3. Access token (JWT, 15min) sent as `Authorization: Bearer <token>`
4. On expiry, client calls `POST /api/auth/refresh` with refresh token
5. Socket.io connections include token in `auth` handshake

---

## 📦 WebSocket Events (Socket.io)

### Client → Server (Emits)
| Event | Payload | Purpose |
|---|---|---|
| `kot:send` | `{ orderId, tableId }` | Waiter sends order to kitchen |
| `item:update_status` | `{ orderId, orderItemId, newStatus }` | Kitchen updates item status |
| `table:update_status` | `{ tableId, status, orderId }` | Update table display |
| `bill:request` | `{ orderId, tableId }` | Waiter requests bill |
| `payment:complete` | `{ orderId, tableId }` | Payment completed |
| `table:merge` | `{ sourceTableId, targetTableId }` | Merge tables |
| `order:transfer` | `{ orderId, fromTableId, toTableId }` | Transfer order |
| `room:join` / `room:leave` | `string` | Join/leave custom rooms |

### Server → Client (Listens)
| Event | Room | Purpose |
|---|---|---|
| `kot:new` | `room:kitchen` | New order ticket for KDS |
| `item:status_change` | `room:waiters` | Item status updated by kitchen |
| `table:status_change` | `restaurant:*` | Table status changed |
| `table:merged` | `restaurant:*` | Tables merged |
| `order:transferred` | `restaurant:*` | Order moved to different table |
| `bill:requested` | `room:cashiers` | Waiter requested bill |
| `payment:completed` | `restaurant:*` | Payment processed |

---

## 🗄️ Database Schema

Full PostgreSQL DDL in `server/prisma/schema.sql` — 20+ tables including:

- **Core**: `users`, `tables`, `floor_sections`
- **Menu**: `categories`, `menu_items`, `item_variations`, `modifiers`, `modifier_options`, `menu_item_modifiers`
- **Orders**: `orders`, `order_items`, `order_item_modifiers`
- **Payments**: `payments`, `split_bills`, `split_bill_details`
- **Config**: `tax_configurations`, `discounts`
- **Audit**: `order_status_log`, `kitchen_tickets`
- **Triggers**: Auto `updated_at`, order status change logging

---

## 🧪 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 14 + React 18 + Tailwind CSS 3 |
| **Backend** | Node.js + Express + TypeScript |
| **Database** | PostgreSQL 16 |
| **Real-time** | Socket.io (WebSocket + polling fallback) |
| **Auth** | JWT (access + refresh) with bcrypt |
| **ORM** | Raw SQL (pg driver) for full transactional control |

---

## 🔄 Scalability Considerations

- **Stateless JWT** — horizontal scaling behind load balancer
- **Socket.io Redis adapter** — multi-instance WebSocket broadcasting
- **Read replicas** — for reporting/admin dashboard queries
- **PgBouncer** — connection pooling for high concurrency
- **Idempotency keys** — safe retry on network failures
- **Version columns** — optimistic concurrency for high-throughput table management

---

## 📄 License

MIT — Built as a reference architecture for production restaurant POS systems.