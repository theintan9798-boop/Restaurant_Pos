// ============================================================
// TableGrid — Interactive Floor Plan Component
// Real-time table status tracking, merge, transfer orders
// ============================================================

'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { TableDto, TableStatus, FloorSection, SOCKET_EVENTS } from 'shared-types';
import type { Socket } from 'socket.io-client';

// ============================================================
// Status color mapping
// ============================================================
const STATUS_COLORS: Record<TableStatus, { bg: string; border: string; text: string; label: string }> = {
  available: {
    bg: 'bg-emerald-50 hover:bg-emerald-100',
    border: 'border-emerald-400',
    text: 'text-emerald-700',
    label: 'Available',
  },
  occupied: {
    bg: 'bg-red-50 hover:bg-red-100',
    border: 'border-red-400',
    text: 'text-red-700',
    label: 'Occupied',
  },
  order_placed: {
    bg: 'bg-amber-50 hover:bg-amber-100',
    border: 'border-amber-400',
    text: 'text-amber-700',
    label: 'Order Placed',
  },
  bill_requested: {
    bg: 'bg-blue-50 hover:bg-blue-100',
    border: 'border-blue-400',
    text: 'text-blue-700',
    label: 'Bill Requested',
  },
};

// ============================================================
// Props
// ============================================================
interface TableGridProps {
  sections: FloorSection[];
  socket: Socket | null;
  onTableClick: (table: TableDto) => void;
  onNewOrder: (table: TableDto) => void;
  onRequestBill: (table: TableDto) => void;
  onMergeTables: (sourceTable: TableDto, targetTable: TableDto) => void;
  onTransferOrder: (table: TableDto) => void;
  selectedTableId?: string;
  isLoading?: boolean;
}

// ============================================================
// Component
// ============================================================
export function TableGrid({
  sections,
  socket,
  onTableClick,
  onNewOrder,
  onRequestBill,
  onMergeTables,
  onTransferOrder,
  selectedTableId,
  isLoading = false,
}: TableGridProps) {
  const [activeTab, setActiveTab] = useState<string>(sections[0]?.id || '');
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    table: TableDto;
  } | null>(null);
  const [mergeMode, setMergeMode] = useState<{
    sourceTable: TableDto;
  } | null>(null);

  const currentSection = useMemo(
    () => sections.find((s) => s.id === activeTab) || sections[0],
    [sections, activeTab]
  );

  // Close context menu on outside click
  const handleOutsideClick = useCallback(() => {
    setContextMenu(null);
  }, []);

  React.useEffect(() => {
    if (contextMenu) {
      window.addEventListener('click', handleOutsideClick);
      return () => window.removeEventListener('click', handleOutsideClick);
    }
  }, [contextMenu, handleOutsideClick]);

  // Handle table right-click for context menu
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, table: TableDto) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, table });
    },
    []
  );

  // Stats for current section
  const stats = useMemo(() => {
    const tables = currentSection?.tables || [];
    return {
      total: tables.length,
      available: tables.filter((t) => t.status === 'available').length,
      occupied: tables.filter((t) => t.status === 'occupied').length,
      orderPlaced: tables.filter((t) => t.status === 'order_placed').length,
      billRequested: tables.filter((t) => t.status === 'bill_requested').length,
    };
  }, [currentSection]);

  // ============================================================
  // Loading state
  // ============================================================
  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50 rounded-xl">
        <div className="text-center">
          <svg
            className="animate-spin h-10 w-10 text-indigo-600 mx-auto mb-3"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <p className="text-gray-500 text-sm">Loading floor plan...</p>
        </div>
      </div>
    );
  }

  // ============================================================
  // Empty state
  // ============================================================
  if (!sections || sections.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50 rounded-xl">
        <div className="text-center max-w-sm">
          <svg className="h-16 w-16 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
          <p className="text-gray-500 text-lg font-medium">No floor plan configured</p>
          <p className="text-gray-400 text-sm mt-1">Contact an admin to set up tables and sections.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header with section tabs and stats */}
      <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Section tabs */}
          <div className="flex space-x-1">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveTab(section.id)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === section.id
                    ? 'bg-white text-indigo-700 shadow-sm border border-gray-200'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                {section.name}
                <span className="ml-2 text-xs text-gray-400">({section.tables?.length || 0})</span>
              </button>
            ))}
          </div>

          {/* Status legend */}
          <div className="flex items-center space-x-4 text-xs">
            {Object.entries(STATUS_COLORS).map(([status, colors]) => (
              <div key={status} className="flex items-center space-x-1.5">
                <span className={`w-3 h-3 rounded-full ${colors.border} border-2`} />
                <span className="text-gray-500">{colors.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick stats bar */}
      <div className="px-4 py-2 border-b border-gray-100 bg-white flex space-x-6 text-xs text-gray-500">
        <span>Total: <strong className="text-gray-700">{stats.total}</strong></span>
        <span>🟢 Available: <strong className="text-emerald-600">{stats.available}</strong></span>
        <span>🔴 Occupied: <strong className="text-red-600">{stats.occupied}</strong></span>
        <span>🟠 Orders: <strong className="text-amber-600">{stats.orderPlaced}</strong></span>
        <span>🔵 Bill: <strong className="text-blue-600">{stats.billRequested}</strong></span>
        {mergeMode && (
          <span className="text-purple-600 font-medium animate-pulse">
            Merging mode — select target table
            <button
              onClick={(e) => { e.stopPropagation(); setMergeMode(null); }}
              className="ml-2 underline hover:text-purple-800"
            >
              Cancel
            </button>
          </span>
        )}
      </div>

      {/* Floor plan grid */}
      <div className="flex-1 overflow-auto p-6 relative" onClick={() => setContextMenu(null)}>
        <div
          className="relative"
          style={{
            minHeight: '500px',
            background: 'repeating-linear-gradient(0deg, #f9fafb, #f9fafb 1px, transparent 1px, transparent 40px), repeating-linear-gradient(90deg, #f9fafb, #f9fafb 1px, transparent 1px, transparent 40px)',
          }}
        >
          {currentSection?.tables?.map((table) => {
            const colors = STATUS_COLORS[table.status];
            const isSelected = table.id === selectedTableId;
            const isMergeTarget = mergeMode !== null && table.id !== mergeMode.sourceTable.id;

            return (
              <div
                key={table.id}
                className={`absolute cursor-pointer transition-all duration-200 group ${
                  isSelected ? 'ring-2 ring-indigo-500 ring-offset-2 z-10 scale-105' : 'z-0'
                } ${isMergeTarget ? 'ring-2 ring-purple-400 ring-dashed' : ''}`}
                style={{
                  left: table.posX,
                  top: table.posY,
                  width: table.width,
                  height: table.height,
                }}
                onClick={(e) => {
                  if (mergeMode && isMergeTarget) {
                    onMergeTables(mergeMode.sourceTable, table);
                    setMergeMode(null);
                    return;
                  }
                  onTableClick(table);
                }}
                onContextMenu={(e) => handleContextMenu(e, table)}
              >
                {/* Table shape */}
                <div
                  className={`w-full h-full ${colors.bg} ${colors.border} border-2 rounded-lg flex flex-col items-center justify-center shadow-sm hover:shadow-md transition-shadow`}
                >
                  {/* Capacity indicator */}
                  <div className="flex items-center space-x-0.5 mb-1">
                    {Array.from({ length: table.capacity }, (_, i) => (
                      <div
                        key={i}
                        className={`w-2.5 h-2.5 rounded-full ${
                          table.status === 'available' ? 'bg-emerald-300' : 'bg-gray-300'
                        }`}
                      />
                    ))}
                  </div>

                  <span className={`text-sm font-bold ${colors.text}`}>
                    {table.tableNumber}
                  </span>
                  <span className={`text-[10px] font-medium ${colors.text} opacity-75`}>
                    {colors.label}
                  </span>
                  <span className="text-[10px] text-gray-400">Seats {table.capacity}</span>

                  {/* Merged indicator */}
                  {table.mergedIntoTableId && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-purple-500 rounded-full text-white text-[8px] flex items-center justify-center">
                      M
                    </span>
                  )}
                </div>

                {/* Hover quick actions */}
                <div className="absolute -top-9 left-1/2 -translate-x-1/2 hidden group-hover:flex space-x-1 bg-white shadow-lg rounded-lg px-2 py-1 border border-gray-200">
                  {table.status === 'available' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onNewOrder(table); }}
                      className="px-2 py-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded hover:bg-emerald-100"
                    >
                      + New Order
                    </button>
                  )}
                  {(table.status === 'order_placed' || table.status === 'occupied') && (
                    <>
                      <button
                        onClick={(e) => { e.stopPropagation(); onTransferOrder(table); }}
                        className="px-2 py-1 text-xs font-medium text-amber-700 bg-amber-50 rounded hover:bg-amber-100"
                      >
                        Transfer
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onRequestBill(table); }}
                        className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100"
                      >
                        Bill
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setMergeMode({ sourceTable: table }); }}
                        className="px-2 py-1 text-xs font-medium text-purple-700 bg-purple-50 rounded hover:bg-purple-100"
                      >
                        Merge
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Empty section state */}
        {(!currentSection?.tables || currentSection.tables.length === 0) && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-gray-400 text-sm">No tables in this section</p>
          </div>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase border-b border-gray-100">
            Table {contextMenu.table.tableNumber}
          </div>
          {contextMenu.table.status === 'available' && (
            <button
              onClick={() => { onNewOrder(contextMenu.table); setContextMenu(null); }}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 flex items-center space-x-2"
            >
              <span>➕</span>
              <span>New Order</span>
            </button>
          )}
          {(contextMenu.table.status === 'order_placed' || contextMenu.table.status === 'occupied') && (
            <>
              <button
                onClick={() => { onTableClick(contextMenu.table); setContextMenu(null); }}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 flex items-center space-x-2"
              >
                <span>📋</span>
                <span>View Order</span>
              </button>
              <button
                onClick={() => {
                  setMergeMode({ sourceTable: contextMenu.table });
                  setContextMenu(null);
                }}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700 flex items-center space-x-2"
              >
                <span>🔗</span>
                <span>Merge Table</span>
              </button>
              <button
                onClick={() => { onTransferOrder(contextMenu.table); setContextMenu(null); }}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-amber-50 hover:text-amber-700 flex items-center space-x-2"
              >
                <span>↔️</span>
                <span>Transfer Order</span>
              </button>
              <div className="border-t border-gray-100 my-1" />
              <button
                onClick={() => { onRequestBill(contextMenu.table); setContextMenu(null); }}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center space-x-2"
              >
                <span>🧾</span>
                <span>Request Bill</span>
              </button>
            </>
          )}
          {contextMenu.table.status === 'bill_requested' && (
            <button
              onClick={() => { onTableClick(contextMenu.table); setContextMenu(null); }}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center space-x-2"
            >
              <span>💳</span>
              <span>Process Payment</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}