// backend/src/controllers/daily-menu.controller.js

const dailyMenuRepository = require("../repositories/daily-menu.repository");

exports.getAll = async (req, res, next) => {
  try {
    const data = dailyMenuRepository.getAll();
    res.json(data);
  } catch (err) {
    next(err);
  }
};

exports.getActive = async (req, res, next) => {
  try {
    const data = dailyMenuRepository.getAll();
    const dishes = data.menuActive ? dailyMenuRepository.getActiveDishes() : [];
    res.json({ menuActive: data.menuActive, dishes });
  } catch (err) {
    next(err);
  }
};

exports.createDish = async (req, res, next) => {
  try {
    const dish = dailyMenuRepository.addDish(req.body);
    res.status(201).json(dish);
  } catch (err) {
    next(err);
  }
};

exports.updateDish = async (req, res, next) => {
  try {
    const dish = dailyMenuRepository.updateDish(req.params.id, req.body);
    if (!dish) return res.status(404).json({ error: "Piatto non trovato" });
    res.json(dish);
  } catch (err) {
    next(err);
  }
};

exports.deleteDish = async (req, res, next) => {
  try {
    const ok = dailyMenuRepository.removeDish(req.params.id);
    if (!ok) return res.status(404).json({ error: "Piatto non trovato" });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

exports.toggleDish = async (req, res, next) => {
  try {
    const dish = dailyMenuRepository.toggleDish(req.params.id);
    if (!dish) return res.status(404).json({ error: "Piatto non trovato" });
    res.json(dish);
  } catch (err) {
    next(err);
  }
};

exports.setMenuActive = async (req, res, next) => {
  try {
    const { active } = req.body || {};
    const data = dailyMenuRepository.setMenuActive(active);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

exports.getCategories = async (req, res, next) => {
  try {
    res.json({ categories: dailyMenuRepository.CATEGORIES });
  } catch (err) {
    next(err);
  }
};
