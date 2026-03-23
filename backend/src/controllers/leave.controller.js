// Richieste assenze: ferie, permessi, malattia. Staff: me, create, cancel. Owner: list, approve, reject, balances.

const leaveRepository = require("../repositories/leave.repository");
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

function dateOnly(str) {
  if (!str) return "";
  return String(str).slice(0, 10);
}

// GET /api/leave/me – proprie richieste (utente loggato)
exports.me = async (req, res) => {
  const user = req.session?.user;
  if (!user?.id) return res.status(401).json({ error: "Non autenticato." });
  const restaurantId = getRestaurantId(req);
  if (!restaurantId) return res.status(403).json({ error: "Ristorante non in sessione." });

  const items = leaveRepository.readLeaveRequests(restaurantId);
  const mine = items.filter((r) => r.userId === String(user.id));
  mine.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(mine);
};

// POST /api/leave/me – crea richiesta (solo per sé stesso)
exports.create = async (req, res) => {
  const user = req.session?.user;
  if (!user?.id) return res.status(401).json({ error: "Non autenticato." });
  const restaurantId = getRestaurantId(req);
  if (!restaurantId) return res.status(403).json({ error: "Ristorante non in sessione." });

  const { type, startDate, endDate, days, hours, reason } = req.body || {};
  const start = dateOnly(startDate);
  const end = dateOnly(endDate);
  if (!start || !end) {
    return res.status(400).json({ error: "Date inizio e fine obbligatorie." });
  }
  if (new Date(start) > new Date(end)) {
    return res.status(400).json({ error: "Date non valide: la data di inizio deve essere <= fine." });
  }
  const reqType = type === "ferie" || type === "permesso" || type === "malattia" ? type : "ferie";

  if (leaveRepository.hasOverlap(restaurantId, user.id, reqType, start, end, null)) {
    return res.status(409).json({ error: "Richiesta duplicata: esiste già una richiesta (pending/approvata) per questo periodo e tipo." });
  }

  const fullUser = await usersRepository.findById(user.id);
  const name = fullUser?.name ?? "";
  const surname = fullUser?.surname ?? "";
  const username = fullUser?.username ?? user.username ?? "";

  const record = leaveRepository.createLeaveRequest(restaurantId, {
    userId: user.id,
    username,
    name,
    surname,
    type: reqType,
    startDate: start,
    endDate: end,
    days: days != null ? Number(days) : undefined,
    hours: hours != null ? Number(hours) : null,
    reason: String(reason || ""),
  });
  res.status(201).json(record);
};

// POST /api/leave/me/:id/cancel – annulla solo se pending e proprietario
exports.cancel = async (req, res) => {
  const user = req.session?.user;
  if (!user?.id) return res.status(401).json({ error: "Non autenticato." });
  const restaurantId = getRestaurantId(req);
  if (!restaurantId) return res.status(403).json({ error: "Ristorante non in sessione." });

  const id = req.params.id;
  const record = leaveRepository.findLeaveById(restaurantId, id);
  if (!record) return res.status(404).json({ error: "Richiesta non trovata." });
  if (record.userId !== String(user.id)) return res.status(403).json({ error: "Non puoi annullare questa richiesta." });
  if (record.status !== "pending") {
    return res.status(400).json({ error: "Solo le richieste in attesa possono essere annullate." });
  }
  const updated = leaveRepository.updateLeaveRequest(restaurantId, id, { status: "cancelled" });
  res.json(updated);
};

// GET /api/leave – owner, lista con filtri
exports.list = async (req, res) => {
  const restaurantId = ensureOwner(req, res);
  if (!restaurantId) return;

  const { status, type, userId, from, to } = req.query || {};
  let items = leaveRepository.readLeaveRequests(restaurantId);
  if (status) items = items.filter((r) => r.status === status);
  if (type) items = items.filter((r) => r.type === type);
  if (userId) items = items.filter((r) => r.userId === String(userId));
  if (from) {
    const f = dateOnly(from);
    items = items.filter((r) => dateOnly(r.endDate) >= f);
  }
  if (to) {
    const t = dateOnly(to);
    items = items.filter((r) => dateOnly(r.startDate) <= t);
  }
  items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(items);
};

// POST /api/leave/:id/approve – owner
exports.approve = async (req, res) => {
  const restaurantId = ensureOwner(req, res);
  if (!restaurantId) return;

  const id = req.params.id;
  const record = leaveRepository.findLeaveById(restaurantId, id);
  if (!record) return res.status(404).json({ error: "Richiesta non trovata." });
  if (record.status !== "pending") {
    return res.status(400).json({ error: "Richiesta già elaborata (approvata/rifiutata/annullata)." });
  }

  const ownerUsername = req.session?.user?.username || "owner";
  leaveRepository.updateLeaveRequest(restaurantId, id, {
    status: "approved",
    reviewedAt: new Date().toISOString(),
    reviewedBy: ownerUsername,
    ownerNote: (req.body?.ownerNote != null ? String(req.body.ownerNote) : record.ownerNote) || "",
  });

  const balances = leaveRepository.getOrInitUserBalances(await usersRepository.findById(record.userId));
  if (record.type === "ferie") {
    await leaveRepository.updateUserBalances(record.userId, restaurantId, { ferieUsate: balances.ferieUsate + (record.days || 1) });
  } else if (record.type === "permesso") {
    await leaveRepository.updateUserBalances(record.userId, restaurantId, { permessiUsati: balances.permessiUsati + 1 });
  } else if (record.type === "malattia") {
    await leaveRepository.updateUserBalances(record.userId, restaurantId, { malattiaGiorni: balances.malattiaGiorni + (record.days || 1) });
  }

  const updated = leaveRepository.findLeaveById(restaurantId, id);
  res.json(updated);
};

// POST /api/leave/:id/reject – owner
exports.reject = async (req, res) => {
  const restaurantId = ensureOwner(req, res);
  if (!restaurantId) return;

  const id = req.params.id;
  const record = leaveRepository.findLeaveById(restaurantId, id);
  if (!record) return res.status(404).json({ error: "Richiesta non trovata." });
  if (record.status !== "pending") {
    return res.status(400).json({ error: "Richiesta già elaborata." });
  }

  const ownerUsername = req.session?.user?.username || "owner";
  const updated = leaveRepository.updateLeaveRequest(restaurantId, id, {
    status: "rejected",
    reviewedAt: new Date().toISOString(),
    reviewedBy: ownerUsername,
    ownerNote: req.body?.ownerNote != null ? String(req.body.ownerNote) : record.ownerNote,
  });
  res.json(updated);
};

// GET /api/leave/balances/me – saldi utente loggato
exports.balancesMe = async (req, res) => {
  const user = req.session?.user;
  if (!user?.id) return res.status(401).json({ error: "Non autenticato." });
  const u = await usersRepository.findById(user.id);
  const balances = leaveRepository.getOrInitUserBalances(u);
  res.json(balances);
};

// GET /api/leave/balances/:userId – owner
exports.balancesUser = async (req, res) => {
  const restaurantId = ensureOwner(req, res);
  if (!restaurantId) return;

  const userId = req.params.userId;
  const user = await usersRepository.findById(userId);
  if (!user || user.restaurantId !== restaurantId) return res.status(404).json({ error: "Utente non trovato." });
  const balances = leaveRepository.getOrInitUserBalances(user);
  res.json(balances);
};
