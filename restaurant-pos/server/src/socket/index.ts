// ============================================================
// Socket.io Real-Time Server — POS Event Architecture
// Passes through full order payloads between clients
// ============================================================

import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyAccessToken } from '../middleware/auth';

let io: Server;

const ROOMS = {
  KITCHEN: 'room:kitchen',
  WAITERS: 'room:waiters',
  CASHIERS: 'room:cashiers',
  RESTAURANT: (restaurantId: string) => `restaurant:${restaurantId}`,
};

export function initializeSocketServer(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: ['http://localhost:3000'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling'],
  });

  // Allow all connections for demo (no auth required)
  io.use(async (socket: Socket, next) => {
    (socket as any).restaurantId = '00000000-0000-0000-0000-000000000001';
    next();
  });

  io.on('connection', (socket: Socket) => {
    const restaurantId = (socket as any).restaurantId || '00000000-0000-0000-0000-000000000001';
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Auto-join restaurant room
    socket.join(ROOMS.RESTAURANT(restaurantId));

    // Explicit room joins
    socket.on('room:join', (roomName: string) => {
      socket.join(roomName);
      console.log(`[Socket] ${socket.id} joined ${roomName}`);
    });

    socket.on('room:leave', (roomName: string) => {
      socket.leave(roomName);
    });

    // ========================================================
    // Waiter → broadcasts order to kitchen & all tabs
    // ========================================================
    socket.on('place_order', (payload: {
      orderId: string;
      tickets: Array<{ ticketId: string; menuItemName: string; quantity: number; notes?: string }>;
      tableNumber: string;
      tableId: string;
      total: number;
    }) => {
      console.log(`[Socket] place_order from ${socket.id}:`, payload.orderId);
      // Broadcast to kitchen room + restaurant room (all tabs)
      io.to(ROOMS.KITCHEN).to(ROOMS.RESTAURANT(restaurantId)).emit('order:created', payload);
    });

    // ========================================================
    // Kitchen → broadcasts ticket status to waiter & admin
    // ========================================================
    socket.on('update_ticket_status', (payload: {
      ticketId: string;
      newStatus: string;
    }) => {
      console.log(`[Socket] update_ticket_status from ${socket.id}:`, payload);
      io.to(ROOMS.RESTAURANT(restaurantId)).emit('ticket:status_changed', payload);
    });

    // ========================================================
    // Payment → broadcasts to all views
    // ========================================================
    socket.on('complete_payment', (payload: {
      orderId: string;
      tableId: string;
      totalAmount: number;
    }) => {
      console.log(`[Socket] complete_payment from ${socket.id}:`, payload);
      io.to(ROOMS.RESTAURANT(restaurantId)).emit('payment:completed', payload);
    });

    // ========================================================
    // Table status change → broadcasts to all views
    // ========================================================
    socket.on('update_table_status', (payload: {
      tableId: string;
      status: string;
    }) => {
      console.log(`[Socket] update_table_status from ${socket.id}:`, payload);
      io.to(ROOMS.RESTAURANT(restaurantId)).emit('table:status_changed', payload);
    });

    socket.on('disconnect', (reason: string) => {
      console.log(`[Socket] ${socket.id} disconnected: ${reason}`);
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

// Stub exports for order service compatibility
export const SOCKET_EVENTS = {
  NEW_KOT: 'kot:new',
  ITEM_STATUS_CHANGE: 'item:status_change',
  TABLE_STATUS_CHANGE: 'table:status_change',
  TABLE_MERGED: 'table:merged',
  ORDER_TRANSFERRED: 'order:transferred',
  BILL_REQUESTED: 'bill:requested',
  PAYMENT_COMPLETED: 'payment:completed',
} as const;

export function emitToKitchen(event: string, data: any): void {
  io?.to(ROOMS.KITCHEN).emit(event, data);
}
export function emitToWaiters(event: string, data: any): void {
  io?.to(ROOMS.WAITERS).emit(event, data);
}
export function emitToCashiers(event: string, data: any): void {
  io?.to(ROOMS.CASHIERS).emit(event, data);
}
export function emitToRestaurant(restaurantId: string, event: string, data: any): void {
  io?.to(ROOMS.RESTAURANT(restaurantId)).emit(event, data);
}
export function emitToOrder(orderId: string, event: string, data: any): void {
  io?.to(`order:${orderId}`).emit(event, data);
}
export function emitToTable(tableId: string, event: string, data: any): void {
  io?.to(`table:${tableId}`).emit(event, data);
}
export function emitToUser(userId: string, event: string, data: any): void {
  io?.to(`user:${userId}`).emit(event, data);
}

export { ROOMS };
