import type { Metadata } from "next";
import localFont from "next/font/local";
import { Playfair_Display } from "next/font/google";
import "./globals.css";

const aeonik = localFont({
  variable: "--font-sans",
  src: [
    { path: "./fonts/aeonik/Aeonik-Regular.otf", weight: "400", style: "normal" },
    { path: "./fonts/aeonik/Aeonik-Medium.otf", weight: "500", style: "normal" },
    { path: "./fonts/aeonik/Aeonik-Bold.otf", weight: "700", style: "normal" },
    { path: "./fonts/aeonik/Aeonik-Black.otf", weight: "900", style: "normal" },
  ],
});

const playfair = Playfair_Display({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["600", "700"],
});

export const metadata: Metadata = {
  title: "BillFixr",
  description: "AI-powered medical bill review and negotiation.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${aeonik.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
