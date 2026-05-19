import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "סריקת מימוש כרטיסים",
  description: "מערכת מימוש כרטיסים לצוות — סריקה מהירה מהנייד",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "מימוש",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d1117",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <a className="skip-link" href="#main-content">
          דלג לתוכן הראשי
        </a>
        {children}
      </body>
    </html>
  );
}
