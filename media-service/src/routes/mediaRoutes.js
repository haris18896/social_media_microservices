const express = require("express");
const router = express.Router();
const multer = require("multer");
const mediaController = require("../controllers/mediaController");
const verifyToken = require("../middleware/verifyToken");

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || "10485760"), // 10MB default
  },
});

// Public routes (no auth required)
router.get("/:id", mediaController.getMediaById);
router.get("/user/:userId", mediaController.getMediaByUserId);

// Protected routes (require authentication)
router.use(verifyToken);

// Upload new media
router.post("/upload", upload.single("file"), mediaController.uploadMedia);

// Update media metadata
router.put("/:id", mediaController.updateMedia);

// Delete media
router.delete("/:id", mediaController.deleteMedia);

// Generate signed URL for direct access
router.get("/:id/signed-url", mediaController.getSignedUrl);

module.exports = router;
