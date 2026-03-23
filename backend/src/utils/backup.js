const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "../../data");
const BACKUP_DIR = path.join(__dirname, "../../backups");

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR);
  }
}

function backupNow() {
  ensureBackupDir();

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}`);

  fs.cpSync(DATA_DIR, backupPath, { recursive: true });

  console.log("[Backup] created:", backupPath);
}

function startAutoBackup() {
  setInterval(() => {
    try {
      backupNow();
    } catch (err) {
      console.error("[Backup] error:", err.message);
    }
  }, 1000 * 60 * 30); // ogni 30 min
}

module.exports = { startAutoBackup, backupNow };
