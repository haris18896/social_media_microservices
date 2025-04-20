const cors = require("cors");
const Redis = require("ioredis");
const dotenv = require("dotenv");
const helmet = require("helmet");
const express = require("express");
const { RedisStore } = require("rate-limit-redis");
const rateLimit = require("express-rate-limit");
const { RateLimiterRedis } = require("rate-limiter-flexible");

// Load environment variables
dotenv.config();

// Utils and helpers
const logger = require("./utils/logger");
const generateRSAKeys = require("./utils/generateRSAKeys");

// Database connection
const ConnectToDB = require("./database/db");

// Middleware
const { errorHandler, notFoundHandler } = require("./middleware/errorhandler");

// Custom Routes
const authRoutes = require("./routes/identity-service");
const mfaRoutes = require("./routes/mfa");
const profileRoutes = require("./routes/profile");

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Generate RSA keys for JWT signing if they don't exist
try {
  generateRSAKeys();
} catch (error) {
  logger.error("Failed to generate RSA keys:", error);
  process.exit(1);
}

// Connect to MongoDB
ConnectToDB();

// Initialize Redis client
let redisClient;
try {
  redisClient = new Redis(process.env.REDIS_URL);
  logger.info(`Redis connected: ${process.env.REDIS_URL}`);

  // Set up Redis client error handling
  redisClient.on("error", (err) => {
    logger.error(`Redis error: ${err}`);
  });
} catch (error) {
  logger.warn(`Redis connection failed: ${error.message}`);
  logger.warn("Running without Redis. Rate limiting will be less effective.");
}

// Apply middleware
app.use(express.json());
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    xssFilter: true,
    noSniff: true,
    referrerPolicy: { policy: "same-origin" },
  })
);

// Configure CORS
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",")
      : "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400, // 24 hours
  })
);

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();

  logger.info(`Received ${req.method} request to ${req.url} from ${req.ip}`);

  // Log request body for non-GET requests, but sanitize sensitive data
  if (req.method !== "GET" && req.body) {
    const sanitizedBody = { ...req.body };

    // Remove sensitive fields
    if (sanitizedBody.password) sanitizedBody.password = "[REDACTED]";
    if (sanitizedBody.refreshToken) sanitizedBody.refreshToken = "[REDACTED]";
    if (sanitizedBody.token) sanitizedBody.token = "[REDACTED]";

    logger.debug(`Request body: ${JSON.stringify(sanitizedBody)}`);
  }

  // Log response details
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    if (statusCode >= 400) {
      logger.warn(
        `${req.method} ${req.url} responded with ${statusCode} in ${duration}ms`
      );
    } else {
      logger.info(
        `${req.method} ${req.url} responded with ${statusCode} in ${duration}ms`
      );
    }
  });

  next();
});

// DDoS Protection (if Redis is available)
if (redisClient) {
  const rateLimiter = new RateLimiterRedis({
    storeClient: redisClient,
    keyPrefix: "middleware",
    points: 10, // 10 requests
    duration: 1, // per 1 second
  });

  app.use(async (req, res, next) => {
    try {
      await rateLimiter.consume(req.ip);
      next();
    } catch (error) {
      logger.error(`Rate limit exceeded for IP: ${req.ip}`);
      return res.status(429).json({
        success: false,
        message: "Too many requests, please try again later",
      });
    }
  });

  // More strict rate limiting for sensitive endpoints
  const sensitiveEndpoints = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // 50 requests per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.error(`Sensitive endpoint rate limit exceeded for IP: ${req.ip}`);
      return res.status(429).json({
        success: false,
        message: "Too many requests, please try again later",
      });
    },
    store: new RedisStore({
      sendCommand: (...args) => redisClient.call(...args),
      prefix: "rl:sensitive:",
    }),
  });

  // Apply rate limiting to sensitive endpoints
  app.use("/api/auth/register", sensitiveEndpoints);
  app.use("/api/auth/login", sensitiveEndpoints);
  app.use("/api/auth/refresh-token", sensitiveEndpoints);
  app.use("/api/auth/mfa/setup", sensitiveEndpoints);
} else {
  // Fallback rate limiting if Redis is not available
  const fallbackLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: "Too many requests, please try again later",
    },
  });

  app.use(fallbackLimiter);
}

// Health check endpoint (no rate limiting)
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "UP",
    timestamp: new Date().toISOString(),
    service: "identity-service",
  });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/auth/mfa", mfaRoutes);
app.use("/api/auth/profile", profileRoutes);

// Error handling middleware
app.use(errorHandler);
app.use(notFoundHandler);

// Start the server
const server = app.listen(PORT, () => {
  logger.info(`Identity service is running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);
});

// Handle graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  server.close(() => {
    logger.info("Server closed");
    if (redisClient) {
      redisClient.quit().then(() => {
        logger.info("Redis connection closed");
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  });
});

// Unhandled promise rejection
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);

  // Exit with error
  process.exit(1);
});
