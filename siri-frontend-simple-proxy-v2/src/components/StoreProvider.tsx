"use client";

// StoreProvider keeps guest-cart state resilient at the layout level so cart
// fetch failures degrade into an unavailable cart state instead of breaking
// storefront navigation or page rendering.
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { CartResponse, fetchStore } from "@/lib/storeApi";
import { STOREFRONT_STORAGE_KEYS } from "@/lib/constants";
import { STOREFRONT_STRINGS } from "@/lib/strings";

const CART_TOKEN_STORAGE_KEY = STOREFRONT_STORAGE_KEYS.guestCartToken;

type CartContextValue = {
  cart: CartResponse | null;
  error: string | null;
  loading: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  refreshCart: () => Promise<void>;
  addItem: (input: {
    productId: string;
    variantId: string;
    stockKey: string;
    quantity: number;
  }) => Promise<void>;
  updateItem: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
};

const CartContext = createContext<CartContextValue | null>(null);

function readCartToken() {
  if (typeof window === "undefined") return "";
  return String(window.localStorage.getItem(CART_TOKEN_STORAGE_KEY) || "").trim();
}

function persistCartToken(token: string) {
  if (typeof window === "undefined" || !token) return;
  window.localStorage.setItem(CART_TOKEN_STORAGE_KEY, token);
}

async function requestCart(path: string, init?: RequestInit) {
  const payload = await fetchStore<CartResponse>(path, init);
  if (payload?.cartToken) persistCartToken(payload.cartToken);
  return payload;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const refreshCart = async () => {
    setLoading(true);
    try {
      const token = readCartToken();
      const query = token ? `?cartToken=${encodeURIComponent(token)}` : "";
      const payload = await requestCart(`/cart${query}`);
      setCart(payload);
      setError(null);
    } catch (err) {
      setCart(null);
      setError(err instanceof Error ? err.message : STOREFRONT_STRINGS.navigation.cart.unavailable);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshCart();
  }, []);

  const addItem = async (input: { productId: string; variantId: string; stockKey: string; quantity: number }) => {
    try {
      const payload = await requestCart("/cart/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cartToken: readCartToken(),
          ...input,
        }),
      });
      setCart(payload);
      setError(null);
      setOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : STOREFRONT_STRINGS.navigation.cart.unavailable);
    }
  };

  const updateItem = async (itemId: string, quantity: number) => {
    try {
      const payload = await requestCart(`/cart/items/${encodeURIComponent(itemId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cartToken: readCartToken(),
          quantity,
        }),
      });
      setCart(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : STOREFRONT_STRINGS.navigation.cart.unavailable);
    }
  };

  const removeItem = async (itemId: string) => {
    try {
      const token = readCartToken();
      const query = token ? `?cartToken=${encodeURIComponent(token)}` : "";
      const payload = await requestCart(`/cart/items/${encodeURIComponent(itemId)}${query}`, {
        method: "DELETE",
      });
      setCart(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : STOREFRONT_STRINGS.navigation.cart.unavailable);
    }
  };

  const value = useMemo(
    () => ({ cart, error, loading, open, setOpen, refreshCart, addItem, updateItem, removeItem }),
    [cart, error, loading, open]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useStoreCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useStoreCart must be used inside StoreProvider");
  return value;
}
