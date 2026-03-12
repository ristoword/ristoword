// backend/src/config/env.js

require("dotenv").config();

const env = {
  NODE_ENV: process.env.NODE_ENV || "development",

  PORT: process.env.PORT || 3000,

  SESSION_SECRET: process.env.SESSION_SECRET || "ristoword-secret",

  LICENSE_KEY: process.env.LICENSE_KEY || null,

  DATA_PATH: process.env.DATA_PATH || "./data",

  LOG_LEVEL: process.env.LOG_LEVEL || "info",

  AI_ENABLED: process.env.AI_ENABLED === "true",

  AI_PROVIDER: process.env.AI_PROVIDER || "local"
};

module.exports = env;