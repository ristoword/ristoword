const router = require("express").Router();
const asyncHandler = require("../utils/asyncHandler");
const aiController = require("../controllers/ai.controller");

// GET /api/ai
router.get("/", asyncHandler(aiController.getGeneralSuggestion));

// GET /api/ai/status – AI Supervisor operational status
router.get("/status", asyncHandler(aiController.getOperationalStatus));

// GET /api/ai/predictive-kitchen – Predictive Kitchen engine
router.get("/predictive-kitchen", asyncHandler(aiController.getPredictiveKitchen));

// GET /api/ai/daily-brain – Daily restaurant operations summary
router.get("/daily-brain", asyncHandler(aiController.getDailyBrain));

// POST /api/ai/kitchen
router.post("/kitchen", asyncHandler(aiController.getKitchenSuggestion));

// POST /api/ai/sales
router.post("/sales", asyncHandler(aiController.getSalesSuggestion));

// POST /api/ai/production
router.post("/production", asyncHandler(aiController.getProductionSuggestion));

// POST /api/ai/inventory – Magazzino multi-livello
router.post("/inventory", asyncHandler(aiController.getInventorySuggestion));

module.exports = router;