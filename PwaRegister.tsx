"use client";

import { useEffect } from "react";

// Registers the service worker so the app is installable on the iPhone home
// screen and works with an app-like standalone experience.
export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* service worker is optional; the app works without it */
      });
    }
  }, []);
  return null;
}
