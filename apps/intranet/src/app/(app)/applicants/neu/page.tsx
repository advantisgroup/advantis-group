import { redirect } from "next/navigation";

// The former "Neue Bewerber" tab — now a filter on the merged workbench.
export default function ApplicantsNeuPage() {
  redirect("/hr/list?status=neu");
}
