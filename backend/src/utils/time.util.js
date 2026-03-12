function nowISO() {
  return new Date().toISOString();
}

function todayISO() {
  const d = new Date();

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatTime(date = new Date()) {
  const d = new Date(date);

  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");

  return `${h}:${m}:${s}`;
}

module.exports = {
  nowISO,
  todayISO,
  formatTime
};
