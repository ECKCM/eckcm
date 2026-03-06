import type { Metadata, Viewport } from "next";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { ColorThemeProvider } from "@/components/shared/color-theme-provider";
import { I18nProvider } from "@/lib/i18n/context";
import { getAppColorTheme } from "@/lib/app-config";
import { DEFAULT_COLOR_THEME } from "@/lib/color-theme";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
const ogImage = `${siteUrl}/images/og-image.jpg`;

export const metadata: Metadata = {
  title: "My ECKCM - 중동부 연합 야영회 Portal",
  description:
    "Online registration and management system for Eastern Korean Churches Camp Meeting (ECKCM)",
  manifest: "/manifest.json",
  metadataBase: new URL(siteUrl),
  openGraph: {
    type: "website",
    siteName: "My ECKCM",
    title: "My ECKCM - 중동부 연합 야영회 Portal",
    description:
      "Online registration and management system for Eastern Korean Churches Camp Meeting (ECKCM)",
    url: siteUrl,
    locale: "en_US",
    images: [
      {
        url: ogImage,
        width: 1200,
        height: 630,
        alt: "ECKCM - Eastern Korean Churches Camp Meeting",
        type: "image/jpeg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "My ECKCM - 중동부 연합 야영회 Portal",
    description:
      "Online registration and management system for Eastern Korean Churches Camp Meeting (ECKCM)",
    images: [ogImage],
  },
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
