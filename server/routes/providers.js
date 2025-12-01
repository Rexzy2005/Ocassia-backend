const express = require("express");
const router = express.Router();
const ServiceProvider = require("../models/ServiceProvider");
const User = require("../models/User");
const { protect, authorize } = require("../middleware/auth");
const { successResponse, errorResponse } = require("../utils/helpers");
const { STATUS_CODES, USER_ROLES } = require("../utils/constants");

/**
 * @route   GET /api/providers
 * @desc    Get all service providers with filtering, search, and pagination
 * @access  Public
 */
router.get("/", async (req, res, next) => {
  try {
    const {
      // Pagination
      page = 1,
      limit = 12,

      // Filtering
      category,
      state,
      city,
      minPrice,
      maxPrice,
      rating,
      availability,

      // Search
      search,

      // Sorting
      sortBy = "createdAt",
      order = "desc",
    } = req.query;

    // Build query
    const query = {
      isActive: true,
      verificationStatus: "verified",
    };

    // Category filter
    if (category) {
      query.serviceCategory = category;
    }

    // Location filters
    if (state) {
      query["serviceArea.states"] = state;
    }
    if (city) {
      query["serviceArea.cities"] = city;
    }

    // Price range filter
    if (minPrice || maxPrice) {
      query["pricing.amount"] = {};
      if (minPrice) query["pricing.amount"].$gte = parseFloat(minPrice);
      if (maxPrice) query["pricing.amount"].$lte = parseFloat(maxPrice);
    }

    // Rating filter
    if (rating) {
      query["rating.average"] = { $gte: parseFloat(rating) };
    }

    // Availability filter
    if (availability) {
      query["availability.status"] = availability;
    }

    // Search functionality
    if (search) {
      query.$or = [
        { serviceName: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { serviceCategory: { $regex: search, $options: "i" } },
      ];
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Sorting
    const sortOptions = {};
    sortOptions[sortBy] = order === "asc" ? 1 : -1;

    // Execute query
    const providers = await ServiceProvider.find(query)
      .populate("provider", "name email phone providerProfile.rating")
      .sort(sortOptions)
      .limit(limitNum)
      .skip(skip)
      .lean();

    // Get total count for pagination
    const total = await ServiceProvider.countDocuments(query);

    // Calculate pagination info
    const pagination = {
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      limit: limitNum,
      hasNext: pageNum < Math.ceil(total / limitNum),
      hasPrev: pageNum > 1,
    };

    successResponse(
      res,
      STATUS_CODES.OK,
      {
        providers,
        pagination,
      },
      "Service providers retrieved successfully"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/providers/:providerId
 * @desc    Get single service provider details
 * @access  Public
 */
router.get("/:providerId", async (req, res, next) => {
  try {
    const provider = await ServiceProvider.findById(
      req.params.providerId
    ).populate("provider", "name email phone providerProfile createdAt");

    if (!provider) {
      return errorResponse(
        res,
        STATUS_CODES.NOT_FOUND,
        "Service provider not found"
      );
    }

    // Increment view count
    provider.views += 1;
    await provider.save();

    successResponse(
      res,
      STATUS_CODES.OK,
      { provider },
      "Service provider details retrieved"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/providers
 * @desc    Create new service provider listing
 * @access  Private (Provider only)
 */
router.post(
  "/",
  protect,
  authorize(USER_ROLES.PROVIDER),
  async (req, res, next) => {
    try {
      // Check if provider's CAC is verified
      const user = await User.findById(req.user._id);
      if (!user.providerProfile.cacVerified) {
        return errorResponse(
          res,
          STATUS_CODES.FORBIDDEN,
          "Your CAC must be verified before creating a service listing"
        );
      }

      // Create service provider
      const providerData = {
        ...req.body,
        provider: req.user._id,
      };

      const serviceProvider = await ServiceProvider.create(providerData);

      successResponse(
        res,
        STATUS_CODES.CREATED,
        { provider: serviceProvider },
        "Service provider listing created successfully"
      );
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/providers/:providerId
 * @desc    Update service provider listing
 * @access  Private (Owner or Admin)
 */
router.put("/:providerId", protect, async (req, res, next) => {
  try {
    let provider = await ServiceProvider.findById(req.params.providerId);

    if (!provider) {
      return errorResponse(
        res,
        STATUS_CODES.NOT_FOUND,
        "Service provider not found"
      );
    }

    // Check ownership or admin
    if (
      provider.provider.toString() !== req.user._id.toString() &&
      req.user.role !== USER_ROLES.ADMIN
    ) {
      return errorResponse(
        res,
        STATUS_CODES.FORBIDDEN,
        "Not authorized to update this listing"
      );
    }

    provider = await ServiceProvider.findByIdAndUpdate(
      req.params.providerId,
      req.body,
      { new: true, runValidators: true }
    );

    successResponse(
      res,
      STATUS_CODES.OK,
      { provider },
      "Service provider listing updated successfully"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/providers/:providerId
 * @desc    Delete service provider listing
 * @access  Private (Owner or Admin)
 */
router.delete("/:providerId", protect, async (req, res, next) => {
  try {
    const provider = await ServiceProvider.findById(req.params.providerId);

    if (!provider) {
      return errorResponse(
        res,
        STATUS_CODES.NOT_FOUND,
        "Service provider not found"
      );
    }

    // Check ownership or admin
    if (
      provider.provider.toString() !== req.user._id.toString() &&
      req.user.role !== USER_ROLES.ADMIN
    ) {
      return errorResponse(
        res,
        STATUS_CODES.FORBIDDEN,
        "Not authorized to delete this listing"
      );
    }

    // Soft delete by setting isActive to false
    provider.isActive = false;
    await provider.save();

    successResponse(
      res,
      STATUS_CODES.OK,
      { provider },
      "Service provider listing deleted successfully"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/providers/:providerId/availability
 * @desc    Check provider availability for specific date
 * @access  Public
 */
router.get("/:providerId/availability", async (req, res, next) => {
  try {
    const { date } = req.query;

    if (!date) {
      return errorResponse(res, STATUS_CODES.BAD_REQUEST, "Date is required");
    }

    const provider = await ServiceProvider.findById(req.params.providerId);

    if (!provider) {
      return errorResponse(
        res,
        STATUS_CODES.NOT_FOUND,
        "Service provider not found"
      );
    }

    const checkDate = new Date(date);
    const isUnavailable = provider.availability.unavailableDates.some(
      (unavailableDate) =>
        new Date(unavailableDate).toDateString() === checkDate.toDateString()
    );

    successResponse(
      res,
      STATUS_CODES.OK,
      {
        isAvailable:
          !isUnavailable && provider.availability.status === "available",
        status: provider.availability.status,
        date: checkDate,
      },
      "Availability checked"
    );
  } catch (error) {
    next(error);
  }
});

module.exports = router;
