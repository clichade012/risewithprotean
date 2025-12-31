import { Sequelize, QueryTypes } from 'sequelize';
import { Constants } from '../model/constantModel.js';
import { JWT } from 'google-auth-library';
import { createRequire } from 'module';
import { parse } from 'date-fns';
import { execSync } from 'child_process';
import fs from 'fs';
import moment from 'moment-timezone';
import { logger as _logger } from '../logger/winston.js';
import { v4 as uuidv4 } from 'uuid';
import * as uuid from 'uuid';
import validator from 'validator';
import correlator from 'express-correlation-id';
import initModels from '../models/index.js';

// For importing JSON files in ES Modules
const require = createRequire(import.meta.url);
const keys = require('../oauth2.keys.json');

// Database object
const db = {
    sequelize: null,
    sequelize2: null,
    models: null,
    initialize,
    get_uploads_url,
    get_ist_current_date,
    convert_db_date_to_ist,
    slugify_url,
    isValidIP,
    get_apigee_token,
    isValidURL,
    convertStringToJson,
    buildQuery_Obj,
    buildQuery_Array,
    string_to_date,
    upto_date,
    convert_dateformat,
    curl_to_code,
    delete_uploaded_files,
    analytics_db,
    get_customer_apigee_token,
    convertUTCtoIST,
    bill_desk_logger_obj,
    isUUID,
    numberWithIndianFormat,
    update_apigee_wallet_balance,
    get_apigee_wallet_balance,
    debited_apigee_wallet_balance,
    delete_file_by_path,
    tryParseInt
};

async function initialize() {
    const options = {
        dialect: 'postgres',
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
    };
    const sequelize = new Sequelize(options);

    db.sequelize = sequelize;
    await sequelize.authenticate();
    console.log('Database connected successfully.');

    // Initialize ORM Models
    db.models = initModels(sequelize);
    console.log('ORM Models loaded:', Object.keys(db.models).join(', '));
}

async function analytics_db() {
    const options = {
        dialect: 'postgres',
        host: process.env.AD_DB_HOST,
        port: process.env.AD_DB_PORT,
        database: process.env.AD_DB_NAME,
        username: process.env.AD_DB_USER,
        password: process.env.AD_DB_PASSWORD,
    };
    const sequelize2 = new Sequelize(options);

    db.sequelize2 = sequelize2;
    await sequelize2.authenticate();
    console.log('Analytics Database connected successfully.');
}

function get_uploads_url(req) {
    return process.env.FRONT_SITE_URL + 'uploads/';
}

function get_ist_current_date() {
    const now = new Date();
    const currentTimeInIST = new Date(now.getTime() + Constants.istOffsetMinutes * 60 * 1000);
    return currentTimeInIST;
}

function convert_db_date_to_ist(now) {
    return now;
}

function tryParseInt(v) {
    try { if (v) { return (parseInt(v) || 0); } } catch (_) { console.warn(_); }
    return 0;
}

function convertUTCtoIST(utcTimestamp) {
    if (utcTimestamp) {
        const utcMoment = moment.utc(utcTimestamp, [
            'YYYY-MM-DD HH:mm:ss.SSS [UTC]',
            'YYYY-MM-DD HH:mm:ss.SS [UTC]',
            'YYYY-MM-DD HH:mm:ss.S [UTC]',
            'YYYY-MM-DD HH:mm:ss [UTC]'
        ], true);

        if (!utcMoment.isValid()) {
            console.error(`Invalid UTC timestamp: ${utcTimestamp}`);
            return '';
        }

        const istMoment = utcMoment.tz('Asia/Kolkata');
        return istMoment.format('YYYY-MM-DD hh:mm:ss A');
    } else {
        return '';
    }
}

function convert_dateformat(inputTimestamp) {
    if (inputTimestamp) {
        const date = new Date(inputTimestamp);
        const formattedDate = date.toLocaleString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            timeZone: 'UTC'
        });
        return formattedDate;
    } else {
        return '';
    }
}

function slugify_url(url) {
    return url.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-');
}

function isValidIPv4(ip) {
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    return ipv4Pattern.test(ip);
}

function isValidIPv6(ip) {
    const ipv6Pattern = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    return ipv6Pattern.test(ip);
}

function isValidIP(ip) {
    return isValidIPv4(ip) || isValidIPv6(ip);
}

async function get_apigee_token() {
    let token = ''; let gen = false;
    const row1 = await db.sequelize.query(`SELECT apigee_access_token, apigee_token_expiry FROM settings`, { type: QueryTypes.SELECT });
    if (row1 && row1.length > 0 && row1[0].apigee_access_token && row1[0].apigee_access_token.length > 0) {
        if (row1[0].apigee_token_expiry) {
            const newDate = new Date(row1[0].apigee_token_expiry.getTime() + -5 * 60000);
            if (newDate > db.get_ist_current_date()) {
                token = row1[0].apigee_access_token;
            } else {
                gen = true;
            }
        } else {
            gen = true;
        }
    } else {
        gen = true;
    }
    if (gen) {
        const client = new JWT({
            email: keys.client_email, key: keys.private_key,
            scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        });
        const authData = await client.authorize();
        const istTimeString = new Date(authData.expiry_date).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
        const _query2 = `UPDATE settings SET apigee_access_token = ?, apigee_token_expiry = ? `;
        await db.sequelize.query(_query2, { replacements: [authData.access_token, istTimeString], type: QueryTypes.UPDATE });
        token = authData.access_token;
    }
    return token;
}

async function get_customer_apigee_token() {
    let token = ''; let gen = false;
    const row1 = await db.sequelize.query(`SELECT apigee_cst_access_token, apigee_cst_token_expiry FROM settings`, { type: QueryTypes.SELECT });
    if (row1 && row1.length > 0 && row1[0].apigee_access_token && row1[0].apigee_access_token.length > 0) {
        if (row1[0].apigee_cst_token_expiry) {
            const newDate = new Date(row1[0].apigee_cst_token_expiry.getTime() + -5 * 60000);
            if (newDate > db.get_ist_current_date()) {
                token = row1[0].apigee_cst_access_token;
            } else {
                gen = true;
            }
        } else {
            gen = true;
        }
    } else {
        gen = true;
    }
    if (gen) {
        const URL = process.env.CUSTOMER_APIGEE_TOKEN;
        const data = { grant_type: 'client_credentials' };
        const response = await fetch(URL, {
            method: "POST",
            headers: {
                'Authorization': 'Basic ' + Buffer.from(process.env.UAT_SANDBOX_API_KEY + ':' + process.env.UAT_SANDBOX_API_SECRET_KEY).toString('base64'),
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams(data).toString(),
        });
        const responseData = await response.json();
        const expiryDate = new Date();
        expiryDate.setSeconds(expiryDate.getSeconds() + parseInt(responseData.expires_in));
        const istTimeString = expiryDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const _query2 = `UPDATE settings SET apigee_cst_access_token = ?, apigee_cst_token_expiry = ? `;
        await db.sequelize.query(_query2, { replacements: [responseData.access_token, istTimeString], type: QueryTypes.UPDATE });
        token = responseData.access_token;
    }
    return token;
}

function isValidURL(inputURL) {
    try {
        const parsedURL = new URL(inputURL);
        return !!parsedURL.protocol && !!parsedURL.hostname;
    } catch (e) {
        return false;
    }
}

function convertStringToJson(inputString) {
    try {
        const jsonObject = JSON.parse(inputString);
        return jsonObject;
    } catch (error) {
        return null;
    }
}

function buildQuery_Obj(query, replacements) {
    const finalizedQuery = query.replace(/:(\w+)/g, (match, placeholder) => {
        return replacements[placeholder] !== undefined ? replacements[placeholder] : match;
    });
    return finalizedQuery;
}

function buildQuery_Array(query, replacements) {
    let currentIndex = 0;
    const finalizedQuery = query.replace(/\?/g, () => {
        const replacementValue = replacements[currentIndex++];
        return db.sequelize.escape(replacementValue);
    });
    return finalizedQuery;
}

function string_to_date(dateString) {
    try {
        const istDate = parse(dateString, 'yyyy-MM-dd HH:mm:ss', new Date());
        return istDate;
    } catch (_) {
        return null;
    }
}

function upto_date(date) {
    try {
        let _dateTemp = date;
        const dateTemp = new Date(_dateTemp.setTime(_dateTemp.getTime() + (1440 * 60 * 1000)));
        return dateTemp;
    } catch (_) {
        return null;
    }
}

function curl_to_code(curl, language) {
    if (!curl || !language) { return null; }
    try {
        let cleanedCurl = curl.trim().replace(/^curl\s+/, '').replace(/\\\n/g, '').replace(/ --header '/g, ' -H "')
            .replace(/' --data/g, '" --data').replace(/\n/g, '').replace(/' -H "/g, '" -H "');
        const command = `curlconverter "${cleanedCurl}" --language ${language}`;
        const result = execSync(command, { encoding: 'utf8', stdio: 'pipe' }).trim();
        return result || null;
    } catch (error) {
        console.error('Curl conversion failed:', error.message);
        return null;
    }
}

function delete_uploaded_files(req) {
    if (req.files && req.files.length > 0) {
        for (const element of req.files) {
            try {
                fs.unlinkSync(element.path);
            } catch (err) {
                try { _logger.error(err.stack); } catch (_) { }
            }
        }
    }
}

function bill_desk_logger_obj(ip_address, message, data) {
    return JSON.stringify({
        correlation_id: correlator.getId(),
        ip_addr: ip_address,
        date_time: new Date(),
        gateway: 'bill-desk',
        message: message,
        data: data,
    });
}

function numberWithIndianFormat(x) {
    const numStr = x != null && x.toString().length > 0 ? String(x).replace(/,/g, '') : '';
    if (numStr.length > 0) {
        const numVal = numStr != null && validator.isNumeric(numStr.toString()) ? parseFloat(parseFloat(numStr).toFixed(2)) : 0;
        try {
            const formattedAmount = numVal.toLocaleString('en-IN', { currency: 'INR' });
            return formattedAmount;
        } catch (_) {
            return x;
        }
    } else {
        return x;
    }
}

function isUUID(str) {
    if (str != null && str.length > 0) {
        return uuid.validate(str);
    }
    return false;
}

function delete_file_by_path(filePath) {
    try {
        if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); }
    } catch (error) {
        console.log("======delete_file_by_path catch error======", error);
    }
}

async function get_apigee_wallet_balance(customer_id) {
    try {
        let _customer_id = customer_id && validator.isNumeric(customer_id.toString()) ? parseInt(customer_id) : 0;
        const _query1 = `SELECT customer_id, developer_id, email_id, wallets_amount FROM cst_customer WHERE customer_id = ? AND is_deleted = false`;
        const row1 = await db.sequelize.query(_query1, { replacements: [_customer_id], type: QueryTypes.SELECT });
        if (!row1 || row1.length <= 0) {
            return false;
        }
        if (row1[0].email_id && row1[0].email_id.length > 0) {
            const email_id = row1[0].email_id;
            const WalletGet_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers/${email_id}/balance`;
            const apigeeAuth = await get_apigee_token();
            const response = await fetch(WalletGet_URL, {
                method: "GET",
                headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json" },
            });
            const responseData = await response.json();
            console.log("========responseData=============", JSON.stringify(responseData));
            if (response.ok && responseData?.wallets?.length > 0) {
                const units = parseFloat(responseData.wallets[0]?.balance?.units || 0);
                const nanos = parseFloat(responseData.wallets[0]?.balance?.nanos || 0) / 1e9;
                const balance = units + nanos;
                console.log("========balance=============", balance);
                const _query2 = `UPDATE cst_customer SET wallets_amount = ?, wallets_amt_updated_date = ? WHERE customer_id = ?`;
                const _replacements2 = [balance, get_ist_current_date(), _customer_id];
                await db.sequelize.query(_query2, { replacements: _replacements2, type: QueryTypes.UPDATE });
                return true;
            } else {
                return false;
            }
        } else {
            return false;
        }
    } catch (error) {
        console.error("Error in get_apigee_wallet_balance:", error);
        return false;
    }
}

async function update_apigee_wallet_balance(customer_id, wallet_amount_new) {
    try {
        let _customer_id = customer_id && validator.isNumeric(customer_id.toString()) ? parseInt(customer_id) : 0;
        const _query1 = `SELECT customer_id, developer_id, email_id, wallets_amount FROM cst_customer WHERE customer_id = ? AND is_deleted = false`;
        const row1 = await db.sequelize.query(_query1, { replacements: [_customer_id], type: QueryTypes.SELECT });
        if (!row1 || row1.length <= 0) {
            return false;
        }
        let transactionId = uuidv4();
        if (row1[0].email_id && row1[0].email_id.length > 0) {
            const wallet_data = { "transactionAmount": { "currencyCode": "INR", "nanos": 0, "units": wallet_amount_new }, "transactionId": transactionId };
            const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers/${row1[0].email_id}/balance:credit`;
            const apigeeAuth = await get_apigee_token();
            const response = await fetch(product_URL, {
                method: "POST",
                headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json" },
                body: JSON.stringify(wallet_data),
            });
            const responseData = await response.json();
            console.log("========responseData=============", responseData);
            if (response.ok && responseData?.wallets?.length > 0) {
                const units = parseFloat(responseData.wallets[0]?.balance?.units);
                const nanos = parseFloat(responseData.wallets[0]?.balance?.nanos || 0) / 1e9;
                const balance = units + nanos;
                const _query2 = `UPDATE cst_customer SET wallets_amount = ?, wallets_amt_updated_date = ? WHERE customer_id = ?`;
                const _replacements2 = [balance, get_ist_current_date(), _customer_id];
                await db.sequelize.query(_query2, { replacements: _replacements2, type: QueryTypes.UPDATE });
                return true;
            } else {
                return false;
            }
        } else {
            return false;
        }
    } catch (error) {
        console.error("Error in update_apigee_wallet_balance:", error);
        return false;
    }
}

async function debited_apigee_wallet_balance(customer_id, wallet_amount_new) {
    try {
        let _customer_id = customer_id && validator.isNumeric(customer_id.toString()) ? parseInt(customer_id) : 0;
        const _query1 = `SELECT customer_id, developer_id, email_id, wallets_amount FROM cst_customer WHERE customer_id = ? AND is_deleted = false`;
        const row1 = await db.sequelize.query(_query1, { replacements: [_customer_id], type: QueryTypes.SELECT });
        if (!row1 || row1.length <= 0) {
            return false;
        }
        if (row1[0].email_id && row1[0].email_id.length > 0) {
            const wallet_data = { "adjustment": { "currencyCode": "INR", "nanos": 0, "units": wallet_amount_new } };
            const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers/${row1[0].email_id}/balance:adjust`;
            const apigeeAuth = await get_apigee_token();
            const response = await fetch(product_URL, {
                method: "POST",
                headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json" },
                body: JSON.stringify(wallet_data),
            });
            const responseData = await response.json();
            console.log("========responseData=============", responseData);
            if (response.ok && responseData?.wallets?.length > 0) {
                const units = parseFloat(responseData.wallets[0]?.balance?.units);
                const nanos = parseFloat(responseData.wallets[0]?.balance?.nanos || 0) / 1e9;
                const balance = units + nanos;
                console.log("========balance=============", balance);
                const _query2 = `UPDATE cst_customer SET wallets_amount = ?, wallets_amt_updated_date = ? WHERE customer_id = ?`;
                const _replacements2 = [balance, get_ist_current_date(), _customer_id];
                await db.sequelize.query(_query2, { replacements: _replacements2, type: QueryTypes.UPDATE });
                return true;
            } else {
                return false;
            }
        } else {
            return false;
        }
    } catch (error) {
        console.error("Error in debited_apigee_wallet_balance:", error);
        return false;
    }
}

export default db;
export { QueryTypes };
