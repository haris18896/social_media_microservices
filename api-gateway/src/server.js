const dotenv = require("dotenv");
const express = require("express");
const logger = require("./utils/logger");
const Redis = require("ioredis");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const { createProxyMiddleware } = require("http-proxy-middleware");
const { v4: uuidv4 } = require("uuid");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");
const path = require("path");
const { expressjwt: jwt } = require("express-jwt");
const fs = require("fs");
const prometheusMiddleware = require("express-prom-bundle");

// Load environment variables
dotenv.config();

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Define service URLs with defaults
const IDENTITY_SERVICE_URL =
  process.env.IDENTITY_SERVICE_URL || "http://localhost:3001";
const POST_SERVICE_URL =
  process.env.POST_SERVICE_URL || "http://localhost:3002";
const SEARCH_SERVICE_URL =
  process.env.SEARCH_SERVICE_URL || "http://localhost:3003";
const MEDIA_SERVICE_URL =
  process.env.MEDIA_SERVICE_URL || "http://localhost:3004";

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
app.use(express.json({ limit: "10mb" }));

// Apply security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"], // For Swagger UI
        styleSrc: ["'self'", "'unsafe-inline'"], // For Swagger UI
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
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400, // 24 hours
  })
);

// Prometheus monitoring
const metricsMiddleware = prometheusMiddleware({
  includeMethod: true,
  includePath: true,
  includeStatusCode: true,
  includeUp: true,
  customLabels: { project: "social_media_microservices" },
  promClient: {
    collectDefaultMetrics: {},
  },
});
app.use(metricsMiddleware);

// Correlation ID middleware for request tracing
app.use((req, res, next) => {
  const correlationId = req.headers["x-correlation-id"] || uuidv4();
  req.correlationId = correlationId;
  res.setHeader("x-correlation-id", correlationId);
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();

  logger.info(
    `[${req.correlationId}] Received ${req.method} request to ${req.url} from ${req.ip}`
  );

  // Log request body for non-GET requests, but sanitize sensitive data
  if (req.method !== "GET" && req.body) {
    const sanitizedBody = { ...req.body };

    // Remove sensitive fields
    if (sanitizedBody.password) sanitizedBody.password = "[REDACTED]";
    if (sanitizedBody.refreshToken) sanitizedBody.refreshToken = "[REDACTED]";
    if (sanitizedBody.token) sanitizedBody.token = "[REDACTED]";

    logger.debug(
      `[${req.correlationId}] Request body: ${JSON.stringify(sanitizedBody)}`
    );
  }

  // Log response details
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const statusCode = res.statusCode;

    if (statusCode >= 400) {
      logger.warn(
        `[${req.correlationId}] ${req.method} ${req.url} responded with ${statusCode} in ${duration}ms`
      );
    } else {
      logger.info(
        `[${req.correlationId}] ${req.method} ${req.url} responded with ${statusCode} in ${duration}ms`
      );
    }
  });

  next();
});

// Rate Limiter (if Redis is available)
if (redisClient) {
  const rateLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.error(
        `[${req.correlationId}] Rate limit exceeded for IP: ${req.ip}`
      );
      return res.status(429).json({
        success: false,
        message: "Too many requests, please try again later",
      });
    },
    store: new RedisStore({
      sendCommand: (...args) => redisClient.call(...args),
      prefix: "rl:api:",
    }),
  });

  app.use(rateLimiter);
} else {
  // Fallback rate limiting if Redis is not available
  const fallbackLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: "Too many requests, please try again later",
    },
  });

  app.use(fallbackLimiter);
}

// Load JWT public key for verification
let publicKey;
try {
  publicKey = fs.readFileSync(
    path.join(__dirname, "../../identity-service/src/keys/public.key")
  );
  logger.info("JWT public key loaded successfully");
} catch (error) {
  logger.warn(`Could not load JWT public key: ${error.message}`);
  logger.warn("JWT validation will not be available");
}

// JWT validation middleware (if public key is available)
const validateJwt = publicKey
  ? jwt({
      secret: publicKey,
      algorithms: ["RS256"],
      credentialsRequired: false,
      requestProperty: "auth",
    })
  : (req, res, next) => next();

// Error handler for JWT validation
app.use((err, req, res, next) => {
  if (err.name === "UnauthorizedError") {
    logger.warn(`[${req.correlationId}] JWT validation failed: ${err.message}`);
    // Don't reject the request, just mark it as unauthenticated
    // This allows public endpoints to work
    req.auth = null;
    next();
  } else {
    next(err);
  }
});

// Health check endpoint (no rate limiting)
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "UP",
    timestamp: new Date().toISOString(),
    service: "api-gateway",
    services: {
      identity: process.env.IDENTITY_SERVICE_URL,
      post: process.env.POST_SERVICE_URL,
      search: process.env.SEARCH_SERVICE_URL,
      media: process.env.MEDIA_SERVICE_URL,
    },
  });
});

// Circuit breaker configuration
const circuitBreakerOptions = {
  proxyTimeout: 10000, // 10 seconds
  timeout: 10000,
};

// Proxy Error Handler
const handleProxyError = (err, req, res, serviceName) => {
  logger.error(
    `[${req.correlationId}] Proxy error from ${serviceName}: ${err.message}`
  );

  return res.status(err.statusCode || 500).json({
    success: false,
    message: `Service unavailable: ${serviceName}`,
    error:
      process.env.NODE_ENV === "development"
        ? err.message
        : "Internal server error",
  });
};

// Common proxy options
const createProxyOptions = (serviceName, serviceUrl) => ({
  target: serviceUrl,
  changeOrigin: true,
  pathRewrite: { [`^/v1/${serviceName}`]: "/api" },
  logLevel: "silent",
  secure: process.env.NODE_ENV === "production",
  onProxyReq: (proxyReq, req, res) => {
    // Add correlation ID to proxied request
    proxyReq.setHeader("x-correlation-id", req.correlationId);

    // If JWT was validated, pass user ID to service
    if (req.auth && req.auth.sub) {
      proxyReq.setHeader("x-user-id", req.auth.sub);
    }

    // Log proxy request
    logger.debug(
      `[${req.correlationId}] Proxying ${req.method} ${req.url} to ${serviceUrl}`
    );
  },
  onProxyRes: (proxyRes, req, res) => {
    const status = proxyRes.statusCode;

    // Log proxy response
    if (status >= 400) {
      logger.warn(
        `[${req.correlationId}] Proxy response from ${serviceName}: ${status}`
      );
    } else {
      logger.debug(
        `[${req.correlationId}] Proxy response from ${serviceName}: ${status}`
      );
    }

    // Add service name to response headers
    proxyRes.headers["x-service"] = serviceName;
  },
  onError: (err, req, res) => handleProxyError(err, req, res, serviceName),
});

// Health checker function for services
const checkServiceHealth = async (serviceUrl, serviceName) => {
  try {
    const response = await fetch(`${serviceUrl}/health`, {
      timeout: 5000,
      headers: { Accept: "application/json" },
    });
    const data = await response.json();
    return { status: response.ok, data };
  } catch (error) {
    logger.warn(`Health check failed for ${serviceName}: ${error.message}`);
    return { status: false, error: error.message };
  }
};

// API Routes with JWT validation
app.use(
  "/v1/auth",
  validateJwt,
  createProxyMiddleware(createProxyOptions("auth", IDENTITY_SERVICE_URL))
);
app.use(
  "/v1/posts",
  validateJwt,
  createProxyMiddleware(createProxyOptions("posts", POST_SERVICE_URL))
);
app.use(
  "/v1/search",
  validateJwt,
  createProxyMiddleware(createProxyOptions("search", SEARCH_SERVICE_URL))
);
app.use(
  "/v1/media",
  validateJwt,
  createProxyMiddleware(createProxyOptions("media", MEDIA_SERVICE_URL))
);

// Swagger documentation
try {
  const swaggerDocument = YAML.load(path.join(__dirname, "docs/swagger.yaml"));
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));
  logger.info("Swagger documentation loaded successfully");
} catch (error) {
  logger.warn(`Could not load Swagger documentation: ${error.message}`);
}

// Services health endpoint
app.get("/services/health", async (req, res) => {
  const serviceChecks = {
    identity: await checkServiceHealth(
      IDENTITY_SERVICE_URL,
      "identity-service"
    ),
    post: await checkServiceHealth(POST_SERVICE_URL, "post-service"),
    search: await checkServiceHealth(SEARCH_SERVICE_URL, "search-service"),
    media: await checkServiceHealth(MEDIA_SERVICE_URL, "media-service"),
  };

  const allServicesUp = Object.values(serviceChecks).every(
    (check) => check.status
  );

  res.status(allServicesUp ? 200 : 503).json({
    status: allServicesUp ? "UP" : "DEGRADED",
    timestamp: new Date().toISOString(),
    services: serviceChecks,
  });
});

// 404 handler
app.use((req, res) => {
  logger.warn(
    `[${req.correlationId}] Route not found: ${req.method} ${req.url}`
  );
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error(`[${req.correlationId}] Unhandled error: ${err.message}`);
  logger.error(err.stack);

  res.status(500).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message,
  });
});

// Start the server
const server = app.listen(PORT, () => {
  logger.info(`API Gateway is running on port ${PORT}`);
  logger.info(`Identity Service URL: ${IDENTITY_SERVICE_URL}`);
  logger.info(`Post Service URL: ${POST_SERVICE_URL}`);
  logger.info(`Search Service URL: ${SEARCH_SERVICE_URL}`);
  logger.info(`Media Service URL: ${MEDIA_SERVICE_URL}`);
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
