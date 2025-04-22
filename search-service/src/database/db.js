const mongoose = require("mongoose");
const logger = require("../utils/logger");

const ConnectToDB = async () => {
  try {
    const mongo_db_url = process.env.MONGO_DB_URL;
    await mongoose.connect(mongo_db_url);
    logger.info("MongoDB is connected sucessfuly !");
  } catch (e) {
    logger.error("Mongodb connection failed", e);
    process.exit(1);
  }
};

module.exports = ConnectToDB;
