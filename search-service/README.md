# Search Service

A microservice for providing search functionality across all content types in the social media platform.

## Features

- Full-text search across posts, users, media, and comments
- Fuzzy matching and spelling correction
- Faceted search with filtering options
- Result relevance scoring
- Query caching for performance
- Trending search analytics
- Document indexing with tracking

## API Endpoints

### Search Endpoints

- `GET /api/search`: Search across all content types
  - Query params: `query`, `types`, `limit`, `from`, `sort`
- `GET /api/trending`: Get trending searches
  - Query params: `limit`
- `POST /api/analytics/click`: Track click on search result (requires auth)

### Index Management Endpoints (Requires Auth)

- `POST /api/index/document`: Index a document 
- `DELETE /api/index/document`: Delete a document (soft or permanent)
- `POST /api/index/batch`: Batch index multiple documents
- `GET /api/index/status/:sourceType/:sourceId`: Get indexing status for a document
- `POST /api/index/reindex/:sourceType`: Reindex all documents of a specific type
- `GET /health`: Health check endpoint

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- MongoDB
- Elasticsearch (v7 or higher)
- Redis (optional, for caching)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory with the following variables:
```
PORT=3004
MONGODB_URI=mongodb://localhost:27017/search-service
ELASTICSEARCH_URL=http://localhost:9200
REDIS_URL=redis://localhost:6379

# Optional Elasticsearch Auth
ELASTICSEARCH_USERNAME=elastic
ELASTICSEARCH_PASSWORD=changeme
ELASTICSEARCH_VERIFY_CERTS=false

# JWT Configuration
JWT_PUBLIC_KEY=base64_encoded_public_key
```

3. Start the service:
```bash
npm run dev
```

## Search Features

The search service provides the following capabilities:

### Content Types

You can search across different content types:
- **posts**: User posts and status updates
- **users**: User profiles
- **media**: Images, videos, and audio files
- **comments**: Comments on posts

### Search Options

- **Multiple Content Types**: Search across multiple types at once
- **Pagination**: Control results with `limit` and `from` parameters
- **Sorting**: Sort by relevance, recency, likes, or comments
- **Fuzzy Matching**: Find results even with typos
- **Field Boosting**: More relevant fields have higher weight

### Elasticsearch Integration

The service utilizes Elasticsearch for:
- Full-text search with analysis
- Relevance scoring
- Query DSL for complex queries
- Exact and fuzzy matching
- Faceted search

### Caching

Results are cached in Redis (when available) for improved performance. 
The cache key includes:
- Search query
- Content types
- Pagination parameters
- Sorting options

## Index Management

The service provides APIs for managing search indices:

### Document Lifecycle

1. **Indexing**: Documents from other services are indexed
2. **Tracking**: Status and version of indexed documents are tracked
3. **Updating**: Documents can be updated when source changes
4. **Deletion**: Soft or permanent deletion options

### Batch Operations

Batch indexing enables efficient bulk updates from other services.

## Development

- `npm run dev`: Start the server with nodemon for development
- `npm start`: Start the server
- `npm run format`: Format code with Prettier 