import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { Compass } from "lucide-react";
import { Header } from "../components/header";
import { TravellerProvider } from "../components/traveller-provider";
import { preHydrationAttributeCleanup } from "../lib/pre-hydration";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wayfarer — Honest Ratings, Fair Bookings",
  description: "Discover history, food, and nature in Addis Ababa, with traveller reviews and guided tours.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Script id="pre-hydration-extension-attributes" strategy="beforeInteractive">
          {preHydrationAttributeCleanup}
        </Script>
        <TravellerProvider>
          <a className="skip-link" href="#main-content">Skip to content</a>
          <Header />
          <main id="main-content" className="site-main">{children}</main>
          <footer className="site-footer">
            <div className="site-footer-inner">
              <Link className="footer-brand" href="/">
                <Compass size={24} aria-hidden="true" /><span>Wayfarer</span>
              </Link>
              <p>A little closer to Addis Ababa.</p>
              <p className="footer-categories">History <span>·</span> Food <span>·</span> Nature</p>
            </div>
          </footer>
        </TravellerProvider>
      </body>
    </html>
  );
}

