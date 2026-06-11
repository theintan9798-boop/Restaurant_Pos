// ============================================================
// User Controller — RBAC User Management CRUD
// ============================================================

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';

const router = Router();
let pool: Pool;

export function setUserPool(pgPool: Pool) {
  pool = pgPool;
}

const RESTAURANT_ID = '00000000-0000-0000-0000-000000000001';

// ============================================================
// GET /api/users — Fetch all users
// ============================================================
router.get('/', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT id, first_name, last_name, email, role, is_active, phone, created_at, updated_at
       FROM users WHERE restaurant_id = $1 ORDER BY created_at DESC`,
      [RESTAURANT_ID]
    );
    const users = result.rows.map(row => ({
      id: row.id, name: `${row.first_name} ${row.last_name}`.trim(),
      firstName: row.first_name, lastName: row.last_name,
      email: row.email, role: row.role, isActive: row.is_active,
      phone: row.phone || '', createdAt: row.created_at, updatedAt: row.updated_at,
    }));
    res.json({ success: true, data: users });
  } catch (err: any) {
    console.error('[users] GET error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================
// POST /api/users — Create a new staff member
// ============================================================
router.post('/', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { name, email, role, password, pinCode } = req.body;
    if (!name || !email || !role) {
      res.status(400).json({ success: false, error: 'name, email, and role are required' }); return;
    }
    const validRoles = ['admin', 'manager', 'cashier', 'waiter', 'kitchen_staff'];
    if (!validRoles.includes(role)) {
      res.status(400).json({ success: false, error: `Invalid role. Must be one of: ${validRoles.join(', ')}` }); return;
    }
    const nameParts = name.trim().split(/\s+/);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    const plainPassword = password || 'password123';
    const passwordHash = await bcrypt.hash(plainPassword, 10);

    // Store PIN as plain-text (pin_code is VARCHAR(6), too small for bcrypt)
    const pinCodeValue = (pinCode && typeof pinCode === 'string' && pinCode.length >= 4) ? pinCode : null;

    const newId = uuidv4();
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO users (id, restaurant_id, first_name, last_name, email, password_hash, role, is_active, pin_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8)`,
      [newId, RESTAURANT_ID, firstName, lastName, email.toLowerCase().trim(), passwordHash, role, pinCodeValue]
    );
    await client.query('COMMIT');

    const result = await client.query(
      `SELECT id, first_name, last_name, email, role, is_active, phone, pin_code, created_at, updated_at FROM users WHERE id = $1`,
      [newId]
    );
    const row = result.rows[0];
    const user = {
      id: row.id, name: `${row.first_name} ${row.last_name}`.trim(),
      firstName: row.first_name, lastName: row.last_name, email: row.email,
      role: row.role, isActive: row.is_active, hasPin: !!row.pin_code,
      phone: row.phone || '', createdAt: row.created_at, updatedAt: row.updated_at,
    };
    res.status(201).json({ success: true, data: user });
  } catch (err: any) {
    await client.query('ROLLBACK');
    if (err.code === '23505') { res.status(409).json({ success: false, error: 'A user with this email already exists' }); return; }
    console.error('[users] POST error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    client.release();
  }
});

// ============================================================
// PUT /api/users/:id — Edit user details
// ============================================================
router.put('/:id', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { name, email, role, isActive, password, pinCode } = req.body;
    await client.query('BEGIN');

    if (name !== undefined) {
      const nameParts = name.trim().split(/\s+/);
      await client.query(`UPDATE users SET first_name=$1, last_name=$2 WHERE id=$3`, [nameParts[0] || '', nameParts.slice(1).join(' ') || '', id]);
    }
    if (email !== undefined) {
      await client.query(`UPDATE users SET email=$1 WHERE id=$2`, [email.toLowerCase().trim(), id]);
    }
    if (role !== undefined) {
      const validRoles = ['admin', 'manager', 'cashier', 'waiter', 'kitchen_staff'];
      if (!validRoles.includes(role)) { await client.query('ROLLBACK'); res.status(400).json({ success: false, error: `Invalid role` }); return; }
      await client.query(`UPDATE users SET role=$1 WHERE id=$2`, [role, id]);
    }
    if (isActive !== undefined) {
      await client.query(`UPDATE users SET is_active=$1 WHERE id=$2`, [isActive, id]);
    }
    if (password !== undefined && password !== '') {
      await client.query(`UPDATE users SET password_hash=$1 WHERE id=$2`, [await bcrypt.hash(password, 10), id]);
    }
    if (pinCode !== undefined && pinCode !== '') {
      await client.query(`UPDATE users SET pin_code=$1 WHERE id=$2`, [pinCode, id]);
    }

    await client.query('COMMIT');
    const result = await client.query(
      `SELECT id, first_name, last_name, email, role, is_active, phone, pin_code, created_at, updated_at FROM users WHERE id=$1`, [id]
    );
    if (result.rows.length === 0) { res.status(404).json({ success: false, error: 'User not found' }); return; }
    const row = result.rows[0];
    const user = {
      id: row.id, name: `${row.first_name} ${row.last_name}`.trim(),
      firstName: row.first_name, lastName: row.last_name, email: row.email,
      role: row.role, isActive: row.is_active, hasPin: !!row.pin_code,
      phone: row.phone || '', createdAt: row.created_at, updatedAt: row.updated_at,
    };
    res.json({ success: true, data: user });
  } catch (err: any) {
    await client.query('ROLLBACK');
    if (err.code === '23505') { res.status(409).json({ success: false, error: 'A user with this email already exists' }); return; }
    console.error('[users] PUT error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally { client.release(); }
});

// ============================================================
// DELETE /api/users/:id — Revoke/disable a user (soft delete)
// ============================================================
router.delete('/:id', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const result = await client.query(`UPDATE users SET is_active = false WHERE id = $1 RETURNING id, first_name, last_name, email`, [id]);
    if (result.rows.length === 0) { res.status(404).json({ success: false, error: 'User not found' }); return; }
    const row = result.rows[0];
    res.json({ success: true, data: { id: row.id, name: `${row.first_name} ${row.last_name}`.trim(), email: row.email, isActive: false } });
  } catch (err: any) {
    console.error('[users] DELETE error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally { client.release(); }
});

export default router;