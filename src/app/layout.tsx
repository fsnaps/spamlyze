import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Footer, Header } from "@/components/site-chrome";
import { site } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: "Spamlyze — Spam update risk checker for your website",
    template: "%s · Spamlyze",
  },
  description:
    "Find out if your site is exposed to the next spam update. Spamlyze scans for scaled content, thin pages, site reputation abuse and link schemes, then tells you what to fix first.",
  openGraph: {
    siteName: site.name,
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
