module.exports = function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        error: true,
        message: "Token mancante"
      });
    }

    if (!token.startsWith("rw_")) {
      return res.status(401).json({
        error: true,
        message: "Token non valido"
      });
    }

    const parts = token.split("_");

    const role = parts[1];
    const username = parts[2];

    req.user = {
      username,
      role
    };

    next();
  } catch (err) {
    return res.status(401).json({
      error: true,
      message: "Autenticazione fallita"
    });
  }
};