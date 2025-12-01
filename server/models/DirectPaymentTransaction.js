const mongoose = require("mongoose");

const directPaymentTransactionSchema = new mongoose.Schema(
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
    transactionType: {
      type: String,
      enum: ["deposit", "full_payment", "balance"],
      required: [true, "Transaction type is required"],
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
    // Payment gateway details
    gateway: {
      name: {
        type: String,
        enum: ["paystack", "flutterwave", "stripe", "bank_transfer", "cash"],
        required: true,
      },
      transactionId: { type: String },
      reference: {
        type: String,
        unique: true,
        required: true,
      },
      authorizationUrl: { type: String },
      accessCode: { type: String },
    },
    // Payment status
    status: {
      type: String,
      enum: [
        "initiated",
        "pending",
        "processing",
        "successful",
        "failed",
        "cancelled",
        "refunded",
      ],
      default: "initiated",
    },
    // Bank transfer details (if applicable)
    bankTransferDetails: {
      accountName: { type: String },
      accountNumber: { type: String },
      bankName: { type: String },
      transferReference: { type: String },
      transferDate: { type: Date },
      proofOfPayment: { type: String }, // URL to uploaded proof
    },
    // Payment verification
    verified: {
      type: Boolean,
      default: false,
    },
    verifiedAt: {
      type: Date,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    // Timeline
    paidAt: {
      type: Date,
    },
    // Refund details
    refund: {
      refundedAt: { type: Date },
      refundAmount: { type: Number, min: 0 },
      refundReason: { type: String },
      refundReference: { type: String },
      refundedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    // Gateway response
    gatewayResponse: {
      type: mongoose.Schema.Types.Mixed,
    },
    // Transaction history
    history: [
      {
        status: { type: String },
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

// Generate unique reference before saving
directPaymentTransactionSchema.pre("save", async function (next) {
  if (!this.gateway.reference) {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0");
    this.gateway.reference = `DPT-${timestamp}-${random}`;
  }
  next();
});

// Indexes for performance
directPaymentTransactionSchema.index({ paymentFlow: 1 });
directPaymentTransactionSchema.index({ booking: 1 });
directPaymentTransactionSchema.index({ customer: 1, status: 1 });
directPaymentTransactionSchema.index({ provider: 1, status: 1 });
directPaymentTransactionSchema.index({ "gateway.reference": 1 });
directPaymentTransactionSchema.index({ "gateway.transactionId": 1 });
directPaymentTransactionSchema.index({ status: 1 });
directPaymentTransactionSchema.index({ verified: 1 });

module.exports = mongoose.model(
  "DirectPaymentTransaction",
  directPaymentTransactionSchema
);
