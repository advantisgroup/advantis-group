import { AnimatedButtonProps } from '@/types/contact'
import { Check, Loader2, X } from 'lucide-react'
import { Button } from './button'

export function AnimatedButton({
    buttonState,
    idleText,
    idleIcon: IdleIcon,
    type = 'submit',
    disabled = false,
}: AnimatedButtonProps) {
    return (
        <Button type={type} disabled={disabled} className="w-full relative overflow-hidden">
            <span className="relative flex items-center justify-center gap-2">
                {!(buttonState === 'loading') && idleText}

                {/* Idle Icon - flies away when transitioning */}
                <span
                    className={`inline-flex transition-all duration-500 ${
                        buttonState === 'idle' ? 'translate-x-0 opacity-100' : 'translate-x-12 opacity-0'
                    }`}
                >
                    <IdleIcon className="w-4 h-4" />
                </span>

                {/* Loading Spinner */}
                <span
                    className={`absolute transition-all duration-500 ${
                        buttonState === 'loading'
                            ? 'translate-x-0 opacity-100 scale-100'
                            : buttonState === 'idle'
                              ? '-translate-x-12 opacity-0 scale-50'
                              : 'translate-x-12 opacity-0 scale-50'
                    }`}
                >
                    <Loader2 className="w-4 h-4 animate-spin" />
                </span>

                {/* Success Checkmark */}
                <span
                    className={`absolute transition-all duration-500 ${
                        buttonState === 'success'
                            ? 'translate-x-0 opacity-100 scale-100'
                            : '-translate-x-12 opacity-0 scale-50'
                    }`}
                >
                    <Check className="w-5 h-5" />
                </span>

                {/* Error X with shake animation */}
                <span
                    className={`absolute transition-all duration-500 ${
                        buttonState === 'error'
                            ? 'translate-x-0 opacity-100 scale-100 animate-shake'
                            : '-translate-x-12 opacity-0 scale-50'
                    }`}
                >
                    <X className="w-5 h-5" />
                </span>
            </span>
        </Button>
    )
}
