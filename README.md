# Building a Modern Social Media Platform with Microservices

## Introduction

Welcome to the journey of building a scalable social media platform using microservices architecture! In this blog, I'll walk you through each component of our **Social Media Microservices** project, explaining design decisions, implementation details, and best practices.

Our platform demonstrates how to build a robust, scalable system that can handle the complex requirements of a modern social network. By breaking down our application into specialized services, we achieve better maintainability, scalability, and fault isolation—critical factors for any production-grade application.

## The Power of Microservices Architecture

Traditional monolithic applications bundle all functionality into a single codebase, leading to complexity, difficult debugging, and scaling challenges. Our microservices approach separates concerns into specialized services that:

- Can be developed, deployed, and scaled independently
- Can use different technologies based on specific requirements
- Provide better fault isolation (a failure in one service doesn't bring down the entire system)
- Enable easier maintenance and feature development

Let's explore our architecture diagram:

```
┌─────────────────┐         ┌───────────────────┐
│                 │         │                   │
│    Client       │ ───────▶│   API Gateway     │
│    Application  │         │   (Port 3000)     │
│                 │◀─────── │                   │
└─────────────────┘         └───────────────────┘
                                     │
                                     │
                                     ▼
┌──────────────────────────────────────────────────────┐
│                                                      │
│  ┌──────────────┐   ┌────────────┐   ┌────────────┐  │
│  │              │   │            │   │            │  │
│  │   Identity   │   │   Post     │   │   Media    │  │
│  │   Service    │   │   Service  │   │   Service  │  │
│  │  (Port 3001) │   │ (Port 3002)│   │ (Port 3003)│  │
│  │              │   │            │   │            │  │
│  └──────────────┘   └────────────┘   └────────────┘  │
│         │                 │                │         │
│         │                 │                │         │
│         ▼                 ▼                ▼         │
│  ┌──────────────────────────────────────────────┐   │
│  │                                              │   │
│  │              Search Service                  │   │
│  │               (Port 3004)                    │   │
│  │                                              │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
└──────────────────────────────────────────────────────┘
```

## Behind the Scenes: Core Technologies

Our application relies on a carefully chosen stack of technologies:

### 1. Node.js & Express

The foundation of our microservices. Node.js gives us a non-blocking, event-driven runtime that's perfect for handling many concurrent connections—ideal for social platforms where real-time interactions are crucial.

Express provides a minimal, flexible web framework that makes building APIs straightforward, with powerful middleware capabilities.

### 2. MongoDB

As our primary database, MongoDB offers:
- Schema flexibility for evolving data models (crucial for social platforms where features frequently change)
- Horizontal scaling capabilities
- JSON-like document structure that aligns naturally with JavaScript
- Rich querying capabilities

### 3. Redis

Our Redis integration serves multiple critical functions:
- **Caching:** Dramatically improves response times for frequently accessed data
- **Rate limiting:** Protects our APIs from abuse and DoS attacks
- **Session management:** Enables stateless services while maintaining user context

### 4. RabbitMQ

The backbone of our event-driven architecture, RabbitMQ allows our services to communicate asynchronously through:
- **Reliable message delivery:** Ensures important events (like post creation) are never lost
- **Message routing:** Using topics to direct events to interested services
- **Decoupling:** Services publish events without knowing who consumes them

### 5. JWT Authentication

Our secure token-based authentication system:
- Enables stateless authentication across services
- Uses refresh tokens for improved security
- Implements proper token validation and refresh mechanisms

## The Microservices Ecosystem: Under the Hood

### API Gateway (Port 3000)

Our API Gateway serves as the single entry point for all client requests, acting as a smart proxy that routes traffic to the appropriate internal service. Let's look at how it handles requests:

```javascript
// Proxy requests to the post service
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
```

The API Gateway provides several benefits:
- **Authentication enforcement:** All requests are validated for proper JWT tokens
- **Request logging:** Comprehensive logs for debugging and monitoring
- **Rate limiting:** Protection against excessive requests
- **Header management:** Consistent header handling and enrichment for internal services

### Identity Service (Port 3001)

At the core of our platform's security, the Identity Service handles all user-related operations. When a user registers, the service does the following:

```javascript
const registerUser = async (req, res) => {
  try {
    // Validate input data
    const { error } = validationRegistration(req.body);
    if (error) {
      return res
        .status(400)
        .json({ success: false, message: error.details[0].message });
    }
    
    const { username, password, email } = req.body;

    // Check for existing users
    let user = await User.findOne({ $or: [{ username }, { email }] });
    if (user) {
      return res
        .status(400)
        .json({ success: false, message: "User already exists" });
    }

    // Create and save user with hashed password (happens in the model)
    user = await User({ username, password, email });
    await user.save();
    
    // Generate tokens
    const { accessToken, refreshToken } = await generateTokens(user);

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: user,
      accessToken,
      refreshToken,
    });
  } catch (err) {
    logger.error("Error registering user : ", err);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
};
```

The service provides:
- **Secure password handling:** Using Argon2 for industry-leading password hashing
- **Comprehensive validation:** Using Joi for input validation
- **Token generation:** Creating and managing JWT tokens
- **Token refresh mechanism:** Enabling secure long-term sessions

### Post Service (Port 3002)

The Post Service manages the core content of our social platform. When creating a post, it:

```javascript
const createPost = async (req, res) => {
  try {
    // Validate the request
    const { error } = validationCreatePost(req.body);
    if (error) {
      return res
        .status(400)
        .json({ success: false, message: error.details[0].message });
    }
    
    const { content, mediaIds } = req.body;

    // Create and save the post
    const newlyCreatedPost = new Post({
      user: req.user,
      content,
      mediaIds: mediaIds || [],
    });

    await newlyCreatedPost.save();

    // Publish event to notify other services
    await publishEvent(
      "post.created",
      JSON.stringify({
        postId: newlyCreatedPost._id.toString(),
        userId: req.user.toString(),
        content: newlyCreatedPost.content,
        mediaIds: newlyCreatedPost.mediaIds,
      })
    );

    // Invalidate cache
    await invalidatePostCache(req, newlyCreatedPost._id.toString());
    
    return res.status(201).json({
      success: true,
      message: "Post created successfully",
      post: newlyCreatedPost,
    });
  } catch (error) {
    logger.error("Error creating post", error);
    return res
      .status(500)
      .json({ success: false, message: "Error creating post" });
  }
};
```

Key aspects of the Post Service:
- **Intelligent caching:** Using Redis to cache posts for faster retrieval
- **Event publishing:** Notifying other services about post changes
- **Pagination:** Efficient retrieval of large post collections
- **Cache invalidation:** Keeping data consistent across the system

### Media Service (Port 3003)

The Media Service specializes in handling file uploads, particularly images and videos. Let's see how it processes an upload:

```javascript
const uploadMedia = async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({
        success: false,
        message: "No file provided. Please add a file and try again",
      });
    }

    const { originalname, mimetype } = file;
    const userId = req.user;

    // Upload to Cloudinary
    const cloudinaryUploadResult = await uploadToCloudinary(file);

    // Save media metadata to database
    const newlyCreatedMedia = new Media({
      publicId: cloudinaryUploadResult.public_id,
      originalName: originalname,
      mimeType: mimetype,
      url: cloudinaryUploadResult.secure_url,
      userId,
    });

    await newlyCreatedMedia.save();

    return res.status(201).json({
      success: true,
      message: "Media uploaded successfully",
      mediaID: newlyCreatedMedia._id,
      url: newlyCreatedMedia.url,
    });
  } catch (error) {
    logger.error("Error uploading media", error);
    return res.status(500).json({
      success: false,
      message: "Error uploading media",
    });
  }
};
```

The service provides:
- **Efficient file handling:** Using Multer for processing multipart form data
- **Cloud storage:** Seamless integration with Cloudinary
- **Metadata tracking:** Storing information about uploaded media
- **Media association:** Connecting media to users and posts

### Search Service (Port 3004)

Our Search Service provides fast, relevant search capabilities across the platform:

```javascript
const searchPostController = async (req, res) => {
  try {
    const { query } = req.query;

    // Check cache first
    const cachedKey = `search:${query}`;
    const cachedPosts = await redisClient.get(cachedKey);

    if (cachedPosts) {
      return res.status(200).json({
        success: true,
        message: "Posts fetched successfully",
        posts: JSON.parse(cachedPosts),
      });
    }

    // Perform text search with MongoDB text indexes
    const result = await Search.find(
      {
        $text: {
          $search: query,
          $caseSensitive: false,
          $diacriticSensitive: false,
        },
      },
      {
        score: { $meta: "textScore" },
      }
    )
      .sort({ score: { $meta: "textScore" } })
      .limit(10);

    // Cache results
    await redisClient.setex(cachedKey, 300, JSON.stringify(result));

    res.status(200).json({
      success: true,
      message: "Posts fetched successfully",
      posts: result,
    });
  } catch (e) {
    logger.error("Error while searching post", e);
    res.status(500).json({ message: "Error while searching post" });
  }
};
```

Key features:
- **Full-text search:** Using MongoDB's text indexes
- **Relevance scoring:** Returning results sorted by relevance
- **Search caching:** Improving performance for repeated searches
- **Event consumption:** Updating search indices when content changes

## Event-Driven Communication with RabbitMQ

Our services communicate asynchronously using RabbitMQ. Let's look at how we publish events:

```javascript
async function publishEvent(routingKey, message) {
  if (!channel) {
    await connectToRabbitMQ();
  }
  await channel.publish(EXCHANGE_NAME, routingKey, Buffer.from(message));
  logger.info(`Published event to ${routingKey}`, message);
}
```

This event-driven approach:
- Decouples services, allowing them to evolve independently
- Ensures reliable delivery of important state changes
- Enables complex workflows across services
- Improves system resilience

## Security and Performance

Our platform implements multiple layers of security and performance optimizations:

### Security Features

1. **JWT Authentication:** Secure, stateless authentication across services
2. **Argon2 Password Hashing:** Using the winner of the Password Hashing Competition
3. **Rate Limiting:** Protection against brute force and DoS attacks
4. **Input Validation:** Comprehensive validation using Joi
5. **HTTP Security Headers:** Using Helmet for protection against common web vulnerabilities

### Performance Optimizations

1. **Redis Caching:** Dramatically improving response times
2. **Pagination:** Efficient handling of large data sets
3. **MongoDB Indexing:** Optimized queries for common operations
4. **Cache Invalidation:** Ensuring data consistency without sacrificing performance

## Getting Started

### Prerequisites
- Node.js (v14+)
- MongoDB (v4+)
- Redis (v6+)
- RabbitMQ (v3.8+)
- Cloudinary account (for media service)

### Installation Steps

1. Clone the repository:
```bash
git clone https://github.com/yourusername/social_media_microservices.git
cd social_media_microservices
```

2. Install dependencies for each service:

```bash
# API Gateway
cd api-gateway
npm install nodemon prettier --save-dev
npm install cors dotenv express express-http-proxy helmet ioredis jsonwebtoken winston express-rate-limit rate-limit-redis rate-limiter-flexible

# Identity Service
cd ../identity-service
npm install nodemon prettier concurrently --save-dev
npm install cors argon2 dotenv express express-rate-limit helmet ioredis joi jsonwebtoken mongoose rate-limit-redis winston rate-limiter-flexible winston

# Post Service
cd ../post-service
npm install nodemon prettier --save-dev
npm install cors dotenv express mongoose helmet jsonwebtoken winston ioredis express-rate-limit joi amqplib

# Media Service
cd ../media-service
npm install nodemon prettier --save-dev
npm install cors dotenv express mongoose helmet jsonwebtoken winston ioredis express-rate-limit joi cloudinary multer amqplib

# Search Service
cd ../search-service
npm install nodemon prettier --save-dev
npm install cors dotenv express mongoose helmet jsonwebtoken winston ioredis express-rate-limit joi amqplib
```

3. Set up environment variables:
   Create a `.env` file in each service directory with configurations for:
   - Database connections
   - Service ports
   - JWT secrets
   - Cloudinary credentials
   - RabbitMQ URL
   - Redis URL

4. Start the services:
```bash
# Start RabbitMQ and Redis
brew services start rabbitmq
brew services start redis

# Start each service (in separate terminals)
cd api-gateway && npm start
cd identity-service && npm start
cd post-service && npm start
cd media-service && npm start
cd search-service && npm start
```

## Scaling and Production Considerations

This architecture is designed with horizontal scaling in mind:

1. **Stateless Services:** All services can be replicated behind load balancers
2. **Database Scaling:** MongoDB can be sharded for horizontal scaling
3. **Redis Clustering:** For high-availability caching
4. **RabbitMQ Clustering:** Ensuring reliable message delivery at scale
5. **Containerization:** All services can be containerized with Docker
6. **Kubernetes:** Orchestration for automatic scaling, self-healing, and rolling updates

## Conclusion

Building a social media platform with microservices offers significant advantages in terms of scalability, resilience, and maintainability. This architecture allows us to:

- Develop and deploy services independently
- Scale components based on specific bottlenecks
- Improve fault isolation
- Use specialized technologies for different requirements
- Enable teams to work on different services simultaneously

While microservices introduce complexity in terms of deployment and service coordination, the benefits for a growing platform far outweigh these challenges.
