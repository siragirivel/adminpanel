"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function GlobalManualShortcut() {
  const pathname = usePathname();

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "u") {
        event.preventDefault();
        if (pathname !== "/manual") {
          window.location.href = "/manual";
        }
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [pathname]);

  return null;
}
