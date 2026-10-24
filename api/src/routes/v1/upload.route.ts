import { RequestHandler, Router } from "express";
import multer from "multer";

import { uploadImageController } from "../../controllers/upload.controller";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware";
import { BadRequestException } from "../../utils/app-error";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE = /^image\/(png|jpe?g|webp|avif)$/;

/** Kept in memory and streamed straight to Cloudinary; nothing touches disk. */
const upload = multer({
  fileFilter: (_request, file, callback) => {
    /*
      An Error, not `callback(null, false)`.

      Rejecting silently is what multer's `false` does, and the file simply
      never arrives — so a shopkeeper who picked a HEIC photo off their phone
      was told "Choose an image to upload", about the image they had just
      chosen. The type is the problem, so the type is what the message says.
    */
    if (ALLOWED_IMAGE.test(file.mimetype)) {
      callback(null, true);

      return;
    }

    callback(
      new BadRequestException(
        `${file.mimetype || "That file"} cannot be uploaded. Use a PNG, JPEG, WebP or AVIF image.`,
      ),
    );
  },
  limits: { fileSize: MAX_BYTES, files: 1 },
  storage: multer.memoryStorage(),
});

/**
 * Multer's own failures, turned into the same error shape every other route
 * returns.
 *
 * Left to itself, multer hands a `MulterError` to Express, which has no
 * `statusCode`, so the error handler's last branch logs it as unhandled and
 * answers 500 "Internal server error". An 8 MB photo is not a server fault and
 * the person who picked it can fix it the moment they are told the limit.
 */
const singleImage: RequestHandler = (request, response, next) => {
  upload.single("file")(request, response, (error: unknown) => {
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        next(
          new BadRequestException(
            `That image is larger than ${MAX_BYTES / 1024 / 1024} MB. Pick a smaller one.`,
          ),
        );

        return;
      }

      if (error.code === "LIMIT_UNEXPECTED_FILE" || error.code === "LIMIT_FILE_COUNT") {
        next(new BadRequestException("Send one image, as the `file` field of the form."));

        return;
      }

      next(new BadRequestException(`That upload was refused: ${error.code}.`));

      return;
    }

    // A BadRequestException from the filter above, or anything genuinely odd.
    next(error ?? undefined);
  });
};

export const uploadRoutes = Router();

// Owners manage their own catalogue, so they need to upload its images. Which
// folders each role may write to is decided in the controller, because this
// middleware can only answer "may you upload at all".
uploadRoutes.use(requireAuth, requireRole("admin", "store_owner", "restaurant_owner"));

uploadRoutes.post("/image", singleImage, uploadImageController);
