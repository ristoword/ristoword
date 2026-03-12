// backend/src/routes/menu.routes.js

const express = require("express");
const router = express.Router();
const MenuController = require("../controllers/menu.controller");

// lista completa menu
router.get("/", MenuController.listMenu);

// solo piatti attivi
router.get("/active", MenuController.listActiveMenu);

// singolo piatto
router.get("/:id", MenuController.getOne);

// creazione piatto
router.post("/", MenuController.create);

// aggiorna piatto
router.patch("/:id", MenuController.update);

// elimina piatto
router.delete("/:id", MenuController.remove);

module.exports = router;