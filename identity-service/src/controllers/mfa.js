const { authenticator } = require("otplib");
const qrcode = require("qrcode");
const crypto = require("crypto");
const User = require("../models/User");
const { sendSMS } = require("../utils/smsService");
const { sendEmail } = require("../utils/emailService");
const logger = require("../utils/logger");

/**
 * Generate TOTP secret and QR code for authenticator app
 */
const setupTOTP = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Generate a secret key
    const secret = authenticator.generateSecret();

    // Set up TOTP options
    const serviceName = process.env.SERVICE_NAME || "SocialMediaApp";
    const otpauth = authenticator.keyuri(user.email, serviceName, secret);

    // Generate QR code
    const qrCode = await qrcode.toDataURL(otpauth);

    // Store the secret temporarily (not committed until verification)
    user.mfaSecret = secret;
    await user.save();

    logger.info(`TOTP setup initiated for user: ${userId}`);

    return res.status(200).json({
      success: true,
      data: {
        secret,
        qrCode,
      },
    });
  } catch (error) {
    logger.error(`TOTP setup error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to set up TOTP",
    });
  }
};

/**
 * Verify TOTP code and enable MFA
 */
const verifyTOTP = async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user.id;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Verification code is required",
      });
    }

    const user = await User.findById(userId);

    if (!user || !user.mfaSecret) {
      return res.status(400).json({
        success: false,
        message: "MFA setup not initiated",
      });
    }

    // Verify the token
    const isValid = authenticator.verify({
      token,
      secret: user.mfaSecret,
    });

    if (!isValid) {
      logger.warn(`Invalid TOTP verification for user: ${userId}`);
      return res.status(400).json({
        success: false,
        message: "Invalid verification code",
      });
    }

    // Generate backup codes
    const backupCodes = [];
    for (let i = 0; i < 10; i++) {
      const code = crypto.randomBytes(4).toString("hex");
      backupCodes.push({
        code,
        used: false,
      });
    }

    // Enable MFA
    user.mfaEnabled = true;
    user.mfaMethod = "totp";
    user.backupCodes = backupCodes;
    await user.save();

    logger.info(`TOTP enabled for user: ${userId}`);

    return res.status(200).json({
      success: true,
      data: {
        backupCodes: backupCodes.map((code) => code.code),
      },
      message: "MFA enabled successfully",
    });
  } catch (error) {
    logger.error(`TOTP verification error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to verify TOTP",
    });
  }
};

/**
 * Setup SMS-based MFA
 */
const setupSMS = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    const userId = req.user.id;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Generate a verification code
    const verificationCode = Math.floor(
      100000 + Math.random() * 900000
    ).toString();

    // Store the code temporarily
    user.mfaSecret = verificationCode;
    await user.save();

    // Send SMS with the code
    const message = `Your verification code is: ${verificationCode}`;
    await sendSMS(phoneNumber, message);

    logger.info(`SMS MFA setup initiated for user: ${userId}`);

    return res.status(200).json({
      success: true,
      message: "Verification code sent to your phone",
    });
  } catch (error) {
    logger.error(`SMS MFA setup error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to set up SMS verification",
    });
  }
};

/**
 * Verify SMS code and enable MFA
 */
const verifySMS = async (req, res) => {
  try {
    const { token, phoneNumber } = req.body;
    const userId = req.user.id;

    if (!token || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Verification code and phone number are required",
      });
    }

    const user = await User.findById(userId);

    if (!user || !user.mfaSecret) {
      return res.status(400).json({
        success: false,
        message: "MFA setup not initiated",
      });
    }

    // Verify the token
    if (token !== user.mfaSecret) {
      logger.warn(`Invalid SMS verification for user: ${userId}`);
      return res.status(400).json({
        success: false,
        message: "Invalid verification code",
      });
    }

    // Generate backup codes
    const backupCodes = [];
    for (let i = 0; i < 10; i++) {
      const code = crypto.randomBytes(4).toString("hex");
      backupCodes.push({
        code,
        used: false,
      });
    }

    // Enable MFA
    user.mfaEnabled = true;
    user.mfaMethod = "sms";
    user.mfaSecret = phoneNumber; // Store phone number for future verifications
    user.backupCodes = backupCodes;
    await user.save();

    logger.info(`SMS MFA enabled for user: ${userId}`);

    return res.status(200).json({
      success: true,
      data: {
        backupCodes: backupCodes.map((code) => code.code),
      },
      message: "SMS verification enabled successfully",
    });
  } catch (error) {
    logger.error(`SMS verification error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to verify SMS code",
    });
  }
};

/**
 * Setup email-based MFA
 */
const setupEmail = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Generate a verification code
    const verificationCode = Math.floor(
      100000 + Math.random() * 900000
    ).toString();

    // Store the code temporarily
    user.mfaSecret = verificationCode;
    await user.save();

    // Send email with the code
    const subject = "Your MFA Verification Code";
    const message = `Your verification code is: ${verificationCode}`;
    await sendEmail(user.email, subject, message);

    logger.info(`Email MFA setup initiated for user: ${userId}`);

    return res.status(200).json({
      success: true,
      message: "Verification code sent to your email",
    });
  } catch (error) {
    logger.error(`Email MFA setup error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to set up email verification",
    });
  }
};

/**
 * Verify email code and enable MFA
 */
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user.id;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Verification code is required",
      });
    }

    const user = await User.findById(userId);

    if (!user || !user.mfaSecret) {
      return res.status(400).json({
        success: false,
        message: "MFA setup not initiated",
      });
    }

    // Verify the token
    if (token !== user.mfaSecret) {
      logger.warn(`Invalid email verification for user: ${userId}`);
      return res.status(400).json({
        success: false,
        message: "Invalid verification code",
      });
    }

    // Generate backup codes
    const backupCodes = [];
    for (let i = 0; i < 10; i++) {
      const code = crypto.randomBytes(4).toString("hex");
      backupCodes.push({
        code,
        used: false,
      });
    }

    // Enable MFA
    user.mfaEnabled = true;
    user.mfaMethod = "email";
    user.mfaSecret = "email"; // Just a marker that email is used
    user.backupCodes = backupCodes;
    await user.save();

    logger.info(`Email MFA enabled for user: ${userId}`);

    return res.status(200).json({
      success: true,
      data: {
        backupCodes: backupCodes.map((code) => code.code),
      },
      message: "Email verification enabled successfully",
    });
  } catch (error) {
    logger.error(`Email verification error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to verify email code",
    });
  }
};

/**
 * Disable MFA
 */
const disableMFA = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Disable MFA
    user.mfaEnabled = false;
    user.mfaMethod = "none";
    user.mfaSecret = null;
    user.backupCodes = [];
    await user.save();

    logger.info(`MFA disabled for user: ${userId}`);

    return res.status(200).json({
      success: true,
      message: "MFA disabled successfully",
    });
  } catch (error) {
    logger.error(`Disable MFA error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to disable MFA",
    });
  }
};

/**
 * Verify MFA during login
 */
const verifyMFA = async (req, res) => {
  try {
    const { userId, token, method, backupCode } = req.body;

    const user = await User.findById(userId);

    if (!user || !user.mfaEnabled) {
      return res.status(400).json({
        success: false,
        message: "MFA not enabled for this user",
      });
    }

    let isValid = false;

    // Check if using backup code
    if (backupCode) {
      const backupCodeObj = user.backupCodes.find(
        (code) => code.code === backupCode && !code.used
      );

      if (backupCodeObj) {
        // Mark the backup code as used
        backupCodeObj.used = true;
        await user.save();

        isValid = true;
        logger.info(`Backup code used for user: ${userId}`);
      }
    } else if (method === "totp" && user.mfaMethod === "totp") {
      // Verify TOTP
      isValid = authenticator.verify({
        token,
        secret: user.mfaSecret,
      });
    } else if (
      (method === "sms" || method === "email") &&
      user.mfaMethod === method
    ) {
      // Verify SMS or email code
      isValid = token === user.mfaSecret;

      // Invalidate the code after use
      if (isValid) {
        user.mfaSecret = crypto.randomBytes(20).toString("hex");
        await user.save();
      }
    }

    if (!isValid) {
      logger.warn(`Invalid MFA verification for user: ${userId}`);
      return res.status(400).json({
        success: false,
        message: "Invalid verification code",
      });
    }

    logger.info(`MFA verified for user: ${userId}`);

    return res.status(200).json({
      success: true,
      message: "MFA verification successful",
    });
  } catch (error) {
    logger.error(`MFA verification error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to verify MFA",
    });
  }
};

module.exports = {
  setupTOTP,
  verifyTOTP,
  setupSMS,
  verifySMS,
  setupEmail,
  verifyEmail,
  disableMFA,
  verifyMFA,
};
