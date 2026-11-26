import type { Metadata } from "next";
import { headers } from "next/headers";
import { Manrope, Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-apple",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BharatMatrix — Evidence-grounded document intelligence",
  description:
    "Upload enterprise documents, ask questions across all of them at once, and get answers that show you exactly where they came from.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Set by middleware.ts; lets the inline theme script pass the CSP.
  const nonce = headers().get("x-nonce") ?? undefined;
  return (
    <html lang="en" className="dark">
      <head>
        {/*
          Sets data-theme before the first paint so a returning visitor
          who picked light mode never sees a flash of the dark default.
          Runs as a blocking inline script (not a useEffect) specifically
          to beat paint — this is the one place in the app a script tag
          is the right tool instead of a React effect.
        */}
        <script
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("bm-theme");if(t==="light"){document.documentElement.setAttribute("data-theme","light");}}catch(e){}})();`,
          }}
        />
      </head>
      <body
        className={`${manrope.variable} ${inter.variable} ${plexMono.variable} font-sans antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
