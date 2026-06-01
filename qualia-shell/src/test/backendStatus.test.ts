import { describe, it, expect } from 'vitest';
import {
    isBackendDownMessage,
    isBackendDownError,
    friendlyLoadError,
    BACKEND_DOWN_MESSAGE,
} from '../lib/backendStatus';

describe('backendStatus — distinguishing "backend not up" from real errors', () => {
    it('recognizes browser network-failure phrasings as backend-down', () => {
        expect(isBackendDownMessage('Failed to fetch')).toBe(true);      // Chrome
        expect(isBackendDownMessage('Load failed')).toBe(true);          // Safari
        expect(isBackendDownMessage('NetworkError when attempting to fetch resource')).toBe(true); // Firefox
        expect(isBackendDownMessage('connect ECONNREFUSED 127.0.0.1:3000')).toBe(true);
    });

    it('does NOT misclassify genuine application errors as backend-down', () => {
        expect(isBackendDownMessage('500 Internal Server Error')).toBe(false);
        expect(isBackendDownMessage('Unauthorized')).toBe(false);
        expect(isBackendDownMessage(null)).toBe(false);
        expect(isBackendDownMessage('')).toBe(false);
    });

    it('isBackendDownError handles Error objects and strings', () => {
        expect(isBackendDownError(new Error('Failed to fetch'))).toBe(true);
        expect(isBackendDownError('ECONNREFUSED')).toBe(true);
        expect(isBackendDownError(new Error('validation failed'))).toBe(false);
    });

    it('friendlyLoadError shows the backend message only for backend-down causes', () => {
        expect(friendlyLoadError('Failed to fetch')).toBe(BACKEND_DOWN_MESSAGE);
        expect(friendlyLoadError('Load failed')).toBe(BACKEND_DOWN_MESSAGE);
        expect(friendlyLoadError('Schema validation error on /forecast')).toBe('Schema validation error on /forecast');
        expect(friendlyLoadError('')).toMatch(/something went wrong/i);
    });
});
