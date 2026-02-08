export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "https://localhost:3000";

export const SERVICE_BASES = {
  auth: process.env.NEXT_PUBLIC_AUTH_URL || API_BASE_URL,
  catalog: process.env.NEXT_PUBLIC_CATALOG_URL || API_BASE_URL,
  product: process.env.NEXT_PUBLIC_PRODUCT_URL || API_BASE_URL,
  navigation: process.env.NEXT_PUBLIC_NAVIGATION_URL || API_BASE_URL,
};
