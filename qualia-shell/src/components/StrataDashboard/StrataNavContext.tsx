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
}

const StrataNavContext = createContext<StrataNavContextValue>({
    navigateToProperty: () => {},
    navigateToResident: () => {},
    navigateToUnit: () => {},
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

    return (
        <StrataNavContext.Provider value={{ navigateToProperty, navigateToResident, navigateToUnit }}>
            {children}
        </StrataNavContext.Provider>
    );
}
