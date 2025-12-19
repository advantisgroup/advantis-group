'use client'

import { useState } from 'react'

import { ShapeParticles } from '@/components/effects/ShapeParticles'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export default function ParticleDemo() {
    const [selectedShape, setSelectedShape] = useState<'diamond' | 'circle' | 'square' | 'wave'>('diamond')

    const shapes = [
        { id: 'diamond' as const, label: 'Diamond', description: 'Classic diamond formation' },
        { id: 'circle' as const, label: 'Circle', description: 'Circular particle arrangement' },
        { id: 'square' as const, label: 'Square', description: 'Square boundary formation' },
        { id: 'wave' as const, label: 'Wave', description: 'Flowing wave pattern' },
    ]

    return (
        <div className="min-h-screen bg-background">
            <main className="container mx-auto px-4 py-24">
                <div className="max-w-6xl mx-auto space-y-12">
                    <div className="text-center space-y-4">
                        <h1 className="text-5xl font-bold">Interactive Particle Shapes</h1>
                        <p className="text-xl text-muted-foreground">
                            Move your mouse over the particles to interact with them
                        </p>
                    </div>

                    {/* Particle Display */}
                    <Card className="relative overflow-hidden">
                        <div className="h-[500px] relative">
                            <ShapeParticles shape={selectedShape} particleCount={150} className="w-full h-full" />

                            {/* Center text */}
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="text-center space-y-4 max-w-2xl px-8">
                                    <h2 className="text-4xl font-bold">
                                        {shapes.find((s) => s.id === selectedShape)?.label}
                                    </h2>
                                    <p className="text-lg text-muted-foreground">
                                        {shapes.find((s) => s.id === selectedShape)?.description}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* Shape Selector */}
                    <div className="flex justify-center gap-4 flex-wrap">
                        {shapes.map((shape) => (
                            <Button
                                key={shape.id}
                                variant={selectedShape === shape.id ? 'default' : 'outline'}
                                onClick={() => setSelectedShape(shape.id)}
                                size="lg"
                            >
                                {shape.label}
                            </Button>
                        ))}
                    </div>
                </div>
            </main>
        </div>
    )
}
