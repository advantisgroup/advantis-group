import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { Features } from "@/components/Features";
import { Services } from "@/components/Services";

export default function Page() {
  return (
    <div className="min-h-screen">
      <main className="pt-16 space-y-24 pb-24">
        <Hero />
        <Features />
        <Services />
      </main>
    </div>
  );
}
