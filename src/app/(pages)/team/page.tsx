import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BrandText } from "@/components/BrandText";

export default function Team() {
  const teamMembers = [
    {
      name: "Andrea Reichl",
      role: "Geschäftsführerin",
      initials: "AR",
      bio: "Sales-Enthusiastin, Strategin und Macherin. Mit über 15 Jahren Erfahrung im Vertrieb, Coaching und Unternehmensaufbau führt Andrea die advantis-group mit Leidenschaft, Pragmatismus und einem klaren Fokus auf Erfolg und Menschlichkeit.",
    },
    {
      name: "Andrea Lautenbacher",
      role: "Teamlead Inbound Sales",
      initials: "AL",
    },
    {
      name: "Jessica Blume",
      role: "Teamlead Outbound Sales",
      initials: "JB",
    },
    {
      name: "Kaleb Daniel",
      role: "IT Projektleiter",
      initials: "KD",
    },
    {
      name: "Morena Azzuro",
      role: "HR Specialist",
      initials: "MA",
    },
    {
      name: "Sebastian Kämpfer",
      role: "Online Marketing Manager",
      initials: "SK",
    },
    {
      name: "Sabine Sagasser",
      role: "Coach und Trainerin",
      initials: "SS",
    },
    {
      name: "Martin Bergmüller",
      role: "Datenschutzbeauftragter und Qualitätsmanager",
      initials: "MB",
    },
  ];

  return (
    <div className="min-h-screen">
      <Header />
      <main className="container mx-auto px-4 pt-24 pb-24 space-y-24">
        <section className="max-w-4xl mx-auto space-y-8 text-center">
          <h1 className="text-5xl md:text-7xl font-bold">
            Unser Team
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Unterstützt wird Andrea von einem Netzwerk aus erfahrenen Vertriebsprofis, Trainern, Consultants und Tech-Spezialisten – alle vereint durch eines: Sales ist unsere DNA.
          </p>
        </section>

        <section className="max-w-6xl mx-auto space-y-12">
          <Card className="border border-border">
            <CardHeader>
              <div className="flex flex-col md:flex-row items-center gap-8">
                <div className="w-32 h-32 rounded-full bg-primary/10 flex items-center justify-center text-4xl font-bold text-primary shrink-0">
                  {teamMembers[0].initials}
                </div>
                <div className="flex-1 text-center md:text-left">
                  <CardTitle className="text-3xl mb-2">{teamMembers[0].name}</CardTitle>
                  <CardDescription className="text-lg text-primary font-semibold mb-4">
                    {teamMembers[0].role}
                  </CardDescription>
                  <CardDescription className="text-base">{teamMembers[0].bio}</CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>

          <div className="border border-border">
            <div className="grid md:grid-cols-2 lg:grid-cols-4 divide-x divide-border">
              {teamMembers.slice(1).map((member, index) => (
                <Card key={index} className="border-0 rounded-none">
                  <CardHeader className="text-center">
                    <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center text-2xl font-bold text-primary mx-auto mb-4">
                      {member.initials}
                    </div>
                    <CardTitle className="text-xl">{member.name}</CardTitle>
                    <CardDescription>{member.role}</CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
