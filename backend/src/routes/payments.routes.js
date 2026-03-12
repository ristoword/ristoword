const router = require("express").Router();
const asyncHandler = require("../utils/asyncHandler");
const paymentsController = require("../controllers/payments.controller");

// GET /api/payments
router.get(
  "/",
  asyncHandler(paymentsController.listPayments)
);

// GET /api/payments/summary
router.get(
  "/summary",
  asyncHandler(paymentsController.getPaymentsSummary)
);

// POS cash register shift operations (before /:id)
// GET /api/payments/current-shift
router.get(
  "/current-shift",
  asyncHandler(paymentsController.getCurrentShift)
);

// POST /api/payments/open
router.post(
  "/open",
  asyncHandler(paymentsController.openShift)
);

// POST /api/payments/shift-change
router.post(
  "/shift-change",
  asyncHandler(paymentsController.shiftChange)
);

// POST /api/payments/partial-close
router.post(
  "/partial-close",
  asyncHandler(paymentsController.partialClose)
);

// POST /api/payments/z-report
router.post(
  "/z-report",
  asyncHandler(paymentsController.zReport)
);

// GET /api/payments/:id
router.get(
  "/:id",
  asyncHandler(paymentsController.getPaymentById)
);

// POST /api/payments
router.post(
  "/",
  asyncHandler(paymentsController.createPayment)
);

// PATCH /api/payments/:id
router.patch(
  "/:id",
  asyncHandler(paymentsController.updatePayment)
);

// DELETE /api/payments/:id
router.delete(
  "/:id",
  asyncHandler(paymentsController.deletePayment)
);

module.exports = router;