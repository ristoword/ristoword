// backend/src/service/mail.service.js
// SMTP-based email sending for onboarding welcome emails.

let nodemailer = null;
try {
  nodemailer = require("nodemailer");
} catch (_) {
  nodemailer = null;
}

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@ristoword.com";

function isConfigured() {
  return !!(SMTP_HOST && SMTP_USER && SMTP_PASS);
}

function getLoginUrl(req) {
  if (req && req.get && req.get("host")) {
    const protocol = req.get("x-forwarded-proto") || (req.connection?.encrypted ? "https" : "http");
    return `${protocol}://${req.get("host")}/login/login.html`;
  }
  return process.env.APP_URL || "https://your-app.railway.app/login/login.html";
}

async function sendWelcomeEmail(options) {
  const { adminEmail, restaurantName, username, temporaryPassword, loginUrl } = options;

  if (!nodemailer) {
    console.warn("[Mail] nodemailer not installed. Run: npm install nodemailer");
    return { sent: false, error: "nodemailer_not_installed" };
  }

  if (!isConfigured()) {
    console.warn("[Mail] SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS.");
    return { sent: false, error: "smtp_not_configured" };
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  const subject = "Benvenuto in Ristoword – Credenziali di accesso";
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Benvenuto in Ristoword</title></head>
<body style="font-family:system-ui,sans-serif;line-height:1.6;color:#333;max-width:560px;margin:0 auto;padding:20px;">
  <h1 style="color:#1a1a2e;">Benvenuto in Ristoword</h1>
  <p>Ciao,</p>
  <p>Il tuo ristorante <strong>${escapeHtml(restaurantName)}</strong> è stato attivato con successo.</p>
  <p>Ecco le tue credenziali di accesso:</p>
  <ul style="background:#f5f5f5;padding:16px 24px;border-radius:8px;list-style:none;">
    <li><strong>URL:</strong> <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a></li>
    <li><strong>Utente:</strong> ${escapeHtml(username)}</li>
    <li><strong>Password temporanea:</strong> ${escapeHtml(temporaryPassword)}</li>
  </ul>
  <p><strong>Importante:</strong> Al primo accesso ti verrà chiesto di cambiare la password per motivi di sicurezza.</p>
  <p>Buon lavoro con Ristoword!</p>
  <p style="color:#888;font-size:12px;margin-top:32px;">— Il team Ristoword</p>
</body>
</html>
  `.trim();

  const text = `
Benvenuto in Ristoword

Il tuo ristorante ${restaurantName} è stato attivato.

Credenziali:
- URL: ${loginUrl}
- Utente: ${username}
- Password temporanea: ${temporaryPassword}

Importante: Al primo accesso dovrai cambiare la password.

— Il team Ristoword
  `.trim();

  try {
    await transporter.sendMail({
      from: SMTP_FROM,
      to: adminEmail,
      subject,
      text,
      html,
    });
    return { sent: true };
  } catch (err) {
    console.error("[Mail] Send failed:", err.message);
    return { sent: false, error: err.message };
  }
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

module.exports = {
  isConfigured,
  sendWelcomeEmail,
  getLoginUrl,
};
