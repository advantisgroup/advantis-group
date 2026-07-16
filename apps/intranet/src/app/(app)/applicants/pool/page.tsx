import { redirect } from "next/navigation";

// The former "Bewerberpool" tab — now a filter on the merged workbench.
export default function ApplicantsPoolPage() {
  redirect("/applicants/list?status=pool");
}
