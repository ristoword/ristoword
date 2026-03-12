const logger = require("../utils/logger");

function errorHandler(err, req, res, next) {
  const status = err.status || 500;
  const message = err.message || "Errore interno del server";

  logger.error("API error", { status, message: err.message, path: req.path });

  res.status(status).json({
    error: true,
    message,
  });
}

module.exports = errorHandler;