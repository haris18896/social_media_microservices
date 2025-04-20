const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const logger = require("../utils/logger");

/**
 * Middleware to verify JWT token authenticity and validity
 * Uses RS256 algorithm with public key for verification
 */
const verifyToken = (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      logger.warn("Missing or invalid authorization header");
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided.",
      });
    }

    const token = authHeader.split(" ")[1];

    // Read public key for verification
    const publicKey = fs.readFileSync(
      path.join(__dirname, "../keys/public.key")
    );

    // Verify the token
    const decoded = jwt.verify(token, publicKey, { algorithms: ["RS256"] });

    // Check for token tampering - if IP in token doesn't match request IP
    const requestIP = req.ip || req.connection.remoteAddress;
    if (decoded.ip && decoded.ip !== "unknown" && decoded.ip !== requestIP) {
      logger.warn(`Token IP mismatch: ${decoded.ip} vs ${requestIP}`);
      return res.status(401).json({
        success: false,
        message: "Invalid token. Authentication failed.",
      });
    }

    // Add decoded user to request object
    req.user = {
      id: decoded.sub,
      username: decoded.username,
      email: decoded.email,
    };

    logger.info(`Token verified for user: ${decoded.sub}`);
    next();
  } catch (error) {
    // Handle different JWT verification errors
    if (error.name === "TokenExpiredError") {
      logger.warn("Token expired");
      return res.status(401).json({
        success: false,
        message: "Token expired. Please login again.",
      });
    }

    if (error.name === "JsonWebTokenError") {
      logger.warn(`JWT error: ${error.message}`);
      return res.status(401).json({
        success: false,
        message: "Invalid token. Authentication failed.",
      });
    }

    logger.error(`Token verification error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to authenticate token.",
    });
  }
};

module.exports = verifyToken;
