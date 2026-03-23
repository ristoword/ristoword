// POST /api/owner/complete-activation — dopo validazione GS: crea owner, licenza, sessione.
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const licensesRepository = require("../repositories/licenses.repository");
const usersRepository = require("../repositories/users.repository");
const gsCodesMirror = require("../repositories/gsCodesMirror.repository");
const { notifyGsCodeActivated } = require("../service/gsMasterSync.service");
const { writeTenantLicenseMirror } = require("../stripe/stripeLicenseSync.service");

const GS_VALIDATE_URL =
  String(process.env.GS_VALIDATE_URL || "").trim() || "https://www.gestionesemplificata.com/api/licenses/validate";
const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 8;

function normalizeCode(input) {
  return String(input || "")
    .trim()
    .replace(/[\u00A0\u2000-\u200B\uFEFF]/g, " ")
    .replace(/\s+/g, " ");
}

function restaurantIdForNewGsTenant(code) {
  const n = normalizeCode(code);
  const h = crypto.createHash("sha256").update(n).digest("hex").slice(0, 32);
  return `gs_${h}`;
}

function gsPayloadSaysValid(data) {
  if (!data || typeof data !== "object") return false;
  if (data.valid === true) return true;
  if (data.data && typeof data.data === "object" && data.data.valid === true) return true;
  return false;
}

/**
 * Se GS_VALIDATE_USE_MIRROR=true: accetta codici presenti nel mirror RW (assigned → email deve coincidere).
 * Utile per test senza GS; in produzione lasciare false e usare validate reale + push batch.
 */
function mirrorAllowsActivation(codeNorm, emailVal) {
  if (String(process.env.GS_VALIDATE_USE_MIRROR || "").toLowerCase() !== "true") return false;
  const row = gsCodesMirror.findByCode(codeNorm);
  if (!row) return false;
  const st = String(row.status || "").toLowerCase();
  if (st === "used" || st === "expired") return false;
  if (st === "assigned") {
    const em = String(row.assignedEmail || "").trim().toLowerCase();
    const want = String(emailVal || "").trim().toLowerCase();
    if (em && want && em !== want) return false;
  }
  return true;
}

async function validateCodeWithGs(code) {
  const res = await fetch(GS_VALIDATE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: normalizeCode(code) }),
  });
  const data = await res.json().catch(() => ({}));
  return { httpOk: res.ok, data };
}

/**
 * POST /api/owner/complete-activation
 * Body: { code, email, password }
 */
async function completeActivation(req, res) {
  const { code, email, password } = req.body || {};
  const codeNorm = normalizeCode(code);
  if (!codeNorm) {
    return res.status(400).json({ success: false, message: "Codice mancante." });
  }

  const emailVal = String(email || "").trim();
  if (!emailVal) {
    return res.status(400).json({ success: false, message: "Email obbligatoria." });
  }
  const username = emailVal.toLowerCase();

  if (!password || typeof password !== "string" || String(password).length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({
      success: false,
      message: `Password obbligatoria (min. ${MIN_PASSWORD_LENGTH} caratteri).`,
    });
  }

  let gs = { httpOk: false, data: {} };
  try {
    gs = await validateCodeWithGs(codeNorm);
  } catch (e) {
    console.warn("[owner] validate GS:", e && e.message ? e.message : e);
  }
  const gsOk = gsPayloadSaysValid(gs.data);
  const mirrorOk = !gsOk && mirrorAllowsActivation(codeNorm, emailVal);
  if (!gsOk && !mirrorOk) {
    return res.status(400).json({
      success: false,
      message: "Codice non valido o non confermato da Gestione Semplificata.",
    });
  }

  let license = licensesRepository.findByActivationCode(codeNorm);
  if (!license) {
    const restaurantId =
      (gs.data && (gs.data.restaurantId || gs.data.tenantId)) ||
      (gs.data.data && (gs.data.data.restaurantId || gs.data.data.tenantId)) ||
      restaurantIdForNewGsTenant(codeNorm);

    license = licensesRepository.create({
      restaurantId: String(restaurantId).trim(),
      plan: "ristoword_pro",
      status: "active",
      activationCode: codeNorm,
      expiresAt: null,
      source: "gestione_semplicata",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  const restaurantId = license.restaurantId;
  if (!restaurantId) {
    return res.status(500).json({ success: false, message: "Licenza senza tenant." });
  }

  if (license.status === "used") {
    const existingOwner = await usersRepository.findOwnerByRestaurantId(restaurantId);
    if (existingOwner) {
      return res.status(409).json({
        success: false,
        message: "Licenza già utilizzata per questo locale.",
      });
    }
  }

  const hashedPassword = await bcrypt.hash(String(password), BCRYPT_ROUNDS);

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
      email: emailVal,
    });
    if (!created) {
      const existing = await usersRepository.findByUsername(username);
      if (!existing) {
        return res.status(500).json({
          success: false,
          message: "Impossibile creare l'account owner.",
        });
      }
      if (String(existing.restaurantId) !== String(restaurantId)) {
        return res.status(409).json({
          success: false,
          message: "Questo indirizzo email è già registrato per un altro locale.",
        });
      }
      if (existing.role === "owner") {
        await usersRepository.setUserPassword(existing.id, hashedPassword);
        owner = await usersRepository.findById(existing.id);
      } else {
        return res.status(409).json({
          success: false,
          message: "Questo indirizzo email è già in uso per questo locale.",
        });
      }
    } else {
      owner = created;
    }
  }

  if (!owner) {
    owner = await usersRepository.findOwnerByRestaurantId(restaurantId);
  }

  const nowIso = new Date().toISOString();
  const merged = licensesRepository.updateLicense({
    restaurantId,
    activationCode: codeNorm,
    status: "used",
    activatedAt: nowIso,
    source: license.source || "owner_gs_activation",
  });

  if (merged) {
    writeTenantLicenseMirror({
      restaurantId,
      plan: merged.plan,
      status: "used",
      activationCode: codeNorm,
      expiresAt: merged.expiresAt || null,
      source: merged.source || "owner_gs_activation",
      activatedAt: nowIso,
    });
  }

  if (!owner || !owner.id) {
    return res.status(500).json({ success: false, message: "Account non disponibile dopo la creazione." });
  }

  req.session.user = {
    id: owner.id,
    username: owner.username,
    role: "owner",
    restaurantId: owner.restaurantId,
    mustChangePassword: false,
  };
  req.session.restaurantId = owner.restaurantId || "default";

  try {
    gsCodesMirror.markUsedLocal(codeNorm, {
      assignedEmail: emailVal,
      activatedAt: nowIso,
      expiresAt: merged?.expiresAt || null,
    });
  } catch (e) {
    console.warn("[owner] gs mirror markUsed:", e && e.message ? e.message : e);
  }

  try {
    const notifyResult = await notifyGsCodeActivated({
      code: codeNorm,
      email: emailVal,
      activatedAt: nowIso,
      expiresAt: merged?.expiresAt || null,
    });
    if (!notifyResult.ok && !notifyResult.skipped) {
      console.warn("[owner] GS notify non riuscito:", notifyResult);
    }
  } catch (e) {
    console.warn("[owner] GS notify error:", e && e.message ? e.message : e);
  }

  return res.json({
    success: true,
    redirectTo: "/dev-access/dashboard",
  });
}

module.exports = {
  completeActivation,
};
