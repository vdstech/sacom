const router = require("express").Router();
const ctrl = require("./inventory.controller");
const { validateUpsert, validateAdjust } = require("./inventory.validation");

const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permission");

router.get("/sku/:sku", requireAuth, requirePermission("inventory:read"), ctrl.getBySku);

router.post("/upsert", requireAuth, requirePermission("inventory:write"), validateUpsert, ctrl.upsert);
router.post("/adjust", requireAuth, requirePermission("inventory:write"), validateAdjust, ctrl.adjust);

module.exports = router;