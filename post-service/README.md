# Post Service

A microservice for managing social media posts in the social media platform.

## Features

- Create posts with content, media URLs, and tags
- Retrieve posts by ID and user ID
- Update existing posts
- Soft delete posts (mark as deleted without removing from database)
- Like posts

## API Endpoints

- `POST /api/posts`: Create a new post
- `GET /api/posts/:id`: Get a post by ID
- `GET /api/posts/user/:userId`: Get all posts by user ID
- `PUT /api/posts/:id`: Update a post
- `DELETE /api/posts/:id`: Soft delete a post
- `POST /api/posts/:id/like`: Like a post
- `GET /health`: Health check endpoint

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- MongoDB

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory with the following variables:
```
PORT=3002
MONGODB_URI=mongodb://localhost:27017/post-service
```

3. Start the service:
```bash
npm run dev
```

## Development

- `npm run dev`: Start the server with nodemon for development
- `npm start`: Start the server
- `npm run format`: Format code with Prettier 