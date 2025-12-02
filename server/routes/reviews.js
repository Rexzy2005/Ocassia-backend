const express = require("express");
const router = express.Router();
const Review = require("../models/Review");
const Booking = require("../models/Booking");
const ServiceProvider = require("../models/ServiceProvider");
const EventCenter = require("../models/EventCenter");
const User = require("../models/User");
const { protect, authorize } = require("../middleware/auth");
const { successResponse, errorResponse } = require("../utils/helpers");
const { STATUS_CODES, USER_ROLES } = require("../utils/constants");

/**
 * @route   POST /api/reviews
 * @desc    Create a new review (verified bookings only)
 * @access  Private
 */
router.post("/", protect, async (req, res, next) => {
  try {
    const {
      bookingId,
      ratings,
      title,
      comment,
      images,
      wouldRecommend = true,
    } = req.body;

    // Validate booking
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return errorResponse(res, STATUS_CODES.NOT_FOUND, "Booking not found");
    }

    // Check if user is the customer
    if (booking.customer.toString() !== req.user._id.toString()) {
      return errorResponse(
        res,
        STATUS_CODES.FORBIDDEN,
        "You can only review your own bookings"
      );
    }

    // Check if booking is completed
    if (booking.status !== "completed") {
      return errorResponse(
        res,
        STATUS_CODES.BAD_REQUEST,
        "You can only review completed bookings"
      );
    }

    // Check if already reviewed
    if (booking.reviewed) {
      return errorResponse(
        res,
        STATUS_CODES.CONFLICT,
        "You have already reviewed this booking"
      );
    }

    // Validate ratings
    if (!ratings || !ratings.overall) {
      return errorResponse(
        res,
        STATUS_CODES.BAD_REQUEST,
        "Overall rating is required"
      );
    }

    // Create review
    const reviewData = {
      reviewType: booking.bookingType,
      reviewer: req.user._id,
      booking: bookingId,
      ratings: {
        overall: ratings.overall,
        quality: ratings.quality || ratings.overall,
        communication: ratings.communication || ratings.overall,
        professionalism: ratings.professionalism || ratings.overall,
        valueForMoney: ratings.valueForMoney || ratings.overall,
      },
      title,
      comment,
      images: images || [],
      wouldRecommend,
      isVerified: true, // Verified because it's from a completed booking
    };

    // Set provider/center references
    if (booking.bookingType === "provider") {
      reviewData.serviceProvider = booking.serviceProvider;
      reviewData.provider = booking.provider;
    } else {
      reviewData.eventCenter = booking.eventCenter;
    }

    const review = await Review.create(reviewData);

    // Mark booking as reviewed
    booking.reviewed = true;
    booking.review = review._id;
    await booking.save();

    // Update rating for service provider or event center
    await updateRatings(review);

    // Populate review
    await review.populate([
      { path: "reviewer", select: "name email" },
      { path: "booking", select: "bookingNumber eventDetails.eventName" },
    ]);

    successResponse(
      res,
      STATUS_CODES.CREATED,
      { review },
      "Review created successfully"
    );

    // Send notification to provider
    const notificationService = req.app.get("notificationService");
    if (notificationService) {
      const providerId =
        booking.bookingType === "provider"
          ? booking.provider
          : (await EventCenter.findById(booking.eventCenter)).owner;

      await notificationService.notifyReviewReceived(review, providerId);
    }
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/reviews/:reviewId
 * @desc    Get single review details
 * @access  Public
 */
router.get("/:reviewId", async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.reviewId)
      .populate("reviewer", "name email")
      .populate(
        "booking",
        "bookingNumber eventDetails.eventName eventDetails.eventDate"
      )
      .populate("serviceProvider", "serviceName serviceCategory")
      .populate("eventCenter", "centerName location.city")
      .populate("response.respondedBy", "name");

    if (!review) {
      return errorResponse(res, STATUS_CODES.NOT_FOUND, "Review not found");
    }

    // Don't show hidden reviews unless user is admin
    if (review.isHidden && (!req.user || req.user.role !== USER_ROLES.ADMIN)) {
      return errorResponse(res, STATUS_CODES.NOT_FOUND, "Review not found");
    }

    successResponse(
      res,
      STATUS_CODES.OK,
      { review },
      "Review details retrieved"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/providers/:providerId/reviews
 * @desc    Get all reviews for a service provider
 * @access  Public
 */
router.get("/providers/:providerId/reviews", async (req, res, next) => {
  try {
    const {
      rating, // Filter by rating (e.g., 5, 4, 3)
      sortBy = "createdAt",
      order = "desc",
      page = 1,
      limit = 10,
    } = req.query;

    // Validate service provider exists
    const serviceProvider = await ServiceProvider.findById(
      req.params.providerId
    );
    if (!serviceProvider) {
      return errorResponse(
        res,
        STATUS_CODES.NOT_FOUND,
        "Service provider not found"
      );
    }

    // Build query
    const query = {
      serviceProvider: req.params.providerId,
      isHidden: false,
    };

    if (rating) {
      query["ratings.overall"] = parseInt(rating);
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Sorting
    const sortOptions = {};
    sortOptions[sortBy] = order === "asc" ? 1 : -1;

    // Get reviews
    const reviews = await Review.find(query)
      .populate("reviewer", "name")
      .populate("booking", "eventDetails.eventDate eventDetails.eventType")
      .populate("response.respondedBy", "name")
      .sort(sortOptions)
      .limit(limitNum)
      .skip(skip)
      .lean();

    // Get total count
    const total = await Review.countDocuments(query);

    // Get rating distribution
    const ratingDistribution = await Review.aggregate([
      { $match: { serviceProvider: serviceProvider._id, isHidden: false } },
      {
        $group: {
          _id: "$ratings.overall",
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: -1 } },
    ]);

    // Format rating distribution
    const distribution = {
      5: 0,
      4: 0,
      3: 0,
      2: 0,
      1: 0,
    };
    ratingDistribution.forEach((item) => {
      distribution[item._id] = item.count;
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
      {
        reviews,
        pagination,
        summary: {
          averageRating: serviceProvider.rating.average,
          totalReviews: serviceProvider.rating.count,
          ratingDistribution: distribution,
        },
      },
      "Reviews retrieved successfully"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/centers/:centerId/reviews
 * @desc    Get all reviews for an event center
 * @access  Public
 */
router.get("/centers/:centerId/reviews", async (req, res, next) => {
  try {
    const {
      rating,
      sortBy = "createdAt",
      order = "desc",
      page = 1,
      limit = 10,
    } = req.query;

    // Validate event center exists
    const eventCenter = await EventCenter.findById(req.params.centerId);
    if (!eventCenter) {
      return errorResponse(
        res,
        STATUS_CODES.NOT_FOUND,
        "Event center not found"
      );
    }

    // Build query
    const query = {
      eventCenter: req.params.centerId,
      isHidden: false,
    };

    if (rating) {
      query["ratings.overall"] = parseInt(rating);
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Sorting
    const sortOptions = {};
    sortOptions[sortBy] = order === "asc" ? 1 : -1;

    // Get reviews
    const reviews = await Review.find(query)
      .populate("reviewer", "name")
      .populate("booking", "eventDetails.eventDate eventDetails.eventType")
      .populate("response.respondedBy", "name")
      .sort(sortOptions)
      .limit(limitNum)
      .skip(skip)
      .lean();

    // Get total count
    const total = await Review.countDocuments(query);

    // Get rating distribution
    const ratingDistribution = await Review.aggregate([
      { $match: { eventCenter: eventCenter._id, isHidden: false } },
      {
        $group: {
          _id: "$ratings.overall",
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: -1 } },
    ]);

    // Format rating distribution
    const distribution = {
      5: 0,
      4: 0,
      3: 0,
      2: 0,
      1: 0,
    };
    ratingDistribution.forEach((item) => {
      distribution[item._id] = item.count;
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
      {
        reviews,
        pagination,
        summary: {
          averageRating: eventCenter.rating.average,
          totalReviews: eventCenter.rating.count,
          ratingDistribution: distribution,
        },
      },
      "Reviews retrieved successfully"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/reviews/:reviewId/helpful
 * @desc    Mark review as helpful (upvote)
 * @access  Private
 */
router.post("/:reviewId/helpful", protect, async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.reviewId);

    if (!review) {
      return errorResponse(res, STATUS_CODES.NOT_FOUND, "Review not found");
    }

    // Check if already marked as helpful
    const alreadyHelpful = review.helpfulBy.some(
      (userId) => userId.toString() === req.user._id.toString()
    );

    if (alreadyHelpful) {
      // Remove helpful vote (toggle off)
      review.helpfulBy = review.helpfulBy.filter(
        (userId) => userId.toString() !== req.user._id.toString()
      );
      review.helpfulVotes = Math.max(0, review.helpfulVotes - 1);
    } else {
      // Add helpful vote
      review.helpfulBy.push(req.user._id);
      review.helpfulVotes += 1;
    }

    await review.save();

    successResponse(
      res,
      STATUS_CODES.OK,
      {
        reviewId: review._id,
        helpfulVotes: review.helpfulVotes,
        isHelpful: !alreadyHelpful,
      },
      alreadyHelpful ? "Vote removed" : "Marked as helpful"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/reviews/:reviewId/response
 * @desc    Respond to a review (provider/owner only)
 * @access  Private
 */
router.post("/:reviewId/response", protect, async (req, res, next) => {
  try {
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return errorResponse(
        res,
        STATUS_CODES.BAD_REQUEST,
        "Response text is required"
      );
    }

    const review = await Review.findById(req.params.reviewId)
      .populate("serviceProvider")
      .populate("eventCenter");

    if (!review) {
      return errorResponse(res, STATUS_CODES.NOT_FOUND, "Review not found");
    }

    // Check if user is the provider/owner
    let isAuthorized = false;

    if (review.reviewType === "provider" && review.serviceProvider) {
      isAuthorized =
        review.serviceProvider.provider.toString() === req.user._id.toString();
    } else if (review.reviewType === "center" && review.eventCenter) {
      isAuthorized =
        review.eventCenter.owner.toString() === req.user._id.toString();
    }

    if (!isAuthorized && req.user.role !== USER_ROLES.ADMIN) {
      return errorResponse(
        res,
        STATUS_CODES.FORBIDDEN,
        "Only the service provider/owner can respond to this review"
      );
    }

    // Check if already responded
    if (review.response && review.response.text) {
      return errorResponse(
        res,
        STATUS_CODES.CONFLICT,
        "You have already responded to this review"
      );
    }

    // Add response
    review.response = {
      text,
      respondedBy: req.user._id,
      respondedAt: new Date(),
    };

    await review.save();

    await review.populate("response.respondedBy", "name email");

    successResponse(
      res,
      STATUS_CODES.OK,
      { review },
      "Response added successfully"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/reviews/:reviewId/hide
 * @desc    Hide review (admin only)
 * @access  Private/Admin
 */
router.put(
  "/:reviewId/hide",
  protect,
  authorize(USER_ROLES.ADMIN),
  async (req, res, next) => {
    try {
      const review = await Review.findById(req.params.reviewId);

      if (!review) {
        return errorResponse(res, STATUS_CODES.NOT_FOUND, "Review not found");
      }

      review.isHidden = true;
      await review.save();

      // Update ratings after hiding review
      await updateRatings(review, true);

      successResponse(
        res,
        STATUS_CODES.OK,
        { review },
        "Review hidden successfully"
      );
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/reviews/:reviewId/unhide
 * @desc    Unhide review (admin only)
 * @access  Private/Admin
 */
router.put(
  "/:reviewId/unhide",
  protect,
  authorize(USER_ROLES.ADMIN),
  async (req, res, next) => {
    try {
      const review = await Review.findById(req.params.reviewId);

      if (!review) {
        return errorResponse(res, STATUS_CODES.NOT_FOUND, "Review not found");
      }

      review.isHidden = false;
      await review.save();

      // Update ratings after unhiding review
      await updateRatings(review, false);

      successResponse(
        res,
        STATUS_CODES.OK,
        { review },
        "Review unhidden successfully"
      );
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   POST /api/reviews/:reviewId/report
 * @desc    Report a review
 * @access  Private
 */
router.post("/:reviewId/report", protect, async (req, res, next) => {
  try {
    const { reason } = req.body;

    const review = await Review.findById(req.params.reviewId);

    if (!review) {
      return errorResponse(res, STATUS_CODES.NOT_FOUND, "Review not found");
    }

    review.reportCount += 1;
    await review.save();

    successResponse(
      res,
      STATUS_CODES.OK,
      { reportCount: review.reportCount },
      "Review reported successfully"
    );

    // TODO: Notify admin if report count exceeds threshold
    if (review.reportCount >= 3) {
      // Send notification to admin
    }
  } catch (error) {
    next(error);
  }
});

/**
 * Helper function to update ratings
 */
async function updateRatings(review, isRemoving = false) {
  try {
    if (review.reviewType === "provider" && review.serviceProvider) {
      await updateProviderRating(review.serviceProvider, isRemoving);
    } else if (review.reviewType === "center" && review.eventCenter) {
      await updateCenterRating(review.eventCenter, isRemoving);
    }
  } catch (error) {
    console.error("Error updating ratings:", error);
  }
}

/**
 * Update service provider rating
 */
async function updateProviderRating(serviceProviderId, isRemoving) {
  const serviceProvider = await ServiceProvider.findById(serviceProviderId);
  if (!serviceProvider) return;

  // Calculate average rating from all non-hidden reviews
  const reviews = await Review.find({
    serviceProvider: serviceProviderId,
    isHidden: false,
  });

  if (reviews.length === 0) {
    serviceProvider.rating.average = 0;
    serviceProvider.rating.count = 0;
  } else {
    const totalRating = reviews.reduce(
      (sum, review) => sum + review.ratings.overall,
      0
    );
    serviceProvider.rating.average = parseFloat(
      (totalRating / reviews.length).toFixed(1)
    );
    serviceProvider.rating.count = reviews.length;
  }

  await serviceProvider.save();

  // Also update provider profile rating
  const provider = await User.findById(serviceProvider.provider);
  if (provider && provider.providerProfile) {
    provider.providerProfile.rating = serviceProvider.rating.average;
    provider.providerProfile.reviewCount = serviceProvider.rating.count;
    await provider.save();
  }
}

/**
 * Update event center rating
 */
async function updateCenterRating(eventCenterId, isRemoving) {
  const eventCenter = await EventCenter.findById(eventCenterId);
  if (!eventCenter) return;

  // Calculate average rating from all non-hidden reviews
  const reviews = await Review.find({
    eventCenter: eventCenterId,
    isHidden: false,
  });

  if (reviews.length === 0) {
    eventCenter.rating.average = 0;
    eventCenter.rating.count = 0;
  } else {
    const totalRating = reviews.reduce(
      (sum, review) => sum + review.ratings.overall,
      0
    );
    eventCenter.rating.average = parseFloat(
      (totalRating / reviews.length).toFixed(1)
    );
    eventCenter.rating.count = reviews.length;
  }

  await eventCenter.save();
}

module.exports = router;
