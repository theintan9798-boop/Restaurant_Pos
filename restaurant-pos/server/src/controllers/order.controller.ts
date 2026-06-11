// ============================================================
// Order Controller — REST endpoints for order operations
// ============================================================

import { Router, Request, Response } from 'express';
import { requireAuth, authorize, requirePermission } from '../middleware/auth';
import * as orderService from '../services/order.service';
import { JwtPayload } from 'shared-types';

const router = Router();

// ============================================================
// POST /api/orders — Create a new order (Waiter)
// ============================================================
router.post(
  '/',
  requireAuth,
  authorize('waiter', 'cashier', 'manager', 'admin'),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as JwtPayload;
      const {
        tableId,
        orderType,
        seatCount,
        customerName,
        customerPhone,
        deliveryAddress,
        notes,
        idempotencyKey,
        items,
      } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        res.status(400).json({
          success: false,
          error: 'Order must contain at least one item',
        });
        return;
      }

      if (!idempotencyKey) {
        res.status(400).json({
          success: false,
          error: 'idempotencyKey is required to prevent duplicate orders',
        });
        return;
      }

      const order = await orderService.createOrder({
        restaurantId: user.restaurantId,
        tableId: tableId || undefined,
        waiterId: user.userId,
        orderType: orderType || 'dine_in',
        seatCount: seatCount || undefined,
        customerName,
        customerPhone,
        deliveryAddress,
        notes,
        idempotencyKey,
        items: items.map((item: any) => ({
          menuItemId: item.menuItemId,
          variationId: item.variationId,
          seatNumber: item.seatNumber,
          quantity: item.quantity || 1,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice || item.unitPrice * (item.quantity || 1),
          notes: item.notes,
          modifiers: item.modifiers || [],
        })),
      });

      res.status(201).json({
        success: true,
        data: order,
        message: 'Order created successfully',
      });
    } catch (err: any) {
      console.error('[OrderController] createOrder error:', err.message);
      const status = err.message.includes('not available') ? 409 : 500;
      res.status(status).json({
        success: false,
        error: err.message,
      });
    }
  }
);

// ============================================================
// GET /api/orders/:id — Get order by ID
// ============================================================
router.get(
  '/:id',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      // TODO: fetch from DB via service
      res.status(200).json({
        success: true,
        message: 'Order fetch endpoint (implement with actual DB call)',
        orderId: id,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ============================================================
// PATCH /api/orders/:id/items/:itemId/status — Update item status (Kitchen)
// ============================================================
router.patch(
  '/:orderId/items/:itemId/status',
  requireAuth,
  authorize('kitchen_staff', 'manager', 'admin'),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as JwtPayload;
      const { itemId } = req.params;
      const { status } = req.body;

      const validStatuses = ['pending', 'cooking', 'ready', 'served', 'cancelled'];
      if (!validStatuses.includes(status)) {
        res.status(400).json({
          success: false,
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        });
        return;
      }

      const updated = await orderService.updateOrderItemStatus(
        itemId,
        status,
        user.userId
      );

      if (!updated) {
        res.status(404).json({
          success: false,
          error: 'Order item not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: updated,
        message: `Item status updated to ${status}`,
      });
    } catch (err: any) {
      console.error('[OrderController] updateItemStatus error:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ============================================================
// PATCH /api/orders/:id/status — Update overall order status
// ============================================================
router.patch(
  '/:id/status',
  requireAuth,
  authorize('waiter', 'cashier', 'manager', 'admin'),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as JwtPayload;
      const { id } = req.params;
      const { status } = req.body;

      // TODO: implement in service
      res.status(200).json({
        success: true,
        message: `Order ${id} status updated to ${status}`,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ============================================================
// POST /api/orders/:id/bill — Request bill (Waiter)
// ============================================================
router.post(
  '/:id/bill',
  requireAuth,
  authorize('waiter', 'manager', 'admin'),
  requirePermission('bills:request'),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as JwtPayload;
      const { id } = req.params;
      const { tableId } = req.body;

      const order = await orderService.requestBill(id, tableId, user.userId);

      res.status(200).json({
        success: true,
        data: order,
        message: 'Bill requested',
      });
    } catch (err: any) {
      console.error('[OrderController] requestBill error:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ============================================================
// POST /api/orders/:id/pay — Process payment
// ============================================================
router.post(
  '/:id/pay',
  requireAuth,
  authorize('cashier', 'manager', 'admin'),
  requirePermission('payments:process'),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as JwtPayload;
      const { id } = req.params;
      const {
        paymentMethod,
        amount,
        transactionId,
        referenceCode,
        splits,
      } = req.body;

      const result = await orderService.processPayment({
        orderId: id,
        paymentMethod: paymentMethod || 'cash',
        amount: amount || parseFloat(req.body.amount),
        cashierId: user.userId,
        transactionId,
        referenceCode,
        splits: splits?.map((s: any) => ({
          seatNumber: s.seatNumber,
          label: s.label,
          amount: s.amount,
          itemIds: s.itemIds,
          paymentMethod: s.paymentMethod || paymentMethod || 'cash',
        })),
      });

      res.status(200).json({
        success: true,
        data: result,
        message: 'Payment processed successfully',
      });
    } catch (err: any) {
      console.error('[OrderController] processPayment error:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ============================================================
// POST /api/orders/:id/discount — Apply discount
// ============================================================
router.post(
  '/:id/discount',
  requireAuth,
  authorize('cashier', 'manager', 'admin'),
  requirePermission('discounts:apply'),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as JwtPayload;
      const { id } = req.params;
      const { discountCode } = req.body;

      const order = await orderService.applyDiscount(id, discountCode, user.userId);

      res.status(200).json({
        success: true,
        data: order,
        message: 'Discount applied',
      });
    } catch (err: any) {
      console.error('[OrderController] applyDiscount error:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ============================================================
// POST /api/tables/:id/transfer-order — Transfer order to another table
// ============================================================
router.post(
  '/tables/transfer',
  requireAuth,
  authorize('waiter', 'manager', 'admin'),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as JwtPayload;
      const { orderId, toTableId } = req.body;

      await orderService.transferOrder(orderId, toTableId, user.restaurantId);

      res.status(200).json({
        success: true,
        message: 'Order transferred successfully',
      });
    } catch (err: any) {
      console.error('[OrderController] transferOrder error:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ============================================================
// POST /api/tables/merge — Merge two tables
// ============================================================
router.post(
  '/tables/merge',
  requireAuth,
  authorize('waiter', 'manager', 'admin'),
  requirePermission('tables:manage'),
  async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as JwtPayload;
      const { sourceTableId, targetTableId } = req.body;

      await orderService.mergeTables(sourceTableId, targetTableId, user.restaurantId);

      res.status(200).json({
        success: true,
        message: 'Tables merged successfully',
      });
    } catch (err: any) {
      console.error('[OrderController] mergeTables error:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

export default router;