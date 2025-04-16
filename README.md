# social_media_microservices

* First of all we are going to create 2 projects `api-gateway` and `identity-service`
* then in both directories we are going to initiate the node projects and install the dependencies
```bash
# api-gateway
npm install nodemon prettier --save-dev
npm install cors dotenv express express-http-proxy helmet ioredis jsonwebtoken winston

# identity-service
npm install nodemon prettier --save-dev
npm install cors argon2 dotenv express express-rate-limit helmet ioredis joi jsonwebtoken mongoose rate-limit-redis winston
```