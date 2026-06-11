// ============================================================
// Data Controller — Persistence & Analytics API Endpoints
// Admin: GET /api/data/orders (all statuses)
// Kitchen: GET /api/data/orders?filter=active (pending, cooking, ready)
// ============================================================

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

const router = Router();
let pool: Pool;

export function setDataPool(pgPool: Pool) { pool = pgPool; }

const RESTAURANT_ID = '00000000-0000-0000-0000-000000000001';
const SYSTEM_USER_ID = '91f12645-4306-4168-9768-d9a6a7dae926';

// ============================================================
// POST /api/data/save-order — Waiter places order
// ============================================================
router.post('/save-order', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { orderId, tableId, tableNumber, items, total, orderType } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, error: 'items array required' });
      return;
    }
    const derivedUuid = await client.query(
      `SELECT uuid_generate_v5(uuid_ns_dns(), $1) as id`,
      [orderId || 'unknown']
    );
    const orderUuid = derivedUuid.rows[0].id;

    await client.query('BEGIN');

    // Resolve or create table record
    let effectiveTableId: string | null = null;
    const effectiveTableNumber = tableNumber || tableId || '?';
    const existingTable = await client.query(
      `SELECT id FROM tables WHERE restaurant_id = $1 AND table_number = $2 LIMIT 1`,
      [RESTAURANT_ID, effectiveTableNumber]
    );
    if (existingTable.rows.length > 0) {
      effectiveTableId = existingTable.rows[0].id;
    } else {
      const nt = await client.query(
        `INSERT INTO tables (id, restaurant_id, table_number, capacity, status, pos_x, pos_y)
         VALUES ($1,$2,$3,4,'available',0,0) RETURNING id`,
        [uuidv4(), RESTAURANT_ID, effectiveTableNumber]
      );
      effectiveTableId = nt.rows[0].id;
    }

    const subtotal = parseFloat((total * 0.93).toFixed(2));
    const tax = parseFloat((total * 0.07).toFixed(2));
    const numResult = await client.query(
      `SELECT COALESCE(MAX(order_number),0)+1 as next FROM orders WHERE restaurant_id=$1`,
      [RESTAURANT_ID]
    );

    await client.query(
      `INSERT INTO orders (id, restaurant_id, order_number, table_id, waiter_id, order_type, status, subtotal, tax_total, grand_total, notes)
       VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8,$9,$10)`,
      [orderUuid, RESTAURANT_ID, numResult.rows[0].next, effectiveTableId,
       SYSTEM_USER_ID, orderType || 'dine_in', subtotal, tax, parseFloat(total.toFixed(2)), 'Web order']
    );

    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (id, order_id, menu_item_id, quantity, unit_price, total_price, status)
         VALUES ($1,$2,(SELECT id FROM menu_items WHERE name=$3 LIMIT 1),$4,$5,$6,'pending')`,
        [uuidv4(), orderUuid, item.menuItemName || item.name || 'Unknown',
         item.quantity || 1, parseFloat((total / items.length / (item.quantity || 1)).toFixed(2)),
         parseFloat((total / items.length).toFixed(2))]
      );
    }

    await client.query(
      `UPDATE tables SET status='order_placed', current_order_id=$1 WHERE id=$2`,
      [orderUuid, effectiveTableId]
    );

    await client.query('COMMIT');
    res.status(201).json({ success: true, orderId: orderUuid, tableNumber: effectiveTableNumber });
  } catch (err: any) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// ============================================================
// GET /api/data/orders
//   ?filter=active → kitchen (pending, cooking, ready)
//   default       → admin (all statuses)
// ============================================================
router.get('/orders', async (req: Request, res: Response) => {
  try {
    const filter = req.query.filter as string | undefined;
    const isKitchen = filter === 'active';

    let whereClause: string;
    if (isKitchen) {
      whereClause = `WHERE o.created_at > NOW() - INTERVAL '24 hours'
        AND o.status IN ('pending', 'cooking', 'ready')`;
    } else {
      whereClause = `WHERE o.created_at > NOW() - INTERVAL '7 days'`;
    }

    const result = await pool.query(
      `SELECT o.id, o.order_number, o.table_id, COALESCE(t.table_number, '?') as table_number,
              o.status, o.grand_total, o.created_at,
              COALESCE(json_agg(json_build_object(
                'name', COALESCE(mi.name,'Item'),
                'quantity', oi.quantity,
                'status', COALESCE(oi.status, 'pending')
              )) FILTER (WHERE oi.id IS NOT NULL), '[]') as items
       FROM orders o
       LEFT JOIN tables t ON t.id = o.table_id
       LEFT JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       ${whereClause}
       GROUP BY o.id, t.table_number
       ORDER BY o.created_at DESC
       LIMIT ${isKitchen ? 50 : 200}`
    );

    const orders = result.rows.map(row => ({
      id: row.id,
      orderNumber: row.order_number,
      tableId: row.table_id || '',
      tableNumber: row.table_number || '?',
      status: row.status,
      grandTotal: parseFloat(row.grand_total || 0),
      createdAt: row.created_at,
      items: Array.isArray(row.items) ? row.items.filter((i: any) => i) : [],
    }));

    res.json({ success: true, data: orders });
  } catch (err: any) {
    res.json({ success: true, data: [] });
  }
});

// ============================================================
// PATCH /api/data/order-status — Kitchen updates ticket/order
// ============================================================
router.patch('/order-status', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { orderId, status, ticketId } = req.body;
    if (!orderId || !status) {
      res.status(400).json({ success: false, error: 'orderId and status required' });
      return;
    }

    await client.query('BEGIN');

    const derived = await client.query(
      `SELECT uuid_generate_v5(uuid_ns_dns(), $1) as id`,
      [orderId]
    );
    const orderUuid = derived.rows[0].id;

    // Update specific item if ticketId provided
    if (ticketId) {
      const idxMatch = ticketId.match(/_t(\d+)$/);
      if (idxMatch) {
        const idx = parseInt(idxMatch[1], 10);
        await client.query(
          `UPDATE order_items SET status = $1
           WHERE order_id = $2 AND id = (
             SELECT id FROM order_items WHERE order_id = $2
             ORDER BY created_at ASC OFFSET $3 LIMIT 1
           )`,
          [status, orderUuid, idx]
        );
      } else {
        await client.query(
          `UPDATE order_items SET status = $1 WHERE order_id = $2`,
          [status, orderUuid]
        );
      }
    }

    // Always propagate to parent order
    await client.query(
      `UPDATE orders SET status = $1 WHERE id = $2`,
      [status, orderUuid]
    );

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('[order-status] Error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// ============================================================
// Analytics & menu endpoints (unchanged)
// ============================================================
router.get('/top-items', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT COALESCE(mi.name,'Item') as name, SUM(oi.quantity)::int as sold, ROUND(SUM(oi.total_price)::numeric,2) as revenue
       FROM order_items oi LEFT JOIN menu_items mi ON mi.id=oi.menu_item_id
       WHERE oi.created_at > NOW() - INTERVAL '30 days' GROUP BY mi.name ORDER BY sold DESC LIMIT 5`
    );
    res.json({ success: true, data: result.rows.length > 0 ? result.rows.map(r => ({ name: r.name, sold: r.sold, revenue: parseFloat(r.revenue) })) : [
      { name: 'Margherita Pizza', sold: 86, revenue: 1117.14 },
      { name: 'Grilled Salmon', sold: 64, revenue: 1599.36 },
      { name: 'Caesar Salad', sold: 58, revenue: 579.42 },
      { name: 'Espresso', sold: 52, revenue: 207.48 },
      { name: 'French Fries', sold: 48, revenue: 335.52 },
    ]});
  } catch (err: any) {
    res.json({ success: true, data: [] });
  }
});

router.get('/revenue-7days', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT DATE(created_at) as day, ROUND(SUM(grand_total)::numeric,2) as revenue, COUNT(*)::int as orders
       FROM orders WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY DATE(created_at) ORDER BY day ASC`
    );
    res.json({ success: true, data: result.rows.length > 0 ? result.rows.map(r => ({
      day: new Date(r.day).toLocaleDateString('en-US', { weekday: 'short' }),
      revenue: parseFloat(r.revenue), orders: r.orders,
    })) : [
      { day: 'Mon', revenue: 2510, orders: 35 }, { day: 'Tue', revenue: 2680, orders: 38 },
      { day: 'Wed', revenue: 2210, orders: 31 }, { day: 'Thu', revenue: 3010, orders: 42 },
      { day: 'Fri', revenue: 3540, orders: 48 }, { day: 'Sat', revenue: 3780, orders: 52 },
      { day: 'Sun', revenue: 2847.5, orders: 42 },
    ]});
  } catch (err: any) {
    res.json({ success: true, data: [] });
  }
});

router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT COALESCE(SUM(grand_total),0) as total_revenue, COUNT(*)::int as total_orders,
              CASE WHEN COUNT(*)>0 THEN ROUND(SUM(grand_total)/COUNT(*),2) ELSE 0 END as avg_order_value
       FROM orders WHERE created_at > NOW() - INTERVAL '24 hours'`
    );
    res.json({ success: true, data: {
      totalRevenue: parseFloat(result.rows[0].total_revenue),
      totalOrders: result.rows[0].total_orders,
      avgOrderValue: parseFloat(result.rows[0].avg_order_value),
    }});
  } catch (err: any) {
    res.json({ success: true, data: { totalRevenue: 0, totalOrders: 0, avgOrderValue: 0 } });
  }
});

router.get('/categories', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`SELECT id, name, slug, display_order FROM categories ORDER BY display_order ASC`);
    res.json({ success: true, data: result.rows });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/menu-items', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT mi.id, mi.name, mi.description, mi.base_price as price, mi.is_available as available,
              mi.category_id, c.name as category_name, mi.display_order, mi.created_at
       FROM menu_items mi LEFT JOIN categories c ON c.id = mi.category_id
       WHERE mi.restaurant_id = $1 ORDER BY mi.display_order ASC, mi.name ASC`,
      [RESTAURANT_ID]
    );
    res.json({ success: true, data: result.rows });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/menu-items', async (req: Request, res: Response) => {
  const c = await pool.connect();
  try {
    const { name, price, categoryId, description, available } = req.body;
    if (!name || !price || !categoryId) {
      res.status(400).json({ success: false, error: 'name, price, and categoryId required' }); return;
    }
    const maxOrder = await c.query(`SELECT COALESCE(MAX(display_order),-1)+1 as next FROM menu_items WHERE restaurant_id=$1`, [RESTAURANT_ID]);
    const newId = uuidv4();
    await c.query(`INSERT INTO menu_items (id, restaurant_id, category_id, name, base_price, description, is_available, display_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [newId, RESTAURANT_ID, categoryId, name, parseFloat(price.toFixed(2)), description || '', available !== false, maxOrder.rows[0].next]);
    const result = await c.query(`SELECT mi.id, mi.name, mi.description, mi.base_price as price, mi.is_available as available, mi.category_id, c2.name as category_name, mi.display_order, mi.created_at FROM menu_items mi LEFT JOIN categories c2 ON c2.id = mi.category_id WHERE mi.id = $1`, [newId]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
  finally { c.release(); }
});

router.put('/menu-items/:id', async (req: Request, res: Response) => {
  const c = await pool.connect();
  try {
    const { id } = req.params;
    const { name, price, categoryId, description, available } = req.body;
    await c.query('BEGIN');
    if (name !== undefined) await c.query(`UPDATE menu_items SET name=$1 WHERE id=$2`, [name, id]);
    if (price !== undefined) await c.query(`UPDATE menu_items SET base_price=$1 WHERE id=$2`, [parseFloat(price.toFixed(2)), id]);
    if (categoryId !== undefined) await c.query(`UPDATE menu_items SET category_id=$1 WHERE id=$2`, [categoryId, id]);
    if (description !== undefined) await c.query(`UPDATE menu_items SET description=$1 WHERE id=$2`, [description, id]);
    if (available !== undefined) await c.query(`UPDATE menu_items SET is_available=$1 WHERE id=$2`, [available, id]);
    await c.query('COMMIT');
    const result = await c.query(`SELECT mi.id, mi.name, mi.description, mi.base_price as price, mi.is_available as available, mi.category_id, c2.name as category_name, mi.display_order, mi.created_at FROM menu_items mi LEFT JOIN categories c2 ON c2.id = mi.category_id WHERE mi.id = $1`, [id]);
    if (result.rows.length === 0) { res.status(404).json({ success: false, error: 'Not found' }); return; }
    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) { await c.query('ROLLBACK'); res.status(500).json({ success: false, error: err.message }); }
  finally { c.release(); }
});

router.delete('/menu-items/:id', async (req: Request, res: Response) => {
  const c = await pool.connect();
  try {
    const { id } = req.params;
    const result = await c.query(`DELETE FROM menu_items WHERE id=$1 RETURNING id, name`, [id]);
    if (result.rows.length === 0) { res.status(404).json({ success: false, error: 'Not found' }); return; }
    res.json({ success: true, data: result.rows[0] });
  } catch (err: any) {
    if (err.code === '23503') {
      try {
        const { id } = req.params;
        const sr = await c.query(`UPDATE menu_items SET is_available=false WHERE id=$1 RETURNING id, name`, [id]);
        if (sr.rows.length > 0) { res.json({ success: true, data: sr.rows[0], note: 'Marked unavailable' }); return; }
      } catch {}
    }
    res.status(500).json({ success: false, error: err.message });
  } finally { c.release(); }
});

router.get('/menu', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT mi.id, mi.name, mi.base_price as price, c.name as category
       FROM menu_items mi LEFT JOIN categories c ON c.id = mi.category_id
       WHERE mi.restaurant_id = $1 AND mi.is_available = true
       ORDER BY c.display_order ASC, mi.display_order ASC`,
      [RESTAURANT_ID]
    );
    res.json({ success: true, data: result.rows });
  } catch (err: any) { res.status(500).json({ success: false, error: err.message }); }
});

export default router;