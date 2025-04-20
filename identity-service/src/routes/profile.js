const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const profileController = require("../controllers/profile");
const { validationPasswordChange } = require("../utils/validation");

// Middleware to validate password change request
const validatePasswordChange = (req, res, next) => {
  const { error } = validationPasswordChange(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message,
    });
  }
  next();
};

// All routes require authentication
router.use(verifyToken);

// Get user profile
router.get("/", profileController.getProfile);

// Update profile
router.put("/", profileController.updateProfile);

// Change password
router.put(
  "/password",
  validatePasswordChange,
  profileController.changePassword
);

// Get active sessions
router.get("/sessions", profileController.getActiveSessions);

// Revoke a specific session
router.delete("/sessions/:tokenId", profileController.revokeSession);

// Revoke all sessions (logout from all devices)
router.delete("/sessions", profileController.revokeAllSessions);

// Export account data (GDPR compliance)
router.get("/export", profileController.exportAccountData);

module.exports = router;
