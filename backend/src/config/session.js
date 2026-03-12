// backend/src/config/session.js
// Shared session middleware for Express and WebSocket verifyClient
const session = require("express-session");

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || String(sessionSecret).trim().length === 0) {
  throw new Error(
    "SESSION_SECRET is required. Set it in .env or environment. " +
    "Example: SESSION_SECRET=your-secure-random-string"
  );
}

const isProduction = process.env.NODE_ENV === "production";
const sessionMiddleware = session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    secure: isProduction,
    sameSite: "lax",
  },
});

module.exports = sessionMiddleware;
