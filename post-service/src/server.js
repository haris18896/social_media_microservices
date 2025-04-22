const cors = require("cors");
const helmet = require("helmet");
const Redis = require("ioredis");
const dotenv = require("dotenv");
const express = require("express");
const rateLimit = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");

const logger = require("./utils/logger");
const ConnectToDB = require("./database/db");
const postRoutes = require("./routes/postRoutes");
const { errorHandler, notFoundHandler } = require("./middleware/errorHandler");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3002;

// connect to mongo db
ConnectToDB();
const redisClient = new Redis(process.env.REDIS_URL);

// middleware
app.use(cors());
app.use(helmet());
app.use(express.json());

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
app.use("/api/posts", sensitiveEndpoints);

// routes -> pass redisClient to routes
app.use(
  "/api/posts",
  (req, res, next) => {
    req.redisClient = redisClient;
    next();
  },
  postRoutes
);

// error handling
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
