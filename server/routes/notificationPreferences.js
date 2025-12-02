const express = require("express");
const router = express.Router();
const NotificationPreference = require("../models/NotificationPreference");
const { protect } = require("../middleware/auth");
const { successResponse, errorResponse } = require("../utils/helpers");
const { STATUS_CODES } = require("../utils/constants");

/**
 * @route   GET /api/notification-preferences
 * @desc    Get user's notification preferences
 * @access  Private
 */
router.get("/", protect, async (req, res, next) => {
  try {
    let preferences = await NotificationPreference.findOne({
      user: req.user._id,
    });

    // Create default preferences if none exist
    if (!preferences) {
      preferences = await NotificationPreference.create({
        user: req.user._id,
      });
    }

    successResponse(
      res,
      STATUS_CODES.OK,
      { preferences },
      "Notification preferences retrieved"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/notification-preferences
 * @desc    Update notification preferences
 * @access  Private
 */
router.put("/", protect, async (req, res, next) => {
  try {
    const { preferences, doNotDisturb, quietHours } = req.body;

    let userPreferences = await NotificationPreference.findOne({
      user: req.user._id,
    });

    if (!userPreferences) {
      // Create new preferences
      userPreferences = await NotificationPreference.create({
        user: req.user._id,
        preferences,
        doNotDisturb,
        quietHours,
      });
    } else {
      // Update existing preferences
      if (preferences) {
        userPreferences.preferences = {
          ...userPreferences.preferences,
          ...preferences,
        };
      }

      if (doNotDisturb) {
        userPreferences.doNotDisturb = {
          ...userPreferences.doNotDisturb,
          ...doNotDisturb,
        };
      }

      if (quietHours) {
        userPreferences.quietHours = {
          ...userPreferences.quietHours,
          ...quietHours,
        };
      }

      await userPreferences.save();
    }

    successResponse(
      res,
      STATUS_CODES.OK,
      { preferences: userPreferences },
      "Notification preferences updated"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/notification-preferences/email
 * @desc    Update email notification preferences
 * @access  Private
 */
router.put("/email", protect, async (req, res, next) => {
  try {
    const emailPrefs = req.body;

    let userPreferences = await NotificationPreference.findOne({
      user: req.user._id,
    });

    if (!userPreferences) {
      userPreferences = await NotificationPreference.create({
        user: req.user._id,
        "preferences.email": emailPrefs,
      });
    } else {
      userPreferences.preferences.email = {
        ...userPreferences.preferences.email,
        ...emailPrefs,
      };
      await userPreferences.save();
    }

    successResponse(
      res,
      STATUS_CODES.OK,
      { emailPreferences: userPreferences.preferences.email },
      "Email preferences updated"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/notification-preferences/push
 * @desc    Update push notification preferences
 * @access  Private
 */
router.put("/push", protect, async (req, res, next) => {
  try {
    const pushPrefs = req.body;

    let userPreferences = await NotificationPreference.findOne({
      user: req.user._id,
    });

    if (!userPreferences) {
      userPreferences = await NotificationPreference.create({
        user: req.user._id,
        "preferences.push": pushPrefs,
      });
    } else {
      userPreferences.preferences.push = {
        ...userPreferences.preferences.push,
        ...pushPrefs,
      };
      await userPreferences.save();
    }

    successResponse(
      res,
      STATUS_CODES.OK,
      { pushPreferences: userPreferences.preferences.push },
      "Push preferences updated"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/notification-preferences/in-app
 * @desc    Update in-app notification preferences
 * @access  Private
 */
router.put("/in-app", protect, async (req, res, next) => {
  try {
    const inAppPrefs = req.body;

    let userPreferences = await NotificationPreference.findOne({
      user: req.user._id,
    });

    if (!userPreferences) {
      userPreferences = await NotificationPreference.create({
        user: req.user._id,
        "preferences.inApp": inAppPrefs,
      });
    } else {
      userPreferences.preferences.inApp = {
        ...userPreferences.preferences.inApp,
        ...inAppPrefs,
      };
      await userPreferences.save();
    }

    successResponse(
      res,
      STATUS_CODES.OK,
      { inAppPreferences: userPreferences.preferences.inApp },
      "In-app preferences updated"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /api/notification-preferences/do-not-disturb
 * @desc    Update do not disturb settings
 * @access  Private
 */
router.put("/do-not-disturb", protect, async (req, res, next) => {
  try {
    const { enabled, startTime, endTime } = req.body;

    let userPreferences = await NotificationPreference.findOne({
      user: req.user._id,
    });

    if (!userPreferences) {
      userPreferences = await NotificationPreference.create({
        user: req.user._id,
      });
    }

    if (enabled !== undefined) userPreferences.doNotDisturb.enabled = enabled;
    if (startTime) userPreferences.doNotDisturb.startTime = startTime;
    if (endTime) userPreferences.doNotDisturb.endTime = endTime;

    await userPreferences.save();

    successResponse(
      res,
      STATUS_CODES.OK,
      { doNotDisturb: userPreferences.doNotDisturb },
      "Do not disturb settings updated"
    );
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/notification-preferences/reset
 * @desc    Reset to default preferences
 * @access  Private
 */
router.post("/reset", protect, async (req, res, next) => {
  try {
    await NotificationPreference.findOneAndDelete({ user: req.user._id });

    const preferences = await NotificationPreference.create({
      user: req.user._id,
    });

    successResponse(
      res,
      STATUS_CODES.OK,
      { preferences },
      "Preferences reset to default"
    );
  } catch (error) {
    next(error);
  }
});

module.exports = router;
