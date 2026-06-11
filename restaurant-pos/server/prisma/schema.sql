-- ============================================================
-- Restaurant POS Database Schema (PostgreSQL 16)
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "moddatetime";

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE user_role AS ENUM ('admin', 'manager', 'cashier', 'waiter', 'kitchen_staff');
CREATE TYPE table_status AS ENUM ('available', 'occupied', 'order_placed', 'bill_requested');
CREATE TYPE order_status AS ENUM ('draft', 'pending', 'cooking', 'ready', 'served', 'billed', 'paid', 'cancelled');
CREATE TYPE order_type AS ENUM ('dine_in', 'takeaway', 'delivery');
CREATE TYPE order_item_status AS ENUM ('pending', 'cooking', 'ready', 'served', 'cancelled');
CREATE TYPE payment_method AS ENUM ('cash', 'card', 'mobile', 'qr_code');
CREATE TYPE payment_status AS ENUM ('pending', 'completed', 'refunded', 'failed');
CREATE TYPE split_method AS ENUM ('equal', 'by_seat', 'by_item');
CREATE TYPE discount_type AS ENUM ('percentage', 'fixed_amount');
CREATE TYPE modifier_type AS ENUM ('single_select', 'multi_select', 'text_input');

-- ============================================================
-- TABLES
-- ============================================================

-- USERS
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id   UUID NOT NULL,
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    phone           VARCHAR(20),
    pin_code        VARCHAR(6),
    role            user_role NOT NULL DEFAULT 'waiter',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    last_login_at   TIMESTAMPTZ,
    refresh_token   VARCHAR(512),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_restaurant ON users(restaurant_id);

-- TABLE LAYOUT / FLOOR PLAN
CREATE TABLE floor_sections (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id   UUID NOT NULL,
    name            VARCHAR(100) NOT NULL, -- e.g., "Main Hall", "Terrace", "Private Room"
    display_order   INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tables (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id   UUID NOT NULL,
    section_id      UUID REFERENCES floor_sections(id),
    table_number    VARCHAR(20) NOT NULL, -- e.g., "A1", "B12"
    capacity        INT NOT NULL DEFAULT 4,
    status          table_status NOT NULL DEFAULT 'available',
    current_order_id UUID,
    merged_into_table_id UUID REFERENCES tables(id), -- self-referencing for table merging
    pos_x           FLOAT NOT NULL DEFAULT 0,  -- x-coordinate on floor plan
    pos_y           FLOAT NOT NULL DEFAULT 0,  -- y-coordinate on floor plan
    shape           VARCHAR(20) NOT NULL DEFAULT 'rectangle', -- rectangle, circle
    width           INT NOT NULL DEFAULT 120,
    height          INT NOT NULL DEFAULT 80,
    version         INT NOT NULL DEFAULT 1, -- optimistic concurrency control
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tables_section ON tables(section_id);
CREATE INDEX idx_tables_status ON tables(status);
CREATE INDEX idx_tables_number ON tables(restaurant_id, table_number);
CREATE UNIQUE INDEX idx_tables_unique_number ON tables(restaurant_id, table_number) WHERE merged_into_table_id IS NULL;

-- MENU CATEGORIES
CREATE TABLE categories (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id   UUID NOT NULL,
    name            VARCHAR(100) NOT NULL, -- e.g., "Appetizers", "Main Course", "Drinks"
    slug            VARCHAR(100) NOT NULL,
    description     TEXT,
    image_url       TEXT,
    display_order   INT NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    parent_id       UUID REFERENCES categories(id), -- sub-categories
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_categories_restaurant ON categories(restaurant_id, display_order);
CREATE UNIQUE INDEX idx_categories_slug ON categories(restaurant_id, slug);

-- MENU ITEMS
CREATE TABLE menu_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id   UUID NOT NULL,
    category_id     UUID NOT NULL REFERENCES categories(id),
    name            VARCHAR(200) NOT NULL,
    description     TEXT,
    image_url       TEXT,
    base_price      DECIMAL(12,2) NOT NULL,
    tax_category    VARCHAR(50) NOT NULL DEFAULT 'standard', -- standard, reduced, exempt
    prep_time_mins  INT,
    is_available    BOOLEAN NOT NULL DEFAULT true,
    is_featured     BOOLEAN NOT NULL DEFAULT false,
    display_order   INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_menu_items_category ON menu_items(category_id);
CREATE INDEX idx_menu_items_available ON menu_items(restaurant_id, is_available);
CREATE INDEX idx_menu_items_featured ON menu_items(restaurant_id, is_featured) WHERE is_featured = true;

-- ITEM VARIATIONS (e.g., Small, Medium, Large)
CREATE TABLE item_variations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    menu_item_id    UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL, -- e.g., "Small", "Medium", "Large"
    price_adjustment DECIMAL(12,2) NOT NULL DEFAULT 0.00, -- delta from base price
    display_order   INT NOT NULL DEFAULT 0,
    is_default      BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_item_variations_item ON item_variations(menu_item_id);

-- MODIFIERS / ADD-ONS
CREATE TABLE modifiers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id   UUID NOT NULL,
    name            VARCHAR(200) NOT NULL, -- e.g., "Extra Cheese", "No Onions"
    modifier_type   modifier_type NOT NULL DEFAULT 'single_select',
    is_required     BOOLEAN NOT NULL DEFAULT false,
    max_selections  INT NOT NULL DEFAULT 1,
    display_order   INT NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- MODIFIER OPTIONS (individual choices within a modifier group)
CREATE TABLE modifier_options (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    modifier_id     UUID NOT NULL REFERENCES modifiers(id) ON DELETE CASCADE,
    name            VARCHAR(200) NOT NULL, -- e.g., "Extra Cheese", "No Cheese"
    price_adjustment DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    display_order   INT NOT NULL DEFAULT 0,
    is_default      BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_modifier_options_modifier ON modifier_options(modifier_id);

-- PIVOT: Menu Items <-> Modifiers (which modifiers apply to which items)
CREATE TABLE menu_item_modifiers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    menu_item_id    UUID NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
    modifier_id     UUID NOT NULL REFERENCES modifiers(id) ON DELETE CASCADE,
    display_order   INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(menu_item_id, modifier_id)
);

CREATE INDEX idx_mim_menu_item ON menu_item_modifiers(menu_item_id);
CREATE INDEX idx_mim_modifier ON menu_item_modifiers(modifier_id);

-- ORDERS
CREATE TABLE orders (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id   UUID NOT NULL,
    order_number    SERIAL NOT NULL,
    table_id        UUID REFERENCES tables(id),
    waiter_id       UUID NOT NULL REFERENCES users(id),
    cashier_id      UUID REFERENCES users(id),
    order_type      order_type NOT NULL DEFAULT 'dine_in',
    status          order_status NOT NULL DEFAULT 'draft',
    seat_count      INT,
    customer_name   VARCHAR(200),
    customer_phone  VARCHAR(20),
    delivery_address TEXT,
    notes           TEXT,
    subtotal        DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    discount_total  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    tax_total       DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    service_charge  DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    grand_total     DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    version         INT NOT NULL DEFAULT 1, -- optimistic concurrency
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_table ON orders(table_id);
CREATE INDEX idx_orders_waiter ON orders(waiter_id);
CREATE INDEX idx_orders_status ON orders(restaurant_id, status);
CREATE INDEX idx_orders_status_created ON orders(restaurant_id, status, created_at);
CREATE INDEX idx_orders_type ON orders(order_type);
CREATE INDEX idx_orders_cashier ON orders(cashier_id);

-- ORDER ITEMS
CREATE TABLE order_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id    UUID NOT NULL REFERENCES menu_items(id),
    variation_id    UUID REFERENCES item_variations(id),
    seat_number     INT,
    quantity        INT NOT NULL DEFAULT 1,
    unit_price      DECIMAL(12,2) NOT NULL, -- snapshot at order time
    total_price     DECIMAL(12,2) NOT NULL, -- unit_price * quantity + modifier adjustments
    status          order_item_status NOT NULL DEFAULT 'pending',
    notes           TEXT,
    modifier_snapshot JSONB NOT NULL DEFAULT '[]', -- frozen modifier choices
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_status ON order_items(status);
CREATE INDEX idx_order_items_item ON order_items(menu_item_id);

-- ORDER ITEM MODIFIERS (selected modifiers for each order item)
CREATE TABLE order_item_modifiers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_item_id   UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    modifier_id     UUID NOT NULL REFERENCES modifiers(id),
    modifier_option_id UUID NOT NULL REFERENCES modifier_options(id),
    price_adjustment DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_oim_order_item ON order_item_modifiers(order_item_id);

-- TAX CONFIGURATIONS
CREATE TABLE tax_configurations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id   UUID NOT NULL,
    name            VARCHAR(100) NOT NULL, -- e.g., "VAT", "Service Charge"
    rate            DECIMAL(5,4) NOT NULL, -- e.g., 0.0700 = 7%
    applies_to      VARCHAR(50) NOT NULL DEFAULT 'all', -- all, dine_in, takeaway, delivery
    is_compound     BOOLEAN NOT NULL DEFAULT false, -- compound tax (tax on tax)
    applies_after_discount BOOLEAN NOT NULL DEFAULT true,
    display_order   INT NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tax_config_restaurant ON tax_configurations(restaurant_id, is_active);

-- DISCOUNTS
CREATE TABLE discounts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    restaurant_id   UUID NOT NULL,
    name            VARCHAR(200) NOT NULL,
    discount_type   discount_type NOT NULL,
    value           DECIMAL(12,2) NOT NULL, -- percentage (0-100) or fixed amount
    min_order_value DECIMAL(12,2) DEFAULT 0.00,
    max_discount    DECIMAL(12,2),
    starts_at       TIMESTAMPTZ,
    ends_at         TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PAYMENTS
CREATE TABLE payments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id        UUID NOT NULL REFERENCES orders(id),
    payment_method  payment_method NOT NULL,
    amount          DECIMAL(12,2) NOT NULL,
    status          payment_status NOT NULL DEFAULT 'pending',
    transaction_id  VARCHAR(255),
    reference_code  VARCHAR(255),
    paid_at         TIMESTAMPTZ,
    refunded_at     TIMESTAMPTZ,
    refund_amount   DECIMAL(12,2),
    created_by      UUID NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_order ON payments(order_id);
CREATE INDEX idx_payments_status ON payments(status);

-- SPLIT BILLS
CREATE TABLE split_bills (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id        UUID NOT NULL REFERENCES orders(id),
    split_method    split_method NOT NULL,
    number_of_splits INT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_split_bills_order ON split_bills(order_id);

-- SPLIT BILL DETAILS (individual shares)
CREATE TABLE split_bill_details (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    split_bill_id   UUID NOT NULL REFERENCES split_bills(id) ON DELETE CASCADE,
    seat_number     INT,
    label           VARCHAR(100), -- e.g., "Guest 1", "Seat 1"
    amount          DECIMAL(12,2) NOT NULL,
    payment_id      UUID REFERENCES payments(id),
    item_ids        UUID[] DEFAULT '{}', -- array of order_item IDs (for by-item splits)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_split_bill_details_split ON split_bill_details(split_bill_id);

-- ORDER STATUS AUDIT LOG
CREATE TABLE order_status_log (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    previous_status order_status,
    new_status      order_status NOT NULL,
    changed_by      UUID NOT NULL REFERENCES users(id),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_status_log_order ON order_status_log(order_id);

-- KITCHEN DISPLAY TICKETS (KDS queue)
CREATE TABLE kitchen_tickets (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    order_item_id   UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    station         VARCHAR(100) NOT NULL DEFAULT 'main', -- main, grill, fry, bar
    priority        INT NOT NULL DEFAULT 0, -- higher = more urgent
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kitchen_tickets_station ON kitchen_tickets(station, priority DESC, created_at);
CREATE INDEX idx_kitchen_tickets_order ON kitchen_tickets(order_id);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto-update updated_at column
CREATE TRIGGER mdt_users BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);
CREATE TRIGGER mdt_tables BEFORE UPDATE ON tables
    FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);
CREATE TRIGGER mdt_orders BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);
CREATE TRIGGER mdt_order_items BEFORE UPDATE ON order_items
    FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);
CREATE TRIGGER mdt_payments BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE PROCEDURE moddatetime(updated_at);

-- Log order status changes
CREATE OR REPLACE FUNCTION log_order_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO order_status_log (order_id, previous_status, new_status, changed_by, notes)
        VALUES (NEW.id, OLD.status, NEW.status, NEW.waiter_id, 'Status updated');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_order_status_change
    AFTER UPDATE OF status ON orders
    FOR EACH ROW EXECUTE PROCEDURE log_order_status_change();

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Calculate order totals
CREATE OR REPLACE FUNCTION calculate_order_totals(order_id UUID)
RETURNS TABLE(
    subtotal DECIMAL(12,2),
    modifier_total DECIMAL(12,2),
    discount_total DECIMAL(12,2),
    tax_total DECIMAL(12,2),
    grand_total DECIMAL(12,2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(oi.total_price), 0)::DECIMAL(12,2) as subtotal,
        COALESCE(SUM(
            (SELECT COALESCE(SUM(oim.price_adjustment), 0)
             FROM order_item_modifiers oim
             WHERE oim.order_item_id = oi.id)
        ), 0)::DECIMAL(12,2) as modifier_total,
        COALESCE(SUM(
            (SELECT COALESCE(SUM(oi2.total_price) * (d.value / 100), 0)
             FROM discounts d
             WHERE d.is_active = true AND d.restaurant_id = o.restaurant_id
             AND o.subtotal >= d.min_order_value
             LIMIT 1)
        ), 0)::DECIMAL(12,2) as discount_total,
        COALESCE(SUM(
            oi.total_price * COALESCE(
                (SELECT tc.rate FROM tax_configurations tc
                 WHERE tc.restaurant_id = o.restaurant_id AND tc.is_active = true
                 AND tc.applies_to IN ('all', o.order_type::text)
                 ORDER BY tc.display_order
                 LIMIT 1),
                0)
        ), 0)::DECIMAL(12,2) as tax_total,
        (
            COALESCE(SUM(oi.total_price), 0) +
            COALESCE(SUM(oi.total_price * COALESCE(
                (SELECT tc.rate FROM tax_configurations tc
                 WHERE tc.restaurant_id = o.restaurant_id AND tc.is_active = true
                 AND tc.applies_to IN ('all', o.order_type::text)
                 ORDER BY tc.display_order
                 LIMIT 1),
                0)), 0)
        )::DECIMAL(12,2) as grand_total
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE o.id = calculate_order_totals.order_id
    GROUP BY o.id;
END;
$$ LANGUAGE plpgsql;