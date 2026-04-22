/**
 * FieldGuard — Role-gated rendering wrapper
 *
 * Renders children only if the current user's role meets the minimum threshold.
 * Falls back to nothing (or optional fallback) if insufficient role.
 */

import { ReactNode } from 'react';
import { useUser } from '../../context/UserContext';

interface FieldGuardProps {
    /** Minimum role required to render children */
    minRole: string;
    /** Content to render if role requirement is met */
    children: ReactNode;
    /** Optional fallback content when role is insufficient */
    fallback?: ReactNode;
}

export default function FieldGuard({ minRole, children, fallback = null }: FieldGuardProps) {
    const { hasMinRole, isAuthenticated } = useUser();

    if (!isAuthenticated || !hasMinRole(minRole)) {
        return <>{fallback}</>;
    }

    return <>{children}</>;
}
