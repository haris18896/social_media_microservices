const RefreshToken = require("../models/refreshToken");
const User = require("../models/User");
const generateTokens = require("../utils/generateToken");
const logger = require("../utils/logger");

/**
 * Controller to refresh an access token using a valid refresh token
 * Implements token rotation - invalidates used refresh tokens for security
 */
const refreshAccessToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      logger.warn("Refresh token missing in request");
      return res.status(400).json({
        success: false,
        message: "Refresh token is required",
      });
    }

    // Get client IP for security tracking
    const ip = req.ip || req.connection.remoteAddress || "unknown";

    // Find the refresh token in the database
    const refreshTokenDoc = await RefreshToken.findOne({
      token: refreshToken,
      isRevoked: false,
      expiresAt: { $gt: new Date() },
    });

    if (!refreshTokenDoc) {
      logger.warn(
        `Invalid or expired refresh token: ${refreshToken.substring(0, 10)}...`
      );
      return res.status(401).json({
        success: false,
        message: "Invalid or expired refresh token",
      });
    }

    // Check if the token is being used from a different IP
    if (
      refreshTokenDoc.ip &&
      refreshTokenDoc.ip !== "unknown" &&
      refreshTokenDoc.ip !== ip &&
      process.env.NODE_ENV === "production"
    ) {
      logger.warn(
        `Potential refresh token theft: Token issued to ${refreshTokenDoc.ip} but used from ${ip}`
      );

      // Revoke all tokens for this user as a security measure
      await RefreshToken.updateMany(
        { user: refreshTokenDoc.user },
        {
          isRevoked: true,
          revokedReason: "Security breach - token used from different IP",
        }
      );

      return res.status(401).json({
        success: false,
        message: "Security alert: Please login again",
      });
    }

    // Get the user from the refresh token
    const user = await User.findById(refreshTokenDoc.user);

    if (!user) {
      logger.warn(
        `User not found for refresh token: ${refreshToken.substring(0, 10)}...`
      );
      return res.status(401).json({
        success: false,
        message: "Invalid refresh token",
      });
    }

    // Revoke the current refresh token (token rotation for security)
    refreshTokenDoc.isRevoked = true;
    refreshTokenDoc.revokedReason = "Used for token refresh";
    await refreshTokenDoc.save();

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = await generateTokens(
      user,
      ip
    );

    logger.info(`Access token refreshed for user: ${user._id}`);

    // Return new tokens
    return res.status(200).json({
      success: true,
      data: {
        accessToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (error) {
    logger.error(`Token refresh error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to refresh token",
    });
  }
};

/**
 * Revoke a refresh token (logout)
 */
const revokeRefreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: "Refresh token is required",
      });
    }

    // Find and revoke the token
    const result = await RefreshToken.updateOne(
      { token: refreshToken },
      {
        isRevoked: true,
        revokedReason: "Manually revoked by user (logout)",
      }
    );

    if (result.modifiedCount === 0) {
      logger.warn(
        `Attempted to revoke non-existent token: ${refreshToken.substring(0, 10)}...`
      );
      return res.status(200).json({
        success: true,
        message: "Token already revoked or not found",
      });
    }

    logger.info(`Refresh token revoked: ${refreshToken.substring(0, 10)}...`);

    return res.status(200).json({
      success: true,
      message: "Token revoked successfully",
    });
  } catch (error) {
    logger.error(`Token revocation error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to revoke token",
    });
  }
};

/**
 * Revoke all refresh tokens for a user (logout from all devices)
 */
const revokeAllRefreshTokens = async (req, res) => {
  try {
    const userId = req.user.id;

    // Revoke all active tokens for the user
    const result = await RefreshToken.updateMany(
      {
        user: userId,
        isRevoked: false,
        expiresAt: { $gt: new Date() },
      },
      {
        isRevoked: true,
        revokedReason: "Logout from all devices",
      }
    );

    logger.info(
      `All refresh tokens revoked for user: ${userId}, count: ${result.modifiedCount}`
    );

    return res.status(200).json({
      success: true,
      message: `${result.modifiedCount} tokens revoked successfully`,
    });
  } catch (error) {
    logger.error(`All tokens revocation error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to revoke all tokens",
    });
  }
};

module.exports = {
  refreshAccessToken,
  revokeRefreshToken,
  revokeAllRefreshTokens,
};
