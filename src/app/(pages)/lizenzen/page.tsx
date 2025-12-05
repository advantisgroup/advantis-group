'use client'

import { useEffect, useState, useMemo } from 'react'

import Link from 'next/link'

import { ExternalLink, Scale, User, Package, Search, ChevronDown, ChevronUp, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { Input } from '@/components/ui/input'

interface LicenseInfo {
    licenses: string
    repository?: string
    publisher?: string
    email?: string
    url?: string
    path: string
    licenseFile?: string
}

type LicensesData = Record<string, LicenseInfo>

export default function LizenzenPage() {
    const [licenses, setLicenses] = useState<LicensesData | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [isPaused, setIsPaused] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [animationStarted, setAnimationStarted] = useState(false)
    const [expandedCard, setExpandedCard] = useState<string | null>(null)

    useEffect(() => {
        const fetchLicenses = async () => {
            try {
                const response = await fetch('/licenses.json')
                if (!response.ok) throw new Error('Failed to load licenses')
                const data = (await response.json()) as LicensesData
                setLicenses(data)
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load licenses')
            } finally {
                setIsLoading(false)
            }
        }
        void fetchLicenses()
    }, [])

    // Debounce animation start
    useEffect(() => {
        if (!isLoading && licenses) {
            const timer = setTimeout(() => {
                setAnimationStarted(true)
            }, 500)
            return () => clearTimeout(timer)
        }
    }, [isLoading, licenses])

    const licenseEntries = useMemo(() => {
        if (!licenses) return []
        const entries = Object.entries(licenses)

        if (!searchQuery.trim()) return entries

        const query = searchQuery.toLowerCase()
        return entries.filter(
            ([packageName, info]) =>
                packageName.toLowerCase().includes(query) ||
                info.licenses.toLowerCase().includes(query) ||
                info.publisher?.toLowerCase().includes(query)
        )
    }, [licenses, searchQuery])

    const totalCount = licenses ? Object.keys(licenses).length : 0
    const filteredCount = licenseEntries.length

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="space-y-4 text-center">
                    <div className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
                    <p className="text-muted-foreground">Lizenzen werden geladen...</p>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center space-y-4">
                    <p className="text-destructive">{error}</p>
                    <Link href="/" className="text-primary hover:underline">
                        Zurück zur Startseite
                    </Link>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen">
            <main className="container mx-auto px-4 pt-24 pb-12 space-y-12">
                {/* Header */}
                <section className="max-w-4xl mx-auto space-y-6 text-center">
                    <h1 className="text-5xl md:text-7xl font-bold">Lizenzen</h1>
                    <p className="text-muted-foreground text-lg">
                        Diese Website verwendet {totalCount} Open-Source-Pakete.
                        <br />
                        <span className="text-sm">
                            Fahren Sie mit der Maus über die Liste, um zu pausieren und zu scrollen.
                        </span>
                    </p>

                    {/* Search bar */}
                    <div className="max-w-md mx-auto relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            type="text"
                            placeholder="Pakete durchsuchen..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10"
                        />
                    </div>

                    {searchQuery && (
                        <p className="text-sm text-muted-foreground">
                            {filteredCount} von {totalCount} Paketen gefunden
                        </p>
                    )}
                </section>

                {/* Animated Credits Container */}
                <section className="relative max-w-4xl mx-auto">
                    {/* Gradient overlays for smooth fade effect */}
                    <div
                        className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-linear-to-b from-background to-transparent z-10 transition-opacity duration-500"
                        style={{ opacity: isPaused ? 0 : 1 }}
                    />
                    <div
                        className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-linear-to-t from-background to-transparent z-10 transition-opacity duration-500"
                        style={{ opacity: isPaused ? 0 : 1 }}
                    />

                    {/* Credits viewport */}
                    <div
                        className="relative h-[80vh] overflow-hidden"
                        onMouseEnter={() => setIsPaused(true)}
                        onMouseLeave={() => setIsPaused(false)}
                        style={{
                            maskImage:
                                'linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)',
                            WebkitMaskImage:
                                'linear-gradient(to bottom, transparent 0%, black 10%, black 90%, transparent 100%)',
                        }}
                    >
                        <div
                            className={`${isPaused ? 'overflow-y-auto' : 'overflow-hidden'} h-full scrollbar-custom`}
                            style={{
                                scrollbarWidth: 'auto',
                                scrollbarColor: 'hsl(var(--primary)) hsl(var(--muted))',
                            }}
                        >
                            <div
                                className="space-y-6 py-8 animate-scroll-up"
                                style={{
                                    animationPlayState:
                                        isPaused || !animationStarted || searchQuery || expandedCard
                                            ? 'paused'
                                            : 'running',
                                }}
                            >
                                {licenseEntries.map(([packageName, info]) => (
                                    <LicenseCard
                                        key={packageName}
                                        packageName={packageName}
                                        info={info}
                                        isExpanded={expandedCard === packageName}
                                        onToggle={() =>
                                            setExpandedCard(expandedCard === packageName ? null : packageName)
                                        }
                                    />
                                ))}

                                {/* Duplicate for seamless loop - only show when not searching */}
                                {!isPaused &&
                                    !searchQuery &&
                                    animationStarted &&
                                    licenseEntries.map(([packageName, info]) => (
                                        <LicenseCard
                                            key={`${packageName}-dup`}
                                            packageName={packageName}
                                            info={info}
                                            isExpanded={false}
                                            onToggle={() => {}}
                                        />
                                    ))}
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            {/* CSS Animation */}
            <style jsx>{`
                @keyframes scroll-up {
                    0% {
                        transform: translateY(0);
                    }
                    100% {
                        transform: translateY(-50%);
                    }
                }

                .animate-scroll-up {
                    animation: scroll-up 120s linear infinite;
                }

                .scrollbar-custom::-webkit-scrollbar {
                    width: 12px;
                }

                .scrollbar-custom::-webkit-scrollbar-track {
                    background: hsl(var(--muted));
                    border-radius: 6px;
                }

                .scrollbar-custom::-webkit-scrollbar-thumb {
                    background: hsl(var(--primary));
                    border-radius: 6px;
                }

                .scrollbar-custom::-webkit-scrollbar-thumb:hover {
                    background: hsl(var(--primary) / 0.8);
                }
            `}</style>
        </div>
    )
}

function LicenseCard({
    packageName,
    info,
    isExpanded,
    onToggle,
}: {
    packageName: string
    info: LicenseInfo
    isExpanded: boolean
    onToggle: () => void
}) {
    const [readme, setReadme] = useState<string | null>(null)
    const [isLoadingReadme, setIsLoadingReadme] = useState(false)
    const [readmeError, setReadmeError] = useState(false)

    const fetchReadme = async () => {
        if (!info.repository || readme !== null || isLoadingReadme) return

        setIsLoadingReadme(true)
        setReadmeError(false)

        try {
            // Extract owner and repo from GitHub URL
            const match = info.repository.match(/github\.com\/([^/]+)\/([^/]+)/)
            if (!match) {
                setReadmeError(true)
                return
            }

            const [, owner, repo] = match
            const cleanRepo = repo.replace(/\.git$/, '')

            // Try to fetch README from GitHub API
            const response = await fetch(`https://api.github.com/repos/${owner}/${cleanRepo}/readme`, {
                headers: {
                    Accept: 'application/vnd.github.v3.raw',
                },
            })

            if (!response.ok) {
                setReadmeError(true)
                return
            }

            const content = await response.text()
            setReadme(content)
        } catch {
            setReadmeError(true)
        } finally {
            setIsLoadingReadme(false)
        }
    }

    const handleClick = () => {
        if (!isExpanded && info.repository) {
            void fetchReadme()
        }
        onToggle()
    }

    const funnyMessages = [
        '🕵️ README.md has left the chat... probably on vacation.',
        '📝 This package is so mysterious, even its README is playing hide and seek!',
        '🤷 No README found. The developers probably communicate telepathically.',
        "🎭 README.md is currently unavailable. It's having an existential crisis.",
        '🌌 The README exists in a parallel universe we cannot access.',
        "🎪 This package is so cool, it doesn't need documentation!",
        '🦄 Legend says the README is guarded by a mythical creature.',
    ]

    const randomMessage = funnyMessages[Math.floor(Math.random() * funnyMessages.length)]

    return (
        <div
            className={`group relative border border-border/50 rounded-lg bg-card/50 backdrop-blur-sm hover:border-primary/50 hover:bg-card/80 transition-all duration-300 ${
                isExpanded ? 'border-primary/50' : ''
            }`}
        >
            <button onClick={handleClick} className="w-full p-5 text-left">
                {/* Package name */}
                <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <Package className="w-4 h-4 text-primary shrink-0" />
                        <h3 className="font-mono text-sm font-semibold truncate">{packageName}</h3>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {/* License badge */}
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                            <Scale className="w-3 h-3" />
                            <span>{info.licenses}</span>
                        </div>

                        {/* Expand icon */}
                        {info.repository && (
                            <div className="text-muted-foreground">
                                {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </div>
                        )}
                    </div>
                </div>

                {/* Info row */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                    {info.publisher && (
                        <div className="flex items-center gap-1.5">
                            <User className="w-3 h-3" />
                            <span>{info.publisher}</span>
                        </div>
                    )}

                    {info.repository && (
                        <div
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1.5 text-primary/80 hover:text-primary transition-colors"
                        >
                            <a href={info.repository} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="w-3 h-3 inline" />
                                <span className="ml-1">Repository</span>
                            </a>
                        </div>
                    )}

                    {info.url && !info.repository && (
                        <div
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1.5 text-primary/80 hover:text-primary transition-colors"
                        >
                            <a href={info.url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="w-3 h-3 inline" />
                                <span className="ml-1">Website</span>
                            </a>
                        </div>
                    )}
                </div>
            </button>

            {/* Expanded README section */}
            {isExpanded && (
                <div className="border-t border-border/50 p-5 bg-card/30">
                    {isLoadingReadme ? (
                        <div className="flex items-center justify-center py-8 text-muted-foreground">
                            <Loader2 className="w-5 h-5 animate-spin mr-2" />
                            <span>README wird geladen...</span>
                        </div>
                    ) : readmeError ? (
                        <div className="text-center py-8 text-muted-foreground space-y-2">
                            <p className="text-lg">🤔</p>
                            <p className="text-sm italic">{randomMessage}</p>
                        </div>
                    ) : readme ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none prose-headings:text-foreground prose-p:text-muted-foreground prose-a:text-primary prose-strong:text-foreground prose-code:text-foreground prose-pre:bg-muted prose-pre:text-foreground">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{readme}</ReactMarkdown>
                        </div>
                    ) : null}
                </div>
            )}
        </div>
    )
}
