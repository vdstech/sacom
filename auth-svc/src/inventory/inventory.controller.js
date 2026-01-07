const Inventory = require("./inventory.model");

exports.getBySku = async (req, res) => {
  try {
    const sku = String(req.params.sku).trim().toUpperCase();
    const doc = await Inventory.findOne({ sku }).lean();
    if (!doc) return res.status(404).json({ error: "Inventory not found" });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to fetch inventory" });
  }
};

exports.upsert = async (req, res) => {
  try {
    const b = req.body;
    const sku = String(b.sku).trim().toUpperCase();

    const doc = await Inventory.findOneAndUpdate(
      { sku },
      {
        $set: {
          sku,
          productId: b.productId,
          variantId: b.variantId,
          trackInventory: b.trackInventory !== undefined ? !!b.trackInventory : true,
          availableQty: Number(b.availableQty || 0),
          reservedQty: Number(b.reservedQty || 0),
          allowBackorder: !!b.allowBackorder,
          reorderLevel: Number(b.reorderLevel || 0),
          updatedBy: req.user?._id || null,
        }
      },
      { new: true, upsert: true, runValidators: true }
    );

    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to upsert inventory" });
  }
};

// delta can be +10 or -2
exports.adjust = async (req, res) => {
  try {
    const sku = String(req.body.sku).trim().toUpperCase();
    const delta = Number(req.body.delta);

    const doc = await Inventory.findOneAndUpdate(
      { sku },
      {
        $inc: { availableQty: delta },
        $set: { updatedBy: req.user?._id || null }
      },
      { new: true }
    );

    if (!doc) return res.status(404).json({ error: "Inventory not found" });
    if (doc.availableQty < 0) {
      // revert if negative stock happened
      await Inventory.findOneAndUpdate({ sku }, { $inc: { availableQty: -delta } });
      return res.status(409).json({ error: "Insufficient stock" });
    }

    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to adjust inventory" });
  }
};