const mongoose = require("mongoose");
const Variant = require("./variant.model");

exports.list = async (req, res) => {
  try {
    const { productId } = req.query;
    const filter = {};
    if (productId) filter.productId = new mongoose.Types.ObjectId(productId);

    const docs = await Variant.find(filter).sort({ isDefault: -1, createdAt: -1 }).lean();
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to list variants" });
  }
};

exports.create = async (req, res) => {
  try {
    const b = req.body;
    const doc = await Variant.create({
      productId: new mongoose.Types.ObjectId(b.productId),
      sku: String(b.sku).trim().toUpperCase(),
      optionValues: b.optionValues || {},
      price: Number(b.price),
      mrp: Number(b.mrp || 0),
      compareAtPrice: Number(b.compareAtPrice || 0),
      barcode: b.barcode || "",
      weightKg: Number(b.weightKg || 0),
      dimensionsCm: b.dimensionsCm || { l: 0, w: 0, h: 0 },
      images: b.images || [],
      isDefault: !!b.isDefault,
      isActive: b.isActive !== undefined ? !!b.isActive : true,
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });

    res.status(201).json(doc);
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: "SKU already exists" });
    res.status(500).json({ error: err.message || "Failed to create variant" });
  }
};

exports.update = async (req, res) => {
  try {
    const patch = { ...req.body };
    if (patch.sku) patch.sku = String(patch.sku).trim().toUpperCase();
    patch.updatedBy = req.user?._id || null;

    const doc = await Variant.findByIdAndUpdate(req.params.id, patch, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ error: "Variant not found" });
    res.json(doc);
  } catch (err) {
    if (err?.code === 11000) return res.status(409).json({ error: "SKU already exists" });
    res.status(500).json({ error: err.message || "Failed to update variant" });
  }
};

exports.remove = async (req, res) => {
  try {
    const doc = await Variant.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!doc) return res.status(404).json({ error: "Variant not found" });
    res.json({ success: true, variant: doc });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to delete variant" });
  }
};