import { logger as _logger, action_logger } from '../logger/winston.js';
import db from '../database/db_helper.js';
import { QueryTypes, Op, literal } from 'sequelize';
import { success } from "../model/responseModel.js";
import validator from 'validator';
import { API_STATUS, EmailTemplates } from "../model/enumModel.js";
import { rsa_decrypt } from "../services/rsaEncryption.js";
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import redisDB from '../database/redis_cache.js';
import dateFormat from 'date-format';
import * as customerService from '../services/customerService.js';
import * as admCustomerService from '../services/admin/admCustomerService.js';
import { fetch } from 'cross-fetch';
import { randomUUID } from 'crypto';
import emailTransporter from "../services/emailService.js";
import supportTransporter from "../services/supportService.js";
import DeviceDetector from 'node-device-detector';
import requestIp from 'request-ip';
import correlator from 'express-correlation-id';
import * as cloudStorage from "./cloudStorage.js";
import * as apigeeService from "../services/apigeeService.js";

// Helper function to get models from db
const getModels = () => db.models;

const homeold = async (req, res, next) => {
    try {
        const { HomePage } = getModels();
        let scroll_strip = '';
        const row1 = await HomePage.findOne({
            attributes: ['contents'],
            where: { table_id: 1 }
        });
        if (row1) {
            scroll_strip = row1.contents;
        }

        const fetchSectionOld = async (tableId) => {
            const row = await HomePage.findOne({
                attributes: ['title_text', 'heading_text', 'contents', 'image_1', 'image_2', 'image_3'],
                where: { table_id: tableId }
            });
            if (row) {
                return {
                    title: row.title_text,
                    heading: row.heading_text,
                    contents: row.contents,
                    image_1: row.image_1 && row.image_1.length > 0 ? db.get_uploads_url(req) + row.image_1 : '',
                    image_2: row.image_2 && row.image_2.length > 0 ? db.get_uploads_url(req) + row.image_2 : '',
                    image_3: row.image_3 && row.image_3.length > 0 ? db.get_uploads_url(req) + row.image_3 : '',
                };
            }
            return null;
        };

        let section_1 = await fetchSectionOld(2);
        let section_2 = await fetchSectionOld(3);
        let section_3 = await fetchSectionOld(4);
        let section_4 = await fetchSectionOld(5);

        let section_5 = [];
        for (let tableId of [6, 7, 8]) {
            const row = await HomePage.findOne({
                attributes: ['table_id', 'heading_text', 'contents'],
                where: { table_id: tableId }
            });
            if (row) {
                section_5.push({
                    id: row.table_id,
                    title: row.heading_text,
                    contents: row.contents,
                });
            }
        }

        let results = {
            scroll_strip: scroll_strip,
            section_1: section_1,
            section_2: section_2,
            section_3: section_3,
            section_4: section_4,
            section_5: section_5,
        };
        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const home = async (req, res, next) => {
    try {
        const { HomePage } = getModels();
        const cacheKey = "home_page_data";
        let cachedData = null;
        if (process.env.REDIS_ENABLED > 0) {
            cachedData = await redisDB.get(cacheKey);
        }

        if (cachedData) {
            console.log("Fetching from Redis Cache");
            return res.status(200).json(success(true, res.statusCode, "", JSON.parse(cachedData)));
        }
        let scroll_strip = '';
        const row1 = await HomePage.findOne({
            attributes: ['contents'],
            where: { table_id: 1 }
        });
        if (row1) scroll_strip = row1.contents;

        const fetchSection = async (tableId) => {
            const row = await HomePage.findOne({
                attributes: ['title_text', 'heading_text', 'contents', 'image_1', 'image_2', 'image_3'],
                where: { table_id: tableId }
            });
            if (row) {
                return {
                    title: row.title_text,
                    heading: row.heading_text,
                    contents: row.contents,
                    image_1: row.image_1 ? db.get_uploads_url(req) + row.image_1 : '',
                    image_2: row.image_2 ? db.get_uploads_url(req) + row.image_2 : '',
                    image_3: row.image_3 ? db.get_uploads_url(req) + row.image_3 : '',
                };
            }
            return null;
        };

        let section_1 = await fetchSection(2);
        let section_2 = await fetchSection(3);
        let section_3 = await fetchSection(4);
        let section_4 = await fetchSection(5);

        let section_5 = [];
        for (let tableId of [6, 7, 8]) {
            const row = await HomePage.findOne({
                attributes: ['table_id', 'heading_text', 'contents'],
                where: { table_id: tableId }
            });
            if (row) {
                section_5.push({
                    id: row.table_id,
                    title: row.heading_text,
                    contents: row.contents,
                });
            }
        }

        let results = { scroll_strip, section_1, section_2, section_3, section_4, section_5 };

        if (process.env.REDIS_ENABLED > 0) {
            await redisDB.set(cacheKey, JSON.stringify(results), { EX: process.env.REDIS_CACHE_EXPIRY });
        }

        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};


const signup_data = async (req, res, next) => {
    try {
        const { Industry, MobileNetwork } = getModels();
        const row1 = await Industry.findAll({
            attributes: ['industry_id', 'industry_name'],
            where: { is_enabled: true, is_deleted: false },
            order: [
                [literal('CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 2147483647 ELSE COALESCE(sort_order, 0) END'), 'ASC'],
                ['industry_id', 'ASC']
            ]
        });
        let industry = (row1 || []).map(item => ({
            id: item.industry_id,
            name: item.industry_name
        }));

        const row2 = await MobileNetwork.findAll({
            attributes: ['network_id', 'network_code'],
            where: { is_enabled: true, is_deleted: false },
            order: [
                [literal('CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 2147483647 ELSE COALESCE(sort_order, 0) END'), 'ASC'],
                ['network_id', 'ASC']
            ]
        });
        let network = (row2 || []).map(item => ({
            id: item.network_id,
            name: item.network_code
        }));

        const results = {
            industry: industry,
            network: network,
        };
        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

// Helper to parse numeric ID
const parseNumericId = (value) => {
    if (!value) return 0;
    const strValue = String(value);
    return validator.isNumeric(strValue) ? parseInt(strValue) : 0;
};

// Helper to validate captcha
const validateCaptcha = async (captcha_token) => {
    const _captcha_token = captcha_token?.length > 0 ? captcha_token : '';
    const captchaUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.CAPTCHA_SECRET}&response=${_captcha_token}`;
    try {
        const captchaResp = await fetch(captchaUrl);
        if (captchaResp.ok) {
            const captchaData = await captchaResp.json();
            return captchaData?.success === true;
        }
    } catch (error) {
        console.error('CAPTCHA validation failed:', error.message);
    }
    return false;
};

// Helper to validate signup name fields
const validateNameFields = (first_name, last_name) => {
    if (!first_name?.length) return "Please enter first name.";
    if (first_name.length > 30) return "First name should not be more than 30 character";
    if (!last_name?.length) return "Please enter last name.";
    if (last_name.length > 30) return "Last name should not be more than 30 character";
    return null;
};

// Helper to validate contact fields
const validateContactFields = (network_id, mobile_no, email_id) => {
    if (!network_id || !validator.isNumeric(String(network_id)) || network_id <= 0) {
        return "Please select country code.";
    }
    if (!mobile_no?.length) return "Please enter mobile number.";
    if (!validator.isNumeric(mobile_no) || mobile_no.length !== 10) return "Invalid mobile number.";
    if (!email_id?.length) return "Please enter email address.";
    if (!validator.isEmail(email_id)) return "Invalid email address.";
    return null;
};

// Helper to validate external services (email & mobile)
const validateExternalServices = async (email_id, mobile_no) => {
    const isEmailValid = await apigeeService.emailVerification(email_id);
    console.log("=====isEmailValid===", isEmailValid);
    if (!isEmailValid) return "Invalid email address. Please enter a valid one.";

    const isMobileValid = await apigeeService.mobileVerification(mobile_no);
    console.log("=====isMobileValid===", isMobileValid);
    if (!isMobileValid) return "Invalid mobile no. Please enter a valid one.";

    return null;
};

// Helper to validate business fields
const validateBusinessFields = (industry_id, company_name) => {
    if (!industry_id || !validator.isNumeric(String(industry_id)) || industry_id <= 0) {
        return "Please select business category.";
    }
    if (!company_name?.length) return "Please enter company name.";
    return null;
};

// Helper to validate password
const validatePassword = (password) => {
    if (!password?.length) return "Please enter password.";
    if (password.length < 8) return "The password must contain atleast 8 characters.";
    if (!/\d/.test(password)) return "The password must contain a number.";
    if (!/[`!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~]/.test(password)) return "The password must contain a special character.";
    return null;
};

// Helper to check duplicate user
const checkDuplicateUser = async (email_id, mobile_no, CstCustomer) => {
    const emailExists = await CstCustomer.findOne({
        attributes: ['customer_id'],
        where: { email_id: email_id, is_deleted: false }
    });
    if (emailExists) return "Email address is already registered.";

    const mobileExists = await CstCustomer.findOne({
        attributes: ['customer_id'],
        where: { mobile_no: mobile_no, is_deleted: false }
    });
    if (mobileExists) return "Mobile number is already registered.";

    return null;
};

// Helper to handle post-registration tasks
const handlePostRegistration = async (customer_id, unique_id, Settings, CstCustomer, _query1, _replacements2) => {
    let is_auto_approve = false;
    const settingsRow = await Settings.findOne({ attributes: ['is_auto_approve_customer'] });
    if (settingsRow?.is_auto_approve_customer === true) {
        await admCustomerService.customer_approve_auto(customer_id);
        is_auto_approve = true;
    }

    await customerService.send_activation_link(customer_id);
    await customerService.sendSignUpMail(customer_id);

    const row15 = await CstCustomer.findOne({
        attributes: ['account_id'],
        where: { customer_id: customer_id }
    });

    try {
        const data_to_log = {
            correlation_id: correlator.getId(),
            token_id: 0,
            account_id: row15?.account_id || 0,
            user_type: 2,
            user_id: customer_id,
            narration: 'New customer registered and activation link sent.' + (is_auto_approve ? ' (Auto approved)' : ''),
            query: db.buildQuery_Array(_query1, _replacements2),
        };
        action_logger.info(JSON.stringify(data_to_log));
    } catch (_) { }

    return { id: unique_id };
};

const signup_new = async (req, res, next) => {
    const { post_data, captcha_token } = req.body;
    try {
        const { CstCustomer, Settings } = getModels();
        const jsonData = JSON.parse(rsa_decrypt(post_data));

        // Validate captcha
        const captcha_valid = await validateCaptcha(captcha_token);
        if (!captcha_valid) {
            return res.status(200).json(success(false, res.statusCode, "Incorrect captcha.", null));
        }

        // Extract and validate fields
        let { first_name, last_name, email_id, network_id, mobile_no, segment_id, industry_id, company_name, user_name, password } = jsonData;
        email_id = email_id?.toLowerCase().trim();

        // Validate name fields
        const nameError = validateNameFields(first_name, last_name);
        if (nameError) return res.status(200).json(success(false, res.statusCode, nameError, null));
        first_name = sanitizeInput(first_name);
        last_name = sanitizeInput(last_name);

        // Validate contact fields
        const contactError = validateContactFields(network_id, mobile_no, email_id);
        if (contactError) return res.status(200).json(success(false, res.statusCode, contactError, null));

        // Validate external services
        const externalError = await validateExternalServices(email_id, mobile_no);
        if (externalError) return res.status(200).json(success(false, res.statusCode, externalError, null));

        // Normalize segment_id
        segment_id = parseNumericId(segment_id) || 0;

        // Validate business fields
        const businessError = validateBusinessFields(industry_id, company_name);
        if (businessError) return res.status(200).json(success(false, res.statusCode, businessError, null));
        company_name = sanitizeInput(company_name);
        user_name = user_name || '';

        // Validate password
        const passwordError = validatePassword(password);
        if (passwordError) return res.status(200).json(success(false, res.statusCode, passwordError, null));

        // Check for duplicate user
        const duplicateError = await checkDuplicateUser(email_id, mobile_no, CstCustomer);
        if (duplicateError) return res.status(200).json(success(false, res.statusCode, duplicateError, null));

        // Create customer
        const password_hash = await bcrypt.hash(password, 10);
        const _query1 = `INSERT INTO cst_customer(company_name, first_name, last_name, email_id, network_id, mobile_no, user_name, user_pass,
            register_date, is_enabled, is_deleted, is_approved, industry_id, segment_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING "customer_id", "unique_id"`;
        const _replacements2 = [company_name, first_name, last_name, email_id, network_id, mobile_no, user_name, password_hash, db.get_ist_current_date(), true, false, 0, industry_id, segment_id];
        const [rowOut] = await db.sequelize.query(_query1, { replacements: _replacements2, type: QueryTypes.INSERT });

        const customer_id = rowOut?.[0]?.customer_id || 0;
        const unique_id = rowOut?.[0]?.unique_id || "";

        if (customer_id > 0) {
            res.setHeader('x-customer-key', unique_id);
            const results = await handlePostRegistration(customer_id, unique_id, Settings, CstCustomer, _query1, _replacements2);
            return res.status(200).json(success(true, API_STATUS.CUSTOMER_REGISTERED.value, "Your registration is successful. You will receive an email with activation link.", results));
        }
        return res.status(200).json(success(false, res.statusCode, "Unable to register, Please try again.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const sanitizeInput = (input) => {
    return input.replace(/[^a-zA-Z\s'-]/g, "").trim(); // Allows only letters, spaces, apostrophes, and hyphens
};

const success_get = async (req, res, next) => {
    const { post_data } = req.body;
    try {
        const { CstCustomer } = getModels();
        let jsonData = JSON.parse(rsa_decrypt(post_data));
        let id = jsonData.id;

        const row1 = await CstCustomer.findOne({
            attributes: ['first_name', 'last_name'],
            where: { unique_id: id, is_deleted: false }
        });
        if (row1) {
            const results = {
                first_name: row1.first_name,
                last_name: row1.last_name,
            };
            return res.status(200).json(success(true, res.statusCode, "Account details.", results));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Account details not found, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

// Helper to decode token safely
const decodeToken = (token) => {
    try {
        return Buffer.from(decodeURIComponent(token), 'base64').toString('utf8');
    } catch {
        return '';
    }
};

// Helper to check if token is expired
const isTokenExpired = (tokenTime, expiryMs) => {
    const expiryDate = new Date(db.convert_db_date_to_ist(tokenTime).getTime() + expiryMs);
    return expiryDate < db.get_ist_current_date();
};

const verify_email_link = async (req, res, next) => {
    const { token_id } = req.body;
    try {
        const { CstCustomer } = getModels();
        const _decoded = decodeToken(token_id);

        if (!_decoded) {
            return res.status(200).json(success(false, res.statusCode, "Invalid activation link or expired.", null));
        }

        const customer = await CstCustomer.findOne({
            attributes: ['customer_id', 'email_id', 'is_enabled', 'is_approved', 'is_activated', 'activation_token_time'],
            where: { activation_token_id: _decoded, is_deleted: false }
        });

        if (!customer) {
            return res.status(200).json(success(false, res.statusCode, "Invalid activation link or expired.", null));
        }

        if (customer.is_activated > 0) {
            return res.status(200).json(success(false, res.statusCode, "Your account is already activated.", null));
        }

        const expiryMs = process.env.VERIFICATION_EMAIL_LINK_EXPIRY * 1000;
        if (isTokenExpired(customer.activation_token_time, expiryMs)) {
            return res.status(200).json(success(false, API_STATUS.ACTIVATION_LINK_EXPIRED.value, "Invalid activation link or expired.", null));
        }

        const [affectedRows] = await CstCustomer.update(
            { is_activated: 1, activation_token_id: null, activation_token_time: null, activated_date: db.get_ist_current_date() },
            { where: { customer_id: customer.customer_id } }
        );

        if (affectedRows > 0) {
            return res.status(200).json(success(true, API_STATUS.CUSTOMER_ACTIVATED.value, "Your account activated successfully, Please login with your email id and password.", null));
        }
        return res.status(200).json(success(false, res.statusCode, "Unable to activate your account, Please try again.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const resend_email_link = async (req, res, next) => {
    const { email_id } = req.body;
    try {
        const { CstCustomer } = getModels();
        const row4 = await CstCustomer.findOne({
            attributes: ['customer_id', 'email_id', 'is_enabled', 'is_approved', 'is_activated'],
            where: { email_id: email_id, is_deleted: false }
        });
        if (row4) {
            const i = await customerService.send_activation_link(row4.customer_id);
            if (i > 0) {
                return res.status(200).json(success(true, res.statusCode, "Activation link sent successfully.", null));
            } else {
                let msg = '';
                if (i == -1) {
                    msg = "Your account is already activated.";
                }
                else if (i == 0) {
                    msg = "Activation link sending failed, Please try again.";
                }
                else if (i == -4 || i == -3) {
                    msg = "Unable to send activation email, Please try again.";
                }
                else if (i == -2) {
                    msg = "Unable to send activation email, Please try again";
                } else {
                    msg = " Unable to process, Please try again.";
                }
                return res.status(200).json(success(false, res.statusCode, msg, null));
            }
        } else {

            return res.status(200).json(success(false, res.statusCode, "Email address is not registered with us.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

// Helper to validate login credentials
const validateLoginCredentials = async (user_name, password, CstCustomer) => {
    if (!user_name?.length) return { error: "Please enter email id." };
    if (!password?.length) return { error: "Please enter password." };

    const user = await CstCustomer.findOne({
        attributes: ['customer_id', 'first_name', 'last_name', 'email_id', 'mobile_no', 'user_pass', 'is_enabled', 'is_deleted',
            'is_activated', 'is_approved', 'account_id', 'is_live_sandbox', 'billing_type'],
        where: { email_id: user_name, is_deleted: false }
    });

    if (!user) return { error: "Invalid username or password." };
    if (user.is_deleted) return { error: "Your account does not exist." };

    const isValidPass = await bcrypt.compare(password, user.user_pass);
    if (!isValidPass) return { error: "Invalid username or password." };

    if (user.is_activated <= 0) return { error: "Your account is not activated, Please check your email inbox for activation mail.", code: API_STATUS.CUST_ACC_NOT_ACTIVE.value };
    if (user.is_approved <= 0) return { error: "Your account is not yet approved, Please contact to administrator.", code: API_STATUS.CUST_ACC_NOT_APPROVED.value };
    if (!user.is_enabled) return { error: "Your account has been blocked, contact system administrator." };

    return { user };
};

// Helper to get client info
const getClientInfo = (req) => {
    let ip = '';
    try { ip = requestIp.getClientIp(req); } catch { }

    const user_agent = req.headers['user-agent'];
    let os_name = '';
    try { os_name = detector.detect(user_agent).os.name; } catch { }

    return { ip, user_agent, os_name };
};

const login = async (req, res, next) => {
    const { post_data } = req.body;
    try {
        const { CstCustomer } = getModels();
        const jsonData = JSON.parse(rsa_decrypt(post_data));

        const validation = await validateLoginCredentials(jsonData.user_name, jsonData.password, CstCustomer);
        if (validation.error) {
            return res.status(200).json(success(false, validation.code || res.statusCode, validation.error, null));
        }

        const { user } = validation;
        const jwtUser = { id: user.customer_id };
        const accessToken = jwt.sign(jwtUser, process.env.JWT_ACCESS_TOKEN_KEY,
            { algorithm: 'HS256', allowInsecureKeySizes: true, expiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRES * 1000 }
        );
        const refreshToken = jwt.sign(jwtUser, process.env.JWT_REFRESH_TOKEN_KEY,
            { algorithm: 'HS256', allowInsecureKeySizes: true, expiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRES * 1000 }
        );

        const { ip, user_agent, os_name } = getClientInfo(req);

        const _query2 = `INSERT INTO cst_token(customer_id, added_date, last_action, ip_address, is_logout, logout_time, user_agent, device_name)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING "unique_id"`;
        const [row2] = await db.sequelize.query(_query2, {
            replacements: [user.customer_id, db.get_ist_current_date(), db.get_ist_current_date(), ip, false, null, user_agent, os_name],
            returning: true
        });
        const unique_id = row2?.[0]?.unique_id || "";

        if (process.env.REDIS_ENABLED > 0) {
            await redisDB.set(unique_id, refreshToken, { EX: process.env.REDIS_CACHE_EXPIRY });
        }

        res.setHeader('x-auth-key', unique_id);
        const results = {
            first_name: user.first_name,
            last_name: user.last_name,
            email_id: user.email_id,
            mobile_no: user.mobile_no,
            is_live_sandbox: user.is_live_sandbox,
            billing_type: user.billing_type,
            access_token: accessToken,
            refresh_token: refreshToken,
            token_expiry: process.env.JWT_ACCESS_TOKEN_EXPIRES,
            token_issued_at: dateFormat(process.env.DATE_FORMAT, db.get_ist_current_date()),
            auth_key: unique_id,
        };

        return res.status(200).json(success(true, res.statusCode, "Logged in successfully.", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const detector = new DeviceDetector({
    clientIndexes: true,
    deviceIndexes: true,
    deviceAliasCode: false,
});


const faqs = async (req, res, next) => {
    try {
        const { FaqType, FaqDetail } = getModels();
        const row1 = await FaqType.findAll({
            attributes: ['type_id', 'faq_type'],
            where: { is_enabled: true, is_deleted: false },
            order: [
                [literal('CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 2147483647 ELSE COALESCE(sort_order, 0) END'), 'ASC'],
                ['type_id', 'ASC']
            ]
        });
        const types = (row1 || []).map(item => ({
            id: item.type_id,
            name: item.faq_type
        }));

        const typeIds = types.map(t => t.id);
        const row2 = await FaqDetail.findAll({
            attributes: ['faq_id', 'type_id', 'question', 'answer'],
            where: {
                is_enabled: true,
                is_deleted: false,
                type_id: { [Op.in]: typeIds }
            },
            order: [
                [literal('CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 2147483647 ELSE COALESCE(sort_order, 0) END'), 'ASC'],
                ['faq_id', 'ASC']
            ]
        });

        let results = [];
        for (const element of types || []) {
            let type_id = element.id;
            let faqs = [];
            for (const f of row2 || []) {
                if (f.type_id === type_id) {
                    faqs.push({
                        id: f.faq_id,
                        question: f.question,
                        answer: f.answer,
                    });
                }
            }
            results.push({
                id: type_id,
                name: element.name,
                faqs: faqs,
            });
        }
        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const contact_us_form = async (req, res, next) => {
    try {
        const { FeedbackCategory, MobileNetwork } = getModels();
        const row1 = await FeedbackCategory.findAll({
            attributes: ['category_id', 'category_name'],
            where: { is_enabled: true, is_deleted: false },
            order: [
                [literal('CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 2147483647 ELSE COALESCE(sort_order, 0) END'), 'ASC'],
                ['category_id', 'ASC']
            ]
        });
        const issue_type = (row1 || []).map(r => ({
            id: r.category_id,
            name: r.category_name
        }));

        const row2 = await MobileNetwork.findAll({
            attributes: ['network_id', 'network_code'],
            where: { is_enabled: true, is_deleted: false },
            order: [
                [literal('CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 2147483647 ELSE COALESCE(sort_order, 0) END'), 'ASC'],
                ['network_id', 'ASC']
            ]
        });
        const network = (row2 || []).map(r => ({
            id: r.network_id,
            name: r.network_code
        }));

        const results = {
            issue_type: issue_type,
            network: network,
        };

        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

// Helper to validate contact form
const validateContactForm = (data) => {
    const { first_name, last_name, email_id, company_name, category_id, network_id, mobile_no, subject, message } = data;

    if (!first_name?.length) return "Please enter first name.";
    if (!last_name?.length) return "Please enter last name.";
    if (!email_id?.length) return "Please enter email address.";
    if (!validator.isEmail(email_id)) return "Please enter correct email address.";
    if (!company_name?.length) return "Please enter company name.";

    const _category_id = parseNumericId(category_id);
    if (_category_id <= 0) return "Please select issue type.";

    const _network_id = parseNumericId(network_id);
    if (_network_id <= 0) return "Please select country code.";

    if (!mobile_no?.length) return "Please enter mobile number.";
    if (!validator.isNumeric(mobile_no) || mobile_no.length !== 10) return "Please enter correct mobile number.";
    if (!subject?.length) return "Please enter subject.";
    if (!message?.length) return "Please enter message.";

    return null;
};

// Helper to send contact us email
const sendContactUsEmail = async (template, data, categoryName) => {
    if (!template?.is_enabled) return;

    let _subject = template.subject || "";
    let body_text = template.body_text || "";

    _subject = _subject.replaceAll('{{TICKET_ID}}', data.ticket_id);
    body_text = body_text.replaceAll('{{FULL_NAME}}', `${data.first_name} ${data.last_name}`);
    body_text = body_text.replaceAll('{{TICKET_ID}}', data.ticket_id);
    body_text = body_text.replaceAll('{{ISSUE_TYPE}}', categoryName);
    body_text = body_text.replaceAll('{{SUBJECT}}', data.subject);
    body_text = body_text.replaceAll('{{MESSAGE}}', data.message);
    body_text = body_text.replaceAll(process.env.SITE_URL_TAG, process.env.FRONT_SITE_URL);

    try {
        await supportTransporter.sendMail({
            from: process.env.EMAIL_SUPPORT_EMAIL,
            to: data.email_id,
            subject: _subject,
            html: body_text,
        });
    } catch (err) {
        _logger.error(err.stack);
    }
};

// Helper to generate reset token and update customer
const generateResetToken = async (customer_id, CstCustomer) => {
    const uuid = randomUUID();
    const uuid_encoded = encodeURIComponent(Buffer.from(uuid.toString(), 'utf8').toString('base64'));
    const resetLink = process.env.FRONT_SITE_URL + 'reset/' + uuid_encoded;

    const [affectedRows] = await CstCustomer.update(
        { reset_pass_token_id: uuid, reset_pass_token_time: db.get_ist_current_date() },
        { where: { customer_id } }
    );

    return { success: affectedRows > 0, resetLink };
};

// Helper to process reset password email template
const processResetEmailTemplate = (template, customer, resetLink) => {
    let subject = template.subject || "";
    let body_text = template.body_text || "";

    const replacements = {
        [process.env.EMAIL_TAG_FIRST_NAME]: customer.first_name,
        [process.env.EMAIL_TAG_LAST_NAME]: customer.last_name,
        [process.env.EMAIL_TAG_EMAIL_ID]: customer.email_id,
        [process.env.EMAIL_TAG_MOBILE_NO]: customer.mobile_no,
        [process.env.EMAIL_TAG_RESET_PASS_LINK]: resetLink,
        [process.env.SITE_URL_TAG]: process.env.FRONT_SITE_URL,
    };

    for (const [tag, value] of Object.entries(replacements)) {
        if (tag) {
            subject = subject.replaceAll(tag, value);
            body_text = body_text.replaceAll(tag, value);
        }
    }

    return { subject, body_text };
};

// Helper to send reset password email
const sendResetPasswordEmail = async (customer, subject, body_text) => {
    try {
        await emailTransporter.sendMail({
            from: process.env.EMAIL_CONFIG_SENDER,
            to: customer.email_id,
            subject,
            html: body_text,
        });
        return true;
    } catch (err) {
        console.log(err);
        _logger.error(err.stack);
        return false;
    }
};

// Helper to parse common pagination parameters
const parsePageParams = (params) => {
    const { page_no, filter_id, search_text, grid_type, category_id } = params;
    return {
        page_no: (page_no && validator.isNumeric(page_no.toString()) && parseInt(page_no) > 0) ? parseInt(page_no) : 1,
        filter_id: (filter_id && filter_id > 0) ? filter_id : 0,
        search_text: (search_text?.length > 0) ? search_text : "",
        grid_type: (grid_type && grid_type > 0) ? grid_type : 0,
        category_id: (category_id && validator.isNumeric(category_id.toString())) ? parseInt(category_id) : 0,
    };
};

// Helper to get product_id from proxy
const getProductIdFromProxy = async (proxy_id) => {
    const query = `SELECT product_id FROM proxies WHERE proxy_id = ?`;
    const rows = await db.sequelize.query(query, { replacements: [proxy_id], type: QueryTypes.SELECT });
    return rows?.[0]?.product_id || null;
};

// Helper to format catalog item
const formatCatalogItem = (e, product_id, req) => {
    const product_icon = e.product_icon?.length > 0 ? e.product_icon : db.get_uploads_url(req) + 'defaultIcon.png';
    return {
        sr_no: e.sr_no,
        endpoint_id: e.endpoint_id,
        product_id,
        proxy_id: e.proxy_id,
        name: e.display_name,
        url: e.endpoint_url,
        description: e.description,
        methods: e.methods,
        product_name: e.product_name,
        display_name: e.product_display_name,
        is_published: e.is_published,
        added_date: e.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(e.added_date)) : "",
        product_note: e.product_note,
        redirect_url: e.redirect_url,
        is_manual: e.is_manual,
        product_icon,
    };
};

// Helper to format endpoint item
const formatEndpointItem = (e) => ({
    endpoint_id: e.endpoint_id,
    name: e.display_name,
    url: e.endpoint_url,
    description: e.description,
    methods: e.methods,
    icon_url: '',
    is_manual: e.is_manual,
    redirect_url: e.redirect_url,
});

// Helper to get endpoints by product_id
const getEndpointsByProductId = async (product_id) => {
    const query = `SELECT endpoint_id, product_id, endpoint_url, display_name, description, methods, is_manual, redirect_url FROM endpoint
        WHERE product_id = ? AND is_deleted = false AND is_product_published = true
        ORDER BY CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 9223372036854775807 ELSE COALESCE(sort_order, 0) END, endpoint_id`;
    return await db.sequelize.query(query, { replacements: [product_id], type: QueryTypes.SELECT });
};

// Helper to get endpoints via proxies
const getEndpointsViaProxies = async (product_id) => {
    const proxyQuery = `SELECT proxy_id FROM proxies WHERE product_id = ? AND is_deleted = false AND is_published = true`;
    const proxies = await db.sequelize.query(proxyQuery, { replacements: [product_id], type: QueryTypes.SELECT });

    const endpoints = [];
    for (const proxy of proxies || []) {
        const endpointQuery = `SELECT endpoint_id, endpoint_url, display_name, description, methods, is_manual, redirect_url FROM endpoint
            WHERE proxy_id = ? AND is_deleted = false AND is_product_published = true
            ORDER BY CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 9223372036854775807 ELSE COALESCE(sort_order, 0) END, endpoint_id`;
        const proxyEndpoints = await db.sequelize.query(endpointQuery, { replacements: [proxy.proxy_id], type: QueryTypes.SELECT });
        endpoints.push(...(proxyEndpoints || []));
    }
    return endpoints;
};

// Helper to get all endpoints for a product
const getEndpointsForProduct = async (product_id) => {
    const directEndpoints = await getEndpointsByProductId(product_id);
    if (directEndpoints?.length > 0) {
        return directEndpoints.map(formatEndpointItem);
    }
    const proxyEndpoints = await getEndpointsViaProxies(product_id);
    return proxyEndpoints.map(formatEndpointItem);
};

// Helper to format product item
const formatProductItem = async (p, req) => {
    const endpoints_list = await getEndpointsForProduct(p.product_id);
    const product_icon = p.product_icon?.length > 0 ? p.product_icon : db.get_uploads_url(req) + 'defaultIcon.png';

    return {
        product_id: p.product_id,
        product_name: p.product_name,
        display_name: p.display_name,
        is_published: p.is_published,
        description: p.description,
        page_text: p.page_text,
        key_features: p.key_features,
        flow_chart: p.flow_chart,
        added_date: p.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(p.added_date)) : "",
        modify_date: p.modify_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(p.modify_date)) : "",
        proxy_count: p.proxy_count,
        product_note: p.product_note,
        product_icon,
        endpoints_list,
    };
};

const contact_us_save = async (req, res, next) => {
    const { first_name, last_name, email_id, company_name, category_id, network_id, mobile_no, subject, message } = req.body;
    try {
        const validationError = validateContactForm(req.body);
        if (validationError) {
            return res.status(200).json(success(false, res.statusCode, validationError, null));
        }

        const { FeedbackCategory, EmailTemplate } = getModels();
        const _category_id = parseInt(category_id);
        const _network_id = parseInt(network_id);

        const _query1 = `INSERT INTO feedback_data(first_name, last_name, email_id, company_name, category_id, network_id, mobile_no,
             subject, message, is_deleted, added_date, ticket_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (NEXTVAL('feedback_ticket_id_sequence') * 100 + currval('feedback_ticket_id_sequence'))) RETURNING "feedback_id" , "ticket_id"`;
        const [row1] = await db.sequelize.query(_query1, {
            replacements: [first_name, last_name, email_id, company_name, _category_id, _network_id, mobile_no, subject, message, false, db.get_ist_current_date()],
            type: QueryTypes.INSERT
        });

        const feedback_id = row1?.[0]?.feedback_id || 0;
        const ticket_id = row1?.[0]?.ticket_id || 0;

        if (feedback_id <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Unable to save your feedback, Please try again.", null));
        }

        const category = await FeedbackCategory.findOne({
            attributes: ['category_name'],
            where: { is_enabled: true, is_deleted: false, category_id: _category_id }
        });

        if (!category) {
            return res.status(200).json(success(false, res.statusCode, "Contact us category not found.", null));
        }

        const template = await EmailTemplate.findOne({
            attributes: ['subject', 'body_text', 'is_enabled'],
            where: { template_id: EmailTemplates.CONTACT_US_REPLY.value }
        });

        await sendContactUsEmail(template, { first_name, last_name, email_id, subject, message, ticket_id }, category.category_name);

        return res.status(200).json(success(true, res.statusCode, "Your message submitted successfully.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const send_reset_link = async (req, res, next) => {
    const { email } = req.body;
    try {
        const { CstCustomer, EmailTemplate } = getModels();
        const customer = await CstCustomer.findOne({
            where: { email_id: email, is_deleted: false }
        });

        if (!customer) {
            return res.status(200).json(success(false, res.statusCode, "Email address is not registered with us.", null));
        }

        const tokenResult = await generateResetToken(customer.customer_id, CstCustomer);
        if (!tokenResult.success) {
            return res.status(200).json(success(false, res.statusCode, "Unable to generate reset password link.", null));
        }

        console.log(tokenResult.resetLink);

        const template = await EmailTemplate.findOne({
            attributes: ['subject', 'body_text', 'is_enabled'],
            where: { template_id: EmailTemplates.ACTIVATION_LINK_RESET_PASS.value }
        });

        if (!template?.is_enabled) {
            return res.status(200).json(success(false, res.statusCode, "Unable to generate reset password link.", null));
        }

        const { subject, body_text } = processResetEmailTemplate(template, customer, tokenResult.resetLink);
        const emailSent = await sendResetPasswordEmail(customer, subject, body_text);

        if (emailSent) {
            return res.status(200).json(success(true, res.statusCode, "Reset password link has been sent on your email address.", null));
        }
        return res.status(200).json(success(false, res.statusCode, "Unable to send reset password link.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const verify_reset_pass = async (req, res, next) => {
    const { token, password } = req.body;
    try {
        const { CstCustomer } = getModels();
        if (!token || token.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Invalid attempt..", null));
        }
        if (!password || password.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter password.", null));
        }
        if (password.length < 8) {
            return res.status(200).json(success(false, res.statusCode, "The password must contain atleast 8 characters.", null));
        }
        const hasNumber = /\d/;
        if (!hasNumber.test(password)) {
            return res.status(200).json(success(false, res.statusCode, "The password must contain a number.", null));
        }
        const specialChars = /[`!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~]/;
        if (!specialChars.test(password)) {
            return res.status(200).json(success(false, res.statusCode, "The password must contain a special character.", null));
        }

        const uuid_decode = Buffer.from(decodeURIComponent(token), 'base64').toString('utf8')
        console.log(uuid_decode);
        const row1 = await CstCustomer.findOne({
            where: { reset_pass_token_id: uuid_decode }
        });
        if (!row1) {
            return res.status(200).json(success(false, API_STATUS.RESET_LINK_EXPIRED.value, "Invalid reset password link or expired.", null));
        }
        const customer_id = row1.customer_id;
        let addMlSeconds = process.env.CUSTOMER_RESET_LINK_EXPIRY * 1000;
        let newDateObj = new Date(db.convert_db_date_to_ist(row1.reset_pass_token_time).getTime() + addMlSeconds);
        if (newDateObj >= db.get_ist_current_date()) {
            let password_hash = await bcrypt.hash(password, 10);
            const [i] = await CstCustomer.update(
                {
                    user_pass: password_hash,
                    reset_pass_token_id: null,
                    reset_pass_token_time: null
                },
                { where: { customer_id: customer_id } }
            );

            if (i > 0) {
                return res.status(200).json(success(true, res.statusCode, "Reset password successfully. ", null));

            } else {
                return res.status(200).json(success(false, res.statusCode, "Unable to reset password, Please try again.", null));
            }
        } else {
            return res.status(200).json(success(false, API_STATUS.RESET_LINK_EXPIRED.value, "Invalid reset password link or expired.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const reset_link_check = async (req, res, next) => {
    const { token } = req.body;
    try {
        const { CstCustomer } = getModels();
        if (!token || token.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Invalid reset password link or expired.", null));
        }
        console.log(token);
        const uuid_decode = Buffer.from(decodeURIComponent(token), 'base64').toString('utf8')
        console.log(uuid_decode);
        const row1 = await CstCustomer.findOne({
            where: { reset_pass_token_id: uuid_decode }
        });
        if (row1) {
            let addMlSeconds = process.env.CUSTOMER_RESET_LINK_EXPIRY * 1000;
            let newDateObj = new Date(db.convert_db_date_to_ist(row1.reset_pass_token_time).getTime() + addMlSeconds);
            if (newDateObj >= db.get_ist_current_date()) {
                return res.status(200).json(success(true, res.statusCode, "Success.", null));
            } else {
                return res.status(200).json(success(false, res.statusCode, "Invalid reset password link or expired.", null));
            }

        } else {
            return res.status(200).json(success(false, res.statusCode, "Invalid reset password link or expired.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const catalog_get = async (req, res, next) => {
    try {
        const params = parsePageParams(req.body);
        const searchPattern = "%" + params.search_text + "%";

        const _query0 = `SELECT count(1) AS total_record
          FROM endpoint e INNER JOIN proxies s ON e.proxy_id = s.proxy_id INNER JOIN product p on s.product_id = p.product_id
          WHERE e.is_published = true AND e.is_deleted = false AND s.is_deleted = false
          AND p.is_published = true AND p.is_deleted = false AND
          CASE WHEN :filter_id = 1 THEN e.added_date BETWEEN (CURRENT_DATE - INTERVAL '7 days') AND CURRENT_DATE
          ELSE (LOWER(p.product_name) LIKE LOWER(:search_text) OR LOWER(e.display_name) LIKE LOWER(:search_text))
          END AND (:categoryId = 0 OR e.category_id = :categoryId)`;

        const row0 = await db.sequelize.query(_query0, {
            replacements: { search_text: searchPattern, filter_id: params.filter_id, categoryId: params.category_id },
            type: QueryTypes.SELECT,
        });
        const total_record = row0?.[0]?.total_record || 0;

        const _query1 = `SELECT ROW_NUMBER() OVER (ORDER BY CASE WHEN COALESCE(p.sort_order, 0) <= 0 THEN 9223372036854775807 ELSE COALESCE(p.sort_order, 0) END, e.sort_order) AS sr_no,
        e.endpoint_id, e.proxy_id, e.product_id, e.endpoint_url, e.display_name, e.description, e.added_date, p.product_name, p.product_icon,p.product_note, p.display_name as product_display_name,
        e.redirect_url, e.is_manual
        FROM endpoint e INNER JOIN proxies s ON e.proxy_id = s.proxy_id INNER JOIN product p on s.product_id = p.product_id
        WHERE e.is_published = true AND e.is_deleted = false AND s.is_deleted = false  AND p.is_published = true AND p.is_deleted = false
        AND (:categoryId = 0 OR e.category_id = :categoryId)
        AND CASE WHEN :filter_id = 1 THEN e.added_date BETWEEN (CURRENT_DATE - INTERVAL '7 days') AND CURRENT_DATE
        ELSE (LOWER(p.product_name) LIKE LOWER(:search_text)  OR LOWER(e.display_name) LIKE LOWER(:search_text))
        END ORDER BY CASE WHEN COALESCE(p.sort_order, 0) <= 0 THEN 9223372036854775807 ELSE COALESCE(p.sort_order, 0) END, e.sort_order
        LIMIT CASE WHEN :grid_type = 3 THEN :page_size  ELSE 9223372036854775807 END OFFSET CASE WHEN :grid_type = 3 THEN ((:page_no - 1) * :page_size) ELSE 0 END`;

        const row1 = await db.sequelize.query(_query1, {
            replacements: {
                search_text: searchPattern,
                page_size: process.env.PAGINATION_SIZE,
                page_no: params.page_no,
                filter_id: params.filter_id,
                grid_type: params.grid_type,
                categoryId: params.category_id,
            },
            type: QueryTypes.SELECT,
        });

        const list = await Promise.all((row1 || []).map(async (e) => {
            const product_id = e.product_id || await getProductIdFromProxy(e.proxy_id);
            return formatCatalogItem(e, product_id, req);
        }));

        const results = {
            current_page: params.page_no,
            total_record,
            total_pages: Math.ceil(total_record / process.env.PAGINATION_SIZE),
            data: list,
        };
        return res.status(200).json(success(true, res.statusCode, "Catalogue data", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const product_details = async (req, res, next) => {
    const { product_id } = req.body;
    try {
        const { Product } = getModels();
        let _product_id = product_id && validator.isNumeric(product_id.toString()) ? parseInt(product_id) : 0;

        const row0 = await Product.findOne({
            attributes: ['product_id', 'product_name', 'display_name', 'is_published', 'description', 'page_text',
                'flow_chart', 'key_features', 'added_date', 'modify_date', 'product_open_spec', 'product_open_spec_json', 'product_documentation_pdf'],
            where: { product_id: _product_id }
        });
        if (row0) {
            let product_open_spec = row0.product_open_spec && row0.product_open_spec.length > 0 ? db.get_uploads_url(req) + row0.product_open_spec : '';
            let product_open_spec_json = row0.product_open_spec_json && row0.product_open_spec_json.length > 0 ? db.get_uploads_url(req) + row0.product_open_spec_json : '';
            let product_documentation_pdf = row0.product_documentation_pdf && row0.product_documentation_pdf.length > 0 ? db.get_uploads_url(req) + row0.product_documentation_pdf : '';

            const results = {
                product_id: row0.product_id,
                product_name: row0.product_name,
                display_name: row0.display_name,
                is_published: row0.is_published,
                description: row0.description,
                page_text: row0.page_text,
                product_open_spec: product_open_spec,
                product_open_spec_json: product_open_spec_json,
                product_documentation_pdf: product_documentation_pdf,
            };
            return res.status(200).json(success(true, res.statusCode, "", results));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Product details not found, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const terms_condition = async (req, res, next) => {
    try {

        const _query = `SELECT ROW_NUMBER() OVER(ORDER BY sort_order Asc) AS sr_no, table_id, sidebar_title, term_content, sort_order, is_enabled FROM term_conditions
        WHERE is_enabled = true AND is_deleted = false
        ORDER BY CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 2147483647 ELSE COALESCE(sort_order, 0) END`;
        const row = await db.sequelize.query(_query, { type: QueryTypes.SELECT });
        const results = (row || []).map(r => ({
            sr_no: r.sr_no,
            id: r.table_id,
            sidebar_title: r.sidebar_title,
            term_content: r.term_content,
            sort_order: r.sort_order,
        }));

        return res.status(200).json(success(true, res.statusCode, "Terms & Condition Data", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};


const product_get = async (req, res, next) => {
    try {
        const params = parsePageParams(req.body);
        const searchPattern = "%" + params.search_text + "%";

        const _query0 = `SELECT count(1) AS total_record
          FROM product p where p.is_product_published = true AND is_deleted = false AND CASE WHEN :filter_id = 1 THEN added_date BETWEEN (CURRENT_DATE - INTERVAL '7 days') AND CURRENT_DATE
          ELSE (LOWER(p.product_name) LIKE LOWER(:search_text) OR (LOWER(p.display_name) LIKE LOWER(:search_text)) OR  LOWER(p.description)  LIKE LOWER(:search_text))
       END  AND (:categoryId = 0 OR p.category_id = :categoryId) `;

        const row0 = await db.sequelize.query(_query0, {
            replacements: { search_text: searchPattern, filter_id: params.filter_id, categoryId: params.category_id },
            type: QueryTypes.SELECT,
        });
        const total_record = row0?.[0]?.total_record || 0;

        const _query1 = `SELECT  p.product_id, p.unique_id, p.product_name, p.display_name, p.is_published,p.description, p.page_text,
          p.key_features, p.flow_chart, p.added_date, p.modify_date, p.added_by, p.modify_by, p.product_icon,p.product_note,
          (SELECT COUNT(*) FROM proxies pp WHERE pp.product_id = p.product_id) AS proxy_count,
          (SELECT COUNT(*) FROM endpoint WHERE product_id = p.product_id AND is_deleted = false AND is_product_published = true) AS endpoint_count
          FROM product p WHERE  p.is_product_published = true AND is_deleted = false  AND (:categoryId = 0 OR p.category_id = :categoryId)
          AND CASE WHEN :filter_id = 1 THEN added_date BETWEEN (CURRENT_DATE - INTERVAL '7 days') AND CURRENT_DATE
          ELSE (LOWER(p.product_name) LIKE LOWER(:search_text) OR (LOWER(p.display_name) LIKE LOWER(:search_text))
          OR LOWER(p.description) LIKE LOWER(:search_text))
          END ORDER BY CASE WHEN COALESCE(p.sort_order, 0) <= 0 THEN 9223372036854775807 ELSE COALESCE(p.sort_order, 0) END,
          endpoint_count DESC LIMIT :page_size OFFSET ((:page_no - 1) * :page_size)`;

        const row1 = await db.sequelize.query(_query1, {
            replacements: {
                search_text: searchPattern,
                page_size: 1000,
                page_no: params.page_no,
                filter_id: params.filter_id,
                categoryId: params.category_id,
            },
            type: QueryTypes.SELECT,
        });

        const product_list = await Promise.all((row1 || []).map(p => formatProductItem(p, req)));

        const results = {
            current_page: params.page_no,
            total_record,
            total_pages: Math.ceil(total_record / process.env.PAGINATION_SIZE),
            data: product_list,
        };
        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const download_file = async (req, res, next) => {
    const { url, filename } = req.body;
    try {
        const fi = await cloudStorage.Download(url, 'product_data/' + filename);
        return res.status(200).json(success(true, res.statusCode, "", fi));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const test = async (req, res, next) => {
    try {
        const results = {
            url: db.get_uploads_url(req),
            data: "success new",
        };
        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};


export {
    home,
    signup_data,
    signup_new,
    success_get,
    verify_email_link,
    login,
    faqs,
    contact_us_form,
    contact_us_save,
    send_reset_link,
    verify_reset_pass,
    reset_link_check,
    catalog_get,
    product_details,
    resend_email_link,
    terms_condition,
    product_get,
    test,
    download_file,
};
