const { getKPI } = require("../services/kpi.service");

async function getDashboard(req, res) {
  try {
    const data = await getKPI();
    res.json(data);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("KPI ERROR:", err);
    res.status(500).json({ error: "KPI error" });
  }
}

module.exports = { getDashboard };
