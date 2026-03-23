// backend/src/config/session.js
// Shared session middleware for Express and WebSocket verifyClient
const fs = require("fs");
const path = require("path");
const session = require("express-session");
const FileStore = require("session-file-store")(session);
const paths = require("./paths");

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret || String(sessionSecret).trim().length === 0) {
  throw new Error(
    "SESSION_SECRET is required. Set it in .env or environment. " +
      "Example: SESSION_SECRET=your-secure-random-string"
  );
}

const isProd = process.env.NODE_ENV === "production";

// Stesso albero di backend/data/ degli altri tenant (indipendente da cwd)
const sessionDir = path.join(paths.DATA, "sessions");

const store = isProd
  ? (() => {
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }
      return new FileStore({
        path: sessionDir,
        retries: 0,
        ttl: 24 * 60 * 60, // secondi, allineato al cookie
      });
    })()
  : undefined;

const sessionMiddleware = session({
  secret: sessionSecret,
  store: store || undefined,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000,
    secure: isProd,
    sameSite: "lax",
  },
});

module.exports = sessionMiddleware;
