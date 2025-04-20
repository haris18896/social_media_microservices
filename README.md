# Social Media Microservices Platform

A scalable, secure, and robust microservices-based social media platform backend using Node.js, Express, MongoDB, and Redis.

## Architecture Overview

The platform is built using a microservices architecture, consisting of the following services:

1. **API Gateway**: Entry point for all client requests, handling authentication verification, request routing, and load balancing.
2. **Identity Service**: Manages user authentication, registration, and profile management with robust security features.
3. **Post Service**: Handles creation, retrieval, and management of user posts and interactions.
4. **Media Service**: Manages media upload, processing, and delivery with optimizations and security features.
5. **Search Service**: Provides powerful search capabilities across the platform using Elasticsearch.

## Services Details

### API Gateway
- **Port**: 3000
- **Responsibilities**: 
  - Request routing to appropriate microservices
  - Authentication verification
  - Rate limiting
  - Request correlation for distributed tracing
  - API documentation through Swagger UI
  - Health monitoring of all services
  - Metrics collection for monitoring

### Identity Service
- **Port**: 3001
- **Responsibilities**:
  - User registration and authentication
  - JWT token management with RS256 asymmetric key signing
  - Password security with Argon2id hashing
  - Multi-factor authentication (TOTP, SMS, Email)
  - Password history and complexity enforcement
  - Account security features (brute force protection, IP tracking)
  - User profile management
  - Session management

### Post Service
- **Port**: 3002
- **Responsibilities**:
  - Post creation and management
  - Feed generation and pagination
  - Comment and reaction handling
  - Content moderation
  - Post analytics
  - Support for rich text and media attachments
  - Privacy controls and visibility settings
  - Hashtag and mention functionality

### Media Service
- **Port**: 3003
- **Responsibilities**:
  - Secure file uploads with validation
  - Image processing and optimization
  - Video transcoding
  - Thumbnail generation
  - Content delivery optimization
  - Metadata extraction and management
  - Content categorization
  - Storage management (AWS S3 integration)

### Search Service
- **Port**: 3004
- **Responsibilities**:
  - Full-text search across content
  - Fuzzy matching and spelling correction
  - Faceted search and filtering
  - Result relevance scoring
  - Search analytics
  - Query caching for performance
  - Personalized search results
  - Elasticsearch integration

## Security Features

- **Authentication**: JWT-based authentication with RS256 asymmetric key signing
- **Authorization**: Role-based access control
- **Password Security**: Argon2id hashing with password history and complexity requirements
- **MFA**: Support for TOTP, SMS, and email verification
- **Rate Limiting**: Tiered rate limiting with Redis for DDoS protection
- **Content Security**: Input validation, sanitization, and XSS protection
- **Transport Security**: HTTPS enforcement with proper security headers
- **Audit Logging**: Comprehensive security event logging
- **Data Protection**: GDPR compliance with data export capabilities
- **Brute Force Protection**: Exponential backoff for failed login attempts
- **Token Security**: Refresh token rotation and invalidation
- **IP Tracking**: Session tracking with IP validation

## Setup Instructions

### Prerequisites
- Node.js (v16+)
- MongoDB (v5+)
- Redis (v6+)
- Elasticsearch (optional, for search service)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/social_media_microservices.git
cd social_media_microservices
```

2. Install dependencies for each service:
```bash
# API Gateway
cd api-gateway
npm install

# Identity Service
cd ../identity-service
npm install

# Post Service
cd ../post-service
npm install

# Media Service
cd ../media-service
npm install

# Search Service
cd ../search-service
npm install
```

3. Set up environment variables:
   - Copy `.env.example` to `.env` in each service directory
   - Update the values in each `.env` file according to your environment

4. Generate RSA keys for JWT signing (automatically done on service startup):
   - The Identity Service will generate RSA keys in `identity-service/src/keys/` on first run
   - The API Gateway will use the public key for token verification

### Running the Services

1. Start each service (in separate terminals):

```bash
# API Gateway
cd api-gateway
npm run dev

# Identity Service
cd identity-service
npm run dev

# Post Service
cd post-service
npm run dev

# Media Service
cd media-service
npm run dev

# Search Service
cd search-service
npm run dev
```

2. Access the API Gateway at http://localhost:3000
3. Swagger API Documentation is available at http://localhost:3000/api-docs

## API Documentation

The API is documented using Swagger/OpenAPI. You can access the interactive documentation at:
```
http://localhost:3000/api-docs
```

The documentation covers:
- Authentication endpoints
- User profile management
- Post creation and retrieval
- Media upload and management
- Search functionality
- Health check endpoints

## Development Considerations

### Creating New Features

1. Determine which service should handle the feature
2. Update the appropriate models and controllers
3. Add new routes in the service
4. Update API Gateway configuration if necessary
5. Update Swagger documentation
6. Write tests for new functionality

### Security Best Practices

1. Always validate and sanitize user input
2. Use appropriate HTTP methods (GET, POST, PUT, DELETE)
3. Implement proper error handling with sanitized error messages
4. Apply the principle of least privilege for service access
5. Use parameterized queries to prevent injection attacks
6. Implement rate limiting for all endpoints

### Performance Optimization

1. Use Redis for caching frequently accessed data
2. Implement database indexing for common queries
3. Use pagination for large data sets
4. Minimize payload sizes in requests and responses
5. Implement horizontal scaling for services under heavy load
6. Use compression for API responses

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.