// ============================================================
// JWT Authentication & RBAC Middleware
// ============================================================

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { JwtPayload, UserRole, LoginRequest, LoginResponse, UserDto } from 'shared-types';

// In production, store in env vars / vault
const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET || 'pos-access-secret-key-change-me';
const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET || 'pos-refresh-secret-key-change-me';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
const SALT_ROUNDS = 12;

// ============================================================
// Role → Permission mapping
// ============================================================
const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: [
    'reports:view', 'reports:export', 'users:manage', 'menu:manage',
    'orders:view_all', 'orders:void', 'orders:refund',
    'discounts:manage', 'tax:manage', 'settings:manage',
    'tables:manage', 'payments:view_all', 'audit:view',
  ],
  manager: [
    'reports:view', 'orders:view_all', 'orders:void',
    'discounts:apply', 'discounts:manage',
    'tables:manage', 'payments:view_all', 'menu:manage',
  ],
  cashier: [
    'orders:view', 'orders:create', 'orders:checkout',
    'payments:process', 'payments:refund', 'discounts:apply',
    'bills:split',
  ],
  waiter: [
    'orders:view', 'orders:create', 'orders:update',
    'tables:view', 'tables:update', 'menu:view',
    'bills:request',
  ],
  kitchen_staff: [
    'orders:view', 'kds:view', 'kds:update',
    'menu:view',
  ],
};

// ============================================================
// JWT Signing & Verification
// ============================================================
export function generateAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

export function generateRefreshToken(userId: string, restaurantId: string): string {
  const tokenId = uuidv4();
  return jwt.sign(
    { userId, restaurantId, tokenId, type: 'refresh' },
    REFRESH_TOKEN_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
}

export function verifyAccessToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, ACCESS_TOKEN_SECRET) as JwtPayload;
  return {
    userId: decoded.userId,
    restaurantId: decoded.restaurantId,
    role: decoded.role,
    permissions: ROLE_PERMISSIONS[decoded.role] || [],
    iat: decoded.iat,
    exp: decoded.exp,
  };
}

export function verifyRefreshToken(token: string): jwt.JwtPayload {
  return jwt.verify(token, REFRESH_TOKEN_SECRET) as jwt.JwtPayload;
}

// ============================================================
// Password hashing
// ============================================================
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ============================================================
// Express Middleware: Require Authentication
// ============================================================
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'Missing or malformed authorization header' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);
    (req as any).user = decoded;
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({
        success: false,
        error: 'token_expired',
        message: 'Access token has expired, please refresh',
      });
      return;
    }
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

// ============================================================
// Express Middleware: Role-Based Authorization
// ============================================================
export function authorize(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as JwtPayload | undefined;

    if (!user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({
        success: false,
        error: 'forbidden',
        message: `Role '${user.role}' is not authorized for this action`,
      });
      return;
    }

    next();
  };
}

// ============================================================
// Express Middleware: Require Specific Permission
// ============================================================
export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user as JwtPayload | undefined;

    if (!user) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    if (!user.permissions.includes(permission)) {
      res.status(403).json({
        success: false,
        error: 'forbidden',
        message: `Missing required permission: ${permission}`,
      });
      return;
    }

    next();
  };
}

// ============================================================
// Auth Controller: Login / Refresh / Logout
// ============================================================
export { ROLE_PERMISSIONS };