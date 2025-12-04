const express = require("express");
const router = express.Router();
const EventCenter = require("../models/EventCenter");
const User = require("../models/User");
const mongoose = require("mongoose");
const multer = require("multer");
const path = require("path");
const { protect, authorize } = require("../middleware/auth");
const { validate, schemas } = require("../middleware/validation");
const { successResponse, errorResponse } = require("../utils/helpers");
const { uploadBuffer, deleteFileByUrl } = require("../utils/storage");
const { STATUS_CODES, USER_ROLES } = require("../utils/constants");

// Use memory storage and delegate persistence to storage helper
const storage = multer.memoryStorage();
const upload = multer({ storage });
// Maximum images allowed per center
const MAX_IMAGES = 10;

/**
 * @route   GET /api/centers
 * @desc    Get all event centers with filtering, search, and pagination
 * @access  Public
 */
router.get("/", async (req, res, next) => {
  try {
    const {
      // Pagination
      page = 1,
      limit = 12,

      // Filtering
      centerType,
      state,
      city,
      minPrice,
      maxPrice,
      minCapacity,
      maxCapacity,
      rating,
      facilities,
      eventType,

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

    // Type filter
    if (centerType) {
      query.centerType = centerType;
    }

    // Location filters
    if (state) {
      query["location.state"] = state;
    }
    if (city) {
      query["location.city"] = city;
    }

    // Price range filter (daily rate)
    if (minPrice || maxPrice) {
      query["pricing.dailyRate"] = {};
      if (minPrice) query["pricing.dailyRate"].$gte = parseFloat(minPrice);
      if (maxPrice) query["pricing.dailyRate"].$lte = parseFloat(maxPrice);
    }

    // Capacity range filter
    if (minCapacity || maxCapacity) {
      if (minCapacity) {
        query["capacity.maximum"] = { $gte: parseInt(minCapacity) };
      }
      if (maxCapacity) {
        query["capacity.minimum"] = { $lte: parseInt(maxCapacity) };
      }
    }

    // Rating filter
    if (rating) {
      query["rating.average"] = { $gte: parseFloat(rating) };
    }

    // Facilities filter (supports multiple)
    if (facilities) {
      const facilitiesArray = Array.isArray(facilities)
        ? facilities
        : [facilities];
      query.facilities = { $all: facilitiesArray };
    }

    // Event type filter
    if (eventType) {
      query.eventTypes = eventType;
    }

    // Search functionality
    if (search) {
      query.$or = [
        { centerName: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { "location.city": { $regex: search, $options: "i" } },
        { "location.state": { $regex: search, $options: "i" } },
        { centerType: { $regex: search, $options: "i" } },
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
    const centers = await EventCenter.find(query)
      .populate("owner", "name email phone")
      .sort(sortOptions)
      .limit(limitNum)
      .skip(skip)
      .lean();

    // Get total count for pagination
    const total = await EventCenter.countDocuments(query);

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
        centers,
        pagination,
      },
      "Event centers retrieved successfully"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/centers/:centerId
 * @desc    Get single event center details
 * @access  Public
 */
router.get("/:centerId", async (req, res, next) => {
  try {
    const center = await EventCenter.findById(req.params.centerId).populate(
      "owner",
      "name email phone createdAt"
    );

    if (!center) {
      return errorResponse(
        res,
        STATUS_CODES.NOT_FOUND,
        "Event center not found"
      );
    }

    // Increment view count
    center.views += 1;
    await center.save();

    successResponse(
      res,
      STATUS_CODES.OK,
      { center },
      "Event center details retrieved"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/centers/profile
 * @desc    Create or setup an event center profile linked to a User (role: center)
 * @access  Private (Center user only)
 */
router.post(
  "/profile",
  protect,
  authorize(USER_ROLES.CENTER),
  validate(schemas.createCenterProfile),
  async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      // ensure the user doesn't already have a center profile
      const existing = await EventCenter.findOne({
        owner: req.user._id,
      }).session(session);
      if (existing) {
        await session.abortTransaction();
        session.endSession();
        return errorResponse(
          res,
          STATUS_CODES.CONFLICT,
          "Event center profile already exists"
        );
      }

      const centerData = {
        ...req.body,
        owner: req.user._id,
      };

      const createdArr = await EventCenter.create([centerData], { session });
      const created = createdArr[0];

      // Link back to user
      req.user.eventCenter = created._id;
      await req.user.save({ session });

      await session.commitTransaction();
      session.endSession();

      successResponse(
        res,
        STATUS_CODES.CREATED,
        { center: created },
        "Event center profile created successfully"
      );
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      next(error);
    }
  }
);

/**
 * @route   POST /api/centers
 * @desc    Create new event center listing (with images)
 * @access  Private (Center owner only)
 */
router.post(
  "/",
  protect,
  authorize(USER_ROLES.CENTER),
  upload.array("images", 10),
  async (req, res, next) => {
    try {
      // Check if center owner has an EventCenter profile
      let ec = await EventCenter.findOne({ owner: req.user._id });

      // If no EventCenter exists, create a basic one automatically
      if (!ec) {
        console.log(
          `[POST /api/centers] Creating EventCenter for user ${req.user._id} (auto-create)`
        );
        ec = new EventCenter({
          owner: req.user._id,
          centerName: req.body.name || "My Event Center",
          phone: req.user.phone,
        });
        await ec.save();
      }

      // Persist images via storage helper
      const images = [];
      for (const f of req.files || []) {
        const ext = path.extname(f.originalname);
        const filename = `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}${ext}`;
        // eslint-disable-next-line no-await-in-loop
        const url = await uploadBuffer(f.buffer, filename, f.mimetype);
        images.push({ url, caption: f.fieldname || "" });
      }

      // Update existing EventCenter with new listing data and images
      const updateData = {
        ...req.body,
        owner: req.user._id,
      };

      // Add images if provided. By default append new images to existing images
      // unless client explicitly requests replacement via `replaceImages=true`.
      if (images.length > 0) {
        const replaceFlag =
          req.body.replaceImages === true ||
          req.body.replaceImages === "true" ||
          req.body.replaceImages === "1";
        if (replaceFlag) {
          // Replace: keep only latest MAX_IMAGES from uploaded
          updateData.images = images.slice(-MAX_IMAGES);
        } else {
          // Append and trim to latest MAX_IMAGES
          const combined = [...(ec.images || []), ...images];
          updateData.images = combined.slice(-MAX_IMAGES);
        }
      } else if (req.body.images === undefined) {
        // If no new images uploaded and user didn't explicitly set images in body,
        // preserve existing images (trim just in case)
        updateData.images = (ec.images || []).slice(-MAX_IMAGES);
      }

      // Update the existing EventCenter document
      ec = await EventCenter.findByIdAndUpdate(ec._id, updateData, {
        new: true,
        runValidators: true,
      });

      successResponse(
        res,
        STATUS_CODES.CREATED,
        { center: ec, imagesCount: (ec.images || []).length },
        "Event center listing created successfully"
      );
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   PUT /api/centers/:centerId
 * @desc    Update event center listing (with images)
 * @access  Private (Owner or Admin)
 */
router.put(
  "/:centerId",
  protect,
  upload.array("images", 10),
  async (req, res, next) => {
    try {
      let center = await EventCenter.findById(req.params.centerId);

      if (!center) {
        return errorResponse(
          res,
          STATUS_CODES.NOT_FOUND,
          "Event center not found"
        );
      }

      // Check ownership or admin
      if (
        center.owner.toString() !== req.user._id.toString() &&
        req.user.role !== USER_ROLES.ADMIN
      ) {
        return errorResponse(
          res,
          STATUS_CODES.FORBIDDEN,
          "Not authorized to update this listing"
        );
      }

      // Persist images via storage helper
      const images = [];
      for (const f of req.files || []) {
        const ext = path.extname(f.originalname);
        const filename = `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}${ext}`;
        // eslint-disable-next-line no-await-in-loop
        const url = await uploadBuffer(f.buffer, filename, f.mimetype);
        images.push({ url, caption: f.fieldname || "" });
      }

      // Merge new images with existing or use from body
      const updateData = {
        ...req.body,
      };

      // Parse flags and lists from body (support JSON-stringified form fields)
      const replaceFlag =
        req.body.replaceImages === true ||
        req.body.replaceImages === "true" ||
        req.body.replaceImages === "1";

      let removeImages = [];
      if (req.body.removeImages) {
        if (typeof req.body.removeImages === "string") {
          try {
            removeImages = JSON.parse(req.body.removeImages);
          } catch (e) {
            // fallback: comma separated
            removeImages = req.body.removeImages
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
          }
        } else if (Array.isArray(req.body.removeImages)) {
          removeImages = req.body.removeImages;
        }
      }

      // If new files uploaded
      if (images.length > 0) {
        if (replaceFlag) {
          // Delete all existing images from storage when replacing
          const toDelete = (center.images || [])
            .map((i) => i.url)
            .filter(Boolean);
          if (toDelete.length > 0) {
            await Promise.all(toDelete.map((u) => deleteFileByUrl(u)));
          }
          // Replace and trim to MAX_IMAGES
          updateData.images = images.slice(-MAX_IMAGES);
        } else {
          // Append uploaded images to existing (but first remove any explicitly removed ones)
          const existing = (center.images || []).filter(
            (img) => !removeImages.includes(img.url)
          );
          // delete any explicitly removed images from storage
          if (removeImages.length > 0) {
            await Promise.all(removeImages.map((u) => deleteFileByUrl(u)));
          }
          const combined = [...existing, ...images];
          updateData.images = combined.slice(-MAX_IMAGES);
        }
      } else {
        // No new uploads
        if (removeImages.length > 0) {
          // Remove specified images from DB and storage
          const remaining = (center.images || []).filter(
            (img) => !removeImages.includes(img.url)
          );
          if (removeImages.length > 0) {
            await Promise.all(removeImages.map((u) => deleteFileByUrl(u)));
          }
          updateData.images = remaining.slice(-MAX_IMAGES);
        } else if (req.body.images === undefined) {
          // Preserve existing images when client didn't touch images
          updateData.images = (center.images || []).slice(-MAX_IMAGES);
        } else {
          // Client explicitly provided `images` field (could be [] to clear)
          let bodyImages = req.body.images;
          if (typeof bodyImages === "string") {
            try {
              bodyImages = JSON.parse(bodyImages);
            } catch (e) {
              bodyImages = [];
            }
          }
          updateData.images = (
            Array.isArray(bodyImages) ? bodyImages : []
          ).slice(-MAX_IMAGES);
        }
      }

      center = await EventCenter.findByIdAndUpdate(
        req.params.centerId,
        updateData,
        { new: true, runValidators: true }
      );

      successResponse(
        res,
        STATUS_CODES.OK,
        { center, imagesCount: (center.images || []).length },
        "Event center listing updated successfully"
      );
    } catch (error) {
      next(error);
    }
  }
);

/**
 * @route   DELETE /api/centers/:centerId
 * @desc    Delete event center listing
 * @access  Private (Owner or Admin)
 */
router.delete("/:centerId", protect, async (req, res, next) => {
  try {
    const center = await EventCenter.findById(req.params.centerId);

    if (!center) {
      return errorResponse(
        res,
        STATUS_CODES.NOT_FOUND,
        "Event center not found"
      );
    }

    // Check ownership or admin
    if (
      center.owner.toString() !== req.user._id.toString() &&
      req.user.role !== USER_ROLES.ADMIN
    ) {
      return errorResponse(
        res,
        STATUS_CODES.FORBIDDEN,
        "Not authorized to delete this listing"
      );
    }

    // Support hard delete (remove document and files) via query param or body flag
    const hardDelete =
      req.query.hard === "true" ||
      req.body.hardDelete === true ||
      req.body.hardDelete === "true";

    if (hardDelete) {
      // Delete images from storage
      const toDelete = (center.images || []).map((i) => i.url).filter(Boolean);
      if (toDelete.length > 0) {
        await Promise.all(toDelete.map((u) => deleteFileByUrl(u)));
      }

      // Remove document
      await EventCenter.findByIdAndDelete(center._id);

      // Unlink from user if linked
      try {
        const owner = await User.findById(center.owner);
        if (
          owner &&
          owner.eventCenter &&
          owner.eventCenter.toString() === center._id.toString()
        ) {
          owner.eventCenter = undefined;
          await owner.save();
        }
      } catch (e) {
        // do not block deletion on this
      }

      successResponse(
        res,
        STATUS_CODES.OK,
        {},
        "Event center listing permanently deleted"
      );
    } else {
      // Soft delete by setting isActive to false
      center.isActive = false;
      await center.save();

      successResponse(
        res,
        STATUS_CODES.OK,
        { center, imagesCount: (center.images || []).length },
        "Event center listing deleted successfully"
      );
    }
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/centers/:centerId/availability
 * @desc    Check center availability for date range
 * @access  Public
 */
router.get("/:centerId/availability", async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return errorResponse(
        res,
        STATUS_CODES.BAD_REQUEST,
        "Start date and end date are required"
      );
    }

    const center = await EventCenter.findById(req.params.centerId);

    if (!center) {
      return errorResponse(
        res,
        STATUS_CODES.NOT_FOUND,
        "Event center not found"
      );
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    // Check if dates overlap with booked dates
    const isBooked = center.availability.bookedDates.some((booking) => {
      const bookingStart = new Date(booking.startDate);
      const bookingEnd = new Date(booking.endDate);
      return start <= bookingEnd && end >= bookingStart;
    });

    // Check if dates overlap with blocked dates
    const isBlocked = center.availability.blockedDates.some((block) => {
      const blockStart = new Date(block.startDate);
      const blockEnd = new Date(block.endDate);
      return start <= blockEnd && end >= blockStart;
    });

    successResponse(
      res,
      STATUS_CODES.OK,
      {
        isAvailable: !isBooked && !isBlocked,
        startDate: start,
        endDate: end,
        reason: isBooked
          ? "Already booked"
          : isBlocked
          ? "Blocked by owner"
          : null,
      },
      "Availability checked"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/centers/:centerId/block-dates
 * @desc    Block dates for event center
 * @access  Private (Owner only)
 */
router.post("/:centerId/block-dates", protect, async (req, res, next) => {
  try {
    const { startDate, endDate, reason } = req.body;

    const center = await EventCenter.findById(req.params.centerId);

    if (!center) {
      return errorResponse(
        res,
        STATUS_CODES.NOT_FOUND,
        "Event center not found"
      );
    }

    // Check ownership
    if (center.owner.toString() !== req.user._id.toString()) {
      return errorResponse(
        res,
        STATUS_CODES.FORBIDDEN,
        "Not authorized to block dates for this center"
      );
    }

    center.availability.blockedDates.push({
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      reason,
    });

    await center.save();

    successResponse(
      res,
      STATUS_CODES.OK,
      { center },
      "Dates blocked successfully"
    );
  } catch (error) {
    next(error);
  }
});

module.exports = router;
