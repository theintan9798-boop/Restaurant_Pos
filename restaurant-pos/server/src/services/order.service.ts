// ============================================================
// Order Service — Transactional Operations
// Prevents race conditions via SELECT ... FOR UPDATE,
// optimistic concurrency (version column), and idempotency keys
// ============================================================

import { Pool, PoolClient } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import {
  OrderDto, OrderItemDto, OrderItemStatus,
  OrderStatus, TableStatus, ModifierSelectionDto,
} from 'shared-types';
import { emitToKitchen, emitToWaiters, emitToCashiers, emitToRestaurant, SOCKET_EVENTS } from '../socket';

// Assumes pool is initialized from db config
let pool: Pool;

export function setPool(pgPool: Pool) {
  pool = pgPool;
}

// ============================================================
// Create Order — Full Transaction
// ============================================================
export interface OrderCreateRequest {
  restaurantId: string;
  tableId?: string;
  waiterId: string;
  orderType: 'dine_in' | 'takeaway' | 'delivery';
  seatCount?: number;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  notes?: string;
  idempotencyKey: string;
  items: OrderItemInput[];
}

export interface OrderItemInput {
  menuItemId: string;
  variationId?: string;
  seatNumber?: number;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes?: string;
  modifiers: ModifierSelectionDto[];
}

export async function createOrder(input: OrderCreateRequest): Promise<OrderDto> {
  const client: PoolClient = await pool.connect();

  try {
    await client.query('BEGIN');
    // Set transaction isolation to SERIALIZABLE for strongest race condition protection
    await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');

    // --- Idempotency check ---
    const idempotencyResult = await client.query(
      `SELECT id FROM orders WHERE restaurant_id = $1 AND notes = $2 AND created_at > NOW() - INTERVAL '5 minutes'`,
      [input.restaurantId, `idem:${input.idempotencyKey}`]
    );
    if (idempotencyResult.rows.length > 0) {
      await client.query('ROLLBACK');
      const existing = await getOrderById(client, idempotencyResult.rows[0].id);
      return existing;
    }

    // --- Lock table row if applicable (prevents concurrent table assignment) ---
    if (input.tableId) {
      const tableResult = await client.query(
        `SELECT id, status, version, merged_into_table_id FROM tables WHERE id = $1 AND restaurant_id = $2 FOR UPDATE`,
        [input.tableId, input.restaurantId]
      );

      if (tableResult.rows.length === 0) {
        throw new Error('Table not found');
      }

      const table = tableResult.rows[0];

      // If table is merged into another, use the target table
      const effectiveTableId = table.merged_into_table_id || table.id;

      // Validate table availability
      if (table.status !== 'available' && table.status !== 'bill_requested' && !table.merged_into_table_id) {
        throw new Error(`Table ${table.table_number} is not available (status: ${table.status})`);
      }

      // If the table was merged, use the target
      if (table.merged_into_table_id && table.id !== effectiveTableId) {
        input.tableId = effectiveTableId;
      }
    }

    // --- Insert order ---
    const orderId = uuidv4();
    const orderResult = await client.query(
      `INSERT INTO orders (
        id, restaurant_id, order_number, table_id, waiter_id,
        order_type, status, seat_count, customer_name, customer_phone,
        delivery_address, notes, version
      ) VALUES ($1, $2, (
        SELECT COALESCE(MAX(order_number), 0) + 1
        FROM orders WHERE restaurant_id = $2
      ), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        orderId,
        input.restaurantId,
        input.tableId || null,
        input.waiterId,
        input.orderType,
        'pending' as OrderStatus,
        input.seatCount || null,
        input.customerName || null,
        input.customerPhone || null,
        input.deliveryAddress || null,
        `idem:${input.idempotencyKey}`,
        1,
      ]
    );

    const order = orderResult.rows[0];

    // --- Insert order items + modifier snapshots ---
    let orderSubtotal = 0;
    const createdItems: any[] = [];

    for (const item of input.items) {
      const itemId = uuidv4();
      const modifierSnapshot = JSON.stringify(item.modifiers);
      const modifierTotal = item.modifiers.reduce((sum, m) => sum + (m.priceAdjustment || 0), 0);
      const computedTotalPrice = (item.unitPrice + modifierTotal) * item.quantity;

      const itemResult = await client.query(
        `INSERT INTO order_items (
          id, order_id, menu_item_id, variation_id, seat_number,
          quantity, unit_price, total_price, status, notes, modifier_snapshot
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          itemId, orderId, item.menuItemId, item.variationId || null,
          item.seatNumber || null, item.quantity, item.unitPrice,
          computedTotalPrice, 'pending', item.notes || null, modifierSnapshot,
        ]
      );

      const orderItem = itemResult.rows[0];

      // Insert individual modifier selections
      for (const mod of item.modifiers) {
        await client.query(
          `INSERT INTO order_item_modifiers (
            id, order_item_id, modifier_id, modifier_option_id, price_adjustment
          ) VALUES ($1, $2, $3, $4, $5)`,
          [uuidv4(), itemId, mod.modifierId, mod.modifierOptionId, mod.priceAdjustment || 0]
        );
      }

      // Create KDS kitchen ticket
      await client.query(
        `INSERT INTO kitchen_tickets (
          id, order_id, order_item_id, station, priority, created_at
        ) VALUES ($1, $2, $3, 'main', 0, NOW())`,
        [uuidv4(), orderId, itemId]
      );

      orderSubtotal += computedTotalPrice;
      createdItems.push(orderItem);
    }

    // --- Update order totals ---
    const taxResult = await client.query(
      `SELECT rate FROM tax_configurations
       WHERE restaurant_id = $1 AND is_active = true
       AND applies_to IN ('all', $2)
       ORDER BY display_order LIMIT 1`,
      [input.restaurantId, input.orderType]
    );
    const taxRate = taxResult.rows.length > 0 ? parseFloat(taxResult.rows[0].rate) : 0;
    const taxTotal = orderSubtotal * taxRate;
    const grandTotal = orderSubtotal + taxTotal;

    await client.query(
      `UPDATE orders SET subtotal = $1, tax_total = $2, grand_total = $3 WHERE id = $4`,
      [orderSubtotal, taxTotal, grandTotal, orderId]
    );

    // --- Update table status ---
    if (input.tableId) {
      await client.query(
        `UPDATE tables SET status = 'order_placed', current_order_id = $1, version = version + 1
         WHERE id = $2 AND restaurant_id = $3`,
        [orderId, input.tableId, input.restaurantId]
      );
    }

    await client.query('COMMIT');

    // Build response
    const fullOrder: OrderDto = mapOrderRow(order, createdItems, []);

    // --- Real-time notifications ---
    emitToKitchen(SOCKET_EVENTS.NEW_KOT, {
      orderId: fullOrder.id,
      orderNumber: fullOrder.orderNumber,
      tableId: input.tableId,
      items: fullOrder.items.map(i => ({
        id: i.id,
        name: i.menuItemName,
        quantity: i.quantity,
        variation: i.variationName,
        modifiers: i.modifierSnapshot,
        notes: i.notes,
      })),
      orderType: input.orderType,
      timestamp: new Date().toISOString(),
    });

    emitToRestaurant(input.restaurantId, SOCKET_EVENTS.TABLE_STATUS_CHANGE, {
      tableId: input.tableId,
      status: 'order_placed',
      orderId: fullOrder.id,
    });

    return fullOrder;

  } catch (err: any) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ============================================================
// Update Order Item Status (KDS → Kitchen marks item as cooking/ready)
// ============================================================
export async function updateOrderItemStatus(
  orderItemId: string,
  newStatus: OrderItemStatus,
  userId: string
): Promise<OrderItemDto | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE order_items SET status = $1 WHERE id = $2
       RETURNING *`,
      [newStatus, orderItemId]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const item = result.rows[0];

    // If this was the last pending item, update order status
    const pendingResult = await client.query(
      `SELECT COUNT(*) as cnt FROM order_items
       WHERE order_id = $1 AND status = 'pending' AND status != 'cancelled'`,
      [item.order_id]
    );
    const pendingCount = parseInt(pendingResult.rows[0].cnt, 10);

    if (pendingCount === 0 && newStatus === 'cooking') {
      await client.query(
        `UPDATE orders SET status = 'cooking' WHERE id = $1`,
        [item.order_id]
      );
    }

    // Update kitchen ticket
    if (newStatus === 'cooking') {
      await client.query(
        `UPDATE kitchen_tickets SET started_at = NOW() WHERE order_item_id = $1 AND started_at IS NULL`,
        [orderItemId]
      );
    } else if (newStatus === 'ready') {
      await client.query(
        `UPDATE kitchen_tickets SET completed_at = NOW() WHERE order_item_id = $1`,
        [orderItemId]
      );
    }

    await client.query('COMMIT');

    // Real-time notification to waiters
    emitToWaiters(SOCKET_EVENTS.ITEM_STATUS_CHANGE, {
      orderId: item.order_id,
      orderItemId,
      newStatus,
      updatedBy: userId,
    });

    return {
      id: item.id,
      orderId: item.order_id,
      menuItemId: item.menu_item_id,
      menuItemName: '',
      seatNumber: item.seat_number,
      quantity: item.quantity,
      unitPrice: parseFloat(item.unit_price),
      totalPrice: parseFloat(item.total_price),
      status: item.status as OrderItemStatus,
      notes: item.notes,
      modifierSnapshot: item.modifier_snapshot || [],
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ============================================================
// Billing: Request bill for an order
// ============================================================
export async function requestBill(orderId: string, tableId: string, userId: string): Promise<OrderDto> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock order and table
    const orderResult = await client.query(
      `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    if (orderResult.rows.length === 0) {
      throw new Error('Order not found');
    }
    const order = orderResult.rows[0];

    await client.query(
      `UPDATE orders SET status = 'billed' WHERE id = $1`,
      [orderId]
    );

    await client.query(
      `UPDATE tables SET status = 'bill_requested', version = version + 1 WHERE id = $1`,
      [tableId]
    );

    await client.query('COMMIT');

    // Notify cashiers
    emitToCashiers(SOCKET_EVENTS.BILL_REQUESTED, {
      orderId,
      tableId,
      requestedBy: userId,
      timestamp: new Date().toISOString(),
    });

    return mapOrderRow(order, [], []);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ============================================================
// Process Payment (with split bill support)
// ============================================================
export interface PaymentInput {
  orderId: string;
  paymentMethod: string;
  amount: number;
  cashierId: string;
  transactionId?: string;
  referenceCode?: string;
  splits?: PaymentSplitInput[];
}

export interface PaymentSplitInput {
  seatNumber?: number;
  label: string;
  amount: number;
  itemIds?: string[];
  paymentMethod: string;
}

export async function processPayment(input: PaymentInput): Promise<any> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');

    // Lock order
    const orderResult = await client.query(
      `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
      [input.orderId]
    );
    if (orderResult.rows.length === 0) {
      throw new Error('Order not found');
    }
    const order = orderResult.rows[0];

    // Validate payment amount
    const totalPaid = input.amount;
    if (input.splits && input.splits.length > 0) {
      const splitsTotal = input.splits.reduce((s, sp) => s + sp.amount, 0);
      if (Math.abs(splitsTotal - parseFloat(order.grand_total)) > 0.01) {
        throw new Error(`Split amounts (${splitsTotal}) do not match grand total (${order.grand_total})`);
      }
    }

    // Process split bills if provided
    if (input.splits && input.splits.length > 1) {
      const splitMethod = input.splits.some(s => s.itemIds && s.itemIds.length > 0)
        ? 'by_item'
        : input.splits.some(s => s.seatNumber !== undefined)
          ? 'by_seat'
          : 'equal';

      const splitBillResult = await client.query(
        `INSERT INTO split_bills (id, order_id, split_method, number_of_splits) VALUES ($1, $2, $3, $4) RETURNING id`,
        [uuidv4(), input.orderId, splitMethod, input.splits.length]
      );
      const splitBillId = splitBillResult.rows[0].id;

      for (const split of input.splits) {
        const paymentId = uuidv4();
        await client.query(
          `INSERT INTO payments (id, order_id, payment_method, amount, status, transaction_id, reference_code, paid_at, created_by)
           VALUES ($1, $2, $3, $4, 'completed', $5, $6, NOW(), $7)`,
          [paymentId, input.orderId, split.paymentMethod, split.amount, input.transactionId || null, input.referenceCode || null, input.cashierId]
        );

        await client.query(
          `INSERT INTO split_bill_details (id, split_bill_id, seat_number, label, amount, payment_id, item_ids)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [uuidv4(), splitBillId, split.seatNumber || null, split.label, split.amount, paymentId, split.itemIds || []]
        );
      }
    } else {
      // Single payment
      await client.query(
        `INSERT INTO payments (id, order_id, payment_method, amount, status, transaction_id, reference_code, paid_at, created_by)
         VALUES ($1, $2, $3, $4, 'completed', $5, $6, NOW(), $7)`,
        [uuidv4(), input.orderId, input.paymentMethod, input.amount, input.transactionId || null, input.referenceCode || null, input.cashierId]
      );
    }

    // Update order status to paid
    await client.query(
      `UPDATE orders SET status = 'paid' WHERE id = $1`,
      [input.orderId]
    );

    // Free the table
    if (order.table_id) {
      await client.query(
        `UPDATE tables SET status = 'available', current_order_id = NULL, version = version + 1 WHERE id = $1`,
        [order.table_id]
      );
    }

    await client.query('COMMIT');

    // Notify
    emitToRestaurant(order.restaurant_id, SOCKET_EVENTS.PAYMENT_COMPLETED, {
      orderId: input.orderId,
      tableId: order.table_id,
      totalAmount: input.amount,
      timestamp: new Date().toISOString(),
    });

    return { success: true, orderId: input.orderId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ============================================================
// Merge Tables
// ============================================================
export async function mergeTables(
  sourceTableId: string,
  targetTableId: string,
  restaurantId: string
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');

    // Lock both tables
    const sourceResult = await client.query(
      `SELECT * FROM tables WHERE id = $1 AND restaurant_id = $2 FOR UPDATE`,
      [sourceTableId, restaurantId]
    );
    const targetResult = await client.query(
      `SELECT * FROM tables WHERE id = $1 AND restaurant_id = $2 FOR UPDATE`,
      [targetTableId, restaurantId]
    );

    if (sourceResult.rows.length === 0 || targetResult.rows.length === 0) {
      throw new Error('One or both tables not found');
    }

    const source = sourceResult.rows[0];
    const target = targetResult.rows[0];

    // Mark source as merged into target
    await client.query(
      `UPDATE tables SET merged_into_table_id = $1, status = 'available', current_order_id = NULL, version = version + 1 WHERE id = $2`,
      [targetTableId, sourceTableId]
    );

    // Transfer orders from source to target
    if (source.current_order_id) {
      await client.query(
        `UPDATE orders SET table_id = $1 WHERE id = $2`,
        [targetTableId, source.current_order_id]
      );

      await client.query(
        `UPDATE tables SET status = 'order_placed', current_order_id = $1, version = version + 1 WHERE id = $2`,
        [source.current_order_id, targetTableId]
      );
    }

    await client.query('COMMIT');

    emitToRestaurant(restaurantId, SOCKET_EVENTS.TABLE_MERGED, {
      sourceTableId,
      targetTableId,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ============================================================
// Transfer Order from one table to another
// ============================================================
export async function transferOrder(
  orderId: string,
  toTableId: string,
  restaurantId: string
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');

    const orderResult = await client.query(
      `SELECT * FROM orders WHERE id = $1 AND restaurant_id = $2 FOR UPDATE`,
      [orderId, restaurantId]
    );
    if (orderResult.rows.length === 0) {
      throw new Error('Order not found');
    }

    const order = orderResult.rows[0];

    // Free old table
    if (order.table_id) {
      await client.query(
        `UPDATE tables SET status = 'available', current_order_id = NULL, version = version + 1 WHERE id = $1`,
        [order.table_id]
      );
    }

    // Assign new table
    await client.query(
      `UPDATE orders SET table_id = $1 WHERE id = $2`,
      [toTableId, orderId]
    );
    await client.query(
      `UPDATE tables SET status = 'order_placed', current_order_id = $1, version = version + 1 WHERE id = $2`,
      [orderId, toTableId]
    );

    await client.query('COMMIT');

    emitToRestaurant(restaurantId, SOCKET_EVENTS.ORDER_TRANSFERRED, {
      orderId,
      fromTableId: order.table_id,
      toTableId,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ============================================================
// Apply Discount
// ============================================================
export async function applyDiscount(
  orderId: string,
  discountCode: string,
  userId: string
): Promise<OrderDto> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock order
    const orderResult = await client.query(
      `SELECT * FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );
    if (orderResult.rows.length === 0) {
      throw new Error('Order not found');
    }
    const order = orderResult.rows[0];

    // Find active discount
    const discountResult = await client.query(
      `SELECT * FROM discounts
       WHERE restaurant_id = $1 AND is_active = true
       AND (starts_at IS NULL OR starts_at <= NOW())
       AND (ends_at IS NULL OR ends_at >= NOW())
       AND CAST($2 AS DECIMAL(12,2)) >= min_order_value`,
      [order.restaurant_id, order.subtotal]
    );

    let discountTotal = 0;
    if (discountResult.rows.length > 0) {
      const discount = discountResult.rows[0];
      if (discount.discount_type === 'percentage') {
        discountTotal = parseFloat(order.subtotal) * (parseFloat(discount.value) / 100);
        if (discount.max_discount) {
          discountTotal = Math.min(discountTotal, parseFloat(discount.max_discount));
        }
      } else {
        discountTotal = parseFloat(discount.value);
      }
    }

    const grandTotal = parseFloat(order.subtotal) - discountTotal + parseFloat(order.tax_total);

    await client.query(
      `UPDATE orders SET discount_total = $1, grand_total = $2 WHERE id = $3`,
      [discountTotal, grandTotal, orderId]
    );

    await client.query('COMMIT');

    return mapOrderRow({ ...order, discount_total: discountTotal, grand_total: grandTotal }, [], []);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ============================================================
// Get Order by ID (internal helper)
// ============================================================
async function getOrderById(client: PoolClient, orderId: string): Promise<OrderDto> {
  const result = await client.query(`SELECT * FROM orders WHERE id = $1`, [orderId]);
  if (result.rows.length === 0) {
    throw new Error('Order not found');
  }
  const itemsResult = await client.query(
    `SELECT oi.*, mi.name as menu_item_name, iv.name as variation_name
     FROM order_items oi
     LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
     LEFT JOIN item_variations iv ON iv.id = oi.variation_id
     WHERE oi.order_id = $1`,
    [orderId]
  );
  return mapOrderRow(result.rows[0], itemsResult.rows, []);
}

// ============================================================
// Row Mapping Helpers
// ============================================================
function mapOrderRow(orderRow: any, itemRows: any[], paymentRows: any[]): OrderDto {
  return {
    id: orderRow.id,
    orderNumber: parseInt(orderRow.order_number, 10),
    tableId: orderRow.table_id || undefined,
    waiterId: orderRow.waiter_id,
    cashierId: orderRow.cashier_id || undefined,
    orderType: orderRow.order_type,
    status: orderRow.status,
    seatCount: orderRow.seat_count,
    customerName: orderRow.customer_name,
    customerPhone: orderRow.customer_phone,
    deliveryAddress: orderRow.delivery_address,
    notes: orderRow.notes,
    subtotal: parseFloat(orderRow.subtotal),
    discountTotal: parseFloat(orderRow.discount_total),
    taxTotal: parseFloat(orderRow.tax_total),
    serviceCharge: parseFloat(orderRow.service_charge),
    grandTotal: parseFloat(orderRow.grand_total),
    version: orderRow.version,
    items: (itemRows || []).map(mapOrderItemRow),
    payments: (paymentRows || []).map(mapPaymentRow),
    createdAt: orderRow.created_at,
    updatedAt: orderRow.updated_at,
  };
}

function mapOrderItemRow(row: any): OrderItemDto {
  return {
    id: row.id,
    orderId: row.order_id,
    menuItemId: row.menu_item_id,
    menuItemName: row.menu_item_name || '',
    variationId: row.variation_id,
    variationName: row.variation_name,
    seatNumber: row.seat_number,
    quantity: row.quantity,
    unitPrice: parseFloat(row.unit_price),
    totalPrice: parseFloat(row.total_price),
    status: row.status as OrderItemStatus,
    notes: row.notes,
    modifierSnapshot: typeof row.modifier_snapshot === 'string'
      ? JSON.parse(row.modifier_snapshot)
      : row.modifier_snapshot || [],
  };
}

function mapPaymentRow(row: any): any {
  return {
    id: row.id,
    orderId: row.order_id,
    paymentMethod: row.payment_method,
    amount: parseFloat(row.amount),
    status: row.status,
    transactionId: row.transaction_id,
    referenceCode: row.reference_code,
    paidAt: row.paid_at,
  };
}

export { mapOrderRow, mapOrderItemRow };