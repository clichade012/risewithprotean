import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// RSA keys are stored in environment variables (privateKey and publicKey)
// Dotenv doesn't handle multiline values well, so we read directly from .env if needed

let cachedPrivateKey = null;
let cachedPublicKey = null;

const loadKeysFromEnvFile = () => {
    if (cachedPrivateKey && cachedPublicKey) return;

    try {
        const envPath = path.join(process.cwd(), '.env');
        const content = fs.readFileSync(envPath, 'utf8');

        // Extract privateKey - match from 'privateKey=' to '-----END RSA PRIVATE KEY-----'
        const privateMatch = content.match(/privateKey=['"]?(-----BEGIN RSA PRIVATE KEY-----[\s\S]*?-----END RSA PRIVATE KEY-----)/);
        if (privateMatch) {
            cachedPrivateKey = privateMatch[1];
        }

        // Extract publicKey - match from 'publicKey=' to '-----END PUBLIC KEY-----'
        const publicMatch = content.match(/publicKey=['"]?(-----BEGIN PUBLIC KEY-----[\s\S]*?-----END PUBLIC KEY-----)/);
        if (publicMatch) {
            cachedPublicKey = publicMatch[1];
        }
    } catch (err) {
        console.error('Error loading keys from .env file:', err.message);
    }
};

const getPrivateKey = () => {
    // First try process.env (works if keys are single-line with \n)
    let key = process.env.privateKey || process.env.RSA_PRIVATE_KEY;

    // If key is truncated (dotenv multiline issue), load from file
    if (!key?.includes('-----END')) {
        loadKeysFromEnvFile();
        key = cachedPrivateKey;
    }

    if (!key) {
        throw new Error('privateKey environment variable is not set');
    }
    return key;
};

const getPublicKey = () => {
    // First try process.env (works if keys are single-line with \n)
    let key = process.env.publicKey || process.env.RSA_PUBLIC_KEY;

    // If key is truncated (dotenv multiline issue), load from file
    if (!key?.includes('-----END')) {
        loadKeysFromEnvFile();
        key = cachedPublicKey;
    }

    if (!key) {
        throw new Error('publicKey environment variable is not set');
    }
    return key;
};

export const rsa_encrypt = function (toEncrypt) {
    const buffer = Buffer.from(toEncrypt);
    const encrypted = crypto.publicEncrypt({
        key: getPublicKey(),
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
    }, buffer);
    return encrypted.toString("base64");
};

export const rsa_decrypt = function (toDecrypt) {
    const buffer = Buffer.from(toDecrypt, "base64");
    const decrypted = crypto.privateDecrypt({
        key: getPrivateKey(),
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING
    }, buffer);
    console.log("decrypted",decrypted)
    return decrypted.toString("utf8");
};

export const rsa_set_key = function () {
    crypto.createPrivateKey(getPrivateKey());
};

export default {
    rsa_set_key,
    rsa_encrypt,
    rsa_decrypt
};
