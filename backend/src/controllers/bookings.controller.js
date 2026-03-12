const bookingsRepository = require("../repositories/bookings.repository");
const bookingsService = require("../service/bookings.service");

// GET /api/bookings
exports.listBookings = async (req, res) => {
  const data = bookingsRepository.getAll();
  res.json(data);
};

// GET /api/bookings/:id
exports.getBookingById = async (req, res) => {
  const booking = bookingsRepository.getById(req.params.id);

  if (!booking) {
    return res.status(404).json({ error: "Prenotazione non trovata" });
  }

  res.json(booking);
};

// POST /api/bookings
exports.createBooking = async (req, res) => {
  const booking = await bookingsService.create(req.body);
  res.status(201).json(booking);
};

// PATCH /api/bookings/:id
exports.updateBooking = async (req, res) => {
  const booking = bookingsRepository.update(req.params.id, req.body);

  if (!booking) {
    return res.status(404).json({ error: "Prenotazione non trovata" });
  }

  res.json(booking);
};

// DELETE /api/bookings/:id
exports.deleteBooking = async (req, res) => {
  const ok = await bookingsRepository.remove(req.params.id);

  if (!ok) {
    return res.status(404).json({ error: "Prenotazione non trovata" });
  }

  res.json({ success: true });
};