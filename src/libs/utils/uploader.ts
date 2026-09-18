import fs from "fs";
import path from "path";
import multer from "multer";
import { v4 } from "uuid";

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
      const extension = path.parse(file.originalname).ext;
      const random_name = v4() + extension;
      cb(null, random_name);
    },
  });
}

const makeUploader = (address: string) => {
  const storage = getTargetImageStorage(address);
  return multer({ storage: storage });
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
