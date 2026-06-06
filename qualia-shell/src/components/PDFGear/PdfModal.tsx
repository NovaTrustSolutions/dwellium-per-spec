/**
 * PdfModal — styled, accessible replacements for window.prompt used across
 * PDFGear's parameter-entry tools (n-up value, scale, split size, watermark
 * text, metadata, page ranges, …) plus a read-only info/results modal
 * (Get Info, Compare, extracted text / OCR preview).
 *
 * Keyboard: first field autofocuses, Enter submits, Esc closes. Backdrop click
 * closes. No external deps beyond lucide for the close glyph.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

export interface PdfField {
    name: string;
    label: string;
    type?: 'text' | 'number' | 'textarea' | 'select' | 'color';
    defaultValue?: string;
    placeholder?: string;
    options?: Array<{ value: string; label: string }>;
    help?: string;
    min?: number;
    max?: number;
    step?: number;
}

export interface PdfFieldModalProps {
    title: string;
    fields: PdfField[];
    submitLabel?: string;
    onSubmit: (values: Record<string, string>) => void;
    onClose: () => void;
}

export function PdfFieldModal({ title, fields, submitLabel = 'Apply', onSubmit, onClose }: PdfFieldModalProps) {
    const [values, setValues] = useState<Record<string, string>>(() => {
        const init: Record<string, string> = {};
        fields.forEach((f) => (init[f.name] = f.defaultValue ?? (f.type === 'color' ? '#000000' : '')));
        return init;
    });
    const firstRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);

    useEffect(() => {
        firstRef.current?.focus();
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const submit = () => onSubmit(values);

    return (
        <div className="pdfg-modal__backdrop" onMouseDown={onClose}>
            <div
                className="pdfg-modal"
                role="dialog"
                aria-modal="true"
                aria-label={title}
                onMouseDown={(e) => e.stopPropagation()}
            >
                <div className="pdfg-modal__head">
                    <h3 className="pdfg-modal__title">{title}</h3>
                    <button className="pdfg-modal__close" onClick={onClose} aria-label="Close">
                        <X size={16} aria-hidden="true" />
                    </button>
                </div>
                <form
                    className="pdfg-modal__body"
                    onSubmit={(e) => {
                        e.preventDefault();
                        submit();
                    }}
                >
                    {fields.map((f, i) => {
                        const common = {
                            id: `pdfg-f-${f.name}`,
                            value: values[f.name],
                            placeholder: f.placeholder,
                            onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
                                setValues((v) => ({ ...v, [f.name]: e.target.value })),
                        };
                        return (
                            <label key={f.name} className="pdfg-modal__field">
                                <span className="pdfg-modal__label">{f.label}</span>
                                {f.type === 'textarea' ? (
                                    <textarea
                                        {...common}
                                        ref={i === 0 ? (firstRef as React.RefObject<HTMLTextAreaElement>) : undefined}
                                        rows={4}
                                    />
                                ) : f.type === 'select' ? (
                                    <select {...common} ref={i === 0 ? (firstRef as React.RefObject<HTMLSelectElement>) : undefined}>
                                        {f.options?.map((o) => (
                                            <option key={o.value} value={o.value}>
                                                {o.label}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        {...common}
                                        ref={i === 0 ? (firstRef as React.RefObject<HTMLInputElement>) : undefined}
                                        type={f.type === 'number' ? 'number' : f.type === 'color' ? 'color' : 'text'}
                                        min={f.min}
                                        max={f.max}
                                        step={f.step}
                                    />
                                )}
                                {f.help && <span className="pdfg-modal__help">{f.help}</span>}
                            </label>
                        );
                    })}
                    <div className="pdfg-modal__actions">
                        <button type="button" className="pdfg-modal__btn" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="pdfg-modal__btn pdfg-modal__btn--primary">
                            {submitLabel}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export interface PdfInfoModalProps {
    title: string;
    rows?: Array<{ label: string; value: string }>;
    children?: ReactNode;
    onClose: () => void;
}

export function PdfInfoModal({ title, rows, children, onClose }: PdfInfoModalProps) {
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="pdfg-modal__backdrop" onMouseDown={onClose}>
            <div className="pdfg-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
                <div className="pdfg-modal__head">
                    <h3 className="pdfg-modal__title">{title}</h3>
                    <button className="pdfg-modal__close" onClick={onClose} aria-label="Close">
                        <X size={16} aria-hidden="true" />
                    </button>
                </div>
                <div className="pdfg-modal__body">
                    {rows && (
                        <dl className="pdfg-modal__info">
                            {rows.map((r) => (
                                <div key={r.label} className="pdfg-modal__info-row">
                                    <dt>{r.label}</dt>
                                    <dd>{r.value}</dd>
                                </div>
                            ))}
                        </dl>
                    )}
                    {children}
                    <div className="pdfg-modal__actions">
                        <button type="button" className="pdfg-modal__btn pdfg-modal__btn--primary" onClick={onClose}>
                            Done
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
