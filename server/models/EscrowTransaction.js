const mongoose = require("mongoose");

const escrowTransactionSchema = new mongoose.Schema(
  {
    paymentFlow: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentFlow",
      required: [true, "Payment flow reference is required"],
    },
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: [true, "Booking reference is required"],
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Customer is required"],
    },
    provider: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Provider is required"],
    },
    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0, "Amount cannot be negative"],
    },
    currency: {
      type: String,
      default: "NGN",
    },
    status: {
      type: String,
      enum: [
        "created",
        "funded",
        "held",
        "disputed",
        "released",
        "refunded",
        "cancelled",
      ],
      default: "created",
    },
    // Escrow timeline
    fundedAt: {
      type: Date,
    },
    holdPeriod: {
      days: {
        type: Number,
        default: 7,
        min: [0, "Hold period cannot be negative"],
      },
      expiresAt: {
        type: Date,
      },
    },
    // Release conditions
    releaseConditions: {
      eventCompleted: { type: Boolean, default: false },
      customerApproved: { type: Boolean, default: false },
      autoReleaseDate: { type: Date },
    },
    releasedAt: {
      type: Date,
    },
    releasedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    releaseMethod: {
      type: String,
      enum: ["manual", "auto", "admin"],
    },
    // Dispute handling
    dispute: {
      isDisputed: { type: Boolean, default: false },
      disputedAt: { type: Date },
      disputedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reason: { type: String, maxlength: 1000 },
      status: {
        type: String,
        enum: ["open", "investigating", "resolved", "closed"],
      },
      resolution: { type: String },
      resolvedAt: { type: Date },
      resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    // Refund details
    refund: {
      refundedAt: { type: Date },
      refundAmount: { type: Number, min: 0 },
      refundReason: { type: String },
      refundedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    // Transaction history
    history: [
      {
        action: { type: String },
        performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        timestamp: { type: Date, default: Date.now },
        note: { type: String },
      },
    ],
    // Metadata
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Set hold period expiry date before saving
escrowTransactionSchema.pre("save", function (next) {
  if (this.fundedAt && !this.holdPeriod.expiresAt) {
    const expiryDate = new Date(this.fundedAt);
    expiryDate.setDate(expiryDate.getDate() + this.holdPeriod.days);
    this.holdPeriod.expiresAt = expiryDate;

    // Set auto-release date
    if (!this.releaseConditions.autoReleaseDate) {
      this.releaseConditions.autoReleaseDate = expiryDate;
    }
  }
  next();
});

// Indexes for performance
escrowTransactionSchema.index({ paymentFlow: 1 });
escrowTransactionSchema.index({ booking: 1 });
escrowTransactionSchema.index({ customer: 1, status: 1 });
escrowTransactionSchema.index({ provider: 1, status: 1 });
escrowTransactionSchema.index({ status: 1 });
escrowTransactionSchema.index({ "holdPeriod.expiresAt": 1 });
escrowTransactionSchema.index({ "dispute.isDisputed": 1, "dispute.status": 1 });

module.exports = mongoose.model("EscrowTransaction", escrowTransactionSchema);
