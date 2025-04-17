const Joi = require("joi");

const validationRegistration = (data) => {
  console.log("check here...");
  const schema = Joi.object({
    username: Joi.string().min(3).max(50).required(),
    password: Joi.string().min(6).max(1024).required(),
    email: Joi.string().email().required(),
  });
  return schema.validate(data);
};

const validationLogin = (data) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  });
  return schema.validate(data);
};

const validationRefreshToken = (data) => {
  const schema = Joi.object({
    refreshToken: Joi.string().required(),
  });
  return schema.validate(data);
};

module.exports = {
  validationRegistration,
  validationLogin,
  validationRefreshToken,
};
