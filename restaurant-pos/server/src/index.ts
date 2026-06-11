// ============================================================
// Restaurant POS — Express Server Entry Point
// ============================================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer as createHttpServer } from 'http';
import { Pool } from 'pg';
import { initializeSocketServer } from './socket';
import { setPool } from './services/order.service';
import orderController from './controllers/order.controller';
import dataController, { setDataPool } from './controllers/data.controller';
import userController, { setUserPool } from './controllers/user.controller';
import authController, { setAuthPool } from './controllers/auth.controller';

// --- Environment Config ---
const PORT = parseInt(process.env.PORT || '4000', 10);
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/restaurant_pos';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

// --- Database Pool ---
const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Register pool with all services
setPool(pool);
setDataPool(pool);
setUserPool(pool);
setAuthPool(pool);

// --- Express App ---
const app = express();
const httpServer = createHttpServer(app);

// --- Middleware ---
app.use(helmet());
app.use(cors({
  origin: CORS_ORIGIN.split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '2mb' }));

// --- Health Check ---
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: 'Database connection failed' });
  }
});

// --- API Routes ---
app.use('/api/orders', orderController);
app.use('/api/data', dataController);
app.use('/api/users', userController);
app.use('/api/auth', authController);

// Tables routes placeholder
app.get('/api/tables', (_req, res) => {
  res.json({ success: true, message: 'Tables endpoint — implement with DB query' });
});

app.get('/api/menu', (_req, res) => {
  res.json({ success: true, message: 'Menu endpoint — implement with DB query' });
});

// --- 404 Handler ---
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

// --- Global Error Handler ---
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// --- Initialize Socket.io ---
const io = initializeSocketServer(httpServer);

// --- Start Server ---
httpServer.listen(PORT, () => {
  console.log(`[Server] Restaurant POS API running on http://localhost:${PORT}`);
  console.log(`[Server] WebSocket server ready`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
});

// --- Graceful Shutdown ---
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received, shutting down gracefully...');
  io.close();
  await pool.end();
  httpServer.close(() => {
    console.log('[Server] Shutdown complete');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('[Server] SIGINT received, shutting down...');
  io.close();
  await pool.end();
  httpServer.close(() => {
    process.exit(0);
  });
});

// --- Handle uncaught errors ---
process.on('unhandledRejection', (reason: any) => {
  console.error('[Server] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err: Error) => {
  console.error('[Server] Uncaught Exception:', err);
});

export { app, httpServer, io };