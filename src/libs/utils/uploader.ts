import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import multer from "multer";
import Errors, { HttpCode, Message } from "../Errors";

/**
 * The image types we take, and the extension each one is saved under.
 * The extension comes from this list, never from the uploaded file's name:
 * everything in uploads/ is served from the API's own domain, so a file
 * saved as `.html` or `.svg` would run there as a page.
 */
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/gif": ".gif",
  // iPhones hand over HEIC when a shopper picks a photo for payment proof.
  "image/heic": ".heic",
  "image/heif": ".heif",
};

// Phone screenshots and photos sit well under this.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** MULTER IMAGE UPLOADER **/
function getTargetImageStorage(address: string) {
  const destination = path.join("uploads", address);

  return multer.diskStorage({
    // multer does not create this folder — it opens the write stream straight
    // away and fails with ENOENT when the folder is missing. Only the folders
    // something has already written to exist, and `uploads/` is gitignored, so
    // on a fresh server (or a newly mounted Railway volume, which starts
    // empty) the first upload of a given kind died inside the middleware,
    // before the controller ever ran, and surfaced as a bare 500 with no clue
    // in it. Creating it here is idempotent and costs one cheap syscall.
    destination: function (req, file, cb) {
      fs.mkdir(destination, { recursive: true }, (err) => cb(err, destination));
    },
    filename: function (req, file, cb) {
      cb(null, randomUUID() + IMAGE_EXTENSIONS[file.mimetype]);
    },
  });
}

const makeUploader = (address: string) => {
  const storage = getTargetImageStorage(address);
  return multer({
    storage: storage,
    limits: { fileSize: MAX_IMAGE_BYTES },
    fileFilter: function (req, file, cb) {
      if (IMAGE_EXTENSIONS[file.mimetype]) cb(null, true);
      else cb(new Errors(HttpCode.BAD_REQUEST, Message.INVALID_IMAGE_FILE));
    },
  });
};

export default makeUploader;

/*.   it is only used for products images now
const product_storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./uploads/products");
  },
  filename: function (req, file, cb) {
    console.log(file);
    const extension = path.parse(file.originalname).ext;
    const random_name = v4() + extension;
    cb(null, random_name);
  },
});

export const uploadProductImage = multer({ storage: product_storage });
*/
