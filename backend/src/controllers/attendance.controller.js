// Presenze/timbrature. Owner: lista, summary, close, anomaly. User: me, me/today.

const attendanceRepository = require("../repositories/attendance.repository");
const usersRepository = require("../repositories/users.repository");

function getRestaurantId(req) {
  return req.session?.user?.restaurantId || req.session?.restaurantId || "";
}

function ensureOwner(req, res) {
  if (req.session?.user?.role !== "owner") {
    res.status(403).json({ error: "Solo l'owner può accedere." });
    return false;
  }
  const rid = getRestaurantId(req);
  if (!rid) {
    res.status(403).json({ error: "Ristorante non in sessione." });
    return false;
  }
  return rid;
}

// GET /api/attendance – owner, filtri userId, dateFrom, dateTo, status
exports.list = async (req, res) => {
  const restaurantId = ensureOwner(req, res);
  if (!restaurantId) return;
  const { userId, dateFrom, dateTo, status } = req.query || {};
  const records = attendanceRepository.listByRestaurant(restaurantId, {
    userId: userId || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    status: status || undefined,
  });
  res.json(records);
};

// GET /api/attendance/daily-summary?date=YYYY-MM-DD – owner
exports.dailySummary = async (req, res) => {
  const restaurantId = ensureOwner(req, res);
  if (!restaurantId) return;
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const users = await usersRepository.findByRestaurantId(restaurantId);
  const usersWithRates = users.map((u) => ({ id: u.id, hourlyRate: u.hourlyRate }));
  const summary = attendanceRepository.getDailySummary(restaurantId, date, usersWithRates);
  res.json(summary);
};

// PATCH /api/attendance/:id/close – owner, chiusura manuale
exports.closeShift = async (req, res) => {
  const restaurantId = ensureOwner(req, res);
  if (!restaurantId) return;
  const id = req.params.id;
  const record = attendanceRepository.readAttendance(restaurantId).find((r) => r.id === id);
  if (!record || record.restaurantId !== restaurantId) {
    return res.status(404).json({ error: "Turno non trovato." });
  }
  const { clockOutAt, notes } = req.body || {};
  const updated = attendanceRepository.closeShift(restaurantId, id, {
    clockOutAt: clockOutAt || new Date().toISOString(),
    notes,
  });
  res.json(updated);
};

// PATCH /api/attendance/:id/anomaly – owner, correzione/annotazione
exports.setAnomaly = async (req, res) => {
  const restaurantId = ensureOwner(req, res);
  if (!restaurantId) return;
  const id = req.params.id;
  const record = attendanceRepository.readAttendance(restaurantId).find((r) => r.id === id);
  if (!record || record.restaurantId !== restaurantId) {
    return res.status(404).json({ error: "Turno non trovato." });
  }
  const { anomalyType, notes, clear } = req.body || {};
  if (clear) {
    const updated = attendanceRepository.updateShift(restaurantId, id, {
      status: record.clockOutAt ? "closed" : "open",
      anomalyType: null,
      notes: notes != null ? notes : "",
    });
    return res.json(updated);
  }
  const updated = attendanceRepository.markAnomaly(
    restaurantId,
    id,
    anomalyType || record.anomalyType,
    notes != null ? notes : record.notes
  );
  res.json(updated);
};

// GET /api/attendance/me – utente loggato, storico personale
exports.me = async (req, res) => {
  const user = req.session?.user;
  if (!user || !user.id) {
    return res.status(401).json({ error: "Non autenticato." });
  }
  const restaurantId = getRestaurantId(req);
  if (!restaurantId) {
    return res.status(403).json({ error: "Ristorante non in sessione." });
  }
  const records = attendanceRepository.listByUser(user.id, restaurantId);
  res.json(records);
};

// GET /api/attendance/me/today – turno corrente / stato oggi
exports.meToday = async (req, res) => {
  const user = req.session?.user;
  if (!user || !user.id) {
    return res.status(401).json({ error: "Non autenticato." });
  }
  const restaurantId = getRestaurantId(req);
  if (!restaurantId) {
    return res.status(403).json({ error: "Ristorante non in sessione." });
  }
  const today = attendanceRepository.dateOnly(new Date().toISOString());
  const all = attendanceRepository.listByUser(user.id, restaurantId);
  const todayRecords = all.filter(
    (r) => attendanceRepository.dateOnly(r.clockInAt || r.clockOutAt || r.date) === today
  );
  const openShift = attendanceRepository.findOpenShiftByUser(user.id, restaurantId);
  res.json({
    openShift: openShift || null,
    todayRecords,
    hasOpenShift: !!openShift,
  });
};
