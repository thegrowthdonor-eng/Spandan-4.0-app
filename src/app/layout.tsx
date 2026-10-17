import type { Metadata, Viewport } from "next";
import { AppSplash } from "@/components/app-splash";
import { InstalledAppNotificationPrompt } from "@/components/installed-app-notification-prompt";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { PwaRegistration } from "@/components/pwa-registration";
import { BottomNav } from "@/components/bottom-nav";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { createRequestClient } from "@/server/supabase/server";
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

async function hasAuthenticatedSession() {
  if (!hasPublicSupabaseConfiguration()) return false;

  try {
    const client = await createRequestClient();
    const { data } = await client.auth.getUser();
    return Boolean(data.user);
  } catch {
    return false;
  }
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const isAuthenticated = await hasAuthenticatedSession();

  return (
    <html lang="en-IN">
      <body>
        <AppSplash />
        <PwaRegistration />
        <InstalledAppNotificationPrompt isAuthenticated={isAuthenticated} />
        <PwaInstallPrompt />
        {children}
        <BottomNav isAuthenticated={isAuthenticated} />
      </body>
    </html>
  );
}
