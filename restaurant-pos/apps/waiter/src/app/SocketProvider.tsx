'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

export interface TicketItem {
  ticketId: string; orderId: string; menuItemName: string;
  quantity: number; status: string; notes?: string;
  tableNumber: string; station: string; createdAt: string;
}

export interface OrderRecord {
  id: string; table: string; tableId: string;
  items: string; total: number; time: string; status: string;
}

const POSContext = createContext<any>(null);

export function useRealtimePOS() {
  const ctx = useContext(POSContext);
  if (!ctx) throw new Error('useRealtimePOS must be used within <SocketProvider>');
  return ctx;
}

const API_URL = 'http://localhost:4000';
const SOCKET_URL = 'http://localhost:4000';

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [state, setState] = useState<any>({
    kitchenTickets: [],
    tableStatuses: { t1:'available',t2:'available',t3:'available',t4:'available',t5:'available',t6:'available',t7:'available',t8:'available',t9:'available',t10:'available',t11:'available' },
    salesStats: { totalRevenue:0, totalOrders:0, avgOrderValue:0, lastUpdate:'' },
    recentOrders:[], topItems:[], revenue7Days:[], menuItems:[], categories:[],
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch ALL orders for Admin history, filter kitchen tickets in JS
        const [statsRes, ordersRes, topRes, revenueRes, menuRes, catRes] = await Promise.all([
          fetch(`${API_URL}/api/data/stats`).then(r=>r.json()),
          fetch(`${API_URL}/api/data/orders`).then(r=>r.json()),
          fetch(`${API_URL}/api/data/top-items`).then(r=>r.json()),
          fetch(`${API_URL}/api/data/revenue-7days`).then(r=>r.json()),
          fetch(`${API_URL}/api/data/menu`).then(r=>r.json()),
          fetch(`${API_URL}/api/data/categories`).then(r=>r.json()),
        ]);
        const stats = statsRes?.data || { totalRevenue:0, totalOrders:0, avgOrderValue:0 };

        // Admin recentOrders: include all statuses (served, paid, etc.)
        const orders: OrderRecord[] = (ordersRes?.data || []).map((o: any) => ({
          id: o.id, table: o.tableNumber || o.tableId || '?', tableId: o.tableId || '',
          items: (o.items || []).map((i: any) => `${i.name} x${i.quantity || 1}`).join(', '),
          total: o.grandTotal || 0, time: o.createdAt ? new Date(o.createdAt).toLocaleTimeString() : 'DB', status: o.status || 'pending',
        }));

        // Kitchen tickets: filter in JS — skip terminal statuses
        const dbTickets: any[] = [];
        (ordersRes?.data || []).forEach((o: any) => {
          if (o.status === 'paid' || o.status === 'cancelled' || o.status === 'served') return;
          (o.items || []).forEach((item: any, idx: number) => {
            const itemStatus = item.status || o.status || 'pending';
            if (itemStatus === 'served') return;
            dbTickets.push({ ticketId:`${o.id}_t${idx}`, orderId:o.id, menuItemName:item.name||'Item', quantity:item.quantity||1, status:itemStatus, tableNumber:o.tableNumber||o.tableId||'?', station:'main', createdAt:o.createdAt||new Date().toISOString() });
          });
        });

        setState((prev: any) => ({ ...prev,
          salesStats:{ totalRevenue:stats.totalRevenue||0, totalOrders:stats.totalOrders||0, avgOrderValue:stats.avgOrderValue||0, lastUpdate:new Date().toISOString() },
          recentOrders: orders.length>0 ? orders : prev.recentOrders,
          kitchenTickets: dbTickets.length>0 ? dbTickets : prev.kitchenTickets,
          topItems:topRes?.data||[], revenue7Days:revenueRes?.data||[], menuItems:menuRes?.data||[], categories:catRes?.data||[],
        }));
      } catch (err) { console.error('[SocketProvider] Failed to fetch initial data:', err); }
    };
    fetchData();
  }, []);

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports:['websocket','polling'], reconnection:true, reconnectionAttempts:20, reconnectionDelay:500 });
    socket.on('connect', () => { setIsConnected(true); socket.emit('room:join','room:kitchen'); socket.emit('room:join','room:waiters'); socket.emit('room:join','restaurant:00000000-0000-0000-0000-000000000001'); });
    socket.on('disconnect', () => { setIsConnected(false); });
    socket.on('order:created', (data: any) => {
      if (!data.tickets) return;
      const now = new Date().toISOString();
      setState((prev: any) => ({ ...prev,
        salesStats: { ...prev.salesStats, totalRevenue: prev.salesStats.totalRevenue + (data.total || 0), totalOrders: prev.salesStats.totalOrders + 1, avgOrderValue: prev.salesStats.totalOrders > 0 ? (prev.salesStats.totalRevenue + (data.total || 0)) / (prev.salesStats.totalOrders + 1) : (data.total || 0), lastUpdate: new Date().toISOString() },
        kitchenTickets: [...data.tickets.map((t: any) => ({ ticketId:t.ticketId, orderId:data.orderId, menuItemName:t.menuItemName, quantity:t.quantity, status:'pending', notes:t.notes, tableNumber:data.tableNumber, station:'main', createdAt:now })), ...prev.kitchenTickets],
        tableStatuses: { ...prev.tableStatuses, [data.tableId || data.tableNumber]: 'order_placed' },
        recentOrders: [{ id:data.orderId, table:data.tableNumber, tableId:data.tableId, items:data.tickets.map((t:any)=>`${t.menuItemName} x${t.quantity}`).join(', '), total:data.total, time:'Just now', status:'pending' }, ...prev.recentOrders],
      }));
      // Background refetch: analytics endpoints so KPIs update without hard refresh
      fetch(`${API_URL}/api/data/top-items`).then(r=>r.json()).then(res=>{if(res?.data) setState((prev:any)=>({...prev,topItems:res.data}));}).catch(()=>{});
      fetch(`${API_URL}/api/data/revenue-7days`).then(r=>r.json()).then(res=>{if(res?.data) setState((prev:any)=>({...prev,revenue7Days:res.data}));}).catch(()=>{});
      fetch(`${API_URL}/api/data/stats`).then(r=>r.json()).then(res=>{if(res?.data) setState((prev:any)=>({...prev,salesStats:{totalRevenue:res.data.totalRevenue||0,totalOrders:res.data.totalOrders||0,avgOrderValue:res.data.avgOrderValue||0,lastUpdate:new Date().toISOString()}}));}).catch(()=>{});
    });
    socket.on('ticket:status_changed', (data: { ticketId:string; newStatus:string }) => {
      setState((prev: any) => ({ ...prev,
        kitchenTickets: prev.kitchenTickets.map((t:any) => t.ticketId===data.ticketId ? {...t, status:data.newStatus} : t),
        recentOrders: prev.recentOrders.map((o:any) => {
          const thisTicket = prev.kitchenTickets.find((t:any) => t.ticketId===data.ticketId && t.orderId===o.id);
          if (!thisTicket) return o;
          if (data.newStatus==='cooking' && o.status==='pending') return {...o, status:'cooking'};
          if (data.newStatus==='ready') return {...o, status:'ready'};
          if (data.newStatus==='served') return {...o, status:'served'};
          return o;
        }),
      }));
    });
    socket.on('payment:completed', (data: { orderId:string; tableId:string; totalAmount:number }) => {
      setState((prev: any) => ({ ...prev,
        salesStats: { ...prev.salesStats, totalRevenue:prev.salesStats.totalRevenue+(data.totalAmount||0), totalOrders:prev.salesStats.totalOrders+1, avgOrderValue:prev.salesStats.totalOrders>0?(prev.salesStats.totalRevenue+(data.totalAmount||0))/(prev.salesStats.totalOrders+1):(data.totalAmount||0), lastUpdate:new Date().toISOString() },
        tableStatuses: { ...prev.tableStatuses, [data.tableId]:'available' },
        recentOrders: prev.recentOrders.map((o:any) => o.id===data.orderId ? {...o, status:'paid'} : o),
      }));
    });
    socket.on('table:status_changed', (data: { tableId:string; status:string }) => {
      setState((prev: any) => ({ ...prev, tableStatuses:{...prev.tableStatuses, [data.tableId]:data.status} }));
    });
    socketRef.current = socket;
    return () => { socket.disconnect(); socketRef.current = null; };
  }, []);

  const emitOrderCreated = useCallback((order: any): string => {
    const orderId = 'o'+Date.now(); const now = new Date().toISOString();
    const tickets = order.items.map((item:any, idx:number)=>({ ticketId:`${orderId}_t${idx}`, menuItemName:item.menuItemName, quantity:item.quantity, notes:item.notes }));
    fetch(`${API_URL}/api/data/save-order`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId,tableNumber:order.tableNumber,tableId:order.tableId,items:order.items,total:order.total,orderType:'dine_in'})}).catch(()=>{});
    setState((prev: any) => ({ ...prev,
      kitchenTickets: [...tickets.map((t:any)=>({ ticketId:t.ticketId,orderId,menuItemName:t.menuItemName,quantity:t.quantity,status:'pending',notes:t.notes,tableNumber:order.tableNumber,station:'main',createdAt:now})), ...prev.kitchenTickets],
      tableStatuses: {...prev.tableStatuses, [order.tableId]:'order_placed'},
      recentOrders: [{ id:orderId, table:order.tableNumber, tableId:order.tableId, items:order.items.map((i:any)=>`${i.menuItemName} x${i.quantity}`).join(', '), total:order.total, time:'Just now', status:'pending' }, ...prev.recentOrders],
    }));
    socketRef.current?.emit('place_order',{orderId,tickets,tableNumber:order.tableNumber,tableId:order.tableId,total:order.total});
    return orderId;
  }, []);

  const emitTicketStatusUpdate = useCallback((ticketId: string, newStatus: string) => {
    const orderId = ticketId.replace(/_t\d+$/, '');
    setState((prev: any) => ({ ...prev,
      kitchenTickets: prev.kitchenTickets.map((t:any) => t.ticketId===ticketId ? {...t, status:newStatus} : t),
      recentOrders: prev.recentOrders.map((o:any) => {
        const t = prev.kitchenTickets.find((kt:any) => kt.ticketId===ticketId && kt.orderId===o.id);
        if (!t) return o;
        if (newStatus==='cooking' && o.status==='pending') return {...o, status:'cooking'};
        if (newStatus==='ready') return {...o, status:'ready'};
        if (newStatus==='served') return {...o, status:'served'};
        return o;
      }),
    }));
    fetch(`${API_URL}/api/data/order-status`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({orderId,status:newStatus,ticketId}) })
      .then(() => { socketRef.current?.emit('update_ticket_status', { ticketId, newStatus }); })
      .catch(err => console.error('[SocketProvider] Failed to persist status:', err));
  }, []);

  const emitPaymentCompleted = useCallback((orderId:string, tableId:string, amount:number) => {
    setState((prev: any) => ({ ...prev, salesStats:{totalRevenue:prev.salesStats.totalRevenue+amount,totalOrders:prev.salesStats.totalOrders+1,avgOrderValue:(prev.salesStats.totalRevenue+amount)/(prev.salesStats.totalOrders+1),lastUpdate:new Date().toISOString()}, tableStatuses:{...prev.tableStatuses,[tableId]:'available'}, recentOrders:prev.recentOrders.map((o:any)=>o.id===orderId?{...o,status:'paid'}:o) }));
    socketRef.current?.emit('complete_payment',{orderId,tableId,totalAmount:amount});
    fetch(`${API_URL}/api/data/order-status`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId,status:'paid'})}).catch(()=>{});
  }, []);

  const emitTableStatusChange = useCallback((tableId:string, status:string) => {
    setState((prev: any) => ({...prev, tableStatuses:{...prev.tableStatuses,[tableId]:status}}));
    socketRef.current?.emit('update_table_status',{tableId,status});
  }, []);

  return (
    <POSContext.Provider value={{ socket:socketRef.current, isConnected, isLoading:false, state, emitOrderCreated, emitTicketStatusUpdate, emitPaymentCompleted, emitTableStatusChange }}>
      {children}
    </POSContext.Provider>
  );
}