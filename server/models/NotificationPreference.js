const mongoose = require("mongoose");

const notificationPreferenceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    preferences: {
      // Email notifications
      email: {
        enabled: { type: Boolean, default: true },
        bookings: { type: Boolean, default: true },
        payments: { type: Boolean, default: true },
        messages: { type: Boolean, default: true },
        reviews: { type: Boolean, default: true },
        reminders: { type: Boolean, default: true },
        marketing: { type: Boolean, default: false },
      },
      // Push notifications
      push: {
        enabled: { type: Boolean, default: true },
        bookings: { type: Boolean, default: true },
        payments: { type: Boolean, default: true },
        messages: { type: Boolean, default: true },
        reviews: { type: Boolean, default: true },
        reminders: { type: Boolean, default: true },
      },
      // In-app notifications
      inApp: {
        enabled: { type: Boolean, default: true },
        bookings: { type: Boolean, default: true },
        payments: { type: Boolean, default: true },
        messages: { type: Boolean, default: true },
        reviews: { type: Boolean, default: true },
        reminders: { type: Boolean, default: true },
        system: { type: Boolean, default: true },
      },
    },
    // Do not disturb mode
    doNotDisturb: {
      enabled: { type: Boolean, default: false },
      startTime: { type: String, default: "22:00" },
      endTime: { type: String, default: "08:00" },
    },
    // Quiet hours
    quietHours: {
      enabled: { type: Boolean, default: false },
      days: [
        {
          type: String,
          enum: [
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
          ],
        },
      ],
    },
  },
  {
    timestamps: true,
  }
);

// Method to check if notification should be sent
notificationPreferenceSchema.methods.shouldSendNotification = function (
  type,
  channel
) {
  // Check if notifications are disabled
  if (!this.preferences[channel]?.enabled) {
    return false;
  }

  // Check do not disturb
  if (this.doNotDisturb.enabled) {
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;

    if (
      currentTime >= this.doNotDisturb.startTime ||
      currentTime <= this.doNotDisturb.endTime
    ) {
      return false;
    }
  }

  // Check quiet hours
  if (this.quietHours.enabled) {
    const currentDay = new Date().toLocaleDateString("en-US", {
      weekday: "lowercase",
    });
    if (this.quietHours.days.includes(currentDay)) {
      return false;
    }
  }

  // Check specific notification type
  const notificationTypeMap = {
    booking_created: "bookings",
    booking_confirmed: "bookings",
    booking_cancelled: "bookings",
    booking_completed: "bookings",
    payment_received: "payments",
    payment_released: "payments",
    review_received: "reviews",
    message_received: "messages",
    reminder: "reminders",
    system: "system",
  };

  const categoryKey = notificationTypeMap[type] || "system";
  return this.preferences[channel]?.[categoryKey] !== false;
};

module.exports = mongoose.model(
  "NotificationPreference",
  notificationPreferenceSchema
);
