import { Request, Response } from "express";

import { isCloudinaryConfigured, uploadImageBuffer } from "../config/cloudinary.config";
import { HTTPSTATUS } from "../config/http-status.config";
import { asyncHandler } from "../middlewares/asyncHandler.middleware";
import { UserDocument, UserRole } from "../models/user.model";
import { BadRequestException, ForbiddenException } from "../utils/app-error";

/**
 * Only these folders may be written to, so a caller cannot pick any path, and
 * only these roles may write to each one.
 *
 * The role half matters because the endpoint is shared: a shopkeeper needs it
 * for product photos, a kitchen for dish photos, and neither has any business
 * replacing the home-screen banners or the category artwork every customer
 * sees. `requireRole` on the router can only answer "may you upload at all".
 */
const FOLDERS: Record<string, { path: string; roles: UserRole[] }> = {
  banners: { path: "chowly/banners", roles: ["admin"] },
  categories: { path: "chowly/categories", roles: ["admin"] },
  dishes: { path: "chowly/dishes", roles: ["admin", "restaurant_owner"] },
  // Shop product photos. Missing until now, so a product upload was refused
  // as an unknown folder.
  products: { path: "chowly/products", roles: ["admin", "store_owner"] },
  // The product taxonomy's shelf artwork. Its form had a URL box and no
  // uploader, so this folder had never been asked for.
  "product-categories": { path: "chowly/product-categories", roles: ["admin"] },
  restaurants: { path: "chowly/restaurants", roles: ["admin", "restaurant_owner"] },
  stores: { path: "chowly/stores", roles: ["admin", "store_owner"] },
};

/*
  Order: what, who, can we, then the bytes.

  The configuration check used to come first, which made "image hosting is not
  configured" the answer to a shopkeeper asking to replace the home-screen
  banner — a request that is refused on this deployment and on every other one.
  Authorisation does not depend on whether Cloudinary keys happen to be set, so
  it is not answered by them.
*/
export const uploadImageController = asyncHandler(async (request: Request, response: Response) => {
  const requested = String(request.body.folder ?? "restaurants");
  const folder = FOLDERS[requested];

  if (!folder) {
    throw new BadRequestException(
      `Unknown upload folder. Choose one of: ${Object.keys(FOLDERS).sort().join(", ")}.`,
    );
  }

  const user = request.user as UserDocument;

  if (!folder.roles.includes(user.role)) {
    throw new ForbiddenException(`Your account cannot upload ${requested} images`);
  }

  if (!isCloudinaryConfigured()) {
    throw new BadRequestException(
      "Image hosting is not configured on this server, so photos cannot be uploaded. Pick a tile instead, or ask an administrator to set the Cloudinary keys.",
    );
  }

  const file = request.file;

  if (!file) throw new BadRequestException("Choose an image to upload");

  const uploaded = await uploadImageBuffer(file.buffer, file.mimetype, { folder: folder.path });

  return response.status(HTTPSTATUS.CREATED).json({ message: "Image uploaded", data: uploaded });
});
