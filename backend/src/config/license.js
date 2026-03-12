// backend/src/config/license.js
const fs = require("fs");
const path = require("path");

const LICENSE_PATH = path.join(__dirname, "..", "..", "data", "license.json");

// Legge il file di licenza. Se non esiste → null
async function readLicenseRaw() {
  try {
    const data = await fs.promises.readFile(LICENSE_PATH, "utf8");
    return JSON.parse(data);
  } catch (err) {
    if (err.code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

// Scrive il file di licenza
async function writeLicenseRaw(license) {
  const dir = path.dirname(LICENSE_PATH);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(
    LICENSE_PATH,
    JSON.stringify(license, null, 2),
    "utf8"
  );
}

// Calcola stato e giorni rimasti
function decorateLicense(license) {
  const hasActivation = license && (license.licenseCode || license.activatedAt);
  if (!hasActivation) {
    return { status: "unlicensed", ...(license || {}) };
  }

  const now = new Date();
  let status = "active";
  let daysLeft = null;

  if (!license.expiresAt) {
    status = "active";
  } else {
    const exp = new Date(license.expiresAt);
    const diffMs = exp.getTime() - now.getTime();
    daysLeft = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMs <= 0) {
      status = "expired";
      daysLeft = 0;
    } else if (daysLeft <= 3) {
      status = "grace"; // periodo di grazia
    } else {
      status = "active";
    }
  }

  const valid = status === "active" || status === "grace";
  const plan = license.plan || "starter";
  const licenseKey = license.licenseCode || license.license_key || license.licenseKey || "";

  return {
    ...license,
    status,
    daysLeft,
    valid,
    plan,
    licenseKey: licenseKey ? licenseKey.slice(0, 4) + "-****" : "",
    restaurantName: license.restaurantName || "",
    expiresAt: license.expiresAt || null,
  };
}

async function getLicense() {
  const license = await readLicenseRaw();
  return decorateLicense(license);
}

async function saveLicense(partial) {
  const now = new Date();
  const current = (await readLicenseRaw()) || {};
  const merged = {
    ...current,
    ...partial,
    updatedAt: now.toISOString(),
  };
  await writeLicenseRaw(merged);
  return decorateLicense(merged);
}

module.exports = {
  getLicense,
  saveLicense,
};