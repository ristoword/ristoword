const router = require("express").Router();
const asyncHandler = require("../utils/asyncHandler");
const setupController = require("../controllers/setup.controller");
const { requireOnboardingKey } = require("../middleware/requireOnboardingKey.middleware");

router.get("/status", asyncHandler(setupController.getStatus));
router.post("/", asyncHandler(setupController.runSetup));
router.post("/onboard-restaurant", requireOnboardingKey, asyncHandler(setupController.onboardRestaurant));

module.exports = router;
