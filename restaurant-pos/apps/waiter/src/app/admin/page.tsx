'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useRealtimePOS } from '../SocketProvider';
import { useAuth } from '../AuthProvider';

const API_URL = 'http://localhost:4000';

// Translucent status colors for dark glass surfaces
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-red-500/15 text-red-300',
  cooking: 'bg-amber-500/15 text-amber-300',
  ready: 'bg-emerald-500/15 text-emerald-300',
  served: 'bg-sky-500/15 text-sky-300',
  paid: 'bg-emerald-500/15 text-emerald-300',
  cancelled: 'bg-slate-500/15 text-slate-400',
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  cashier: 'Cashier',
  waiter: 'Waiter',
  kitchen_staff: 'Kitchen Staff',
};

const ROLE_OPTIONS = [
  { value: 'waiter', label: 'Waiter' },
  { value: 'kitchen_staff', label: 'Kitchen Staff' },
  { value: 'cashier', label: 'Cashier' },
  { value: 'admin', label: 'Admin' },
];

interface UserData {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
}

// ============================================================
// SVG Area Chart — recolored for dark glass (violet accent)
// ============================================================
function RevenueAreaChart({ data }: { data: Array<{ day: string; revenue: number; orders: number }> }) {
  const WIDTH = 700;
  const HEIGHT = 200;
  const PADDING = { top: 10, right: 10, bottom: 25, left: 50 };
  const chartW = WIDTH - PADDING.left - PADDING.right;
  const chartH = HEIGHT - PADDING.top - PADDING.bottom;

  const points = useMemo(() => {
    if (!data || data.length === 0) return { path: '', area: '', yMax: 100, labels: [] as string[] };
    const revenues = data.map(d => d.revenue);
    const yMax = Math.max(...revenues, 100);
    const yMin = 0;
    const labels = data.map(d => d.day);

    const stepX = chartW / Math.max(data.length - 1, 1);
    const scaleY = (val: number) => PADDING.top + chartH - ((val - yMin) / (yMax - yMin)) * chartH;

    const pts = data.map((d, i) => ({
      x: PADDING.left + i * stepX,
      y: scaleY(d.revenue),
    }));

    const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
    const areaD = `${pathD} L${pts[pts.length - 1].x},${HEIGHT - PADDING.bottom} L${pts[0].x},${HEIGHT - PADDING.bottom} Z`;

    return { path: pathD, area: areaD, yMax, labels, pts, stepX, revenues };
  }, [data, chartW, chartH]);

  if (!data || data.length === 0) {
    return <div className="h-44 flex items-center justify-center text-slate-500 text-sm">No revenue data yet</div>;
  }

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto">
      {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
        const y = PADDING.top + chartH * (1 - frac);
        return (
          <g key={i}>
            <line x1={PADDING.left} y1={y} x2={WIDTH - PADDING.right} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
            <text x={PADDING.left - 8} y={y + 3} textAnchor="end" className="text-[10px] fill-slate-500">
              ${Math.round((points as any).yMax * frac)}
            </text>
          </g>
        );
      })}
      <path d={(points as any).area} fill="rgba(139, 92, 246, 0.15)" />
      <path d={(points as any).path} fill="none" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {(points as any).pts?.map((p: { x: number; y: number }, i: number) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4" fill="#8b5cf6" stroke="#0f172a" strokeWidth="2" />
          <text x={p.x} y={p.y - 10} textAnchor="middle" className="text-[10px] fill-slate-300 font-medium">
            ${(points as any).revenues[i].toFixed(0)}
          </text>
        </g>
      ))}
      {(points as any).labels?.map((label: string, i: number) => (
        <text key={i} x={PADDING.left + i * (points as any).stepX} y={HEIGHT - 5} textAnchor="middle" className="text-[10px] fill-slate-500">
          {label}
        </text>
      ))}
    </svg>
  );
}

// ============================================================
// Glass Modal for Add/Edit menu items
// ============================================================
function MenuFormModal({ isOpen, onClose, onSave, editItem, categories }: {
  isOpen: boolean; onClose: () => void;
  onSave: (data: { name: string; price: number; categoryId: string }) => void;
  editItem: { id: string; name: string; price: number; category_id: string } | null;
  categories: Array<{ id: string; name: string }>;
}) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState('');
  useEffect(() => {
    if (editItem) { setName(editItem.name); setPrice(String(editItem.price)); setCategoryId(editItem.category_id); }
    else { setName(''); setPrice(''); setCategoryId(categories[0]?.id || ''); }
  }, [editItem, categories]);
  if (!isOpen) return null;
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); if (!name.trim() || !price || !categoryId) return; onSave({ name: name.trim(), price: parseFloat(price), categoryId }); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="glass-card w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-white mb-4">{editItem ? 'Edit Menu Item' : 'Add New Menu Item'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-xs font-medium text-slate-400 mb-1">Item Name</label><input type="text" value={name} onChange={e => setName(e.target.value)} className="glass-input" placeholder="e.g. Spaghetti Bolognese" required /></div>
          <div><label className="block text-xs font-medium text-slate-400 mb-1">Price ($)</label><input type="number" step="0.01" min="0" value={price} onChange={e => setPrice(e.target.value)} className="glass-input" placeholder="0.00" required /></div>
          <div><label className="block text-xs font-medium text-slate-400 mb-1">Category</label><select value={categoryId} onChange={e => setCategoryId(e.target.value)} className="glass-input">{categories.map(cat => (<option key={cat.id} value={cat.id} className="bg-slate-900">{cat.name}</option>))}</select></div>
          <div className="flex justify-end space-x-3 pt-2"><button type="button" onClick={onClose} className="btn-ghost px-4 py-2 text-sm">Cancel</button><button type="submit" className="btn-primary px-4 py-2 text-sm">{editItem ? 'Update Item' : 'Add Item'}</button></div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Glass Modal for Add/Edit Staff Users
// ============================================================
function UserFormModal({ isOpen, onClose, onSave, editUser }: {
  isOpen: boolean; onClose: () => void;
  onSave: (data: { name: string; email: string; role: string; pinCode?: string }) => Promise<void>;
  editUser: UserData | null;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('waiter');
  const [pinCode, setPinCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (editUser) { setName(editUser.name); setEmail(editUser.email); setRole(editUser.role); setPinCode(''); setError(''); }
    else { setName(''); setEmail(''); setRole('waiter'); setPinCode(''); setError(''); }
  }, [editUser, isOpen]);
  if (!isOpen) return null;
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!name.trim() || !email.trim() || !role) return;
    setSaving(true); setError('');
    try {
      const payload: any = { name: name.trim(), email: email.trim(), role };
      if (pinCode && pinCode.length >= 4) payload.pinCode = pinCode;
      await onSave(payload);
    } catch (err: any) { setError(err.message || 'Failed to save user'); }
    finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="glass-card w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-white mb-4">{editUser ? 'Edit Staff Member' : 'Add New Staff'}</h2>
        {error && <div className="mb-4 p-3 glass-card bg-red-500/10 border-red-500/30 text-sm text-red-300">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-xs font-medium text-slate-400 mb-1">Full Name</label><input type="text" value={name} onChange={e => setName(e.target.value)} className="glass-input" placeholder="e.g. Jane Smith" required /></div>
          <div><label className="block text-xs font-medium text-slate-400 mb-1">Email Address</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} className="glass-input" placeholder="e.g. jane@pos.local" required /></div>
          <div><label className="block text-xs font-medium text-slate-400 mb-1">Role</label><select value={role} onChange={e => setRole(e.target.value)} className="glass-input">{ROLE_OPTIONS.map(opt => (<option key={opt.value} value={opt.value} className="bg-slate-900">{opt.label}</option>))}</select></div>
          <div><label className="block text-xs font-medium text-slate-400 mb-1">Set PIN Code ({editUser ? 'leave blank to keep' : '4-6 digits for login'})</label><input type="password" maxLength={6} value={pinCode} onChange={e => setPinCode(e.target.value.replace(/\D/g, ''))} className="glass-input" placeholder="e.g. 1234" /></div>
          <div className="flex justify-end space-x-3 pt-2"><button type="button" onClick={onClose} className="btn-ghost px-4 py-2 text-sm" disabled={saving}>Cancel</button><button type="submit" disabled={saving} className="btn-primary px-4 py-2 text-sm">{saving ? 'Saving…' : editUser ? 'Update Staff' : 'Add Staff'}</button></div>
        </form>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { isConnected, state } = useRealtimePOS();
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'orders' | 'menu' | 'users'>('dashboard');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [localMenu, setLocalMenu] = useState<any[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);

  useEffect(() => { if (state.menuItems.length > 0) setLocalMenu(state.menuItems); }, [state.menuItems]);

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try { const res = await fetch(`${API_URL}/api/users`); const json = await res.json(); if (json.success) setUsers(json.data); }
    catch (err) { console.error('Failed to fetch users:', err); }
    finally { setUsersLoading(false); }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleAdd = useCallback(async (data: { name: string; price: number; categoryId: string }) => {
    const res = await fetch(`${API_URL}/api/data/menu-items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const json = await res.json(); if (json.success) { setLocalMenu(prev => [...prev, json.data]); setModalOpen(false); }
  }, []);
  const handleEdit = useCallback(async (data: { name: string; price: number; categoryId: string }) => {
    if (!editingItem) return;
    const res = await fetch(`${API_URL}/api/data/menu-items/${editingItem.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const json = await res.json(); if (json.success) { setLocalMenu(prev => prev.map(i => i.id === editingItem.id ? json.data : i)); setEditingItem(null); setModalOpen(false); }
  }, [editingItem]);
  const handleDelete = useCallback(async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`${API_URL}/api/data/menu-items/${id}`, { method: 'DELETE' }); const json = await res.json();
    if (json.success) setLocalMenu(prev => prev.filter(i => i.id !== id));
  }, []);

  const handleAddUser = useCallback(async (data: { name: string; email: string; role: string; pinCode?: string }) => {
    const res = await fetch(`${API_URL}/api/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const json = await res.json(); if (!json.success) throw new Error(json.error || 'Failed to create user');
    setUsers(prev => [json.data, ...prev]); setUserModalOpen(false);
  }, []);
  const handleEditUser = useCallback(async (data: { name: string; email: string; role: string; pinCode?: string }) => {
    if (!editingUser) return;
    const res = await fetch(`${API_URL}/api/users/${editingUser.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const json = await res.json(); if (!json.success) throw new Error(json.error || 'Failed to update user');
    setUsers(prev => prev.map(u => u.id === editingUser.id ? json.data : u)); setEditingUser(null); setUserModalOpen(false);
  }, [editingUser]);
  const handleRevokeUser = useCallback(async (user: UserData) => {
    if (!window.confirm(`Revoke access for "${user.name}" (${user.email})?`)) return;
    const res = await fetch(`${API_URL}/api/users/${user.id}`, { method: 'DELETE' }); const json = await res.json();
    if (json.success) setUsers(prev => prev.map(u => u.id === user.id ? { ...u, isActive: false } : u));
  }, []);

  const { salesStats, recentOrders, tableStatuses, topItems, revenue7Days } = state;
  const kpis = useMemo(() => ({
    revenue: salesStats.totalRevenue.toFixed(2), orderCount: salesStats.totalOrders,
    avgOrder: salesStats.totalOrders > 0 ? (salesStats.totalRevenue / salesStats.totalOrders).toFixed(2) : '0.00',
    activeTables: Object.values(tableStatuses).filter(s => s !== 'available').length,
    totalTables: Object.keys(tableStatuses).length || 11,
  }), [salesStats, tableStatuses]);

  const TABS: Array<'dashboard' | 'orders' | 'menu' | 'users'> = ['dashboard', 'orders', 'menu', 'users'];
  const kpiCards = [
    { label: 'Today Revenue', value: `$${kpis.revenue}`, sub: '🔄 Real-time', icon: '💰', accent: 'text-emerald-300' },
    { label: 'Orders Today', value: String(kpis.orderCount), sub: '🔄 Real-time', icon: '📦', accent: 'text-brand-300' },
    { label: 'Avg Order Value', value: `$${kpis.avgOrder}`, sub: '🔄 Real-time', icon: '📊', accent: 'text-sky-300' },
    { label: 'Active Tables', value: `${kpis.activeTables}/${kpis.totalTables}`, sub: `${Math.round((kpis.activeTables / kpis.totalTables) * 100)}%`, icon: '🪑', accent: 'text-amber-300' },
  ];

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <header className="bg-white/5 backdrop-blur-xl border-b border-white/10 px-4 md:px-6 py-3 flex flex-wrap items-center justify-between flex-shrink-0 gap-2">
        <div className="flex items-center space-x-3 flex-wrap">
          <h1 className="text-lg md:text-xl font-bold text-white">🔐 Admin</h1>
          <span className="hidden sm:inline text-slate-400 text-sm">Full Access</span>
          <span className={`pill ${isConnected ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>{isConnected ? '🟢 Live' : '🔴 Offline'}</span>
        </div>
        <div className="flex items-center space-x-3 text-sm">
          <span className="text-slate-400 text-xs hidden sm:inline">{user?.name || 'Admin'}</span>
          <button onClick={logout} className="btn-ghost px-3 py-1 text-xs">🔒 Lock</button>
        </div>
      </header>

      {/* Tabs — pill grid on mobile, row on desktop */}
      <div className="bg-white/[0.02] border-b border-white/10 px-4 md:px-6 flex-shrink-0 py-2">
        <div className="grid grid-cols-4 md:flex md:space-x-1 gap-1">
          {TABS.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`px-3 md:px-5 py-2 text-sm font-medium rounded-xl transition-all whitespace-nowrap ${activeTab === tab ? 'bg-brand-500/15 text-brand-300 shadow-glow' : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'}`}>{tab.charAt(0).toUpperCase() + tab.slice(1)}</button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6">
        {/* DASHBOARD TAB */}
        {activeTab === 'dashboard' && (
          <div className="space-y-4 md:space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              {kpiCards.map((kpi, i) => (
                <div key={i} className="glass-card p-4 md:p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-400 uppercase tracking-wider">{kpi.label}</p>
                    <span className="text-lg opacity-80">{kpi.icon}</span>
                  </div>
                  <p className="text-xl md:text-2xl font-bold text-white mt-2">{kpi.value}</p>
                  <p className={`text-xs font-medium mt-0.5 ${kpi.accent}`}>{kpi.sub}</p>
                </div>
              ))}
            </div>
            <div className="glass-card p-4 md:p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-200">Revenue — Last 7 Days</h2>
                <span className="text-xs text-slate-500">{revenue7Days.length > 0 ? `${revenue7Days.reduce((s, d) => s + d.orders, 0)} orders` : 'No data'}</span>
              </div>
              <RevenueAreaChart data={revenue7Days} />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
              <div className="glass-card p-5">
                <h2 className="text-sm font-semibold text-slate-200 mb-3">Top Selling Items</h2>
                {topItems.length > 0 ? topItems.slice(0, 5).map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                    <div className="flex items-center space-x-3">
                      <span className="text-lg font-bold w-6">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="text-slate-500">{i + 1}</span>}</span>
                      <div><p className="text-sm font-medium text-slate-200">{item.name}</p><p className="text-xs text-slate-500">{item.sold} sold</p></div>
                    </div>
                    <span className="text-sm font-semibold text-white">${item.revenue.toFixed(2)}</span>
                  </div>
                )) : <p className="text-sm text-slate-500 text-center py-8">No sales data yet — place some orders!</p>}
              </div>
              <div className="glass-card p-5">
                <h2 className="text-sm font-semibold text-slate-200 mb-3">Live Orders</h2>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {recentOrders.length > 0 ? recentOrders.slice(0, 15).map((order, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                      <div className="min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-semibold text-slate-200">#{order.id.substring(0, 6)}</span>
                          <span className="pill bg-white/10 text-slate-300">{order.table}</span>
                          <span className={`pill ${STATUS_COLORS[order.status] || 'bg-slate-500/15 text-slate-400'}`}>{order.status}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[220px]">{order.items}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-semibold text-white">${order.total.toFixed(2)}</p>
                        <p className="text-[10px] text-slate-500">{order.time}</p>
                      </div>
                    </div>
                  )) : <p className="text-sm text-slate-500 text-center py-8">No orders yet</p>}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ORDERS TAB — table on desktop, stacked cards on mobile */}
        {activeTab === 'orders' && (
          <div className="glass-card p-4 md:p-6">
            <h2 className="text-lg font-semibold text-white mb-4">All Orders (Live)</h2>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead><tr className="text-left text-xs text-slate-500 uppercase border-b border-white/10"><th className="py-2 pr-4">Order</th><th className="py-2 pr-4">Table</th><th className="py-2 pr-4">Items</th><th className="py-2 pr-4">Total</th><th className="py-2 pr-4">Status</th><th className="py-2">Time</th></tr></thead>
                <tbody>{recentOrders.map((o, i) => (
                  <tr key={i} className="border-b border-white/5"><td className="py-2 font-medium text-white">#{o.id.substring(0, 6)}</td><td className="py-2 text-slate-400">{o.table}</td><td className="py-2 text-slate-300 truncate max-w-[200px]">{o.items}</td><td className="py-2 font-medium text-white">${o.total.toFixed(2)}</td><td className="py-2"><span className={`pill ${STATUS_COLORS[o.status] || 'bg-slate-500/15 text-slate-400'}`}>{o.status}</span></td><td className="py-2 text-slate-500">{o.time}</td></tr>
                ))}</tbody>
              </table>
            </div>
            {/* Mobile stacked cards */}
            <div className="md:hidden space-y-3">
              {recentOrders.map((o, i) => (
                <div key={i} className="border border-white/10 rounded-xl p-3 bg-white/[0.02]">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-white">#{o.id.substring(0, 6)}</span>
                    <span className={`pill ${STATUS_COLORS[o.status] || 'bg-slate-500/15 text-slate-400'}`}>{o.status}</span>
                  </div>
                  <p className="text-xs text-slate-400 truncate mb-2">{o.items}</p>
                  <div className="flex items-center justify-between text-xs"><span className="text-slate-500">Table {o.table} · {o.time}</span><span className="font-semibold text-white">${o.total.toFixed(2)}</span></div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MENU TAB */}
        {activeTab === 'menu' && (
          <div className="glass-card p-4 md:p-6">
            <div className="flex flex-wrap items-center justify-between mb-4 gap-2">
              <h2 className="text-lg font-semibold text-white">Menu Management</h2>
              <button onClick={() => { setEditingItem(null); setModalOpen(true); }} className="btn-primary px-4 py-2 text-sm">+ Add New Item</button>
            </div>
            <p className="text-xs text-slate-500 mb-4">{localMenu.length} items total</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {localMenu.length > 0 ? localMenu.sort((a: any, b: any) => (a.category_name || a.category || '').localeCompare(b.category_name || b.category || '')).map((item: any) => (
                <div key={item.id} className="flex items-center justify-between p-3 border border-white/10 rounded-xl hover:bg-white/[0.03] transition-colors">
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-brand-500/15 flex items-center justify-center text-brand-300 font-bold text-sm flex-shrink-0">{item.name[0]}</div>
                    <div className="min-w-0"><p className="text-sm font-medium text-slate-200 truncate">{item.name}</p><p className="text-xs text-slate-500 truncate">{item.category_name || item.category || 'Uncategorized'} — ${parseFloat(item.price).toFixed(2)}</p></div>
                  </div>
                  <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
                    <button onClick={() => { setEditingItem(item); setModalOpen(true); }} className="text-xs text-slate-400 hover:text-brand-300 px-2 py-1 rounded-lg border border-white/10 hover:border-brand-500/30">Edit</button>
                    <button onClick={() => handleDelete(item.id, item.name)} className="text-xs text-slate-400 hover:text-red-300 px-2 py-1 rounded-lg border border-white/10 hover:border-red-500/30">Delete</button>
                  </div>
                </div>
              )) : <div className="col-span-full text-center py-12 text-slate-500 text-sm">No menu items yet — click &quot;Add New Item&quot; to create one.</div>}
            </div>
          </div>
        )}

        {/* USERS TAB — table on desktop, cards on mobile */}
        {activeTab === 'users' && (
          <div className="glass-card p-4 md:p-6">
            <div className="flex flex-wrap items-center justify-between mb-4 gap-2">
              <div><h2 className="text-lg font-semibold text-white">User Management (RBAC)</h2><p className="text-xs text-slate-500 mt-0.5">{users.length} staff members</p></div>
              <button onClick={() => { setEditingUser(null); setUserModalOpen(true); }} className="btn-primary px-4 py-2 text-sm">+ Add New Staff</button>
            </div>
            {usersLoading ? <div className="text-center py-12 text-slate-500 text-sm">Loading users…</div> : users.length === 0 ? <div className="text-center py-12 text-slate-500 text-sm">No users found — click &quot;+ Add New Staff&quot; to create one.</div> : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm min-w-[600px]">
                    <thead><tr className="text-left text-xs text-slate-500 uppercase border-b border-white/10"><th className="py-2 pr-4">Name</th><th className="py-2 pr-4">Email</th><th className="py-2 pr-4">Role</th><th className="py-2 pr-4">Status</th><th className="py-2">Actions</th></tr></thead>
                    <tbody>{users.map((u) => (
                      <tr key={u.id} className="border-b border-white/5">
                        <td className="py-2 font-medium text-white">{u.name}</td>
                        <td className="py-2 text-slate-400">{u.email}</td>
                        <td className="py-2"><span className={`pill ${u.role === 'admin' ? 'bg-purple-500/15 text-purple-300' : u.role === 'waiter' ? 'bg-brand-500/15 text-brand-300' : u.role === 'kitchen_staff' ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{ROLE_LABELS[u.role] || u.role}</span></td>
                        <td className="py-2"><span className={`pill ${u.isActive ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>{u.isActive ? 'Active' : 'Revoked'}</span></td>
                        <td className="py-2"><button onClick={() => { setEditingUser(u); setUserModalOpen(true); }} className="text-xs text-slate-400 hover:text-brand-300 mr-2">Edit</button>{u.isActive && <button onClick={() => handleRevokeUser(u)} className="text-xs text-slate-400 hover:text-red-300">Revoke</button>}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                {/* Mobile stacked cards */}
                <div className="md:hidden space-y-3">
                  {users.map((u) => (
                    <div key={u.id} className="border border-white/10 rounded-xl p-3 bg-white/[0.02]">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-semibold text-white">{u.name}</span>
                        <span className={`pill ${u.isActive ? 'bg-emerald-500/15 text-emerald-300' : 'bg-red-500/15 text-red-300'}`}>{u.isActive ? 'Active' : 'Revoked'}</span>
                      </div>
                      <p className="text-xs text-slate-400 mb-2">{u.email}</p>
                      <div className="flex items-center justify-between">
                        <span className={`pill ${u.role === 'admin' ? 'bg-purple-500/15 text-purple-300' : u.role === 'waiter' ? 'bg-brand-500/15 text-brand-300' : u.role === 'kitchen_staff' ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>{ROLE_LABELS[u.role] || u.role}</span>
                        <div><button onClick={() => { setEditingUser(u); setUserModalOpen(true); }} className="text-xs text-slate-400 hover:text-brand-300 mr-3">Edit</button>{u.isActive && <button onClick={() => handleRevokeUser(u)} className="text-xs text-slate-400 hover:text-red-300">Revoke</button>}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      <MenuFormModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditingItem(null); }} onSave={editingItem ? handleEdit : handleAdd} editItem={editingItem} categories={state.categories} />
      <UserFormModal isOpen={userModalOpen} onClose={() => { setUserModalOpen(false); setEditingUser(null); }} onSave={editingUser ? handleEditUser : handleAddUser} editUser={editingUser} />
    </div>
  );
}
