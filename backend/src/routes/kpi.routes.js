const express = require("express");

const router = express.Router();
const { getDashboard } = require("../controllers/kpi.controller");

router.get("/", getDashboard);

module.exports = router;
