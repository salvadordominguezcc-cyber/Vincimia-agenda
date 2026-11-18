"use client";

import { useEffect } from "react";

// Registra el service worker para que la app sea instalable (PWA).
// Si el navegador no lo permite, no pasa nada: la app sigue funcionando.
export default function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
