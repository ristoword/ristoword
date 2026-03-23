const authRepository = require("../repositories/auth.repository");
const staffRepository = require("../repositories/staff.repository");
const usersRepository = require("../repositories/users.repository");
const attendanceRepository = require("../repositories/attendance.repository");
const { isOwnerSetupComplete } = require("../config/ownerSetup");
const bcrypt = require("bcrypt");

const BCRYPT_ROUNDS = 10;

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
      id: user.id,
      username: user.username,
      role: user.role,
      department: user.department,
      mustChangePassword: user.mustChangePassword === true,
      restaurantId: user.restaurantId,
    };
    req.session.restaurantId = user.restaurantId ?? "default";

    // Timbratura: solo utenti non-owner, con restaurantId
    if (user.role !== "owner" && user.restaurantId) {
      try {
        const openShift = attendanceRepository.findOpenShiftByUser(user.id, user.restaurantId);
        if (openShift) {
          attendanceRepository.markAnomaly(user.restaurantId, openShift.id, "double_clockin", "Login con turno già aperto");
        } else {
          attendanceRepository.createShift(user.restaurantId, {
            userId: user.id,
            status: "open",
          });
        }
      } catch (err) {
        console.error("[Auth] attendance on login:", err.message);
      }
    }

    const mustChange = user.mustChangePassword === true;
    let redirectTo = mustChange ? "/change-password" : (user.redirectTo || undefined);
    if (!mustChange && user.role === "owner") {
      const restaurantId = user.restaurantId ?? "default";
      const ownerSetupDone = await isOwnerSetupComplete(restaurantId);
      if (!ownerSetupDone) redirectTo = "/dev-access/dashboard";
    }
    res.json({
      success: true,
      user: user.username,
      name: displayName,
      role: user.role,
      department: user.department,
      mustChangePassword: mustChange,
      token: user.token,
      redirectTo,
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/logout
exports.logout = async (req, res, next) => {
  try {
    const sessionUser = req.session && req.session.user;
    const restaurantId = req.session && req.session.restaurantId;
    if (sessionUser && sessionUser.role !== "owner" && restaurantId && sessionUser.id) {
      try {
        const openShift = attendanceRepository.findOpenShiftByUser(sessionUser.id, restaurantId);
        if (openShift) {
          attendanceRepository.closeShift(restaurantId, openShift.id, {
            clockOutAt: new Date().toISOString(),
          });
        } else {
          attendanceRepository.createAnomalyRecord(
            restaurantId,
            sessionUser.id,
            "double_clockout",
            new Date().toISOString()
          );
        }
      } catch (err) {
        console.error("[Auth] attendance on logout:", err.message);
      }
    }
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
      department: sessionUser.department,
      mustChangePassword: sessionUser.mustChangePassword === true,
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/change-password – change password (primo accesso: solo password; altrimenti current + new)
exports.changePassword = async (req, res, next) => {
  try {
    const sessionUser = req.session?.user;
    if (!sessionUser) {
      return res.status(401).json({
        error: true,
        message: "Effettua il login."
      });
    }

    const { password, currentPassword, newPassword } = req.body || {};
    const isFirstTime = sessionUser.mustChangePassword === true;

    let newPwd;
    if (isFirstTime && typeof password === "string") {
      newPwd = String(password).trim();
      if (newPwd.length < 6) {
        return res.status(400).json({
          error: true,
          message: "La password deve essere di almeno 6 caratteri"
        });
      }
    } else {
      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          error: true,
          message: "Password attuale e nuova password obbligatorie"
        });
      }
      newPwd = String(newPassword).trim();
      if (newPwd.length < 8) {
        return res.status(400).json({
          error: true,
          message: "La nuova password deve essere di almeno 8 caratteri"
        });
      }
      const user = await authRepository.findByCredentials(sessionUser.username, currentPassword);
      if (!user) {
        return res.status(401).json({
          error: true,
          message: "Password attuale non corretta"
        });
      }
    }

    const users = await usersRepository.readUsers();
    const idx = users.findIndex((u) => String(u.username).toLowerCase() === String(sessionUser.username).toLowerCase());
    if (idx < 0) {
      return res.status(404).json({
        error: true,
        message: "Utente non trovato"
      });
    }

    const hash = await bcrypt.hash(newPwd, BCRYPT_ROUNDS);
    users[idx] = {
      ...users[idx],
      password: hash,
      mustChangePassword: false,
    };
    await usersRepository.writeUsers(users);

    req.session.user = {
      ...sessionUser,
      mustChangePassword: false,
    };

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};