/**
 * ChartBlock — recharts (already a dependency) bar / line / area / pie / donut
 * for an idoc chart block. Colors come from the doc theme via CSS variables.
 */
import type { ReactElement } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Block } from '../idocTypes';

type ChartBlockT = Extract<Block, { type: 'chart' }>;

const PIE_COLORS = ['var(--idoc-accent)', 'var(--idoc-muted)', 'var(--idoc-text)', 'var(--idoc-border)', 'var(--idoc-accent)', 'var(--idoc-muted)', 'var(--idoc-text)', 'var(--idoc-border)'];
const PIE_OPACITY = [1, 0.85, 0.5, 1, 0.55, 0.45, 0.3, 0.7];
const AXIS = { stroke: 'var(--idoc-muted)', tick: { fill: 'var(--idoc-muted)', fontSize: 12 } };

export function ChartBlock({ block }: { block: ChartBlockT }) {
    const data = block.data.map((d) => ({ name: d.label, value: d.value }));
    if (!data.length) return <div className="scribe-idocs__placeholder">Chart (no data)</div>;
    const total = block.data.reduce((s, d) => s + d.value, 0);
    let chart: ReactElement;
    if (block.kind === 'pie' || block.kind === 'donut') {
        chart = (
            <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" outerRadius="80%" innerRadius={block.kind === 'donut' ? '55%' : 0} label={(p) => `${p.name}`} stroke="var(--idoc-surface)">
                    {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} fillOpacity={PIE_OPACITY[i % PIE_OPACITY.length]} />)}
                </Pie>
                <Tooltip />
            </PieChart>
        );
    } else if (block.kind === 'line') {
        chart = (
            <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="var(--idoc-border)" strokeDasharray="3 3" />
                <XAxis dataKey="name" {...AXIS} />
                <YAxis {...AXIS} width={36} />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke="var(--idoc-accent)" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--idoc-accent)' }} />
            </LineChart>
        );
    } else if (block.kind === 'area') {
        chart = (
            <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="var(--idoc-border)" strokeDasharray="3 3" />
                <XAxis dataKey="name" {...AXIS} />
                <YAxis {...AXIS} width={36} />
                <Tooltip />
                <Area type="monotone" dataKey="value" stroke="var(--idoc-accent)" strokeWidth={2} fill="var(--idoc-accent)" fillOpacity={0.25} />
            </AreaChart>
        );
    } else {
        chart = (
            <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="var(--idoc-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" {...AXIS} />
                <YAxis {...AXIS} width={36} />
                <Tooltip cursor={{ fill: 'var(--idoc-border)', fillOpacity: 0.4 }} />
                <Bar dataKey="value" fill="var(--idoc-accent)" radius={[4, 4, 0, 0]} />
            </BarChart>
        );
    }
    return (
        <figure className="scribe-idocs__chart" data-kind={block.kind}>
            {block.title && <figcaption className="scribe-idocs__chart-title">{block.title}</figcaption>}
            <div className="scribe-idocs__chart-box">
                <ResponsiveContainer width="100%" height="100%">{chart}</ResponsiveContainer>
            </div>
            {/* Data table fallback for a11y + print (charts don't print reliably). */}
            <table className="scribe-idocs__chart-data">
                <caption>{block.title || `${block.kind} chart`} — data</caption>
                <thead><tr><th>Label</th><th>Value</th>{(block.kind === 'pie' || block.kind === 'donut') && <th>Share</th>}</tr></thead>
                <tbody>{block.data.map((d, i) => (
                    <tr key={i}><td>{d.label}</td><td>{d.value}</td>{(block.kind === 'pie' || block.kind === 'donut') && <td>{total ? `${Math.round((d.value / total) * 100)}%` : '—'}</td>}</tr>
                ))}</tbody>
            </table>
        </figure>
    );
}
