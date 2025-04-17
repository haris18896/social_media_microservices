const cors = require("cors");
const Redis = require("ioredis");
const dotenv = require("dotenv");
const helmet = require("helmet");
const express = require("express");
const { RedisStore } = require("rate-limit-redis");
const rateLimit = require("express-rate-limit");
const { RateLimiterRedis } = require("rate-limiter-flexible");

// ** Database
const ConnectToDB = require("./database/db");

// ** Utils and helpers
const logger = require("./utils/logger");

// ** Middleware
const { errorHandler, notFoundHandler } = require("./middleware/errorhandler");

// ** Custom Routes
const routes = require("./routes/identity-service");

dotenv.config();
const app = express();

const PORT = process.env.PORT || 3001;

// connect to mongo db
ConnectToDB();
const redisClient = new Redis(process.env.REDIS_URL);

// middleware
app.use(express.json());
app.use(helmet());
app.use(cors());

app.use((req, res, next) => {
  logger.info(`Received ${req.method} request to ${req.url}`);
  logger.info(`Request body: ${JSON.stringify(req.body)}`);
  next();
});

// DDos Protection
const rateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "middleware",
  points: 10,
  duration: 1,
}); // 10 requests per second

// rate limitng
app.use(async (req, res, next) => {
  await rateLimiter
    .consume(req.ip)
    .then(() => {
      next();
    })
    .catch(() => {
      logger.error("Rate limit exceeded for IP: ", req.ip);
      return res.status(429).json({
        message: "Too many requests, please try again later",
      });
    });
});

// IP based rate limiting for sensitive endpoints
const sensitiveEndpoints = rateLimit({
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

// apply rate limiting to sensitive endpoints
app.use("/api/auth/register", sensitiveEndpoints);
app.use("/api/auth/login", sensitiveEndpoints);

// routes
app.use("/api/auth", routes);

// Error handling middleware
app.use(errorHandler);
app.use(notFoundHandler);

// start the server
app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
});

// Unhandled promise rejection
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
});
