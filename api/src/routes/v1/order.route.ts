import { Router } from "express";

import {
  createOrderController,
  getOrderController,
  listOrdersController,
  reorderController,
  syncOrderController,
  verifyPaymentController,
} from "../../controllers/order.controller";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware";

export const orderRoutes = Router();

// Orders always belong to the signed-in account.
orderRoutes.use(requireAuth);

/*
  PLACING an order is a customer's act; READING one is not.

  The split matters because a role is granted by an admin approving an
  application, which changes an existing account — so a shopkeeper approved
  last week may well have ordered groceries the week before. Locking the whole
  router to customers would make their own past orders unreadable to them, and
  `findOrder` already scopes every read to the signed-in account.

  So: the three routes that create or re-create an order are customers only,
  and the two that read are left to anyone signed in.
*/
const customerOnly = requireRole("customer");

orderRoutes.post("/", customerOnly, createOrderController);
orderRoutes.get("/", listOrdersController);
orderRoutes.get("/:orderId", getOrderController);
orderRoutes.post("/:orderId/verify-payment", customerOnly, verifyPaymentController);
orderRoutes.post("/:orderId/sync", syncOrderController);
orderRoutes.post("/:orderId/reorder", customerOnly, reorderController);
