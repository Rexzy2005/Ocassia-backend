const express = require("express");
const router = express.Router();
const Notification = require("../models/Notification");
const { protect } = require("../middleware/auth");
const { successResponse, errorResponse } = require("../utils/helpers");
const { STATUS_CODES } = require("../utils/constants");

/**
 * @route   GET /api/notifications
 * @desc    Get user's notifications
 * @access  Private
 */
router.get("/", protect, async (req, res, next) => {
  try {
    const {
      type, // Filter by notification type
      isRead, // Filter by read status
      priority, // Filter by priority
      page = 1,
      limit = 20,
    } = req.query;

    // Build query
    const query = { recipient: req.user._id };

    if (type) {
      query.notificationType = type;
    }

    if (isRead !== undefined) {
      query.isRead = isRead === "true";
    }

    if (priority) {
      query.priority = priority;
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get notifications
    const notifications = await Notification.find(query)
      .populate("sender", "name email role")
      .populate("relatedBooking", "bookingNumber eventDetails.eventName status")
      .populate("relatedServiceProvider", "serviceName serviceCategory")
      .populate("relatedEventCenter", "centerName location.city")
      .populate("relatedReview", "ratings.overall comment")
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip(skip)
      .lean();

    // Get total count
    const total = await Notification.countDocuments(query);

    // Get unread count
    const unreadCount = await Notification.countDocuments({
      recipient: req.user._id,
      isRead: false,
    });

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
      { notifications, pagination, unreadCount },
      "Notifications retrieved successfully"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/notifications/unread-count
 * @desc    Get unread notification count
 * @access  Private
 */
router.get("/unread-count", protect, async (req, res, next) => {
  try {
    const unreadCount = await Notification.countDocuments({
      recipient: req.user._id,
      isRead: false,
    });

    successResponse(
      res,
      STATUS_CODES.OK,
      { unreadCount },
      "Unread count retrieved"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/notifications/:notificationId/read
 * @desc    Mark notification as read
 * @access  Private
 */
router.put("/:notificationId/read", protect, async (req, res, next) => {
  try {
    const notification = await Notification.findById(req.params.notificationId);

    if (!notification) {
      return errorResponse(
        res,
        STATUS_CODES.NOT_FOUND,
        "Notification not found"
      );
    }

    // Check ownership
    if (notification.recipient.toString() !== req.user._id.toString()) {
      return errorResponse(
        res,
        STATUS_CODES.FORBIDDEN,
        "Not authorized to update this notification"
      );
    }

    // Mark as read
    await notification.markAsRead();

    successResponse(
      res,
      STATUS_CODES.OK,
      { notification },
      "Notification marked as read"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/notifications/read-all
 * @desc    Mark all notifications as read
 * @access  Private
 */
router.put("/read-all", protect, async (req, res, next) => {
  try {
    const result = await Notification.updateMany(
      {
        recipient: req.user._id,
        isRead: false,
      },
      {
        isRead: true,
        readAt: new Date(),
      }
    );

    successResponse(
      res,
      STATUS_CODES.OK,
      { markedCount: result.modifiedCount },
      "All notifications marked as read"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/notifications/:notificationId
 * @desc    Delete notification
 * @access  Private
 */
router.delete("/:notificationId", protect, async (req, res, next) => {
  try {
    const notification = await Notification.findById(req.params.notificationId);

    if (!notification) {
      return errorResponse(
        res,
        STATUS_CODES.NOT_FOUND,
        "Notification not found"
      );
    }

    // Check ownership
    if (notification.recipient.toString() !== req.user._id.toString()) {
      return errorResponse(
        res,
        STATUS_CODES.FORBIDDEN,
        "Not authorized to delete this notification"
      );
    }

    await Notification.findByIdAndDelete(req.params.notificationId);

    successResponse(
      res,
      STATUS_CODES.OK,
      null,
      "Notification deleted successfully"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/notifications
 * @desc    Delete all read notifications
 * @access  Private
 */
router.delete("/", protect, async (req, res, next) => {
  try {
    const result = await Notification.deleteMany({
      recipient: req.user._id,
      isRead: true,
    });

    successResponse(
      res,
      STATUS_CODES.OK,
      { deletedCount: result.deletedCount },
      "Read notifications deleted successfully"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/notifications/types
 * @desc    Get available notification types
 * @access  Private
 */
router.get("/types", protect, async (req, res, next) => {
  try {
    const types = [
      "booking_created",
      "booking_confirmed",
      "booking_cancelled",
      "booking_completed",
      "payment_received",
      "payment_released",
      "review_received",
      "message_received",
      "cac_verified",
      "cac_rejected",
      "listing_approved",
      "listing_rejected",
      "reminder",
      "system",
    ];

    successResponse(
      res,
      STATUS_CODES.OK,
      { types },
      "Notification types retrieved"
    );
  } catch (error) {
    next(error);
  }
});

module.exports = router;
