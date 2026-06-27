"use client";
import { useEffect } from "react";

// Adds a class to <body> when running inside the installed Android/iOS app
// (via Capacitor), so CSS can make the layout fill the real device width
// instead of staying capped at the desktop-browser-friendly 480px.
export default function NativeAppDetector() {
  useEffect(() => {
    if (typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.()) {
      document.body.classList.add("native-app");
    }
  }, []);

  return null;
}
