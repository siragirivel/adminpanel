"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { supabase } from "@/lib/supabase";

interface ManualPageClientProps {
  initialHtml?: string;
}

export function ManualPageClient({ initialHtml = "" }: ManualPageClientProps) {
  const router = useRouter();
  const [manualHtml, setManualHtml] = useState(initialHtml);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!mounted) {
          return;
        }

        if (!session) {
          router.replace("/");
          return;
        }

        const response = await fetch("/api/manual", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        });

        if (!response.ok) {
          router.replace("/");
          return;
        }

        const html = await response.text();

        if (!mounted) {
          return;
        }

        setManualHtml(html);
        setIsReady(true);
      } catch {
        if (mounted) {
          router.replace("/");
        }
      }
    };

    void checkSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT" || !session) {
        router.replace("/");
        return;
      }

      if (mounted) {
        setIsReady(true);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  if (!isReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fafaf8]">
        <LoadingSpinner label="Checking manual access..." />
      </main>
    );
  }

  return (
    <main className="relative h-screen w-full overflow-hidden bg-[#fafaf8]">
      <Link
        href="/dashboard"
        className="absolute right-4 top-4 z-10 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm backdrop-blur hover:bg-white"
      >
        Back to Admin Panel
      </Link>
      <iframe
        srcDoc={manualHtml}
        title="Sirigirvel User Manual"
        className="block h-full w-full border-0"
      />
    </main>
  );
}
