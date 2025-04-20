# Media Service

A microservice for handling media uploads, processing, and delivery in the social media platform.

## Features

- Secure file uploads with content validation
- Image processing and optimization
- Thumbnail generation
- Video processing with automatic thumbnail extraction
- AWS S3 integration for scalable storage
- Metadata extraction from media files
- Content categorization and tagging
- Signed URL generation for secure access

## API Endpoints

- `POST /api/media/upload`: Upload a new media file
- `GET /api/media/:id`: Get media metadata by ID
- `GET /api/media/user/:userId`: Get all media for a user
- `PUT /api/media/:id`: Update media metadata
- `DELETE /api/media/:id`: Delete media (soft delete)
- `GET /api/media/:id/signed-url`: Generate signed URL for direct access
- `GET /health`: Health check endpoint

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- MongoDB
- Redis (optional, for rate limiting)
- AWS S3 bucket (optional, for production storage)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory with the following variables:
```
PORT=3003
MONGODB_URI=mongodb://localhost:27017/media-service
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760

# AWS S3 Configuration (optional)
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=us-east-1
AWS_S3_BUCKET=your-bucket-name

# JWT Configuration
JWT_PUBLIC_KEY=base64_encoded_public_key
```

3. Start the service:
```bash
npm run dev
```

## File Processing

The service handles different types of media files:

### Images
- Automatic resizing and optimization
- Thumbnail generation
- EXIF data extraction (with privacy protection)
- Format conversion

### Videos
- Thumbnail extraction
- Duration and dimension extraction
- Asynchronous processing queue

### Audio
- Metadata extraction
- Format validation

## Storage

The service supports two storage modes:

1. **Local Storage**: Files are stored in the local `uploads` directory and served statically.
2. **S3 Storage**: Files are uploaded to AWS S3 for production environments.

To use S3 storage, configure the AWS environment variables in the `.env` file.

## Security

- File type validation to prevent malicious uploads
- Content-type verification
- Size limitations
- Private/public access control
- JWT-based authentication for uploads

## Development

- `npm run dev`: Start the server with nodemon for development
- `npm start`: Start the server
- `npm run format`: Format code with Prettier 