'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useRealtimePOS } from '../SocketProvider';
import { useAuth } from '../AuthProvider';

type TicketStatus = 'pending' | 'cooking' | 'ready' | 'served';

// Glass ticket styling per status — translucent, glow-bordered
const STATUS_STYLES: Record<TicketStatus, { border: string; glow: string; text: string; badge: string; btn: string }> = {
  pending: { border: 'border-red-500/40', glow: 'shadow-[0_0_30px_-12px_rgba(239,68,68,0.5)]', text: 'text-red-300', badge: 'bg-red-500/20 text-red-200', btn: 'bg-red-500/20 hover:bg-red-500/30 text-red-200' },
  cooking: { border: 'border-amber-500/40', glow: 'shadow-[0_0_30px_-12px_rgba(245,158,11,0.5)]', text: 'text-amber-300', badge: 'bg-amber-500/20 text-amber-200', btn: 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-200' },
  ready: { border: 'border-emerald-500/40', glow: 'shadow-[0_0_30px_-12px_rgba(16,185,129,0.5)]', text: 'text-emerald-300', badge: 'bg-emerald-500/20 text-emerald-200', btn: 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200' },
  served: { border: 'border-sky-500/40', glow: '', text: 'text-sky-300', badge: 'bg-sky-500/20 text-sky-200', btn: 'bg-sky-500/20 hover:bg-sky-500/30 text-sky-200' },
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
    <div className="h-screen flex flex-col">
      <header className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-4 md:px-6 py-3 flex flex-wrap items-center justify-between flex-shrink-0 gap-2">
        <div className="flex items-center space-x-3 flex-wrap">
          <h1 className="text-base md:text-lg font-bold text-white">🍳 Kitchen</h1>
          <span className={`pill ${isConnected ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>{isConnected ? '🟢 Live' : '🔴 Offline'}</span>
        </div>
        <div className="flex items-center space-x-3 text-xs">
          <span className="text-slate-400 hidden sm:inline">{user?.name || 'Kitchen'}</span>
          <button onClick={logout} className="btn-ghost px-2 md:px-3 py-1">🔒</button>
        </div>
      </header>

      {/* Station filters — scrollable pill row */}
      <div className="flex bg-white/[0.02] border-b border-white/10 px-2 md:px-4 py-2 space-x-1 flex-shrink-0 overflow-x-auto">
        {STATIONS.map(station => (
          <button key={station.id} onClick={() => setActiveStation(station.id)}
            className={`px-3 md:px-4 py-2 text-xs font-medium rounded-xl transition-colors whitespace-nowrap ${activeStation === station.id ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}>
            {station.label}
          </button>
        ))}
      </div>

      {alert && (
        <div className="bg-emerald-500/15 backdrop-blur border-b border-emerald-500/30 text-emerald-200 px-4 py-2 text-sm font-medium text-center">{alert}</div>
      )}

      {/* Ticket grid */}
      <div className="flex-1 overflow-y-auto p-3 md:p-4">
        {groupedTickets.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-600 text-sm">No active orders — waiting for new orders…</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {groupedTickets.map(([orderId, tix]) => {
              const orderTickets = tix as typeof filteredTickets;
              const tableInfo = orderTickets[0];
              const c = STATUS_STYLES[orderTickets[0].status as TicketStatus] || STATUS_STYLES.pending;
              return (
                <div key={orderId} className={`glass-card ${c.border} ${c.glow} p-3 space-y-2`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-500">#{orderId.substring(0, 8)}</span>
                    <span className={`pill font-bold ${c.badge}`}>{orderTickets[0].status.toUpperCase()}</span>
                  </div>
                  <p className="text-xs text-slate-500">Table: <span className="text-slate-200 font-medium">{tableInfo.tableNumber || tableInfo.orderId}</span></p>
                  <div className="space-y-1.5">
                    {orderTickets.map(item => (
                      <div key={item.ticketId} className="flex items-center justify-between text-sm gap-2">
                        <div className="flex items-center space-x-2 min-w-0">
                          <span className="text-slate-100 truncate">{item.menuItemName}</span>
                          <span className="text-slate-500 text-xs flex-shrink-0">x{item.quantity}</span>
                          {item.notes && <span className="text-amber-400/80 text-[10px] italic hidden sm:inline">{item.notes}</span>}
                        </div>
                        <button onClick={() => updateStatus(item.ticketId, item.status)}
                          className={`text-[10px] px-2 py-1 rounded-lg font-medium transition-colors flex-shrink-0 ${c.btn}`}>
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
