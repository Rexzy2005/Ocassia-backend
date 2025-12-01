const express = require("express");
const router = express.Router();
const EventCenter = require("../models/EventCenter");
const User = require("../models/User");
const { protect, authorize } = require("../middleware/auth");
const { successResponse, errorResponse } = require("../utils/helpers");
const { STATUS_CODES, USER_ROLES } = require("../utils/constants");

/**
 * @route   GET /api/centers
 * @desc    Get all event centers with filtering, search, and pagination
 * @access  Public
 */
router.get("/", async (req, res, next) => {
  try {
    const {
      // Pagination
      page = 1,
      limit = 12,

      // Filtering
      centerType,
      state,
      city,
      minPrice,
      maxPrice,
      minCapacity,
      maxCapacity,
      rating,
      facilities,
      eventType,

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

    // Type filter
    if (centerType) {
      query.centerType = centerType;
    }

    // Location filters
    if (state) {
      query["location.state"] = state;
    }
    if (city) {
      query["location.city"] = city;
    }

    // Price range filter (daily rate)
    if (minPrice || maxPrice) {
      query["pricing.dailyRate"] = {};
      if (minPrice) query["pricing.dailyRate"].$gte = parseFloat(minPrice);
      if (maxPrice) query["pricing.dailyRate"].$lte = parseFloat(maxPrice);
    }

    // Capacity range filter
    if (minCapacity || maxCapacity) {
      if (minCapacity) {
        query["capacity.maximum"] = { $gte: parseInt(minCapacity) };
      }
      if (maxCapacity) {
        query["capacity.minimum"] = { $lte: parseInt(maxCapacity) };
      }
    }

    // Rating filter
    if (rating) {
      query["rating.average"] = { $gte: parseFloat(rating) };
    }

    // Facilities filter (supports multiple)
    if (facilities) {
      const facilitiesArray = Array.isArray(facilities)
        ? facilities
        : [facilities];
      query.facilities = { $all: facilitiesArray };
    }

    // Event type filter
    if (eventType) {
      query.eventTypes = eventType;
    }

    // Search functionality
    if (search) {
      query.$or = [
        { centerName: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { "location.city": { $regex: search, $options: "i" } },
        { "location.state": { $regex: search, $options: "i" } },
        { centerType: { $regex: search, $options: "i" } },
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
    const centers = await EventCenter.find(query)
      .populate("owner", "name email phone centerProfile.centerName")
      .sort(sortOptions)
      .limit(limitNum)
      .skip(skip)
      .lean();

    // Get total count for pagination
    const total = await EventCenter.countDocuments(query);

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
        centers,
        pagination,
      },
      "Event centers retrieved successfully"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/centers/:centerId
 * @desc    Get single event center details
 * @access  Public
 */
router.get("/:centerId", async (req, res, next) => {
  try {
    const center = await EventCenter.findById(req.params.centerId).populate(
      "owner",
      "name email phone centerProfile createdAt"
    );

    if (!center) {
      return errorResponse(
        res,
        STATUS_CODES.NOT_FOUND,
        "Event center not found"
      );
    }

    // Increment view count
    center.views += 1;
    await center.save();

    successResponse(
      res,
      STATUS_CODES.OK,
      { center },
      "Event center details retrieved"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/centers
 * @desc    Create new event center listing
 * @access  Private (Center owner only)
 */
router.post(
  "/",
  protect,
  authorize(USER_ROLES.CENTER),
  async (req, res, next) => {
    try {
      // Check if center owner's CAC is verified
      const user = await User.findById(req.user._id);
      if (!user.centerProfile.cacVerified) {
        return errorResponse(
          res,
          STATUS_CODES.FORBIDDEN,
          "Your CAC must be verified before creating a center listing"
        );
      }

      // Create event center
      const centerData = {
        ...req.body,
        owner: req.user._id,
      };

      const eventCenter = await EventCenter.create(centerData);

      successResponse(
        res,
        STATUS_CODES.CREATED,
        { center: eventCenter },
        "Event center listing created successfully"
      );
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/centers/:centerId
 * @desc    Update event center listing
 * @access  Private (Owner or Admin)
 */
router.put("/:centerId", protect, async (req, res, next) => {
  try {
    let center = await EventCenter.findById(req.params.centerId);

    if (!center) {
      return errorResponse(
        res,
        STATUS_CODES.NOT_FOUND,
        "Event center not found"
      );
    }

    // Check ownership or admin
    if (
      center.owner.toString() !== req.user._id.toString() &&
      req.user.role !== USER_ROLES.ADMIN
    ) {
      return errorResponse(
        res,
        STATUS_CODES.FORBIDDEN,
        "Not authorized to update this listing"
      );
    }

    center = await EventCenter.findByIdAndUpdate(
      req.params.centerId,
      req.body,
      { new: true, runValidators: true }
    );

    successResponse(
      res,
      STATUS_CODES.OK,
      { center },
      "Event center listing updated successfully"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/centers/:centerId
 * @desc    Delete event center listing
 * @access  Private (Owner or Admin)
 */
router.delete("/:centerId", protect, async (req, res, next) => {
  try {
    const center = await EventCenter.findById(req.params.centerId);

    if (!center) {
      return errorResponse(
        res,
        STATUS_CODES.NOT_FOUND,
        "Event center not found"
      );
    }

    // Check ownership or admin
    if (
      center.owner.toString() !== req.user._id.toString() &&
      req.user.role !== USER_ROLES.ADMIN
    ) {
      return errorResponse(
        res,
        STATUS_CODES.FORBIDDEN,
        "Not authorized to delete this listing"
      );
    }

    // Soft delete by setting isActive to false
    center.isActive = false;
    await center.save();

    successResponse(
      res,
      STATUS_CODES.OK,
      { center },
      "Event center listing deleted successfully"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/centers/:centerId/availability
 * @desc    Check center availability for date range
 * @access  Public
 */
router.get("/:centerId/availability", async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return errorResponse(
        res,
        STATUS_CODES.BAD_REQUEST,
        "Start date and end date are required"
      );
    }

    const center = await EventCenter.findById(req.params.centerId);

    if (!center) {
      return errorResponse(
        res,
        STATUS_CODES.NOT_FOUND,
        "Event center not found"
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Check if dates overlap with booked dates
    const isBooked = center.availability.bookedDates.some((booking) => {
      const bookingStart = new Date(booking.startDate);
      const bookingEnd = new Date(booking.endDate);
      return start <= bookingEnd && end >= bookingStart;
    });

    // Check if dates overlap with blocked dates
    const isBlocked = center.availability.blockedDates.some((block) => {
      const blockStart = new Date(block.startDate);
      const blockEnd = new Date(block.endDate);
      return start <= blockEnd && end >= blockStart;
    });

    successResponse(
      res,
      STATUS_CODES.OK,
      {
        isAvailable: !isBooked && !isBlocked,
        startDate: start,
        endDate: end,
        reason: isBooked
          ? "Already booked"
          : isBlocked
          ? "Blocked by owner"
          : null,
      },
      "Availability checked"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/centers/:centerId/block-dates
 * @desc    Block dates for event center
 * @access  Private (Owner only)
 */
router.post("/:centerId/block-dates", protect, async (req, res, next) => {
  try {
    const { startDate, endDate, reason } = req.body;

    const center = await EventCenter.findById(req.params.centerId);

    if (!center) {
      return errorResponse(
        res,
        STATUS_CODES.NOT_FOUND,
        "Event center not found"
      );
    }

    // Check ownership
    if (center.owner.toString() !== req.user._id.toString()) {
      return errorResponse(
        res,
        STATUS_CODES.FORBIDDEN,
        "Not authorized to block dates for this center"
      );
    }

    center.availability.blockedDates.push({
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      reason,
    });

    await center.save();

    successResponse(
      res,
      STATUS_CODES.OK,
      { center },
      "Dates blocked successfully"
    );
  } catch (error) {
    next(error);
  }
});

module.exports = router;
