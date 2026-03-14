// backend/src/utils/generatePassword.js
// Generate secure temporary password (no special chars that break URLs).

const CHARS_UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const CHARS_LOWER = "abcdefghjkmnpqrstuvwxyz";
const CHARS_DIGIT = "23456789";

function randomChoice(str) {
  return str[Math.floor(Math.random() * str.length)];
}

function generateSecurePassword(length = 14) {
  const len = Math.max(12, Math.min(24, length));
  let pwd = "";
  pwd += randomChoice(CHARS_UPPER);
  pwd += randomChoice(CHARS_LOWER);
  pwd += randomChoice(CHARS_DIGIT);
  const all = CHARS_UPPER + CHARS_LOWER + CHARS_DIGIT;
  for (let i = pwd.length; i < len; i++) {
    pwd += randomChoice(all);
  }
  return pwd.split("").sort(() => Math.random() - 0.5).join("");
}

module.exports = { generateSecurePassword };
