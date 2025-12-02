const Joi = require("joi");
const { STATUS_CODES } = require("../utils/constants");

/**
 * Validate request body against Joi schema
 */
const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, {
      abortEarly: false,
      allowUnknown: true,
    });

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
      .valid("admin", "host", "provider", "center")
      .default("host"),
    hostProfile: Joi.object().unknown(true).optional(),
    providerProfile: Joi.object().unknown(true).optional(),
    centerProfile: Joi.object().unknown(true).optional(),
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
    profileImage: Joi.string().optional(),
    hostProfile: Joi.object({}).optional(),
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
      cacNumber: Joi.string().max(20).optional(),
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
      cacNumber: Joi.string().max(20).optional(),
    }).optional(),
  }),

  // CAC verification
  verifyCac: Joi.object({
    cacNumber: Joi.string().required(),
    businessName: Joi.string().required(),
  }),

  // Create booking
  createBooking: Joi.object({
    bookingType: Joi.string().valid("provider", "center").required(),
    serviceProviderId: Joi.string().when("bookingType", {
      is: "provider",
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
    eventCenterId: Joi.string().when("bookingType", {
      is: "center",
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
    eventDetails: Joi.object({
      eventName: Joi.string().max(100).optional(),
      eventType: Joi.string()
        .valid(
          "Wedding",
          "Birthday",
          "Corporate",
          "Conference",
          "Workshop",
          "Concert",
          "Exhibition",
          "Religious",
          "Social",
          "Other"
        )
        .optional(),
      eventDate: Joi.date().min("now").required(),
      startTime: Joi.string().required(),
      endTime: Joi.string().required(),
      guestCount: Joi.number().min(1).optional(),
      specialRequests: Joi.string().max(1000).optional(),
    }).required(),
    pricing: Joi.object({
      baseAmount: Joi.number().min(0).required(),
      additionalCharges: Joi.array()
        .items(
          Joi.object({
            description: Joi.string(),
            amount: Joi.number().min(0),
          })
        )
        .optional(),
      discount: Joi.number().min(0).optional(),
      totalAmount: Joi.number().min(0).required(),
      currency: Joi.string().default("NGN"),
    }).required(),
    paymentMethod: Joi.string()
      .valid("escrow", "direct", "cash")
      .default("escrow"),
    notes: Joi.string().max(2000).optional(),
  }),

  // Update booking status
  updateBookingStatus: Joi.object({
    status: Joi.string()
      .valid("pending", "confirmed", "cancelled", "completed")
      .required(),
    reason: Joi.string().max(500).optional(),
  }),

  // Cancel booking
  cancelBooking: Joi.object({
    reason: Joi.string().max(500).optional(),
  }),

  // Create review
  createReview: Joi.object({
    bookingId: Joi.string().required(),
    ratings: Joi.object({
      overall: Joi.number().min(1).max(5).required(),
      quality: Joi.number().min(1).max(5).optional(),
      communication: Joi.number().min(1).max(5).optional(),
      professionalism: Joi.number().min(1).max(5).optional(),
      valueForMoney: Joi.number().min(1).max(5).optional(),
    }).required(),
    title: Joi.string().max(100).optional(),
    comment: Joi.string().min(10).max(1000).required(),
    images: Joi.array()
      .items(
        Joi.object({
          url: Joi.string().uri().required(),
          caption: Joi.string().max(200).optional(),
        })
      )
      .optional(),
    wouldRecommend: Joi.boolean().optional(),
  }),

  // Review response
  reviewResponse: Joi.object({
    text: Joi.string().min(10).max(500).required(),
  }),

  // Report review
  reportReview: Joi.object({
    reason: Joi.string().max(500).optional(),
  }),
};

module.exports = { validate, schemas };
