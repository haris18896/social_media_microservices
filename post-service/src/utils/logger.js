const winston = require("winston");

const logger = winston.createLogger({
  level:
    process.env.LOG_LEVEL ||
    (process.env.NODE_ENV === "production" ? "info" : "debug"),
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: "post-service" },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(
          ({ timestamp, level, message, service, ...rest }) => {
            const restString =
              Object.keys(rest).length > 0
                ? `\n${JSON.stringify(rest, null, 2)}`
                : "";
            return `[${timestamp}] ${service} ${level}: ${message}${restString}`;
          }
        )
      ),
    }),
    new winston.transports.File({
      filename: "error.log",
      level: "error",
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: "combined.log",
      maxsize: 10485760, // 10MB
      maxFiles: 5,
    }),
  ],
});

// Add request context tracking
const getRequestLogger = (req) => {
  return {
    info: (message, meta = {}) => {
      logger.info(message, {
        correlationId: req.headers["x-correlation-id"],
        userId: req.headers["x-user-id"],
        path: req.path,
        method: req.method,
        ...meta,
      });
    },
    warn: (message, meta = {}) => {
      logger.warn(message, {
        correlationId: req.headers["x-correlation-id"],
        userId: req.headers["x-user-id"],
        path: req.path,
        method: req.method,
        ...meta,
      });
    },
    error: (message, meta = {}) => {
      logger.error(message, {
        correlationId: req.headers["x-correlation-id"],
        userId: req.headers["x-user-id"],
        path: req.path,
        method: req.method,
        ...meta,
      });
    },
    debug: (message, meta = {}) => {
      logger.debug(message, {
        correlationId: req.headers["x-correlation-id"],
        userId: req.headers["x-user-id"],
        path: req.path,
        method: req.method,
        ...meta,
      });
    },
  };
};

module.exports = {
  logger,
  getRequestLogger,
};
