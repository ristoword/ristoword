// backend/src/routes/daily-menu.routes.js

const router = require("express").Router();
const asyncHandler = require("../utils/asyncHandler");
const dailyMenuController = require("../controllers/daily-menu.controller");

router.get("/", asyncHandler(dailyMenuController.getAll));
router.get("/active", asyncHandler(dailyMenuController.getActive));
router.get("/categories", asyncHandler(dailyMenuController.getCategories));
router.post("/", asyncHandler(dailyMenuController.createDish));
router.patch("/active", asyncHandler(dailyMenuController.setMenuActive));
router.put("/:id", asyncHandler(dailyMenuController.updateDish));
router.delete("/:id", asyncHandler(dailyMenuController.deleteDish));
router.patch("/:id/toggle", asyncHandler(dailyMenuController.toggleDish));

module.exports = router;
