const dotenv = require("dotenv");
const express = require("express");
const app = express();
const logger = require("./utils/logger");
const Redis = require("ioredis");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const proxy = require("express-http-proxy");
const {
  errorHandler,
  notFoundHandler,
} = require("../../identity-service/src/middleware/errorhandler");
const { validateToken } = require("./middleware/authMiddleware");

dotenv.config();
const port = process.env.PORT || 3000;
// Define service URLs with defaults
const IDENTITY_SERVICE_URL =
  process.env.IDENTITY_SERVICE_URL || "http://localhost:3001";

// ** Redis
const redisClient = new Redis(process.env.REDIS_URL);
// ** Middleware
app.use(express.json());
app.use(helmet());
app.use(cors());

// Rate Limiter
const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.error("Rate limit exceeded for IP: ", req.ip);
    return res.status(429).json({
      message: "Too many requests, please try again later",
    });
  },
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
    prefix: "rl:sensitive:",
  }),
});

app.use(rateLimiter);

app.use((req, res, next) => {
  logger.info(`Received ${req.method} request to ${req.url}`);
  logger.info(`Request body: ${JSON.stringify(req.body)}`);
  next();
});

// Proxy Requests
const proxyOptions = {
  proxyReqPathResolver: (req) => {
    // Replace only the first occurrence of /v1 with /api
    const path = req.originalUrl;
    const newPath = path.replace(/^\/v1(?=\/)/, "/api");
    logger.info(`Proxying request from ${path} to ${newPath}`);
    return newPath;
  },
  proxyErrorHandler: (err, res, next) => {
    logger.error("Proxy error: ", err);
    return res.status(500).json({
      message: `Proxy error occurred, ${err}`,
    });
  },
};

// setting up proxy for our identity service
app.use(
  "/v1/auth",
  proxy(IDENTITY_SERVICE_URL, {
    ...proxyOptions,
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      proxyReqOpts.headers["Content-Type"] = "application/json";
      return proxyReqOpts;
    },
    userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
      logger.info(
        "Proxy response from identity service: ",
        proxyRes.statusCode
      );
      return proxyResData;
    },
  })
);

// setting up proxy for our post service
app.use(
  "/v1/posts",
  validateToken,
  proxy(process.env.POST_SERVICE_URL, {
    ...proxyOptions,
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      proxyReqOpts.headers["Content-Type"] = "application/json";
      proxyReqOpts.headers["x-user-id"] = srcReq.user.userId;
      return proxyReqOpts;
    },
    userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
      logger.info("Proxy response from post service: ", proxyRes.statusCode);
      return proxyResData;
    },
  })
);

// setting up proxy for our media service
app.use(
  "/v1/media",
  validateToken,
  proxy(process.env.MEDIA_SERVICE_URL, {
    ...proxyOptions,
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      proxyReqOpts.headers = proxyReqOpts.headers || {};
      if (srcReq.user && srcReq.user.userId) {
        proxyReqOpts.headers["x-user-id"] = srcReq.user.userId;
      }

      // Handle Content-Type
      const contentType = srcReq.headers["content-type"];
      if (!contentType || !contentType.startsWith("multipart/form-data")) {
        proxyReqOpts.headers["Content-Type"] = "application/json";
      }

      return proxyReqOpts;
    },
    userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
      logger.info("Proxy response from media service: ", proxyRes.statusCode);
      return proxyResData;
    },
    parseReqBody: false, // Keep this to allow streaming for uploads
  })
);

// setting up proxy for our search service
app.use(
  "/v1/search",
  validateToken,
  proxy(process.env.SEARCH_SERVICE_URL, {
    ...proxyOptions,
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      proxyReqOpts.headers["Content-Type"] = "application/json";
      proxyReqOpts.headers["x-user-id"] = srcReq.user.userId;
      return proxyReqOpts;
    },
    userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
      logger.info("Proxy response from search service: ", proxyRes.statusCode);
      return proxyResData;
    },
  })
);

app.use(errorHandler);
app.use(notFoundHandler);

app.listen(port, () => {
  logger.info(`API Gateway is running on port ${port}`);
  logger.info(`Identity Service is running on ${IDENTITY_SERVICE_URL}`);
  logger.info(`Redis is running on ${process.env.REDIS_URL}`);
  logger.info(`Post Service is running on ${process.env.POST_SERVICE_URL}`);
  logger.info(`Media Service is running on ${process.env.MEDIA_SERVICE_URL}`);
  logger.info(`Search Service is running on ${process.env.SEARCH_SERVICE_URL}`);
});
