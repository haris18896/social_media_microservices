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

    // Get public key for verification
    let publicKey;
    try {
      // Try to read from local path
      publicKey = fs.readFileSync(path.join(__dirname, "../keys/public.key"));
    } catch (err) {
      // If local key not available, use environment variable
      if (process.env.JWT_PUBLIC_KEY) {
        publicKey = Buffer.from(process.env.JWT_PUBLIC_KEY, "base64").toString(
          "ascii"
        );
      } else {
        logger.error("Public key for JWT verification not found");
        return res.status(500).json({
          success: false,
          message: "Authentication error: key not available",
        });
      }
    }

    // Verify token
    const decoded = jwt.verify(token, publicKey, { algorithms: ["RS256"] });

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
