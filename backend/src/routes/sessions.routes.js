// backend/src/routes/sessions.routes.js
const router = require("express").Router();
const asyncHandler = require("../utils/asyncHandler");
const sessionsController = require("../controllers/sessions.controller");

router.post("/login", asyncHandler(sessionsController.login));
router.post("/logout", asyncHandler(sessionsController.logout));
router.get("/active", asyncHandler(sessionsController.getActive));
router.get("/active/:department", asyncHandler(sessionsController.getActive));

module.exports = router;
