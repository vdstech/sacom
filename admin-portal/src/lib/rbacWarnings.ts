export type RbacWarning = {
  type: string;
  severity: "warning";
  message: string;
  recommendedFix: string;
};

const CATEGORY_CODES = ["category:read", "category:create", "category:update", "category:delete"];
const PRODUCT_CODES = ["product:read", "product:create", "product:update", "product:delete", "product:publish"];
const INVENTORY_CODES = ["inventory:read", "product:inventory:update"];

function hasAny(permissionSet: Set<string>, codes: string[]) {
  return codes.some((code) => permissionSet.has(code));
}

function addWarning(
  warnings: RbacWarning[],
  seen: Set<string>,
  warning: RbacWarning
) {
  if (seen.has(warning.type)) return;
  seen.add(warning.type);
  warnings.push(warning);
}

export function buildRbacWarnings(permissionCodes: string[], visibleMenuIds: string[]): RbacWarning[] {
  const permissionSet = new Set((permissionCodes || []).map((code) => String(code || "").trim()).filter(Boolean));
  const menuSet = new Set((visibleMenuIds || []).map((menuId) => String(menuId || "").trim()).filter(Boolean));
  const warnings: RbacWarning[] = [];
  const seen = new Set<string>();

  if (menuSet.has("products") && !permissionSet.has("product:read")) {
    addWarning(warnings, seen, {
      type: "menu-products-missing-product-read",
      severity: "warning",
      message: "Products menu is selected, but `product:read` is missing. The user may see the menu but the page may not load correctly.",
      recommendedFix: "Add `product:read` or remove the Products menu from this role.",
    });
  }

  if (menuSet.has("categories") && !permissionSet.has("category:read")) {
    addWarning(warnings, seen, {
      type: "menu-categories-missing-category-read",
      severity: "warning",
      message: "Categories menu is selected, but `category:read` is missing. The user may see the menu but the page may not load correctly.",
      recommendedFix: "Add `category:read` or remove the Categories menu from this role.",
    });
  }

  if (menuSet.has("inventory") && !permissionSet.has("inventory:read")) {
    addWarning(warnings, seen, {
      type: "menu-inventory-missing-inventory-read",
      severity: "warning",
      message: "Inventory menu is selected, but `inventory:read` is missing. The user may see the menu but inventory pages may not load correctly.",
      recommendedFix: "Add `inventory:read` or remove the Inventory menu from this role.",
    });
  }

  if (menuSet.has("returnExchangeManager") && !permissionSet.has("order:return")) {
    addWarning(warnings, seen, {
      type: "menu-returns-missing-order-return",
      severity: "warning",
      message: "Returns menu is selected, but `order:return` is missing.",
      recommendedFix: "Add `order:return` or remove the Returns menu from this role.",
    });
  }

  if (menuSet.has("shippingOperator") && !permissionSet.has("order:shipping")) {
    addWarning(warnings, seen, {
      type: "menu-shipping-missing-order-shipping",
      severity: "warning",
      message: "Shipping menu is selected, but `order:shipping` is missing.",
      recommendedFix: "Add `order:shipping` or remove the Shipping menu from this role.",
    });
  }

  if (menuSet.has("packagingManager") && !permissionSet.has("order:packaging")) {
    addWarning(warnings, seen, {
      type: "menu-packaging-missing-order-packaging",
      severity: "warning",
      message: "Packaging menu is selected, but `order:packaging` is missing.",
      recommendedFix: "Add `order:packaging` or remove the Packaging menu from this role.",
    });
  }

  if (menuSet.has("processingManager") && !permissionSet.has("order:processing")) {
    addWarning(warnings, seen, {
      type: "menu-processing-missing-order-processing",
      severity: "warning",
      message: "Processing menu is selected, but `order:processing` is missing.",
      recommendedFix: "Add `order:processing` or remove the Processing menu from this role.",
    });
  }

  if (menuSet.has("cancellationManager") && !permissionSet.has("order:cancellation")) {
    addWarning(warnings, seen, {
      type: "menu-cancellation-missing-order-cancellation",
      severity: "warning",
      message: "Cancellation menu is selected, but `order:cancellation` is missing.",
      recommendedFix: "Add `order:cancellation` or remove the Cancellation menu from this role.",
    });
  }

  for (const code of ["category:create", "category:update", "category:delete"]) {
    if (permissionSet.has(code) && !permissionSet.has("category:read")) {
      addWarning(warnings, seen, {
        type: `permission-${code.replace(":", "-")}-missing-category-read`,
        severity: "warning",
        message: `\`${code}\` is selected, but \`category:read\` is missing.`,
        recommendedFix: "Add `category:read` so users can load and use category pages consistently.",
      });
    }
  }

  for (const code of ["product:create", "product:update", "product:delete", "product:publish"]) {
    if (permissionSet.has(code) && !permissionSet.has("product:read")) {
      addWarning(warnings, seen, {
        type: `permission-${code.replace(":", "-")}-missing-product-read`,
        severity: "warning",
        message: `\`${code}\` is selected, but \`product:read\` is missing.`,
        recommendedFix: "Add `product:read` so users can load and use product pages consistently.",
      });
    }
  }

  if (permissionSet.has("product:inventory:update") && !permissionSet.has("inventory:read")) {
    addWarning(warnings, seen, {
      type: "permission-product-inventory-update-missing-inventory-read",
      severity: "warning",
      message: "`product:inventory:update` is selected, but `inventory:read` is missing.",
      recommendedFix: "Add `inventory:read` so users can open inventory pages before updating stock.",
    });
  }

  for (const code of ["order:return", "order:shipping", "order:packaging", "order:processing", "order:cancellation", "order:admin"]) {
    if (permissionSet.has(code) && !permissionSet.has("order:read")) {
      addWarning(warnings, seen, {
        type: `permission-${code.replace(/:/g, "-")}-missing-order-read`,
        severity: "warning",
        message: `\`${code}\` is selected, but \`order:read\` is missing.`,
        recommendedFix: "Add `order:read` so users can open order pages before taking lane or admin actions.",
      });
    }
  }

  if (hasAny(permissionSet, CATEGORY_CODES) && !menuSet.has("categories")) {
    addWarning(warnings, seen, {
      type: "permissions-category-missing-categories-menu",
      severity: "warning",
      message: "Category permissions are selected, but Categories menu is not visible.",
      recommendedFix: "Add the Categories menu or remove category permissions if this role should not navigate there.",
    });
  }

  if (hasAny(permissionSet, PRODUCT_CODES) && !menuSet.has("products")) {
    addWarning(warnings, seen, {
      type: "permissions-product-missing-products-menu",
      severity: "warning",
      message: "Product permissions are selected, but Products menu is not visible.",
      recommendedFix: "Add the Products menu or remove product permissions if this role should not navigate there.",
    });
  }

  if (hasAny(permissionSet, INVENTORY_CODES) && !menuSet.has("inventory")) {
    addWarning(warnings, seen, {
      type: "permissions-inventory-missing-inventory-menu",
      severity: "warning",
      message: "Inventory permissions are selected, but Inventory menu is not visible.",
      recommendedFix: "Add the Inventory menu or remove inventory permissions if this role should not navigate there.",
    });
  }

  if (permissionSet.has("order:return") && !menuSet.has("returnExchangeManager")) {
    addWarning(warnings, seen, {
      type: "permission-order-return-missing-returns-menu",
      severity: "warning",
      message: "`order:return` is selected, but Returns menu is not visible.",
      recommendedFix: "Add the Returns menu or remove `order:return` if the role should not access return workflows.",
    });
  }

  if (permissionSet.has("order:shipping") && !menuSet.has("shippingOperator")) {
    addWarning(warnings, seen, {
      type: "permission-order-shipping-missing-shipping-menu",
      severity: "warning",
      message: "`order:shipping` is selected, but Shipping menu is not visible.",
      recommendedFix: "Add the Shipping menu or remove `order:shipping` if the role should not access shipping workflows.",
    });
  }

  if (permissionSet.has("order:packaging") && !menuSet.has("packagingManager")) {
    addWarning(warnings, seen, {
      type: "permission-order-packaging-missing-packaging-menu",
      severity: "warning",
      message: "`order:packaging` is selected, but Packaging menu is not visible.",
      recommendedFix: "Add the Packaging menu or remove `order:packaging` if the role should not access packaging workflows.",
    });
  }

  if (permissionSet.has("order:processing") && !menuSet.has("processingManager")) {
    addWarning(warnings, seen, {
      type: "permission-order-processing-missing-processing-menu",
      severity: "warning",
      message: "`order:processing` is selected, but Processing menu is not visible.",
      recommendedFix: "Add the Processing menu or remove `order:processing` if the role should not access processing workflows.",
    });
  }

  if (permissionSet.has("order:cancellation") && !menuSet.has("cancellationManager")) {
    addWarning(warnings, seen, {
      type: "permission-order-cancellation-missing-cancellation-menu",
      severity: "warning",
      message: "`order:cancellation` is selected, but Cancellation menu is not visible.",
      recommendedFix: "Add the Cancellation menu or remove `order:cancellation` if the role should not access cancellation workflows.",
    });
  }

  return warnings;
}
