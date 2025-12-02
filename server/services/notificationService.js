const Notification = require("../models/Notification");

/**
 * Notification Service
 * Handles creation and sending of notifications
 */
class NotificationService {
  constructor(io) {
    this.io = io;
  }

  /**
   * Create and send notification
   */
  async createNotification(data) {
    try {
      const {
        recipient,
        sender,
        notificationType,
        title,
        message,
        relatedBooking,
        relatedServiceProvider,
        relatedEventCenter,
        relatedReview,
        relatedMessage,
        actionLink,
        actionText,
        priority = "medium",
        metadata,
      } = data;

      // Create notification
      const notification = await Notification.create({
        recipient,
        sender,
        notificationType,
        title,
        message,
        relatedBooking,
        relatedServiceProvider,
        relatedEventCenter,
        relatedReview,
        relatedMessage,
        actionLink,
        actionText,
        priority,
        metadata,
      });

      // Populate for real-time delivery
      await notification.populate([
        { path: "sender", select: "name email role" },
        {
          path: "relatedBooking",
          select: "bookingNumber eventDetails.eventName",
        },
      ]);

      // Send real-time notification via WebSocket
      if (this.io) {
        this.io.to(`user:${recipient}`).emit("notification:new", {
          notification,
        });
      }

      return notification;
    } catch (error) {
      console.error("Error creating notification:", error);
      throw error;
    }
  }

  /**
   * Booking created notification
   */
  async notifyBookingCreated(booking) {
    return this.createNotification({
      recipient: booking.provider,
      sender: booking.customer,
      notificationType: "booking_created",
      title: "New Booking Request",
      message: `You have a new booking request for ${
        booking.eventDetails.eventName || "an event"
      }`,
      relatedBooking: booking._id,
      actionLink: `/bookings/${booking._id}`,
      actionText: "View Booking",
      priority: "high",
    });
  }

  /**
   * Booking confirmed notification
   */
  async notifyBookingConfirmed(booking) {
    return this.createNotification({
      recipient: booking.customer,
      sender: booking.provider,
      notificationType: "booking_confirmed",
      title: "Booking Confirmed",
      message: `Your booking for ${
        booking.eventDetails.eventName || "an event"
      } has been confirmed`,
      relatedBooking: booking._id,
      actionLink: `/bookings/${booking._id}`,
      actionText: "View Details",
      priority: "high",
    });
  }

  /**
   * Booking cancelled notification
   */
  async notifyBookingCancelled(booking, cancelledBy) {
    const recipient =
      cancelledBy.toString() === booking.customer.toString()
        ? booking.provider
        : booking.customer;

    return this.createNotification({
      recipient,
      sender: cancelledBy,
      notificationType: "booking_cancelled",
      title: "Booking Cancelled",
      message: `Booking for ${
        booking.eventDetails.eventName || "an event"
      } has been cancelled`,
      relatedBooking: booking._id,
      actionLink: `/bookings/${booking._id}`,
      actionText: "View Details",
      priority: "high",
    });
  }

  /**
   * Booking completed notification
   */
  async notifyBookingCompleted(booking) {
    return this.createNotification({
      recipient: booking.customer,
      sender: booking.provider,
      notificationType: "booking_completed",
      title: "Booking Completed",
      message: `Your booking has been marked as completed. Please leave a review!`,
      relatedBooking: booking._id,
      actionLink: `/bookings/${booking._id}/review`,
      actionText: "Leave Review",
      priority: "medium",
    });
  }

  /**
   * Payment received notification
   */
  async notifyPaymentReceived(booking, amount) {
    return this.createNotification({
      recipient: booking.provider,
      sender: booking.customer,
      notificationType: "payment_received",
      title: "Payment Received",
      message: `Payment of ₦${amount.toLocaleString()} received for booking #${
        booking.bookingNumber
      }`,
      relatedBooking: booking._id,
      actionLink: `/bookings/${booking._id}`,
      actionText: "View Booking",
      priority: "high",
      metadata: { amount },
    });
  }

  /**
   * Payment released notification (from escrow)
   */
  async notifyPaymentReleased(booking, amount) {
    return this.createNotification({
      recipient: booking.provider,
      notificationType: "payment_released",
      title: "Payment Released",
      message: `Payment of ₦${amount.toLocaleString()} has been released from escrow`,
      relatedBooking: booking._id,
      actionLink: `/bookings/${booking._id}`,
      actionText: "View Details",
      priority: "high",
      metadata: { amount },
    });
  }

  /**
   * Review received notification
   */
  async notifyReviewReceived(review, providerId) {
    return this.createNotification({
      recipient: providerId,
      sender: review.reviewer,
      notificationType: "review_received",
      title: "New Review",
      message: `You received a ${review.ratings.overall}-star review`,
      relatedReview: review._id,
      relatedBooking: review.booking,
      actionLink: `/reviews/${review._id}`,
      actionText: "View Review",
      priority: "medium",
      metadata: { rating: review.ratings.overall },
    });
  }

  /**
   * Message received notification
   */
  async notifyMessageReceived(message, recipientId, senderName) {
    return this.createNotification({
      recipient: recipientId,
      sender: message.sender,
      notificationType: "message_received",
      title: "New Message",
      message: `${senderName}: ${
        message.content.text?.substring(0, 50) || "Sent an attachment"
      }`,
      relatedMessage: message._id,
      actionLink: `/conversations/${message.conversation}`,
      actionText: "View Message",
      priority: "medium",
    });
  }

  /**
   * CAC verified notification
   */
  async notifyCacVerified(userId, userRole) {
    const roleText =
      userRole === "provider" ? "service provider" : "event center";

    return this.createNotification({
      recipient: userId,
      notificationType: "cac_verified",
      title: "CAC Verified",
      message: `Your CAC has been verified. You can now create ${roleText} listings!`,
      actionLink:
        userRole === "provider" ? "/providers/create" : "/centers/create",
      actionText: "Create Listing",
      priority: "high",
    });
  }

  /**
   * CAC rejected notification
   */
  async notifyCacRejected(userId, reason) {
    return this.createNotification({
      recipient: userId,
      notificationType: "cac_rejected",
      title: "CAC Verification Failed",
      message: `Your CAC verification was rejected. ${
        reason || "Please contact support for details."
      }`,
      actionLink: "/profile",
      actionText: "Update Information",
      priority: "high",
      metadata: { reason },
    });
  }

  /**
   * Listing approved notification
   */
  async notifyListingApproved(listingId, listingType, userId) {
    const typeText = listingType === "provider" ? "service" : "center";

    return this.createNotification({
      recipient: userId,
      notificationType: "listing_approved",
      title: "Listing Approved",
      message: `Your ${typeText} listing has been approved and is now live!`,
      actionLink:
        listingType === "provider"
          ? `/providers/${listingId}`
          : `/centers/${listingId}`,
      actionText: "View Listing",
      priority: "high",
    });
  }

  /**
   * Listing rejected notification
   */
  async notifyListingRejected(listingType, userId, reason) {
    const typeText = listingType === "provider" ? "service" : "center";

    return this.createNotification({
      recipient: userId,
      notificationType: "listing_rejected",
      title: "Listing Rejected",
      message: `Your ${typeText} listing was rejected. ${
        reason || "Please review our guidelines."
      }`,
      actionLink: "/profile/listings",
      actionText: "View Listings",
      priority: "medium",
      metadata: { reason },
    });
  }

  /**
   * Event reminder notification
   */
  async notifyEventReminder(booking, daysBefore) {
    return this.createNotification({
      recipient: booking.customer,
      notificationType: "reminder",
      title: "Event Reminder",
      message: `Your event "${
        booking.eventDetails.eventName
      }" is coming up in ${daysBefore} day${daysBefore > 1 ? "s" : ""}!`,
      relatedBooking: booking._id,
      actionLink: `/bookings/${booking._id}`,
      actionText: "View Details",
      priority: "medium",
      metadata: { daysBefore },
    });
  }

  /**
   * System notification
   */
  async notifySystem(
    userId,
    title,
    message,
    actionLink,
    actionText,
    priority = "low"
  ) {
    return this.createNotification({
      recipient: userId,
      notificationType: "system",
      title,
      message,
      actionLink,
      actionText,
      priority,
    });
  }

  /**
   * Send bulk notifications
   */
  async sendBulkNotifications(notifications) {
    try {
      const created = await Notification.insertMany(notifications);

      // Send real-time notifications
      if (this.io) {
        created.forEach((notification) => {
          this.io
            .to(`user:${notification.recipient}`)
            .emit("notification:new", {
              notification,
            });
        });
      }

      return created;
    } catch (error) {
      console.error("Error sending bulk notifications:", error);
      throw error;
    }
  }

  /**
   * Clean up old notifications
   */
  async cleanupOldNotifications(daysOld = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const result = await Notification.deleteMany({
        isRead: true,
        readAt: { $lt: cutoffDate },
      });

      console.log(`Cleaned up ${result.deletedCount} old notifications`);
      return result.deletedCount;
    } catch (error) {
      console.error("Error cleaning up notifications:", error);
      throw error;
    }
  }
}

module.exports = NotificationService;
