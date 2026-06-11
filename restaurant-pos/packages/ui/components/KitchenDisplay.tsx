// ============================================================
// KitchenDisplay — Kitchen Display System (KDS)
// Real-time order ticket board for kitchen staff
// Tracks: Pending → Cooking → Ready → Served
// ============================================================

'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { KitchenTicketDto, OrderItemStatus, SOCKET_EVENTS } from 'shared-types';
import type { Socket } from 'socket.io-client';

// ============================================================
// Status styling
// ============================================================
const ITEM_STATUS_STYLES: Record<OrderItemStatus, { bg: string; border: string; text: string; label: string }> = {
  pending: {
    bg: 'bg-red-50',
    border: 'border-red-400',
    text: 'text-red-700',
    label: 'NEW',
  },
  cooking: {
    bg: 'bg-amber-50',
    border: 'border-amber-400',
    text: 'text-amber-700',
    label: 'Cooking',
  },
  ready: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-400',
    text: 'text-emerald-700',
    label: 'Ready',
  },
  served: {
    bg: 'bg-blue-50',
    border: 'border-blue-400',
    text: 'text-blue-700',
    label: 'Served',
  },
  cancelled: {
    bg: 'bg-gray-100',
    border: 'border-gray-300',
    text: 'text-gray-500',
    label: 'Cancelled',
  },
};

// ============================================================
// Station tabs
// ============================================================
const STATIONS = [
  { id: 'all', label: 'All Orders', color: 'bg-gray-600' },
  { id: 'main', label: 'Main', color: 'bg-red-500' },
  { id: 'grill', label: 'Grill', color: 'bg-orange-500' },
  { id: 'fry', label: 'Fry', color: 'bg-yellow-500' },
  { id: 'bar', label: 'Bar', color: 'bg-blue-500' },
];

// ============================================================
// Props
// ============================================================
interface KitchenDisplayProps {
  tickets: KitchenTicketDto[];
  socket: Socket | null;
  onUpdateItemStatus: (ticketId: string, orderItemId: string, newStatus: OrderItemStatus) => void;
  isLoading?: boolean;
}

// ============================================================
// Component
// ============================================================
export function KitchenDisplay({
  tickets,
  socket,
  onUpdateItemStatus,
  isLoading = false,
}: KitchenDisplayProps) {
  const [activeStation, setActiveStation] = useState<string>('all');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  // Filter tickets by station
  const filteredTickets = useMemo(() => {
    let filtered = activeStation === 'all'
      ? tickets
      : tickets.filter((t) => t.station === activeStation);

    if (!showHistory) {
      filtered = filtered.filter((t) => t.status !== 'served' && t.status !== 'cancelled');
    }
    return filtered;
  }, [tickets, activeStation, showHistory]);

  // Group by order for ticket cards
  const orderGroups = useMemo(() => {
    const groups = new Map<string, KitchenTicketDto[]>();
    for (const ticket of filteredTickets) {
      const key = ticket.orderId;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(ticket);
    }
    return Array.from(groups.entries());
  }, [filteredTickets]);

  // --- Stats ---
  const stats = useMemo(() => {
    const pending = tickets.filter((t) => t.status === 'pending').length;
    const cooking = tickets.filter((t) => t.status === 'cooking').length;
    const ready = tickets.filter((t) => t.status === 'ready').length;
    return { pending, cooking, ready, total: pending + cooking + ready };
  }, [tickets]);

  // --- Play notification sound on new tickets ---
  useEffect(() => {
    if (!socket || !soundEnabled) return;

    const handler = () => {
      try {
        const audio = new Audio('/sounds/new-order.mp3');
        audio.volume = 0.5;
        audio.play().catch(() => {});
      } catch {}
    };

    socket.on(SOCKET_EVENTS.NEW_KOT, handler);
    return () => { socket.off(SOCKET_EVENTS.NEW_KOT, handler); };
  }, [socket, soundEnabled]);

  // --- Handlers ---
  const handleStatusChange = useCallback(
    (ticket: KitchenTicketDto, nextStatus: OrderItemStatus) => {
      onUpdateItemStatus(ticket.id, ticket.orderItemId, nextStatus);
    },
    [onUpdateItemStatus]
  );

  // --- Elapsed time formatter ---
  const formatElapsed = (createdAt: string): string => {
    const elapsed = Date.now() - new Date(createdAt).getTime();
    const minutes = Math.floor(elapsed / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ago`;
  };

  // ============================================================
  // Loading state
  // ============================================================
  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-900 rounded-xl">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-400">Loading kitchen display...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-gray-900 text-white rounded-xl overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-800 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold">
              <span className="text-red-500">KDS</span> Kitchen Display
            </h1>
            <div className="flex space-x-3 text-xs text-gray-400">
              <span>🟡 Pending: <strong className="text-red-400">{stats.pending}</strong></span>
              <span>🟠 Cooking: <strong className="text-amber-400">{stats.cooking}</strong></span>
              <span>🟢 Ready: <strong className="text-emerald-400">{stats.ready}</strong></span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {/* Sound toggle */}
            <button
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`text-xs px-2 py-1 rounded ${soundEnabled ? 'bg-green-700 text-green-100' : 'bg-gray-700 text-gray-400'}`}
            >
              {soundEnabled ? '🔊 Sound On' : '🔇 Sound Off'}
            </button>

            {/* History toggle */}
            <button
              onClick={() => setShowHistory(!showHistory)}
              className={`text-xs px-2 py-1 rounded ${showHistory ? 'bg-blue-700 text-blue-100' : 'bg-gray-700 text-gray-400'}`}
            >
              {showHistory ? '📋 Show All' : '📋 Active Only'}
            </button>
          </div>
        </div>
      </div>

      {/* Station tabs */}
      <div className="flex border-b border-gray-800 bg-gray-850">
        {STATIONS.map((station) => {
          const count = station.id === 'all'
            ? stats.total
            : tickets.filter((t) => t.station === station.id && t.status !== 'served' && t.status !== 'cancelled').length;
          return (
            <button
              key={station.id}
              onClick={() => setActiveStation(station.id)}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors relative ${
                activeStation === station.id
                  ? 'text-white border-b-2 border-indigo-500'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {station.label}
              {count > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-xs bg-red-600 text-white rounded-full">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Ticket grid */}
      <div className="flex-1 overflow-auto p-4">
        {orderGroups.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <svg className="h-20 w-20 text-gray-700 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={0.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              <p className="text-gray-500 text-lg font-medium">No active orders</p>
              <p className="text-gray-600 text-sm mt-1">Waiting for orders from waiters...</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 auto-rows-min">
            {orderGroups.map(([orderId, orderTickets]) => {
              const orderTicket = orderTickets[0];
              return (
                <div
                  key={orderId}
                  className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden hover:border-gray-600 transition-colors"
                >
                  {/* Order header */}
                  <div className="px-4 py-3 border-b border-gray-700 bg-gray-750 flex items-center justify-between">
                    <div>
                      <span className="text-lg font-bold text-white">
                        #{orderTicket.orderNumber}
                      </span>
                      {orderTicket.tableNumber && (
                        <span className="ml-2 text-xs text-gray-400 bg-gray-700 px-1.5 py-0.5 rounded">
                          {orderTicket.tableNumber}
                        </span>
                      )}
                      {orderTicket.orderType === 'delivery' && (
                        <span className="ml-2 text-xs text-orange-400 bg-orange-900/30 px-1.5 py-0.5 rounded">
                          Delivery
                        </span>
                      )}
                      {orderTicket.orderType === 'takeaway' && (
                        <span className="ml-2 text-xs text-purple-400 bg-purple-900/30 px-1.5 py-0.5 rounded">
                          Takeaway
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">
                      {formatElapsed(orderTicket.createdAt)}
                    </span>
                  </div>

                  {/* Items */}
                  <div className="p-3 space-y-2">
                    {orderTickets.map((ticket) => {
                      const styles = ITEM_STATUS_STYLES[ticket.status as OrderItemStatus] || ITEM_STATUS_STYLES.pending;
                      return (
                        <div
                          key={ticket.id}
                          className={`rounded-lg border ${styles.border} ${styles.bg} p-3`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center space-x-2">
                                <span className="font-semibold text-white">
                                  {ticket.quantity}x {ticket.menuItemName}
                                </span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${styles.bg} ${styles.text} border ${styles.border}`}>
                                  {styles.label}
                                </span>
                              </div>

                              {ticket.variationName && (
                                <span className="text-xs text-gray-400 ml-1">
                                  ({ticket.variationName})
                                </span>
                              )}

                              {/* Modifier tags */}
                              {ticket.modifiers && ticket.modifiers.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {ticket.modifiers.map((mod, mi) => (
                                    <span
                                      key={mi}
                                      className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-700 text-gray-300"
                                    >
                                      {mod.modifierOptionName}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {/* Notes */}
                              {ticket.notes && (
                                <p className="text-xs text-gray-500 mt-1 italic">
                                  📝 {ticket.notes}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Action buttons */}
                          <div className="flex space-x-2 mt-2 pt-2 border-t border-gray-700">
                            {ticket.status === 'pending' && (
                              <button
                                onClick={() => handleStatusChange(ticket, 'cooking')}
                                className="flex-1 py-1.5 text-xs font-bold bg-amber-600 text-white rounded hover:bg-amber-500 transition-colors"
                              >
                                Start Cooking
                              </button>
                            )}
                            {ticket.status === 'cooking' && (
                              <button
                                onClick={() => handleStatusChange(ticket, 'ready')}
                                className="flex-1 py-1.5 text-xs font-bold bg-emerald-600 text-white rounded hover:bg-emerald-500 transition-colors"
                              >
                                Mark Ready
                              </button>
                            )}
                            {ticket.status === 'ready' && (
                              <button
                                onClick={() => handleStatusChange(ticket, 'served')}
                                className="flex-1 py-1.5 text-xs font-bold bg-blue-600 text-white rounded hover:bg-blue-500 transition-colors"
                              >
                                Mark Served
                              </button>
                            )}
                            {ticket.status !== 'served' && ticket.status !== 'cancelled' && (
                              <button
                                onClick={() => handleStatusChange(ticket, 'cancelled')}
                                className="px-2 py-1.5 text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded transition-colors"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer with summary */}
      <div className="border-t border-gray-800 px-4 py-2 flex items-center justify-between text-xs text-gray-500">
        <span>{orderGroups.length} active order cards</span>
        <span className="text-gray-600">Auto-refreshing via WebSocket</span>
      </div>
    </div>
  );
}