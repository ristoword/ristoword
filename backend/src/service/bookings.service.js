// backend/src/service/bookings.service.js
const bookingsRepository = require("../repositories/bookings.repository");
const customersService = require("./customers.service");

async function findOrCreateCustomer(data) {
  const phone = (data.phone || "").trim();
  const email = (data.email || "").trim();
  const name = (data.name || "").trim();

  if (!phone && !email && !name) return null;
  return customersService.findOrCreate({
    name: name || "Cliente",
    phone,
    email,
  });
}

async function create(data) {
  const customer = await findOrCreateCustomer(data);
  const payload = {
    ...data,
    customerId: customer ? customer.id : null,
    name: data.name || (customer ? `${customer.name} ${customer.surname}`.trim() : ""),
    phone: data.phone || (customer ? customer.phone : ""),
  };
  return bookingsRepository.create(payload);
}

async function update(id, data) {
  return bookingsRepository.update(id, data);
}

module.exports = {
  create,
  update,
  findOrCreateCustomer,
};
