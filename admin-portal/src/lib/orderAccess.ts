"use client";

export type OrderLane = "processing" | "packaging" | "shipping" | "cancellations";

export type OrderPermissionAccess = {
  isSystemBypass: boolean;
  canReadOrders: boolean;
  processing: boolean;
  packaging: boolean;
  shipping: boolean;
  cancellations: boolean;
  returns: boolean;
  admin: boolean;
};

export function buildOrderPermissionAccess(permissionCodes: string[], systemLevel?: string | null): OrderPermissionAccess {
  const permissionSet = new Set((permissionCodes || []).map((value) => String(value || "")));
  const normalizedSystemLevel = String(systemLevel || "NONE").toUpperCase();
  const isSystemBypass = normalizedSystemLevel === "SUPER" || normalizedSystemLevel === "ADMIN";

  if (isSystemBypass) {
    return {
      isSystemBypass: true,
      canReadOrders: true,
      processing: true,
      packaging: true,
      shipping: true,
      cancellations: true,
      returns: true,
      admin: true,
    };
  }

  const canReadOrders = permissionSet.has("order:read");

  return {
    isSystemBypass: false,
    canReadOrders,
    processing: canReadOrders && permissionSet.has("order:processing"),
    packaging: canReadOrders && permissionSet.has("order:packaging"),
    shipping: canReadOrders && permissionSet.has("order:shipping"),
    cancellations: canReadOrders && permissionSet.has("order:cancellation"),
    returns: canReadOrders && permissionSet.has("order:return"),
    admin: canReadOrders && permissionSet.has("order:admin"),
  };
}

export function hasOrderLaneAccess(access: OrderPermissionAccess, lane: OrderLane) {
  if (lane === "processing") return access.processing;
  if (lane === "packaging") return access.packaging;
  if (lane === "shipping") return access.shipping;
  return access.cancellations;
}
