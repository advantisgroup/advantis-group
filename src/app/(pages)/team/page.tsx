'use client'

import { ScrollReveal } from '@/components/effects/ScrollReveal'
import { SectionDivider } from '@/components/layout/SectionDivider'

export default function Team() {
    const teamMembers = [
        {
            name: 'Andrea Reichl',
            role: 'Geschäftsführerin',
            initials: 'AR',
            bio: 'Sales-Enthusiastin, Strategin und Macherin. Mit über 15 Jahren Erfahrung im Vertrieb, Coaching und Unternehmensaufbau führt Andrea die advantis-group mit Leidenschaft, Pragmatismus und einem klaren Fokus auf Erfolg und Menschlichkeit.',
        },
        {
            name: 'Andrea Lautenbacher',
            role: 'Teamlead Inbound Sales',
            initials: 'AL',
        },
        {
            name: 'Jessica Blume',
            role: 'Teamlead Outbound Sales',
            initials: 'JB',
        },
        {
            name: 'Kaleb Daniel',
            role: 'IT Projektleiter',
            initials: 'KD',
        },
        {
            name: 'Morena Azzuro',
            role: 'HR Specialist',
            initials: 'MA',
        },
        {
            name: 'Sebastian Kämpfer',
            role: 'Online Marketing Manager',
            initials: 'SK',
        },
        {
            name: 'Sabine Sagasser',
            role: 'Coach und Trainerin',
            initials: 'SS',
        },
        {
            name: 'Martin Bergmüller',
            role: 'Datenschutzbeauftragter und Qualitätsmanager',
            initials: 'MB',
        },
        {
            name: '',
            role: '',
            initials: '',
        },
    ]

    return (
        <div className="min-h-screen relative overflow-hidden">
            {/* Subtle background pattern */}
            <div className="absolute inset-0 noise-texture pointer-events-none" />

            <main className="container mx-auto px-6 pt-32 pb-32 max-w-6xl relative">
                {/* Hero */}
                <ScrollReveal>
                    <section className="max-w-3xl mb-32">
                        <h1 className="text-7xl md:text-8xl font-medium tracking-tight mb-8">Unser Team</h1>
                        <p className="text-xl text-muted-foreground leading-relaxed">
                            Unterstützt von einem Netzwerk aus erfahrenen Vertriebsprofis, Trainern, Consultants und
                            Tech-Spezialisten – alle vereint durch eines: Sales ist unsere DNA.
                        </p>
                    </section>
                </ScrollReveal>

                <SectionDivider variant="dots" opacity={0.3} className="mb-24" />

                {/* Founder Section */}
                <ScrollReveal delay={200}>
                    <section className="mb-24">
                        <div className="grid md:grid-cols-12 gap-16">
                            <div className="md:col-span-4">
                                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-8">
                                    Führung
                                </h2>
                                <div className="w-32 h-32 rounded-full bg-primary/10 flex items-center justify-center text-3xl font-medium text-primary transition-all duration-300 hover:bg-primary/20 hover:scale-110">
                                    {teamMembers[0].initials}
                                </div>
                            </div>
                            <div className="md:col-span-8 space-y-4">
                                <div>
                                    <h3 className="text-3xl font-medium mb-2">{teamMembers[0].name}</h3>
                                    <p className="text-lg text-muted-foreground">{teamMembers[0].role}</p>
                                </div>
                                <p className="text-lg text-muted-foreground leading-relaxed">{teamMembers[0].bio}</p>
                            </div>
                        </div>
                    </section>
                </ScrollReveal>

                <SectionDivider variant="line" opacity={0.2} className="mb-24" />

                {/* Team Grid */}
                <section>
                    <ScrollReveal delay={100}>
                        <div className="grid md:grid-cols-12 gap-16 mb-12">
                            <div className="md:col-span-4">
                                <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                                    Das Team
                                </h2>
                            </div>
                        </div>
                    </ScrollReveal>

                    <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-px bg-border border border-border overflow-hidden rounded-sm">
                        {teamMembers.slice(1).map((member, index) => (
                            <ScrollReveal key={member.name || index} delay={index * 80}>
                                <div className="bg-card p-8 group hover:bg-card/90 transition-all duration-300 hover:scale-[1.02] hover:z-10 h-full">
                                    {member.initials && (
                                        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-xl font-medium text-primary mb-6 group-hover:bg-primary/15 group-hover:scale-110 transition-all duration-300">
                                            {member.initials}
                                        </div>
                                    )}
                                    <h3 className="text-lg font-medium mb-2">{member.name}</h3>
                                    <p className="text-sm text-muted-foreground">{member.role}</p>
                                </div>
                            </ScrollReveal>
                        ))}
                    </div>
                </section>
            </main>
        </div>
    )
}
