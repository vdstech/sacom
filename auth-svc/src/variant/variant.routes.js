const router = require("express").Router();
const ctrl = require("./variant.controller");
const { validateCreate } = require("./variant.validation");

const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../middleware/permission");

// Read
router.get("/", ctrl.list);

// Write (reuse product permission to keep simple)
router.post("/", requireAuth, requirePermission("product:write"), validateCreate, ctrl.create);
router.put("/:id", requireAuth, requirePermission("product:write"), ctrl.update);
router.delete("/:id", requireAuth, requirePermission("product:write"), ctrl.remove);

module.exports = router;