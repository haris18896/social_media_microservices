const express = require("express");
const multer = require("multer");

const logger = require("../utils/logger");
const { uploadMedia, getAllMedia } = require("../controllers/media-controller");
const { authenticatedRequest } = require("../middleware/authMiddleware");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 1024 * 1024 * 5, // 5MB
  },
}).single("file");

router.post(
  "/upload",
  authenticatedRequest,
  (req, res, next) => {
    upload(req, res, function (err) {
      if (err instanceof multer.MulterError) {
        logger.error("Multer error while uploading file", err);
        return res
          .status(400)
          .json({ error: "Multer error while uploading file" });
      } else if (err) {
        logger.error("Error while uploading file", err);
        return res.status(500).json({ error: "Error while uploading file" });
      }

      if (!req.file) {
        logger.error("No file found in request");
        return res.status(400).json({ error: "No file found" });
      }

      next();
    });
  },
  uploadMedia
);

router.get("/get-all-media", authenticatedRequest, getAllMedia);

module.exports = router;
