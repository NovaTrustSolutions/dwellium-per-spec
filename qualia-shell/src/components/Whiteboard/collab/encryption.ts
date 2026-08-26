/**
 * Vendored from Excalidraw (MIT) — see LICENSE.excalidraw in this directory.
 * Source: packages/excalidraw/data/encryption.ts @ v0.18.1, plus
 * `bytesToHexString` from packages/excalidraw/utils.ts @ v0.18.1.
 * Copyright (c) 2020 Excalidraw.
 *
 * Why vendored: `@excalidraw/excalidraw@0.18.1` exposes these only as type
 * declarations (`exports["./*"]` maps to .d.ts files, no runtime), so the
 * room client cannot import them from the package. Adaptations: Blob/File
 * input branch dropped (Dwellium only encrypts JSON strings/Uint8Array on
 * the socket path); ENCRYPTION_KEY_BITS inlined from constants.ts.
 */

/** packages/excalidraw/constants.ts @ v0.18.1 — AES-GCM 128 (jwk `k` = 22 base64url chars). */
export const ENCRYPTION_KEY_BITS = 128;

export const IV_LENGTH_BYTES = 12;

export const createIV = () => {
    const arr = new Uint8Array(IV_LENGTH_BYTES);
    return window.crypto.getRandomValues(arr);
};

/** packages/excalidraw/utils.ts @ v0.18.1 (used for room-id generation). */
export const bytesToHexString = (bytes: Uint8Array) => {
    return Array.from(bytes)
        .map((byte) => `0${byte.toString(16)}`.slice(-2))
        .join('');
};

export const generateEncryptionKey = async (): Promise<string> => {
    const key = await window.crypto.subtle.generateKey(
        {
            name: 'AES-GCM',
            length: ENCRYPTION_KEY_BITS,
        },
        true, // extractable
        ['encrypt', 'decrypt'],
    );
    const jwk = await window.crypto.subtle.exportKey('jwk', key);
    if (!jwk.k) {
        throw new Error("Couldn't generate room key");
    }
    return jwk.k;
};

export const getCryptoKey = (key: string, usage: KeyUsage) =>
    window.crypto.subtle.importKey(
        'jwk',
        {
            alg: 'A128GCM',
            ext: true,
            k: key,
            key_ops: ['encrypt', 'decrypt'],
            kty: 'oct',
        },
        {
            name: 'AES-GCM',
            length: ENCRYPTION_KEY_BITS,
        },
        false, // extractable
        [usage],
    );

export const encryptData = async (
    key: string | CryptoKey,
    data: Uint8Array | ArrayBuffer | string,
): Promise<{ encryptedBuffer: ArrayBuffer; iv: Uint8Array }> => {
    const importedKey = typeof key === 'string' ? await getCryptoKey(key, 'encrypt') : key;
    const iv = createIV();
    const buffer: ArrayBuffer | Uint8Array =
        typeof data === 'string' ? new TextEncoder().encode(data) : data;

    // We use symmetric encryption. AES-GCM is the recommended algorithm and
    // includes checks that the ciphertext has not been modified by an attacker.
    const encryptedBuffer = await window.crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv,
        },
        importedKey,
        buffer as ArrayBuffer | Uint8Array,
    );

    return { encryptedBuffer, iv };
};

export const decryptData = async (
    iv: Uint8Array,
    encrypted: Uint8Array | ArrayBuffer,
    privateKey: string,
): Promise<ArrayBuffer> => {
    const key = await getCryptoKey(privateKey, 'decrypt');
    return window.crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv,
        },
        key,
        encrypted,
    );
};
