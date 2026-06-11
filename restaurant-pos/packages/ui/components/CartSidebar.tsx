// ============================================================
// CartSidebar — Dynamic Cart & Checkout Panel
// Supports: add/remove items, modifiers, variations,
// split bill (equal / by seat / by item), discounts, tax
// ============================================================

'use client';

import React, { useState, useCallback, useMemo } from 'react';
import {
  CartItem, MenuItemDto, ModifierSelectionDto,
  SplitMethod, SplitDetailRequest, PaymentMethod,
  TaxConfigDto, DiscountDto,
} from 'shared-types';

// ============================================================
// Props
// ============================================================
interface CartSidebarProps {
  items: CartItem[];
  tableNumber?: string;
  seatCount?: number;
  taxConfigs?: TaxConfigDto[];
  activeDiscount?: DiscountDto | null;
  userRole: string;
  onAddItem: (item: MenuItemDto) => void;
  onRemoveItem: (index: number) => void;
  onUpdateQuantity: (index: number, quantity: number) => void;
  onUpdateSeat: (index: number, seatNumber: number | undefined) => void;
  onUpdateModifiers: (index: number, modifiers: ModifierSelectionDto[]) => void;
  onUpdateNotes: (index: number, notes: string) => void;
  onClearCart: () => void;
  onSubmitOrder: () => void;
  onRequestBill: () => void;
  onProcessPayment: (method: PaymentMethod, splits?: SplitDetailRequest[], discountId?: string) => void;
  onApplyDiscount: (discountCode: string) => void;
  onRemoveDiscount: () => void;
  isLoading?: boolean;
  isSubmitting?: boolean;
  className?: string;
}

// ============================================================
// Component
// ============================================================
export function CartSidebar({
  items,
  tableNumber,
  seatCount = 1,
  taxConfigs = [],
  activeDiscount,
  userRole,
  onAddItem,
  onRemoveItem,
  onUpdateQuantity,
  onUpdateSeat,
  onUpdateModifiers,
  onUpdateNotes,
  onClearCart,
  onSubmitOrder,
  onRequestBill,
  onProcessPayment,
  onApplyDiscount,
  onRemoveDiscount,
  isLoading = false,
  isSubmitting = false,
  className = '',
}: CartSidebarProps) {
  // --- Local state ---
  const [expandedItem, setExpandedItem] = useState<number | null>(null);
  const [discountCode, setDiscountCode] = useState('');
  const [showSplitPanel, setShowSplitPanel] = useState(false);
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('equal');
  const [splitCount, setSplitCount] = useState(2);
  const [paymentPanelOpen, setPaymentPanelOpen] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('cash');
  const [bySeatSplits, setBySeatSplits] = useState<Record<number, number>>({}); // seat->amount
  const [byItemSplits, setByItemSplits] = useState<Record<number, number>>({}); // itemIndex->guestIndex

  // --- Calculations ---
  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [items]
  );

  const modifierTotal = useMemo(
    () => items.reduce(
      (sum, item) => sum + item.modifiers.reduce((ms, m) => ms + (m.priceAdjustment || 0), 0) * item.quantity,
      0
    ),
    [items]
  );

  const discountAmount = useMemo(() => {
    if (!activeDiscount) return 0;
    if (activeDiscount.discountType === 'percentage') {
      const amount = subtotal * (activeDiscount.value / 100);
      return activeDiscount.maxDiscount ? Math.min(amount, activeDiscount.maxDiscount) : amount;
    }
    return Math.min(activeDiscount.value, subtotal);
  }, [activeDiscount, subtotal]);

  const taxAmount = useMemo(() => {
    const taxableAfterDiscount = subtotal + modifierTotal - discountAmount;
    return taxConfigs.reduce((total, tax) => {
      const applicable = tax.appliesTo === 'all' ? true : false; // simplified
      if (!applicable) return total;
      return total + taxableAfterDiscount * tax.rate;
    }, 0);
  }, [taxConfigs, subtotal, modifierTotal, discountAmount]);

  const grandTotal = useMemo(
    () => subtotal + modifierTotal + taxAmount - discountAmount,
    [subtotal, modifierTotal, taxAmount, discountAmount]
  );

  // --- Split calculations ---
  const splitShares = useMemo(() => {
    if (!showSplitPanel) return [];
    if (splitMethod === 'equal') {
      const perShare = grandTotal / splitCount;
      return Array.from({ length: splitCount }, (_, i) => ({
        seatNumber: i + 1,
        label: `Guest ${i + 1}`,
        amount: parseFloat(perShare.toFixed(2)),
        itemIds: [] as string[],
      }));
    }
    if (splitMethod === 'by_seat') {
      return Array.from({ length: seatCount }, (_, i) => {
        const seatItems = items.filter((item) => (item.seatNumber || 1) === i + 1);
        const seatTotal = seatItems.reduce((s, item) => s + item.unitPrice * item.quantity, 0);
        return {
          seatNumber: i + 1,
          label: `Seat ${i + 1}`,
          amount: parseFloat((seatTotal + taxAmount / seatCount).toFixed(2)),
          itemIds: [] as string[],
        };
      }).filter((s) => s.amount > 0);
    }
    // by_item — simplified to equal for now
    const perShare = grandTotal / splitCount;
    return Array.from({ length: splitCount }, (_, i) => ({
      label: `Guest ${i + 1}`,
      amount: parseFloat(perShare.toFixed(2)),
      itemIds: [] as string[],
    }));
  }, [showSplitPanel, splitMethod, splitCount, grandTotal, items, seatCount, taxAmount]);

  // --- Handlers ---
  const handleQuantityChange = useCallback(
    (index: number, delta: number) => {
      const newQty = Math.max(1, (items[index]?.quantity || 1) + delta);
      onUpdateQuantity(index, newQty);
    },
    [items, onUpdateQuantity]
  );

  const handleApplyDiscount = useCallback(() => {
    if (discountCode.trim()) {
      onApplyDiscount(discountCode.trim());
      setDiscountCode('');
    }
  }, [discountCode, onApplyDiscount]);

  const handleSinglePayment = useCallback(
    (method: PaymentMethod) => {
      onProcessPayment(method);
      setPaymentPanelOpen(false);
    },
    [onProcessPayment]
  );

  const handleSplitPayment = useCallback(() => {
    const splits: SplitDetailRequest[] = splitShares.map((share) => ({
      seatNumber: share.seatNumber,
      label: share.label,
      amount: share.amount,
      itemIds: share.itemIds,
      paymentMethod: selectedPaymentMethod,
    }));
    onProcessPayment(selectedPaymentMethod, splits);
    setPaymentPanelOpen(false);
    setShowSplitPanel(false);
  }, [splitShares, selectedPaymentMethod, onProcessPayment]);

  // --- Empty Cart State ---
  if (items.length === 0) {
    return (
      <div className={`flex flex-col h-full bg-white border-l border-gray-200 ${className}`}>
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-800">
            {tableNumber ? `Table ${tableNumber} — Cart` : 'Cart'}
          </h2>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center px-6">
            <svg className="h-16 w-16 text-gray-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
            <p className="text-gray-500 text-lg font-medium">Your cart is empty</p>
            <p className="text-gray-400 text-sm mt-1">Tap a menu item to add it to the order</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full bg-white border-l border-gray-200 ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">
            {tableNumber ? `Table ${tableNumber}` : 'Cart'}
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({items.reduce((s, i) => s + i.quantity, 0)} items)
            </span>
          </h2>
          <button
            onClick={onClearCart}
            className="text-xs text-red-600 hover:text-red-800 font-medium"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Items list */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {items.map((item, index) => (
          <div
            key={index}
            className={`rounded-lg border transition-colors ${
              expandedItem === index
                ? 'border-indigo-300 bg-indigo-50/30'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            {/* Item row */}
            <div
              className="p-3 cursor-pointer"
              onClick={() => setExpandedItem(expandedItem === index ? null : index)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm font-medium text-gray-800 truncate">
                      {item.menuItemName}
                    </span>
                    {item.variationName && (
                      <span className="text-xs text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                        {item.variationName}
                      </span>
                    )}
                  </div>

                  {/* Modifier tags */}
                  {item.modifiers.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {item.modifiers.map((mod, mi) => (
                        <span
                          key={mi}
                          className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700"
                        >
                          {mod.modifierOptionName}
                          {mod.priceAdjustment > 0 && (
                            <span className="ml-0.5 text-amber-500">
                              +${mod.priceAdjustment.toFixed(2)}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Notes */}
                  {item.notes && (
                    <p className="text-xs text-gray-400 mt-1 italic">"{item.notes}"</p>
                  )}
                </div>

                <span className="text-sm font-semibold text-gray-800 ml-2 whitespace-nowrap">
                  ${(item.unitPrice * item.quantity).toFixed(2)}
                </span>
              </div>

              {/* Bottom row: qty + seat + remove */}
              <div className="flex items-center justify-between mt-2">
                {/* Quantity controls */}
                <div className="flex items-center space-x-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleQuantityChange(index, -1); }}
                    className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 text-sm font-bold"
                    disabled={item.quantity <= 1}
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-medium text-gray-700">
                    {item.quantity}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleQuantityChange(index, 1); }}
                    className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100 text-sm font-bold"
                  >
                    +
                  </button>
                </div>

                {/* Seat assignment */}
                {seatCount > 1 && (
                  <select
                    value={item.seatNumber || ''}
                    onChange={(e) => {
                      onUpdateSeat(index, e.target.value ? parseInt(e.target.value) : undefined);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="text-xs border border-gray-200 rounded px-1.5 py-0.5 text-gray-500"
                  >
                    <option value="">No seat</option>
                    {Array.from({ length: seatCount }, (_, i) => (
                      <option key={i + 1} value={i + 1}>Seat {i + 1}</option>
                    ))}
                  </select>
                )}

                <button
                  onClick={(e) => { e.stopPropagation(); onRemoveItem(index); }}
                  className="text-xs text-red-500 hover:text-red-700 font-medium"
                >
                  Remove
                </button>
              </div>
            </div>

            {/* Expanded details */}
            {expandedItem === index && (
              <div className="px-3 pb-3 border-t border-indigo-100 pt-2 space-y-2">
                {/* Notes input */}
                <div>
                  <label className="text-[10px] font-medium text-gray-400 uppercase">Special Instructions</label>
                  <input
                    type="text"
                    value={item.notes || ''}
                    onChange={(e) => onUpdateNotes(index, e.target.value)}
                    placeholder="e.g., Less spicy, No onions..."
                    className="w-full mt-1 text-xs border border-gray-200 rounded px-2 py-1.5 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 outline-none"
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Summary & actions footer */}
      <div className="flex-shrink-0 border-t border-gray-200 bg-gray-50">
        {/* Totals */}
        <div className="px-4 py-3 space-y-1.5 text-sm">
          <div className="flex justify-between text-gray-600">
            <span>Subtotal</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          {modifierTotal > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Modifiers</span>
              <span>${modifierTotal.toFixed(2)}</span>
            </div>
          )}
          {activeDiscount && (
            <div className="flex justify-between text-emerald-600">
              <span className="flex items-center space-x-1">
                <span>Discount ({activeDiscount.name})</span>
                <button onClick={onRemoveDiscount} className="text-red-400 hover:text-red-600 text-xs">✕</button>
              </span>
              <span>−${discountAmount.toFixed(2)}</span>
            </div>
          )}
          {taxAmount > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>Tax</span>
              <span>${taxAmount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-gray-800 pt-1 border-t border-gray-200">
            <span>Total</span>
            <span>${grandTotal.toFixed(2)}</span>
          </div>
        </div>

        {/* Discount code input */}
        <div className="px-4 pb-2">
          <div className="flex space-x-2">
            <input
              type="text"
              value={discountCode}
              onChange={(e) => setDiscountCode(e.target.value)}
              placeholder="Discount code..."
              className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 focus:border-indigo-400 outline-none"
            />
            <button
              onClick={handleApplyDiscount}
              disabled={!discountCode.trim() || userRole === 'kitchen_staff'}
              className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Apply
            </button>
          </div>
        </div>

        {/* Split bill panel */}
        {showSplitPanel && (
          <div className="px-4 pb-3 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">Split Bill</h3>
              <button
                onClick={() => setShowSplitPanel(false)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>

            {/* Split method selector */}
            <div className="flex space-x-1">
              {(['equal', 'by_seat', 'by_item'] as SplitMethod[]).map((method) => (
                <button
                  key={method}
                  onClick={() => setSplitMethod(method)}
                  className={`flex-1 text-xs py-1.5 rounded font-medium transition-colors ${
                    splitMethod === method
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {method === 'equal' ? 'Equal' : method === 'by_seat' ? 'By Seat' : 'By Item'}
                </button>
              ))}
            </div>

            {/* Split count (for equal) */}
            {splitMethod === 'equal' && (
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500">Splits:</span>
                <button
                  onClick={() => setSplitCount(Math.max(2, splitCount - 1))}
                  className="w-6 h-6 rounded border border-gray-300 text-gray-600 text-sm"
                >
                  −
                </button>
                <span className="text-sm font-medium w-6 text-center">{splitCount}</span>
                <button
                  onClick={() => setSplitCount(Math.min(10, splitCount + 1))}
                  className="w-6 h-6 rounded border border-gray-300 text-gray-600 text-sm"
                >
                  +
                </button>
              </div>
            )}

            {/* Split shares preview */}
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {splitShares.map((share, si) => (
                <div key={si} className="flex justify-between items-center text-xs bg-white rounded px-2 py-1 border border-gray-100">
                  <span className="font-medium text-gray-700">{share.label}</span>
                  <span className="text-gray-600">${share.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>

            {/* Pay splits button */}
            <button
              onClick={handleSplitPayment}
              disabled={isSubmitting}
              className="w-full py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? 'Processing...' : `Charge ${splitShares.length} payments`}
            </button>
          </div>
        )}

        {/* Payment panel */}
        {paymentPanelOpen && !showSplitPanel && (
          <div className="px-4 pb-3 space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">Payment Method</h3>
            <div className="grid grid-cols-2 gap-2">
              {([
                { method: 'cash' as PaymentMethod, icon: '💵', label: 'Cash' },
                { method: 'card' as PaymentMethod, icon: '💳', label: 'Card' },
                { method: 'mobile' as PaymentMethod, icon: '📱', label: 'Mobile' },
                { method: 'qr_code' as PaymentMethod, icon: '📷', label: 'QR Code' },
              ]).map((pm) => (
                <button
                  key={pm.method}
                  onClick={() => handleSinglePayment(pm.method)}
                  disabled={isSubmitting}
                  className="flex flex-col items-center py-3 rounded-lg border border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 transition-colors disabled:opacity-50"
                >
                  <span className="text-2xl mb-1">{pm.icon}</span>
                  <span className="text-xs font-medium text-gray-700">{pm.label}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setPaymentPanelOpen(false)}
              className="w-full text-xs text-gray-400 hover:text-gray-600 py-1"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Action buttons */}
        <div className="px-4 pb-4 space-y-2">
          {/* Primary: Submit Order / Pay / Request Bill */}
          {userRole === 'waiter' && (
            <>
              <button
                onClick={onSubmitOrder}
                disabled={isSubmitting}
                className="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center space-x-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Placing Order...</span>
                  </span>
                ) : (
                  `Place Order • $${grandTotal.toFixed(2)}`
                )}
              </button>
              <button
                onClick={onRequestBill}
                className="w-full py-2 border border-blue-300 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors"
              >
                Request Bill
              </button>
            </>
          )}

          {/* Cashier payment actions */}
          {(userRole === 'cashier' || userRole === 'manager' || userRole === 'admin') && !showSplitPanel && !paymentPanelOpen && (
            <>
              <button
                onClick={() => setPaymentPanelOpen(true)}
                className="w-full py-2.5 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors"
              >
                Pay ${grandTotal.toFixed(2)}
              </button>
              <button
                onClick={() => setShowSplitPanel(true)}
                className="w-full py-2 border border-purple-300 text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-50 transition-colors"
              >
                Split Bill
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}