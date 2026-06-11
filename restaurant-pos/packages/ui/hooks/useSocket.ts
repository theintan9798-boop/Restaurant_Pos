// ============================================================
// useSocket — React Hook for Socket.io connection management
// Usage: const { socket, isConnected } = useSocket(token, role)
// ============================================================

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { SOCKET_EVENTS, UserRole, KitchenTicketDto, TableDto } from 'shared-types';

interface UseSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  joinRoom: (room: string) => void;
  leaveRoom: (room: string) => void;
  emitNewKOT: (orderId: string, tableId?: string) => void;
  emitItemStatusUpdate: (orderId: string, orderItemId: string, newStatus: string) => void;
  emitTableStatusUpdate: (tableId: string, status: string, orderId?: string) => void;
  emitBillRequest: (orderId: string, tableId: string) => void;
  emitPaymentComplete: (orderId: string, tableId: string) => void;
  emitTableMerge: (sourceTableId: string, targetTableId: string) => void;
  emitOrderTransfer: (orderId: string, fromTableId: string, toTableId: string) => void;
}

export function useSocket(token: string, role: UserRole): UseSocketReturn {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!token) return;

    const socketUrl = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';
    const socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socket.on(SOCKET_EVENTS.CONNECT, () => {
      console.log('[Socket] Connected');
      setIsConnected(true);
    });

    socket.on(SOCKET_EVENTS.DISCONNECT, (reason: string) => {
      console.log('[Socket] Disconnected:', reason);
      setIsConnected(false);
    });

    socket.on(SOCKET_EVENTS.ERROR, (error: Error) => {
      console.error('[Socket] Error:', error.message);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  const joinRoom = useCallback((room: string) => {
    socketRef.current?.emit('room:join', room);
  }, []);

  const leaveRoom = useCallback((room: string) => {
    socketRef.current?.emit('room:leave', room);
  }, []);

  const emitNewKOT = useCallback((orderId: string, tableId?: string) => {
    socketRef.current?.emit('kot:send', { orderId, tableId });
  }, []);

  const emitItemStatusUpdate = useCallback(
    (orderId: string, orderItemId: string, newStatus: string) => {
      socketRef.current?.emit('item:update_status', { orderId, orderItemId, newStatus });
    },
    []
  );

  const emitTableStatusUpdate = useCallback(
    (tableId: string, status: string, orderId?: string) => {
      socketRef.current?.emit('table:update_status', { tableId, status, orderId });
    },
    []
  );

  const emitBillRequest = useCallback((orderId: string, tableId: string) => {
    socketRef.current?.emit('bill:request', { orderId, tableId });
  }, []);

  const emitPaymentComplete = useCallback((orderId: string, tableId: string) => {
    socketRef.current?.emit('payment:complete', { orderId, tableId });
  }, []);

  const emitTableMerge = useCallback((sourceTableId: string, targetTableId: string) => {
    socketRef.current?.emit('table:merge', { sourceTableId, targetTableId });
  }, []);

  const emitOrderTransfer = useCallback(
    (orderId: string, fromTableId: string, toTableId: string) => {
      socketRef.current?.emit('order:transfer', { orderId, fromTableId, toTableId });
    },
    []
  );

  return {
    socket: socketRef.current,
    isConnected,
    joinRoom,
    leaveRoom,
    emitNewKOT,
    emitItemStatusUpdate,
    emitTableStatusUpdate,
    emitBillRequest,
    emitPaymentComplete,
    emitTableMerge,
    emitOrderTransfer,
  };
}