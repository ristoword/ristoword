const authRepository = require("../repositories/auth.repository");
const staffRepository = require("../repositories/staff.repository");

// POST /api/auth/login
exports.login = async (req, res, next) => {
  try {
    const { username, password, role } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({
        error: true,
        message: "Username e password obbligatori"
      });
    }

    const user = await authRepository.findByCredentials(username, password, role);

    if (!user) {
      return res.status(401).json({
        error: true,
        message: "Credenziali non valide"
      });
    }

    // Resolve display name from staff if manager
    let displayName = user.username;
    if (user.role && ["cash_manager", "kitchen_manager", "sala_manager", "bar_manager", "supervisor"].includes(user.role)) {
      const staff = await staffRepository.getManagers();
      const match = staff.find((s) => s.role === user.role);
      if (match) displayName = match.name;
    }

    req.session.user = {
      username: user.username,
      role: user.role,
      department: user.department,
    };
    req.session.restaurantId = user.restaurantId ?? "default";

    res.json({
      success: true,
      user: user.username,
      name: displayName,
      role: user.role,
      department: user.department,
      token: user.token,
      redirectTo: user.redirectTo
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/logout
exports.logout = async (req, res, next) => {
  try {
    if (req.session) req.session.destroy(() => {});
    res.json({
      success: true,
      message: "Logout effettuato"
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/auth/me – returns current session user only (requireAuth already ran)
exports.me = async (req, res, next) => {
  try {
    const sessionUser = req.session?.user;
    if (!sessionUser) {
      return res.status(401).json({
        error: "non_autenticato",
        message: "Effettua il login."
      });
    }

    res.json({
      username: sessionUser.username,
      role: sessionUser.role,
      department: sessionUser.department
    });
  } catch (err) {
    next(err);
  }
};