import CustomerAddress from "./customer-addresses.model.js";

function mapAddress(address) {
  return {
    id: String(address._id),
    fullName: address.fullName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2 || "",
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
    isDefault: !!address.isDefault,
  };
}

async function normalizeDefaultAddress(customerId, targetId = null) {
  await CustomerAddress.updateMany(
    { customer: customerId, _id: { $ne: targetId } },
    { $set: { isDefault: false } }
  );
}

export async function listAddresses(req, res) {
  const rows = await CustomerAddress.find({ customer: req.customerAuth.customerId })
    .sort({ isDefault: -1, createdAt: -1 })
    .lean();
  return res.json({ addresses: rows.map(mapAddress) });
}

export async function createAddress(req, res) {
  const payload = {
    fullName: String(req.body?.fullName || "").trim(),
    phone: String(req.body?.phone || "").trim(),
    line1: String(req.body?.line1 || "").trim(),
    line2: String(req.body?.line2 || "").trim(),
    city: String(req.body?.city || "").trim(),
    state: String(req.body?.state || "").trim(),
    postalCode: String(req.body?.postalCode || "").trim(),
    country: String(req.body?.country || "India").trim(),
    isDefault: !!req.body?.isDefault,
  };

  if (!payload.fullName || !payload.phone || !payload.line1 || !payload.city || !payload.state || !payload.postalCode) {
    return res.status(400).json({ error: "Required address fields are missing" });
  }

  const hasAny = await CustomerAddress.exists({ customer: req.customerAuth.customerId });
  const address = await CustomerAddress.create({
    customer: req.customerAuth.customerId,
    ...payload,
    isDefault: payload.isDefault || !hasAny,
  });

  if (address.isDefault) await normalizeDefaultAddress(req.customerAuth.customerId, address._id);
  return res.status(201).json({ address: mapAddress(address) });
}

export async function updateAddress(req, res) {
  const address = await CustomerAddress.findOne({ _id: req.params.id, customer: req.customerAuth.customerId });
  if (!address) return res.status(404).json({ error: "Address not found" });

  const fields = ["fullName", "phone", "line1", "line2", "city", "state", "postalCode", "country"];
  for (const field of fields) {
    if (field in (req.body || {})) {
      address[field] = String(req.body?.[field] || "").trim();
    }
  }
  if ("isDefault" in (req.body || {})) address.isDefault = !!req.body?.isDefault;
  await address.save();
  if (address.isDefault) await normalizeDefaultAddress(req.customerAuth.customerId, address._id);
  return res.json({ address: mapAddress(address) });
}

export async function deleteAddress(req, res) {
  const address = await CustomerAddress.findOneAndDelete({ _id: req.params.id, customer: req.customerAuth.customerId });
  if (!address) return res.status(404).json({ error: "Address not found" });

  if (address.isDefault) {
    const next = await CustomerAddress.findOne({ customer: req.customerAuth.customerId }).sort({ createdAt: -1 });
    if (next) {
      next.isDefault = true;
      await next.save();
    }
  }
  return res.json({ success: true });
}
