import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { ColorThemeProvider } from "@/components/shared/color-theme-provider";
import { I18nProvider } from "@/lib/i18n/context";
import { getAppColorTheme } from "@/lib/app-config";
import { DEFAULT_COLOR_THEME } from "@/lib/color-theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "ECKCM Participant Portal - 중동부 연합 야영회 온라인 시스템",
  description:
    "Online registration and management system for ECKCM",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ECKCM",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const colorTheme = await getAppColorTheme();

  return (
    <html
      lang="en"
      suppressHydrationWarning
      {...(colorTheme !== DEFAULT_COLOR_THEME
        ? { "data-color-theme": colorTheme }
        : {})}
    >
      <head>
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-screen bg-background antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <ColorThemeProvider initialTheme={colorTheme}>
            <I18nProvider>
              {children}
            </I18nProvider>
          </ColorThemeProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
