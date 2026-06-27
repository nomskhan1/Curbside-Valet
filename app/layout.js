import "./globals.css";
import NativeAppDetector from "./NativeAppDetector";

export const metadata = {
  title: "Integral Valet",
  description: "Request and manage valet vehicle pickups.",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <NativeAppDetector />
        {children}
      </body>
    </html>
  );
}
