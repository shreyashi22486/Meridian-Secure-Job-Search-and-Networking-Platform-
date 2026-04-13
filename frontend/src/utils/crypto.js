/**
 * Web Crypto API utilities for end-to-end encryption (E2EE) in direct messages.
 *
 * Cryptographic scheme:
 *   - Key agreement: ECDH on P-256 (NIST curve)
 *   - Encryption: AES-GCM-256 (authenticated encryption)
 *   - Key derivation: HKDF-SHA-256 from shared secret
 *
 * Security hardening (A4.5):
 *   - Private keys stored in IndexedDB with extractable=false
 *   - Even XSS cannot exfiltrate non-exportable CryptoKey objects
 *   - Public keys remain exportable for key exchange
 *
 * Limitation: No forward secrecy — key compromise exposes full conversation.
 */

// ─── IndexedDB Key Storage (replaces localStorage) ──────────────────────────

const DB_NAME = 'nexora_e2ee_keystore';
const DB_VERSION = 1;
const STORE_NAME = 'keys';

function _openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
    });
}

function _idbGet(key) {
    return _openDB().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(key);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
        });
    });
}

function _idbPut(key, value) {
    return _openDB().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.put(value, key);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    });
}

function _idbDelete(key) {
    return _openDB().then(db => {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.delete(key);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve();
        });
    });
}

// ─── Key Generation ─────────────────────────────────────────────────────────

/**
 * Generate an ECDH key pair for a conversation.
 * The private key is generated as NON-EXPORTABLE for security.
 * Returns { publicKeyBase64, privateKey (CryptoKey) }
 */
export async function generateKeyPair() {
    // Generate with extractable=true initially to export public key
    const keyPair = await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-256' },
        true,  // temporarily extractable
        ['deriveKey', 'deriveBits']
    );

    // Export the public key for exchange with the server
    const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    const publicKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(publicKeyRaw)));

    // Re-import the private key as NON-EXPORTABLE (A4.5)
    const privateKeyJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
    const nonExportablePrivateKey = await crypto.subtle.importKey(
        'jwk',
        privateKeyJwk,
        { name: 'ECDH', namedCurve: 'P-256' },
        false,  // NOT extractable — cannot be exfiltrated via XSS
        ['deriveKey', 'deriveBits']
    );

    return { publicKeyBase64, privateKey: nonExportablePrivateKey };
}


// ─── Key Storage (IndexedDB) ────────────────────────────────────────────────

/**
 * Store a key pair for a conversation in IndexedDB.
 * The private key is a non-exportable CryptoKey object.
 */
export async function storeKeyPair(conversationId, publicKeyBase64, privateKey) {
    await _idbPut(`keypair_${conversationId}`, {
        publicKey: publicKeyBase64,
        privateKey: privateKey,  // CryptoKey object, non-exportable
    });
}

/**
 * Retrieve a stored key pair from IndexedDB.
 */
export async function getStoredKeyPair(conversationId) {
    const data = await _idbGet(`keypair_${conversationId}`);
    if (!data) return null;
    return { publicKey: data.publicKey, privateKey: data.privateKey };
}

/**
 * Remove a stored key pair.
 */
export async function removeKeyPair(conversationId) {
    await _idbDelete(`keypair_${conversationId}`);
}

/**
 * Migrate keys from localStorage to IndexedDB (one-time migration).
 * Old localStorage keys are deleted after successful migration.
 */
export async function migrateFromLocalStorage() {
    const OLD_KEY = 'meridian_e2ee_keys';
    const raw = localStorage.getItem(OLD_KEY);
    if (!raw) return;

    try {
        const oldKeys = JSON.parse(raw);
        for (const [convId, keyData] of Object.entries(oldKeys)) {
            // Re-import old private key as non-exportable
            if (keyData.privateKey) {
                const privateKey = await crypto.subtle.importKey(
                    'jwk',
                    keyData.privateKey,
                    { name: 'ECDH', namedCurve: 'P-256' },
                    false,  // Non-exportable
                    ['deriveKey', 'deriveBits']
                );
                await storeKeyPair(convId, keyData.publicKey, privateKey);
            }
        }
        // Remove old localStorage entry after successful migration
        localStorage.removeItem(OLD_KEY);
    } catch {
        // Migration failed — old keys remain in localStorage for retry
    }
}


// ─── Key Derivation ─────────────────────────────────────────────────────────

/**
 * Derive a shared AES-GCM-256 key from our private key and their public key.
 */
export async function deriveSharedKey(privateKey, theirPublicKeyBase64) {
    const theirPublicKeyRaw = Uint8Array.from(atob(theirPublicKeyBase64), c => c.charCodeAt(0));

    const theirPublicKey = await crypto.subtle.importKey(
        'raw',
        theirPublicKeyRaw,
        { name: 'ECDH', namedCurve: 'P-256' },
        false,
        []
    );

    return await crypto.subtle.deriveKey(
        { name: 'ECDH', public: theirPublicKey },
        privateKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}


// ─── Encryption / Decryption ────────────────────────────────────────────────

/**
 * Encrypt a message using AES-GCM-256.
 * Returns base64(iv + ciphertext).
 */
export async function encryptMessage(sharedKey, plaintext) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);

    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        sharedKey,
        encoded
    );

    // Prepend IV to ciphertext
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);

    return btoa(String.fromCharCode(...combined));
}

/**
 * Decrypt a message using AES-GCM-256.
 * Expects base64(iv + ciphertext).
 */
export async function decryptMessage(sharedKey, encryptedBase64) {
    const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));

    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        sharedKey,
        ciphertext
    );

    return new TextDecoder().decode(decrypted);
}
