/**
 * E2EE Crypto utilities using Web Crypto API.
 *
 * For 1:1 direct conversations:
 * - Generate ECDH key pair (P-256)
 * - Derive shared AES-GCM key from ECDH key exchange
 * - Encrypt/decrypt messages client-side
 *
 * Server never sees plaintext for direct messages.
 */

// ─── Key Generation ─────────────────────────────────────────────────

/**
 * Generate an ECDH key pair for E2EE.
 * Returns { publicKey: base64, privateKey: base64 }
 */
export async function generateKeyPair() {
    const keyPair = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        true,
        ['deriveKey']
    );

    const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

    return {
        publicKey: arrayBufferToBase64(publicKeyRaw),
        privateKey: JSON.stringify(privateKeyJwk),
        keyPair,
    };
}

// ─── Key Import ─────────────────────────────────────────────────────

/**
 * Import a public key from base64 for ECDH.
 */
export async function importPublicKey(base64Key) {
    const raw = base64ToArrayBuffer(base64Key);
    return crypto.subtle.importKey(
        'raw', raw,
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        []
    );
}

/**
 * Import a private key from JWK for ECDH.
 */
export async function importPrivateKey(jwkString) {
    const jwk = JSON.parse(jwkString);
    return crypto.subtle.importKey(
        'jwk', jwk,
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        ['deriveKey']
    );
}

// ─── Key Derivation ─────────────────────────────────────────────────

/**
 * Derive a shared AES-GCM-256 key from ECDH private + remote public key.
 */
export async function deriveSharedKey(privateKey, publicKey) {
    return crypto.subtle.deriveKey(
        { name: 'ECDH', public: publicKey },
        privateKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

// ─── Encrypt / Decrypt ──────────────────────────────────────────────

/**
 * Encrypt a plaintext string with AES-GCM.
 * Returns { ciphertext: base64, nonce: base64 }
 */
export async function encrypt(sharedKey, plaintext) {
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit nonce
    const encoded = new TextEncoder().encode(plaintext);

    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        sharedKey,
        encoded
    );

    return {
        ciphertext: arrayBufferToBase64(ciphertext),
        nonce: arrayBufferToBase64(iv),
    };
}

/**
 * Decrypt a ciphertext with AES-GCM.
 * Returns plaintext string.
 */
export async function decrypt(sharedKey, ciphertextBase64, nonceBase64) {
    try {
        const iv = base64ToArrayBuffer(nonceBase64);
        const ciphertext = base64ToArrayBuffer(ciphertextBase64);

        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            sharedKey,
            ciphertext
        );

        return new TextDecoder().decode(decrypted);
    } catch {
        return '[unable to decrypt]';
    }
}

// ─── Base64 Utilities ───────────────────────────────────────────────

function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    bytes.forEach(b => binary += String.fromCharCode(b));
    return btoa(binary);
}

function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

// ─── Local Key Storage ──────────────────────────────────────────────

const KEY_STORAGE = 'meridian_e2ee_keys';

/**
 * Store key pair in localStorage (encrypted by the browser).
 * In production, consider IndexedDB with non-exportable keys.
 */
export function storeKeyPair(conversationId, publicKey, privateKey) {
    const stored = JSON.parse(localStorage.getItem(KEY_STORAGE) || '{}');
    stored[conversationId] = { publicKey, privateKey };
    localStorage.setItem(KEY_STORAGE, JSON.stringify(stored));
}

export function getStoredKeyPair(conversationId) {
    const stored = JSON.parse(localStorage.getItem(KEY_STORAGE) || '{}');
    return stored[conversationId] || null;
}
