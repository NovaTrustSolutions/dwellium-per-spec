/**
 * StrataNavContext — Cross-module navigation context for StrataDashboard
 *
 * Provides navigation functions that any module can call to switch tabs
 * with a target entity selected. Avoids prop drilling through the module tree.
 *
 * - `navigateToProperty(propertyId)` → Properties tab with target selected
 * - `navigateToResident(residentId)` → Residents tab with target selected
 * - `navigateToUnit(unitId, propertyId)` → Properties tab with property open and unit selected
 */
import { createContext, useContext, useCallback } from 'react';
import type { StrataModule } from './strataTypes';

export interface SearchNavTarget {
    type: string;
    id: string;
    parentId?: string;
}

interface StrataNavContextValue {
    navigateToProperty: (propertyId: string) => void;
    navigateToResident: (residentId: string) => void;
    navigateToUnit: (unitId: string, propertyId: string) => void;
    navigateToVendor: (vendorId: string) => void;
    navigateToOwner: (ownerId: string) => void;
    navigateToWorkitem: (workitemId: string) => void;
    /** Type-keyed dispatch for generic callers (EntityLink). */
    navigateToEntity: (type: EntityLinkType, id: string, parentId?: string) => void;
}

/** Entity types EntityLink can link to — matches the searchNavTarget types the modules consume. */
export type EntityLinkType = 'property' | 'tenant' | 'unit' | 'vendor' | 'owner' | 'workitem';

const StrataNavContext = createContext<StrataNavContextValue>({
    navigateToProperty: () => {},
    navigateToResident: () => {},
    navigateToUnit: () => {},
    navigateToVendor: () => {},
    navigateToOwner: () => {},
    navigateToWorkitem: () => {},
    navigateToEntity: () => {},
});

export function useStrataNav(): StrataNavContextValue {
    return useContext(StrataNavContext);
}

interface StrataNavProviderProps {
    children: React.ReactNode;
    setActiveModule: (mod: StrataModule | 'settings') => void;
    setSearchNavTarget: (target: SearchNavTarget | null) => void;
}

export function StrataNavProvider({ children, setActiveModule, setSearchNavTarget }: StrataNavProviderProps) {
    const navigateToProperty = useCallback((propertyId: string) => {
        setSearchNavTarget({ type: 'property', id: propertyId });
        setActiveModule('properties');
    }, [setActiveModule, setSearchNavTarget]);

    const navigateToResident = useCallback((residentId: string) => {
        setSearchNavTarget({ type: 'tenant', id: residentId });
        setActiveModule('residents');
    }, [setActiveModule, setSearchNavTarget]);

    const navigateToUnit = useCallback((unitId: string, propertyId: string) => {
        setSearchNavTarget({ type: 'unit', id: unitId, parentId: propertyId });
        setActiveModule('properties');
    }, [setActiveModule, setSearchNavTarget]);

    const navigateToVendor = useCallback((vendorId: string) => {
        setSearchNavTarget({ type: 'vendor', id: vendorId });
        setActiveModule('vendors');
    }, [setActiveModule, setSearchNavTarget]);

    const navigateToOwner = useCallback((ownerId: string) => {
        setSearchNavTarget({ type: 'owner', id: ownerId });
        setActiveModule('owners');
    }, [setActiveModule, setSearchNavTarget]);

    const navigateToWorkitem = useCallback((workitemId: string) => {
        setSearchNavTarget({ type: 'workitem', id: workitemId });
        setActiveModule('work-orders');
    }, [setActiveModule, setSearchNavTarget]);

    const navigateToEntity = useCallback((type: EntityLinkType, id: string, parentId?: string) => {
        switch (type) {
            case 'property': navigateToProperty(id); break;
            case 'tenant': navigateToResident(id); break;
            case 'unit': navigateToUnit(id, parentId ?? ''); break;
            case 'vendor': navigateToVendor(id); break;
            case 'owner': navigateToOwner(id); break;
            case 'workitem': navigateToWorkitem(id); break;
        }
    }, [navigateToProperty, navigateToResident, navigateToUnit, navigateToVendor, navigateToOwner, navigateToWorkitem]);

    return (
        <StrataNavContext.Provider value={{ navigateToProperty, navigateToResident, navigateToUnit, navigateToVendor, navigateToOwner, navigateToWorkitem, navigateToEntity }}>
            {children}
        </StrataNavContext.Provider>
    );
}
