const express = require("express");
const router = express.Router();
const ServiceProvider = require("../models/ServiceProvider");
const EventCenter = require("../models/EventCenter");
const { successResponse, errorResponse } = require("../utils/helpers");
const { STATUS_CODES } = require("../utils/constants");

/**
 * @route   GET /api/search
 * @desc    Unified search across providers and centers
 * @access  Public
 */
router.get("/", async (req, res, next) => {
  try {
    const {
      // Search query
      q,

      // Type filter
      type, // 'provider', 'center', or 'all'

      // Common filters
      state,
      city,
      rating,
      minPrice,
      maxPrice,

      // Provider specific
      category,

      // Center specific
      centerType,
      minCapacity,
      maxCapacity,
      facilities,

      // Pagination
      page = 1,
      limit = 12,

      // Sorting
      sortBy = "createdAt",
      order = "desc",
    } = req.query;

    if (!q && !type) {
      return errorResponse(
        res,
        STATUS_CODES.BAD_REQUEST,
        "Search query or type filter is required"
      );
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    const sortOptions = {};
    sortOptions[sortBy] = order === "asc" ? 1 : -1;

    let providers = [];
    let centers = [];
    let providerTotal = 0;
    let centerTotal = 0;

    // Search providers
    if (!type || type === "all" || type === "provider") {
      const providerQuery = {
        isActive: true,
        verificationStatus: "verified",
      };

      // Search query
      if (q) {
        providerQuery.$or = [
          { serviceName: { $regex: q, $options: "i" } },
          { description: { $regex: q, $options: "i" } },
          { serviceCategory: { $regex: q, $options: "i" } },
        ];
      }

      // Filters
      if (category) providerQuery.serviceCategory = category;
      if (state) providerQuery["serviceArea.states"] = state;
      if (city) providerQuery["serviceArea.cities"] = city;
      if (rating)
        providerQuery["rating.average"] = { $gte: parseFloat(rating) };

      if (minPrice || maxPrice) {
        providerQuery["pricing.amount"] = {};
        if (minPrice)
          providerQuery["pricing.amount"].$gte = parseFloat(minPrice);
        if (maxPrice)
          providerQuery["pricing.amount"].$lte = parseFloat(maxPrice);
      }

      // Execute query
      if (type === "provider") {
        // Full pagination for provider-only search
        providers = await ServiceProvider.find(providerQuery)
          .populate("provider", "name")
          .sort(sortOptions)
          .limit(limitNum)
          .skip(skip)
          .lean();

        providerTotal = await ServiceProvider.countDocuments(providerQuery);
      } else {
        // Limited results for unified search
        providers = await ServiceProvider.find(providerQuery)
          .populate("provider", "name")
          .sort(sortOptions)
          .limit(6)
          .lean();

        providerTotal = await ServiceProvider.countDocuments(providerQuery);
      }
    }

    // Search centers
    if (!type || type === "all" || type === "center") {
      const centerQuery = {
        isActive: true,
        verificationStatus: "verified",
      };

      // Search query
      if (q) {
        centerQuery.$or = [
          { centerName: { $regex: q, $options: "i" } },
          { description: { $regex: q, $options: "i" } },
          { "location.city": { $regex: q, $options: "i" } },
          { "location.state": { $regex: q, $options: "i" } },
          { centerType: { $regex: q, $options: "i" } },
        ];
      }

      // Filters
      if (centerType) centerQuery.centerType = centerType;
      if (state) centerQuery["location.state"] = state;
      if (city) centerQuery["location.city"] = city;
      if (rating) centerQuery["rating.average"] = { $gte: parseFloat(rating) };

      if (minPrice || maxPrice) {
        centerQuery["pricing.dailyRate"] = {};
        if (minPrice)
          centerQuery["pricing.dailyRate"].$gte = parseFloat(minPrice);
        if (maxPrice)
          centerQuery["pricing.dailyRate"].$lte = parseFloat(maxPrice);
      }

      if (minCapacity) {
        centerQuery["capacity.maximum"] = { $gte: parseInt(minCapacity) };
      }
      if (maxCapacity) {
        centerQuery["capacity.minimum"] = { $lte: parseInt(maxCapacity) };
      }

      if (facilities) {
        const facilitiesArray = Array.isArray(facilities)
          ? facilities
          : [facilities];
        centerQuery.facilities = { $all: facilitiesArray };
      }

      // Execute query
      if (type === "center") {
        // Full pagination for center-only search
        centers = await EventCenter.find(centerQuery)
          .populate("owner", "name")
          .sort(sortOptions)
          .limit(limitNum)
          .skip(skip)
          .lean();

        centerTotal = await EventCenter.countDocuments(centerQuery);
      } else {
        // Limited results for unified search
        centers = await EventCenter.find(centerQuery)
          .populate("owner", "name")
          .sort(sortOptions)
          .limit(6)
          .lean();

        centerTotal = await EventCenter.countDocuments(centerQuery);
      }
    }

    // Calculate pagination
    const total = providerTotal + centerTotal;
    const pagination = {
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum),
      limit: limitNum,
      hasNext: pageNum < Math.ceil(total / limitNum),
      hasPrev: pageNum > 1,
      counts: {
        providers: providerTotal,
        centers: centerTotal,
      },
    };

    // Format results
    const results = {
      providers: providers.map((p) => ({
        ...p,
        resultType: "provider",
      })),
      centers: centers.map((c) => ({
        ...c,
        resultType: "center",
      })),
    };

    successResponse(
      res,
      STATUS_CODES.OK,
      {
        results,
        pagination,
        searchQuery: q,
        filters: {
          type,
          state,
          city,
          rating,
          priceRange: { min: minPrice, max: maxPrice },
        },
      },
      "Search completed successfully"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/search/suggestions
 * @desc    Get search suggestions based on partial query
 * @access  Public
 */
router.get("/suggestions", async (req, res, next) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || q.length < 2) {
      return successResponse(
        res,
        STATUS_CODES.OK,
        { suggestions: [] },
        "Query too short"
      );
    }

    const limitNum = parseInt(limit);

    // Get provider suggestions
    const providerSuggestions = await ServiceProvider.find({
      isActive: true,
      verificationStatus: "verified",
      $or: [
        { serviceName: { $regex: q, $options: "i" } },
        { serviceCategory: { $regex: q, $options: "i" } },
      ],
    })
      .select("serviceName serviceCategory")
      .limit(limitNum / 2)
      .lean();

    // Get center suggestions
    const centerSuggestions = await EventCenter.find({
      isActive: true,
      verificationStatus: "verified",
      $or: [
        { centerName: { $regex: q, $options: "i" } },
        { "location.city": { $regex: q, $options: "i" } },
        { centerType: { $regex: q, $options: "i" } },
      ],
    })
      .select("centerName location.city centerType")
      .limit(limitNum / 2)
      .lean();

    // Format suggestions
    const suggestions = [
      ...providerSuggestions.map((p) => ({
        text: p.serviceName,
        type: "provider",
        category: p.serviceCategory,
      })),
      ...centerSuggestions.map((c) => ({
        text: c.centerName,
        type: "center",
        location: c.location?.city,
        centerType: c.centerType,
      })),
    ];

    successResponse(
      res,
      STATUS_CODES.OK,
      { suggestions },
      "Suggestions retrieved"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/search/filters
 * @desc    Get available filter options for search
 * @access  Public
 */
router.get("/filters", async (req, res, next) => {
  try {
    // Get unique categories from providers
    const categories = await ServiceProvider.distinct("serviceCategory", {
      isActive: true,
      verificationStatus: "verified",
    });

    // Get unique center types
    const centerTypes = await EventCenter.distinct("centerType", {
      isActive: true,
      verificationStatus: "verified",
    });

    // Get unique states from both providers and centers
    const providerStates = await ServiceProvider.distinct(
      "serviceArea.states",
      {
        isActive: true,
        verificationStatus: "verified",
      }
    );

    const centerStates = await EventCenter.distinct("location.state", {
      isActive: true,
      verificationStatus: "verified",
    });

    const states = [...new Set([...providerStates, ...centerStates])].sort();

    // Get unique facilities
    const facilities = await EventCenter.distinct("facilities", {
      isActive: true,
      verificationStatus: "verified",
    });

    // Get price ranges
    const priceRanges = {
      providers: {
        min: await ServiceProvider.findOne({ isActive: true })
          .sort("pricing.amount")
          .select("pricing.amount")
          .lean(),
        max: await ServiceProvider.findOne({ isActive: true })
          .sort("-pricing.amount")
          .select("pricing.amount")
          .lean(),
      },
      centers: {
        min: await EventCenter.findOne({ isActive: true })
          .sort("pricing.dailyRate")
          .select("pricing.dailyRate")
          .lean(),
        max: await EventCenter.findOne({ isActive: true })
          .sort("-pricing.dailyRate")
          .select("pricing.dailyRate")
          .lean(),
      },
    };

    successResponse(
      res,
      STATUS_CODES.OK,
      {
        filters: {
          categories: categories.sort(),
          centerTypes: centerTypes.sort(),
          states,
          facilities: facilities.sort(),
          priceRanges: {
            providers: {
              min: priceRanges.providers.min?.pricing?.amount || 0,
              max: priceRanges.providers.max?.pricing?.amount || 0,
            },
            centers: {
              min: priceRanges.centers.min?.pricing?.dailyRate || 0,
              max: priceRanges.centers.max?.pricing?.dailyRate || 0,
            },
          },
          ratings: [1, 2, 3, 4, 5],
        },
      },
      "Filter options retrieved"
    );
  } catch (error) {
    next(error);
  }
});

module.exports = router;
