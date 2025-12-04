const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const ServiceProvider = require('../models/ServiceProvider');
const EventCenter = require('../models/EventCenter');
const Conversation = require('../models/Conversation');
const Review = require('../models/Review');
const Notification = require('../models/Notification');
const { protect, authorize } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/helpers');
const { STATUS_CODES, USER_ROLES, BOOKING_STATUS } = require('../utils/constants');

/**
 * @route   GET /api/dashboard/host
 * @desc    Get host dashboard data
 * @access  Private (Host/User)
 */
router.get('/host', protect, async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Get upcoming events count (as customer)
    const now = new Date();
    const upcomingEvents = await Booking.countDocuments({
      customer: userId,
      status: { $in: [BOOKING_STATUS.PENDING, BOOKING_STATUS.CONFIRMED] },
      'eventDetails.eventDate': { $gte: now }
    });

    // Get pending responses count (bookings awaiting confirmation)
    const pendingResponses = await Booking.countDocuments({
      customer: userId,
      status: BOOKING_STATUS.PENDING
    });

    // Calculate total spent amount (completed bookings)
    const spentResult = await Booking.aggregate([
      {
        $match: {
          customer: userId,
          status: BOOKING_STATUS.COMPLETED,
          paymentStatus: { $in: ['completed', 'partial'] }
        }
      },
      {
        $group: {
          _id: null,
          totalSpent: { $sum: '$pricing.totalAmount' }
        }
      }
    ]);

    const totalSpent = spentResult.length > 0 ? spentResult[0].totalSpent : 0;

    // Get active messages count (unread messages)
    const conversations = await Conversation.find({
      participants: userId
    }).select('unreadCount');

    let activeMessages = 0;
    conversations.forEach(conv => {
      activeMessages += conv.unreadCount.get(userId.toString()) || 0;
    });

    // Get recent bookings (last 5)
    const recentBookings = await Booking.find({
      customer: userId
    })
      .populate('serviceProvider', 'serviceName serviceCategory')
      .populate('eventCenter', 'centerName location.city')
      .populate('provider', 'name')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    // Get booking status breakdown
    const bookingStatusBreakdown = await Booking.aggregate([
      { $match: { customer: userId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const statusCounts = {
      pending: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0
    };
    bookingStatusBreakdown.forEach(item => {
      statusCounts[item._id] = item.count;
    });

    // Get spending by month (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const spendingByMonth = await Booking.aggregate([
      {
        $match: {
          customer: userId,
          status: BOOKING_STATUS.COMPLETED,
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          total: { $sum: '$pricing.totalAmount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    successResponse(
      res,
      STATUS_CODES.OK,
      {
        summary: {
          upcomingEvents,
          pendingResponses,
          totalSpent,
          activeMessages
        },
        recentBookings,
        bookingStatusBreakdown: statusCounts,
        spendingByMonth
      },
      'Host dashboard data retrieved'
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/dashboard/provider
 * @desc    Get provider dashboard data
 * @access  Private (Provider)
 */
router.get('/provider', protect, authorize(USER_ROLES.PROVIDER), async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Get total bookings count (as provider)
    const totalBookings = await Booking.countDocuments({
      provider: userId
    });

    // Get pending bookings count
    const pendingBookings = await Booking.countDocuments({
      provider: userId,
      status: BOOKING_STATUS.PENDING
    });

    // Calculate total earnings (completed bookings)
    const earningsResult = await Booking.aggregate([
      {
        $match: {
          provider: userId,
          status: BOOKING_STATUS.COMPLETED,
          paymentStatus: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          totalEarnings: { $sum: '$pricing.totalAmount' }
        }
      }
    ]);

    const totalEarnings = earningsResult.length > 0 ? earningsResult[0].totalEarnings : 0;

    // Calculate pending earnings (confirmed but not completed)
    const pendingEarningsResult = await Booking.aggregate([
      {
        $match: {
          provider: userId,
          status: BOOKING_STATUS.CONFIRMED,
          'eventDetails.eventDate': { $gte: new Date() }
        }
      },
      {
        $group: {
          _id: null,
          pendingEarnings: { $sum: '$pricing.totalAmount' }
        }
      }
    ]);

    const pendingEarnings = pendingEarningsResult.length > 0 ? pendingEarningsResult[0].pendingEarnings : 0;

    // Get service providers for this user
    const serviceProviders = await ServiceProvider.find({
      provider: userId,
      isActive: true
    }).select('serviceName rating totalBookings');

    // Calculate average rating across all services
    let averageRating = 0;
    let totalReviews = 0;

    if (serviceProviders.length > 0) {
      const ratingsSum = serviceProviders.reduce((sum, sp) => sum + (sp.rating.average * sp.rating.count), 0);
      totalReviews = serviceProviders.reduce((sum, sp) => sum + sp.rating.count, 0);
      averageRating = totalReviews > 0 ? parseFloat((ratingsSum / totalReviews).toFixed(1)) : 0;
    }

    // Get upcoming bookings (confirmed)
    const upcomingBookings = await Booking.find({
      provider: userId,
      status: BOOKING_STATUS.CONFIRMED,
      'eventDetails.eventDate': { $gte: new Date() }
    })
      .populate('customer', 'name email phone')
      .populate('serviceProvider', 'serviceName')
      .sort({ 'eventDetails.eventDate': 1 })
      .limit(5)
      .lean();

    // Get booking status breakdown
    const bookingStatusBreakdown = await Booking.aggregate([
      { $match: { provider: userId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const statusCounts = {
      pending: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0
    };
    bookingStatusBreakdown.forEach(item => {
      statusCounts[item._id] = item.count;
    });

    // Get earnings by month (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const earningsByMonth = await Booking.aggregate([
      {
        $match: {
          provider: userId,
          status: BOOKING_STATUS.COMPLETED,
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          total: { $sum: '$pricing.totalAmount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Get recent reviews
    const recentReviews = await Review.find({
      provider: userId,
      isHidden: false
    })
      .populate('reviewer', 'name')
      .populate('booking', 'eventDetails.eventName')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    // Calculate response rate to pending bookings
    const totalPendingReceived = await Booking.countDocuments({
      provider: userId,
      status: { $in: [BOOKING_STATUS.PENDING, BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.COMPLETED] }
    });

    const respondedCount = await Booking.countDocuments({
      provider: userId,
      status: { $in: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.COMPLETED] }
    });

    const responseRate = totalPendingReceived > 0 
      ? parseFloat(((respondedCount / totalPendingReceived) * 100).toFixed(1))
      : 0;

    successResponse(
      res,
      STATUS_CODES.OK,
      {
        summary: {
          totalBookings,
          pendingBookings,
          totalEarnings,
          pendingEarnings,
          averageRating,
          totalReviews,
          responseRate
        },
        serviceProviders,
        upcomingBookings,
        recentReviews,
        bookingStatusBreakdown: statusCounts,
        earningsByMonth
      },
      'Provider dashboard data retrieved'
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/dashboard/center
 * @desc    Get center owner dashboard data
 * @access  Private (Center)
 */
router.get('/center', protect, authorize(USER_ROLES.CENTER), async (req, res, next) => {
  try {
    const userId = req.user._id;

    // Get event centers owned by user
    const eventCenters = await EventCenter.find({
      owner: userId,
      isActive: true
    }).select('centerName rating totalBookings');

    const centerIds = eventCenters.map(c => c._id);

    // Get total bookings count
    const totalBookings = await Booking.countDocuments({
      eventCenter: { $in: centerIds }
    });

    // Get pending bookings count
    const pendingBookings = await Booking.countDocuments({
      eventCenter: { $in: centerIds },
      status: BOOKING_STATUS.PENDING
    });

    // Calculate total revenue (completed bookings)
    const revenueResult = await Booking.aggregate([
      {
        $match: {
          eventCenter: { $in: centerIds },
          status: BOOKING_STATUS.COMPLETED,
          paymentStatus: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$pricing.totalAmount' }
        }
      }
    ]);

    const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;

    // Calculate pending revenue
    const pendingRevenueResult = await Booking.aggregate([
      {
        $match: {
          eventCenter: { $in: centerIds },
          status: BOOKING_STATUS.CONFIRMED,
          'eventDetails.eventDate': { $gte: new Date() }
        }
      },
      {
        $group: {
          _id: null,
          pendingRevenue: { $sum: '$pricing.totalAmount' }
        }
      }
    ]);

    const pendingRevenue = pendingRevenueResult.length > 0 ? pendingRevenueResult[0].pendingRevenue : 0;

    // Calculate average rating across all centers
    let averageRating = 0;
    let totalReviews = 0;

    if (eventCenters.length > 0) {
      const ratingsSum = eventCenters.reduce((sum, center) => sum + (center.rating.average * center.rating.count), 0);
      totalReviews = eventCenters.reduce((sum, center) => sum + center.rating.count, 0);
      averageRating = totalReviews > 0 ? parseFloat((ratingsSum / totalReviews).toFixed(1)) : 0;
    }

    // Calculate response rate
    const totalPendingReceived = await Booking.countDocuments({
      eventCenter: { $in: centerIds },
      status: { $in: [BOOKING_STATUS.PENDING, BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.COMPLETED] }
    });

    const respondedCount = await Booking.countDocuments({
      eventCenter: { $in: centerIds },
      status: { $in: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.COMPLETED] }
    });

    const responseRate = totalPendingReceived > 0 
      ? parseFloat(((respondedCount / totalPendingReceived) * 100).toFixed(1))
      : 0;

    // Get upcoming bookings
    const upcomingBookings = await Booking.find({
      eventCenter: { $in: centerIds },
      status: BOOKING_STATUS.CONFIRMED,
      'eventDetails.eventDate': { $gte: new Date() }
    })
      .populate('customer', 'name email phone')
      .populate('eventCenter', 'centerName')
      .sort({ 'eventDetails.eventDate': 1 })
      .limit(5)
      .lean();

    // Get booking status breakdown
    const bookingStatusBreakdown = await Booking.aggregate([
      { $match: { eventCenter: { $in: centerIds } } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const statusCounts = {
      pending: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0
    };
    bookingStatusBreakdown.forEach(item => {
      statusCounts[item._id] = item.count;
    });

    // Get revenue by month (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const revenueByMonth = await Booking.aggregate([
      {
        $match: {
          eventCenter: { $in: centerIds },
          status: BOOKING_STATUS.COMPLETED,
          createdAt: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          total: { $sum: '$pricing.totalAmount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Get recent reviews
    const recentReviews = await Review.find({
      eventCenter: { $in: centerIds },
      isHidden: false
    })
      .populate('reviewer', 'name')
      .populate('booking', 'eventDetails.eventName')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    // Get bookings by event type
    const bookingsByEventType = await Booking.aggregate([
      { $match: { eventCenter: { $in: centerIds } } },
      {
        $group: {
          _id: '$eventDetails.eventType',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]);

    successResponse(
      res,
      STATUS_CODES.OK,
      {
        summary: {
          totalBookings,
          pendingBookings,
          totalRevenue,
          pendingRevenue,
          averageRating,
          totalReviews,
          responseRate
        },
        eventCenters,
        upcomingBookings,
        recentReviews,
        bookingStatusBreakdown: statusCounts,
        revenueByMonth,
        bookingsByEventType
      },
      'Center dashboard data retrieved'
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/dashboard/admin
 * @desc    Get admin dashboard data
 * @access  Private (Admin)
 */
router.get('/admin', protect, authorize(USER_ROLES.ADMIN), async (req, res, next) => {
  try {
    // Get total counts
    const totalUsers = await require('../models/User').countDocuments();
    const totalProviders = await ServiceProvider.countDocuments({ isActive: true });
    const totalCenters = await EventCenter.countDocuments({ isActive: true });
    const totalBookings = await Booking.countDocuments();

    // Get pending verifications
    const pendingCACVerifications = await require('../models/User').countDocuments({
      $or: [
        { 'providerProfile.cacVerified': false, 'providerProfile.cacNumber': { $exists: true, $ne: null } },
        { 'centerProfile.cacVerified': false, 'centerProfile.cacNumber': { $exists: true, $ne: null } }
      ]
    });

    const pendingProviderListings = await ServiceProvider.countDocuments({
      verificationStatus: 'pending'
    });

    const pendingCenterListings = await EventCenter.countDocuments({
      verificationStatus: 'pending'
    });

    // Get revenue statistics
    const revenueResult = await Booking.aggregate([
      {
        $match: {
          status: BOOKING_STATUS.COMPLETED,
          paymentStatus: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$pricing.totalAmount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;
    const completedBookings = revenueResult.length > 0 ? revenueResult[0].count : 0;

    // Get platform statistics
    const platformStats = {
      averageBookingValue: completedBookings > 0 ? (totalRevenue / completedBookings) : 0,
      totalReviews: await Review.countDocuments({ isHidden: false }),
      reportedReviews: await Review.countDocuments({ reportCount: { $gte: 3 } })
    };

    // Get user growth (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const userGrowth = await require('../models/User').aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Get booking growth
    const bookingGrowth = await Booking.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Get top providers
    const topProviders = await ServiceProvider.find({ isActive: true })
      .sort({ 'rating.average': -1, totalBookings: -1 })
      .limit(5)
      .populate('provider', 'name email')
      .lean();

    // Get top centers
    const topCenters = await EventCenter.find({ isActive: true })
      .sort({ 'rating.average': -1, totalBookings: -1 })
      .limit(5)
      .populate('owner', 'name email')
      .lean();

    // Get recent activity
    const recentBookings = await Booking.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('customer', 'name')
      .populate('provider', 'name')
      .lean();

    successResponse(
      res,
      STATUS_CODES.OK,
      {
        summary: {
          totalUsers,
          totalProviders,
          totalCenters,
          totalBookings,
          completedBookings,
          totalRevenue,
          pendingCACVerifications,
          pendingProviderListings,
          pendingCenterListings
        },
        platformStats,
        userGrowth,
        bookingGrowth,
        topProviders,
        topCenters,
        recentBookings
      },
      'Admin dashboard data retrieved'
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/dashboard/analytics
 * @desc    Get detailed analytics (all roles)
 * @access  Private
 */
router.get('/analytics', protect, async (req, res, next) => {
  try {
    const { startDate, endDate, metric } = req.query;

    // Build date filter
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    let data = {};

    // Role-specific analytics
    if (req.user.role === USER_ROLES.PROVIDER) {
      data = await getProviderAnalytics(req.user._id, dateFilter);
    } else if (req.user.role === USER_ROLES.CENTER) {
      data = await getCenterAnalytics(req.user._id, dateFilter);
    } else if (req.user.role === USER_ROLES.HOST || req.user.role === USER_ROLES.USER) {
      data = await getHostAnalytics(req.user._id, dateFilter);
    } else if (req.user.role === USER_ROLES.ADMIN) {
      data = await getAdminAnalytics(dateFilter);
    }

    successResponse(
      res,
      STATUS_CODES.OK,
      data,
      'Analytics data retrieved'
    );
  } catch (error) {
    next(error);
  }
});

// Helper functions for analytics
async function getProviderAnalytics(userId, dateFilter) {
  const matchFilter = { provider: userId };
  if (Object.keys(dateFilter).length > 0) {
    matchFilter.createdAt = dateFilter;
  }

  const bookingStats = await Booking.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        confirmed: {
          $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] }
        },
        completed: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        cancelled: {
          $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
        },
        totalEarnings: { $sum: '$pricing.totalAmount' }
      }
    }
  ]);

  return { bookingStats: bookingStats[0] || {} };
}

async function getCenterAnalytics(userId, dateFilter) {
  const centers = await EventCenter.find({ owner: userId }).select('_id');
  const centerIds = centers.map(c => c._id);

  const matchFilter = { eventCenter: { $in: centerIds } };
  if (Object.keys(dateFilter).length > 0) {
    matchFilter.createdAt = dateFilter;
  }

  const bookingStats = await Booking.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        confirmed: {
          $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] }
        },
        completed: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        },
        totalRevenue: { $sum: '$pricing.totalAmount' }
      }
    }
  ]);

  return { bookingStats: bookingStats[0] || {} };
}

async function getHostAnalytics(userId, dateFilter) {
  const matchFilter = { customer: userId };
  if (Object.keys(dateFilter).length > 0) {
    matchFilter.createdAt = dateFilter;
  }

  const bookingStats = await Booking.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        upcoming: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $gte: ['$eventDetails.eventDate', new Date()] },
                  { $in: ['$status', ['pending', 'confirmed']] }
                ]
              },
              1,
              0
            ]
          }
        },
        totalSpent: { $sum: '$pricing.totalAmount' }
      }
    }
  ]);

  return { bookingStats: bookingStats[0] || {} };
}

async function getAdminAnalytics(dateFilter) {
  const matchFilter = {};
  if (Object.keys(dateFilter).length > 0) {
    matchFilter.createdAt = dateFilter;
  }

  const stats = await Booking.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: null,
        totalBookings: { $sum: 1 },
        totalRevenue: { $sum: '$pricing.totalAmount' },
        completedBookings: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
        }
      }
    }
  ]);

  return { platformStats: stats[0] || {} };
}

module.exports = router;