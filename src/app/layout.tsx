import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SPANDAN 4.0 | GMC Firozabad",
  description: "The official festival space for GMC Firozabad.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
