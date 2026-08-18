/**
 * idocsTemplates — six built-in starter templates (property-management themed).
 * Stored as loose JSON constants; `docFromTemplate` runs them through
 * `normalizeDoc` so ids are fresh and every block is coerced. Users can also
 * flag any of their own docs `isTemplate` from the library.
 */
import { normalizeDoc } from './idocsAi';
import type { IDoc } from './idocTypes';

export interface BuiltinTemplate { id: string; title: string; description: string; doc: unknown }

const t = (type: string, rest: Record<string, unknown> = {}) => ({ type, ...rest });
const md = (s: string) => t('text', { md: s });
const call = (tone: string, s: string) => t('callout', { tone, md: s });

export const BUILTIN_TEMPLATES: readonly BuiltinTemplate[] = [
    {
        id: 'owner-monthly-report', title: 'Owner monthly report', description: 'Rent roll, occupancy, expenses, and next steps for a property owner.',
        doc: {
            title: 'Monthly Owner Report — {Property} — {Month}', description: 'What happened at your property this month and what we recommend next.', theme: 'slate', isTemplate: true,
            cards: [
                { title: 'At a glance', layout: 'hero', blocks: [
                    call('success', '**Collected 98% of scheduled rent** · Occupancy 96% · 3 work orders closed'),
                    t('boxes', { columns: 3, items: [{ title: 'Rent collected', md: '$24,300 of $24,800' }, { title: 'Occupancy', md: '23 / 24 units' }, { title: 'Net to owner', md: '$18,120', emphasis: true }] }),
                ] },
                { title: 'Income vs. expenses', layout: 'default', blocks: [
                    t('chart', { kind: 'bar', title: 'Last 6 months (net $k)', data: [{ label: 'Mar', value: 16.2 }, { label: 'Apr', value: 17.1 }, { label: 'May', value: 15.8 }, { label: 'Jun', value: 18.4 }, { label: 'Jul', value: 17.9 }, { label: 'Aug', value: 18.1 }] }),
                    t('table', { headers: ['Category', 'This month', 'Budget'], rows: [['Repairs & maintenance', '$1,940', '$2,000'], ['Utilities (common)', '$860', '$900'], ['Landscaping', '$450', '$450'], ['Management fee', '$1,984', '$1,984']] }),
                ] },
                { title: 'Leasing & occupancy', layout: 'default', blocks: [
                    t('funnel', { items: [{ label: 'Inquiries', value: 42 }, { label: 'Showings', value: 15 }, { label: 'Applications', value: 6 }, { label: 'Signed', value: 2 }] }),
                    md('Unit 4B turned in 9 days at **$1,650** (+4% over prior lease). One notice to vacate received for 30 Sept.'),
                ] },
                { title: 'Maintenance', layout: 'default', blocks: [
                    t('timeline', { items: [{ date: 'Aug 3', title: 'Water heater — Unit 2A', md: 'Replaced same day, $1,120.' }, { date: 'Aug 14', title: 'Roof leak — stairwell', md: 'Patched; full inspection scheduled.' }, { date: 'Aug 22', title: 'HVAC filters', md: 'Quarterly change, all units.' }] }),
                    call('warning', 'Roof inspection recommends re-sealing two seams before winter — estimate **$2,400**. Approval requested.'),
                ] },
                { title: 'Next month', layout: 'default', blocks: [
                    t('steps', { numbered: true, items: [{ title: 'Approve roof re-seal', md: 'Reply by the 5th to lock the vendor slot.' }, { title: 'Pre-lease unit 3C', md: 'Listing goes live 15 days before vacancy.' }, { title: 'Renewal offers', md: 'Three leases expire in Q4; proposals go out 90 days ahead.' }] }),
                    t('button', { label: 'Open owner portal', href: 'https://', variant: 'primary' }),
                ] },
            ],
        },
    },
    {
        id: 'move-in-guide', title: 'Move-in guide', description: 'Welcome packet for new residents: keys, utilities, rules, contacts, quiz.',
        doc: {
            title: 'Welcome home — Move-in guide', description: 'Everything a new resident needs in the first week.', theme: 'sunrise', isTemplate: true,
            cards: [
                { title: 'Welcome!', layout: 'hero', blocks: [md('We are glad you are here. This guide covers your first week — keys, utilities, house rules and who to call.'), call('info', 'Save this page — the **maintenance request link** and emergency numbers are at the end.')] },
                { title: 'Your first 48 hours', layout: 'default', blocks: [
                    t('steps', { numbered: true, items: [{ title: 'Pick up keys & fobs', md: 'Leasing office, 9–5. Bring photo ID.' }, { title: 'Set up utilities', md: 'Electric + gas in your name by day 1 (see next card).' }, { title: 'Complete the move-in inspection', md: 'Note every scratch on the form within 72 hours — it protects your deposit.' }, { title: 'Register vehicles & pets', md: 'Portal → My profile.' }] }),
                ] },
                { title: 'Utilities & services', layout: 'default', blocks: [
                    t('table', { headers: ['Service', 'Provider', 'How'], rows: [['Electric', 'City Power', 'Online — account # on lease'], ['Gas', 'MetroGas', 'Phone, 24h turn-on'], ['Internet', 'Any', 'Building is fibre-ready'], ['Water/trash', 'Included', '—']] }),
                    t('accordion', { items: [{ title: 'Where is my mailbox?', md: 'Lobby, box number = unit number. Keys are on your ring.' }, { title: 'Parcel lockers', md: 'Ground floor; you get a text code per delivery.' }] }),
                ] },
                { title: 'House rules', layout: 'default', blocks: [
                    t('boxes', { columns: 3, items: [{ title: 'Quiet hours', md: '10 pm – 7 am' }, { title: 'Trash', md: 'Chute on each floor; bulky items → dock' }, { title: 'Guests', md: '14 nights / month max' }, { title: 'Pets', md: 'Leashed in common areas' }, { title: 'Grill', md: 'Roof deck only' }, { title: 'Smoking', md: 'Not on premises' }] }),
                ] },
                { title: 'Quick check', layout: 'default', blocks: [
                    t('quiz', { question: 'By when must the move-in inspection form be returned?', options: ['24 hours', '72 hours', '30 days'], answerIndex: 1, explanation: '72 hours — after that, existing damage may be attributed to you.' }),
                ] },
                { title: 'Contacts', layout: 'default', blocks: [
                    t('columns', { columns: ['**Maintenance (non-urgent)**\nSubmit via portal — 48h response.', '**Emergency (24/7)**\nGas smell, flooding, no heat: call the emergency line on your fob tag.', '**Leasing office**\nMon–Fri 9–5, Sat 10–2.'] }),
                    t('button', { label: 'Submit a maintenance request', href: 'https://', variant: 'primary' }),
                ] },
            ],
        },
    },
    {
        id: 'vendor-onboarding', title: 'Vendor onboarding', description: 'Requirements, insurance, invoicing and SLAs for a new contractor.',
        doc: {
            title: 'Vendor onboarding — {Company}', description: 'How to work with us: paperwork, standards, invoicing, and response times.', theme: 'paper', isTemplate: true,
            cards: [
                { title: 'Welcome aboard', layout: 'hero', blocks: [md('Thanks for partnering with us. This packet gets you set up to receive work orders and get paid on time.'), t('toc')] },
                { title: 'Paperwork checklist', layout: 'default', blocks: [
                    t('steps', { numbered: false, items: [{ title: 'W-9', md: 'Signed and dated.' }, { title: 'Certificate of insurance', md: 'GL $1M/$2M, workers comp, us as additional insured.' }, { title: 'License', md: 'Trade license number + expiry.' }, { title: 'Direct deposit form', md: 'Voided cheque or bank letter.' }] }),
                    call('warning', 'No work orders are released until **all four** documents are on file.'),
                ] },
                { title: 'How work flows', layout: 'default', blocks: [
                    t('diagram', { mermaid: 'flowchart LR\n  A[Work order issued] --> B[Accept in 4h]\n  B --> C[Schedule w/ resident]\n  C --> D[Complete + photos]\n  D --> E[Invoice in 7 days]\n  E --> F[Paid net 30]' }),
                    t('table', { headers: ['Priority', 'Accept within', 'On site within'], rows: [['Emergency', '30 min', '2 hours'], ['Urgent', '4 hours', '24 hours'], ['Routine', '1 business day', '5 business days']] }),
                ] },
                { title: 'On-site standards', layout: 'default', blocks: [
                    t('boxes', { columns: 2, items: [{ title: 'Identify yourself', md: 'Company shirt or badge; knock, announce, wait.' }, { title: 'Photos', md: 'Before / after on every job — attached to the WO.' }, { title: 'Clean up', md: 'Leave it cleaner than you found it.' }, { title: 'Resident data', md: 'Never share phone numbers or unit access codes.' }] }),
                ] },
                { title: 'Invoicing & payment', layout: 'default', blocks: [
                    md('Invoices go through the vendor portal only — email invoices are not processed. Reference the **work-order number** on every line.'),
                    t('accordion', { items: [{ title: 'What if a job needs a change order?', md: 'Stop, photograph, and message the coordinator in the WO thread before proceeding.' }, { title: 'When am I paid?', md: 'Net 30 from an approved invoice; approved within 5 business days.' }] }),
                    t('button', { label: 'Open the vendor portal', href: 'https://', variant: 'primary' }),
                ] },
            ],
        },
    },
    {
        id: 'lease-renewal', title: 'Lease renewal proposal', description: 'Personalised renewal offer with options, market context, and next steps.',
        doc: {
            title: 'Your lease renewal — {Resident}, Unit {#}', description: 'Options for staying another year (or two).', theme: 'inherit', isTemplate: true,
            cards: [
                { title: 'We would love for you to stay', layout: 'hero', blocks: [md('Your current lease ends **{date}**. Below are your renewal options — pick one in the portal by **{deadline}**.'), call('success', 'Renewing residents skip the application fee and get first pick of upgrade slots.')] },
                { title: 'Your options', layout: 'default', blocks: [
                    t('table', { headers: ['Term', 'Monthly rent', 'Notes'], rows: [['12 months', '$1,725', 'Most popular'], ['18 months', '$1,700', 'Locks rate through winter'], ['24 months', '$1,680', 'Best value; one free carpet clean'], ['Month-to-month', '$1,950', 'Flexible; 30-day notice']] }),
                    t('quiz', { question: 'Which term includes a free carpet clean?', options: ['12 months', '18 months', '24 months'], answerIndex: 2, explanation: 'The 24-month term includes it.' }),
                ] },
                { title: 'Why this rate', layout: 'default', blocks: [
                    t('chart', { kind: 'bar', title: 'Comparable 1-bed rents nearby ($)', data: [{ label: 'Yours (new)', value: 1725 }, { label: 'Ave. A', value: 1790 }, { label: 'Elm Ct', value: 1810 }, { label: 'Park Pl', value: 1760 }] }),
                    md('Market for comparable units rose ~5% this year; your renewal is held to **+3%**.'),
                ] },
                { title: 'What is new this year', layout: 'default', blocks: [
                    t('boxes', { columns: 3, items: [{ title: 'Smart locks', md: 'Keyless entry, guest codes.' }, { title: 'Gym refresh', md: 'New cardio machines in Oct.' }, { title: 'Bike room', md: 'Secured, camera-monitored.' }] }),
                ] },
                { title: 'Next steps', layout: 'default', blocks: [
                    t('steps', { numbered: true, items: [{ title: 'Choose a term', md: 'Portal → Leases → Renew.' }, { title: 'E-sign', md: 'Takes about 3 minutes.' }, { title: 'Done', md: 'New rate starts on your renewal date; nothing else changes.' }] }),
                    t('button', { label: 'Renew now', href: 'https://', variant: 'primary' }),
                ] },
            ],
        },
    },
    {
        id: 'maintenance-sop', title: 'Maintenance SOP', description: 'Standard operating procedure for intake → triage → dispatch → close-out.',
        doc: {
            title: 'Maintenance SOP — Work-order lifecycle', description: 'How every request is triaged, dispatched, and closed.', theme: 'slate', isTemplate: true,
            cards: [
                { title: 'Purpose & scope', layout: 'hero', blocks: [md('This SOP covers all resident and inspection-generated maintenance requests across managed properties. Owner: Maintenance Coordinator. Reviewed quarterly.'), t('toc')] },
                { title: 'Priority matrix', layout: 'default', blocks: [
                    t('table', { headers: ['Priority', 'Examples', 'Response', 'Resolve'], rows: [['P1 Emergency', 'Gas, flood, no heat < 50°F, lock-out', '30 min', '24 h'], ['P2 Urgent', 'No hot water, fridge down, leak (contained)', '4 h', '72 h'], ['P3 Routine', 'Dripping tap, blind, cosmetic', '1 day', '10 days'], ['P4 Planned', 'Preventive, upgrades', 'Scheduled', 'Per plan']] }),
                    call('danger', 'P1 after hours → call the on-call tech directly. Never leave a P1 in the queue.'),
                ] },
                { title: 'The procedure', layout: 'default', blocks: [
                    t('steps', { numbered: true, items: [{ title: 'Intake', md: 'Log in the system within 1 hour; confirm unit, contact, entry permission, photos.' }, { title: 'Triage', md: 'Assign priority from the matrix; flag warranty / insurance items.' }, { title: 'Dispatch', md: 'In-house first; vendor if skill/parts require. Resident gets ETA text.' }, { title: 'Complete', md: 'Before/after photos, parts used, time on site.' }, { title: 'Close-out', md: 'Resident notified; satisfaction survey; invoice matched to WO.' }] }),
                    t('diagram', { mermaid: 'flowchart TD\n  A[Request] --> B{Emergency?}\n  B -->|Yes| C[On-call tech now]\n  B -->|No| D[Triage P2-P4]\n  D --> E[Dispatch]\n  E --> F[Complete + photos]\n  F --> G[Close + survey]' }),
                ] },
                { title: 'Entry & communication', layout: 'default', blocks: [
                    t('accordion', { items: [{ title: 'Notice to enter', md: '24 h written notice unless emergency or resident-requested same-day.' }, { title: 'Resident not home', md: 'Enter with permission on file; leave the door-hanger; photos of every room entered.' }, { title: 'Pets', md: 'Ask at intake; do not enter with an unsecured dog — reschedule.' }] }),
                ] },
                { title: 'Metrics we track', layout: 'default', blocks: [
                    t('chart', { kind: 'line', title: 'Median days to resolve (P3)', data: [{ label: 'Q1', value: 7.5 }, { label: 'Q2', value: 6.1 }, { label: 'Q3', value: 5.4 }, { label: 'Q4', value: 4.9 }] }),
                    t('boxes', { columns: 3, items: [{ title: 'First-time fix', md: 'Target ≥ 85%' }, { title: 'Survey score', md: 'Target ≥ 4.6 / 5' }, { title: 'Reopened WOs', md: 'Target ≤ 3%' }] }),
                ] },
                { title: 'Check your understanding', layout: 'default', blocks: [
                    t('quiz', { question: 'A resident reports no hot water at 6 pm. Priority?', options: ['P1 Emergency', 'P2 Urgent', 'P3 Routine'], answerIndex: 1, explanation: 'No hot water is P2 — respond within 4 hours, resolve within 72.' }),
                ] },
            ],
        },
    },
    {
        id: 'quarterly-business-review', title: 'Quarterly business review', description: 'Portfolio KPIs, wins, risks, and the plan for next quarter.',
        doc: {
            title: 'Q{n} Business Review — {Portfolio}', description: 'Performance, what moved the numbers, and next quarter\'s plan.', theme: 'midnight', isTemplate: true,
            cards: [
                { title: 'Headline', layout: 'hero', blocks: [
                    call('success', '**NOI up 6.2% QoQ.** Occupancy 95.4%, delinquency down to 1.1%, 41 renewals at +3.8% avg.'),
                    t('boxes', { columns: 4, items: [{ title: 'NOI', md: '$412k', emphasis: true }, { title: 'Occupancy', md: '95.4%' }, { title: 'Delinquency', md: '1.1%' }, { title: 'Renewal rate', md: '68%' }] }),
                ] },
                { title: 'Portfolio performance', layout: 'default', blocks: [
                    t('chart', { kind: 'line', title: 'Occupancy % by month', data: [{ label: 'Apr', value: 93.8 }, { label: 'May', value: 94.5 }, { label: 'Jun', value: 95.1 }, { label: 'Jul', value: 95.4 }, { label: 'Aug', value: 95.6 }, { label: 'Sep', value: 95.4 }] }),
                    t('chart', { kind: 'pie', title: 'Expense mix', data: [{ label: 'Payroll', value: 34 }, { label: 'R&M', value: 22 }, { label: 'Utilities', value: 18 }, { label: 'Marketing', value: 9 }, { label: 'Other', value: 17 }] }),
                ] },
                { title: 'Leasing funnel', layout: 'default', blocks: [
                    t('funnel', { items: [{ label: 'Leads', value: 620 }, { label: 'Tours', value: 210 }, { label: 'Applications', value: 96 }, { label: 'Approved', value: 71 }, { label: 'Moved in', value: 64 }] }),
                    md('Tour-to-app conversion improved to **46%** after the self-guided tour rollout. Lead volume dipped in September (seasonal).'),
                ] },
                { title: 'Wins & risks', layout: 'default', blocks: [
                    t('columns', { columns: ['**Wins**\n- Self-guided tours live at 6 sites\n- Vendor consolidation saved $18k\n- Resident app adoption 72%', '**Risks**\n- Insurance renewal +14% (Q4)\n- Two roofs past useful life\n- Payroll vacancy: 1 maintenance lead'] }),
                    call('warning', 'Insurance premium increase is the single largest headwind next quarter — shopping three carriers now.'),
                ] },
                { title: 'Next quarter plan', layout: 'default', blocks: [
                    t('timeline', { items: [{ date: 'Oct', title: 'Insurance rebid decision', md: 'Board approval by Oct 20.' }, { date: 'Nov', title: 'Roof replacements start', md: 'Sites 3 & 7, capital budget.' }, { date: 'Dec', title: 'Renewal campaign', md: '92 leases expiring Q1; offers out 90 days ahead.' }] }),
                    t('steps', { numbered: true, items: [{ title: 'Approve capex', md: 'Roofs + parking resurfacing.' }, { title: 'Hire maintenance lead', md: 'Offer out by Oct 15.' }, { title: 'Launch renewal incentives', md: 'Upgrade credits over rent concessions.' }] }),
                ] },
            ],
        },
    },
];

/** Clone a built-in template into a fresh, non-template IDoc (new ids, normalized). */
export function docFromTemplate(tpl: BuiltinTemplate): IDoc {
    const doc = normalizeDoc(tpl.doc);
    return { ...doc, isTemplate: false, analytics: { views: 0, cardSeconds: {} } };
}
