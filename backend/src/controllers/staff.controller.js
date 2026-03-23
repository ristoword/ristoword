// Staff = gestione utenti. Owner: CRUD completo. Supervisor: sola lettura (GET list, GET :id) per elenco/dropdown.

const bcrypt = require("bcrypt");
const crypto = require("crypto");
const usersRepository = require("../repositories/users.repository");

const BCRYPT_ROUNDS = 10;

function ensureOwner(req, res) {
  const role = req.session && req.session.user && req.session.user.role;
  if (role !== "owner") {
    res.status(403).json({ error: "Solo l'owner può gestire lo staff." });
    return false;
  }
  const restaurantId = req.session.user.restaurantId || req.session.restaurantId;
  if (!restaurantId) {
    res.status(403).json({ error: "Ristorante non in sessione." });
    return false;
  }
  return restaurantId;
}

/** Owner o supervisor: restituisce restaurantId (per lettura elenco/dettaglio). Supervisor usa session o "default". */
function ensureOwnerOrSupervisor(req, res) {
  const role = req.session && req.session.user && req.session.user.role;
  if (role !== "owner" && role !== "supervisor") {
    res.status(403).json({ error: "Accesso non autorizzato." });
    return false;
  }
  const restaurantId = req.session.user?.restaurantId || req.session.restaurantId || "default";
  return restaurantId;
}

function sanitizeUser(u) {
  if (!u) return null;
  const { password, ...out } = u;
  return { ...out, active: u.is_active !== false };
}

// GET /api/staff – owner e supervisor: elenco utenti con stesso restaurantId (esclusa password)
exports.listStaff = async (req, res) => {
  const restaurantId = ensureOwnerOrSupervisor(req, res);
  if (!restaurantId) return;

  const users = await usersRepository.findByRestaurantId(restaurantId);
  const staffOnly = users.filter((u) => String(u.role).toLowerCase() !== "owner");
  const list = staffOnly.map(sanitizeUser);
  res.json(list);
};

// GET /api/staff/:id – owner e supervisor: dettaglio utente (sola lettura)
exports.getStaffById = async (req, res) => {
  const restaurantId = ensureOwnerOrSupervisor(req, res);
  if (!restaurantId) return;

  const user = await usersRepository.findById(req.params.id);
  if (!user || user.restaurantId !== restaurantId) {
    return res.status(404).json({ error: "Utente non trovato." });
  }
  res.json(sanitizeUser(user));
};

// POST /api/staff – crea dipendente/utente
exports.createStaff = async (req, res) => {
  const restaurantId = ensureOwner(req, res);
  if (!restaurantId) return;

  const { name, surname, role, username, password } = req.body || {};
  if (!username || typeof username !== "string" || !username.trim()) {
    return res.status(400).json({ error: "Username obbligatorio." });
  }
  if (!password || typeof password !== "string" || password.length < 6) {
    return res.status(400).json({ error: "Password obbligatoria (min. 6 caratteri)." });
  }

  const hash = await bcrypt.hash(String(password).trim(), BCRYPT_ROUNDS);
  const record = await usersRepository.createUser({
    name: name != null ? String(name).trim() : "",
    surname: surname != null ? String(surname).trim() : "",
    username: String(username).trim(),
    password: hash,
    role: (role && String(role).trim()) || "staff",
    restaurantId,
    is_active: true,
    mustChangePassword: true,
  });

  if (!record) {
    return res.status(409).json({ error: "Username già esistente." });
  }
  res.status(201).json(sanitizeUser(record));
};

// PATCH /api/staff/:id – modifica nome, ruolo, stato
exports.updateStaff = async (req, res) => {
  const restaurantId = ensureOwner(req, res);
  if (!restaurantId) return;

  const id = req.params.id;
  const user = await usersRepository.findById(id);
  if (!user || user.restaurantId !== restaurantId) {
    return res.status(404).json({ error: "Utente non trovato." });
  }

  const { name, surname, role, active, hourlyRate, employmentType } = req.body || {};
  const patch = {};
  if (name !== undefined) patch.name = String(name).trim();
  if (surname !== undefined) patch.surname = String(surname).trim();
  if (role !== undefined) patch.role = String(role).trim();
  if (active !== undefined) patch.is_active = active !== false;
  if (hourlyRate !== undefined) patch.hourlyRate = hourlyRate;
  if (employmentType !== undefined) patch.employmentType = String(employmentType).trim();

  const updated = await usersRepository.updateUser(id, patch);
  res.json(sanitizeUser(updated));
};

// DELETE /api/staff/:id – disattiva (soft)
exports.deleteStaff = async (req, res) => {
  const restaurantId = ensureOwner(req, res);
  if (!restaurantId) return;

  const id = req.params.id;
  const user = await usersRepository.findById(id);
  if (!user || user.restaurantId !== restaurantId) {
    return res.status(404).json({ error: "Utente non trovato." });
  }
  await usersRepository.updateUser(id, { is_active: false });
  res.json({ success: true });
};

// POST /api/staff/:id/reset-password – genera nuova password temporanea
exports.resetPassword = async (req, res) => {
  const restaurantId = ensureOwner(req, res);
  if (!restaurantId) return;

  const id = req.params.id;
  const user = await usersRepository.findById(id);
  if (!user || user.restaurantId !== restaurantId) {
    return res.status(404).json({ error: "Utente non trovato." });
  }

  const temporaryPassword = crypto.randomBytes(6).toString("base64").replace(/[+/=]/g, "").slice(0, 10);
  const hash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);
  const users = await usersRepository.readUsers();
  const idx = users.findIndex((u) => String(u.id) === String(id));
  if (idx === -1) {
    return res.status(404).json({ error: "Utente non trovato." });
  }
  users[idx].password = hash;
  users[idx].mustChangePassword = true;
  await usersRepository.writeUsers(users);

  res.json({ ok: true, temporaryPassword });
};
