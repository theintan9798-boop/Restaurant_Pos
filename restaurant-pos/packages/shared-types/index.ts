// ============================================================
// Restaurant POS — Shared TypeScript Types
// ============================================================

// --- Enums ---
export type UserRole = 'admin' | 'manager' | 'cashier' | 'waiter' | 'kitchen_staff';
export type TableStatus = 'available' | 'occupied' | 'order_placed' | 'bill_requested';
export type OrderStatus = 'draft' | 'pending' | 'cooking' | 'ready' | 'served' | 'billed' | 'paid' | 'cancelled';
export type OrderType = 'dine_in' | 'takeaway' | 'delivery';
export type OrderItemStatus = 'pending' | 'cooking' | 'ready' | 'served' | 'cancelled';
export type PaymentMethod = 'cash' | 'card' | 'mobile' | 'qr_code';
export type PaymentStatus = 'pending' | 'completed' | 'refunded' | 'failed';
export type SplitMethod = 'equal' | 'by_seat' | 'by_item';
export type DiscountType = 'percentage' | 'fixed_amount';
export type ModifierType = 'single_select' | 'multi_select' | 'text_input';

// --- Auth ---
export interface JwtPayload {
  userId: string;
  restaurantId: string;
  role: UserRole;
  permissions: string[];
  iat?: number;
  exp?: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
}

// --- User ---
export interface UserDto {
  id: string;
  restaurantId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: UserRole;
  isActive: boolean;
}

// --- Floor & Table ---
export interface FloorSection {
  id: string;
  name: string;
  displayOrder: number;
  tables: TableDto[];
}

export interface TableDto {
  id: string;
  sectionId: string;
  tableNumber: string;
  capacity: number;
  status: TableStatus;
  currentOrderId?: string;
  mergedIntoTableId?: string;
  posX: number;
  posY: number;
  shape: 'rectangle' | 'circle';
  width: number;
  height: number;
  version: number;
}

// --- Menu ---
export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  displayOrder: number;
  parentId?: string;
  subCategories?: CategoryDto[];
  items?: MenuItemDto[];
}

export interface MenuItemDto {
  id: string;
  categoryId: string;
  name: string;
  description?: string;
  imageUrl?: string;
  basePrice: number;
  taxCategory: string;
  prepTimeMins?: number;
  isAvailable: boolean;
  isFeatured: boolean;
  variations: ItemVariationDto[];
  modifiers: ModifierDto[];
}

export interface ItemVariationDto {
  id: string;
  name: string;
  priceAdjustment: number;
  isDefault: boolean;
}

export interface ModifierDto {
  id: string;
  name: string;
  modifierType: ModifierType;
  isRequired: boolean;
  maxSelections: number;
  options: ModifierOptionDto[];
}

export interface ModifierOptionDto {
  id: string;
  name: string;
  priceAdjustment: number;
  isDefault: boolean;
}

// --- Orders ---
export interface OrderDto {
  id: string;
  orderNumber: number;
  tableId?: string;
  tableNumber?: string;
  waiterId: string;
  waiterName?: string;
  cashierId?: string;
  orderType: OrderType;
  status: OrderStatus;
  seatCount?: number;
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  notes?: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  serviceCharge: number;
  grandTotal: number;
  version: number;
  items: OrderItemDto[];
  payments: PaymentDto[];
  createdAt: string;
  updatedAt: string;
}

export interface OrderItemDto {
  id: string;
  orderId: string;
  menuItemId: string;
  menuItemName: string;
  variationId?: string;
  variationName?: string;
  seatNumber?: number;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  status: OrderItemStatus;
  notes?: string;
  modifierSnapshot: ModifierSelectionDto[];
}

export interface ModifierSelectionDto {
  modifierId: string;
  modifierName: string;
  modifierOptionId: string;
  modifierOptionName: string;
  priceAdjustment: number;
}

// --- Cart (Frontend state) ---
export interface CartItem {
  menuItemId: string;
  menuItemName: string;
  variationId?: string;
  variationName?: string;
  seatNumber?: number;
  quantity: number;
  unitPrice: number;
  modifiers: ModifierSelectionDto[];
  notes?: string;
}

// --- Payments ---
export interface PaymentDto {
  id: string;
  orderId: string;
  paymentMethod: PaymentMethod;
  amount: number;
  status: PaymentStatus;
  transactionId?: string;
  referenceCode?: string;
  paidAt?: string;
}

// --- Split Bill ---
export interface SplitBillRequest {
  orderId: string;
  splitMethod: SplitMethod;
  splits: SplitDetailRequest[];
}

export interface SplitDetailRequest {
  seatNumber?: number;
  label: string;
  amount: number;
  itemIds?: string[];
  paymentMethod: PaymentMethod;
}

export interface SplitBillDto {
  id: string;
  orderId: string;
  splitMethod: SplitMethod;
  numberOfSplits: number;
  details: SplitDetailDto[];
}

export interface SplitDetailDto {
  id: string;
  seatNumber?: number;
  label: string;
  amount: number;
  paymentId?: string;
  itemIds: string[];
}

// --- Discount ---
export interface DiscountDto {
  id: string;
  name: string;
  discountType: DiscountType;
  value: number;
  minOrderValue: number;
  maxDiscount?: number;
  startsAt?: string;
  endsAt?: string;
}

// --- Tax ---
export interface TaxConfigDto {
  id: string;
  name: string;
  rate: number;
  appliesTo: string;
  isCompound: boolean;
  appliesAfterDiscount: boolean;
}

// --- KDS / Kitchen Ticket ---
export interface KitchenTicketDto {
  id: string;
  orderId: string;
  orderNumber: number;
  orderItemId: string;
  menuItemName: string;
  quantity: number;
  variationName?: string;
  modifiers: ModifierSelectionDto[];
  notes?: string;
  station: string;
  priority: number;
  tableNumber?: string;
  orderType: OrderType;
  createdAt: string;
}

// --- API Responses ---
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// --- Socket Events ---
export const SOCKET_EVENTS = {
  // Waiter/Cashier -> Kitchen
  NEW_KOT: 'kot:new',
  KOT_UPDATED: 'kot:updated',
  KOT_CANCELLED: 'kot:cancelled',

  // Kitchen -> Waiter/Cashier
  ITEM_STATUS_CHANGE: 'item:status_change',
  ORDER_STATUS_CHANGE: 'order:status_change',

  // Table events
  TABLE_STATUS_CHANGE: 'table:status_change',
  TABLE_MERGED: 'table:merged',
  ORDER_TRANSFERRED: 'order:transferred',

  // Bill events
  BILL_REQUESTED: 'bill:requested',
  PAYMENT_COMPLETED: 'payment:completed',

  // Connection
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  ERROR: 'socket:error',
} as const;