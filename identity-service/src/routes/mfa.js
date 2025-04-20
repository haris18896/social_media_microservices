const express = require("express");
const router = express.Router();
const mfaController = require("../controllers/mfa");
const verifyToken = require("../middleware/verifyToken");
const { validationMFASetup } = require("../utils/validation");

// Middleware to validate MFA setup request
const validateMFASetup = (req, res, next) => {
  const { error } = validationMFASetup(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message,
    });
  }
  next();
};

// Routes that require authentication
router.use(verifyToken);

// TOTP (Time-based One-Time Password) routes
router.get("/setup/totp", mfaController.setupTOTP);
router.post("/verify/totp", mfaController.verifyTOTP);

// SMS-based verification routes
router.post("/setup/sms", validateMFASetup, mfaController.setupSMS);
router.post("/verify/sms", mfaController.verifySMS);

// Email-based verification routes
router.post("/setup/email", mfaController.setupEmail);
router.post("/verify/email", mfaController.verifyEmail);

// Disable MFA
router.post("/disable", mfaController.disableMFA);

// Verify MFA during login (called by auth controller)
router.post("/verify", mfaController.verifyMFA);

module.exports = router;
