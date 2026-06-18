/**
 * ClaudePlaybook — a Claude-drawn mini map for the Halocron OS home. Click the
 * Claude button to open it; a radial map of six high-leverage Claude phrases
 * fans out from a central "Claude" node. Click any node and its explanation
 * appears below. Portaled above the OS shell; click the backdrop or ✕ to close.
 */
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, X } from 'lucide-react';

interface PlayNode { phrase: string; explanation: string; }

const NODES: PlayNode[] = [
    {
        phrase: 'Launch sub agents',
        explanation: 'Forces Claude to run separate sessions in parallel rather than trying to handle everything sequentially in a single chat. Highly effective for getting multiple perspectives on a topic, tackling massive batch tasks, and speeding up independent workflows.',
    },
    {
        phrase: 'Write me an implementation spec',
        explanation: 'Instructs Claude to build a detailed plan or specification document before writing any code or executing a project. Laying out the steps and forcing Claude to outline its key decisions removes assumptions, preventing errors and ensuring it builds exactly what you want.',
    },
    {
        phrase: 'Interview me',
        explanation: 'Instead of struggling to write a perfect prompt, this phrase has Claude ask you the questions. It extracts critical details about the core problem, target audience, and key decisions, which Claude then packages into a complete implementation spec in minutes.',
    },
    {
        phrase: 'Verify before you build',
        explanation: 'Establishes a feedback loop to let Claude self-correct. Update your claude.md with a verification plan, enable testing tools, and define "human validation zones" for high-risk changes (like payments) where human sign-off is strictly required.',
    },
    {
        phrase: 'Based on this conversation build me a skill',
        explanation: 'Takes a process you just completed manually and packages it into a repeatable instruction folder. Grounding the skill in actual chat history and adding a "gotchas" section to capture edge cases ensures the skill compounds in quality over time.',
    },
    {
        phrase: 'Automate this',
        explanation: 'The most powerful yet dangerous phrase — fully automating tasks can create massive operational debt and AI slop if not done carefully. First run a "taste test" (does the task need subjective judgment?) and an "80/20 output analysis" (is an 80%-perfect output acceptable?) to choose between full automation and human augmentation.',
    },
];

export default function ClaudePlaybook({ onClose }: { onClose: () => void }) {
    const [selected, setSelected] = useState<number | null>(null);

    const cx = 450, cy = 300, r = 200;
    const pos = NODES.map((_, i) => {
        const a = ((-90 + i * (360 / NODES.length)) * Math.PI) / 180;
        return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
    });

    const body = (
        <div className="claude-pb" role="dialog" aria-label="Claude playbook" data-testid="claude-playbook" onClick={onClose}>
            <div className="claude-pb__panel" onClick={(e) => e.stopPropagation()}>
                <header className="claude-pb__hdr">
                    <span className="claude-pb__title"><Sparkles size={16} /> Claude playbook</span>
                    <button type="button" className="claude-pb__close" onClick={onClose} aria-label="Close Claude playbook"><X size={16} /></button>
                </header>

                <div className="claude-pb__map">
                    <svg viewBox="0 0 900 600" className="claude-pb__svg" preserveAspectRatio="xMidYMid meet" role="presentation">
                        {pos.map((p, i) => (
                            <line key={`l${i}`} x1={cx} y1={cy} x2={p.x} y2={p.y} className={`claude-pb__link ${selected === i ? 'on' : ''}`} />
                        ))}
                        <foreignObject x={cx - 70} y={cy - 34} width="140" height="68">
                            <div className="claude-pb__center"><Sparkles size={18} /> Claude</div>
                        </foreignObject>
                        {pos.map((p, i) => (
                            <foreignObject key={`n${i}`} x={p.x - 96} y={p.y - 32} width="192" height="64">
                                <button
                                    type="button"
                                    className={`claude-pb__node ${selected === i ? 'on' : ''}`}
                                    aria-pressed={selected === i}
                                    onClick={() => setSelected(i)}
                                >
                                    {NODES[i].phrase}
                                </button>
                            </foreignObject>
                        ))}
                    </svg>
                </div>

                <div className="claude-pb__detail" data-testid="claude-playbook-detail">
                    {selected === null ? (
                        <p className="claude-pb__hint">Click a node to see what it does.</p>
                    ) : (
                        <>
                            <h4 className="claude-pb__detail-title">“{NODES[selected].phrase}”</h4>
                            <p className="claude-pb__detail-body">{NODES[selected].explanation}</p>
                        </>
                    )}
                </div>
            </div>
        </div>
    );

    return typeof document !== 'undefined' ? createPortal(body, document.body) : body;
}
