# social_media_microservices

* First of all we are going to create 2 projects `api-gateway` and `identity-service`
* then in both directories we are going to initiate the node projects and install the dependencies
```bash
# api-gateway
npm install nodemon prettier --save-dev
npm install cors dotenv express express-http-proxy helmet ioredis
npm install jsonwebtoken winston express-rate-limit rate-limit-redis rate-limiter-flexible

# identity-service
npm install nodemon prettier concurrently --save-dev
npm install cors argon2 dotenv express express-rate-limit helmet ioredis joi 
npm install jsonwebtoken mongoose rate-limit-redis winston rate-limiter-flexible winston
```

* now we are going to create 3 more servie `media-service`, `post-service` and `search-service`

```bash
# post-service
npm install cors dotenv express mongoose helmet jsonwebtoken winston ioredis express-rate-limit joi

# media-service

# search-service
```