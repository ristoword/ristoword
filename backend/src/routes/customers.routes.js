// backend/src/routes/customers.routes.js
const router = require("express").Router();
const asyncHandler = require("../utils/asyncHandler");
const customersController = require("../controllers/customers.controller");

router.get("/", asyncHandler(customersController.list));
router.get("/:id", asyncHandler(customersController.getById));
router.post("/", asyncHandler(customersController.create));
router.put("/:id", asyncHandler(customersController.update));

module.exports = router;
