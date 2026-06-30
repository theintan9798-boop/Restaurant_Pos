'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { TableDto, FloorSection, CartItem, TableStatus } from 'shared-types';
import { useRealtimePOS } from './SocketProvider';
import { useAuth } from './AuthProvider';
import { PinPad } from './components/PinPad';

// Status → translucent glass treatment (dark surface)
const STATUS_COLORS: Record<TableStatus, { card: string; dot: string; text: string; label: string }> = {
  available: { card: 'border-emerald-500/30 hover:border-emerald-500/50', dot: 'bg-emerald-400', text: 'text-emerald-300', label: 'Available' },
  occupied: { card: 'border-red-500/30 hover:border-red-500/50', dot: 'bg-red-400', text: 'text-red-300', label: 'Occupied' },
  order_placed: { card: 'border-amber-500/30 hover:border-amber-500/50', dot: 'bg-amber-400', text: 'text-amber-300', label: 'Order Placed' },
  bill_requested: { card: 'border-sky-500/30 hover:border-sky-500/50', dot: 'bg-sky-400', text: 'text-sky-300', label: 'Bill Requested' },
};

const CATEGORY_ORDER = ['Appetizers', 'Main Course', 'Drinks', 'Desserts'];

const MOCK_TABLES: FloorSection[] = [
  {
    id: 'main', name: 'Main Hall', displayOrder: 0,
    tables: [
      { id: 't1', sectionId: 'main', tableNumber: 'A1', capacity: 4, status: 'available', posX: 20, posY: 20, shape: 'rectangle', width: 130, height: 100, version: 1 },
      { id: 't2', sectionId: 'main', tableNumber: 'A2', capacity: 2, status: 'available', posX: 180, posY: 20, shape: 'rectangle', width: 110, height: 100, version: 1 },
      { id: 't3', sectionId: 'main', tableNumber: 'A3', capacity: 6, status: 'available', posX: 340, posY: 20, shape: 'rectangle', width: 140, height: 100, version: 1 },
      { id: 't4', sectionId: 'main', tableNumber: 'B1', capacity: 4, status: 'available', posX: 20, posY: 160, shape: 'rectangle', width: 130, height: 100, version: 1 },
      { id: 't5', sectionId: 'main', tableNumber: 'B2', capacity: 4, status: 'available', posX: 180, posY: 160, shape: 'rectangle', width: 130, height: 100, version: 1 },
      { id: 't6', sectionId: 'main', tableNumber: 'B3', capacity: 2, status: 'available', posX: 340, posY: 160, shape: 'rectangle', width: 110, height: 100, version: 1 },
      { id: 't7', sectionId: 'main', tableNumber: 'C1', capacity: 8, status: 'available', posX: 20, posY: 300, shape: 'rectangle', width: 160, height: 110, version: 1 },
      { id: 't8', sectionId: 'main', tableNumber: 'C2', capacity: 4, status: 'available', posX: 210, posY: 300, shape: 'rectangle', width: 130, height: 100, version: 1 },
    ],
  },
  {
    id: 'terrace', name: 'Terrace', displayOrder: 1,
    tables: [
      { id: 't9', sectionId: 'terrace', tableNumber: 'T1', capacity: 2, status: 'available', posX: 20, posY: 20, shape: 'rectangle', width: 110, height: 100, version: 1 },
      { id: 't10', sectionId: 'terrace', tableNumber: 'T2', capacity: 4, status: 'available', posX: 160, posY: 20, shape: 'rectangle', width: 130, height: 100, version: 1 },
      { id: 't11', sectionId: 'terrace', tableNumber: 'T3', capacity: 2, status: 'available', posX: 320, posY: 20, shape: 'rectangle', width: 110, height: 100, version: 1 },
    ],
  },
];

export default function WaiterPOS() {
  const { isConnected, state, emitOrderCreated, emitTableStatusChange } = useRealtimePOS();
  const { user, logout, isAuthenticated, login } = useAuth();
  const liveMenu = state.menuItems;
  const [activeTab, setActiveTab] = useState('main');
  const [selectedTable, setSelectedTable] = useState<TableDto | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const liveTables = useMemo(() => MOCK_TABLES.map(section => ({
    ...section,
    tables: section.tables.map(t => ({ ...t, status: (state.tableStatuses[t.id] || t.status) as TableStatus })),
  })), [state.tableStatuses]);

  const currentSection = useMemo(() => liveTables.find((s) => s.id === activeTab), [liveTables, activeTab]);
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };
  const handleTableClick = useCallback((table: TableDto) => { setSelectedTable(table); setSidebarOpen(true); }, []);
  const handleAddToCart = useCallback((item: { id: string; name: string; price: number; category: string }) => {
    const numericPrice = parseFloat(String(item.price));
    setCart((prev) => {
      const existing = prev.findIndex((c) => c.menuItemId === item.id);
      if (existing >= 0) { const updated = [...prev]; updated[existing] = { ...updated[existing], quantity: updated[existing].quantity + 1 }; return updated; }
      return [...prev, { menuItemId: item.id, menuItemName: item.name, quantity: 1, unitPrice: numericPrice, modifiers: [] }];
    });
  }, []);
  const handleRemoveItem = useCallback((index: number) => setCart(prev => prev.filter((_, i) => i !== index)), []);
  const handleUpdateQty = useCallback((index: number, qty: number) => {
    setCart(prev => { const u = [...prev]; if (qty <= 0) return prev.filter((_, i) => i !== index); u[index] = { ...u[index], quantity: qty }; return u; });
  }, []);
  const handlePlaceOrder = useCallback(() => {
    if (cart.length === 0 || !selectedTable) return;
    const orderItems = cart.map(c => ({ menuItemName: c.menuItemName, quantity: c.quantity, notes: c.notes }));
    const total = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0) * 1.07;
    emitOrderCreated({ tableNumber: selectedTable.tableNumber, tableId: selectedTable.id, items: orderItems, total });
    emitTableStatusChange(selectedTable.id, 'order_placed');
    showToast(`Order placed! ${cart.reduce((s, i) => s + i.quantity, 0)} items → Kitchen.`);
    setCart([]);
  }, [cart, selectedTable, emitOrderCreated, emitTableStatusChange]);

  const cartSubtotal = cart.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const tax = cartSubtotal * 0.07;
  const total = cartSubtotal + tax;

  if (!isAuthenticated || !user) {
    return <PinPad title="Waiter Terminal" subtitle="Enter your waiter PIN to begin" icon="🍽️" onLogin={login} />;
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header — glass bar */}
      <header className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-4 md:px-6 py-3 flex flex-wrap items-center justify-between shadow-lg flex-shrink-0 gap-2">
        <div className="flex items-center space-x-3 flex-wrap">
          <h1 className="text-lg md:text-xl font-bold tracking-tight text-white">🍽️ POS</h1>
          <span className="hidden sm:inline text-slate-400 text-sm">Waiter View</span>
          <span className={`pill ${isConnected ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>{isConnected ? '🟢 Live' : '🔴 Offline'}</span>
        </div>
        <div className="flex items-center space-x-3 text-sm">
          <span className="text-slate-400 text-xs hidden sm:inline">{user?.name || 'Waiter'}</span>
          <button onClick={logout} className="btn-ghost px-3 py-1 text-xs" title="Lock / Switch User">🔒</button>
          <span className="pill bg-brand-500/15 text-brand-300">{user.role}</span>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Floor Plan */}
        <div className="flex-1 flex flex-col min-w-0 min-h-[300px]">
          <div className="flex bg-white/[0.02] border-b border-white/10 px-4 pt-2 overflow-x-auto">
            {liveTables.map((section) => (
              <button key={section.id} onClick={() => setActiveTab(section.id)} className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${activeTab === section.id ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}>{section.name} <span className="ml-1 text-xs text-slate-500">({section.tables.length})</span></button>
            ))}
          </div>
          <div className="flex-1 bg-slate-950/50 p-3 md:p-6 overflow-auto">
            <div className="relative rounded-2xl glass-card p-2" style={{ minHeight: '350px', minWidth: '500px', background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.015), rgba(255,255,255,0.015) 1px, transparent 1px, transparent 40px), repeating-linear-gradient(90deg, rgba(255,255,255,0.015), rgba(255,255,255,0.015) 1px, transparent 1px, transparent 40px)' }}>
              {currentSection?.tables.map((table) => {
                const colors = STATUS_COLORS[table.status as TableStatus] || STATUS_COLORS.available;
                const isSelected = selectedTable?.id === table.id;
                return (
                  <div key={table.id} onClick={() => handleTableClick(table)} className={`absolute cursor-pointer transition-all duration-200 ${isSelected ? 'ring-2 ring-brand-500 ring-offset-2 ring-offset-slate-950 z-10 scale-105' : 'z-0'}`} style={{ left: table.posX, top: table.posY, width: table.width, height: table.height }}>
                    <div className={`w-full h-full glass-card-hover ${colors.card} border-2 flex flex-col items-center justify-center`}>
                      <div className="flex items-center space-x-0.5 mb-1">{Array.from({ length: Math.min(table.capacity, 6) }, (_, i) => (<div key={i} className={`w-2 h-2 rounded-full ${table.status === 'available' ? colors.dot : 'bg-slate-600'}`} />))}</div>
                      <span className={`text-sm font-bold ${colors.text}`}>{table.tableNumber}</span>
                      <span className={`text-[10px] font-medium ${colors.text} opacity-75`}>{colors.label}</span>
                      <span className="text-[10px] text-slate-500">Seats {table.capacity}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sidebar: Menu + Cart — slide-up sheet on mobile */}
        <div className={`${selectedTable && sidebarOpen ? 'fixed inset-0 z-40 lg:relative lg:inset-auto' : 'hidden lg:flex'} lg:w-[420px] flex-col bg-slate-900/95 backdrop-blur-xl border-t lg:border-t-0 lg:border-l border-white/10 flex-shrink-0`}>
          {selectedTable && (
            <div className="px-4 py-3 border-b border-white/10 bg-white/[0.03] flex items-center justify-between">
              <div><span className="text-sm font-semibold text-white">Table {selectedTable.tableNumber}</span><span className={`ml-2 pill ${selectedTable.status === 'available' ? 'bg-emerald-500/15 text-emerald-300' : selectedTable.status === 'order_placed' ? 'bg-amber-500/15 text-amber-300' : 'bg-sky-500/15 text-sky-300'}`}>{STATUS_COLORS[selectedTable.status as TableStatus]?.label || 'Available'}</span></div>
              <button onClick={() => { setSelectedTable(null); setSidebarOpen(false); }} className="text-xs text-slate-400 hover:text-slate-200">Close</button>
            </div>
          )}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-white/5"><h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Menu</h3></div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {CATEGORY_ORDER.map((cat) => (
                <div key={cat}><h4 className="text-[10px] font-semibold text-slate-500 uppercase px-1 pb-1">{cat}</h4>
                  {liveMenu.filter((i: any) => i.category === cat).map((item: any) => (
                    <button key={item.id} onClick={() => handleAddToCart({ id: item.id, name: item.name, price: item.price, category: item.category })} className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-white/[0.06] transition-colors flex items-center justify-between group border border-transparent hover:border-white/10 mb-1"><span className="text-sm font-medium text-slate-200 truncate">{item.name}</span><span className="text-sm font-semibold text-slate-100 group-hover:text-brand-300 ml-2">${parseFloat(String(item.price)).toFixed(2)}</span></button>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-white/10 flex flex-col" style={{ maxHeight: '45%' }}>
            <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between"><h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cart ({cart.reduce((s, i) => s + i.quantity, 0)} items)</h3>{cart.length > 0 && <button onClick={() => setCart([])} className="text-xs text-red-400 hover:text-red-300">Clear</button>}</div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {cart.length === 0 ? <p className="text-xs text-slate-500 text-center py-4">Tap a menu item to add it</p> : cart.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm py-1 border-b border-white/5 pb-1"><div className="flex items-center space-x-2"><button onClick={() => handleUpdateQty(idx, item.quantity - 1)} className="w-5 h-5 rounded-full border border-white/20 text-xs text-slate-400 hover:bg-white/10">−</button><span className="w-5 text-center text-xs font-medium text-white">{item.quantity}</span><button onClick={() => handleUpdateQty(idx, item.quantity + 1)} className="w-5 h-5 rounded-full border border-white/20 text-xs text-slate-400 hover:bg-white/10">+</button><span className="text-slate-200 truncate max-w-[100px] md:max-w-[140px]">{item.menuItemName}</span></div><div className="flex items-center space-x-2"><span className="text-white font-medium">${(item.unitPrice * item.quantity).toFixed(2)}</span><button onClick={() => handleRemoveItem(idx)} className="text-red-400 hover:text-red-300 text-xs">✕</button></div></div>
              ))}
            </div>
            {cart.length > 0 && (
              <div className="border-t border-white/10 px-4 py-3 bg-white/[0.03] space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-400"><span>Subtotal</span><span>${cartSubtotal.toFixed(2)}</span></div>
                <div className="flex justify-between text-slate-400"><span>Tax (7%)</span><span>${tax.toFixed(2)}</span></div>
                <div className="flex justify-between text-base font-bold text-white pt-1 border-t border-white/10"><span>Total</span><span>${total.toFixed(2)}</span></div>
                <button onClick={handlePlaceOrder} className="btn-primary w-full mt-2 py-2.5 text-sm">Place Order • ${total.toFixed(2)}</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile overlay backdrop */}
      {selectedTable && sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 lg:hidden" onClick={() => { setSelectedTable(null); setSidebarOpen(false); }} />
      )}
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 glass-card bg-white/10 px-5 py-2.5 text-sm text-white z-50 shadow-glow">{toast}</div>}
    </div>
  );
}
