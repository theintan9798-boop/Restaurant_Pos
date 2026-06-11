'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useRealtimePOS } from '../SocketProvider';
import { useAuth } from '../AuthProvider';

const API_URL = 'http://localhost:4000';

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-red-100 text-red-700',
  cooking: 'bg-amber-100 text-amber-700',
  ready: 'bg-emerald-100 text-emerald-700',
  served: 'bg-blue-100 text-blue-700',
  paid: 'bg-green-100 text-green-700',
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
// SVG Area Chart Component — renders from data array
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
    return <div className="h-44 flex items-center justify-center text-gray-400 text-sm">No revenue data yet</div>;
  }

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto">
      {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
        const y = PADDING.top + chartH * (1 - frac);
        return (
          <g key={i}>
            <line x1={PADDING.left} y1={y} x2={WIDTH - PADDING.right} y2={y} stroke="#e5e7eb" strokeWidth="1" />
            <text x={PADDING.left - 8} y={y + 3} textAnchor="end" className="text-[10px] fill-gray-400">
              ${Math.round((points as any).yMax * frac)}
            </text>
          </g>
        );
      })}
      <path d={(points as any).area} fill="rgba(99, 102, 241, 0.12)" />
      <path d={(points as any).path} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {(points as any).pts?.map((p: { x: number; y: number }, i: number) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4" fill="#6366f1" stroke="white" strokeWidth="2" />
          <text x={p.x} y={p.y - 10} textAnchor="middle" className="text-[10px] fill-gray-600 font-medium">
            ${(points as any).revenues[i].toFixed(0)}
          </text>
        </g>
      ))}
      {(points as any).labels?.map((label: string, i: number) => (
        <text key={i} x={PADDING.left + i * (points as any).stepX} y={HEIGHT - 5} textAnchor="middle" className="text-[10px] fill-gray-400">
          {label}
        </text>
      ))}
    </svg>
  );
}

// ============================================================
// Modal Component for Add/Edit menu items
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">{editItem ? 'Edit Menu Item' : 'Add New Menu Item'}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Item Name</label><input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" placeholder="e.g. Spaghetti Bolognese" required /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Price ($)</label><input type="number" step="0.01" min="0" value={price} onChange={e => setPrice(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" placeholder="0.00" required /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Category</label><select value={categoryId} onChange={e => setCategoryId(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">{categories.map(cat => (<option key={cat.id} value={cat.id}>{cat.name}</option>))}</select></div>
          <div className="flex justify-end space-x-3 pt-2"><button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button><button type="submit" className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">{editItem ? 'Update Item' : 'Add Item'}</button></div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Modal Component for Add/Edit Staff Users
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">{editUser ? 'Edit Staff Member' : 'Add New Staff'}</h2>
        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Full Name</label><input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" placeholder="e.g. Jane Smith" required /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Email Address</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" placeholder="e.g. jane@pos.local" required /></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Role</label><select value={role} onChange={e => setRole(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none">{ROLE_OPTIONS.map(opt => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}</select></div>
          <div><label className="block text-xs font-medium text-gray-500 mb-1">Set PIN Code ({editUser ? 'leave blank to keep' : '4-6 digits for login'})</label><input type="password" maxLength={6} value={pinCode} onChange={e => setPinCode(e.target.value.replace(/\D/g, ''))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none" placeholder="e.g. 1234" /></div>
          <div className="flex justify-end space-x-3 pt-2"><button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50" disabled={saving}>Cancel</button><button type="submit" disabled={saving} className="px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed">{saving ? 'Saving...' : editUser ? 'Update Staff' : 'Add Staff'}</button></div>
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

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      <header className="bg-gray-900 text-white px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold">🔐 Admin Dashboard</h1>
          <span className="text-gray-400 text-sm">Full Access</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isConnected ? 'bg-emerald-600' : 'bg-red-600'}`}>{isConnected ? '🟢 Live' : '🔴 Offline'}</span>
        </div>
        <div className="flex items-center space-x-4 text-sm">
          <span className="text-gray-400 text-xs">{user?.name || 'Admin'}</span>
          <button onClick={logout} className="text-gray-400 hover:text-white px-3 py-1 rounded border border-gray-600 hover:border-gray-400 text-xs" title="Lock / Switch User">🔒 Lock</button>
        </div>
      </header>
      <div className="flex bg-white border-b border-gray-200 px-6 flex-shrink-0">
        {(['dashboard', 'orders', 'menu', 'users'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`py-3 px-5 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{tab.charAt(0).toUpperCase() + tab.slice(1)}</button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-6">
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-4 gap-4">
              {[{ label: 'Today Revenue', value: `$${kpis.revenue}`, change: 'live', color: 'text-emerald-600' },{ label: 'Orders Today', value: String(kpis.orderCount), change: 'live', color: 'text-emerald-600' },{ label: 'Avg Order Value', value: `$${kpis.avgOrder}`, change: 'live', color: 'text-emerald-600' },{ label: 'Active Tables', value: `${kpis.activeTables}/${kpis.totalTables}`, change: `${Math.round((kpis.activeTables / kpis.totalTables) * 100)}%`, color: 'text-blue-600' }].map((kpi, i) => (
                <div key={i} className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm"><p className="text-xs text-gray-500 uppercase tracking-wider">{kpi.label}</p><p className="text-2xl font-bold text-gray-800 mt-1">{kpi.value}</p><p className={`text-xs font-medium mt-0.5 ${kpi.color}`}>{kpi.change === 'live' ? '🔄 Real-time' : kpi.change}</p></div>
              ))}
            </div>
            <div className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm"><div className="flex items-center justify-between mb-3"><h2 className="text-sm font-semibold text-gray-700">Revenue — Last 7 Days</h2><span className="text-xs text-gray-400">{revenue7Days.length > 0 ? `${revenue7Days.reduce((s, d) => s + d.orders, 0)} orders` : 'No data'}</span></div><RevenueAreaChart data={revenue7Days} /></div>
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5"><h2 className="text-sm font-semibold text-gray-700 mb-3">Top Selling Items</h2>{topItems.length > 0 ? topItems.slice(0, 5).map((item, i) => (<div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"><div className="flex items-center space-x-3"><span className={`text-lg font-bold w-6 ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-gray-400' : i === 2 ? 'text-amber-700' : 'text-gray-300'}`}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}</span><div><p className="text-sm font-medium text-gray-700">{item.name}</p><p className="text-xs text-gray-400">{item.sold} sold</p></div></div><span className="text-sm font-semibold text-gray-800">${item.revenue.toFixed(2)}</span></div>)) : <p className="text-sm text-gray-400 text-center py-8">No sales data yet — place some orders!</p>}</div>
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5"><h2 className="text-sm font-semibold text-gray-700 mb-3">Live Orders</h2><div className="space-y-2 max-h-64 overflow-y-auto">{recentOrders.length > 0 ? recentOrders.slice(0, 15).map((order, i) => (<div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"><div><div className="flex items-center space-x-2"><span className="text-sm font-semibold text-gray-700">#{order.id.substring(0, 6)}</span><span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">{order.table}</span><span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-500'}`}>{order.status}</span></div><p className="text-xs text-gray-400 mt-0.5 truncate max-w-[220px]">{order.items}</p></div><div className="text-right"><p className="text-sm font-semibold text-gray-800">${order.total.toFixed(2)}</p><p className="text-[10px] text-gray-400">{order.time}</p></div></div>)) : <p className="text-sm text-gray-400 text-center py-8">No orders yet</p>}</div></div>
            </div>
          </div>
        )}
        {activeTab === 'orders' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6"><h2 className="text-lg font-semibold text-gray-800 mb-4">All Orders (Live)</h2><table className="w-full text-sm"><thead><tr className="text-left text-xs text-gray-400 uppercase border-b border-gray-100"><th className="py-2 pr-4">Order</th><th className="py-2 pr-4">Table</th><th className="py-2 pr-4">Items</th><th className="py-2 pr-4">Total</th><th className="py-2 pr-4">Status</th><th className="py-2">Time</th></tr></thead><tbody>{recentOrders.map((o, i) => (<tr key={i} className="border-b border-gray-50"><td className="py-2 font-medium">#{o.id.substring(0, 6)}</td><td className="py-2 text-gray-500">{o.table}</td><td className="py-2 text-gray-600 truncate max-w-[200px]">{o.items}</td><td className="py-2 font-medium">${o.total.toFixed(2)}</td><td className="py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[o.status] || 'bg-gray-100 text-gray-500'}`}>{o.status}</span></td><td className="py-2 text-gray-400">{o.time}</td></tr>))}</tbody></table></div>
        )}
        {activeTab === 'menu' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6"><div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold text-gray-800">Menu Management</h2><button onClick={() => { setEditingItem(null); setModalOpen(true); }} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors">+ Add New Item</button></div><p className="text-xs text-gray-400 mb-4">{localMenu.length} items total</p><div className="grid grid-cols-2 gap-4">{localMenu.length > 0 ? localMenu.sort((a: any, b: any) => (a.category_name || a.category || '').localeCompare(b.category_name || b.category || '')).map((item: any) => (<div key={item.id} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:border-gray-200 transition-colors"><div className="flex items-center space-x-3"><div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-sm">{item.name[0]}</div><div><p className="text-sm font-medium text-gray-700">{item.name}</p><p className="text-xs text-gray-400">{item.category_name || item.category || 'Uncategorized'} — ${parseFloat(item.price).toFixed(2)}</p></div></div><div className="flex items-center space-x-2"><button onClick={() => { setEditingItem(item); setModalOpen(true); }} className="text-xs text-gray-400 hover:text-indigo-600 px-2 py-1 rounded border border-gray-200 hover:border-indigo-300">Edit</button><button onClick={() => handleDelete(item.id, item.name)} className="text-xs text-gray-400 hover:text-red-600 px-2 py-1 rounded border border-gray-200 hover:border-red-300">Delete</button></div></div>)) : <div className="col-span-2 text-center py-12 text-gray-400 text-sm">No menu items yet — click "Add New Item" to create one.</div>}</div></div>
        )}
        {activeTab === 'users' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6"><div className="flex items-center justify-between mb-4"><div><h2 className="text-lg font-semibold text-gray-800">User Management (RBAC)</h2><p className="text-xs text-gray-400 mt-0.5">{users.length} staff members</p></div><button onClick={() => { setEditingUser(null); setUserModalOpen(true); }} className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors">+ Add New Staff</button></div>{usersLoading ? <div className="text-center py-12 text-gray-400 text-sm">Loading users...</div> : users.length === 0 ? <div className="text-center py-12 text-gray-400 text-sm">No users found — click "+ Add New Staff" to create one.</div> : <table className="w-full text-sm"><thead><tr className="text-left text-xs text-gray-400 uppercase border-b border-gray-100"><th className="py-2 pr-4">Name</th><th className="py-2 pr-4">Email</th><th className="py-2 pr-4">Role</th><th className="py-2 pr-4">Status</th><th className="py-2">Actions</th></tr></thead><tbody>{users.map((u) => (<tr key={u.id} className="border-b border-gray-50"><td className="py-2 font-medium text-gray-700">{u.name}</td><td className="py-2 text-gray-500">{u.email}</td><td className="py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : u.role === 'waiter' ? 'bg-indigo-100 text-indigo-700' : u.role === 'kitchen_staff' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{ROLE_LABELS[u.role] || u.role}</span></td><td className="py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${u.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{u.isActive ? 'Active' : 'Revoked'}</span></td><td className="py-2"><button onClick={() => { setEditingUser(u); setUserModalOpen(true); }} className="text-xs text-gray-400 hover:text-indigo-600 mr-2">Edit</button>{u.isActive && <button onClick={() => handleRevokeUser(u)} className="text-xs text-gray-400 hover:text-red-600">Revoke</button>}</td></tr>))}</tbody></table>}</div>
        )}
      </div>
      <MenuFormModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditingItem(null); }} onSave={editingItem ? handleEdit : handleAdd} editItem={editingItem} categories={state.categories} />
      <UserFormModal isOpen={userModalOpen} onClose={() => { setUserModalOpen(false); setEditingUser(null); }} onSave={editingUser ? handleEditUser : handleAddUser} editUser={editingUser} />
    </div>
  );
}