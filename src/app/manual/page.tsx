import type { Metadata } from "next";
import { ManualPageClient } from "@/components/ManualPageClient";

export const metadata: Metadata = {
  title: "Sirigirvel Manual",
  description: "Sirigirvel workshop user manual",
};

export const dynamic = "force-dynamic";

export default function ManualPage() {
  return <ManualPageClient />;
}
