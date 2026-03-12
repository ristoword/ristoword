const router = require("express").Router();
const asyncHandler = require("../utils/asyncHandler");
const bookingsController = require("../controllers/bookings.controller");

// GET /api/bookings
router.get("/", asyncHandler(bookingsController.listBookings));

// GET /api/bookings/:id
router.get("/:id", asyncHandler(bookingsController.getBookingById));

// POST /api/bookings
router.post("/", asyncHandler(bookingsController.createBooking));

// PATCH /api/bookings/:id
router.patch("/:id", asyncHandler(bookingsController.updateBooking));

// DELETE /api/bookings/:id
router.delete("/:id", asyncHandler(bookingsController.deleteBooking));

module.exports = router;