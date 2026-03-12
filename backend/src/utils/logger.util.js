function logInfo(message, data = null) {
  const time = new Date().toISOString();

  if (data) {
    console.log(`[INFO] ${time} - ${message}`, data);
  } else {
    console.log(`[INFO] ${time} - ${message}`);
  }
}

function logWarn(message, data = null) {
  const time = new Date().toISOString();

  if (data) {
    console.warn(`[WARN] ${time} - ${message}`, data);
  } else {
    console.warn(`[WARN] ${time} - ${message}`);
  }
}

function logError(message, error = null) {
  const time = new Date().toISOString();

  if (error) {
    console.error(`[ERROR] ${time} - ${message}`, error);
  } else {
    console.error(`[ERROR] ${time} - ${message}`);
  }
}

function logDebug(message, data = null) {
  const time = new Date().toISOString();

  if (data) {
    console.debug(`[DEBUG] ${time} - ${message}`, data);
  } else {
    console.debug(`[DEBUG] ${time} - ${message}`);
  }
}

module.exports = {
  logInfo,
  logWarn,
  logError,
  logDebug
};
