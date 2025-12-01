const mongoose = require("mongoose");

const paymentFlowSchema = new mongoose.Schema(
  {
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
    paymentMethod: {
      type: String,
      enum: ["escrow", "direct"],
      required: [true, "Payment method is required"],
    },
    totalAmount: {
      type: Number,
      required: [true, "Total amount is required"],
      min: [0, "Amount cannot be negative"],
    },
    currency: {
      type: String,
      default: "NGN",
    },
    platformFee: {
      percentage: {
        type: Number,
        default: 5,
        min: [0, "Fee percentage cannot be negative"],
      },
      amount: {
        type: Number,
        min: [0, "Fee amount cannot be negative"],
      },
    },
    providerAmount: {
      type: Number,
      min: [0, "Provider amount cannot be negative"],
    },
    status: {
      type: String,
      enum: [
        "initiated",
        "pending",
        "processing",
        "held_in_escrow",
        "released",
        "completed",
        "refunded",
        "failed",
        "cancelled",
      ],
      default: "initiated",
    },
    // Payment gateway details
    gateway: {
      name: {
        type: String,
        enum: ["paystack", "flutterwave", "stripe"],
      },
      transactionId: { type: String },
      reference: { type: String },
      authorizationUrl: { type: String },
    },
    // Timeline tracking
    timeline: [
      {
        status: { type: String },
        timestamp: { type: Date, default: Date.now },
        note: { type: String },
      },
    ],
    // Escrow details
    escrowDetails: {
      heldAt: { type: Date },
      releaseDate: { type: Date },
      releasedAt: { type: Date },
      releaseReason: { type: String },
    },
    // Refund details
    refundDetails: {
      refundedAt: { type: Date },
      refundAmount: { type: Number, min: 0 },
      refundReason: { type: String },
      refundReference: { type: String },
    },
    // Metadata
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

// Calculate platform fee and provider amount before saving
paymentFlowSchema.pre("save", function (next) {
  if (
    this.isModified("totalAmount") ||
    this.isModified("platformFee.percentage")
  ) {
    this.platformFee.amount =
      (this.totalAmount * this.platformFee.percentage) / 100;
    this.providerAmount = this.totalAmount - this.platformFee.amount;
  }
  next();
});

// Indexes for performance
paymentFlowSchema.index({ booking: 1 });
paymentFlowSchema.index({ customer: 1, status: 1 });
paymentFlowSchema.index({ provider: 1, status: 1 });
paymentFlowSchema.index({ "gateway.transactionId": 1 });
paymentFlowSchema.index({ "gateway.reference": 1 });
paymentFlowSchema.index({ status: 1 });

module.exports = mongoose.model("PaymentFlow", paymentFlowSchema);
