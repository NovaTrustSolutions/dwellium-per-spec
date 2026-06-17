/**
 * useToast — Lightweight toast notification hook for Strata modules.
 *
 * Usage:
 *   const { showToast, ToastContainer } = useToast();
 *   showToast('Saved!', 'success');
 *   // render <ToastContainer /> at end of component JSX
 */
import { useState, useCallback, useRef } from 'react';
import { Check, X, Info } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
    id: number;
    message: string;
    type: ToastType;
}

const TOAST_COLORS: Record<ToastType, { bg: string; border: string; text: string; icon: React.ReactNode }> = {
    success: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', text: '#22c55e', icon: <Check size={16} aria-hidden /> },
    error: { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', text: '#ef4444', icon: <X size={16} aria-hidden /> },
    info:    { bg: 'color-mix(in srgb, var(--accent) 12%, transparent)',  border: 'color-mix(in srgb, var(--accent) 30%, transparent)', text: '#D6FE51', icon: <Info size={16} aria-hidden /> },
};

export function useToast(autoHideMs = 3500) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const idRef = useRef(0);

    const showToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = ++idRef.current;
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, autoHideMs);
    }, [autoHideMs]);

    const ToastContainer = useCallback(() => {
        if (toasts.length === 0) return null;
        return (
            <div style={{
                position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
                display: 'flex', flexDirection: 'column', gap: 8,
                pointerEvents: 'none',
            }}>
                {toasts.map(t => {
                    const c = TOAST_COLORS[t.type];
                    return (
                        <div key={t.id} style={{
                            padding: '10px 16px', borderRadius: 8,
                            background: c.bg, border: `1px solid ${c.border}`,
                            backdropFilter: 'blur(12px)',
                            color: c.text, fontSize: 13, fontWeight: 600,
                            display: 'flex', alignItems: 'center', gap: 8,
                            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                            animation: 'toast-in 0.25s ease-out',
                            pointerEvents: 'auto', maxWidth: 380,
                        }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', lineHeight: 1, flexShrink: 0 }}>{c.icon}</span>
                            {t.message}
                        </div>
                    );
                })}
                <style>{`@keyframes toast-in { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }`}</style>
            </div>
        );
    }, [toasts]);

    return { showToast, ToastContainer };
}
