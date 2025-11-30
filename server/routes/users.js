const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const { successResponse, errorResponse } = require('../utils/helpers');
const { STATUS_CODES, ERROR_MESSAGES, USER_ROLES, CAC_STATUS } = require('../utils/constants');

/**
 * @route   GET /api/users/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', protect, async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    successResponse(res, STATUS_CODES.OK, { user }, 'User profile retrieved');
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/users/:userId/profile
 * @desc    Update user profile (role-specific)
 * @access  Private
 */
router.put('/:userId/profile', protect, async (req, res, next) => {
  try {
    const { userId } = req.params;

    // Check if user is updating their own profile or is admin
    if (req.user._id.toString() !== userId && req.user.role !== USER_ROLES.ADMIN) {
      return errorResponse(res, STATUS_CODES.FORBIDDEN, 'Not authorized to update this profile');
    }

    const user = await User.findById(userId);
    if (!user) {
      return errorResponse(res, STATUS_CODES.NOT_FOUND, ERROR_MESSAGES.USER_NOT_FOUND);
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

    const { error } = validationSchema.validate(req.body, { abortEarly: false });
    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message
      }));
      return errorResponse(res, STATUS_CODES.BAD_REQUEST, 'Validation error', errors);
    }

    // Check if email is being changed and if it's already taken
    if (req.body.email && req.body.email !== user.email) {
      const existingUser = await User.findOne({ email: req.body.email });
      if (existingUser) {
        return errorResponse(res, STATUS_CODES.CONFLICT, 'Email already in use');
      }
    }

    // Update basic fields
    if (req.body.name) user.name = req.body.name;
    if (req.body.phone) user.phone = req.body.phone;
    if (req.body.email) user.email = req.body.email;

    // Update role-specific profile
    if (user.role === USER_ROLES.HOST && req.body.hostProfile) {
      user.hostProfile = { ...user.hostProfile, ...req.body.hostProfile };
      user.profileCompleted = true;
    } else if (user.role === USER_ROLES.PROVIDER && req.body.providerProfile) {
      user.providerProfile = { ...user.providerProfile, ...req.body.providerProfile };
      user.profileCompleted = true;
    } else if (user.role === USER_ROLES.CENTER && req.body.centerProfile) {
      user.centerProfile = { ...user.centerProfile, ...req.body.centerProfile };
      user.profileCompleted = true;
    }

    await user.save();

    successResponse(res, STATUS_CODES.OK, { user }, 'Profile updated successfully');
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/users/:userId/verify-cac
 * @desc    Submit CAC verification for host
 * @access  Private (Host only)
 */
router.post('/:userId/verify-cac', protect, validate(schemas.verifyCac), async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { cacNumber, businessName } = req.body;

    // Check if user is updating their own profile
    if (req.user._id.toString() !== userId) {
      return errorResponse(res, STATUS_CODES.FORBIDDEN, 'Not authorized to update this profile');
    }

    const user = await User.findById(userId);
    if (!user) {
      return errorResponse(res, STATUS_CODES.NOT_FOUND, ERROR_MESSAGES.USER_NOT_FOUND);
    }

    // Check if user is a host
    if (user.role !== USER_ROLES.HOST) {
      return errorResponse(res, STATUS_CODES.BAD_REQUEST, 'Only hosts can verify CAC');
    }

    // Update CAC information
    user.hostProfile.cacNumber = cacNumber;
    user.hostProfile.businessName = businessName;
    user.hostProfile.cacVerified = false; // Will be verified by admin

    await user.save();

    successResponse(
      res, 
      STATUS_CODES.OK, 
      { user }, 
      'CAC verification submitted. Awaiting admin approval.'
    );

    // TODO: Notify admin for CAC verification
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/users
 * @desc    Get all users (Admin only)
 * @access  Private/Admin
 */
router.get('/', protect, authorize(USER_ROLES.ADMIN), async (req, res, next) => {
  try {
    const { role, isActive, page = 1, limit = 10 } = req.query;

    // Build query
    const query = {};
    if (role) query.role = role;
    if (isActive !== undefined) query.isActive = isActive === 'true';

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
          pages: Math.ceil(total / limit)
        }
      }, 
      'Users retrieved'
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID (Admin only)
 * @access  Private/Admin
 */
router.get('/:id', protect, authorize(USER_ROLES.ADMIN), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    
    if (!user) {
      return errorResponse(res, STATUS_CODES.NOT_FOUND, ERROR_MESSAGES.USER_NOT_FOUND);
    }

    successResponse(res, STATUS_CODES.OK, { user }, 'User retrieved');
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/users/:id/verify-cac-admin
 * @desc    Approve/reject CAC verification (Admin only)
 * @access  Private/Admin
 */
router.put('/:id/verify-cac-admin', protect, authorize(USER_ROLES.ADMIN), async (req, res, next) => {
  try {
    const { approve } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      return errorResponse(res, STATUS_CODES.NOT_FOUND, ERROR_MESSAGES.USER_NOT_FOUND);
    }

    if (user.role !== USER_ROLES.HOST) {
      return errorResponse(res, STATUS_CODES.BAD_REQUEST, 'User is not a host');
    }

    user.hostProfile.cacVerified = approve === true;
    await user.save();

    successResponse(
      res, 
      STATUS_CODES.OK, 
      { user }, 
      `CAC verification ${approve ? 'approved' : 'rejected'}`
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/users/:id/toggle-status
 * @desc    Activate/deactivate user (Admin only)
 * @access  Private/Admin
 */
router.put('/:id/toggle-status', protect, authorize(USER_ROLES.ADMIN), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return errorResponse(res, STATUS_CODES.NOT_FOUND, ERROR_MESSAGES.USER_NOT_FOUND);
    }

    user.isActive = !user.isActive;
    await user.save();

    successResponse(
      res, 
      STATUS_CODES.OK, 
      { user }, 
      `User ${user.isActive ? 'activated' : 'deactivated'}`
    );
  } catch (error) {
    next(error);
  }
});

module.exports = router;