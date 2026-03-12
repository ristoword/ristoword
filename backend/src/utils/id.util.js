const { v4: uuidv4 } = require("uuid");

function generateId() {
  return uuidv4();
}

function shortId(length = 8) {
  return uuidv4()
    .replace(/-/g, "")
    .substring(0, length);
}

function numericId() {
  const now = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return Number(`${now}${random}`);
}

module.exports = {
  generateId,
  shortId,
  numericId
};

