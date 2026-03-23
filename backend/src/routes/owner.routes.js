const router = require("express").Router();
const asyncHandler = require("../utils/asyncHandler");
const ownerController = require("../controllers/owner.controller");
const gsSyncController = require("../controllers/gsSync.controller");
const db = require("../config/db");
const { requireAuth } = require("../middleware/requireAuth.middleware");
const { requireRole } = require("../middleware/requireRole.middleware");

router.post("/complete-activation", asyncHandler(ownerController.completeActivation));

/** Elenco licenze MySQL (tenant registry) — solo owner autenticato */
router.get(
  "/licenses",
  requireAuth,
  requireRole(["owner"]),
  asyncHandler(async (req, res) => {
    const [rows] = await db.query(
      `SELECT l.id, l.code, l.status, l.tenant_id, l.expires_at, l.created_at, t.name AS tenant_name
       FROM licenses l
       LEFT JOIN tenants t ON l.tenant_id = t.id
       ORDER BY l.id DESC`
    );
    res.json(rows);
  })
);

/** Import batch codici da GS → mirror locale (X-GS-Sync-Secret) */
router.post(
  "/gs-import-codes",
  gsSyncController.requireSyncSecret,
  asyncHandler(gsSyncController.postImportCodes)
);
/** Statistiche mirror (solo diagnostica) */
router.get(
  "/gs-mirror-stats",
  gsSyncController.requireSyncSecret,
  asyncHandler(gsSyncController.getMirrorStats)
);

module.exports = router;
