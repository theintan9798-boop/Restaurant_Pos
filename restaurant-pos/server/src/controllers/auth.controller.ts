// ============================================================
// Auth Controller — PIN-based Login for Restaurant Staff
// ============================================================

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';

const router = Router();
let pool: Pool;

export function setAuthPool(pgPool: Pool) {
  pool = pgPool;
}

const RESTAURANT_ID = '00000000-0000-0000-0000-000000000001';

// ============================================================
// POST /api/auth/pin-login
// Body: { pin: "1234", expectedRole?: "admin"|"waiter"|"kitchen_staff" }
// ============================================================
router.post('/pin-login', async (req: Request, res: Response) => {
  try {
    const { pin, expectedRole } = req.body;

    if (!pin || typeof pin !== 'string' || pin.length < 4 || pin.length > 6) {
      res.status(400).json({ success: false, error: 'PIN must be 4-6 digits' });
      return;
    }

    // Find user by exact pin_code match
    const result = await pool.query(
      `SELECT id, first_name, last_name, email, role, is_active
       FROM users
       WHERE restaurant_id = $1 AND is_active = true AND pin_code = $2
       LIMIT 1`,
      [RESTAURANT_ID, pin]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ success: false, error: 'Invalid PIN' });
      return;
    }

    const user = result.rows[0];

    // If caller specified an expected role, enforce it
    if (expectedRole && user.role !== expectedRole) {
      res.status(403).json({ success: false, error: `This PIN is not authorized for ${expectedRole} access. Please use the correct login screen.` });
      return;
    }

    // Update last_login_at
    await pool.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);

    res.json({
      success: true,
      data: {
        id: user.id,
        name: `${user.first_name} ${user.last_name}`.trim(),
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err: any) {
    console.error('[auth] PIN login error:', err.message);
    res.status(500).json({ success: false, error: 'Authentication failed' });
  }
});

export default router;