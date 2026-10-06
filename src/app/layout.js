import "./globals.css";

import { AuthProvider } from "@/components/AuthGuard";

export const metadata = {
  title: "PRINT X Advertising POS",
  description: "Point of Sale system for Print X Advertising",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon.png", sizes: "256x256", type: "image/png" },
    ],
    apple: [
      { url: "/icon.png", sizes: "256x256", type: "image/png" },
    ],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
