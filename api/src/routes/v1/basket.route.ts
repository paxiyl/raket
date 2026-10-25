import { Router } from "express";

import {
  addBasketItemController,
  addBasketProductController,
  clearBasketController,
  getBasketController,
  setBasketItemQuantityController,
  updateBasketController,
} from "../../controllers/basket.controller";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware";

export const basketRoutes = Router();

/*
  A basket belongs to one signed-in CUSTOMER, and that is now enforced rather
  than implied by the word.

  A shop, a kitchen and a rider are the other side of an order: they are paid
  out of one. A basket owned by a shopkeeper is a shop buying from itself, and
  nothing downstream — commission, the rider's cash ledger, the vendor
  settlement — has a meaning for that. The app keeps those accounts off the
  shopping screens; this is what makes it true for a request that did not come
  from the app.

  Admins are excluded for the same reason. They run the backoffice, which has
  no basket, and an admin account that can place orders is an audit trail with
  a hole in it.
*/
basketRoutes.use(requireAuth, requireRole("customer"));

basketRoutes.get("/", getBasketController);
basketRoutes.patch("/", updateBasketController);
basketRoutes.delete("/", clearBasketController);

// Two entry points rather than one polymorphic body: a dish carries options and a
// note, a product carries neither, and collapsing them would mean a schema where
// half the fields are meaningless on every call.
basketRoutes.post("/items", addBasketItemController);
basketRoutes.post("/products", addBasketProductController);
basketRoutes.patch("/items/:itemId", setBasketItemQuantityController);
