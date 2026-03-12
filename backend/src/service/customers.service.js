// backend/src/service/customers.service.js
const customersRepository = require("../repositories/customers.repository");

async function findOrCreate(data) {
  const phone = (data.phone || "").trim();
  const email = (data.email || "").trim();
  const name = (data.name || "").trim();
  const surname = (data.surname || "").trim();

  if (phone) {
    const byPhone = await customersRepository.findByPhone(phone);
    if (byPhone) return byPhone;
  }
  if (email) {
    const byEmail = await customersRepository.findByEmail(email);
    if (byEmail) return byEmail;
  }

  return customersRepository.create({
    name: name || "Cliente",
    surname: surname,
    phone,
    email,
    notes: (data.notes || "").trim(),
  });
}

async function list(filters = {}) {
  let list = await customersRepository.getAll();
  const cat = (filters.category || "").trim();
  const q = (filters.q || "").trim();

  if (q) {
    list = await customersRepository.searchByNameOrPhone(q);
  }
  if (cat) {
    list = list.filter((c) => c.category === cat);
  }

  return list;
}

async function getById(id) {
  return customersRepository.getById(id);
}

async function create(data) {
  return customersRepository.create(data);
}

async function update(id, data) {
  return customersRepository.update(id, data);
}

module.exports = {
  findOrCreate,
  list,
  getById,
  create,
  update,
};
