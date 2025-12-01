const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Recipient is required"],
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    notificationType: {
      type: String,
      required: [true, "Notification type is required"],
      enum: [
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
      ],
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: [100, "Title cannot exceed 100 characters"],
    },
    message: {
      type: String,
      required: [true, "Message is required"],
      trim: true,
      maxlength: [500, "Message cannot exceed 500 characters"],
    },
    // Related entities
    relatedBooking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
    },
    relatedServiceProvider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ServiceProvider",
    },
    relatedEventCenter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EventCenter",
    },
    relatedReview: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Review",
    },
    relatedMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    // Action link
    actionLink: {
      type: String,
      trim: true,
    },
    actionText: {
      type: String,
      trim: true,
    },
    // Status
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
    },
    // Priority
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    // Additional data
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, notificationType: 1 });
notificationSchema.index({ createdAt: -1 });

// Mark as read method
notificationSchema.methods.markAsRead = async function () {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

module.exports = mongoose.model("Notification", notificationSchema);
