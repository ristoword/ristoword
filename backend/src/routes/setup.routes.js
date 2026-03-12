const router = require("express").Router();
const asyncHandler = require("../utils/asyncHandler");
const setupController = require("../controllers/setup.controller");

router.get("/status", asyncHandler(setupController.getStatus));
router.post("/", asyncHandler(setupController.runSetup));

module.exports = router;
