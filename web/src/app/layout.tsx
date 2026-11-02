import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wayfarer — Honest Ratings, Fair Bookings",
  description: "Curated city discovery with honest Bayesian rankings and concurrency-safe guided tour bookings.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-[#FAF8F5] text-[#081C15]">
        {children}
      </body>
    </html>
  );
}

