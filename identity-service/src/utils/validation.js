const Joi = require("joi");

const validationRegistration = (data) => {
  const schema = Joi.object({
    username: Joi.string().required(),
    password: Joi.string().required(),
    email: Joi.string().email().required(),
  });
  return schema.validate(data);
};

const validationLogin = (data) => {
  const schema = Joi.object({
    username: Joi.string().required(),
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
