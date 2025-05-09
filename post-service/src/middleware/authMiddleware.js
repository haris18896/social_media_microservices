const logger = require("../utils/logger");

const authenticatedRequest = (req, res, next) => {
  const userId = req.headers["x-user-id"];

  if (!userId) {
    logger.warn("Access attempt without user ID");
    return res.status(401).json({
      success: false,
      message: "Authentication failed, no user ID provided",
    });
  }

  req.user = userId;
  next();
};

module.exports = {
  authenticatedRequest,
};
