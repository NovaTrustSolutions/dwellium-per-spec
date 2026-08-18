/**
 * ChartBlock — recharts (already a dependency) bar / line / pie for an idoc
 * chart block. Colors come from the doc theme via CSS variables.
 */
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Block } from '../idocTypes';

type ChartBlockT = Extract<Block, { type: 'chart' }>;

const PIE_COLORS = ['var(--idoc-accent)', 'var(--idoc-muted)', 'var(--idoc-text)', 'var(--idoc-border)', 'var(--idoc-accent)', 'var(--idoc-muted)', 'var(--idoc-text)', 'var(--idoc-border)'];
const PIE_OPACITY = [1, 0.85, 0.5, 1, 0.55, 0.45, 0.3, 0.7];

export function ChartBlock({ block }: { block: ChartBlockT }) {
    const data = block.data.map((d) => ({ name: d.label, value: d.value }));
    if (!data.length) return <div className="scribe-idocs__placeholder">Chart (no data)</div>;
    return (
        <figure className="scribe-idocs__chart" data-kind={block.kind}>
            {block.title && <figcaption className="scribe-idocs__chart-title">{block.title}</figcaption>}
            <div className="scribe-idocs__chart-box">
                <ResponsiveContainer width="100%" height="100%">
                    {block.kind === 'pie' ? (
                        <PieChart>
                            <Pie data={data} dataKey="value" nameKey="name" outerRadius="80%" label={(p) => `${p.name}`} stroke="var(--idoc-surface)">
                                {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} fillOpacity={PIE_OPACITY[i % PIE_OPACITY.length]} />)}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    ) : block.kind === 'line' ? (
                        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                            <CartesianGrid stroke="var(--idoc-border)" strokeDasharray="3 3" />
                            <XAxis dataKey="name" stroke="var(--idoc-muted)" tick={{ fill: 'var(--idoc-muted)', fontSize: 12 }} />
                            <YAxis stroke="var(--idoc-muted)" tick={{ fill: 'var(--idoc-muted)', fontSize: 12 }} width={36} />
                            <Tooltip />
                            <Line type="monotone" dataKey="value" stroke="var(--idoc-accent)" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--idoc-accent)' }} />
                        </LineChart>
                    ) : (
                        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                            <CartesianGrid stroke="var(--idoc-border)" strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" stroke="var(--idoc-muted)" tick={{ fill: 'var(--idoc-muted)', fontSize: 12 }} />
                            <YAxis stroke="var(--idoc-muted)" tick={{ fill: 'var(--idoc-muted)', fontSize: 12 }} width={36} />
                            <Tooltip cursor={{ fill: 'var(--idoc-border)', fillOpacity: 0.4 }} />
                            <Bar dataKey="value" fill="var(--idoc-accent)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    )}
                </ResponsiveContainer>
            </div>
            {/* Data table fallback for a11y + print (charts don't print reliably). */}
            <table className="scribe-idocs__chart-data">
                <thead><tr><th>Label</th><th>Value</th></tr></thead>
                <tbody>{block.data.map((d, i) => <tr key={i}><td>{d.label}</td><td>{d.value}</td></tr>)}</tbody>
            </table>
        </figure>
    );
}
