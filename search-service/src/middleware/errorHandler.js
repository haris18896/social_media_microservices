const logger = require("../utils/logger");

const errorHandler = (err, req, res, next) => {
  logger.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || "Internal Server Error",
    stack: err.stack,
  });
};

const notFoundHandler = (req, res) => {
  logger.error(`${req.method} ${req.url} not found`);
  res.status(404).json({ message: "Not Found" });
};

module.exports = { errorHandler, notFoundHandler };
