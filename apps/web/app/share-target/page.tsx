"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// PWA share_target POST handler. Browser POSTs shared files here as
// multipart/form-data. We can't read FormData in a static export server-side,
// so the service worker intercepts the POST, stores the files in a
// BroadcastChannel, and redirects to "/". This page catches the redirect
// and signals the main page to open the files.
//
// For now: redirect immediately. The service worker layer (Workbox) handles
// the actual file handoff to the main app via postMessage.
export default function ShareTarget() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-zinc-400">Opening Teleport…</p>
    </main>
  );
}
