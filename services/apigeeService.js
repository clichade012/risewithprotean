import { logger as _logger } from '../logger/winston.js';
import fetch from 'cross-fetch';
import crypto from 'crypto';
import forge from 'node-forge';
import db from '../database/db_helper.js';


async function get_oauth_tokens() {
    let token = ''; let gen = true;
    const Settings = db.models.Settings;
    const row1 = await Settings.findOne({
        attributes: ['apigee_cst_access_token', 'apigee_cst_token_expiry']
    });
    if (row1?.apigee_cst_access_token?.length > 0 && row1.apigee_cst_token_expiry) {
        const newDate = new Date(row1.apigee_cst_token_expiry.getTime() - 5 * 60000);
        if (newDate > db.get_ist_current_date()) {
            token = row1.apigee_cst_access_token;
            gen = false;
        }
    }
    if (gen) {
        const response = await fetch(process.env.UAT_APIGEE_ENDPOINT + '/v1/oauth/token', {
            method: "POST",
            headers: {
                Authorization: "Basic " + btoa(process.env.UAT_APIGEE_API_KEY + ":" + process.env.UAT_APIGEE_SECRET_KEY) + "",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: "grant_type=client_credentials",
        });
        const data = await response.json();
        const istTimeString = new Date(data.expires_in).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
        await Settings.update(
            {
                apigee_cst_access_token: data.access_token,
                apigee_cst_token_expiry: istTimeString
            },
            { where: {} }
        );
        token = data.access_token;
    }
    return token;

}

const get_oauth_token = async () => {
    try {
        const response = await fetch(process.env.UAT_APIGEE_ENDPOINT + '/v1/oauth/token', {
            method: "POST",
            headers: {
                Authorization: "Basic " + btoa(process.env.UAT_APIGEE_API_KEY + ":" + process.env.UAT_APIGEE_SECRET_KEY) + "",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: "grant_type=client_credentials",
        });
        const data = await response.json();

        return data.access_token;
    } catch (err) {
        _logger.error(err.stack);
        return "";
    }
};

const mobileVerification = async (mobileId) => {
    let apiURL = '/api/v1/utilitybill/mobileauth';
    let jsonBody = {
        "countryCode": "91",
        "mobile": mobileId,
        "consent": "Y",
        "clientData": {
            "caseId": "123456"
        }
    }
    try {
        const data = await apigee_api_request_call(apiURL, "POST", jsonBody);
        console.log("res------------", data);
        const validateData = JSON.parse(data);
        // const isValidFlagSet = validateData.result?.isValid === true;
        const isValidFlagSet = validateData.result?.subscriberStatus && validateData.result.subscriberStatus !== 'INVALID';
        return !!isValidFlagSet;

    } catch (error) {
        console.log("Error in mobile verification:", error.message);
        return false;
    }
}

const emailVerification = async (emailId) => {
    let apiURL = '/api/v1/contactability/email';
    let jsonBody = {
        "email": emailId,
        "version": "2.1",
        "clientData": {
            "caseId": "123456"
        }
    }
    try {
        const data = await apigee_api_request_call(apiURL, "POST", jsonBody);
        console.log("res------------", data);
        const validateData = JSON.parse(data);
        console.log("validateData------------", validateData);
        const isValidFlagSet = validateData.result.data?.result !== 'invalid';
        return !!isValidFlagSet;
    } catch (error) {
        console.log("Error in Email verification:", error.message);
        return false;
    }
}

// Helper to parse response safely
const parseResponse = async (response) => {
    try {
        const response_data = await response.json();
        return { success: true, data: response_data };
    } catch (_) {
        return { success: false, data: response.statusText };
    }
};

// Helper to handle GET request
const handleGetRequest = async (URL, oauth_token) => {
    const response = await fetch(process.env.UAT_APIGEE_ENDPOINT + URL, {
        method: "GET",
        headers: {
            apikey: `${process.env.UAT_APIGEE_API_KEY}`,
            Authorization: `Bearer ${oauth_token}`,
            "Content-Type": "application/json",
        }
    });
    const parsed = await parseResponse(response);
    return parsed.success ? JSON.stringify(parsed.data) : parsed.data;
};

// Helper to handle POST request
const handlePostRequest = async (URL, oauth_token, json_body) => {
    const raw_data = encryptApigee(JSON.stringify(json_body));
    const payload_data = {
        data: raw_data.data,
        version: "1.0.0",
        symmetricKey: raw_data.key,
        hash: raw_data.hash,
        timestamp: new Date().toISOString(),
        requestId: crypto.randomUUID(),
    };

    const response = await fetch(process.env.UAT_APIGEE_ENDPOINT + URL, {
        method: "POST",
        headers: {
            apikey: `${process.env.UAT_APIGEE_API_KEY}`,
            Authorization: `Bearer ${oauth_token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload_data),
    });

    const parsed = await parseResponse(response);
    if (!parsed.success) return parsed.data;
    return decryptApigee(parsed.data.data, parsed.data.symmetricKey, parsed.data.hash);
};

const apigee_api_request_call = async (URL, method, json_body) => {
    try {
        const oauth_token = await get_oauth_token();
        const isGet = method.toUpperCase() === "GET";
        return isGet
            ? await handleGetRequest(URL, oauth_token)
            : await handlePostRequest(URL, oauth_token, json_body);
    } catch (err) {
        _logger.error(err.stack);
        return {};
    }
};

const random_key = (length) => {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = crypto.randomInt(0, charset.length);
        key += charset[randomIndex]
    }
    return key;
};

// Private key should be stored in environment variable APIGEE_PRIVATE_KEY
// In .env file, store the key as a single line with \n for newlines
const getPrivateKey = () => {
    if (process.env.APIGEE_PRIVATE_KEY) {
        return process.env.APIGEE_PRIVATE_KEY.replace(/\\n/g, '\n');
    }
    throw new Error('APIGEE_PRIVATE_KEY environment variable is not set');
};


let encPublicKeyString = `-----BEGIN PUBLIC KEY-----
MIIBITANBgkqhkiG9w0BAQEFAAOCAQ4AMIIBCQKCAQBw7Zq8McjphWnzjTN8T/0H
ukitNqWKSTIu6RWQP7OcuEuNQKTLE4Y5Cv+6gPoQslixD1KxHehJ7rqrm0lgGfL3
DVv5ljzNSzp+mYHwRaBghplXqjasE2BrI5uHwNMXgaZXbL8UZbNUrTjsdsSjcFrI
5XUhrsUPimlgO+4p2lh6w5vvlmSAZKCddOwCxvRrZ3IG7/aVPfftSTsLCU8Lkezt
crqSwTTq3MrO46kRsW9vX/VJLr9VShfbdV1VHPPDXKIhut2jlNmDpXWczssWQ311
h13+ZAVs9uKH/O7t88hwloSZDI77avbF2X4HmRYgRDfXBDe7JW6c0eeF8S8AGCSZ
AgMBAAE=
-----END PUBLIC KEY-----`;

function encryptApigee(plainText) {
    let sskey = random_key(16);
    let sskeyBytes = Buffer.from(sskey, 'utf8');
    const publicKey = forge.pki.publicKeyFromPem(encPublicKeyString);
    console.log("---------encryptApigee---------------------");
    const encData = publicKey.encrypt(sskeyBytes, 'RSA-OAEP', {
        md: forge.md.sha256.create(),
        mgf1: {
            md: forge.md.sha256.create()
        }
    });
    const encryptedHex = forge.util.bytesToHex(encData);
    const encryptedKey = Buffer.from(encryptedHex, 'hex').toString('base64');

    const plainSymmetricKey = sskey;
    const encryptedData = encrypt(plainText, plainSymmetricKey);

    const plainSymmetricKeyReceived = sskey;
    const result = calculateHmacSHA256(plainSymmetricKeyReceived, plainText);

    return {
        key: encryptedKey,
        data: encryptedData,
        hash: result,
    };
}

function decryptApigee(EncData, encryptedKEY, hash) {
    const privateKey = forge.pki.privateKeyFromPem(getPrivateKey());
    const decryptedBytes = privateKey.decrypt(Buffer.from(encryptedKEY, 'base64'), 'RSA-OAEP', {
        md: forge.md.sha256.create(),
        mgf1: {
            md: forge.md.sha256.create()
        }
    });
    const decryptedData = decrypt(EncData, decryptedBytes.toString());
    const result = calculateHmacSHA256(decryptedBytes.toString(), decryptedData);
    if (result == hash) {
        return decryptedData;
    }
    else {
        return null;
    }
}

function calculateHmacSHA256(plainSymmetricKeyReceived, encryptedData) {
    const hasher = crypto.createHmac('sha256', Buffer.from(plainSymmetricKeyReceived));
    const hash = hasher.update(encryptedData).digest('base64');
    return hash;
}

function getRandomBytes(length) {
    return crypto.randomBytes(length);
}

function getAESKeyFromPassword(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 65536, 32, 'sha256');
}

function encrypt(plainText, plainSymmetricKey) {
    const salt = getRandomBytes(16);
    const iv = getRandomBytes(12);
    const aesKeyFromPassword = getAESKeyFromPassword(Buffer.from(plainSymmetricKey), salt);

    const cipher = crypto.createCipheriv('aes-256-gcm', aesKeyFromPassword, iv);
    const cipherText = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const cipherTextWithIvSalt = Buffer.concat([iv, salt, cipherText, tag]);

    return cipherTextWithIvSalt.toString('base64');
}

function decrypt(data, plainSymmetricKey) {
    const decodedData = Buffer.from(data, 'base64');
    const iv = decodedData.subarray(0, 12); // IV length is 12 bytes
    const salt = decodedData.subarray(12, 28); // Salt length is 16 bytes
    const cipherText = decodedData.subarray(28); // remaining data

    const aesKeyFromPassword = getAESKeyFromPassword(Buffer.from(plainSymmetricKey), salt);
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKeyFromPassword, iv);

    decipher.setAuthTag(cipherText.subarray(cipherText.length - 16)); // Auth tag length is 16 bytes
    const encryptedData = cipherText.subarray(0, cipherText.length - 16);

    const decryptedData = Buffer.concat([
        decipher.update(encryptedData),
        decipher.final()
    ]);

    return decryptedData.toString('utf8');
}

export {
    apigee_api_request_call,
    emailVerification,
    mobileVerification
};
