const Joi = require("joi");

const validationCreatePost = (data) => {
  const schema = Joi.object({
    content: Joi.string().min(3).max(50).required(),
    mediaIds: Joi.array().items(Joi.string()).optional(),
  });
  return schema.validate(data);
};

module.exports = {
  validationCreatePost,
};
