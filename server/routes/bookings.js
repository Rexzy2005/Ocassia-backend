const express = require("express");
const router = express.Router();
const Booking = require("../models/Booking");
const ServiceProvider = require("../models/ServiceProvider");
const EventCenter = require("../models/EventCenter");
const User = require("../models/User");
const { protect, authorize } = require("../middleware/auth");
const { successResponse, errorResponse } = require("../utils/helpers");
const {
  STATUS_CODES,
  USER_ROLES,
  BOOKING_STATUS,
} = require("../utils/constants");

/**
 * @route   POST /api/bookings
 * @desc    Create a new booking
 * @access  Private
 */
router.post("/", protect, async (req, res, next) => {
  try {
    const {
      bookingType,
      serviceProviderId,
      eventCenterId,
      eventDetails,
      pricing,
      paymentMethod = "escrow",
      notes,
    } = req.body;

    // Validate booking type
    if (!["provider", "center"].includes(bookingType)) {
      return errorResponse(
        res,
        STATUS_CODES.BAD_REQUEST,
        'Booking type must be either "provider" or "center"'
      );
    }

    // Validate required fields
    if (
      !eventDetails ||
      !eventDetails.eventDate ||
      !eventDetails.startTime ||
      !eventDetails.endTime
    ) {
      return errorResponse(
        res,
        STATUS_CODES.BAD_REQUEST,
        "Event date, start time, and end time are required"
      );
    }

    if (!pricing || !pricing.totalAmount) {
      return errorResponse(
        res,
        STATUS_CODES.BAD_REQUEST,
        "Pricing information is required"
      );
    }

    let provider = null;
    let serviceProvider = null;
    let eventCenter = null;

    // Provider booking
    if (bookingType === "provider") {
      if (!serviceProviderId) {
        return errorResponse(
          res,
          STATUS_CODES.BAD_REQUEST,
          "Service provider ID is required for provider bookings"
        );
      }

      serviceProvider = await ServiceProvider.findById(serviceProviderId);
      if (!serviceProvider) {
        return errorResponse(
          res,
          STATUS_CODES.NOT_FOUND,
          "Service provider not found"
        );
      }

      if (
        !serviceProvider.isActive ||
        serviceProvider.verificationStatus !== "verified"
      ) {
        return errorResponse(
          res,
          STATUS_CODES.BAD_REQUEST,
          "Service provider is not available"
        );
      }

      provider = serviceProvider.provider;

      // Check availability
      const eventDate = new Date(eventDetails.eventDate);
      const isUnavailable = serviceProvider.availability.unavailableDates.some(
        (unavailableDate) =>
          new Date(unavailableDate).toDateString() === eventDate.toDateString()
      );

      if (
        isUnavailable ||
        serviceProvider.availability.status !== "available"
      ) {
        return errorResponse(
          res,
          STATUS_CODES.CONFLICT,
          "Service provider is not available on the selected date"
        );
      }
    }

    // Center booking
    if (bookingType === "center") {
      if (!eventCenterId) {
        return errorResponse(
          res,
          STATUS_CODES.BAD_REQUEST,
          "Event center ID is required for center bookings"
        );
      }

      eventCenter = await EventCenter.findById(eventCenterId);
      if (!eventCenter) {
        return errorResponse(
          res,
          STATUS_CODES.NOT_FOUND,
          "Event center not found"
        );
      }

      if (
        !eventCenter.isActive ||
        eventCenter.verificationStatus !== "verified"
      ) {
        return errorResponse(
          res,
          STATUS_CODES.BAD_REQUEST,
          "Event center is not available"
        );
      }

      provider = eventCenter.owner;

      // Check availability
      const startDate = new Date(eventDetails.eventDate);
      const endDate = new Date(eventDetails.eventDate);
      endDate.setHours(23, 59, 59, 999);

      // Check booked dates
      const isBooked = eventCenter.availability.bookedDates.some((booking) => {
        const bookingStart = new Date(booking.startDate);
        const bookingEnd = new Date(booking.endDate);
        return startDate <= bookingEnd && endDate >= bookingStart;
      });

      // Check blocked dates
      const isBlocked = eventCenter.availability.blockedDates.some((block) => {
        const blockStart = new Date(block.startDate);
        const blockEnd = new Date(block.endDate);
        return startDate <= blockEnd && endDate >= blockStart;
      });

      if (isBooked || isBlocked) {
        return errorResponse(
          res,
          STATUS_CODES.CONFLICT,
          "Event center is not available on the selected date"
        );
      }

      // Validate capacity
      if (eventDetails.guestCount) {
        if (
          eventDetails.guestCount < eventCenter.capacity.minimum ||
          eventDetails.guestCount > eventCenter.capacity.maximum
        ) {
          return errorResponse(
            res,
            STATUS_CODES.BAD_REQUEST,
            `Guest count must be between ${eventCenter.capacity.minimum} and ${eventCenter.capacity.maximum}`
          );
        }
      }
    }

    // Prevent self-booking
    if (provider.toString() === req.user._id.toString()) {
      return errorResponse(
        res,
        STATUS_CODES.BAD_REQUEST,
        "You cannot book your own service/center"
      );
    }

    // Create booking
    const bookingData = {
      bookingType,
      customer: req.user._id,
      provider,
      serviceProvider: serviceProviderId,
      eventCenter: eventCenterId,
      eventDetails,
      pricing: {
        ...pricing,
        currency: pricing.currency || "NGN",
      },
      paymentMethod,
      notes,
      status: BOOKING_STATUS.PENDING,
      statusHistory: [
        {
          status: BOOKING_STATUS.PENDING,
          changedBy: req.user._id,
          changedAt: new Date(),
          reason: "Booking created",
        },
      ],
    };

    const booking = await Booking.create(bookingData);

    // Populate booking details
    await booking.populate([
      { path: "customer", select: "name email phone" },
      { path: "provider", select: "name email phone" },
      {
        path: "serviceProvider",
        select: "serviceName serviceCategory pricing",
      },
      { path: "eventCenter", select: "centerName location capacity pricing" },
    ]);

    successResponse(
      res,
      STATUS_CODES.CREATED,
      { booking },
      "Booking created successfully"
    );

    // TODO: Send notifications to provider
    // TODO: Create conversation for booking
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/users/:userId/bookings
 * @desc    Get user's bookings (as customer or provider)
 * @access  Private
 */
router.get("/users/:userId/bookings", protect, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const {
      role = "customer", // 'customer' or 'provider'
      status,
      bookingType,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      order = "desc",
    } = req.query;

    // Check authorization
    if (
      req.user._id.toString() !== userId &&
      req.user.role !== USER_ROLES.ADMIN
    ) {
      return errorResponse(
        res,
        STATUS_CODES.FORBIDDEN,
        "Not authorized to access these bookings"
      );
    }

    // Build query
    const query = {};

    if (role === "customer") {
      query.customer = userId;
    } else if (role === "provider") {
      query.provider = userId;
    } else {
      return errorResponse(
        res,
        STATUS_CODES.BAD_REQUEST,
        'Role must be either "customer" or "provider"'
      );
    }

    // Filters
    if (status) {
      query.status = status;
    }
    if (bookingType) {
      query.bookingType = bookingType;
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Sorting
    const sortOptions = {};
    sortOptions[sortBy] = order === "asc" ? 1 : -1;

    // Execute query
    const bookings = await Booking.find(query)
      .populate("customer", "name email phone")
      .populate("provider", "name email phone")
      .populate("serviceProvider", "serviceName serviceCategory pricing images")
      .populate("eventCenter", "centerName location capacity pricing images")
      .sort(sortOptions)
      .limit(limitNum)
      .skip(skip)
      .lean();

    // Get total count
    const total = await Booking.countDocuments(query);

    // Calculate pagination
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
      { bookings, pagination },
      "Bookings retrieved successfully"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/bookings/:bookingId
 * @desc    Get booking details
 * @access  Private
 */
router.get("/:bookingId", protect, async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.bookingId)
      .populate("customer", "name email phone")
      .populate("provider", "name email phone")
      .populate(
        "serviceProvider",
        "serviceName serviceCategory description pricing images portfolio terms"
      )
      .populate(
        "eventCenter",
        "centerName description location capacity pricing images terms"
      )
      .populate("statusHistory.changedBy", "name")
      .populate("review");

    if (!booking) {
      return errorResponse(res, STATUS_CODES.NOT_FOUND, "Booking not found");
    }

    // Check authorization
    if (
      booking.customer._id.toString() !== req.user._id.toString() &&
      booking.provider.toString() !== req.user._id.toString() &&
      req.user.role !== USER_ROLES.ADMIN
    ) {
      return errorResponse(
        res,
        STATUS_CODES.FORBIDDEN,
        "Not authorized to access this booking"
      );
    }

    successResponse(
      res,
      STATUS_CODES.OK,
      { booking },
      "Booking details retrieved"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/bookings/:bookingId/status
 * @desc    Update booking status
 * @access  Private
 */
router.put("/:bookingId/status", protect, async (req, res, next) => {
  try {
    const { status, reason } = req.body;

    if (!status) {
      return errorResponse(res, STATUS_CODES.BAD_REQUEST, "Status is required");
    }

    // Validate status
    if (!Object.values(BOOKING_STATUS).includes(status)) {
      return errorResponse(
        res,
        STATUS_CODES.BAD_REQUEST,
        "Invalid status value"
      );
    }

    const booking = await Booking.findById(req.params.bookingId);

    if (!booking) {
      return errorResponse(res, STATUS_CODES.NOT_FOUND, "Booking not found");
    }

    // Check authorization
    const isCustomer = booking.customer.toString() === req.user._id.toString();
    const isProvider = booking.provider.toString() === req.user._id.toString();
    const isAdmin = req.user.role === USER_ROLES.ADMIN;

    if (!isCustomer && !isProvider && !isAdmin) {
      return errorResponse(
        res,
        STATUS_CODES.FORBIDDEN,
        "Not authorized to update this booking"
      );
    }

    // Validate status transitions
    const currentStatus = booking.status;
    const allowedTransitions = {
      [BOOKING_STATUS.PENDING]: [
        BOOKING_STATUS.CONFIRMED,
        BOOKING_STATUS.CANCELLED,
      ],
      [BOOKING_STATUS.CONFIRMED]: [
        BOOKING_STATUS.COMPLETED,
        BOOKING_STATUS.CANCELLED,
      ],
      [BOOKING_STATUS.COMPLETED]: [], // Cannot change from completed
      [BOOKING_STATUS.CANCELLED]: [], // Cannot change from cancelled
    };

    if (!allowedTransitions[currentStatus].includes(status)) {
      return errorResponse(
        res,
        STATUS_CODES.BAD_REQUEST,
        `Cannot transition from ${currentStatus} to ${status}`
      );
    }

    // Role-based permissions for status changes
    if (status === BOOKING_STATUS.CONFIRMED && !isProvider && !isAdmin) {
      return errorResponse(
        res,
        STATUS_CODES.FORBIDDEN,
        "Only provider can confirm bookings"
      );
    }

    if (status === BOOKING_STATUS.COMPLETED && !isProvider && !isAdmin) {
      return errorResponse(
        res,
        STATUS_CODES.FORBIDDEN,
        "Only provider can mark bookings as completed"
      );
    }

    // Update status
    booking.status = status;
    booking.statusHistory.push({
      status,
      changedBy: req.user._id,
      changedAt: new Date(),
      reason: reason || `Status changed to ${status}`,
    });

    // Handle confirmed booking - mark dates as booked
    if (
      status === BOOKING_STATUS.CONFIRMED &&
      booking.bookingType === "center"
    ) {
      const eventCenter = await EventCenter.findById(booking.eventCenter);
      if (eventCenter) {
        const eventDate = new Date(booking.eventDetails.eventDate);
        const endDate = new Date(eventDate);
        endDate.setHours(23, 59, 59, 999);

        eventCenter.availability.bookedDates.push({
          startDate: eventDate,
          endDate: endDate,
          booking: booking._id,
        });
        await eventCenter.save();
      }
    }

    // Handle cancellation
    if (status === BOOKING_STATUS.CANCELLED) {
      booking.cancellation = {
        cancelledBy: req.user._id,
        cancelledAt: new Date(),
        reason: reason || "No reason provided",
      };

      // Remove from booked dates if center booking
      if (booking.bookingType === "center") {
        const eventCenter = await EventCenter.findById(booking.eventCenter);
        if (eventCenter) {
          eventCenter.availability.bookedDates =
            eventCenter.availability.bookedDates.filter(
              (bookedDate) =>
                bookedDate.booking.toString() !== booking._id.toString()
            );
          await eventCenter.save();
        }
      }
    }

    await booking.save();

    // Populate for response
    await booking.populate([
      { path: "customer", select: "name email" },
      { path: "provider", select: "name email" },
      { path: "statusHistory.changedBy", select: "name" },
    ]);

    successResponse(
      res,
      STATUS_CODES.OK,
      { booking },
      `Booking status updated to ${status}`
    );

    // TODO: Send notifications
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/bookings/:bookingId
 * @desc    Cancel booking
 * @access  Private
 */
router.delete("/:bookingId", protect, async (req, res, next) => {
  try {
    const { reason } = req.body;

    const booking = await Booking.findById(req.params.bookingId);

    if (!booking) {
      return errorResponse(res, STATUS_CODES.NOT_FOUND, "Booking not found");
    }

    // Check authorization
    const isCustomer = booking.customer.toString() === req.user._id.toString();
    const isProvider = booking.provider.toString() === req.user._id.toString();
    const isAdmin = req.user.role === USER_ROLES.ADMIN;

    if (!isCustomer && !isProvider && !isAdmin) {
      return errorResponse(
        res,
        STATUS_CODES.FORBIDDEN,
        "Not authorized to cancel this booking"
      );
    }

    // Check if already cancelled or completed
    if (booking.status === BOOKING_STATUS.CANCELLED) {
      return errorResponse(
        res,
        STATUS_CODES.BAD_REQUEST,
        "Booking is already cancelled"
      );
    }

    if (booking.status === BOOKING_STATUS.COMPLETED) {
      return errorResponse(
        res,
        STATUS_CODES.BAD_REQUEST,
        "Cannot cancel a completed booking"
      );
    }

    // Update status
    booking.status = BOOKING_STATUS.CANCELLED;
    booking.cancellation = {
      cancelledBy: req.user._id,
      cancelledAt: new Date(),
      reason: reason || "No reason provided",
    };

    booking.statusHistory.push({
      status: BOOKING_STATUS.CANCELLED,
      changedBy: req.user._id,
      changedAt: new Date(),
      reason: reason || "Booking cancelled",
    });

    // Remove from booked dates if center booking
    if (booking.bookingType === "center") {
      const eventCenter = await EventCenter.findById(booking.eventCenter);
      if (eventCenter) {
        eventCenter.availability.bookedDates =
          eventCenter.availability.bookedDates.filter(
            (bookedDate) =>
              bookedDate.booking.toString() !== booking._id.toString()
          );
        await eventCenter.save();
      }
    }

    await booking.save();

    successResponse(
      res,
      STATUS_CODES.OK,
      { booking },
      "Booking cancelled successfully"
    );

    // TODO: Handle refund logic
    // TODO: Send notifications
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/bookings/:bookingId/history
 * @desc    Get booking status history
 * @access  Private
 */
router.get("/:bookingId/history", protect, async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.bookingId)
      .select("statusHistory customer provider")
      .populate("statusHistory.changedBy", "name email");

    if (!booking) {
      return errorResponse(res, STATUS_CODES.NOT_FOUND, "Booking not found");
    }

    // Check authorization
    if (
      booking.customer.toString() !== req.user._id.toString() &&
      booking.provider.toString() !== req.user._id.toString() &&
      req.user.role !== USER_ROLES.ADMIN
    ) {
      return errorResponse(
        res,
        STATUS_CODES.FORBIDDEN,
        "Not authorized to access this booking history"
      );
    }

    successResponse(
      res,
      STATUS_CODES.OK,
      { history: booking.statusHistory },
      "Booking history retrieved"
    );
  } catch (error) {
    next(error);
  }
});

module.exports = router;
