// backend/src/controllers/license.controller.js
const bcrypt = require("bcrypt");
const { getLicense, saveLicense } = require("../config/license");
const {
  findByActivationCode,
  updateLicense,
} = require("../repositories/licenses.repository");
const { writeTenantLicenseMirror } = require("../stripe/stripeLicenseSync.service");
const usersRepository = require("../repositories/users.repository");

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

function validateLicenseForActivation(license) {
  if (!license) {
    return {
      ok: false,
      status: "invalid",
      message:
        "Codice non trovato. Usa il codice completo dall’email o dalla conferma pagamento, oppure verifica di essere sullo stesso ambiente (stesso server) in cui è stata creata la licenza.",
    };
  }
  if (license.status === "used") return { ok: false, status: "used", message: "Licenza già utilizzata" };
  if (license.status && license.status !== "active" && license.status !== "grace") {
    return { ok: false, status: license.status, message: "Licenza non attiva" };
  }
  if (license.expiresAt) {
    const exp = new Date(license.expiresAt);
    if (exp < new Date()) return { ok: false, status: "expired", message: "Licenza scaduta" };
  }
  return { ok: true };
}

// POST /api/licenses/verify-code – solo verifica, non attiva
async function verifyCode(req, res) {
  const { licenseCode } = req.body || {};
  if (!licenseCode || typeof licenseCode !== "string") {
    return res.status(400).json({
      ok: false,
      status: "invalid",
      message: "Codice di attivazione mancante o non valido",
    });
  }
  const code = String(licenseCode).trim();
  if (!code) {
    return res.status(400).json({
      ok: false,
      status: "invalid",
      message: "Codice di attivazione mancante",
    });
  }

  const license = findByActivationCode(code);
  const validation = validateLicenseForActivation(license);
  if (!validation.ok) {
    return res.status(validation.status === "used" ? 409 : 400).json({
      ok: false,
      status: validation.status,
      message: validation.message,
    });
  }

  return res.json({
    ok: true,
    restaurantId: license.restaurantId,
    message: "Codice valido. Procedi con la creazione dell'accesso.",
  });
}

/**
 * GET /api/licenses/validate?code=...
 * Stessa logica di POST /verify-code (per GS, curl, link diretti).
 */
async function validateCodeQuery(req, res) {
  const raw = req.query?.code ?? req.query?.licenseCode ?? "";
  const licenseCode = typeof raw === "string" ? raw.trim() : String(raw || "").trim();
  if (!licenseCode) {
    return res.status(400).json({
      ok: false,
      status: "invalid",
      message: "Parametro code mancante (es. ?code=RSTW-...)",
    });
  }

  const license = findByActivationCode(licenseCode);
  const validation = validateLicenseForActivation(license);
  if (!validation.ok) {
    return res.status(validation.status === "used" ? 409 : 400).json({
      ok: false,
      status: validation.status,
      message: validation.message,
    });
  }

  return res.json({
    ok: true,
    restaurantId: license.restaurantId,
    message: "Codice valido. Procedi con la creazione dell'accesso.",
  });
}

// POST /api/licenses/complete-activation – crea owner, marca licenza, auto-login
async function completeActivation(req, res) {
  const { licenseCode, email, password, confirmPassword } = req.body || {};

  if (!licenseCode || typeof licenseCode !== "string") {
    return res.status(400).json({
      ok: false,
      message: "Codice di attivazione mancante o non valido",
    });
  }
  const code = String(licenseCode).trim();
  if (!code) {
    return res.status(400).json({
      ok: false,
      message: "Codice di attivazione mancante",
    });
  }

  const license = findByActivationCode(code);
  const validation = validateLicenseForActivation(license);
  if (!validation.ok) {
    return res.status(validation.status === "used" ? 409 : 400).json({
      ok: false,
      status: validation.status,
      message: validation.message,
    });
  }

  const emailVal = String(email || "").trim();
  if (!emailVal) {
    return res.status(400).json({
      ok: false,
      message: "Indirizzo email obbligatorio",
    });
  }
  const username = emailVal.toLowerCase();

  if (!password || typeof password !== "string") {
    return res.status(400).json({
      ok: false,
      message: "Password obbligatoria",
    });
  }
  const pwd = String(password);
  if (pwd.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({
      ok: false,
      message: `La password deve essere di almeno ${MIN_PASSWORD_LENGTH} caratteri`,
    });
  }
  if (pwd !== String(confirmPassword || "")) {
    return res.status(400).json({
      ok: false,
      message: "La conferma password non coincide",
    });
  }

  const restaurantId = license.restaurantId;
  if (!restaurantId) {
    return res.status(500).json({
      ok: false,
      message: "Licenza senza restaurantId associato",
    });
  }

  const hashedPassword = await bcrypt.hash(pwd, BCRYPT_ROUNDS);

  let owner = await usersRepository.findOwnerByRestaurantId(restaurantId);
  if (owner) {
    await usersRepository.setUserPassword(owner.id, hashedPassword);
  } else {
    const created = await usersRepository.createUser({
      username,
      password: hashedPassword,
      role: "owner",
      restaurantId,
      is_active: true,
      mustChangePassword: false,
    });
    if (!created) {
      const existing = await usersRepository.findByUsername(username);
      if (!existing) {
        return res.status(500).json({
          ok: false,
          message: "Impossibile creare l'account owner",
        });
      }
      if (existing.restaurantId !== restaurantId) {
        return res.status(409).json({
          ok: false,
          message: "Questo indirizzo email è già registrato per un altro locale",
        });
      }
      if (existing.role === "owner") {
        await usersRepository.setUserPassword(existing.id, hashedPassword);
      } else {
        return res.status(409).json({
          ok: false,
          message: "Questo indirizzo email è già in uso per questo locale",
        });
      }
    }
  }

  const nowIso = new Date().toISOString();
  const merged = updateLicense({
    restaurantId,
    activationCode: code,
    status: "used",
    activatedAt: nowIso,
    source: license.source || "owner_activation",
  });
  if (merged) {
    writeTenantLicenseMirror({
      restaurantId,
      plan: merged.plan,
      status: "used",
      activationCode: code,
      expiresAt: merged.expiresAt || null,
      source: merged.source || "owner_activation",
      activatedAt: nowIso,
    });
  }

  owner = (await usersRepository.findOwnerByRestaurantId(restaurantId)) || (await usersRepository.findByUsername(username));
  if (!owner) {
    return res.status(500).json({
      ok: false,
      message: "Account creato ma sessione non impostata",
    });
  }

  req.session.user = {
    id: owner.id,
    username: owner.username,
    role: "owner",
    restaurantId: owner.restaurantId,
    mustChangePassword: false,
  };
  req.session.restaurantId = owner.restaurantId || "default";

  return res.json({
    ok: true,
    message: "Attivazione completata",
    redirectTo: "/dev-access/dashboard",
  });
}

// GET /api/license
async function getLicenseController(req, res) {
  const license = await getLicense();
  return res.json(license);
}

// GET /api/license/status
async function getStatus(req, res) {
  const license = await getLicense();
  const activated = license && license.valid;
  return res.json({
    activated: !!activated,
    valid: license ? license.valid : false,
    status: license ? license.status : "unlicensed",
    plan: license?.plan || "",
    restaurantName: license?.restaurantName || "",
    expiresAt: license?.expiresAt || null,
    daysLeft: license?.daysLeft ?? null,
    licenseKey: license && (license.licenseCode || license.licenseKey) ? "****" : "",
    activatedAt: license?.activatedAt || "",
  });
}

// POST /api/license/deactivate
async function deactivateLicense(req, res) {
  const { saveLicense } = require("../config/license");
  await saveLicense({
    licenseCode: "",
    licenseKey: "",
    activatedAt: null,
    restaurantName: "",
    plan: "",
    expiresAt: null,
  });
  return res.json({ ok: true, message: "Licenza disattivata." });
}

// POST /api/license/activate
// Body: { "code": "DEMO-1234", "restaurantName": "Ristorante La Focaccia" }
async function activateLicense(req, res) {
  const { code, restaurantName } = req.body || {};

  if (!code || typeof code !== "string") {
    return res
      .status(400)
      .json({ ok: false, error: "Codice licenza mancante o non valido." });
  }

  if (!restaurantName || typeof restaurantName !== "string") {
    return res
      .status(400)
      .json({ ok: false, error: "Nome ristorante mancante o non valido." });
  }

  // PRIMA VERSIONE SEMPLICE:
  // accetta solo codici che iniziano con "DEMO-"
  if (!code.startsWith("DEMO-")) {
    return res
      .status(400)
      .json({ ok: false, error: "Codice licenza non riconosciuto." });
  }

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + 30 * 24 * 60 * 60 * 1000 // 30 giorni
  );

  const plan = code.toUpperCase().startsWith("DEMO-") ? "demo" : "starter";
  const decorated = await saveLicense({
    restaurantName,
    licenseCode: code,
    licenseKey: code,
    plan,
    activatedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });

  return res.json({
    ok: true,
    status: decorated.status,
    restaurantName: decorated.restaurantName,
    expiresAt: decorated.expiresAt,
    daysLeft: decorated.daysLeft,
  });
}

module.exports = {
  getLicense: getLicenseController,
  activateLicense,
  getStatus,
  deactivateLicense,
  verifyCode,
  validateCodeQuery,
  completeActivation,
};