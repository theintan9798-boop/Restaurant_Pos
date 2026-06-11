'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useRealtimePOS } from '../SocketProvider';
import { useAuth } from '../AuthProvider';

type TicketStatus = 'pending' | 'cooking' | 'ready' | 'served';

const STATUS_STYLES: Record<TicketStatus, { bg: string; border: string; text: string; badge: string }> = {
  pending: { bg: 'bg-red-900/60', border: 'border-red-500/50', text: 'text-red-300', badge: 'bg-red-500' },
  cooking: { bg: 'bg-amber-900/60', border: 'border-amber-500/50', text: 'text-amber-300', badge: 'bg-amber-500' },
  ready: { bg: 'bg-emerald-900/60', border: 'border-emerald-500/50', text: 'text-emerald-300', badge: 'bg-emerald-500' },
  served: { bg: 'bg-blue-900/60', border: 'border-blue-500/50', text: 'text-blue-300', badge: 'bg-blue-500' },
};

const STATIONS = [
  { id: 'all', label: 'All Orders' },
  { id: 'main', label: 'Main' },
  { id: 'grill', label: 'Grill' },
  { id: 'fry', label: 'Fry' },
  { id: 'bar', label: 'Bar' },
];

export default function KitchenDisplayPage() {
  const { isConnected, state, emitTicketStatusUpdate } = useRealtimePOS();
  const { user, logout } = useAuth();
  const [activeStation, setActiveStation] = useState('all');
  const [alert, setAlert] = useState<string | null>(null);

  const tickets = state.kitchenTickets.filter(t => t.status !== 'served');

  const filteredTickets = useMemo(() => {
    if (activeStation === 'all') return tickets;
    return tickets.filter(t => t.station === activeStation);
  }, [tickets, activeStation]);

  const groupedTickets = useMemo(() => {
    const grouped: Record<string, typeof filteredTickets> = {};
    for (const t of filteredTickets) {
      const key = t.orderId;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(t);
    }
    return Object.entries(grouped);
  }, [filteredTickets]);

  const updateStatus = useCallback((ticketId: string, currentStatus: string) => {
    const nextMap: Record<string, TicketStatus> = {
      pending: 'cooking',
      cooking: 'ready',
      ready: 'served',
    };
    const next = (nextMap as any)[currentStatus] || 'cooking';
    emitTicketStatusUpdate(ticketId, next);
    if (next === 'ready') {
      setAlert(`✅ ${ticketId} marked READY — notify waiter!`);
      setTimeout(() => setAlert(null), 3000);
    }
  }, [emitTicketStatusUpdate]);

  return (
    <div className="h-screen flex flex-col bg-gray-950 text-gray-100">
      <header className="bg-gray-900 px-4 md:px-6 py-3 flex flex-wrap items-center justify-between flex-shrink-0 border-b border-gray-800 gap-2">
        <div className="flex items-center space-x-3 flex-wrap">
          <h1 className="text-base md:text-lg font-bold">🍳 Kitchen</h1>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isConnected ? 'bg-emerald-600' : 'bg-red-600'}`}>{isConnected ? '🟢 Live' : '🔴 Offline'}</span>
        </div>
        <div className="flex items-center space-x-3 text-xs">
          <span className="text-gray-500 hidden sm:inline">{user?.name || 'Kitchen'}</span>
          <button onClick={logout} className="text-gray-400 hover:text-white px-2 md:px-3 py-1 rounded border border-gray-600 hover:border-gray-400" title="Lock / Switch User">🔒</button>
        </div>
      </header>

      {/* Station filters — scrollable on mobile */}
      <div className="flex bg-gray-900 border-b border-gray-800 px-2 md:px-4 space-x-1 flex-shrink-0 overflow-x-auto">
        {STATIONS.map(station => (
          <button key={station.id} onClick={() => setActiveStation(station.id)}
            className={`px-3 md:px-4 py-2 text-xs font-medium rounded-t-md transition-colors whitespace-nowrap ${activeStation === station.id ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'}`}>
            {station.label}
          </button>
        ))}
      </div>

      {alert && (
        <div className="bg-emerald-600 text-white px-4 py-2 text-sm font-medium text-center animate-pulse">{alert}</div>
      )}

      {/* Ticket grid — responsive columns */}
      <div className="flex-1 overflow-y-auto p-3 md:p-4">
        {groupedTickets.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-sm">No active orders — waiting for new orders...</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {groupedTickets.map(([orderId, tix]) => {
              const orderTickets = tix as typeof filteredTickets;
              const tableInfo = orderTickets[0];
              const c = STATUS_STYLES[orderTickets[0].status as TicketStatus] || STATUS_STYLES.pending;
              return (
                <div key={orderId} className={`rounded-xl border ${c.border} ${c.bg} p-3 space-y-2`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-gray-400">#{orderId.substring(0, 8)}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold text-white ${c.badge}`}>{orderTickets[0].status.toUpperCase()}</span>
                  </div>
                  <p className="text-xs text-gray-400">Table: <span className="text-gray-200 font-medium">{tableInfo.tableNumber || tableInfo.orderId}</span></p>
                  <div className="space-y-1.5">
                    {orderTickets.map(item => (
                      <div key={item.ticketId} className="flex items-center justify-between text-sm gap-2">
                        <div className="flex items-center space-x-2 min-w-0">
                          <span className="text-gray-200 truncate">{item.menuItemName}</span>
                          <span className="text-gray-500 text-xs flex-shrink-0">x{item.quantity}</span>
                          {item.notes && <span className="text-amber-400 text-[10px] italic hidden sm:inline">{item.notes}</span>}
                        </div>
                        <button onClick={() => updateStatus(item.ticketId, item.status)}
                          className={`text-[10px] px-2 py-1 rounded font-medium transition-colors flex-shrink-0 ${
                            item.status === 'pending' ? 'bg-red-600 hover:bg-red-500 text-white' :
                            item.status === 'cooking' ? 'bg-amber-600 hover:bg-amber-500 text-white' :
                            'bg-emerald-600 hover:bg-emerald-500 text-white'
                          }`}>
                          {item.status === 'pending' ? '▶ Start' : item.status === 'cooking' ? '✓ Ready' : '✓ Served'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}