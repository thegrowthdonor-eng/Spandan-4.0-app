import type { Metadata, Viewport } from "next";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { PwaRegistration } from "@/components/pwa-registration";
import { NavigationProgress } from "@/components/navigation-progress";
import { SessionNavigation } from "@/components/session-navigation";
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
      { url: "/spandan-logo.png", type: "image/png" },
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
        <NavigationProgress />
        <PwaRegistration />
        <PwaInstallPrompt />
        {children}
        <SessionNavigation />
      </body>
    </html>
  );
}
