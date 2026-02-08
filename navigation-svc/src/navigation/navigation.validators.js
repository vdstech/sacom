import { z } from "zod";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/);

const isManualPath = (p) => {
  const s = String(p || "").trim();
  return s.startsWith("/") || s.startsWith("http://") || s.startsWith("https://");
};

export const createNavSchema = z
  .object({
    name: z.string().min(1),
    slug: z.string().min(1),

    categoryId: objectId.nullable().optional(),
    path: z.string().optional().default(""),

    description: z.string().optional().default(""),
    parentId: objectId.nullable().optional(),

    children: z.array(objectId).optional().default([]),
  })
  .superRefine((val, ctx) => {
    if (!val.categoryId) {
      if (!val.path || !val.path.trim()) {
        ctx.addIssue({ code: "custom", message: "path is required when categoryId is not provided" });
      } else if (!isManualPath(val.path)) {
        ctx.addIssue({ code: "custom", message: "path must start with '/' or 'http(s)://'" });
      }
    }
  });

export const updateNavSchema = z.object({
  name: z.string().min(1).optional(),
  slug: z.string().min(1).optional(),
  categoryId: objectId.nullable().optional(),
  path: z.string().optional(),
  description: z.string().optional(),
  parentId: objectId.nullable().optional(),
  children: z.array(objectId).optional(),
}).superRefine((val, ctx) => {
  // Only validate manual path rule when user explicitly sets categoryId/path in update payload
  if ("categoryId" in val && !val.categoryId) {
    const path = String(val.path || "").trim();
    if (!path) {
      ctx.addIssue({ code: "custom", message: "path is required when categoryId is null" });
    } else if (!isManualPath(path)) {
      ctx.addIssue({ code: "custom", message: "path must start with '/' or 'http(s)://'" });
    }
  }
});

// ✅ reorder within a parent by passing new children order
export const reorderChildrenSchema = z.object({
  parentId: objectId,
  children: z.array(objectId).min(0),
});
