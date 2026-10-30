import type { Metadata } from "next";
import localFont from "next/font/local";
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

// Self-hosted rather than next/font/google. Fetching it from Google at
// build time meant every build — including every CI run — depended on
// reaching fonts.gstatic.com, and a single hiccup there failed the build
// with a module-not-found on the generated font CSS. Nothing about the
// font was wrong; the network was.
//
// This is the exact file Google was serving (latin subset, v40), so the
// rendering is unchanged. It is one file because Playfair Display is a
// variable font: Google served the same woff2 for weight 600 and 700 and
// let the browser interpolate, which is also why the declared range is
// the axis the file really carries (400-900) rather than the two weights
// the design happens to use. Playfair Display is OFL-1.1, which permits
// this — the licence ships beside it.
const playfair = localFont({
  variable: "--font-serif",
  src: "./fonts/playfair-display/PlayfairDisplay-latin-variable.woff2",
  weight: "400 900",
  style: "normal",
  display: "swap",
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
