// backend/src/controllers/menu.controller.js

const menuService = require("../service/menu.service");

// GET /api/menu -> tutti i piatti
exports.listMenu = (req, res, next) => {
  try {
    const items = menuService.listAll();
    res.json(items);
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    e.status = 500;
    next(e);
  }
};

// GET /api/menu/active -> solo piatti attivi
exports.listActiveMenu = (req, res, next) => {
  try {
    const items = menuService.listActive();
    res.json(items);
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    e.status = 500;
    next(e);
  }
};

// GET /api/menu/:id
exports.getOne = (req, res, next) => {
  try {
    const item = menuService.getOne(req.params.id);
    if (!item) return res.status(404).json({ error: "Piatto non trovato" });
    res.json(item);
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    e.status = 404;
    next(e);
  }
};

// POST /api/menu
exports.create = (req, res, next) => {
  try {
    const created = menuService.create(req.body);
    res.status(201).json(created);
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    e.status = 400;
    next(e);
  }
};

// PATCH /api/menu/:id
exports.update = (req, res, next) => {
  try {
    const updated = menuService.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    e.status = err.message === "Piatto non trovato" ? 404 : 400;
    next(e);
  }
};

// DELETE /api/menu/:id
exports.remove = (req, res, next) => {
  try {
    menuService.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err));
    e.status = 404;
    next(e);
  }
};