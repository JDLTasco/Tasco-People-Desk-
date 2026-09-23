import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import AuthSessionProvider from "@/components/AuthSessionProvider";
import NavBar from "@/components/NavBar";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Tasco People Desk",
  description: "Tasco Petroleum HR ticketing",
};

// Sets <html data-theme> before first paint, from whatever the viewer
// picked last time (localStorage), falling back to their OS preference --
// avoids a flash of the wrong theme that a useEffect-only approach in
// ThemeToggle can't prevent. Inline and synchronous on purpose.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("tpd-theme");
    var theme = stored === "dark" || stored === "light"
      ? stored
      : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.dataset.theme = theme;
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthSessionProvider>
          <NavBar />
          {children}
        </AuthSessionProvider>
      </body>
    </html>
  );
}
