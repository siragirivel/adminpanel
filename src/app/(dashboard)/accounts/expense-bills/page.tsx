import { redirect } from "next/navigation";

export default function ExpenseBillsPage() {
  redirect("/daybook/history?view=expense-bills");
}
