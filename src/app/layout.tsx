import type { Metadata } from "next";
import type { Viewport } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { PwaRegistrar } from "@/components/PwaRegistrar";

export const metadata: Metadata = {
  title: "Sirigirvel Workshop",
  description: "Advanced Workshop Management System for Sirigirvel Auto Services",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/Siragiri.ico", type: "image/x-icon" },
    ],
    apple: [
      { url: "/Siragiri.ico", type: "image/x-icon" },
    ],
    shortcut: "/Siragiri.ico",
  },
  openGraph: {
    title: "Sirigirvel Workshop",
    description: "Advanced Workshop Management System for Sirigirvel Auto Services",
    images: [
      {
        url: "/og-image.png",
        width: 512,
        height: 512,
        alt: "Sirigirvel Workshop Logo",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Sirigirvel Workshop",
    description: "Advanced Workshop Management System",
    images: ["/og-image.png"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Sirigirvel Workshop",
  },
};

export const viewport: Viewport = {
  themeColor: "#6366f1",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased font-sans">
        <PwaRegistrar />
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
