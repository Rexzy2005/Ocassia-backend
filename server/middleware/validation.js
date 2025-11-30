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
    role: Joi.string()
      .valid("user", "admin", "host", "provider", "center")
      .default("user"),
  }),

  // User login
  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  }),

  // Forgot password
  forgotPassword: Joi.object({
    email: Joi.string().email().required(),
  }),

  // Reset password
  resetPassword: Joi.object({
    password: Joi.string().min(6).required(),
  }),

  // Update user
  updateUser: Joi.object({
    name: Joi.string().min(2).max(50).optional(),
    phone: Joi.string()
      .pattern(/^[0-9]{10,15}$/)
      .optional(),
    email: Joi.string().email().optional(),
  }),

  // Host profile update
  updateHostProfile: Joi.object({
    name: Joi.string().min(2).max(50).optional(),
    phone: Joi.string()
      .pattern(/^[0-9]{10,15}$/)
      .optional(),
    hostProfile: Joi.object({
      businessName: Joi.string().max(100).optional(),
      businessAddress: Joi.string().max(200).optional(),
      businessType: Joi.string().max(50).optional(),
      cacNumber: Joi.string().max(20).optional(),
      description: Joi.string().max(1000).optional(),
    }).optional(),
  }),

  // Provider profile update
  updateProviderProfile: Joi.object({
    name: Joi.string().min(2).max(50).optional(),
    phone: Joi.string()
      .pattern(/^[0-9]{10,15}$/)
      .optional(),
    providerProfile: Joi.object({
      companyName: Joi.string().max(100).optional(),
      serviceType: Joi.string().max(50).optional(),
      experience: Joi.number().min(0).optional(),
      certifications: Joi.array().items(Joi.string()).optional(),
      portfolio: Joi.array().items(Joi.string().uri()).optional(),
    }).optional(),
  }),

  // Center profile update
  updateCenterProfile: Joi.object({
    name: Joi.string().min(2).max(50).optional(),
    phone: Joi.string()
      .pattern(/^[0-9]{10,15}$/)
      .optional(),
    centerProfile: Joi.object({
      centerName: Joi.string().max(100).optional(),
      centerType: Joi.string().max(50).optional(),
      location: Joi.object({
        address: Joi.string().max(200).optional(),
        city: Joi.string().max(50).optional(),
        state: Joi.string().max(50).optional(),
        coordinates: Joi.object({
          lat: Joi.number().min(-90).max(90).optional(),
          lng: Joi.number().min(-180).max(180).optional(),
        }).optional(),
      }).optional(),
      facilities: Joi.array().items(Joi.string()).optional(),
      capacity: Joi.number().min(0).optional(),
      operatingHours: Joi.object({
        open: Joi.string().optional(),
        close: Joi.string().optional(),
      }).optional(),
      amenities: Joi.array().items(Joi.string()).optional(),
    }).optional(),
  }),

  // CAC verification
  verifyCac: Joi.object({
    cacNumber: Joi.string().required(),
    businessName: Joi.string().required(),
  }),
};

module.exports = { validate, schemas };
