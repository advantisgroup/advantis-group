import { AppGate } from "@/components/layout/AppGate";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppGate>{children}</AppGate>;
}
