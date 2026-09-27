/**
 * categorizeTask table test — realistic property-management / small-business
 * to-do titles. Locks in the Phase 4 matcher fixes (bare "build"/"script" no
 * longer swallow non-dev tasks; "bill"/"call" recognized) without regressing
 * costAdvisor.test.ts's existing categorizeTask cases.
 */
import { describe, it, expect } from 'vitest';
import { categorizeTask, type TaskCategory } from '../lib/costAdvisor';

const CASES: Array<[string, TaskCategory]> = [
    ['Build the tenant onboarding checklist', 'general'],
    ['Pay the water bill by Friday', 'bookkeeping'],
    ["Reply to Maria's email about the lease", 'support'],
    ['Write the October newsletter', 'writing'],
    ['Draft an email to the landlord', 'writing'],
    ['Book the plumber', 'scheduling'],
    ['Call the electrician', 'scheduling'],
    ['Fix the login bug', 'dev'],
    ['Write a script for the promo video', 'writing'],
    ['Reconcile September expenses', 'bookkeeping'],
    ['Transcribe the board meeting', 'transcription'],
    ['Design a flyer for the open house', 'design'],
    ['Research property tax appeal deadlines', 'research'],
    ['Enter the new leases into the spreadsheet', 'data-entry'],
    ["Follow up with the insurance agent", 'scheduling'],
    ['Answer tenant tickets', 'support'],
    ['PR for the lease page', 'dev'],
    ['Schedule the move-in walkthrough', 'scheduling'],
    ['Draft the lease renewal letter', 'writing'],
    ['Debug the payment webhook', 'dev'],
    ['Compile competitor rent comps', 'research'],
    ['Summarize the HOA meeting minutes', 'transcription'],
    ['Update the accounts payable spreadsheet', 'bookkeeping'],
    ['Post the property listing photos', 'writing'],
    ['Invoice the tenant for late fees', 'bookkeeping'],
    ['Look up the zoning ordinance', 'research'],
    ['Coordinate the HVAC repair visit', 'scheduling'],
];

describe('categorizeTask — realistic to-do table', () => {
    it.each(CASES)('%s → %s', (title, expected) => {
        expect(categorizeTask(title)).toBe(expected);
    });

    it('covers at least 25 titles', () => {
        expect(CASES.length).toBeGreaterThanOrEqual(25);
    });
});
