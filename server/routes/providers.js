const express = require("express");
const router = express.Router();
const ServiceProvider = require("../models/ServiceProvider");
const User = require("../models/User");
const { protect, authorize } = require("../middleware/auth");
const { successResponse, errorResponse } = require("../utils/helpers");
const { STATUS_CODES, USER_ROLES } = require("../utils/constants");
const { validate, schemas } = require("../middleware/validation");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { uploadBuffer, deleteFileByUrl } = require("../utils/storage");

// Use memory storage and delegate persistence to storage helper (disk or S3)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Helper to resolve a provider by its ServiceProvider _id or by the user id (provider field).
async function resolveProvider(id) {
  if (!id) return null;
  let p = null;
  try {
    p = await ServiceProvider.findById(id);
  } catch (e) {
    // ignore invalid ObjectId errors and try fallback
  }
  if (!p) {
    p = await ServiceProvider.findOne({ provider: id });
  }
  return p;
}

/**
 * @route   GET /api/providers
 * @desc    Get all service providers with filtering, search, and pagination
 * @access  Public
 */
router.get("/", async (req, res, next) => {
  try {
    const {
      // Pagination
      page = 1,
      limit = 12,

      // Filtering
      category,
      state,
      city,
      minPrice,
      maxPrice,
      rating,
      availability,

      // Search
      search,

      // Sorting
      sortBy = "createdAt",
      order = "desc",
    } = req.query;

    // Build query
    const query = {
      isActive: true,
      verificationStatus: "verified",
    };

    // Category filter
    if (category) {
      query.serviceCategory = category;
    }

    // Location filters
    if (state) {
      query["serviceArea.states"] = state;
    }
    if (city) {
      query["serviceArea.cities"] = city;
    }

    // Price range filter
    if (minPrice || maxPrice) {
      query["pricing.amount"] = {};
      if (minPrice) query["pricing.amount"].$gte = parseFloat(minPrice);
      if (maxPrice) query["pricing.amount"].$lte = parseFloat(maxPrice);
    }

    // Rating filter
    if (rating) {
      query["rating.average"] = { $gte: parseFloat(rating) };
    }

    // Availability filter
    if (availability) {
      query["availability.status"] = availability;
    }

    // Search functionality
    if (search) {
      query.$or = [
        { serviceName: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { serviceCategory: { $regex: search, $options: "i" } },
      ];
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Sorting
    const sortOptions = {};
    sortOptions[sortBy] = order === "asc" ? 1 : -1;

    // Execute query
    const providers = await ServiceProvider.find(query)
      .populate("provider", "name email phone")
      .sort(sortOptions)
      .limit(limitNum)
      .skip(skip)
      .lean();

    // Get total count for pagination
    const total = await ServiceProvider.countDocuments(query);

    // Calculate pagination info
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
        providers,
        pagination,
      },
      "Service providers retrieved successfully"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/providers/:providerId
 * @desc    Get single service provider details
 * @access  Public
 */
router.get("/:providerId", async (req, res, next) => {
  try {
    const provider = await ServiceProvider.findById(
      req.params.providerId
    ).populate("provider", "name email phone createdAt");

    if (!provider) {
      return errorResponse(
        res,
        STATUS_CODES.NOT_FOUND,
        "Service provider not found"
      );
    }

    // Increment view count
    provider.views += 1;
    await provider.save();

    successResponse(
      res,
      STATUS_CODES.OK,
      { provider },
      "Service provider details retrieved"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/providers/me
 * @desc    Get current authenticated user's ServiceProvider id (if exists)
 * @access  Private (authenticated user)
 */
router.get("/me", protect, async (req, res, next) => {
  try {
    // Try to find a ServiceProvider linked to this user
    const sp = await ServiceProvider.findOne({ provider: req.user._id }).select(
      "_id provider serviceCategory"
    );
    if (!sp) {
      // Return 200 with null so frontend can handle creation flow without treating as error
      return successResponse(
        res,
        STATUS_CODES.OK,
        { serviceProviderId: null },
        "No ServiceProvider profile found for user"
      );
    }

    return successResponse(
      res,
      STATUS_CODES.OK,
      { serviceProviderId: sp._id, provider: sp },
      "ServiceProvider found"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/providers
 * @desc    Create new service provider listing
 * @access  Private (Provider only)
 */
router.post(
  "/",
  protect,
  authorize(USER_ROLES.PROVIDER),
  async (req, res, next) => {
    try {
      // Check if provider has a ServiceProvider profile
      const sp = await ServiceProvider.findOne({ provider: req.user._id });
      if (!sp) {
        return errorResponse(
          res,
          STATUS_CODES.FORBIDDEN,
          "You must create a service provider profile first via POST /api/providers/profile"
        );
      }

      // Create service provider
      const providerData = {
        ...req.body,
        provider: req.user._id,
      };

      const serviceProvider = await ServiceProvider.create(providerData);

      successResponse(
        res,
        STATUS_CODES.CREATED,
        { provider: serviceProvider },
        "Service provider listing created successfully"
      );
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/providers/:providerId
 * @desc    Update service provider listing
 * @access  Private (Owner or Admin)
 */
router.put("/:providerId", protect, async (req, res, next) => {
  try {
    let provider = await ServiceProvider.findById(req.params.providerId);

    if (!provider) {
      return errorResponse(
        res,
        STATUS_CODES.NOT_FOUND,
        "Service provider not found"
      );
    }

    // Check ownership or admin
    if (
      provider.provider.toString() !== req.user._id.toString() &&
      req.user.role !== USER_ROLES.ADMIN
    ) {
      return errorResponse(
        res,
        STATUS_CODES.FORBIDDEN,
        "Not authorized to update this listing"
      );
    }

    provider = await ServiceProvider.findByIdAndUpdate(
      req.params.providerId,
      req.body,
      { new: true, runValidators: true }
    );

    successResponse(
      res,
      STATUS_CODES.OK,
      { provider },
      "Service provider listing updated successfully"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /api/providers/:providerId
 * @desc    Delete service provider listing
 * @access  Private (Owner or Admin)
 */
router.delete("/:providerId", protect, async (req, res, next) => {
  try {
    const provider = await resolveProvider(req.params.providerId);

    if (!provider) {
      return errorResponse(
        res,
        STATUS_CODES.NOT_FOUND,
        "Service provider not found"
      );
    }

    // Check ownership or admin
    if (
      provider.provider.toString() !== req.user._id.toString() &&
      req.user.role !== USER_ROLES.ADMIN
    ) {
      return errorResponse(
        res,
        STATUS_CODES.FORBIDDEN,
        "Not authorized to delete this listing"
      );
    }

    // Soft delete by setting isActive to false
    provider.isActive = false;
    await provider.save();

    successResponse(
      res,
      STATUS_CODES.OK,
      { provider },
      "Service provider listing deleted successfully"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/providers/:providerId/availability
 * @desc    Check provider availability for specific date
 * @access  Public
 */
router.get("/:providerId/availability", async (req, res, next) => {
  try {
    const { date } = req.query;

    if (!date) {
      return errorResponse(res, STATUS_CODES.BAD_REQUEST, "Date is required");
    }

    const provider = await resolveProvider(req.params.providerId);

    if (!provider) {
      return errorResponse(
        res,
        STATUS_CODES.NOT_FOUND,
        "Service provider not found"
      );
    }

    const checkDate = new Date(date);
    const isUnavailable = provider.availability.unavailableDates.some(
      (unavailableDate) =>
        new Date(unavailableDate).toDateString() === checkDate.toDateString()
    );

    successResponse(
      res,
      STATUS_CODES.OK,
      {
        isAvailable:
          !isUnavailable && provider.availability.status === "available",
        status: provider.availability.status,
        date: checkDate,
      },
      "Availability checked"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/providers/:providerId/services
 * @desc Create a service for provider
 * @access Private (provider owner)
 */
router.post(
  "/:providerId/services",
  protect,
  upload.array("images", 6),
  validate(schemas.createService),
  async (req, res, next) => {
    try {
      const provider = await resolveProvider(req.params.providerId);
      if (!provider) {
        return errorResponse(
          res,
          STATUS_CODES.NOT_FOUND,
          "Service provider not found"
        );
      }

      if (
        provider.provider.toString() !== req.user._id.toString() &&
        req.user.role !== USER_ROLES.ADMIN
      ) {
        return errorResponse(
          res,
          STATUS_CODES.FORBIDDEN,
          "Not authorized to add service to this provider"
        );
      }

      const { title, description, pricing, availability } = req.body;

      // persist images via storage helper
      const images = [];
      for (const f of req.files || []) {
        const ext = path.extname(f.originalname);
        const filename = `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}${ext}`;
        // uploadBuffer returns a URL (local /uploads/... or S3 URL)
        // eslint-disable-next-line no-await-in-loop
        const url = await uploadBuffer(f.buffer, filename, f.mimetype);
        images.push({ url });
      }

      const service = {
        title,
        description,
        pricing: pricing ? JSON.parse(pricing) : undefined,
        availability: availability ? JSON.parse(availability) : undefined,
        images,
      };

      provider.services = provider.services || [];
      provider.services.push(service);
      await provider.save();

      successResponse(
        res,
        STATUS_CODES.CREATED,
        { service: provider.services[provider.services.length - 1] },
        "Service created"
      );
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route PUT /api/providers/:providerId/services/:serviceId
 * @desc Update a service
 * @access Private (owner)
 */
router.put(
  "/:providerId/services/:serviceId",
  protect,
  upload.array("images", 6),
  validate(schemas.updateService),
  async (req, res, next) => {
    try {
      const { providerId, serviceId } = req.params;
      const provider = await resolveProvider(providerId);
      if (!provider) {
        return errorResponse(
          res,
          STATUS_CODES.NOT_FOUND,
          "Service provider not found"
        );
      }

      if (
        provider.provider.toString() !== req.user._id.toString() &&
        req.user.role !== USER_ROLES.ADMIN
      ) {
        return errorResponse(
          res,
          STATUS_CODES.FORBIDDEN,
          "Not authorized to update this service"
        );
      }

      const service = provider.services.id(serviceId);
      if (!service) {
        return errorResponse(res, STATUS_CODES.NOT_FOUND, "Service not found");
      }

      // Update fields
      const { title, description, pricing, availability } = req.body;
      if (title !== undefined) service.title = title;
      if (description !== undefined) service.description = description;
      if (pricing !== undefined) service.pricing = JSON.parse(pricing);
      if (availability !== undefined)
        service.availability = JSON.parse(availability);

      // Append new images if any
      // handle uploaded images in memory
      const newImages = [];
      for (const f of req.files || []) {
        const ext = path.extname(f.originalname);
        const filename = `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}${ext}`;
        // eslint-disable-next-line no-await-in-loop
        const url = await uploadBuffer(f.buffer, filename, f.mimetype);
        newImages.push({ url });
      }
      if (newImages.length) {
        service.images = (service.images || []).concat(newImages);
      }

      await provider.save();

      successResponse(res, STATUS_CODES.OK, { service }, "Service updated");
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route DELETE /api/providers/:providerId/services/:serviceId
 * @desc Delete a service
 * @access Private (owner)
 */
router.delete(
  "/:providerId/services/:serviceId",
  protect,
  async (req, res, next) => {
    const { providerId, serviceId } = req.params;
    console.debug(
      `[providers] DELETE service called by user ${req.user?._id} providerId=${providerId} serviceId=${serviceId}`
    );
    try {
      const provider = await resolveProvider(providerId);
      if (!provider) {
        console.warn(`[providers] Provider not found for id=${providerId}`);
        return errorResponse(
          res,
          STATUS_CODES.NOT_FOUND,
          "Service provider not found"
        );
      }

      if (
        provider.provider.toString() !== req.user._id.toString() &&
        req.user.role !== USER_ROLES.ADMIN
      ) {
        console.warn(
          `[providers] User ${req.user._id} not authorized to delete service on provider ${provider._id}`
        );
        return errorResponse(
          res,
          STATUS_CODES.FORBIDDEN,
          "Not authorized to delete this service"
        );
      }

      const service =
        provider.services && provider.services.id
          ? provider.services.id(serviceId)
          : null;
      if (!service) {
        console.warn(
          `[providers] Service not found: provider=${provider._id} serviceId=${serviceId}`
        );
        return errorResponse(res, STATUS_CODES.NOT_FOUND, "Service not found");
      }

      // Remove associated image files (best-effort) using storage helper
      try {
        for (const img of service.images || []) {
          if (img && img.url) {
            // eslint-disable-next-line no-await-in-loop
            await deleteFileByUrl(img.url);
          }
        }
      } catch (e) {
        console.warn(
          "[providers] Error deleting images for service",
          e && e.message
        );
      }

      service.remove();
      await provider.save();

      return successResponse(
        res,
        STATUS_CODES.OK,
        { provider },
        "Service deleted"
      );
    } catch (error) {
      console.error(
        "[providers] DELETE service error:",
        error && (error.stack || error.message || error)
      );
      return errorResponse(
        res,
        STATUS_CODES.SERVER_ERROR,
        "Failed to delete service"
      );
    }
  }
);

/**
 * @route DELETE /api/providers/:providerId/services/:serviceId/images/:imageId
 * @desc Remove a single image from a service
 * @access Private (owner or admin)
 */
router.delete(
  "/:providerId/services/:serviceId/images/:imageId",
  protect,
  async (req, res, next) => {
    try {
      const { providerId, serviceId, imageId } = req.params;
      const provider = await resolveProvider(providerId);
      if (!provider)
        return errorResponse(res, STATUS_CODES.NOT_FOUND, "Provider not found");

      if (
        provider.provider.toString() !== req.user._id.toString() &&
        req.user.role !== USER_ROLES.ADMIN
      ) {
        return errorResponse(
          res,
          STATUS_CODES.FORBIDDEN,
          "Not authorized to modify this provider"
        );
      }

      const service = provider.services.id(serviceId);
      if (!service)
        return errorResponse(res, STATUS_CODES.NOT_FOUND, "Service not found");

      const img = service.images.id(imageId);
      if (!img)
        return errorResponse(res, STATUS_CODES.NOT_FOUND, "Image not found");

      // delete file from storage
      try {
        await deleteFileByUrl(img.url);
      } catch (e) {
        // ignore
      }

      img.remove();
      await provider.save();

      successResponse(res, STATUS_CODES.OK, { service }, "Image removed");
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route PUT /api/providers/:providerId/services/:serviceId/images/:imageId
 * @desc Update image metadata (caption, isPrimary)
 * @access Private (owner or admin)
 */
router.put(
  "/:providerId/services/:serviceId/images/:imageId",
  protect,
  async (req, res, next) => {
    try {
      const { providerId, serviceId, imageId } = req.params;
      const { caption, isPrimary } = req.body;
      const provider = await resolveProvider(providerId);
      if (!provider)
        return errorResponse(res, STATUS_CODES.NOT_FOUND, "Provider not found");

      if (
        provider.provider.toString() !== req.user._id.toString() &&
        req.user.role !== USER_ROLES.ADMIN
      ) {
        return errorResponse(
          res,
          STATUS_CODES.FORBIDDEN,
          "Not authorized to modify this provider"
        );
      }

      const service = provider.services.id(serviceId);
      if (!service)
        return errorResponse(res, STATUS_CODES.NOT_FOUND, "Service not found");

      const img = service.images.id(imageId);
      if (!img)
        return errorResponse(res, STATUS_CODES.NOT_FOUND, "Image not found");

      if (caption !== undefined) img.caption = caption;
      if (isPrimary !== undefined) {
        // clear other primary flags
        service.images.forEach((i) => (i.isPrimary = false));
        img.isPrimary = !!isPrimary;
      }

      await provider.save();
      successResponse(res, STATUS_CODES.OK, { service }, "Image updated");
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route PUT /api/providers/:providerId/services/:serviceId/images/order
 * @desc Reorder images for a service. Body: { order: [imageId,...] }
 * @access Private (owner or admin)
 */
router.put(
  "/:providerId/services/:serviceId/images/order",
  protect,
  async (req, res, next) => {
    try {
      const { providerId, serviceId } = req.params;
      const { order } = req.body;
      if (!Array.isArray(order))
        return errorResponse(
          res,
          STATUS_CODES.BAD_REQUEST,
          "Order must be an array of image ids"
        );

      const provider = await ServiceProvider.findById(providerId);
      if (!provider)
        return errorResponse(res, STATUS_CODES.NOT_FOUND, "Provider not found");

      if (
        provider.provider.toString() !== req.user._id.toString() &&
        req.user.role !== USER_ROLES.ADMIN
      ) {
        return errorResponse(
          res,
          STATUS_CODES.FORBIDDEN,
          "Not authorized to modify this provider"
        );
      }

      const service = provider.services.id(serviceId);
      if (!service)
        return errorResponse(res, STATUS_CODES.NOT_FOUND, "Service not found");

      const newImages = [];
      for (const imgId of order) {
        const img = service.images.id(imgId);
        if (img) newImages.push(img);
      }
      // replace images array with reordered ones (those not included keep appended)
      const remaining = service.images.filter(
        (i) => !order.includes(i._id.toString())
      );
      service.images = newImages.concat(remaining);

      await provider.save();
      successResponse(res, STATUS_CODES.OK, { service }, "Images reordered");
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route PUT /api/providers/:providerId/services/:serviceId/approve
 * @desc Approve a service (admin)
 * @access Private (admin)
 */
router.put(
  "/:providerId/services/:serviceId/approve",
  protect,
  authorize(USER_ROLES.ADMIN),
  async (req, res, next) => {
    try {
      const { providerId, serviceId } = req.params;
      const provider = await ServiceProvider.findById(providerId);
      if (!provider)
        return errorResponse(res, STATUS_CODES.NOT_FOUND, "Provider not found");
      const service = provider.services.id(serviceId);
      if (!service)
        return errorResponse(res, STATUS_CODES.NOT_FOUND, "Service not found");
      service.moderation = service.moderation || {};
      service.moderation.status = "approved";
      service.moderation.moderatedBy = req.user._id;
      service.moderation.moderatedAt = new Date();
      await provider.save();
      successResponse(res, STATUS_CODES.OK, { service }, "Service approved");
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route PUT /api/providers/:providerId/services/:serviceId/reject
 * @desc Reject a service (admin)
 * @access Private (admin)
 */
router.put(
  "/:providerId/services/:serviceId/reject",
  protect,
  authorize(USER_ROLES.ADMIN),
  async (req, res, next) => {
    try {
      const { providerId, serviceId } = req.params;
      const { notes } = req.body;
      const provider = await ServiceProvider.findById(providerId);
      if (!provider)
        return errorResponse(res, STATUS_CODES.NOT_FOUND, "Provider not found");
      const service = provider.services.id(serviceId);
      if (!service)
        return errorResponse(res, STATUS_CODES.NOT_FOUND, "Service not found");
      service.moderation = service.moderation || {};
      service.moderation.status = "rejected";
      service.moderation.notes = notes;
      service.moderation.moderatedBy = req.user._id;
      service.moderation.moderatedAt = new Date();
      await provider.save();
      successResponse(res, STATUS_CODES.OK, { service }, "Service rejected");
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
