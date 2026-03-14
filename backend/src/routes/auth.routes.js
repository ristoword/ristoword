const router = require("express").Router();
const asyncHandler = require("../utils/asyncHandler");
const authController = require("../controllers/auth.controller");
const { requireAuth } = require("../middleware/requireAuth.middleware");

// LOGIN
router.post(
  "/login",
  asyncHandler(authController.login)
);

// LOGOUT
router.post(
  "/logout",
  asyncHandler(authController.logout)
);

// UTENTE ATTUALE – requires auth, returns session user only (no query lookup)
router.get(
  "/me",
  requireAuth,
  asyncHandler(authController.me)
);

// CAMBIO PASSWORD – requires auth
router.post(
  "/change-password",
  requireAuth,
  asyncHandler(authController.changePassword)
);

module.exports = router;