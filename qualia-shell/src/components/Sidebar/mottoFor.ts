/**
 * mottoFor — plan 046 F2: sidebar motto keyed on the user's ROLE (a field
 * every user has) instead of a hardcoded per-person name map.
 * Roles per ROLE_HIERARCHY (context/UserContext.tsx).
 */
const MOTTOS: Record<string, string> = {
    tenant: 'Welcome home',
    agent: 'Leading the way forward',
    maintenance: 'Keep it all running',
    advisor: 'Wise counsel, sharp moves',
    management: 'Your portfolio, one screen',
    corporate: 'Strategy meets precision',
    god: 'Command the empire',
};

export const DEFAULT_MOTTO = "Let's get things done";

export function mottoFor(role: string | null | undefined): string {
    return (role && MOTTOS[role]) || DEFAULT_MOTTO;
}
