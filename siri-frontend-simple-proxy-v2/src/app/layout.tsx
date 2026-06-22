import "./globals.css";
import { AccountProvider } from "@/components/AccountProvider";
import { CartDrawer } from "@/components/CartDrawer";
import { NavBar } from "@/components/NavBar";
import { StoreProvider } from "@/components/StoreProvider";

export const metadata = {
  title: "పూజిత | Sarees, Jewellery & Curated Collections",
  description: "Boutique storefront for sarees, jewellery, blouses, dupattas, and curated collections.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AccountProvider>
          <StoreProvider>
            <NavBar />
            <CartDrawer />
            <main className="site-main">{children}</main>
          </StoreProvider>
        </AccountProvider>
      </body>
    </html>
  );
}
