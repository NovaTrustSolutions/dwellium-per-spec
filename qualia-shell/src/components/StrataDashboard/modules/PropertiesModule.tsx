import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Building2, MapPin, Home, Plus, X, ChevronRight, ChevronDown,
    RefreshCw, Wrench, LayoutGrid, List, Table2, User, Mail, Phone,
    DollarSign, Shield, Globe, Calendar, FileText, AlertTriangle,
    Clock, Dog, Car, ChevronUp, Landmark, CreditCard, StickyNote,
    History, Paperclip, TrendingUp, Settings2, Megaphone, PieChart,
    Scale, BookOpen, Camera, Upload, Image as ImageIcon, Send, Trash2, ListChecks,
    Link2, ClipboardCheck, Search, Archive, ArchiveRestore, Power
} from 'lucide-react';
import { useUser } from '../../../context/UserContext';
import { strataGet, strataPost, strataPut, strataDelete } from '../strataApi';
import { useProperties, useUnits, useEntities, useLinkedData, useModuleConfig, useStrataInvalidate, strataKeys } from '../useStrataQueries';
import { useQueryClient } from '@tanstack/react-query';
import type { Property, Unit, EntityProfile, Workitem, PurchaseHistory, LateFeePolicy, MaintenanceConfig, FixedAsset } from '../strataTypes';
import { LoadingState, ErrorState } from '../StateView';
import TrelloCardModal from './TrelloCardModal';
import ProfileSpaces from './ProfileSpaces';
import PropertyOverview from './PropertyOverview';
import UtilitiesModule from './UtilitiesModule';
import VehiclesPanel from './VehiclesPanel';
import InsuranceModule from './InsuranceModule';
import { ErrorBoundary } from '../../ErrorBoundary/ErrorBoundary';
import { Sentry } from '../../../services/sentry';
import FixedAssetsTable from './__properties/FixedAssetsTable';
import { useStrataNav } from '../StrataNavContext';

interface LinkedData {
    workitems: Workitem[];
    legal: Workitem[];
    compliance: Workitem[];
    incidents: any[];
    entityLinks: any[];
    summary: { workitems: number; legal: number; compliance: number; incidents: number; entityLinks: number; total: number };
}

type View = 'list' | 'detail';
type CardView = 'grid' | 'rows' | 'table';
type StatusFilter = 'all' | 'active' | 'inactive' | 'archived';
type WorkspaceTab = 'overview' | 'info' | 'units' | 'work' | 'documents' | 'budget' | 'marketing' | 'comparables' | 'showing-settings' | string;

const CORE_TABS: WorkspaceTab[] = ['overview', 'info', 'units', 'work', 'documents', 'budget', 'marketing', 'comparables', 'showing-settings'];

interface ModuleRegistryEntry {
    key: string;
    label: string;
    icon: string;
    defaultEnabled: boolean;
    component: React.ComponentType<{ propertyId: string }>;
}

/* Lightweight placeholder modules for optional tabs that don't have dedicated components yet */
function ResidentsPlaceholder({ propertyId }: { propertyId: string }) {
    return <div className="s-glass-card" style={{ padding: '24px 20px', textAlign: 'center', color: '#94a3b8' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>👥</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>Residents</div>
        <div style={{ fontSize: 12 }}>View and manage residents for this property in the Residents module.</div>
    </div>;
}
function LegalPlaceholder({ propertyId }: { propertyId: string }) {
    return <div className="s-glass-card" style={{ padding: '24px 20px', textAlign: 'center', color: '#94a3b8' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>⚖️</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>Legal Issues</div>
        <div style={{ fontSize: 12 }}>Legal workitems for this property appear in the Work tab under the Legal domain filter.</div>
    </div>;
}
function IncidentsPlaceholder({ propertyId }: { propertyId: string }) {
    return <div className="s-glass-card" style={{ padding: '24px 20px', textAlign: 'center', color: '#94a3b8' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🚨</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>Incidents</div>
        <div style={{ fontSize: 12 }}>Incident logs linked to this property.</div>
    </div>;
}

/* ── Task 3.3 — AppFolio property-detail tab parity (v1 L168). Stubs only;
 * Phase-5 wires real content. Mirror the L52-72 placeholder byte-shape
 * line-for-line: s-glass-card / 24px 20px padding / centered / #94a3b8 text /
 * 32px emoji / 14px title bold / 12px body. data-testid on the root div
 * carries the per-tab content anchor used by render tests + CDP probe. ── */
export function BudgetPlaceholder({ propertyId }: { propertyId: string }) {
    return <div className="s-glass-card" data-testid="property-tab-content-budget" style={{ padding: '24px 20px', textAlign: 'center', color: '#94a3b8' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>💰</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>Budget</div>
        <div style={{ fontSize: 12 }}>Budget tab — property-level budget tracking will land in Phase 5 (P&amp;L, variance vs forecast, vendor spend rollup).</div>
    </div>;
}
export function MarketingPlaceholder({ propertyId }: { propertyId: string }) {
    return <div className="s-glass-card" data-testid="property-tab-content-marketing" style={{ padding: '24px 20px', textAlign: 'center', color: '#94a3b8' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📣</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>Marketing</div>
        <div style={{ fontSize: 12 }}>Marketing tab — listing syndication, photo management, and campaign ROI will land in Phase 5.</div>
    </div>;
}
export function ComparablesPlaceholder({ propertyId }: { propertyId: string }) {
    return <div className="s-glass-card" data-testid="property-tab-content-comparables" style={{ padding: '24px 20px', textAlign: 'center', color: '#94a3b8' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>📊</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>Comparables</div>
        <div style={{ fontSize: 12 }}>Comparables tab — comparable property data, sales/rent comps, and market-band positioning will land in Phase 5.</div>
    </div>;
}
export function ShowingSettingsPlaceholder({ propertyId }: { propertyId: string }) {
    return <div className="s-glass-card" data-testid="property-tab-content-showing-settings" style={{ padding: '24px 20px', textAlign: 'center', color: '#94a3b8' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🗓️</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>Showing Settings</div>
        <div style={{ fontSize: 12 }}>Showing Settings tab — showing schedule, agent access, and self-tour configuration will land in Phase 5.</div>
    </div>;
}

const MODULE_REGISTRY: ModuleRegistryEntry[] = [
    { key: 'vehicles', label: 'Vehicles', icon: '🚗', defaultEnabled: false, component: VehiclesPanel as any },
    { key: 'utilities', label: 'Utilities', icon: '⚡', defaultEnabled: false, component: UtilitiesModule },
    { key: 'insurance', label: 'Insurance', icon: '🛡️', defaultEnabled: false, component: InsuranceModule },
    { key: 'residents', label: 'Residents', icon: '👥', defaultEnabled: false, component: ResidentsPlaceholder },
    { key: 'legal', label: 'Legal', icon: '⚖️', defaultEnabled: false, component: LegalPlaceholder },
    { key: 'incidents', label: 'Incidents', icon: '🚨', defaultEnabled: false, component: IncidentsPlaceholder },
];

const fmtType = (t: string) => t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

/* ── Collapsible Detail Section (reused from ResidentsModule pattern) ── */
function DetailSection({ title, icon, children, defaultOpen = true, onEdit, onToggle }: {
    title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean;
    onEdit?: () => void;
    /** Called after the open-state flips. Used by Task 1.3 collapsibles to emit Sentry breadcrumbs (GR-13). */
    onToggle?: (next: boolean) => void;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div style={{
            background: 'rgba(255,255,255,0.02)', borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.05)', marginBottom: 10,
        }}>
            <button
                onClick={() => setOpen(o => { const next = !o; onToggle?.(next); return next; })}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 14px', border: 'none', background: 'none',
                    color: '#94a3b8', fontSize: 11, fontWeight: 700, letterSpacing: 0.8,
                    textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit',
                }}
            >
                {icon} {title}
                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {onEdit && (
                        <span
                            onClick={(e) => { e.stopPropagation(); onEdit(); }}
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, background: 'rgba(214,254,81,0.1)', color: '#D6FE51', cursor: 'pointer', transition: 'all 0.15s' }}
                            title={`Edit ${title}`}
                        >
                            <Settings2 size={11} />
                        </span>
                    )}
                    {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </span>
            </button>
            {open && (
                <div style={{ padding: '0 14px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                    {children}
                </div>
            )}
        </div>
    );
}

function Field({ label, value, full }: { label: string; value?: string; full?: boolean }) {
    if (!value && value !== '0') return null;
    return (
        <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</div>
            <div style={{ fontSize: 13, color: '#cbd5e1', marginTop: 1, wordBreak: 'break-word' }}>{value || '—'}</div>
        </div>
    );
}

interface PropertiesModuleProps {
    searchNavTarget?: { type: string; id: string; parentId?: string } | null;
    onNavComplete?: () => void;
}

export default function PropertiesModule({ searchNavTarget, onNavComplete }: PropertiesModuleProps) {
    const { hasPermission } = useUser();
    const { navigateToResident } = useStrataNav();

    // ── React Query hooks (replaces manual fetch) ──
    const propertiesQuery = useProperties();
    const invalidate = useStrataInvalidate();
    const queryClient = useQueryClient();

    const [selected, setSelected] = useState<Property | null>(null);
    const [view, setView] = useState<View>('list');
    const [showForm, setShowForm] = useState(false);
    const [showEditForm, setShowEditForm] = useState(false);
    const [editFormData, setEditFormData] = useState<any>({});
    
    // Inspections & Budgets Modals
    const [showInspectionForm, setShowInspectionForm] = useState(false);
    const [inspectionFormData, setInspectionFormData] = useState<any>({ type: 'Annual', date: new Date().toISOString().split('T')[0], status: 'Pass', score: '', notes: '' });
    const [showBudgetForm, setShowBudgetForm] = useState(false);
    const [budgetFormData, setBudgetFormData] = useState<any>({});

    // Bridge variables — existing JSX reads these; RQ provides data behind the scenes
    const properties = propertiesQuery.data ?? [];
    const loading = propertiesQuery.isLoading;
    const error = propertiesQuery.error ? (propertiesQuery.error as Error).message : null;

    // Units + tenants + linked data — scoped to selected property
    const unitsQuery = useUnits(selected?.id);
    const tenantsQuery = useEntities('tenant', !!selected);
    const linkedDataQuery = useLinkedData(selected?.id);
    const moduleConfigQuery = useModuleConfig(selected?.id);

    const units = unitsQuery.data ?? [];
    const linkedData = linkedDataQuery.data ?? null;

    const [expandedDesc, setExpandedDesc] = useState<string | null>(null);
    const [expandedAssets, setExpandedAssets] = useState<string | null>(null);
    const [cardView, setCardView] = useState<CardView>('grid');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [confirmDeleteProp, setConfirmDeleteProp] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');

    // Phase 8: Auto-select property from search navigation + jump to subsection
    const TAB_MAP: Record<string, WorkspaceTab> = {
        property: 'overview', insurance: 'insurance', work: 'work', legal: 'work',
        units: 'units', documents: 'documents', incidents: 'incidents',
        vehicles: 'vehicles', utilities: 'utilities', residents: 'residents',
    };
    useEffect(() => {
        if (searchNavTarget && properties.length > 0) {
            const navType = searchNavTarget.type;
            // Unit navigation — parentId is the propertyId, id is the unitId
            if (navType === 'unit' && searchNavTarget.parentId) {
                const target = properties.find(p => p.id === searchNavTarget.parentId);
                if (target) {
                    setSelected(target);
                    setActiveTab('units');
                    // Defer unit selection until units are loaded (handled via separate effect below)
                    setPendingUnitId(searchNavTarget.id);
                    onNavComplete?.();
                }
                return;
            }
            // Find the property — the id always refers to a property
            if (['property', 'insurance', 'work', 'legal', 'units', 'documents', 'incidents', 'vehicles', 'utilities', 'residents'].includes(navType)) {
                const target = properties.find(p => p.id === searchNavTarget.id);
                if (target) {
                    setSelected(target);
                    const tab = TAB_MAP[navType] || 'overview';
                    setActiveTab(tab);
                    onNavComplete?.();
                }
            }
        }
    }, [searchNavTarget, properties, onNavComplete]);

    // Phase 5: Module config — computed from RQ data
    const [moduleConfig, setModuleConfig] = useState<Record<string, boolean>>({});
    const [showModuleManager, setShowModuleManager] = useState(false);

    // Sync module config from RQ
    useEffect(() => {
        const map: Record<string, boolean> = {};
        MODULE_REGISTRY.forEach(m => { map[m.key] = m.defaultEnabled; });
        if (moduleConfigQuery.data) {
            moduleConfigQuery.data.forEach((c: any) => { map[c.moduleKey] = c.enabled; });
        }
        setModuleConfig(map);
    }, [moduleConfigQuery.data]);

    // ── Feature 1: Tenant detail for units ──
    const [pendingUnitId, setPendingUnitId] = useState<string | null>(null);
    const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);

    // ── Unit navigation: deferred selection until units load ──
    useEffect(() => {
        if (pendingUnitId && units.length > 0) {
            const target = units.find(u => u.id === pendingUnitId);
            if (target) setSelectedUnit(target);
            setPendingUnitId(null);
        }
    }, [pendingUnitId, units]);
    // Tenants — filter to property-specific when selected
    const allTenants = tenantsQuery.data ?? [];
    const tenants = useMemo(() => {
        if (!selected) return allTenants;
        const filtered = allTenants.filter(t =>
            (t.propertyIds || []).includes(selected.id) ||
            (t.metadata?.propertyName || '').toLowerCase() === (selected?.name || '').toLowerCase()
        );
        return filtered.length > 0 ? filtered : allTenants;
    }, [allTenants, selected]);
    const [matchedTenant, setMatchedTenant] = useState<EntityProfile | null>(null);

    // ── Feature 3: Property Linked Items ── (provided by useLinkedData hook)
    const [expandedLinkedSection, setExpandedLinkedSection] = useState<string | null>('workitems');
    const [expandedWorkitem, setExpandedWorkitem] = useState<Workitem | null>(null);

    const handleToggleModule = async (moduleKey: string) => {
        if (!selected) return;
        const newEnabled = !moduleConfig[moduleKey];
        setModuleConfig(prev => ({ ...prev, [moduleKey]: newEnabled }));
        try {
            await strataPut('/property-modules', { propertyId: selected.id, moduleKey, enabled: newEnabled });
            queryClient.invalidateQueries({ queryKey: strataKeys.moduleConfig(selected.id) });
        } catch (e) { console.error(e); }
    };

    const enabledModules = MODULE_REGISTRY.filter(m => moduleConfig[m.key]);
    const allTabs = [...CORE_TABS, ...enabledModules.map(m => m.key)];

    // ── Phase 2: Work tab filters & tracking ──
    const [workTrackingFilter, setWorkTrackingFilter] = useState<'active' | 'inactive'>('active');
    const [workStatusFilter, setWorkStatusFilter] = useState<string>('all');
    const [workPriorityFilter, setWorkPriorityFilter] = useState<string>('all');
    const [workDomainFilter, setWorkDomainFilter] = useState<string>('all');
    const [workSearchQuery, setWorkSearchQuery] = useState('');

    // ── Feature 4: Add notes + Photo uploads ──
    const [newNoteText, setNewNoteText] = useState('');
    const [savingNote, setSavingNote] = useState(false);
    const [savingPhoto, setSavingPhoto] = useState(false);

    const addNote = async () => {
        if (!newNoteText.trim() || !selected) return;
        setSavingNote(true);
        try {
            const pm = selected.metadata || {};
            const existingNotes = Array.isArray(pm.notes) ? pm.notes : [];
            const note = {
                id: crypto.randomUUID(),
                author: 'User',
                postedAt: new Date().toISOString().split('T')[0],
                content: newNoteText.trim(),
            };
            existingNotes.push(note);
            await strataPut(`/properties/${selected.id}`, {
                metadata: JSON.stringify({ ...pm, notes: existingNotes }),
            });
            setSelected({ ...selected, metadata: { ...pm, notes: existingNotes } });
            setNewNoteText('');
        } catch (e) { console.error('Failed to add note', e); }
        setSavingNote(false);
    };

    const deleteNote = async (noteId: string) => {
        if (!selected) return;
        const pm = selected.metadata || {};
        const notes = Array.isArray(pm.notes) ? pm.notes.filter((n: any) => n.id !== noteId) : [];
        try {
            await strataPut(`/properties/${selected.id}`, {
                metadata: JSON.stringify({ ...pm, notes }),
            });
            setSelected({ ...selected, metadata: { ...pm, notes } });
        } catch (e) { console.error('Failed to delete note', e); }
    };

    const addPhotos = async (files: FileList | null) => {
        if (!files || files.length === 0 || !selected) return;
        setSavingPhoto(true);
        try {
            const pm = selected.metadata || {};
            const photos: any[] = Array.isArray(pm.photos) ? [...pm.photos] : [];
            for (const file of Array.from(files)) {
                // Convert to base64 data URL for storage (small property photos)
                const dataUrl = await new Promise<string>((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result as string);
                    reader.readAsDataURL(file);
                });
                photos.push({
                    id: crypto.randomUUID(),
                    name: file.name,
                    dataUrl,
                    uploadedAt: new Date().toISOString(),
                });
            }
            await strataPut(`/properties/${selected.id}`, {
                metadata: JSON.stringify({ ...pm, photos }),
            });
            setSelected({ ...selected, metadata: { ...pm, photos } });
        } catch (e) { console.error('Failed to upload photos', e); }
        setSavingPhoto(false);
    };

    const deletePhoto = async (photoId: string) => {
        if (!selected) return;
        const pm = selected.metadata || {};
        const photos = Array.isArray(pm.photos) ? pm.photos.filter((p: any) => p.id !== photoId) : [];
        try {
            await strataPut(`/properties/${selected.id}`, {
                metadata: JSON.stringify({ ...pm, photos }),
            });
            setSelected({ ...selected, metadata: { ...pm, photos } });
        } catch (e) { console.error('Failed to delete photo', e); }
    };

    const statusFiltered = statusFilter === 'all'
        ? properties
        : properties.filter(p => p.status === statusFilter);
    const filteredProperties = typeFilter === 'all'
        ? statusFiltered
        : statusFiltered.filter(p => (p.type || '').toLowerCase().replace(/[\s_-]/g, '') === typeFilter);



    const openDetail = (p: Property) => {
        setSelected(p);
        setView('detail');
        setSelectedUnit(null);
        setMatchedTenant(null);
        // RQ auto-fetches units, tenants, linkedData when 'selected' changes
    };

    // ── Feature 2: Safe back button ──
    const goBack = () => {
        setView('list');
        setSelected(null);
        setSelectedUnit(null);
        setMatchedTenant(null);
        setExpandedLinkedSection('workitems');
        setExpandedAssets(null);
    };

    // ── Feature 1: Click a unit → find matching tenant ──
    const selectUnit = (unit: Unit) => {
        setSelectedUnit(unit);
        // Match by currentTenantId or by metadata.unit
        const match = tenants.find(t =>
            (unit.currentTenantId && t.id === unit.currentTenantId) ||
            (t.metadata?.unit || '').toLowerCase().trim() === unit.unitNumber.toLowerCase().trim()
        );
        setMatchedTenant(match || null);
    };

    const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        try {
            await strataPost('/properties', {
                name: fd.get('name'),
                address: fd.get('address'),
                type: fd.get('type'),
                unitCount: Number(fd.get('unitCount')) || 0,
            });
            setShowForm(false);
            invalidate('properties');
        } catch (err) { console.error(err); }
    };

    const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!selected) return;
        
        const updatedMetadata = { ...(selected.metadata || {}), ...editFormData };
        
        try {
            const updated = await strataPut(`/properties/${selected.id}`, {
                metadata: JSON.stringify(updatedMetadata),
            });
            setShowEditForm(false);
            setSelected({ ...selected, metadata: updatedMetadata });
            invalidate('properties');
        } catch (err) { console.error('Failed to update property', err); }
    };

    const handleAddInspection = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!selected) return;
        
        const pm = selected.metadata || {};
        const inspections = Array.isArray(pm.inspections) ? [...pm.inspections] : [];
        inspections.push({ id: crypto.randomUUID(), ...inspectionFormData });
        
        const updatedMetadata = { ...pm, inspections };
        try {
            await strataPut(`/properties/${selected.id}`, { metadata: JSON.stringify(updatedMetadata) });
            setShowInspectionForm(false);
            setInspectionFormData({ type: 'Annual', date: new Date().toISOString().split('T')[0], status: 'Pass', score: '', notes: '' });
            setSelected({ ...selected, metadata: updatedMetadata });
        } catch (err) { console.error('Failed to add inspection', err); }
    };

    const handleUpdateBudget = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!selected) return;
        
        const pm = selected.metadata || {};
        const updatedMetadata = { ...pm, budgets: budgetFormData };
        
        try {
            await strataPut(`/properties/${selected.id}`, { metadata: JSON.stringify(updatedMetadata) });
            setShowBudgetForm(false);
            setSelected({ ...selected, metadata: updatedMetadata });
        } catch (err) { console.error('Failed to update budget', err); }
    };

    const handleDeleteProp = async (id: string) => {
        try {
            await strataDelete(`/properties/${id}`);
            setConfirmDeleteProp(null);
            goBack();
            invalidate('properties');
        } catch (err) { console.error(err); }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'occupied': return 'var(--s-success, #10b981)';
            case 'vacant': return 'var(--s-info, #3b82f6)';
            case 'maintenance': return 'var(--s-warning, #f59e0b)';
            case 'turn': return 'var(--s-danger, #ef4444)';
            default: return 'var(--s-text-tertiary, #64748b)';
        }
    };

    const getOccupiedCount = (propUnits: Unit[]) => propUnits.filter(u => u.status === 'occupied').length;

    // ══════════ PROPERTY LIST VIEW ══════════
    if (view === 'list') {
        return (
            <div className="s-module">
                <div className="s-module-header">
                    <div>
                        <h2 className="s-module-title">Properties</h2>
                        <p className="s-module-subtitle">{filteredProperties.length} of {properties.length} properties</p>
                    </div>
                    <div className="s-module-actions">
                        <div style={{ display: 'inline-flex', borderRadius: 6, overflow: 'hidden', border: '1px solid var(--s-border, rgba(255,255,255,0.1))' }}>
                            {([['grid', LayoutGrid], ['rows', List], ['table', Table2]] as const).map(([mode, Icon]) => (
                                <button
                                    key={mode}
                                    className="s-btn s-btn-ghost"
                                    style={{
                                        padding: '5px 8px', borderRadius: 0, margin: 0,
                                        background: cardView === mode ? 'rgba(214,254,81,0.2)' : 'transparent',
                                        color: cardView === mode ? 'var(--s-accent, #6366f1)' : 'var(--s-text-secondary)',
                                    }}
                                    onClick={() => setCardView(mode)}
                                    title={mode.charAt(0).toUpperCase() + mode.slice(1) + ' view'}
                                >
                                    <Icon size={14} />
                                </button>
                            ))}
                        </div>
                        <button className="s-btn s-btn-ghost" onClick={() => invalidate('properties')} aria-label="Refresh properties"><RefreshCw size={14} /></button>
                        {hasPermission('strata:properties:create') && (
                            <button className="s-btn s-btn-primary" onClick={() => setShowForm(true)}><Plus size={14} /> Add Property</button>
                        )}
                    </div>
                </div>

                {/* Status filter tabs */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                    {(['all', 'active', 'inactive', 'archived'] as StatusFilter[]).map(filter => {
                        const count = filter === 'all' ? properties.length : properties.filter(p => p.status === filter).length;
                        const isActive = statusFilter === filter;
                        return (
                            <button
                                key={filter}
                                onClick={() => setStatusFilter(filter)}
                                style={{
                                    padding: '5px 14px',
                                    borderRadius: 20,
                                    border: isActive ? '1px solid var(--s-accent, #6366f1)' : '1px solid rgba(255,255,255,0.1)',
                                    background: isActive ? 'rgba(214,254,81,0.15)' : 'rgba(255,255,255,0.04)',
                                    color: isActive ? 'var(--s-accent, #6366f1)' : 'var(--s-text-secondary)',
                                    cursor: 'pointer',
                                    fontSize: 12, fontWeight: 600,
                                    transition: 'all 0.15s',
                                    display: 'flex', alignItems: 'center', gap: 6,
                                }}
                            >
                                {filter.charAt(0).toUpperCase() + filter.slice(1)}
                                <span style={{ fontSize: 10, opacity: 0.7 }}>({count})</span>
                            </button>
                        );
                    })}
                </div>

                {/* Type filter tabs */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                    {[
                        { id: 'all', label: 'All Types' },
                        { id: 'multifamily', label: 'Multi-Family' },
                        { id: 'singlefamily', label: 'Single-Family' },
                        { id: 'commercial', label: 'Commercial' },
                        { id: 'land', label: 'Land' },
                        { id: 'mixeduse', label: 'Mixed-Use' },
                    ].map(t => {
                        const isActive = typeFilter === t.id;
                        return (
                            <button
                                key={t.id}
                                onClick={() => setTypeFilter(t.id)}
                                style={{
                                    padding: '4px 10px',
                                    borderRadius: 16,
                                    border: isActive ? '1px solid #06b6d4' : '1px solid rgba(255,255,255,0.06)',
                                    background: isActive ? 'rgba(6,182,212,0.12)' : 'rgba(255,255,255,0.02)',
                                    color: isActive ? '#06b6d4' : '#64748b',
                                    cursor: 'pointer',
                                    fontSize: 11, fontWeight: 500,
                                    transition: 'all 0.15s',
                                }}
                            >
                                {t.label}
                            </button>
                        );
                    })}
                </div>

                {loading ? (
                    <LoadingState message="Loading properties…" />
                ) : error ? (
                    <ErrorState message={error} onRetry={() => invalidate('properties')} />
                ) : cardView === 'grid' ? (
                    <div className="s-card-grid">
                        {filteredProperties.map(p => (
                            <div key={p.id} className="s-glass-card s-clickable" onClick={() => openDetail(p)}>
                                <div className="s-prop-card-header">
                                    <div className="s-prop-icon"><Building2 size={20} /></div>
                                    <span className={`s-badge ${p.status}`}>{p.status}</span>
                                </div>
                                <h3 className="s-prop-name">{p.name}</h3>
                                {hasPermission('strata:properties:address') && (
                                    <div className="s-prop-address"><MapPin size={12} /> {p.address}</div>
                                )}
                                {p.metadata?.owner && (
                                    <div className="s-prop-address" style={{ opacity: 0.7, marginTop: 2 }}>
                                        <Home size={12} /> {p.metadata.owner}
                                    </div>
                                )}
                                {p.metadata?.description && (
                                    <div style={{ marginTop: 6 }}>
                                        <button
                                            className="s-btn-ghost"
                                            style={{ fontSize: '0.78rem', padding: '2px 6px', opacity: 0.7, display: 'inline-flex', alignItems: 'center', gap: 4, border: 'none', cursor: 'pointer', color: 'var(--s-text-secondary)', background: 'rgba(255,255,255,0.04)', borderRadius: 4 }}
                                            onClick={(e) => { e.stopPropagation(); setExpandedDesc(expandedDesc === p.id ? null : p.id); }}
                                        >
                                            {expandedDesc === p.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                            Description
                                        </button>
                                        {expandedDesc === p.id && (
                                            <div style={{ marginTop: 6, padding: '8px 10px', fontSize: '0.82rem', lineHeight: 1.6, color: 'var(--s-text-secondary)', background: 'rgba(255,255,255,0.03)', borderRadius: 6, whiteSpace: 'pre-line', borderLeft: '2px solid var(--s-accent, #6366f1)' }}>
                                                {p.metadata.description}
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="s-prop-stats">
                                    <div className="s-prop-stat">
                                        <span className="s-prop-stat-value">{p.unitCount}</span>
                                        <span className="s-prop-stat-label">Units</span>
                                    </div>
                                    <div className="s-prop-stat">
                                        <span className="s-prop-stat-value">{fmtType(p.type)}</span>
                                        <span className="s-prop-stat-label">Type</span>
                                    </div>
                                </div>
                                <div className="s-prop-footer">
                                    <span>View details</span>
                                    <ChevronRight size={14} />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : cardView === 'rows' ? (
                    /* ── LIST / ROW VIEW ── */
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {filteredProperties.map(p => (
                            <div
                                key={p.id}
                                className="s-glass-card s-clickable"
                                onClick={() => openDetail(p)}
                                style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px' }}
                            >
                                <div className="s-prop-icon" style={{ flexShrink: 0 }}><Building2 size={18} /></div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <strong style={{ fontSize: '0.95rem' }}>{p.name}</strong>
                                        <span className={`s-badge ${p.status}`} style={{ fontSize: '0.65rem' }}>{p.status}</span>
                                    </div>
                                    {hasPermission('strata:properties:address') && (
                                        <div className="s-prop-address" style={{ marginTop: 2 }}><MapPin size={11} /> {p.address}</div>
                                    )}
                                </div>
                                {p.metadata?.owner && (
                                    <div style={{ flexShrink: 0, fontSize: '0.8rem', color: 'var(--s-text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        <Home size={11} style={{ verticalAlign: -2, marginRight: 4 }} />{p.metadata.owner}
                                    </div>
                                )}
                                <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 60 }}>
                                    <div style={{ fontWeight: 600 }}>{p.unitCount}</div>
                                    <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>Units</div>
                                </div>
                                <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 80 }}>
                                    <div style={{ fontWeight: 600 }}>{fmtType(p.type)}</div>
                                    <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>Type</div>
                                </div>
                                <ChevronRight size={14} style={{ opacity: 0.4, flexShrink: 0 }} />
                            </div>
                        ))}
                    </div>
                ) : (
                    /* ── TABLE VIEW ── */
                    <div className="s-glass-card" style={{ padding: 0 }}>
                        <div className="s-table-wrap">
                            <table className="s-table">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Address</th>
                                        <th>Owner</th>
                                        <th>Type</th>
                                        <th>Units</th>
                                        <th>Status</th>
                                        <th></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredProperties.map(p => (
                                        <tr key={p.id} className="s-clickable" onClick={() => openDetail(p)} style={{ cursor: 'pointer' }}>
                                            <td className="s-td-bold">{p.name}</td>
                                            <td>{hasPermission('strata:properties:address') ? p.address : '—'}</td>
                                            <td style={{ color: 'var(--s-text-secondary)' }}>{p.metadata?.owner || '—'}</td>
                                            <td>{fmtType(p.type)}</td>
                                            <td>{p.unitCount}</td>
                                            <td><span className={`s-badge ${p.status}`}>{p.status}</span></td>
                                            <td><ChevronRight size={14} style={{ opacity: 0.4 }} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Add Property Modal */}
                {showForm && (
                    <div className="s-modal-overlay" onClick={() => setShowForm(false)}>
                        <div className="s-modal" onClick={e => e.stopPropagation()}>
                            <div className="s-modal-header">
                                <h3>Add Property</h3>
                                <button className="s-btn-icon" onClick={() => setShowForm(false)}><X size={18} /></button>
                            </div>
                            <form onSubmit={handleCreate}>
                                <div className="s-form-group">
                                    <label>Property Name</label>
                                    <input name="name" required placeholder="e.g. Skyline Tower" className="s-input" />
                                </div>
                                <div className="s-form-group">
                                    <label>Address</label>
                                    <input name="address" required placeholder="Full address" className="s-input" />
                                </div>
                                <div className="s-form-row">
                                    <div className="s-form-group">
                                        <label>Type</label>
                                        <select name="type" className="s-input">
                                            <option value="residential">Residential</option>
                                            <option value="commercial">Commercial</option>
                                            <option value="mixed_use">Mixed Use</option>
                                        </select>
                                    </div>
                                    <div className="s-form-group">
                                        <label>Unit Count</label>
                                        <input name="unitCount" type="number" min="0" className="s-input" placeholder="0" />
                                    </div>
                                </div>
                                <div className="s-modal-footer">
                                    <button type="button" className="s-btn s-btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
                                    <button type="submit" className="s-btn s-btn-primary">Create Property</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Edit Property Modal */}
                {showEditForm && selected && (
                    <div className="s-modal-overlay" onClick={() => setShowEditForm(false)}>
                        <div className="s-modal" onClick={e => e.stopPropagation()} style={{ width: 600, maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                            <div className="s-modal-header">
                                <h3>Edit Property Details</h3>
                                <button className="s-btn-icon" onClick={() => setShowEditForm(false)}><X size={18} /></button>
                            </div>
                            <form onSubmit={handleUpdate} style={{ flex: 1, overflowY: 'auto' }}>
                                <div className="s-form-group" style={{ marginBottom: 20 }}>
                                    <div style={{ padding: '12px 16px', background: 'rgba(214,254,81,0.08)', borderRadius: 8, border: '1px solid rgba(214,254,81,0.2)' }}>
                                        <h4 style={{ margin: '0 0 4px 0', fontSize: 13, color: '#e2e8f0' }}>Editing: {selected.name}</h4>
                                        <div style={{ fontSize: 11, color: '#94a3b8' }}>Update the extended property details tracked in Dwellium for AppFolio sync.</div>
                                    </div>
                                </div>
                                
                                <h4 style={{ fontSize: 12, color: '#D6FE51', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 6 }}>Turn & Showing</h4>
                                <div className="s-form-row">
                                    <div className="s-form-group">
                                        <label>Rent Ready (Yes/No)</label>
                                        <select 
                                            className="s-input" 
                                            value={editFormData.rentReady || ''} 
                                            onChange={e => setEditFormData({...editFormData, rentReady: e.target.value})}
                                        >
                                            <option value="">Select...</option>
                                            <option value="Yes">Yes</option>
                                            <option value="No">No</option>
                                        </select>
                                    </div>
                                    <div className="s-form-group">
                                        <label>Ready For Showing On</label>
                                        <input 
                                            type="date" 
                                            className="s-input" 
                                            value={editFormData.readyForShowingOn || ''} 
                                            onChange={e => setEditFormData({...editFormData, readyForShowingOn: e.target.value})}
                                        />
                                    </div>
                                </div>
                                <div className="s-form-group" style={{ marginBottom: 20 }}>
                                    <label>Lockbox Info</label>
                                    <input 
                                        className="s-input" 
                                        placeholder="e.g. Front Door - Code: 1234" 
                                        value={editFormData.lockbox || ''} 
                                        onChange={e => setEditFormData({...editFormData, lockbox: e.target.value})}
                                    />
                                </div>

                                <h4 style={{ fontSize: 12, color: '#8cf8a2', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 6 }}>Property Descriptors</h4>
                                <div className="s-form-row">
                                    <div className="s-form-group">
                                        <label>County</label>
                                        <input 
                                            className="s-input" 
                                            placeholder="e.g. King County" 
                                            value={editFormData.county || ''} 
                                            onChange={e => setEditFormData({...editFormData, county: e.target.value})}
                                        />
                                    </div>
                                    <div className="s-form-group">
                                        <label>Parcel ID</label>
                                        <input 
                                            className="s-input" 
                                            value={editFormData.parcel || ''} 
                                            onChange={e => setEditFormData({...editFormData, parcel: e.target.value})}
                                        />
                                    </div>
                                </div>
                                <div className="s-form-row">
                                    <div className="s-form-group">
                                        <label>Year Built</label>
                                        <input 
                                            className="s-input" 
                                            placeholder="e.g. 1995" 
                                            value={editFormData.yearBuilt || ''} 
                                            onChange={e => setEditFormData({...editFormData, yearBuilt: e.target.value})}
                                        />
                                    </div>
                                    <div className="s-form-group">
                                        <label>Owner</label>
                                        <input 
                                            className="s-input" 
                                            value={editFormData.owner || ''} 
                                            onChange={e => setEditFormData({...editFormData, owner: e.target.value})}
                                        />
                                    </div>
                                </div>
                                <div className="s-form-group" style={{ marginBottom: 20 }}>
                                    <label>Description Note</label>
                                    <textarea 
                                        className="s-input" 
                                        style={{ minHeight: 60, resize: 'vertical' }}
                                        placeholder="Add general description notes here..." 
                                        value={editFormData.description || ''} 
                                        onChange={e => setEditFormData({...editFormData, description: e.target.value})}
                                    />
                                </div>

                                <h4 style={{ fontSize: 12, color: '#f8c28c', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 6 }}>Financial Baseline</h4>
                                <div className="s-form-row">
                                    <div className="s-form-group">
                                        <label>Purchase Price</label>
                                        <input 
                                            className="s-input" 
                                            placeholder="$0.00" 
                                            value={editFormData.purchasePrice || ''} 
                                            onChange={e => setEditFormData({...editFormData, purchasePrice: e.target.value})}
                                        />
                                    </div>
                                    <div className="s-form-group">
                                        <label>Purchase Date</label>
                                        <input 
                                            type="date" 
                                            className="s-input" 
                                            value={editFormData.purchaseDate || ''} 
                                            onChange={e => setEditFormData({...editFormData, purchaseDate: e.target.value})}
                                        />
                                    </div>
                                </div>

                                <div className="s-modal-footer" style={{ marginTop: 24 }}>
                                    <button type="button" className="s-btn s-btn-ghost" onClick={() => setShowEditForm(false)}>Cancel</button>
                                    <button type="submit" className="s-btn s-btn-primary">Save Changes</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ══════════ PROPERTY DETAIL VIEW ══════════
    const md = matchedTenant?.metadata || {};
    const pm = selected?.metadata || {};

    /* helper: render a note with expandable content */
    const NoteCard = ({ note }: { note: any }) => {
        const [expanded, setExpanded] = useState(false);
        const isLong = (note.content || '').length > 200;
        return (
            <div style={{
                padding: '10px 14px', background: 'rgba(255,255,255,0.02)',
                borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)', marginBottom: 6,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontSize: 10, color: '#64748b' }}>
                    {note.isEdited ? <span style={{ color: '#f59e0b', fontWeight: 600 }}>EDITED</span> : <span style={{ color: '#D6FE51', fontWeight: 600 }}>POSTED</span>}
                    <span>Last edited – {note.author} on {note.editedAt || note.postedAt}</span>
                </div>
                <div style={{
                    fontSize: 12, color: '#94a3b8', lineHeight: 1.6, whiteSpace: 'pre-line',
                    maxHeight: expanded ? 'none' : 100, overflow: 'hidden',
                }}>
                    {note.content}
                </div>
                {isLong && (
                    <button
                        onClick={() => setExpanded(!expanded)}
                        style={{
                            background: 'none', border: 'none', color: '#D6FE51', fontSize: 11,
                            cursor: 'pointer', padding: '4px 0', fontWeight: 600, fontFamily: 'inherit',
                        }}
                    >
                        {expanded ? 'show less' : 'show full note'}
                    </button>
                )}
            </div>
        );
    };

    return (
        <>
            <div className="s-module">
                <div className="s-module-header">
                    <div className="s-breadcrumb">
                        <button className="s-btn s-btn-ghost" onClick={goBack}>← Properties</button>
                        <ChevronRight size={14} />
                        <span>{selected?.name}</span>
                        {selectedUnit && (
                            <>
                                <ChevronRight size={14} />
                                <span style={{ color: 'var(--s-accent, #6366f1)' }}>Unit {selectedUnit.unitNumber}</span>
                            </>
                        )}
                    </div>

                    {/* ── Workspace Tab Bar ── */}
                    <div className="s-workspace-tabs" style={{ position: 'relative' }}>
                        {allTabs.map(tab => {
                            const modEntry = MODULE_REGISTRY.find(m => m.key === tab);
                            return (
                                <button
                                    key={tab}
                                    data-testid={`property-tab-button-${tab}`}
                                    className={`s-workspace-tab${activeTab === tab ? ' active' : ''}`}
                                    onClick={() => {
                                        // Task 3.3 — GR-13 tab-switch breadcrumb. Fires uniformly
                                        // for all 9 tabs (5 existing CORE_TABS + 4 new AppFolio
                                        // parity stubs). Try/catch-wrapped per Task 3.7+ precedent.
                                        try {
                                            Sentry.addBreadcrumb({
                                                category: 'ui.tab-switch',
                                                message: 'properties.detail.tab.switched',
                                                level: 'info',
                                                data: { tab, propertyId: selected?.id },
                                            });
                                        } catch { /* Sentry no-op when DSN unset */ }
                                        setActiveTab(tab);
                                    }}
                                >
                                    {modEntry ? `${modEntry.icon} ${modEntry.label}` : tab.charAt(0).toUpperCase() + tab.slice(1)}
                                </button>
                            );
                        })}
                        <button
                            className="s-workspace-tab"
                            onClick={() => setShowModuleManager(!showModuleManager)}
                            title="Manage Modules"
                            style={{ marginLeft: 'auto', opacity: 0.6, fontSize: 11 }}
                        >
                            <Settings2 size={14} />
                        </button>
                        {showModuleManager && (
                            <div style={{
                                position: 'absolute', top: '100%', right: 0, zIndex: 50,
                                background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(214,254,81,0.2)',
                                borderRadius: 10, padding: 12, minWidth: 220,
                                backdropFilter: 'blur(12px)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                            }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                                    Optional Modules
                                </div>
                                {MODULE_REGISTRY.map(mod => (
                                    <div key={mod.key} style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '6px 8px', borderRadius: 6, marginBottom: 4,
                                        background: moduleConfig[mod.key] ? 'rgba(214,254,81,0.08)' : 'transparent',
                                    }}>
                                        <span style={{ fontSize: 12, color: '#e2e8f0' }}>{mod.icon} {mod.label}</span>
                                        <button
                                            onClick={() => handleToggleModule(mod.key)}
                                            style={{
                                                width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer',
                                                background: moduleConfig[mod.key] ? '#D6FE51' : 'rgba(100,116,139,0.3)',
                                                position: 'relative', transition: 'background 0.2s',
                                            }}
                                        >
                                            <div style={{
                                                width: 14, height: 14, borderRadius: '50%', background: '#fff',
                                                position: 'absolute', top: 3,
                                                left: moduleConfig[mod.key] ? 19 : 3,
                                                transition: 'left 0.2s',
                                            }} />
                                        </button>
                                    </div>
                                ))}
                                <div style={{ fontSize: 10, color: '#475569', marginTop: 8 }}>Changes saved per property</div>
                            </div>
                        )}
                    </div>
                </div>

                {selected && (
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        {/* ── Left column: Property info ── */}
                        <div style={{ flex: 1, minWidth: 400 }}>
                            {/* ───── PROPERTY HEADER (always visible) ───── */}
                            {hasPermission('strata:properties:kpi') && (
                                <div className="s-glass-card s-detail-card">
                                    <div className="s-detail-header">
                                        <div>
                                            <h2>{selected.name}</h2>
                                            <p className="s-detail-address">{hasPermission('strata:properties:address') && <><MapPin size={14} /> {selected.address}</>}</p>
                                            {pm.county && (
                                                <p className="s-detail-address" style={{ marginTop: 2, opacity: 0.7 }}>
                                                    <Globe size={14} /> {pm.county}
                                                </p>
                                            )}
                                            {pm.owner && (
                                                <p className="s-detail-address" style={{ marginTop: 4, opacity: 0.8 }}>
                                                    <Home size={14} /> Owner: {pm.owner}
                                                </p>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                                            <span className={`s-badge ${selected.status}`}>{selected.status}</span>
                                            {pm.propertyType && (
                                                <span style={{
                                                    fontSize: 10, padding: '2px 8px', borderRadius: 4,
                                                    background: 'rgba(214,254,81,0.12)', color: '#D6FE51', fontWeight: 600,
                                                }}>{pm.propertyType}</span>
                                            )}
                                            <div style={{ display: 'flex', gap: 6 }}>
                                                <button 
                                                    onClick={() => {
                                                        setEditFormData(pm);
                                                        setShowEditForm(true);
                                                    }} 
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: 4, marginTop: 4,
                                                        padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                                                        background: 'rgba(214,254,81,0.1)', border: '1px solid rgba(214,254,81,0.2)',
                                                        color: '#D6FE51', cursor: 'pointer', fontFamily: 'inherit',
                                                    }}
                                                >
                                                    <Settings2 size={10} /> Edit
                                                </button>
                                                <button onClick={() => setConfirmDeleteProp(selected.id)} style={{
                                                    display: 'flex', alignItems: 'center', gap: 4, marginTop: 4,
                                                    padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                                                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                                                    color: '#fca5a5', cursor: 'pointer', fontFamily: 'inherit',
                                                }}>
                                                    <Trash2 size={10} /> Delete
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ═══════ TAB: OVERVIEW ═══════ */}
                            {activeTab === 'overview' && (
                                <PropertyOverview property={selected} units={units} linkedData={linkedData} />
                            )}

                            {/* ═══════ TAB: INFO ═══════ */}
                            {activeTab === 'info' && (<>
                            {/* ───── PROPERTY INFORMATION ───── */}
                            <DetailSection title="Property Information" icon={<Building2 size={12} />}>
                                <Field label="Status" value={pm.status || selected.status} />
                                <Field label="Rent Ready" value={pm.rentReady} />
                                <Field label="Ready For Showing On" value={pm.readyForShowingOn} />
                                <Field label="Lockbox" value={pm.lockbox} />
                                <Field label="Description" value={pm.description} full />
                                <Field label="Portfolio" value={pm.portfolio} />
                                <Field label="Site Manager" value={pm.siteManager} />
                                <Field label="Year Built" value={pm.yearBuilt} />
                                <Field label="Management Start Date" value={pm.managementStartDate} />
                                <Field label="Management End Date" value={pm.managementEndDate} />
                                <Field label="Management End Reason" value={pm.managementEndReason} />
                                <Field label="FolioGuard Policy" value={pm.folioGuardPolicy} />
                                <Field label="Resident eCheck Fee Coverage" value={pm.residentECheckFeeCoverage} />
                                <Field label="FolioGuard Security Deposit" value={pm.folioGuardSecurityDepositAlternative} />
                                <Field label="Parcel" value={pm.parcel} full />
                                <Field label="Tags" value={pm.tags} />
                            </DetailSection>

                            {/* ───── NON-REVENUE STATUS ───── */}
                            {(pm.nonRevenueUnit || pm.nonRevenueType) && (
                                <DetailSection title="Non-Revenue Status" icon={<AlertTriangle size={12} />} defaultOpen={false}>
                                    <Field label="Non-Revenue Unit" value={pm.nonRevenueUnit} />
                                    <Field label="Non-Revenue Type" value={pm.nonRevenueType} />
                                    <Field label="Non-Revenue Start" value={pm.nonRevenueStart} />
                                </DetailSection>
                            )}

                            {/* ───── RENTAL INFORMATION ───── */}
                            <DetailSection title="Rental Information" icon={<Home size={12} />}>
                                <Field label="Bedrooms" value={pm.bedrooms != null ? String(pm.bedrooms) : undefined} />
                                <Field label="Bathrooms" value={pm.bathrooms != null ? String(pm.bathrooms) : undefined} />
                                <Field label="Square Feet" value={pm.sqFt} />
                                <Field label="Market Rent" value={pm.marketRent} />
                                <Field label="Use Market Rent on Ads?" value={pm.useMarketRentOnAds} />
                                <Field label="Application Fee" value={pm.applicationFee ? `$${pm.applicationFee}` : undefined} />
                                <Field label="Security Deposit" value={pm.securityDeposit} />
                                <Field label="NSF Fee" value={pm.nsfFee ? `$${pm.nsfFee}` : undefined} />
                                <Field label="Last Inspection On" value={pm.lastInspection} />
                                <Field label="Rent Status" value={pm.rentStatus} />
                                <Field label="Legal Rent" value={pm.legalRent} />
                                <Field label="Preferential Rent" value={pm.preferentialRent} />
                                <Field label="Utilities Included" value={pm.utilitiesIncluded} />
                                <Field label="Appliances Included" value={pm.appliancesIncluded} />
                                <Field label="Additional Lease Information" value={pm.additionalLeaseInfo} />
                                <Field label="Listing Type" value={pm.listingType} />
                            </DetailSection>

                            {/* ───── AMENITIES ───── */}
                            {(pm.catsAllowed || pm.dogsAllowed || pm.amenities) && (
                                <DetailSection title="Amenities" icon={<Dog size={12} />} defaultOpen={false}>
                                    <Field label="Cats Allowed" value={pm.catsAllowed} />
                                    <Field label="Dogs Allowed" value={pm.dogsAllowed} />
                                    <Field label="Amenities" value={pm.amenities} full />
                                </DetailSection>
                            )}

                            {/* ───── MARKETING INFORMATION ───── */}
                            {(pm.postedToWebsite || pm.postedToInternet || pm.marketingDescription) && (
                                <DetailSection title="Marketing Information" icon={<Megaphone size={12} />} defaultOpen={false}>
                                    <Field label="Posted to Website" value={pm.postedToWebsite} />
                                    <Field label="Posted to Internet" value={pm.postedToInternet} />
                                    <Field label="Premium Listing" value={pm.premiumListing} />
                                    <Field label="Zillow Spotlight" value={pm.zillowSpotlight} />
                                    <Field label="Removed from Vacancies List" value={pm.removedFromVacanciesList} />
                                    <Field label="Available On" value={pm.availableOn} />
                                    <Field label="Marketing Title" value={pm.marketingTitle} />
                                    <Field label="Marketing Description" value={pm.marketingDescription} full />
                                    <Field label="Listing Type" value={pm.listingType} />
                                    <Field label="YouTube Video URL" value={pm.youtubeVideoUrl} />
                                </DetailSection>
                            )}

                            {/* ───── LEASE SETTINGS ───── */}
                            {pm.defaultLeaseGenerationMethod && (
                                <DetailSection title="Lease Settings" icon={<BookOpen size={12} />} defaultOpen={false}>
                                    <Field label="Default Lease Generation Method" value={pm.defaultLeaseGenerationMethod} full />
                                    {pm.leaseTemplates && (
                                        <>
                                            <div style={{ gridColumn: '1 / -1', marginTop: 8 }}>
                                                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>Default New Lease Templates</div>
                                                <Field label="Lease Template" value={pm.leaseTemplates.newLease?.leaseTemplate} />
                                                <Field label="Addenda Templates" value={pm.leaseTemplates.newLease?.addendaTemplates} />
                                                <Field label="Lease Attachments" value={pm.leaseTemplates.newLease?.leaseAttachments} />
                                            </div>
                                            <div style={{ gridColumn: '1 / -1', marginTop: 8 }}>
                                                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>Default Renewal Templates</div>
                                                <Field label="Lease Template" value={pm.leaseTemplates.renewal?.leaseTemplate} />
                                                <Field label="Addenda Templates" value={pm.leaseTemplates.renewal?.addendaTemplates} />
                                                <Field label="Lease Attachments" value={pm.leaseTemplates.renewal?.leaseAttachments} />
                                            </div>
                                        </>
                                    )}
                                    <Field label="Renewal Letter Template" value={pm.renewalLetterTemplate} full />
                                    {pm.renewalOptions?.length > 0 && (
                                        <div style={{ gridColumn: '1 / -1', marginTop: 8 }}>
                                            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>Renewal Options</div>
                                            <div className="s-table-wrap">
                                                <table className="s-table" style={{ fontSize: 12 }}>
                                                    <thead><tr><th>Term</th><th>Change by $</th><th>Additional Fee</th></tr></thead>
                                                    <tbody>
                                                        {pm.renewalOptions.map((opt: any, i: number) => (
                                                            <tr key={i}>
                                                                <td>{opt.term}</td>
                                                                <td>{opt.changeByDollar}</td>
                                                                <td>{opt.additionalFee}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </DetailSection>
                            )}

                            {/* ───── OWNERS & FINANCIALS ───── */}
                            {(pm.owners?.length > 0 || pm.distributions) && (
                                <DetailSection title="Owners and Financials" icon={<Landmark size={12} />} defaultOpen={false}>
                                    <Field label="Ownership Start Date" value={pm.ownershipStartDate} full />
                                    {pm.owners?.length > 0 && (
                                        <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                                            <div className="s-table-wrap">
                                                <table className="s-table" style={{ fontSize: 12 }}>
                                                    <thead><tr><th>Owner</th><th>% Owned</th><th>% Distributed</th><th>Contract Expiration</th></tr></thead>
                                                    <tbody>
                                                        {pm.owners.map((o: any, i: number) => (
                                                            <tr key={i}>
                                                                <td className="s-td-bold">{o.name}</td>
                                                                <td>{o.percentOwned}</td>
                                                                <td>{o.percentDistributed}</td>
                                                                <td>{o.contractExpiration || '—'}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                    {pm.distributions && (
                                        <>
                                            <Field label="Payment Type" value={pm.distributions.paymentType} />
                                            <Field label="Reserve Funds" value={pm.distributions.reserveFunds} />
                                        </>
                                    )}
                                    <Field label="Vendor 1099 Payer" value={pm.vendor1099Payer} full />
                                    <Field label="Fiscal Year End" value={pm.fiscalYearEnd} />
                                </DetailSection>
                            )}

                            {/* ───── MANAGEMENT FEES ───── */}
                            {(pm.managementFee || pm.leaseFeePercent) && (
                                <DetailSection title="Management Fees" icon={<DollarSign size={12} />} defaultOpen={false}>
                                    <Field label="Management Fee" value={pm.managementFee} />
                                    <Field label="When Vacant" value={pm.managementFeeWhenVacant} />
                                    <Field label="Lease Fee Type" value={pm.leaseFeeType} />
                                    <Field label="Lease Fee Percent" value={pm.leaseFeePercent} />
                                    <Field label="Renewal Fee Type" value={pm.renewalFeeType} />
                                    <Field label="Renewal Fee Percent" value={pm.renewalFeePercent} />
                                </DetailSection>
                            )}

                            {/* ───── PURCHASE HISTORY (Task 1.3) ───── */}
                            {(() => {
                                const ph = selected.purchaseHistory;
                                if (!ph || ph.length === 0) return null;
                                const crumb = (next: boolean) => {
                                    try {
                                        Sentry.addBreadcrumb({
                                            category: 'ui.click',
                                            message: `properties.purchaseHistory.${next ? 'expand' : 'collapse'}`,
                                            level: 'info',
                                            data: { propertyId: selected.id, entries: ph.length },
                                        });
                                    } catch { /* Sentry no-op when DSN unset */ }
                                };
                                return (
                                    <ErrorBoundary fallback={<div style={{ padding: '8px 14px', fontSize: 11, color: '#f87171', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, marginBottom: 10 }}>Purchase History unavailable.</div>}>
                                        <DetailSection title="Purchase History" icon={<History size={12} />} defaultOpen={false} onToggle={crumb}>
                                            <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="purchase-history-section">
                                                {ph.map((p, i) => (
                                                    <div key={i} data-testid={`purchase-history-entry-${i}`} style={{ padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
                                                        <Field label="Purchase Date" value={p.purchaseDate} />
                                                        <Field label="Amount" value={`$${p.amount.toLocaleString()}`} />
                                                        <Field label="Seller" value={p.seller || '—'} />
                                                        <Field label="Settlement Agent" value={p.settlementAgent || '—'} />
                                                        <Field label="Parcel" value={p.parcel || '—'} full />
                                                        {p.notes && <Field label="Notes" value={p.notes} full />}
                                                    </div>
                                                ))}
                                            </div>
                                        </DetailSection>
                                    </ErrorBoundary>
                                );
                            })()}

                            {/* ───── LATE FEE POLICY (Task 1.3 — typed preferred, legacy fallback) ───── */}
                            {(() => {
                                const lfp: LateFeePolicy | undefined = selected.lateFeePolicy ?? pm.lateFeePolicy;
                                if (!lfp) return null;
                                const crumb = (next: boolean) => {
                                    try {
                                        Sentry.addBreadcrumb({
                                            category: 'ui.click',
                                            message: `properties.lateFeePolicy.${next ? 'expand' : 'collapse'}`,
                                            level: 'info',
                                            data: { propertyId: selected.id, source: selected.lateFeePolicy ? 'typed' : 'metadata' },
                                        });
                                    } catch { /* no-op */ }
                                };
                                return (
                                    <ErrorBoundary fallback={<div style={{ padding: '8px 14px', fontSize: 11, color: '#f87171', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, marginBottom: 10 }}>Late Fee Policy unavailable.</div>}>
                                        <DetailSection title="Late Fee Policy" icon={<AlertTriangle size={12} />} defaultOpen={false} onToggle={crumb}>
                                            <Field label="Effective On" value={lfp.effectiveOn ?? undefined} />
                                            <Field label="Base Amount" value={lfp.baseAmount ?? undefined} />
                                            <Field label="Eligible Charges" value={lfp.eligibleCharges ?? undefined} />
                                            <Field label="Daily Amount / Monthly Max" value={lfp.dailyAmountMonthlyMax ?? undefined} />
                                            <Field label="Grace Period" value={lfp.gracePeriod ?? undefined} />
                                            <Field label="Grace Balance" value={lfp.graceBalance ?? undefined} />
                                        </DetailSection>
                                    </ErrorBoundary>
                                );
                            })()}

                            {/* ───── INSPECTIONS ───── */}
                            <DetailSection title={`Inspections (${(Array.isArray(pm.inspections) ? pm.inspections : []).length})`} icon={<ListChecks size={12} />} defaultOpen={false}>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                                        <button 
                                            onClick={() => setShowInspectionForm(true)}
                                            style={{
                                                background: 'rgba(214,254,81,0.1)', border: '1px solid rgba(214,254,81,0.2)',
                                                color: '#D6FE51', padding: '4px 10px', borderRadius: 6, fontSize: 10,
                                                fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                                            }}
                                        ><Plus size={10} /> Add Inspection</button>
                                    </div>
                                    {Array.isArray(pm.inspections) && pm.inspections.length > 0 ? (
                                        <div className="s-table-wrap">
                                            <table className="s-table" style={{ fontSize: 11 }}>
                                                <thead><tr><th>Date</th><th>Type</th><th>Score/Pass</th><th>Notes</th></tr></thead>
                                                <tbody>
                                                    {[...pm.inspections].sort((a,b) => b.date.localeCompare(a.date)).map((insp: any) => (
                                                        <tr key={insp.id}>
                                                            <td style={{ whiteSpace: 'nowrap', color: '#cbd5e1' }}>{insp.date}</td>
                                                            <td><span style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4 }}>{insp.type}</span></td>
                                                            <td><span className={`s-badge ${insp.status === 'Pass' ? 'active' : insp.status === 'Fail' ? 'turn' : 'maintenance'}`}>{insp.status} {insp.score ? `(${insp.score})` : ''}</span></td>
                                                            <td style={{ color: '#94a3b8' }}>{insp.notes || '—'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div style={{ textAlign: 'center', color: '#64748b', fontSize: 11, padding: 12 }}>No inspections recorded.</div>
                                    )}
                                </div>
                            </DetailSection>

                            {/* ───── BUDGETS & FINANCIALS ───── */}
                            <DetailSection title="Budgets & Financials" icon={<PieChart size={12} />} defaultOpen={false}>
                                <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                                    <button 
                                        onClick={() => { setBudgetFormData(pm.budgets || {}); setShowBudgetForm(true); }}
                                        style={{
                                            background: 'rgba(214,254,81,0.1)', border: '1px solid rgba(214,254,81,0.2)',
                                            color: '#D6FE51', padding: '4px 10px', borderRadius: 6, fontSize: 10,
                                            fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4
                                        }}
                                    ><Settings2 size={10} /> Update Budgets</button>
                                </div>
                                <Field label="Annual Operating Budget" value={pm.budgets?.annualOperatingBudget ? `$${Number(pm.budgets.annualOperatingBudget).toLocaleString()}` : '—'} />
                                <Field label="Target Operating Reserve" value={pm.budgets?.targetOperatingReserve ? `$${Number(pm.budgets.targetOperatingReserve).toLocaleString()}` : '—'} />
                                <Field label="Current Escrow Balance" value={pm.budgets?.escrowBalance ? `$${Number(pm.budgets.escrowBalance).toLocaleString()}` : '—'} />
                                <Field label="Capital Expenditure Budget" value={pm.budgets?.capexBudget ? `$${Number(pm.budgets.capexBudget).toLocaleString()}` : '—'} />
                                <Field label="Variance Threshold Amount ($)" value={pm.budgets?.varianceThresholdAmount ? `$${Number(pm.budgets.varianceThresholdAmount).toLocaleString()}` : '—'} />
                                <Field label="Variance Threshold (%)" value={pm.budgets?.varianceThresholdPercentage ? `${pm.budgets.varianceThresholdPercentage}%` : '—'} />
                            </DetailSection>

                            {/* ───── MAINTENANCE CONFIG (Task 1.3 — typed preferred, legacy fallback) ───── */}
                            {(() => {
                                const mc: MaintenanceConfig | undefined = selected.maintenanceConfig;
                                const hasTyped = !!mc;
                                const hasLegacy = !!(pm.maintenanceLimit || pm.hasHomeWarranty || pm.maintenanceNotes);
                                if (!hasTyped && !hasLegacy) return null;
                                // Prefer typed fields per-slot; fall back to legacy metadata reads.
                                const limit = mc?.maintenanceLimit != null ? `$${mc.maintenanceLimit.toLocaleString()}` : pm.maintenanceLimit;
                                const insuranceExp = mc?.insuranceExpiration ?? pm.insuranceExpiration;
                                const warranty = mc ? (mc.homeWarranty ? 'Yes' : 'No') : pm.hasHomeWarranty;
                                const preAuth = mc ? (mc.preAuthEntry ? 'Yes' : 'No') : pm.unitEntryPreauthorized;
                                const notes = mc?.notes ?? pm.maintenanceNotes;
                                const crumb = (next: boolean) => {
                                    try {
                                        Sentry.addBreadcrumb({
                                            category: 'ui.click',
                                            message: `properties.maintenanceConfig.${next ? 'expand' : 'collapse'}`,
                                            level: 'info',
                                            data: { propertyId: selected.id, source: hasTyped ? 'typed' : 'metadata' },
                                        });
                                    } catch { /* no-op */ }
                                };
                                return (
                                    <ErrorBoundary fallback={<div style={{ padding: '8px 14px', fontSize: 11, color: '#f87171', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, marginBottom: 10 }}>Maintenance Configuration unavailable.</div>}>
                                        <DetailSection title="Maintenance Configuration" icon={<Wrench size={12} />} defaultOpen={false} onToggle={crumb}>
                                            <Field label="Maintenance Limit" value={limit} />
                                            <Field label="Insurance Expiration" value={insuranceExp} />
                                            <Field label="Has Home Warranty Coverage" value={warranty} />
                                            <Field label="Unit Entry Pre-authorized" value={preAuth} />
                                            <Field label="Maintenance Notes" value={notes} full />
                                            <Field label="Online Maintenance Request Instructions" value={pm.onlineMaintenanceRequestInstructions} full />
                                        </DetailSection>
                                    </ErrorBoundary>
                                );
                            })()}

                            {/* ───── FIXED ASSETS (Task 1.3 — typed preferred, legacy fallback) ───── */}
                            {(() => {
                                const typedAssets: FixedAsset[] | undefined = selected.fixedAssets;
                                const legacyAssets = Array.isArray(pm.fixedAssets) ? (pm.fixedAssets as FixedAsset[]) : [];
                                const assets: FixedAsset[] = (typedAssets && typedAssets.length > 0) ? typedAssets : legacyAssets;
                                if (assets.length === 0) return null;
                                const isOpen = expandedAssets === selected.id;
                                const source = typedAssets && typedAssets.length > 0 ? 'typed' : 'metadata';
                                const toggle = () => {
                                    const next = !isOpen;
                                    setExpandedAssets(next ? selected.id : null);
                                    try {
                                        Sentry.addBreadcrumb({
                                            category: 'ui.click',
                                            message: `properties.fixedAssets.${next ? 'expand' : 'collapse'}`,
                                            level: 'info',
                                            data: { propertyId: selected.id, count: assets.length, source },
                                        });
                                    } catch { /* no-op */ }
                                };
                                return (
                                    <ErrorBoundary fallback={<div style={{ padding: '8px 14px', fontSize: 11, color: '#f87171', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, marginBottom: 10 }}>Fixed Assets unavailable.</div>}>
                                        <div className="s-glass-card" data-testid="fixed-assets-collapsible">
                                            <div
                                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', marginBottom: isOpen ? '1rem' : 0 }}
                                                onClick={toggle}
                                            >
                                                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
                                                    <Wrench size={16} />
                                                    Fixed Assets
                                                    <span style={{ fontSize: '0.8rem', opacity: 0.6, fontWeight: 400 }}>({assets.length})</span>
                                                </h3>
                                                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                            </div>
                                            {isOpen && <FixedAssetsTable assets={assets} />}
                                        </div>
                                    </ErrorBoundary>
                                );
                            })()}

                            {/* ───── PROPERTY GROUPS ───── */}
                            {pm.propertyGroups && (
                                <DetailSection title="Property Groups" icon={<Building2 size={12} />} defaultOpen={false}>
                                    <Field label="Property Groups" value={pm.propertyGroups} full />
                                </DetailSection>
                            )}

                            {/* ───── STATEMENT SETTINGS ───── */}
                            {pm.statementSettings && (
                                <DetailSection title="Statement Settings" icon={<Settings2 size={12} />} defaultOpen={false}>
                                    <Field label="Use Enhanced Statement" value={pm.statementSettings.useEnhancedStatement} />
                                    <Field label="Include Current & Upcoming Charges" value={pm.statementSettings.includeCurrentUpcomingCharges} />
                                    <Field label="Include Upcoming in Amount Due" value={pm.statementSettings.includeUpcomingChargesInAmountDue} />
                                    <Field label="Include Custom Message" value={pm.statementSettings.includeCustomMessage} />
                                    <Field label="Include Logo" value={pm.statementSettings.includeLogo} />
                                    <Field label="Charge History Includes" value={pm.statementSettings.chargeHistoryIncludes} />
                                    <Field label="Include Payment Due Date" value={pm.statementSettings.includePaymentDueDate} />
                                    <Field label="Include Payment History" value={pm.statementSettings.includePaymentHistoryAndBalanceForward} />
                                    <Field label="Show Remaining Past Due" value={pm.statementSettings.showRemainingAmountDuePastDue} />
                                    <Field label="Include Subsidized Charges" value={pm.statementSettings.includeSubsidizedCharges} />
                                </DetailSection>
                            )}

                            {/* ───── BANK ACCOUNTS ───── */}
                            {pm.bankAccounts?.length > 0 && (
                                <DetailSection title={`Bank Accounts (${pm.bankAccounts.length})`} icon={<CreditCard size={12} />} defaultOpen={false}>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <div className="s-table-wrap">
                                            <table className="s-table" style={{ fontSize: 11 }}>
                                                <thead><tr><th>Cash GL Account</th><th>Bank Account</th><th>Enabled</th></tr></thead>
                                                <tbody>
                                                    {pm.bankAccounts.map((ba: any, i: number) => (
                                                        <tr key={i}>
                                                            <td className="s-td-bold" style={{ whiteSpace: 'nowrap' }}>{ba.glAccount}</td>
                                                            <td style={{ fontSize: 11, color: '#94a3b8' }}>
                                                                {ba.bankAccount}
                                                                {ba.purpose && (
                                                                    <div style={{ fontSize: 10, color: '#475569', marginTop: 1 }}>({ba.purpose})</div>
                                                                )}
                                                            </td>
                                                            <td>
                                                                <span style={{
                                                                    fontSize: 10, padding: '1px 6px', borderRadius: 4, fontWeight: 600,
                                                                    background: ba.paymentsEnabled ? 'rgba(16,185,129,0.12)' : 'rgba(100,116,139,0.12)',
                                                                    color: ba.paymentsEnabled ? '#10b981' : '#64748b',
                                                                }}>{ba.paymentsEnabled ? 'Enabled' : 'Not Enabled'}</span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </DetailSection>
                            )}
                            </>)}

                            {/* ═══════ TAB: UNITS ═══════ */}
                            {activeTab === 'units' && (<>
                            {/* Turn Board */}
                            {hasPermission('strata:properties:turn-board') && units.length > 0 && (
                                <div className="s-glass-card">
                                    <h3 style={{ marginBottom: '1rem' }}>Turn Board</h3>
                                    <div className="s-turn-board">
                                        {[...units].sort((a, b) => {
                                            const numA = parseInt(String(a.unitNumber).replace(/\D/g, '')) || 0;
                                            const numB = parseInt(String(b.unitNumber).replace(/\D/g, '')) || 0;
                                            return numA - numB || String(a.unitNumber).localeCompare(String(b.unitNumber));
                                        }).map(u => (
                                            <div
                                                key={u.id}
                                                className="s-turn-cell"
                                                style={{
                                                    borderColor: getStatusColor(u.status),
                                                    cursor: 'pointer',
                                                    outline: selectedUnit?.id === u.id ? '2px solid var(--s-accent, #6366f1)' : 'none',
                                                    outlineOffset: -2,
                                                }}
                                                onClick={() => selectUnit(u)}
                                            >
                                                <div className="s-turn-unit">{u.unitNumber}</div>
                                                <div className="s-turn-status" style={{ color: getStatusColor(u.status) }}>{u.status}</div>
                                                {(u.rentAmount ?? 0) > 0 && <div className="s-turn-rent">${(u.rentAmount ?? 0).toLocaleString()}</div>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Units Table — CLICKABLE ROWS */}
                            {hasPermission('strata:properties:units-table') && units.length > 0 && (
                                <div className="s-glass-card">
                                    <h3 style={{ marginBottom: '1rem' }}>
                                        Units
                                        <span style={{ fontSize: '0.8rem', opacity: 0.5, fontWeight: 400, marginLeft: 8 }}>
                                            Click a unit to view tenant details
                                        </span>
                                    </h3>
                                    <div className="s-table-wrap">
                                        <table className="s-table">
                                            <thead>
                                                <tr>
                                                    <th>Unit</th>
                                                    <th>Bed/Bath</th>
                                                    <th>Sq Ft</th>
                                                    <th>Rent</th>
                                                    <th>Status</th>
                                                    <th>Lease Dates</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {[...units].sort((a, b) => {
                                                    const numA = parseInt(String(a.unitNumber).replace(/\D/g, '')) || 0;
                                                    const numB = parseInt(String(b.unitNumber).replace(/\D/g, '')) || 0;
                                                    return numA - numB || String(a.unitNumber).localeCompare(String(b.unitNumber));
                                                }).map(u => (
                                                    <tr
                                                        key={u.id}
                                                        onClick={() => selectUnit(u)}
                                                        style={{
                                                            cursor: 'pointer',
                                                            background: selectedUnit?.id === u.id ? 'rgba(214,254,81,0.08)' : undefined,
                                                            borderLeft: selectedUnit?.id === u.id ? '3px solid #6366f1' : '3px solid transparent',
                                                            transition: 'all 0.15s ease',
                                                        }}
                                                        onMouseEnter={e => { if (selectedUnit?.id !== u.id) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                                                        onMouseLeave={e => { if (selectedUnit?.id !== u.id) e.currentTarget.style.background = ''; }}
                                                    >
                                                        <td className="s-td-bold">{u.unitNumber}</td>
                                                        <td>{u.bedrooms ?? 0}bd / {u.bathrooms ?? 0}ba</td>
                                                        <td>{(u.sqFt ?? 0).toLocaleString()}</td>
                                                        <td>${(u.rentAmount ?? 0).toLocaleString()}</td>
                                                        <td><span className={`s-badge ${u.status}`}>{u.status}</span></td>
                                                        <td>{u.leaseStart && u.leaseEnd ? `${u.leaseStart} — ${u.leaseEnd}` : '—'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                            </>)}

                            {/* ═══════ TAB: DOCUMENTS ═══════ */}
                            {activeTab === 'documents' && (<>
                            {/* ───── PHOTOS ───── */}
                            <DetailSection title={`Photos (${(Array.isArray(pm.photos) ? pm.photos : []).length})`} icon={<Camera size={12} />} defaultOpen={false}>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    {/* Photo Grid */}
                                    {Array.isArray(pm.photos) && pm.photos.length > 0 && (
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
                                            {pm.photos.map((photo: any) => (
                                                <div key={photo.id} style={{
                                                    position: 'relative', borderRadius: 8, overflow: 'hidden',
                                                    border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.2)',
                                                }}>
                                                    <img
                                                        src={photo.dataUrl}
                                                        alt={photo.name}
                                                        style={{ width: '100%', height: 120, objectFit: 'cover', display: 'block' }}
                                                    />
                                                    <div style={{
                                                        padding: '4px 8px', fontSize: 10, color: '#94a3b8',
                                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                    }}>{photo.name}</div>
                                                    <button
                                                        onClick={() => deletePhoto(photo.id)}
                                                        style={{
                                                            position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)',
                                                            border: 'none', color: '#ef4444', borderRadius: 4, padding: 3, cursor: 'pointer',
                                                        }}
                                                    ><Trash2 size={12} /></button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {/* Upload Area */}
                                    <label style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                        padding: '16px 20px', border: '2px dashed rgba(214,254,81,0.25)',
                                        borderRadius: 10, cursor: 'pointer', transition: 'all 0.15s',
                                        color: '#D6FE51', fontSize: 12, fontWeight: 600,
                                        background: 'rgba(214,254,81,0.04)',
                                    }}
                                        onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#D6FE51'; e.currentTarget.style.background = 'rgba(214,254,81,0.1)'; }}
                                        onDragLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(214,254,81,0.25)'; e.currentTarget.style.background = 'rgba(214,254,81,0.04)'; }}
                                        onDrop={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = 'rgba(214,254,81,0.25)'; addPhotos(e.dataTransfer.files); }}
                                    >
                                        <input
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            style={{ display: 'none' }}
                                            onChange={(e) => addPhotos(e.target.files)}
                                        />
                                        {savingPhoto ? (
                                            <><RefreshCw size={14} className="spin" /> Uploading...</>
                                        ) : (
                                            <><Upload size={14} /> Drop photos here or click to upload</>
                                        )}
                                    </label>
                                </div>
                            </DetailSection>

                            {/* ───── NOTES ───── */}
                            <DetailSection title={`Notes (${(Array.isArray(pm.notes) ? pm.notes : []).length})`} icon={<StickyNote size={12} />} defaultOpen={false}>
                                <div style={{ gridColumn: '1 / -1' }}>
                                    {/* Add Note Form */}
                                    <div style={{
                                        marginBottom: 12, padding: '10px 14px', background: 'rgba(214,254,81,0.05)',
                                        borderRadius: 10, border: '1px solid rgba(214,254,81,0.15)',
                                    }}>
                                        <textarea
                                            value={newNoteText}
                                            onChange={(e) => setNewNoteText(e.target.value)}
                                            placeholder="Add a note..."
                                            style={{
                                                width: '100%', minHeight: 60, background: 'rgba(0,0,0,0.2)',
                                                border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
                                                padding: '8px 12px', color: '#e2e8f0', fontSize: 12,
                                                fontFamily: 'inherit', resize: 'vertical',
                                            }}
                                        />
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                                            <button
                                                onClick={addNote}
                                                disabled={!newNoteText.trim() || savingNote}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: 6,
                                                    padding: '6px 14px', borderRadius: 6,
                                                    background: newNoteText.trim() ? '#D6FE51' : 'rgba(100,116,139,0.2)',
                                                    border: 'none', color: '#fff', fontSize: 11,
                                                    fontWeight: 600, cursor: newNoteText.trim() ? 'pointer' : 'not-allowed',
                                                    transition: 'all 0.15s',
                                                }}
                                            >
                                                {savingNote ? <RefreshCw size={12} className="spin" /> : <Send size={12} />}
                                                {savingNote ? 'Saving...' : 'Add Note'}
                                            </button>
                                        </div>
                                    </div>
                                    {/* Existing Notes */}
                                    {Array.isArray(pm.notes) && pm.notes.map((note: any) => (
                                        <div key={note.id} style={{ position: 'relative' }}>
                                            <NoteCard note={note} />
                                            <button
                                                onClick={() => deleteNote(note.id)}
                                                title="Delete note"
                                                style={{
                                                    position: 'absolute', top: 10, right: 10,
                                                    background: 'none', border: 'none', color: '#475569',
                                                    cursor: 'pointer', padding: 2, borderRadius: 4,
                                                    transition: 'color 0.15s',
                                                }}
                                                onMouseEnter={(e) => { (e.target as HTMLElement).style.color = '#ef4444'; }}
                                                onMouseLeave={(e) => { (e.target as HTMLElement).style.color = '#475569'; }}
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    ))}
                                    {(!Array.isArray(pm.notes) || pm.notes.length === 0) && (
                                        <div style={{ textAlign: 'center', padding: '12px', color: '#475569', fontSize: 12 }}>
                                            No notes yet. Add one above.
                                        </div>
                                    )}
                                </div>
                            </DetailSection>
                            </>)}

                            {/* ═══════ OPTIONAL MODULE TABS ═══════ */}
                            {enabledModules.map(mod => {
                                if (activeTab !== mod.key) return null;
                                const ModComponent = mod.component;
                                return <ModComponent key={mod.key} propertyId={selected.id} />;
                            })}

                            {/* ═══════ TAB: WORK ═══════ */}
                            {activeTab === 'work' && (<>
                            {/* ═══════ PHASE 2: Card-based Workitems ═══════ */}
                            {(() => {
                                // Collate all workitems from linked data
                                const allItems: Workitem[] = linkedData
                                    ? [...linkedData.workitems, ...linkedData.legal, ...linkedData.compliance]
                                    : [];

                                // Split by tracking state
                                const activeItems = allItems.filter(w => (w.trackingState || 'active') === 'active');
                                const inactiveItems = allItems.filter(w => (w.trackingState || 'active') === 'inactive');
                                const viewItems = workTrackingFilter === 'active' ? activeItems : inactiveItems;

                                // Apply status + priority + domain filters
                                let filtered = viewItems;
                                if (workStatusFilter !== 'all') filtered = filtered.filter(w => w.status === workStatusFilter);
                                if (workPriorityFilter !== 'all') filtered = filtered.filter(w => w.priority === workPriorityFilter);
                                if (workDomainFilter !== 'all') filtered = filtered.filter(w => (w.domain || 'general') === workDomainFilter);
                                if (workSearchQuery.trim()) {
                                    const q = workSearchQuery.toLowerCase();
                                    filtered = filtered.filter(w => w.title.toLowerCase().includes(q) || (w.description || '').toLowerCase().includes(q));
                                }

                                // Unique statuses, priorities, and domains for filter pills
                                const statuses = [...new Set(viewItems.map(w => w.status))];
                                const priorities = [...new Set(viewItems.map(w => w.priority))];
                                const domains = [...new Set(viewItems.map(w => w.domain || 'general'))];

                                const handleDeactivate = async (id: string) => {
                                    await strataPost(`/workitems/${id}/deactivate`, {});
                                    if (selected) queryClient.invalidateQueries({ queryKey: strataKeys.linkedData(selected.id) });
                                };
                                const handleReactivate = async (id: string) => {
                                    await strataPost(`/workitems/${id}/reactivate`, {});
                                    if (selected) queryClient.invalidateQueries({ queryKey: strataKeys.linkedData(selected.id) });
                                };

                                const statusColor = (s: string) => {
                                    switch (s) {
                                        case 'open': return '#3b82f6';
                                        case 'in_progress': return '#f59e0b';
                                        case 'review': return '#a855f7';
                                        case 'completed': return '#22c55e';
                                        case 'cancelled': return '#64748b';
                                        case 'on_hold': return '#ef4444';
                                        default: return '#94a3b8';
                                    }
                                };
                                const priorityColor = (p: string) => {
                                    switch (p) {
                                        case 'critical': return '#ef4444';
                                        case 'high': return '#f97316';
                                        case 'medium': return '#eab308';
                                        case 'low': return '#22c55e';
                                        default: return '#94a3b8';
                                    }
                                };

                                return (
                                    <div className="s-glass-card" style={{ overflow: 'hidden' }}>
                                        {/* ── Header ── */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                                            <ListChecks size={18} color="#818cf8" />
                                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#e2e8f0' }}>Work Items</h3>
                                            <span style={{
                                                fontSize: 11, padding: '2px 8px', borderRadius: 10,
                                                background: 'rgba(214,254,81,0.15)', color: '#D6FE51', fontWeight: 600,
                                            }}>{activeItems.length} active / {inactiveItems.length} inactive</span>
                                        </div>

                                        {/* ── Active / Inactive Toggle ── */}
                                        <div className="s-tracking-toggle" style={{ display: 'flex', gap: 0, marginBottom: 12, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 3, width: 'fit-content' }}>
                                            <button
                                                onClick={() => { setWorkTrackingFilter('active'); setWorkSearchQuery(''); }}
                                                style={{
                                                    padding: '6px 16px', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
                                                    background: workTrackingFilter === 'active' ? 'rgba(214,254,81,0.25)' : 'transparent',
                                                    color: workTrackingFilter === 'active' ? '#D6FE51' : '#64748b',
                                                }}
                                            >
                                                <Power size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                                                Active ({activeItems.length})
                                            </button>
                                            <button
                                                onClick={() => setWorkTrackingFilter('inactive')}
                                                style={{
                                                    padding: '6px 16px', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600,
                                                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
                                                    background: workTrackingFilter === 'inactive' ? 'rgba(239,68,68,0.15)' : 'transparent',
                                                    color: workTrackingFilter === 'inactive' ? '#fca5a5' : '#64748b',
                                                }}
                                            >
                                                <Archive size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
                                                Inactive ({inactiveItems.length})
                                            </button>
                                        </div>

                                        {/* ── Filter Pills ── */}
                                        <div className="s-filter-pills" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                                            {/* Status */}
                                            <button
                                                onClick={() => setWorkStatusFilter('all')}
                                                style={{
                                                    padding: '3px 10px', borderRadius: 12, border: '1px solid',
                                                    borderColor: workStatusFilter === 'all' ? 'rgba(214,254,81,0.4)' : 'rgba(255,255,255,0.08)',
                                                    background: workStatusFilter === 'all' ? 'rgba(214,254,81,0.15)' : 'transparent',
                                                    color: workStatusFilter === 'all' ? '#D6FE51' : '#64748b',
                                                    fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                                }}
                                            >All Status</button>
                                            {statuses.map(s => (
                                                <button key={s}
                                                    onClick={() => setWorkStatusFilter(s)}
                                                    style={{
                                                        padding: '3px 10px', borderRadius: 12, border: '1px solid',
                                                        borderColor: workStatusFilter === s ? `${statusColor(s)}66` : 'rgba(255,255,255,0.08)',
                                                        background: workStatusFilter === s ? `${statusColor(s)}20` : 'transparent',
                                                        color: workStatusFilter === s ? statusColor(s) : '#64748b',
                                                        fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
                                                    }}
                                                >{s.replace('_', ' ')}</button>
                                            ))}
                                            <span style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.06)', margin: '0 4px' }} />
                                            {/* Priority */}
                                            <button
                                                onClick={() => setWorkPriorityFilter('all')}
                                                style={{
                                                    padding: '3px 10px', borderRadius: 12, border: '1px solid',
                                                    borderColor: workPriorityFilter === 'all' ? 'rgba(214,254,81,0.4)' : 'rgba(255,255,255,0.08)',
                                                    background: workPriorityFilter === 'all' ? 'rgba(214,254,81,0.15)' : 'transparent',
                                                    color: workPriorityFilter === 'all' ? '#D6FE51' : '#64748b',
                                                    fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                                }}
                                            >All Priority</button>
                                            {priorities.map(p => (
                                                <button key={p}
                                                    onClick={() => setWorkPriorityFilter(p)}
                                                    style={{
                                                        padding: '3px 10px', borderRadius: 12, border: '1px solid',
                                                        borderColor: workPriorityFilter === p ? `${priorityColor(p)}66` : 'rgba(255,255,255,0.08)',
                                                        background: workPriorityFilter === p ? `${priorityColor(p)}20` : 'transparent',
                                                        color: workPriorityFilter === p ? priorityColor(p) : '#64748b',
                                                        fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
                                                    }}
                                                >{p}</button>
                                            ))}
                                            {domains.length > 1 && <>
                                            <span style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.06)', margin: '0 4px' }} />
                                            {/* Domain / Module filter */}
                                            <button
                                                onClick={() => setWorkDomainFilter('all')}
                                                style={{
                                                    padding: '3px 10px', borderRadius: 12, border: '1px solid',
                                                    borderColor: workDomainFilter === 'all' ? 'rgba(214,254,81,0.4)' : 'rgba(255,255,255,0.08)',
                                                    background: workDomainFilter === 'all' ? 'rgba(214,254,81,0.15)' : 'transparent',
                                                    color: workDomainFilter === 'all' ? '#D6FE51' : '#64748b',
                                                    fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                                }}
                                            >All Modules</button>
                                            {domains.map(d => (
                                                <button key={d}
                                                    onClick={() => setWorkDomainFilter(d)}
                                                    style={{
                                                        padding: '3px 10px', borderRadius: 12, border: '1px solid',
                                                        borderColor: workDomainFilter === d ? 'rgba(6,182,212,0.4)' : 'rgba(255,255,255,0.08)',
                                                        background: workDomainFilter === d ? 'rgba(6,182,212,0.15)' : 'transparent',
                                                        color: workDomainFilter === d ? '#67e8f9' : '#64748b',
                                                        fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize',
                                                    }}
                                                >{d}</button>
                                            ))}
                                            </>}
                                        </div>

                                        {/* ── Search (shown on inactive view) ── */}
                                        {workTrackingFilter === 'inactive' && (
                                            <div style={{ position: 'relative', marginBottom: 12 }}>
                                                <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: '#475569' }} />
                                                <input
                                                    type="text"
                                                    placeholder="Search inactive items..."
                                                    value={workSearchQuery}
                                                    onChange={e => setWorkSearchQuery(e.target.value)}
                                                    style={{
                                                        width: '100%', padding: '8px 10px 8px 32px', borderRadius: 8,
                                                        border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)',
                                                        color: '#e2e8f0', fontSize: 12, fontFamily: 'inherit', outline: 'none',
                                                    }}
                                                />
                                            </div>
                                        )}

                                        {/* ── Card Grid ── */}
                                        {filtered.length === 0 ? (
                                            <div style={{ textAlign: 'center', color: '#475569', fontSize: 13, padding: '24px 0' }}>
                                                {workTrackingFilter === 'active' ? 'No active work items' : 'No inactive items found'}
                                            </div>
                                        ) : (
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                                                {filtered.map(item => (
                                                    <div
                                                        key={item.id}
                                                        className="s-workitem-card"
                                                        onClick={() => setExpandedWorkitem(item)}
                                                        style={{
                                                            padding: '14px 16px', borderRadius: 10,
                                                            background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)',
                                                            cursor: 'pointer', transition: 'all 0.2s',
                                                        }}
                                                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(214,254,81,0.3)'; }}
                                                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
                                                    >
                                                        {/* Card header — title + badges */}
                                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                                                            <span style={{ flex: 1, fontWeight: 600, fontSize: 13, color: '#e2e8f0', lineHeight: 1.3 }}>{item.title}</span>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                                                            <span style={{
                                                                fontSize: 9, padding: '2px 7px', borderRadius: 6, fontWeight: 700, textTransform: 'uppercase',
                                                                background: `${statusColor(item.status)}18`, color: statusColor(item.status),
                                                            }}>{item.status.replace('_', ' ')}</span>
                                                            <span style={{
                                                                fontSize: 9, padding: '2px 7px', borderRadius: 6, fontWeight: 700, textTransform: 'uppercase',
                                                                background: `${priorityColor(item.priority)}18`, color: priorityColor(item.priority),
                                                            }}>{item.priority}</span>
                                                            <span style={{
                                                                fontSize: 9, padding: '2px 7px', borderRadius: 6, fontWeight: 600,
                                                                background: 'rgba(214,254,81,0.1)', color: '#D6FE51',
                                                            }}>{item.domain}</span>
                                                        </div>
                                                        {/* Description snippet */}
                                                        {item.description && (
                                                            <p style={{ margin: '0 0 8px', fontSize: 11, color: '#94a3b8', lineHeight: 1.4, maxHeight: 36, overflow: 'hidden' }}>
                                                                {item.description.slice(0, 120)}{item.description.length > 120 ? '…' : ''}
                                                            </p>
                                                        )}
                                                        {/* Footer — meta + action */}
                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 10, color: '#475569' }}>
                                                            <span>{item.type}{item.dueDate ? ` • Due ${item.dueDate.slice(0, 10)}` : ''}</span>
                                                            {workTrackingFilter === 'active' ? (
                                                                <button
                                                                    onClick={e => { e.stopPropagation(); handleDeactivate(item.id); }}
                                                                    title="Deactivate"
                                                                    style={{
                                                                        display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
                                                                        borderRadius: 6, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.08)',
                                                                        color: '#fca5a5', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                                                    }}
                                                                >
                                                                    <Archive size={10} /> Deactivate
                                                                </button>
                                                            ) : (
                                                                <button
                                                                    onClick={e => { e.stopPropagation(); handleReactivate(item.id); }}
                                                                    title="Reactivate"
                                                                    style={{
                                                                        display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
                                                                        borderRadius: 6, border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.08)',
                                                                        color: '#86efac', fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                                                    }}
                                                                >
                                                                    <ArchiveRestore size={10} /> Reactivate
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* ───── AUDIT LOG ───── */}
                            {pm.auditLog?.length > 0 && (
                                <DetailSection title={`Audit Log (${pm.auditLog.length})`} icon={<History size={12} />} defaultOpen={false}>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        {pm.auditLog.map((entry: any, i: number) => (
                                            <div key={i} style={{
                                                display: 'flex', gap: 10, padding: '6px 0',
                                                borderBottom: i < pm.auditLog.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                                                fontSize: 12, alignItems: 'flex-start',
                                            }}>
                                                <div style={{ color: '#475569', fontSize: 11, whiteSpace: 'nowrap', minWidth: 120 }}>
                                                    {entry.date} {entry.time}
                                                </div>
                                                <div style={{ color: '#94a3b8', flex: 1 }}>{entry.action}</div>
                                                <div style={{ color: '#D6FE51', fontSize: 11, whiteSpace: 'nowrap', fontWeight: 500 }}>
                                                    {entry.user}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </DetailSection>
                            )}

                            {/* ───── ATTACHMENTS ───── */}
                            {pm.attachments?.length > 0 && (
                                <DetailSection title={`Attachments (${pm.attachments.length})`} icon={<Paperclip size={12} />} defaultOpen={false}>
                                    <div style={{ gridColumn: '1 / -1' }}>
                                        <div className="s-table-wrap">
                                            <table className="s-table" style={{ fontSize: 11 }}>
                                                <thead><tr><th>File</th><th>Uploaded By</th><th>Date</th></tr></thead>
                                                <tbody>
                                                    {pm.attachments.map((att: any, i: number) => (
                                                        <tr key={i}>
                                                            <td>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                    <FileText size={13} color="#6366f1" />
                                                                    <span style={{ color: '#cbd5e1' }}>{att.name}</span>
                                                                </div>
                                                            </td>
                                                            <td style={{ color: '#94a3b8' }}>{att.uploadedBy}</td>
                                                            <td style={{ color: '#64748b', whiteSpace: 'nowrap' }}>{att.date}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </DetailSection>
                            )}

                            {/* ── Feature 3: Property Linked Items ── */}
                            {linkedData && (
                                <div className="s-glass-card" style={{ overflow: 'hidden' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1rem' }}>
                                        <Link2 size={18} color="#818cf8" />
                                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>Linked Items</h3>
                                        <span style={{
                                            fontSize: 11, padding: '2px 8px', borderRadius: 10,
                                            background: linkedData.summary.total > 0 ? 'rgba(214,254,81,0.15)' : 'rgba(100,116,139,0.1)',
                                            color: linkedData.summary.total > 0 ? '#D6FE51' : '#64748b', fontWeight: 600,
                                        }}>{linkedData.summary.total} total</span>
                                    </div>

                                    {/* ── WorkItems Section ── */}
                                    {(() => {
                                        const sections: { key: string; label: string; icon: React.ReactNode; items: any[]; color: string; emptyMsg: string }[] = [
                                            { key: 'workitems', label: 'Workitems', icon: <Wrench size={14} />, items: linkedData.workitems, color: '#D6FE51', emptyMsg: 'No workitems linked' },
                                            { key: 'legal', label: 'Legal Issues', icon: <Scale size={14} />, items: linkedData.legal, color: '#f59e0b', emptyMsg: 'No legal issues' },
                                            { key: 'compliance', label: 'Compliance', icon: <ClipboardCheck size={14} />, items: linkedData.compliance, color: '#22c55e', emptyMsg: 'No compliance items' },
                                            { key: 'incidents', label: 'Incidents', icon: <AlertTriangle size={14} />, items: linkedData.incidents, color: '#ef4444', emptyMsg: 'No incidents reported' },
                                            { key: 'entityLinks', label: 'Cross-Links', icon: <Link2 size={14} />, items: linkedData.entityLinks, color: '#06b6d4', emptyMsg: 'No entity links' },
                                        ];

                                        return sections.map(sec => (
                                            <div key={sec.key} style={{
                                                borderTop: '1px solid rgba(255,255,255,0.04)',
                                            }}>
                                                <button
                                                    onClick={() => setExpandedLinkedSection(expandedLinkedSection === sec.key ? null : sec.key)}
                                                    style={{
                                                        width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                                                        padding: '10px 14px', border: 'none', background: 'none',
                                                        color: '#e2e8f0', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                                    }}
                                                >
                                                    <span style={{ color: sec.color, display: 'flex' }}>{sec.icon}</span>
                                                    {sec.label}
                                                    <span style={{
                                                        fontSize: 10, padding: '1px 6px', borderRadius: 8, marginLeft: 4,
                                                        background: sec.items.length > 0 ? `${sec.color}15` : 'rgba(100,116,139,0.1)',
                                                        color: sec.items.length > 0 ? sec.color : '#475569', fontWeight: 700,
                                                    }}>{sec.items.length}</span>
                                                    <span style={{ marginLeft: 'auto', color: '#475569' }}>
                                                        {expandedLinkedSection === sec.key ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                    </span>
                                                </button>

                                                {expandedLinkedSection === sec.key && (
                                                    <div style={{ padding: '0 14px 12px' }}>
                                                        {sec.items.length === 0 ? (
                                                            <div style={{ textAlign: 'center', color: '#475569', fontSize: 12, padding: '8px 0' }}>
                                                                {sec.emptyMsg}
                                                            </div>
                                                        ) : (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                                {sec.items.map((item: any) => {
                                                                    // Entity links have a different shape
                                                                    if (sec.key === 'entityLinks') {
                                                                        return (
                                                                            <div key={item.id} style={{
                                                                                padding: '8px 12px', borderRadius: 8,
                                                                                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                                                                                fontSize: 12, color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: 8,
                                                                            }}>
                                                                                <Link2 size={12} color="#06b6d4" />
                                                                                <span style={{ fontWeight: 600 }}>{item.targetType}</span>
                                                                                <span style={{ color: '#64748b' }}>→</span>
                                                                                <span>{item.note || item.linkType || 'related'}</span>
                                                                            </div>
                                                                        );
                                                                    }

                                                                    // Incidents have their own shape
                                                                    if (sec.key === 'incidents') {
                                                                        const sevColor = item.severity === 'high' ? '#ef4444' : item.severity === 'medium' ? '#f59e0b' : '#22c55e';
                                                                        return (
                                                                            <div key={item.id} style={{
                                                                                padding: '8px 12px', borderRadius: 8,
                                                                                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                                                                                cursor: 'pointer', transition: 'all 0.15s',
                                                                            }}
                                                                                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                                                                                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                                                                            >
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                                                                    <span style={{ fontWeight: 600, fontSize: 13, color: '#e2e8f0' }}>{item.title}</span>
                                                                                    <span style={{
                                                                                        fontSize: 9, padding: '1px 6px', borderRadius: 6,
                                                                                        background: `${sevColor}15`, color: sevColor, fontWeight: 700, textTransform: 'uppercase',
                                                                                    }}>{item.severity}</span>
                                                                                    <span className={`s-badge ${item.status}`} style={{ fontSize: '0.55rem' }}>{item.status}</span>
                                                                                </div>
                                                                                <div style={{ fontSize: 11, color: '#64748b' }}>{item.category} • {item.reportedAt || item.createdAt}</div>
                                                                            </div>
                                                                        );
                                                                    }

                                                                    // Workitems / Legal / Compliance
                                                                    return (
                                                                        <div
                                                                            key={item.id}
                                                                            onClick={() => setExpandedWorkitem(item)}
                                                                            style={{
                                                                                padding: '8px 12px', borderRadius: 8,
                                                                                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                                                                                cursor: 'pointer', transition: 'all 0.15s',
                                                                            }}
                                                                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.borderColor = `${sec.color}40`; }}
                                                                            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; }}
                                                                        >
                                                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                                                                <span style={{ fontWeight: 600, fontSize: 13, color: '#e2e8f0' }}>{item.title}</span>
                                                                                <span className={`s-badge ${item.status}`} style={{ fontSize: '0.55rem' }}>{item.status}</span>
                                                                                {item.priority && (
                                                                                    <span style={{
                                                                                        fontSize: 9, padding: '1px 6px', borderRadius: 6,
                                                                                        background: item.priority === 'high' ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.06)',
                                                                                        color: item.priority === 'high' ? '#ef4444' : '#94a3b8', fontWeight: 600, textTransform: 'uppercase',
                                                                                    }}>{item.priority}</span>
                                                                                )}
                                                                            </div>
                                                                            {item.description && (
                                                                                <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', lineHeight: 1.4, maxHeight: 40, overflow: 'hidden' }}>
                                                                                    {item.description.slice(0, 150)}{item.description.length > 150 ? '…' : ''}
                                                                                </p>
                                                                            )}
                                                                            <div style={{ marginTop: 4, fontSize: 10, color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                                                <span>{item.domain} • {item.type}{(item.metadata as any)?.trelloCardId && ' • via Trello'}</span>
                                                                                <span style={{ color: '#D6FE51', fontWeight: 500 }}>Click to expand →</span>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ));
                                    })()}
                                </div>
                            )}
                            </>)}

                            {/* Task 3.3 — AppFolio property-detail tab parity (v1 L168). Stubs
                             * only; Phase-5 wires real content. Each branch renders the matching
                             * Placeholder component (defined at top of file alongside Residents/
                             * Legal/Incidents). Append-after-existing per DoR (e). */}
                            {activeTab === 'budget' && <BudgetPlaceholder propertyId={selected.id} />}
                            {activeTab === 'marketing' && <MarketingPlaceholder propertyId={selected.id} />}
                            {activeTab === 'comparables' && <ComparablesPlaceholder propertyId={selected.id} />}
                            {activeTab === 'showing-settings' && <ShowingSettingsPlaceholder propertyId={selected.id} />}

                            {/* ───── DYNAMIC SPACES & ENTITY LINKS (always visible) ───── */}
                            <ProfileSpaces entityType="property" entityId={selected.id} />
                        </div>

                        {/* ── Right column: Tenant detail panel (Units tab only) ── */}
                        {activeTab === 'units' && selectedUnit && (
                            <div style={{
                                width: 380, minWidth: 340, flexShrink: 0,
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.06)',
                                borderRadius: 12, overflow: 'auto', padding: 16,
                                maxHeight: 'calc(100vh - 160px)',
                            }}>
                                {/* Unit header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#e2e8f0' }}>
                                            Unit {selectedUnit.unitNumber}
                                        </h3>
                                        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                                            <span style={{
                                                padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                                                background: selectedUnit.status === 'occupied' ? 'rgba(16,185,129,0.12)' : 'rgba(59,130,246,0.12)',
                                                color: selectedUnit.status === 'occupied' ? '#10b981' : '#3b82f6',
                                                textTransform: 'uppercase',
                                            }}>{selectedUnit.status}</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => { setSelectedUnit(null); setMatchedTenant(null); }}
                                        style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
                                    >×</button>
                                </div>

                                {/* Unit quick stats */}
                                <div style={{
                                    display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14,
                                    padding: '10px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 8,
                                    border: '1px solid rgba(255,255,255,0.04)',
                                }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>{selectedUnit.bedrooms ?? 0}/{selectedUnit.bathrooms ?? 0}</div>
                                        <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Bed/Bath</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>{(selectedUnit.sqFt ?? 0).toLocaleString()}</div>
                                        <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Sq Ft</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 16, fontWeight: 700, color: '#10b981' }}>${(selectedUnit.rentAmount ?? 0).toLocaleString()}</div>
                                        <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Rent</div>
                                    </div>
                                </div>

                                {/* Tenant info */}
                                {matchedTenant ? (
                                    <>
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
                                            padding: '10px 14px', background: 'rgba(214,254,81,0.06)', borderRadius: 10,
                                            border: '1px solid rgba(214,254,81,0.15)',
                                        }}>
                                            <div style={{
                                                width: 36, height: 36, borderRadius: '50%',
                                                background: 'rgba(214,254,81,0.2)', color: '#D6FE51',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontWeight: 700, fontSize: 14,
                                            }}>
                                                {matchedTenant.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <button className="s-resident-link" style={{ fontWeight: 700, fontSize: 15 }} onClick={() => navigateToResident(matchedTenant!.id)}>{matchedTenant.name}</button>
                                                <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                                                    <span style={{
                                                        padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600,
                                                        background: matchedTenant.status === 'active' ? 'rgba(16,185,129,0.12)' : 'rgba(100,116,139,0.12)',
                                                        color: matchedTenant.status === 'active' ? '#10b981' : '#64748b',
                                                        textTransform: 'uppercase',
                                                    }}>{matchedTenant.status}</span>
                                                    {md.tenantType && (
                                                        <span style={{
                                                            padding: '1px 6px', borderRadius: 4, fontSize: 9, fontWeight: 600,
                                                            background: 'rgba(214,254,81,0.12)', color: '#D6FE51',
                                                        }}>{md.tenantType}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Contact */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14, fontSize: 13, color: '#94a3b8' }}>
                                            {matchedTenant.email && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Mail size={13} color="#64748b" /> {matchedTenant.email}</div>}
                                            {matchedTenant.phone && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Phone size={13} color="#64748b" /> {matchedTenant.phone}</div>}
                                        </div>

                                        {/* Lease & Property */}
                                        <DetailSection title="Lease & Property" icon={<Home size={12} />}>
                                            <Field label="Property" value={md.propertyName} full />
                                            <Field label="Unit" value={md.unit} />
                                            <Field label="Move-in" value={md.moveIn} />
                                            <Field label="Lease From" value={md.leaseFrom} />
                                            <Field label="Lease To" value={md.leaseTo} />
                                            <Field label="Last Lease Renewal" value={md.lastLeaseRenewal} />
                                            <Field label="Rent" value={md.rent ? `$${md.rent}` : undefined} />
                                            <Field label="Deposit" value={md.deposit ? `$${md.deposit}` : undefined} />
                                            <Field label="Unit Type" value={md.unitType} />
                                            <Field label="Birthdate" value={md.birthdate} />
                                        </DetailSection>

                                        {/* Rent Increases */}
                                        <DetailSection title="Rent Increases" icon={<DollarSign size={12} />} defaultOpen={false}>
                                            <Field label="Eligible for Rent Increase" value={md.eligibleForRentIncrease} />
                                            <Field label="Last Rent Increase" value={md.lastRentIncrease} />
                                            <Field label="Next Rent Increase Date" value={md.nextRentIncreaseDate} />
                                        </DetailSection>

                                        {/* Online Portal */}
                                        <DetailSection title="Online Portal" icon={<Globe size={12} />} defaultOpen={false}>
                                            <Field label="Portal Activated" value={md.onlinePortalActivated} />
                                            <Field label="Portal Login" value={md.onlinePortalLogin} full />
                                            <Field label="Recurring Payments Total" value={md.onlinePaymentsRecurringTotal} />
                                            <Field label="Send Rent Reminders" value={md.sendRentReminders} />
                                        </DetailSection>

                                        {/* Late Fees */}
                                        <DetailSection title="Late Fees & Charges" icon={<AlertTriangle size={12} />} defaultOpen={false}>
                                            <Field label="Late Fee Type" value={md.lateFeeType} />
                                            <Field label="Late Fee Base Amount" value={md.lateFeeBaseAmount ? `$${md.lateFeeBaseAmount}` : undefined} />
                                            <Field label="Grace Period" value={md.gracePeriod ? `${md.gracePeriod} days` : undefined} />
                                            <Field label="NSF Fee Amount" value={md.nsfFeeAmount ? `$${md.nsfFeeAmount}` : undefined} />
                                        </DetailSection>

                                        {/* Insurance */}
                                        <DetailSection title="Insurance" icon={<Shield size={12} />} defaultOpen={false}>
                                            <Field label="Provider" value={md.insuranceProvider} full />
                                            <Field label="Expiration" value={md.insuranceExpiration} />
                                            <Field label="Policy Number" value={md.insurancePolicyNumber} />
                                        </DetailSection>

                                        {/* Other */}
                                        <DetailSection title="Other" icon={<FileText size={12} />} defaultOpen={false}>
                                            <Field label="Primary Tenant" value={md.primaryTenant} />
                                            <Field label="License Plates" value={md.licensePlates} />
                                            <Field label="Pets" value={md.pets} />
                                            <Field label="Tenant Notes" value={md.tenantNotes} full />
                                        </DetailSection>
                                    </>
                                ) : (
                                    <div style={{
                                        padding: 24, textAlign: 'center', color: '#475569',
                                        background: 'rgba(255,255,255,0.02)', borderRadius: 10,
                                        border: '1px solid rgba(255,255,255,0.04)',
                                    }}>
                                        <User size={32} strokeWidth={1} style={{ marginBottom: 8, opacity: 0.5 }} />
                                        <p style={{ margin: 0, fontSize: 13 }}>
                                            {selectedUnit.status === 'vacant'
                                                ? 'This unit is currently vacant'
                                                : 'No tenant record found for this unit'}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Add Inspection Modal */}
            {showInspectionForm && selected && (
                <div className="s-modal-overlay" onClick={() => setShowInspectionForm(false)}>
                    <div className="s-modal" onClick={e => e.stopPropagation()}>
                        <div className="s-modal-header">
                            <h3>Add Property Inspection</h3>
                            <button className="s-btn-icon" onClick={() => setShowInspectionForm(false)}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleAddInspection}>
                            <div className="s-form-row">
                                <div className="s-form-group">
                                    <label>Date</label>
                                    <input type="date" required className="s-input" value={inspectionFormData.date} onChange={e => setInspectionFormData({...inspectionFormData, date: e.target.value})} />
                                </div>
                                <div className="s-form-group">
                                    <label>Type</label>
                                    <select className="s-input" value={inspectionFormData.type} onChange={e => setInspectionFormData({...inspectionFormData, type: e.target.value})}>
                                        <option value="Annual">Annual</option>
                                        <option value="Move-In">Move-In</option>
                                        <option value="Move-Out">Move-Out</option>
                                        <option value="Drive-By">Drive-By</option>
                                        <option value="Maintenance">Maintenance</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                            </div>
                            <div className="s-form-row">
                                <div className="s-form-group">
                                    <label>Status/Result</label>
                                    <select className="s-input" value={inspectionFormData.status} onChange={e => setInspectionFormData({...inspectionFormData, status: e.target.value})}>
                                        <option value="Pass">Pass</option>
                                        <option value="Fair">Fair</option>
                                        <option value="Fail">Fail</option>
                                        <option value="Pending">Pending</option>
                                    </select>
                                </div>
                                <div className="s-form-group">
                                    <label>Score (Optional)</label>
                                    <input className="s-input" placeholder="e.g. 95/100" value={inspectionFormData.score} onChange={e => setInspectionFormData({...inspectionFormData, score: e.target.value})} />
                                </div>
                            </div>
                            <div className="s-form-group" style={{ marginBottom: 20 }}>
                                <label>Notes</label>
                                <textarea className="s-input" style={{ minHeight: 60, resize: 'vertical' }} value={inspectionFormData.notes} onChange={e => setInspectionFormData({...inspectionFormData, notes: e.target.value})} />
                            </div>
                            <div className="s-modal-footer">
                                <button type="button" className="s-btn s-btn-ghost" onClick={() => setShowInspectionForm(false)}>Cancel</button>
                                <button type="submit" className="s-btn s-btn-primary">Save Inspection</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Edit Budget Modal */}
            {showBudgetForm && selected && (
                <div className="s-modal-overlay" onClick={() => setShowBudgetForm(false)}>
                    <div className="s-modal" onClick={e => e.stopPropagation()} style={{ width: 500 }}>
                        <div className="s-modal-header">
                            <h3>Update Budgets & Financials</h3>
                            <button className="s-btn-icon" onClick={() => setShowBudgetForm(false)}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleUpdateBudget}>
                            <div className="s-form-row">
                                <div className="s-form-group">
                                    <label>Annual Operating Budget ($)</label>
                                    <input type="number" className="s-input" value={budgetFormData.annualOperatingBudget || ''} onChange={e => setBudgetFormData({...budgetFormData, annualOperatingBudget: e.target.value})} />
                                </div>
                                <div className="s-form-group">
                                    <label>Target Operating Reserve ($)</label>
                                    <input type="number" className="s-input" value={budgetFormData.targetOperatingReserve || ''} onChange={e => setBudgetFormData({...budgetFormData, targetOperatingReserve: e.target.value})} />
                                </div>
                            </div>
                            <div className="s-form-row">
                                <div className="s-form-group">
                                    <label>Current Escrow Balance ($)</label>
                                    <input type="number" className="s-input" value={budgetFormData.escrowBalance || ''} onChange={e => setBudgetFormData({...budgetFormData, escrowBalance: e.target.value})} />
                                </div>
                                <div className="s-form-group">
                                    <label>CapEx Budget ($)</label>
                                    <input type="number" className="s-input" value={budgetFormData.capexBudget || ''} onChange={e => setBudgetFormData({...budgetFormData, capexBudget: e.target.value})} />
                                </div>
                            </div>
                            <h4 style={{ fontSize: 13, color: '#e2e8f0', margin: '16px 0 8px', paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>Operating Variance Thresholds</h4>
                            <div className="s-form-row">
                                <div className="s-form-group">
                                    <label>Amount Threshold ($)</label>
                                    <input type="number" className="s-input" value={budgetFormData.varianceThresholdAmount || ''} onChange={e => setBudgetFormData({...budgetFormData, varianceThresholdAmount: e.target.value})} />
                                </div>
                                <div className="s-form-group">
                                    <label>Percentage Threshold (%)</label>
                                    <input type="number" className="s-input" value={budgetFormData.varianceThresholdPercentage || ''} onChange={e => setBudgetFormData({...budgetFormData, varianceThresholdPercentage: e.target.value})} />
                                </div>
                            </div>
                            <div className="s-modal-footer" style={{ marginTop: 24 }}>
                                <button type="button" className="s-btn s-btn-ghost" onClick={() => setShowBudgetForm(false)}>Cancel</button>
                                <button type="submit" className="s-btn s-btn-primary">Save Budgets</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Trello Card Modal */}
            {
                expandedWorkitem && (
                    <TrelloCardModal workitem={expandedWorkitem} onClose={() => setExpandedWorkitem(null)} />
                )
            }

            {/* Delete Property Confirm */}
            {confirmDeleteProp && (
                <div className="s-modal-overlay" onClick={() => setConfirmDeleteProp(null)}>
                    <div className="s-modal" onClick={e => e.stopPropagation()} style={{ textAlign: 'center', maxWidth: 380 }}>
                        <Trash2 size={32} style={{ color: '#f87171', marginBottom: 12 }} />
                        <h3 style={{ margin: '0 0 8px' }}>Delete Property?</h3>
                        <p className="s-text-muted" style={{ marginBottom: 20 }}>This will permanently remove the property and all associated data. This action cannot be undone.</p>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
                            <button className="s-btn s-btn-ghost" onClick={() => setConfirmDeleteProp(null)}>Cancel</button>
                            <button className="s-btn" style={{ background: 'linear-gradient(135deg, #ef4444, #f87171)', color: '#fff', border: 'none' }}
                                onClick={() => handleDeleteProp(confirmDeleteProp)}>Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Property Modal (detail view) */}
            {showEditForm && selected && (
                <div className="s-modal-overlay" onClick={() => setShowEditForm(false)}>
                    <div className="s-modal" onClick={e => e.stopPropagation()} style={{ width: 600, maxWidth: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                        <div className="s-modal-header">
                            <h3>Edit Property Details</h3>
                            <button className="s-btn-icon" onClick={() => setShowEditForm(false)}><X size={18} /></button>
                        </div>
                        <form onSubmit={handleUpdate} style={{ flex: 1, overflowY: 'auto' }}>
                            <div className="s-form-group" style={{ marginBottom: 20 }}>
                                <div style={{ padding: '12px 16px', background: 'rgba(214,254,81,0.08)', borderRadius: 8, border: '1px solid rgba(214,254,81,0.2)' }}>
                                    <h4 style={{ margin: '0 0 4px 0', fontSize: 13, color: '#e2e8f0' }}>Editing: {selected.name}</h4>
                                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Update the extended property details tracked in Dwellium.</div>
                                </div>
                            </div>
                            <h4 style={{ fontSize: 12, color: '#D6FE51', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 6 }}>Turn & Showing</h4>
                            <div className="s-form-row">
                                <div className="s-form-group">
                                    <label>Rent Ready (Yes/No)</label>
                                    <select className="s-input" value={editFormData.rentReady || ''} onChange={e => setEditFormData({...editFormData, rentReady: e.target.value})}>
                                        <option value="">Select...</option><option value="Yes">Yes</option><option value="No">No</option>
                                    </select>
                                </div>
                                <div className="s-form-group">
                                    <label>Ready For Showing On</label>
                                    <input type="date" className="s-input" value={editFormData.readyForShowingOn || ''} onChange={e => setEditFormData({...editFormData, readyForShowingOn: e.target.value})} />
                                </div>
                            </div>
                            <div className="s-form-group" style={{ marginBottom: 20 }}>
                                <label>Lockbox Info</label>
                                <input className="s-input" placeholder="e.g. Front Door - Code: 1234" value={editFormData.lockbox || ''} onChange={e => setEditFormData({...editFormData, lockbox: e.target.value})} />
                            </div>
                            <h4 style={{ fontSize: 12, color: '#8cf8a2', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 6 }}>Property Descriptors</h4>
                            <div className="s-form-row">
                                <div className="s-form-group">
                                    <label>County</label>
                                    <input className="s-input" placeholder="e.g. King County" value={editFormData.county || ''} onChange={e => setEditFormData({...editFormData, county: e.target.value})} />
                                </div>
                                <div className="s-form-group">
                                    <label>Parcel ID</label>
                                    <input className="s-input" value={editFormData.parcel || ''} onChange={e => setEditFormData({...editFormData, parcel: e.target.value})} />
                                </div>
                            </div>
                            <div className="s-form-row">
                                <div className="s-form-group">
                                    <label>Year Built</label>
                                    <input className="s-input" placeholder="e.g. 1995" value={editFormData.yearBuilt || ''} onChange={e => setEditFormData({...editFormData, yearBuilt: e.target.value})} />
                                </div>
                                <div className="s-form-group">
                                    <label>Owner</label>
                                    <input className="s-input" value={editFormData.owner || ''} onChange={e => setEditFormData({...editFormData, owner: e.target.value})} />
                                </div>
                            </div>
                            <div className="s-form-group" style={{ marginBottom: 20 }}>
                                <label>Description Note</label>
                                <textarea className="s-input" style={{ minHeight: 60, resize: 'vertical' }} placeholder="Add general description notes here..." value={editFormData.description || ''} onChange={e => setEditFormData({...editFormData, description: e.target.value})} />
                            </div>
                            <h4 style={{ fontSize: 12, color: '#f8c28c', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 6 }}>Financial Baseline</h4>
                            <div className="s-form-row">
                                <div className="s-form-group">
                                    <label>Purchase Price</label>
                                    <input className="s-input" placeholder="$0.00" value={editFormData.purchasePrice || ''} onChange={e => setEditFormData({...editFormData, purchasePrice: e.target.value})} />
                                </div>
                                <div className="s-form-group">
                                    <label>Purchase Date</label>
                                    <input type="date" className="s-input" value={editFormData.purchaseDate || ''} onChange={e => setEditFormData({...editFormData, purchaseDate: e.target.value})} />
                                </div>
                            </div>
                            <div className="s-modal-footer" style={{ marginTop: 24 }}>
                                <button type="button" className="s-btn s-btn-ghost" onClick={() => setShowEditForm(false)}>Cancel</button>
                                <button type="submit" className="s-btn s-btn-primary">Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}

