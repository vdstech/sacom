import "./globals.css";
import { NavBar } from "@/components/NavBar";

export const metadata = {
  title: "Siri Collections (Menu Only)",
  description: "Single page with backend-driven menu only",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <NavBar />
        <main className="mx-auto max-w-7xl px-4 py-10">{children}</main>
      </body>
    </html>
  );
}
