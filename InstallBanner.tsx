"use client";

import { useEffect, useState } from "react";

// Shows how to pin TradeMind to an iPhone Home Screen once you are on a
// real public https URL (Railway / your VPS). Hidden when already installed.
export default function InstallBanner() {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in window.navigator && Boolean((window.navigator as { standalone?: boolean }).standalone));
    if (standalone) return;
    const isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    setIos(isIos);
    const dismissed = window.localStorage.getItem("tm-install-dismissed");
    if (!dismissed) setShow(true);
  }, []);

  if (!show) return null;

  return (
    <div className="border-b border-emerald-900/60 bg-emerald-950/80 px-4 py-2 text-center text-xs text-emerald-100">
      {ios ? (
        <span>
          Add this to your Home Screen: tap <span className="font-semibold">Share</span> (the square with an arrow) then{" "}
          <span className="font-semibold">Add to Home Screen</span>.
        </span>
      ) : (
        <span>
          On iPhone, open this site in Safari → Share → Add to Home Screen. On desktop, keep this tab pinned — the AI
          runs on the server even if you close it.
        </span>
      )}
      <button
        className="ml-3 text-emerald-300 underline"
        onClick={() => {
          window.localStorage.setItem("tm-install-dismissed", "1");
          setShow(false);
        }}
      >
        Dismiss
      </button>
    </div>
  );
}
