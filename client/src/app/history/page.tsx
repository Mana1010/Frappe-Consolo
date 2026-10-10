import type { Metadata } from "next";
import { HistoryPage } from "@/components/history/HistoryPage";

export const metadata: Metadata = { title: "History · Frappe script board" };

export default function History() {
  return <HistoryPage />;
}
