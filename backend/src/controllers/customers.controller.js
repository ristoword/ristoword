// backend/src/controllers/customers.controller.js
const customersService = require("../service/customers.service");

exports.list = async (req, res) => {
  const filters = {
    category: req.query.category,
    q: req.query.q,
  };
  const data = await customersService.list(filters);
  res.json(data);
};

exports.getById = async (req, res) => {
  const customer = await customersService.getById(req.params.id);
  if (!customer) {
    return res.status(404).json({ error: "Cliente non trovato" });
  }
  res.json(customer);
};

exports.create = async (req, res) => {
  const customer = await customersService.create(req.body);
  res.status(201).json(customer);
};

exports.update = async (req, res) => {
  const customer = await customersService.update(req.params.id, req.body);
  if (!customer) {
    return res.status(404).json({ error: "Cliente non trovato" });
  }
  res.json(customer);
};
