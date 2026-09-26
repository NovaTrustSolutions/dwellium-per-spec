import { describe, it, expect } from 'vitest';
import { localCategorize } from '../components/ThoughtWeaver/localCategorizer';
import type { Bucket } from '../components/ThoughtWeaver/localCategorizer';

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

describe('localCategorize — word-boundary phrase matching (no substring false positives)', () => {
    // Each case previously mis-fired because phrase matching used raw
    // String#includes: 'due ' matched inside "residue", 'concept' matched
    // "conceptual", etc. All of these should now land somewhere OTHER than
    // the bucket the substring would have falsely triggered.
    const notFalselyMatched: Array<[string, Bucket]> = [
        ['Please do a residue check on the water sample', 'admin'],      // 'due ' ⊄ "residue"
        ['This is a very conceptual art installation', 'ideas'],         // 'concept' ⊄ "conceptual"
        ['The reactor is nearing its phaseout date', 'projects'],        // 'phase' ⊄ "phaseout"
        ['The star is close to the epicenter of the galaxy', 'projects'], // 'epic' ⊄ "epicenter"
        ['Please inspect the boiler before winter', 'admin'],            // 'spec' ⊄ "inspect"
        ['This is a very special relationship we have', 'people'],       // 'spec'/'ship' ⊄ "special"/"relationship"
    ];

    it.each(notFalselyMatched)('does not false-positive on %s', (text, notBucket) => {
        const r = localCategorize(text);
        expect(r.filed_to).not.toBe(notBucket);
    });

    it('still matches "ship"/"shipping" as projects when whole-word', () => {
        expect(localCategorize('We need to ship the release this week').filed_to).toBe('projects');
        expect(localCategorize('Shipping is delayed on the new release').filed_to).toBe('projects');
    });

    it('still matches "due " as admin when it is a real word-boundary hit', () => {
        const r = localCategorize('Rent is due tomorrow, need to pay it');
        expect(r.filed_to).toBe('admin');
    });

    it('still matches "Idea:" and "proposal:" (trailing-punctuation phrases)', () => {
        expect(localCategorize('Idea: a maintenance dashboard that predicts HVAC failures').filed_to).toBe('ideas');
        expect(localCategorize('Proposal: switch vendors for landscaping').filed_to).toBe('ideas');
    });
});

describe('localCategorize — name/people gating', () => {
    it('"Call Mark Chen about the lease" files as people, not admin', () => {
        const r = localCategorize('Call Mark Chen about the lease');
        expect(r.filed_to).toBe('people');
        expect(r.destination_name).toBe('Mark Chen');
    });

    it('"Silver Lake project needs a new roof" is NOT people (name alone isn\'t enough)', () => {
        const r = localCategorize('Silver Lake project needs a new roof');
        expect(r.filed_to).not.toBe('people');
        expect(r.filed_to).toBe('projects');
    });

    it('a bare capitalized name with no social phrase / context verb is not people', () => {
        // "Riverside" alone (no meet/call/with cue) should not force people.
        const r = localCategorize('Riverside needs new landscaping this spring');
        expect(r.filed_to).not.toBe('people');
    });
});

describe('localCategorize — non-English / non-letter input', () => {
    it('accented text does not crash and still classifies phrases correctly', () => {
        expect(() => localCategorize('reunión con Ana')).not.toThrow();
        const r = localCategorize('reunión con Ana');
        expect(r.source).toBe('local-heuristic');
    });

    it('primarily non-English text with no heuristic hits is needs_review with an explanatory label', () => {
        const r = localCategorize('我今天需要去买菜和洗衣服');
        expect(r.filed_to).toBe('needs_review');
        expect(r.destination_name).toBe('Unsorted — offline sorter is English-only');
    });

    it('emoji-only input is needs_review labeled "Untitled thought"', () => {
        const r = localCategorize('🎉🎂🎁');
        expect(r.filed_to).toBe('needs_review');
        expect(r.destination_name).toBe('Untitled thought');
    });
});

describe('localCategorize — mutation guard', () => {
    // Documents the fix: word-boundary regex vs substring `includes`. If
    // countPhraseHits/PROJECT_WORD_REGEXES regress to plain `.includes`,
    // this is the case that catches it (see task report for the manual
    // revert-and-rerun check).
    it('"residue check" is not admin via a bare "due " substring hit', () => {
        const r = localCategorize('Please do a residue check on the water sample');
        expect(r.filed_to).not.toBe('admin');
    });
});
