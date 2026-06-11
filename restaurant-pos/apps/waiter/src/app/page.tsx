'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { TableDto, FloorSection, CartItem, TableStatus } from 'shared-types';
import { useRealtimePOS } from './SocketProvider';
import { useAuth } from './AuthProvider';
import { PinPad } from './components/PinPad';

const STATUS_COLORS: Record<TableStatus, { bg: string; border: string; text: string; label: string }> = {
  available: { bg: 'bg-emerald-50 hover:bg-emerald-100', border: 'border-emerald-400', text: 'text-emerald-700', label: 'Available' },
  occupied: { bg: 'bg-red-50 hover:bg-red-100', border: 'border-red-400', text: 'text-red-700', label: 'Occupied' },
  order_placed: { bg: 'bg-amber-50 hover:bg-amber-100', border: 'border-amber-400', text: 'text-amber-700', label: 'Order Placed' },
  bill_requested: { bg: 'bg-blue-50 hover:bg-blue-100', border: 'border-blue-400', text: 'text-blue-700', label: 'Bill Requested' },
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

  if (!isAuthenticated || !user) {
    return <PinPad title="Waiter Terminal" subtitle="Enter your waiter PIN to begin" icon="🍽️" onLogin={login} />;
  }

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

  return (
    <div className="h-screen flex flex-col">
      <header className="bg-indigo-700 text-white px-4 md:px-6 py-3 flex flex-wrap items-center justify-between shadow-lg flex-shrink-0 gap-2">
        <div className="flex items-center space-x-3 flex-wrap">
          <h1 className="text-lg md:text-xl font-bold tracking-tight">🍽️ POS</h1>
          <span className="hidden sm:inline text-indigo-200 text-sm">Waiter View</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`}>{isConnected ? '🟢 Live' : '🔴 Offline'}</span>
        </div>
        <div className="flex items-center space-x-3 text-sm">
          <span className="text-indigo-200 text-xs hidden sm:inline">{user?.name || 'Waiter'}</span>
          <button onClick={logout} className="text-indigo-200 hover:text-white px-3 py-1 rounded border border-indigo-500 hover:border-indigo-300 text-xs" title="Lock / Switch User">🔒</button>
          <span className="bg-indigo-600 px-3 py-1 rounded-full text-xs font-medium">Waiter</span>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Floor Plan — responsive container */}
        <div className="flex-1 flex flex-col min-w-0 min-h-[300px]">
          <div className="flex bg-white border-b border-gray-200 px-4 pt-2 overflow-x-auto">
            {liveTables.map((section) => (
              <button key={section.id} onClick={() => setActiveTab(section.id)} className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${activeTab === section.id ? 'bg-white text-indigo-700 border-x border-t border-gray-200 shadow-sm -mb-px' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`}>{section.name} <span className="ml-1 text-xs text-gray-400">({section.tables.length})</span></button>
            ))}
          </div>
          <div className="flex-1 bg-gray-50 p-3 md:p-6 overflow-auto">
            <div className="relative bg-white rounded-xl shadow-inner border border-gray-200" style={{ minHeight: '350px', minWidth: '500px', background: 'repeating-linear-gradient(0deg, #f8fafc, #f8fafc 1px, transparent 1px, transparent 40px), repeating-linear-gradient(90deg, #f8fafc, #f8fafc 1px, transparent 1px, transparent 40px)' }}>
              {currentSection?.tables.map((table) => {
                const colors = STATUS_COLORS[table.status as TableStatus] || STATUS_COLORS.available;
                const isSelected = selectedTable?.id === table.id;
                return (
                  <div key={table.id} onClick={() => handleTableClick(table)} className={`absolute cursor-pointer transition-all duration-200 ${isSelected ? 'ring-2 ring-indigo-500 ring-offset-2 z-10 scale-105' : 'z-0'}`} style={{ left: table.posX, top: table.posY, width: table.width, height: table.height }}>
                    <div className={`w-full h-full ${colors.bg} ${colors.border} border-2 rounded-lg flex flex-col items-center justify-center shadow-sm hover:shadow-md transition-shadow`}>
                      <div className="flex items-center space-x-0.5 mb-1">{Array.from({ length: Math.min(table.capacity, 6) }, (_, i) => (<div key={i} className={`w-2 h-2 rounded-full ${table.status === 'available' ? 'bg-emerald-300' : 'bg-gray-300'}`} />))}</div>
                      <span className={`text-sm font-bold ${colors.text}`}>{table.tableNumber}</span>
                      <span className={`text-[10px] font-medium ${colors.text} opacity-75`}>{colors.label}</span>
                      <span className="text-[10px] text-gray-400">Seats {table.capacity}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sidebar: Menu + Cart — responsive with overlay on mobile */}
        <div className={`${selectedTable && sidebarOpen ? 'fixed inset-0 z-40 lg:relative lg:inset-auto' : 'hidden lg:flex'} lg:w-[420px] flex-col bg-white border-l border-gray-200 flex-shrink-0`}>
          {selectedTable && (
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div><span className="text-sm font-semibold text-gray-800">Table {selectedTable.tableNumber}</span><span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${selectedTable.status === 'available' ? 'bg-emerald-100 text-emerald-700' : selectedTable.status === 'order_placed' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{STATUS_COLORS[selectedTable.status as TableStatus]?.label || 'Available'}</span></div>
              <button onClick={() => { setSelectedTable(null); setSidebarOpen(false); }} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
            </div>
          )}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="px-4 py-2.5 border-b border-gray-100"><h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Menu</h3></div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {CATEGORY_ORDER.map((cat) => (
                <div key={cat}><h4 className="text-[10px] font-semibold text-gray-400 uppercase px-1 pb-1">{cat}</h4>
                  {liveMenu.filter((i: any) => i.category === cat).map((item: any) => (
                    <button key={item.id} onClick={() => handleAddToCart({ id: item.id, name: item.name, price: item.price, category: item.category })} className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-indigo-50 transition-colors flex items-center justify-between group"><span className="text-sm font-medium text-gray-700 truncate">{item.name}</span><span className="text-sm font-semibold text-gray-800 group-hover:text-indigo-600 ml-2">${parseFloat(String(item.price)).toFixed(2)}</span></button>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-gray-200 flex flex-col" style={{ maxHeight: '40%' }}>
            <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between"><h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Cart ({cart.reduce((s, i) => s + i.quantity, 0)} items)</h3>{cart.length > 0 && <button onClick={() => setCart([])} className="text-xs text-red-500 hover:text-red-700">Clear</button>}</div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {cart.length === 0 ? <p className="text-xs text-gray-400 text-center py-4">Tap a menu item to add it</p> : cart.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm py-1 border-b border-gray-50 pb-1"><div className="flex items-center space-x-2"><button onClick={() => handleUpdateQty(idx, item.quantity - 1)} className="w-5 h-5 rounded-full border border-gray-300 text-xs text-gray-500 hover:bg-gray-100">−</button><span className="w-5 text-center text-xs font-medium">{item.quantity}</span><button onClick={() => handleUpdateQty(idx, item.quantity + 1)} className="w-5 h-5 rounded-full border border-gray-300 text-xs text-gray-500 hover:bg-gray-100">+</button><span className="text-gray-700 truncate max-w-[100px] md:max-w-[140px]">{item.menuItemName}</span></div><div className="flex items-center space-x-2"><span className="text-gray-800 font-medium">${(item.unitPrice * item.quantity).toFixed(2)}</span><button onClick={() => handleRemoveItem(idx)} className="text-red-400 hover:text-red-600 text-xs">✕</button></div></div>
              ))}
            </div>
            {cart.length > 0 && (
              <div className="border-t border-gray-200 px-4 py-3 bg-gray-50 space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>${cartSubtotal.toFixed(2)}</span></div>
                <div className="flex justify-between text-gray-600"><span>Tax (7%)</span><span>${tax.toFixed(2)}</span></div>
                <div className="flex justify-between text-base font-bold text-gray-800 pt-1 border-t border-gray-200"><span>Total</span><span>${total.toFixed(2)}</span></div>
                <button onClick={handlePlaceOrder} className="w-full mt-2 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors">Place Order • ${total.toFixed(2)}</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile overlay backdrop */}
      {selectedTable && sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={() => { setSelectedTable(null); setSidebarOpen(false); }} />
      )}
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-5 py-2.5 rounded-full text-sm shadow-lg z-50">{toast}</div>}
    </div>
  );
}