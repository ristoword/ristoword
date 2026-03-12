// Lightweight server logging. No sensitive data.
const PREFIX = "[Ristoword]";

function safeMessage(msg, meta = {}) {
  const parts = [PREFIX, msg];
  if (Object.keys(meta).length) {
    parts.push(JSON.stringify(meta));
  }
  return parts.join(" ");
}

function info(msg, meta = {}) {
  console.log(safeMessage(msg, meta));
}

function error(msg, meta = {}) {
  console.error(safeMessage(msg, meta));
}

function warn(msg, meta = {}) {
  console.warn(safeMessage(msg, meta));
}

module.exports = { info, error, warn };
