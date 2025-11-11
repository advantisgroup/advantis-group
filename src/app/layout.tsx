import { Metadata } from "next"
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next'
import './global.css'
import { Toaster } from "@/components/ui/sonner";
import { Footer } from "@/components/Footer";
import { ThemeProvider } from "@/components/theme-provider";

// eslint-disable-next-line react-refresh/only-export-components
export const metadata: Metadata = {
    title: "Advantis Group GmbH",
    description: "Ganzheitliche Sales Power: von Marketingstrategie und Leadgenerierung über Akquise Support, Sales Trainings bis hin zur Implementierung von KI-Tools.",
    openGraph: {
        type: "website",
        url: "https://advantis-group.de",
        title: "Advantis Group GmbH",
        description: "Ihre Heimat für exzellenten Vertrieb",
        siteName: "Advantis Group",
    }
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="de" suppressHydrationWarning>
            <body className="bg-background">
                <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    enableSystem
                >
                    {children}
                    <Toaster />
                    <Footer />
                </ThemeProvider>
            </body>
        </html>
    )
}
