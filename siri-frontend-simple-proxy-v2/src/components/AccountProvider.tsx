"use client";

// AccountProvider bootstraps storefront customer auth from the refresh-cookie
// flow and keeps the short-lived access token in browser state/local storage.
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  clearCustomerAccessToken,
  customerLogin,
  customerLogout,
  customerRefresh,
  customerSignup,
  fetchCustomerMe,
  persistCustomerAccessToken,
  readCustomerAccessToken,
  type CustomerProfile,
} from "@/lib/accountApi";

type AccountContextValue = {
  customer: CustomerProfile | null;
  loading: boolean;
  ready: boolean;
  error: string | null;
  login: (input: { email: string; password: string }) => Promise<CustomerProfile>;
  signup: (input: { name: string; email: string; password: string; phone?: string }) => Promise<CustomerProfile>;
  logout: () => Promise<void>;
  refreshCustomer: () => Promise<CustomerProfile | null>;
  accessToken: string;
};

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [accessToken, setAccessToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyAuth = (nextCustomer: CustomerProfile | null, token: string) => {
    setCustomer(nextCustomer);
    setAccessToken(token);
    persistCustomerAccessToken(token);
  };

  const refreshCustomer = async () => {
    try {
      const refreshed = await customerRefresh();
      applyAuth(refreshed.customer, refreshed.accessToken);
      const me = await fetchCustomerMe(refreshed.accessToken);
      setCustomer(me.customer);
      setError(null);
      return me.customer;
    } catch (err) {
      applyAuth(null, "");
      setError(null);
      return null;
    } finally {
      setLoading(false);
      setReady(true);
    }
  };

  useEffect(() => {
    const stored = readCustomerAccessToken();
    if (stored) setAccessToken(stored);
    refreshCustomer();
  }, []);

  const login = async (input: { email: string; password: string }) => {
    const payload = await customerLogin(input);
    applyAuth(payload.customer, payload.accessToken);
    setError(null);
    return payload.customer;
  };

  const signup = async (input: { name: string; email: string; password: string; phone?: string }) => {
    const payload = await customerSignup(input);
    applyAuth(payload.customer, payload.accessToken);
    setError(null);
    return payload.customer;
  };

  const logout = async () => {
    try {
      await customerLogout();
    } finally {
      clearCustomerAccessToken();
      setCustomer(null);
      setAccessToken("");
      setError(null);
    }
  };

  const value = useMemo(
    () => ({ customer, loading, ready, error, login, signup, logout, refreshCustomer, accessToken }),
    [customer, loading, ready, error, accessToken]
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const value = useContext(AccountContext);
  if (!value) throw new Error("useAccount must be used inside AccountProvider");
  return value;
}
