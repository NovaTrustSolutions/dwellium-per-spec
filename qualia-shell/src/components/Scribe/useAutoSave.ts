import { useEffect, useRef } from 'react';
import { useScribeStore } from './scribeStore';

export function useAutoSave(filepath: string | null): void {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSavedRef = useRef('');

    useEffect(() => {
        if (!filepath) return;
        const file = useScribeStore.getState().openFiles.find((f) => f.filepath === filepath);
        if (!file || !file.dirty || file.content === lastSavedRef.current) return;

        if (timerRef.current) clearTimeout(timerRef.current);

        timerRef.current = setTimeout(() => {
            const current = useScribeStore.getState().openFiles.find((f) => f.filepath === filepath);
            if (!current || !current.dirty) return;
            lastSavedRef.current = current.content;
            void useScribeStore.getState().saveFile(filepath);
        }, 500);

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    });
}
