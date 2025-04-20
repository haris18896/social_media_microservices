const User = require("../models/User");
const RefreshToken = require("../models/refreshToken");
const logger = require("../utils/logger");

/**
 * Get user profile data
 */
const getProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).select(
      "-password -passwordHistory -backupCodes -mfaSecret"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    logger.error(`Get profile error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve user profile",
    });
  }
};

/**
 * Update user profile data
 */
const updateProfile = async (req, res) => {
  try {
    const userId = req.user.id;
    const { username, email } = req.body;

    // Validate update fields
    const updateData = {};
    if (username) updateData.username = username;
    if (email) updateData.email = email.toLowerCase();

    // Check if username or email is already taken
    if (username || email) {
      const existingUser = await User.findOne({
        $or: [
          ...(username ? [{ username }] : []),
          ...(email ? [{ email: email.toLowerCase() }] : []),
        ],
        _id: { $ne: userId },
      });

      if (existingUser) {
        if (existingUser.username === username) {
          return res.status(400).json({
            success: false,
            message: "Username is already taken",
          });
        }

        if (existingUser.email === email.toLowerCase()) {
          return res.status(400).json({
            success: false,
            message: "Email is already registered",
          });
        }
      }
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true }
    ).select("-password -passwordHistory -backupCodes -mfaSecret");

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    logger.info(`Profile updated for user: ${userId}`);

    return res.status(200).json({
      success: true,
      data: updatedUser,
      message: "Profile updated successfully",
    });
  } catch (error) {
    logger.error(`Update profile error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to update user profile",
    });
  }
};

/**
 * Change user password
 */
const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);

    if (!isMatch) {
      logger.warn(`Invalid current password for user: ${userId}`);
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // Check if new password is the same as current
    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: "New password must be different from current password",
      });
    }

    // Check if password was used before
    const isReused = await user.isPasswordReused(newPassword);

    if (isReused) {
      logger.warn(`Password reuse attempt for user: ${userId}`);
      return res.status(400).json({
        success: false,
        message:
          "Password has been used before, please choose a different password",
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    // Revoke all refresh tokens for security
    await RefreshToken.updateMany(
      { user: userId, isRevoked: false },
      { isRevoked: true, revokedReason: "Password changed" }
    );

    logger.info(`Password changed for user: ${userId}`);

    return res.status(200).json({
      success: true,
      message:
        "Password changed successfully. Please login again with your new password.",
    });
  } catch (error) {
    logger.error(`Change password error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to change password",
    });
  }
};

/**
 * Get active sessions (refresh tokens)
 */
const getActiveSessions = async (req, res) => {
  try {
    const userId = req.user.id;

    const sessions = await RefreshToken.find({
      user: userId,
      isRevoked: false,
      expiresAt: { $gt: new Date() },
    }).select("createdAt ip expiresAt");

    return res.status(200).json({
      success: true,
      data: sessions,
    });
  } catch (error) {
    logger.error(`Get sessions error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve active sessions",
    });
  }
};

/**
 * Revoke a specific session (refresh token)
 */
const revokeSession = async (req, res) => {
  try {
    const userId = req.user.id;
    const { tokenId } = req.params;

    const result = await RefreshToken.updateOne(
      {
        _id: tokenId,
        user: userId,
        isRevoked: false,
      },
      {
        isRevoked: true,
        revokedReason: "Manually revoked by user",
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Session not found or already revoked",
      });
    }

    logger.info(`Session revoked for user: ${userId}, token: ${tokenId}`);

    return res.status(200).json({
      success: true,
      message: "Session revoked successfully",
    });
  } catch (error) {
    logger.error(`Revoke session error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to revoke session",
    });
  }
};

/**
 * Revoke all sessions (refresh tokens)
 */
const revokeAllSessions = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await RefreshToken.updateMany(
      {
        user: userId,
        isRevoked: false,
        expiresAt: { $gt: new Date() },
      },
      {
        isRevoked: true,
        revokedReason: "All sessions revoked by user",
      }
    );

    logger.info(
      `All sessions revoked for user: ${userId}, count: ${result.modifiedCount}`
    );

    return res.status(200).json({
      success: true,
      message: "All sessions revoked successfully",
    });
  } catch (error) {
    logger.error(`Revoke all sessions error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to revoke all sessions",
    });
  }
};

/**
 * Export account data (GDPR compliance)
 */
const exportAccountData = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).select(
      "-password -passwordHistory -backupCodes -mfaSecret"
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Get user's sessions
    const sessions = await RefreshToken.find({
      user: userId,
    }).select("createdAt ip expiresAt isRevoked revokedReason");

    // Compile export data
    const exportData = {
      userProfile: user.toJSON(),
      sessions: sessions.map((session) => session.toJSON()),
      exportDate: new Date().toISOString(),
    };

    logger.info(`Account data exported for user: ${userId}`);

    return res.status(200).json({
      success: true,
      data: exportData,
    });
  } catch (error) {
    logger.error(`Export account data error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to export account data",
    });
  }
};

module.exports = {
  getProfile,
  updateProfile,
  changePassword,
  getActiveSessions,
  revokeSession,
  revokeAllSessions,
  exportAccountData,
};
