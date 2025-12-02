const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Host = require("../models/Host");
const ServiceProvider = require("../models/ServiceProvider");
const EventCenter = require("../models/EventCenter");
const { protect, authorize } = require("../middleware/auth");
const { validate, schemas } = require("../middleware/validation");
const { successResponse, errorResponse } = require("../utils/helpers");
const {
  STATUS_CODES,
  ERROR_MESSAGES,
  USER_ROLES,
  CAC_STATUS,
} = require("../utils/constants");

/**
 * @route   GET /api/users/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get("/me", protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id)
      .populate("host")
      .populate("serviceProvider")
      .populate("eventCenter");

    successResponse(res, STATUS_CODES.OK, { user }, "User profile retrieved");
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/users/:userId/profile
 * @desc    Update user profile (role-specific)
 * @access  Private
 */
router.put("/:userId/profile", protect, async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Check if user is updating their own profile or is admin
    if (
      req.user._id.toString() !== userId &&
      req.user.role !== USER_ROLES.ADMIN
    ) {
      return errorResponse(
        res,
        STATUS_CODES.FORBIDDEN,
        "Not authorized to update this profile"
      );
    }

    const user = await User.findById(userId);
    if (!user) {
      return errorResponse(
        res,
        STATUS_CODES.NOT_FOUND,
        ERROR_MESSAGES.USER_NOT_FOUND
      );
    }

    // Validate based on role
    let validationSchema;
    if (user.role === USER_ROLES.HOST) {
      validationSchema = schemas.updateHostProfile;
    } else if (user.role === USER_ROLES.PROVIDER) {
      validationSchema = schemas.updateProviderProfile;
    } else if (user.role === USER_ROLES.CENTER) {
      validationSchema = schemas.updateCenterProfile;
    } else {
      validationSchema = schemas.updateUser;
    }

    const { error } = validationSchema.validate(req.body, {
      abortEarly: false,
    });
    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join("."),
        message: detail.message,
      }));
      return errorResponse(
        res,
        STATUS_CODES.BAD_REQUEST,
        "Validation error",
        errors
      );
    }

    // Check if email is being changed and if it's already taken
    if (req.body.email && req.body.email !== user.email) {
      const existingUser = await User.findOne({ email: req.body.email });
      if (existingUser) {
        return errorResponse(
          res,
          STATUS_CODES.CONFLICT,
          "Email already in use"
        );
      }
    }

    // Update basic fields
    if (req.body.name) user.name = req.body.name;
    if (req.body.phone) user.phone = req.body.phone;
    if (req.body.email) user.email = req.body.email;

    // Update role-specific profile
    if (user.role === USER_ROLES.HOST && req.body.hostProfile) {
      // Update or create Host document linked to this user
      if (user.host) {
        await Host.findByIdAndUpdate(user.host, req.body.hostProfile, {
          new: true,
          runValidators: true,
        });
      } else {
        const h = await Host.create({
          user: user._id,
          ...req.body.hostProfile,
        });
        user.host = h._id;
      }
      user.profileCompleted = true;
    } else if (user.role === USER_ROLES.PROVIDER && req.body.providerProfile) {
      // Update or create ServiceProvider document linked to this user
      if (user.serviceProvider) {
        await ServiceProvider.findByIdAndUpdate(
          user.serviceProvider,
          req.body.providerProfile,
          { new: true, runValidators: true }
        );
      } else {
        const sp = await ServiceProvider.create({
          provider: user._id,
          ...req.body.providerProfile,
        });
        user.serviceProvider = sp._id;
      }
      user.profileCompleted = true;
    } else if (user.role === USER_ROLES.CENTER && req.body.centerProfile) {
      // Update or create EventCenter document linked to this user
      if (user.eventCenter) {
        await EventCenter.findByIdAndUpdate(
          user.eventCenter,
          req.body.centerProfile,
          { new: true, runValidators: true }
        );
      } else {
        const ec = await EventCenter.create({
          owner: user._id,
          ...req.body.centerProfile,
        });
        user.eventCenter = ec._id;
      }
      user.profileCompleted = true;
    }

    await user.save();

    successResponse(
      res,
      STATUS_CODES.OK,
      { user },
      "Profile updated successfully"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/users/:userId/verify-cac
 * @desc    Submit CAC verification for provider or center
 * @access  Private (Provider/Center only)
 */
router.post(
  "/:userId/verify-cac",
  protect,
  validate(schemas.verifyCac),
  async (req, res, next) => {
    try {
      const { userId } = req.params;
      const { cacNumber, businessName } = req.body;

      // Check if user is updating their own profile
      if (req.user._id.toString() !== userId) {
        return errorResponse(
          res,
          STATUS_CODES.FORBIDDEN,
          "Not authorized to update this profile"
        );
      }

      const user = await User.findById(userId);
      if (!user) {
        return errorResponse(
          res,
          STATUS_CODES.NOT_FOUND,
          ERROR_MESSAGES.USER_NOT_FOUND
        );
      }

      // Check if user is a provider or center
      if (
        user.role !== USER_ROLES.PROVIDER &&
        user.role !== USER_ROLES.CENTER
      ) {
        return errorResponse(
          res,
          STATUS_CODES.BAD_REQUEST,
          "Only service providers and centers can verify CAC"
        );
      }

      // Update CAC information based on role using referenced documents
      if (user.role === USER_ROLES.PROVIDER) {
        // find ServiceProvider for this user (or create if missing)
        let sp = null;
        if (user.serviceProvider) {
          sp = await ServiceProvider.findById(user.serviceProvider);
        } else {
          sp = await ServiceProvider.findOne({ provider: user._id });
        }

        if (!sp) {
          sp = await ServiceProvider.create({
            provider: user._id,
            cacNumber,
            companyName: businessName,
            cacVerified: false,
          });
          user.serviceProvider = sp._id;
        } else {
          sp.cacNumber = cacNumber;
          sp.companyName = businessName;
          sp.cacVerified = false;
          await sp.save();
        }
        await user.save();
      } else if (user.role === USER_ROLES.CENTER) {
        let ec = null;
        if (user.eventCenter) {
          ec = await EventCenter.findById(user.eventCenter);
        } else {
          ec = await EventCenter.findOne({ owner: user._id });
        }

        if (!ec) {
          ec = await EventCenter.create({
            owner: user._id,
            cacNumber,
            centerName: businessName,
            cacVerified: false,
          });
          user.eventCenter = ec._id;
        } else {
          ec.cacNumber = cacNumber;
          ec.centerName = businessName;
          ec.cacVerified = false;
          await ec.save();
        }
        await user.save();
      }

      successResponse(
        res,
        STATUS_CODES.OK,
        { user },
        "CAC verification submitted. Awaiting admin approval."
      );

      // TODO: Notify admin for CAC verification
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/users
 * @desc    Get all users (Admin only)
 * @access  Private/Admin
 */
router.get(
  "/",
  protect,
  authorize(USER_ROLES.ADMIN),
  async (req, res, next) => {
    try {
      const { role, isActive, page = 1, limit = 10 } = req.query;

      // Build query
      const query = {};
      if (role) query.role = role;
      if (isActive !== undefined) query.isActive = isActive === "true";

      // Pagination
      const skip = (page - 1) * limit;

      const users = await User.find(query)
        .limit(parseInt(limit))
        .skip(skip)
        .sort({ createdAt: -1 });

      const total = await User.countDocuments(query);

      successResponse(
        res,
        STATUS_CODES.OK,
        {
          users,
          pagination: {
            total,
            page: parseInt(page),
            pages: Math.ceil(total / limit),
          },
        },
        "Users retrieved"
      );
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID (Admin only)
 * @access  Private/Admin
 */
router.get(
  "/:id",
  protect,
  authorize(USER_ROLES.ADMIN),
  async (req, res, next) => {
    try {
      const user = await User.findById(req.params.id);

      if (!user) {
        return errorResponse(
          res,
          STATUS_CODES.NOT_FOUND,
          ERROR_MESSAGES.USER_NOT_FOUND
        );
      }

      successResponse(res, STATUS_CODES.OK, { user }, "User retrieved");
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/users/:id/verify-cac-admin
 * @desc    Approve/reject CAC verification (Admin only)
 * @access  Private/Admin
 */
router.put(
  "/:id/verify-cac-admin",
  protect,
  authorize(USER_ROLES.ADMIN),
  async (req, res, next) => {
    try {
      const { approve } = req.body;

      const user = await User.findById(req.params.id);
      if (!user) {
        return errorResponse(
          res,
          STATUS_CODES.NOT_FOUND,
          ERROR_MESSAGES.USER_NOT_FOUND
        );
      }

      // Check if user is a provider or center
      if (
        user.role !== USER_ROLES.PROVIDER &&
        user.role !== USER_ROLES.CENTER
      ) {
        return errorResponse(
          res,
          STATUS_CODES.BAD_REQUEST,
          "User is not a service provider or center"
        );
      }

      // Update verification status based on role (update referenced documents)
      if (user.role === USER_ROLES.PROVIDER) {
        const sp = user.serviceProvider
          ? await ServiceProvider.findById(user.serviceProvider)
          : await ServiceProvider.findOne({ provider: user._id });
        if (sp) {
          sp.cacVerified = approve === true;
          await sp.save();
        }
      } else if (user.role === USER_ROLES.CENTER) {
        const ec = user.eventCenter
          ? await EventCenter.findById(user.eventCenter)
          : await EventCenter.findOne({ owner: user._id });
        if (ec) {
          ec.cacVerified = approve === true;
          await ec.save();
        }
      }

      await user.save();

      successResponse(
        res,
        STATUS_CODES.OK,
        { user },
        `CAC verification ${approve ? "approved" : "rejected"}`
      );
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/users/:id/toggle-status
 * @desc    Activate/deactivate user (Admin only)
 * @access  Private/Admin
 */
router.put(
  "/:id/toggle-status",
  protect,
  authorize(USER_ROLES.ADMIN),
  async (req, res, next) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user) {
        return errorResponse(
          res,
          STATUS_CODES.NOT_FOUND,
          ERROR_MESSAGES.USER_NOT_FOUND
        );
      }

      user.isActive = !user.isActive;
      await user.save();

      successResponse(
        res,
        STATUS_CODES.OK,
        { user },
        `User ${user.isActive ? "activated" : "deactivated"}`
      );
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
