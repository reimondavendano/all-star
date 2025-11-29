import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AllStar Tech - Fiber Internet Service Provider",
  description: "Next-Generation Fiber Internet Service Provider. Lightning-fast connectivity with 99.9% uptime and technical support.",
  keywords: ["fiber internet", "ISP", "internet service provider", "high-speed internet", "allstar tech"],
  authors: [{ name: "AllStar Tech" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://all-star-three.vercel.app",
    siteName: "AllStar Tech",
    title: "AllStar Tech - Fiber Internet Service Provider",
    description: "Next-Generation Fiber Internet Service Provider. Lightning-fast connectivity with 99.9% uptime and technical support.",
    images: [
      {
        url: "https://all-star-three.vercel.app/og-image.png",
        width: 1200,
        height: 630,
        alt: "AllStar Tech - Fiber Internet Service Provider",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AllStar Tech - Fiber Internet Service Provider",
    description: "Next-Generation Fiber Internet Service Provider. Lightning-fast connectivity with 99.9% uptime and technical support.",
    images: ["https://all-star-three.vercel.app/og-image.png"],
  },
  icons: {
    icon: "/logo/allstars.png",
    apple: "/logo/allstars.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Additional Open Graph tags for better Facebook sharing */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://all-star-three.vercel.app" />
        <meta property="og:title" content="AllStar Tech - Fiber Internet Service Provider" />
        <meta property="og:description" content="Next-Generation Fiber Internet Service Provider. Lightning-fast connectivity with 99.9% uptime and technical support." />
        <meta property="og:image" content="https://all-star-three.vercel.app/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="AllStar Tech - Fiber Internet Service Provider" />

        {/* Facebook specific */}
        <meta property="fb:app_id" content="your-facebook-app-id" />

        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="AllStar Tech - Fiber Internet Service Provider" />
        <meta name="twitter:description" content="Next-Generation Fiber Internet Service Provider. Lightning-fast connectivity with 99.9% uptime and technical support." />
        <meta name="twitter:image" content="https://all-star-three.vercel.app/og-image.png" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
