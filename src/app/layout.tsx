import type { Metadata, Viewport } from "next";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { PwaRegistration } from "@/components/pwa-registration";
import { BottomNav } from "@/components/bottom-nav";
import "./globals.css";
import "./app-ui.css";

export const metadata: Metadata = {
  title: "SPANDAN 4.0 | ASMC Firozabad",
  description: "The official festival space for ASMC Firozabad.",
  applicationName: "SPANDAN 4.0",
  appleWebApp: {
    capable: true,
    title: "SPANDAN 4.0",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/spandan-logo.png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/spandan-logo.png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#f6f5f1",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <body>
        <PwaRegistration />
        <PwaInstallPrompt />
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
