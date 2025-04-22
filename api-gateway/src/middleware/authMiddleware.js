const logger = require("../utils/logger");
const jwt = require("jsonwebtoken");

const validateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    logger.warn("Access attempt without token");
    return res.status(401).json({
      message: "Authentication failed, no token provided",
      success: false,
    });
  }

  try {
    jwt.verify(token, process.env.JWT_SECRET_KEY, (err, user) => {
      if (err) {
        logger.error("Token validation failed", err);
        return res.status(429).json({
          success: false,
          message: "Invalid token",
        });
      }

      req.user = user;
      next();
    });
  } catch (error) {
    logger.error("Token validation failed", error);
    return res.status(429).json({
      success: false,
      message: "Invalid token",
    });
  }
};

module.exports = {
  validateToken,
};
