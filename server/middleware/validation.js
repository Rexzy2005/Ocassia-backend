const Joi = require("joi");
const { STATUS_CODES } = require("../utils/constants");

/**
 * Validate request body against Joi schema
 */
const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { abortEarly: false });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));

      return res.status(STATUS_CODES.BAD_REQUEST).json({
        success: false,
        message: "Validation error",
        errors,
      });
    }

    next();
  };
};

/**
 * Common validation schemas
 */
const schemas = {
  // User registration
  register: Joi.object({
    name: Joi.string().min(2).max(50).required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    phone: Joi.string()
      .pattern(/^[0-9]{10,15}$/)
      .optional(),
    role: Joi.string().valid("user", "admin", "provider").optional(),
  }),

  // User login
  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  }),

  // Update user
  updateUser: Joi.object({
    name: Joi.string().min(2).max(50).optional(),
    phone: Joi.string()
      .pattern(/^[0-9]{10,15}$/)
      .optional(),
    email: Joi.string().email().optional(),
  }),
};

module.exports = { validate, schemas };
