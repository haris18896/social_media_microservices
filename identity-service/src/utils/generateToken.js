const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const RefreshToken = require("../models/refreshToken");
const logger = require("./logger");

/**
 * Generates JWT tokens using RS256 algorithm with asymmetric key pairs
 * @param {Object} user - User object from database
 * @param {string} ip - User's IP address for security tracking
 * @returns {Object} Object containing accessToken and refreshToken
 */
const generateTokens = async (user, ip = "unknown") => {
  try {
    // Read private key for signing
    const privateKey = fs.readFileSync(
      path.join(__dirname, "../keys/private.key")
    );

    // Payload with additional security claims
    const payload = {
      sub: user._id.toString(),
      username: user.username,
      email: user.email,
      iat: Math.floor(Date.now() / 1000),
      ip: ip, // Include IP for security tracking
    };

    // Sign with RS256 algorithm
    const accessToken = jwt.sign(payload, privateKey, {
      algorithm: "RS256",
      expiresIn: "15m",
    });

    // Generate a cryptographically secure refresh token
    const refreshToken = crypto.randomBytes(64).toString("hex");

    // Set expiration for refresh token - 7 days
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Store refresh token in database with user reference
    await RefreshToken.create({
      token: refreshToken,
      user: user._id,
      expiresAt,
      ip: ip, // Store IP with refresh token for security audit
    });

    logger.info(`Tokens generated for user: ${user._id} from IP: ${ip}`);

    return { accessToken, refreshToken };
  } catch (error) {
    logger.error(`Token generation failed: ${error.message}`);
    throw new Error("Failed to generate authentication tokens");
  }
};

module.exports = generateTokens;
