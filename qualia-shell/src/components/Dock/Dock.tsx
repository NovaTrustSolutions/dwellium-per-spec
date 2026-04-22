import { useState, useRef, useCallback } from 'react';
import { useWindows } from '../../context/WindowContext';
import './Dock.css';

export default function Dock() {
    const { dockItems, windows, openWindow, restoreWindow, reorderDock } = useWindows();
    const [dragIndex, setDragIndex] = useState<number | null>(null);
    const [dropIndex, setDropIndex] = useState<number | null>(null);
    const dockRef = useRef<HTMLDivElement>(null);

    const handleDockClick = useCallback((component: string, label: string, icon: string) => {
        // Check if window for this component is already open
        const existing = windows.find(w => w.component === component);
        if (existing && existing.minimized) {
            restoreWindow(existing.id);
        } else {
            openWindow(component, label, icon);
        }
    }, [windows, openWindow, restoreWindow]);

    // Drag and drop
    const onDragStart = (e: React.DragEvent, index: number) => {
        setDragIndex(index);
        e.dataTransfer.effectAllowed = 'move';
        // Create a transparent drag image
        const ghost = document.createElement('div');
        ghost.style.opacity = '0';
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 0, 0);
        setTimeout(() => document.body.removeChild(ghost), 0);
    };

    const onDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDropIndex(index);
    };

    const onDrop = (e: React.DragEvent, toIndex: number) => {
        e.preventDefault();
        if (dragIndex !== null && dragIndex !== toIndex) {
            reorderDock(dragIndex, toIndex);
        }
        setDragIndex(null);
        setDropIndex(null);
    };

    const onDragEnd = () => {
        setDragIndex(null);
        setDropIndex(null);
    };

    return (
        <div className="dock-container">
            <div className="dock" ref={dockRef}>
                {dockItems.map((item, index) => {
                    const isOpen = windows.some(w => w.component === item.component);
                    const isMinimized = windows.some(w => w.component === item.component && w.minimized);
                    const isDragging = dragIndex === index;
                    const isDropTarget = dropIndex === index && dragIndex !== index;

                    return (
                        <button
                            key={item.id}
                            className={`dock__item ${isDragging ? 'dock__item--dragging' : ''} ${isDropTarget ? 'dock__item--drop-target' : ''}`}
                            draggable
                            onDragStart={e => onDragStart(e, index)}
                            onDragOver={e => onDragOver(e, index)}
                            onDrop={e => onDrop(e, index)}
                            onDragEnd={onDragEnd}
                            onClick={() => handleDockClick(item.component, item.label, item.icon)}
                            title={item.label}
                        >
                            <span className="dock__icon">{item.icon}</span>
                            <span className="dock__label">{item.label}</span>
                            {isOpen && <span className={`dock__indicator ${isMinimized ? 'dock__indicator--minimized' : ''}`} />}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
