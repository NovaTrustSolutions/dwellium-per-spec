import { describe, it, expect } from 'vitest';
import { localCategorize } from '../components/ThoughtWeaver/localCategorizer';

/**
 * These tests assert REAL behavior: a thought goes into the right bucket with a
 * usable confidence and label — with no LLM and no backend. This is the exact
 * path that previously dumped everything as needs_review/0. If the heuristic
 * regresses, this suite fails (unlike the old "6/6 gate", which could not).
 */
describe('localCategorize — offline thought classification', () => {
    it('files action-first sentences as admin/tasks', () => {
        const r = localCategorize('Call the plumber tomorrow about unit 4B');
        expect(r.filed_to).toBe('admin');
        expect(r.confidence).toBeGreaterThan(0.5);
        expect(r.source).toBe('local-heuristic');
    });

    it('files "need to ... by Friday" as admin/tasks', () => {
        const r = localCategorize('Need to email the insurance company by Friday');
        expect(r.filed_to).toBe('admin');
        expect(r.confidence).toBeGreaterThan(0.6);
    });

    it('files a person interaction as people, with the name as the label', () => {
        const r = localCategorize('Met Sarah at the conference to discuss the lease renewal');
        expect(r.filed_to).toBe('people');
        expect(r.destination_name).toBe('Sarah');
    });

    it('captures a two-word name from "Lunch with Mark Chen"', () => {
        const r = localCategorize('Lunch with Mark Chen next week to talk about Riverside');
        expect(r.filed_to).toBe('people');
        expect(r.destination_name).toBe('Mark Chen');
    });

    it('files project/delivery language as projects', () => {
        const r = localCategorize('Project Atlas is behind schedule, we still need to ship the API');
        expect(r.filed_to).toBe('projects');
        expect(r.confidence).toBeGreaterThan(0.6);
    });

    it('files speculative "what if" thoughts as ideas', () => {
        const r = localCategorize('What if we let tenants pay rent in crypto?');
        expect(r.filed_to).toBe('ideas');
    });

    it('files an explicit "Idea:" as ideas', () => {
        const r = localCategorize('Idea: a maintenance dashboard that predicts HVAC failures');
        expect(r.filed_to).toBe('ideas');
    });

    it('keeps truly ambiguous text as needs_review but still labels it (never confidence 0 when text exists)', () => {
        const r = localCategorize('zxcv asdf qwerty');
        expect(r.filed_to).toBe('needs_review');
        expect(r.confidence).toBeGreaterThan(0);          // NOT the old dead 0
        expect(r.destination_name).toBeTruthy();
    });

    it('returns needs_review/0 for empty input', () => {
        const r = localCategorize('   ');
        expect(r.filed_to).toBe('needs_review');
        expect(r.confidence).toBe(0);
    });

    it('is deterministic — identical input yields identical output', () => {
        const a = localCategorize('Schedule the Q3 vendor review and send the agenda');
        const b = localCategorize('Schedule the Q3 vendor review and send the agenda');
        expect(a).toEqual(b);
    });
});
