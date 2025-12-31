import { logger as _logger, action_logger } from '../logger/winston.js';
import db from '../database/db_helper.js';
import { QueryTypes, Op, literal } from 'sequelize';
import { success } from "../model/responseModel.js";
import validator from 'validator';
import { API_STATUS } from "../model/enumModel.js";
import { rsa_decrypt } from "../services/rsaEncryption.js";
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import redisDB from '../database/redis_cache.js';
import dateFormat from 'date-format';
import * as customerService from '../services/customerService.js';
import * as admCustomerService from '../services/admin/admCustomerService.js';
import { fetch } from 'cross-fetch';
import { randomUUID } from 'crypto';
import { EmailTemplates } from "../model/enumModel.js";
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

const signup_new = async (req, res, next) => {
    const { post_data, captcha_token } = req.body;
    try {
        const { CstCustomer, Settings } = getModels();
        let jsonData = JSON.parse(rsa_decrypt(post_data));

        let company_name = jsonData.company_name;
        let first_name = jsonData.first_name;
        let last_name = jsonData.last_name;
        let email_id = jsonData.email_id?.toLowerCase().trim();
        let network_id = jsonData.network_id;
        let mobile_no = jsonData.mobile_no;
        let segment_id = jsonData.segment_id;
        let industry_id = jsonData.industry_id;
        let user_name = jsonData.user_name;
        let password = jsonData.password;
        let _captcha_token = ''; if (captcha_token && captcha_token.length > 0) { _captcha_token = captcha_token; }
        const captchaUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.CAPTCHA_SECRET}&response=${_captcha_token}`
        let captcha_valid = false;
        try {
            const captchaResp = await fetch(captchaUrl);
            if (captchaResp.ok) {
                const captchaData = await captchaResp.json();
                if (captchaData?.success) {
                    captcha_valid = true;
                }
            }
        } catch (error) {
            console.error('CAPTCHA validation failed:', error.message);
        }
        if (!captcha_valid) {
            return res.status(200).json(success(false, res.statusCode, "Incorrect captcha.", null));
        }
        if (!first_name || first_name.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter first name.", null));
        }

        if (first_name.length > 30) {
            return res.status(200).json(success(false, res.statusCode, "First name  should not be more than 30 character", null));
        }
        if (!last_name || last_name.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter last name.", null));
        }
        if (last_name.length > 30) {
            return res.status(200).json(success(false, res.statusCode, "Last name  should not be more than 30 character", null));
        }
        first_name = sanitizeInput(first_name);
        last_name = sanitizeInput(last_name);

        if (!network_id || !validator.isNumeric(network_id.toString()) || network_id <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please select country code.", null));
        }
        if (!mobile_no || mobile_no.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter mobile number.", null));
        }
        if ((mobile_no && mobile_no.length > 0 && !validator.isNumeric(mobile_no)) || mobile_no.length != 10) {
            return res.status(200).json(success(false, res.statusCode, "Invalid mobile number.", null));
        }
        if (!email_id || email_id.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter email address.", null));
        }
        if (email_id && email_id.length > 0 && !validator.isEmail(email_id)) {
            return res.status(200).json(success(false, res.statusCode, "Invalid email address.", null));
        }

        let isEmailValid = await apigeeService.emailVerification(email_id);
        console.log("=====isEmailValid===", isEmailValid);
        if (!isEmailValid) {
            return res.status(200).json(success(false, res.statusCode, "Invalid email address. Please enter a valid one.", null));
        }
        let isMobileValid = await apigeeService.mobileVerification(mobile_no);
        console.log("=====isMobileValid===", isMobileValid);
        if (!isMobileValid) {
            return res.status(200).json(success(false, res.statusCode, "Invalid mobile no. Please enter a valid one.", null));
        }

        if (!segment_id || !validator.isNumeric(segment_id.toString()) || segment_id <= 0) { segment_id = 0; }
        // if (!segment_id || !validator.isNumeric(segment_id.toString()) || segment_id <= 0) {
        //     return res.status(200).json(success(false, res.statusCode, "Please select segment.", null));
        // }
        if (!industry_id || !validator.isNumeric(industry_id.toString()) || industry_id <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please select business category.", null));
        }
        if (!company_name || company_name.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter company name.", null));
        }
        company_name = sanitizeInput(company_name);
        if (!user_name || user_name == null) { user_name = ''; }
        // if (!user_name || user_name.length <= 0) {
        //     return res.status(200).json(success(false, res.statusCode, "Please enter user name.", null));
        // }
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
        const specialChars = /[`!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]/;
        if (!specialChars.test(password)) {
            return res.status(200).json(success(false, res.statusCode, "The password must contain a special character.", null));
        }


        const row1 = await CstCustomer.findOne({
            attributes: ['customer_id'],
            where: { email_id: email_id, is_deleted: false }
        });
        if (row1) {
            return res.status(200).json(success(false, res.statusCode, "Email address is already registered.", null));
        }
        const row2 = await CstCustomer.findOne({
            attributes: ['customer_id'],
            where: { mobile_no: mobile_no, is_deleted: false }
        });
        if (row2) {
            return res.status(200).json(success(false, res.statusCode, "Mobile number is already registered.", null));
        }

        let password_hash = await bcrypt.hash(password, 10);

        const _query1 = `INSERT INTO cst_customer(company_name, first_name, last_name, email_id, network_id, mobile_no, user_name, user_pass,
            register_date, is_enabled, is_deleted, is_approved, industry_id, segment_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING "customer_id", "unique_id"`;
        const _replacements2 = [company_name, first_name, last_name, email_id, network_id, mobile_no, user_name, password_hash, db.get_ist_current_date(), true, false, 0, industry_id, segment_id];
        const [rowOut] = await db.sequelize.query(_query1, { replacements: _replacements2, type: QueryTypes.INSERT });
        const customer_id = (rowOut && rowOut.length > 0 && rowOut[0] ? rowOut[0].customer_id : 0);
        const unique_id = (rowOut && rowOut.length > 0 && rowOut[0] ? rowOut[0].unique_id : "");

        if (customer_id > 0) {
            const results = { id: unique_id, };
            res.setHeader('x-customer-key', unique_id);

            let is_auto_approve = false;
            const settingsRow = await Settings.findOne({
                attributes: ['is_auto_approve_customer']
            });
            if (settingsRow) {
                is_auto_approve = settingsRow.is_auto_approve_customer;
                if (is_auto_approve && is_auto_approve === true) {
                    await admCustomerService.customer_approve_auto(customer_id);
                    is_auto_approve = true;
                }
            }

            await customerService.send_activation_link(customer_id);/* send activation link to user from this link user will activate itself */
            await customerService.sendSignUpMail(customer_id);/* send mail to businees team email id after sign up*/

            const row15 = await CstCustomer.findOne({
                attributes: ['account_id'],
                where: { customer_id: customer_id }
            });

            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: 0,
                    account_id: (row15 ? row15.account_id : 0),
                    user_type: 2,
                    user_id: customer_id,
                    narration: 'New customer registered and activation link sent.' + (is_auto_approve ? ' (Auto approved)' : ''),
                    query: db.buildQuery_Array(_query1, _replacements2),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }


            return res.status(200).json(success(true, API_STATUS.CUSTOMER_REGISTERED.value, "Your registration is successful. You will receive an email with activation link.", results));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to register, Please try again.", null));
        }
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

const verify_email_link = async (req, res, next) => {
    const { token_id } = req.body;
    try {
        const { CstCustomer } = getModels();
        let _decoded = '';
        try {
            _decoded = Buffer.from(decodeURIComponent(token_id), 'base64').toString('utf8')
        } catch (e) {
        }
        if (_decoded && _decoded.length > 0) {
            const row4 = await CstCustomer.findOne({
                attributes: ['customer_id', 'email_id', 'is_enabled', 'is_approved', 'is_activated', 'activation_token_time'],
                where: { activation_token_id: _decoded, is_deleted: false }
            });
            if (row4) {
                if (row4.is_activated > 0) {
                    return res.status(200).json(success(false, res.statusCode, "Your account is already activated.", null));
                }
                else {
                    let addMlSeconds = process.env.VERIFICATION_EMAIL_LINK_EXPIRY * 1000;
                    let newDateObj = new Date(db.convert_db_date_to_ist(row4.activation_token_time).getTime() + addMlSeconds);
                    if (newDateObj >= db.get_ist_current_date()) {
                        const [affectedRows] = await CstCustomer.update(
                            {
                                is_activated: 1,
                                activation_token_id: null,
                                activation_token_time: null,
                                activated_date: db.get_ist_current_date()
                            },
                            { where: { customer_id: row4.customer_id } }
                        );
                        if (affectedRows > 0) {
                            return res.status(200).json(success(true, API_STATUS.CUSTOMER_ACTIVATED.value, "Your account activated successfully, Please login with your email id and password.", null));
                        } else {
                            return res.status(200).json(success(false, res.statusCode, "Unable to activate your account, Please try again.", null));
                        }
                    } else {
                        return res.status(200).json(success(false, API_STATUS.ACTIVATION_LINK_EXPIRED.value, "Invalid activation link or expired.", null));
                    }
                }
            } else {
                return res.status(200).json(success(false, res.statusCode, "Invalid activation link or expired.", null));
            }
        } else {
            return res.status(200).json(success(false, res.statusCode, "Invalid activation link or expired.", null));
        }
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

const login = async (req, res, next) => {
    const { post_data } = req.body;
    try {
        const { CstCustomer } = getModels();
        console.log(post_data);
        let jsonData = JSON.parse(rsa_decrypt(post_data));

        let user_name = jsonData.user_name;
        let password = jsonData.password;

        if (!user_name || user_name.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter email id.", null));
        }
        if (!password || password.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter password.", null));
        }
        const row1 = await CstCustomer.findOne({
            attributes: ['customer_id', 'first_name', 'last_name', 'email_id', 'mobile_no', 'user_pass', 'is_enabled', 'is_deleted',
                'is_activated', 'is_approved', 'account_id', 'is_live_sandbox', 'billing_type'],
            where: { email_id: user_name, is_deleted: false }
        });
        if (!row1) {
            return res.status(200).json(success(false, res.statusCode, "Invalid username or password.", null));
        }
        if (row1.is_deleted) {
            return res.status(200).json(success(false, res.statusCode, "Your account does not exist.", null));
        }
        const isValidPass = await bcrypt.compare(password, row1.user_pass);
        if (!isValidPass) {
            return res.status(200).json(success(false, res.statusCode, "Invalid username or password.", null));
        }
        if (row1.is_activated <= 0) {
            return res.status(200).json(success(false, API_STATUS.CUST_ACC_NOT_ACTIVE.value,
                "Your account is not activated, Please check your email inbox for activation mail.", null));
        }
        if (row1.is_approved <= 0) {
            return res.status(200).json(success(false, API_STATUS.CUST_ACC_NOT_APPROVED.value,
                "Your account is not yet approved, Please contact to administrator.", null));
        }
        if (!row1.is_enabled) {
            return res.status(200).json(success(false, res.statusCode, "Your account has been blocked, contact system administrator.", null));
        }

        const jwtUser = { id: row1.customer_id }
        const accessToken = jwt.sign(jwtUser, process.env.JWT_ACCESS_TOKEN_KEY,
            { algorithm: 'HS256', allowInsecureKeySizes: true, expiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRES * 1000, }
        );
        const refreshToken = jwt.sign(jwtUser, process.env.JWT_REFRESH_TOKEN_KEY,
            { algorithm: 'HS256', allowInsecureKeySizes: true, expiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRES * 1000, }
        );

        let ip = '';
        try {
            const clientIp = requestIp.getClientIp(req);
            ip = clientIp;
        } catch {
        }

        let user_agent = req.headers['user-agent'];

        let os_name = '';
        try {
            const result = detector.detect(user_agent);
            os_name = result.os.name;
        } catch (e) {

        }

        const _query2 = `INSERT INTO cst_token(customer_id, added_date, last_action, ip_address, is_logout, logout_time, user_agent, device_name)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING "token_id", "unique_id"`;
        const _replacements2 = [row1.customer_id, db.get_ist_current_date(), db.get_ist_current_date(), ip, false, null, user_agent, os_name];
        const [row2] = await db.sequelize.query(_query2, { replacements: _replacements2, returning: true });
        const token_id = (row2 && row2.length > 0 && row2[0] ? row2[0].token_id : 0);
        const unique_id = (row2 && row2.length > 0 && row2[0] ? row2[0].unique_id : "");
        if (process.env.REDIS_ENABLED > 0) {
            await redisDB.set(unique_id, refreshToken, { EX: process.env.REDIS_CACHE_EXPIRY });
        }

        const results = {
            first_name: row1.first_name,
            last_name: row1.last_name,
            email_id: row1.email_id,
            mobile_no: row1.mobile_no,
            is_live_sandbox: row1.is_live_sandbox,
            billing_type: row1.billing_type,
            access_token: accessToken,
            refresh_token: refreshToken,
            token_expiry: process.env.JWT_ACCESS_TOKEN_EXPIRES,
            token_issued_at: dateFormat(process.env.DATE_FORMAT, db.get_ist_current_date()),
            auth_key: unique_id,
        };
        res.setHeader('x-auth-key', unique_id);

        /*
        try {
            let data_to_log = {
                correlation_id: correlator.getId(),
                token_id: token_id,
                account_id: row1.account_id,
                user_type: 2,
                user_id: row1.customer_id,
                narration: 'Logged in.',
                query: db.buildQuery_Array(_query2, _replacements2),
            }
            action_logger.info(JSON.stringify(data_to_log));
        } catch (_) { }
        */

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

const contact_us_save = async (req, res, next) => {
    const { first_name, last_name, email_id, company_name, category_id, network_id, mobile_no, subject, message } = req.body;
    try {
        const { FeedbackCategory, EmailTemplate } = getModels();
        if (!first_name || first_name.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter first name.", null));
        }
        if (!last_name || last_name.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter last name.", null));
        }
        if (!email_id || email_id.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter email address.", null));
        }
        if (email_id && email_id.length > 0 && !validator.isEmail(email_id)) {
            return res.status(200).json(success(false, res.statusCode, "Please enter correct email address.", null));
        }
        if (!company_name || company_name.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter company name.", null));
        }
        let _category_id = category_id && validator.isNumeric(category_id.toString()) ? parseInt(category_id) : 0;
        if (_category_id <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please select issue type.", null));
        }
        let _network_id = network_id && validator.isNumeric(network_id.toString()) ? parseInt(network_id) : 0;
        if (_network_id <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please select country code.", null));
        }
        if (!mobile_no || mobile_no.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter mobile number.", null));
        }
        if ((mobile_no && mobile_no.length > 0 && !validator.isNumeric(mobile_no)) || mobile_no.length != 10) {
            return res.status(200).json(success(false, res.statusCode, "Please enter correct mobile number.", null));
        }
        if (!subject || subject.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter subject.", null));
        }
        if (!message || message.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter message.", null));
        }
        const _query1 = `INSERT INTO feedback_data(first_name, last_name, email_id, company_name, category_id, network_id, mobile_no,
             subject, message, is_deleted, added_date, ticket_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (NEXTVAL('feedback_ticket_id_sequence') * 100 + currval('feedback_ticket_id_sequence'))) RETURNING "feedback_id" , "ticket_id"`;
        const _replacements2 = [first_name, last_name, email_id, company_name, _category_id, _network_id, mobile_no, subject, message, false, db.get_ist_current_date()];
        const [row1] = await db.sequelize.query(_query1, { replacements: _replacements2, type: QueryTypes.INSERT });
        console.log(row1);
        const feedback_id = (row1 && row1.length > 0 && row1[0] ? row1[0].feedback_id : 0);
        const ticket_id = (row1 && row1.length > 0 && row1[0] ? row1[0].ticket_id : 0);
        if (feedback_id > 0) {
            const row2 = await FeedbackCategory.findOne({
                attributes: ['category_id', 'category_name'],
                where: { is_enabled: true, is_deleted: false, category_id: _category_id }
            });
            if (!row2) {
                return res.status(200).json(success(false, res.statusCode, "Contact us category not found.", null));
            }

            const rowT = await EmailTemplate.findOne({
                attributes: ['subject', 'body_text', 'is_enabled'],
                where: { template_id: EmailTemplates.CONTACT_US_REPLY.value }
            });
            if (rowT) {
                if (rowT.is_enabled) {
                    let _subject = rowT.subject && rowT.subject.length > 0 ? rowT.subject : "";
                    let body_text = rowT.body_text && rowT.body_text.length > 0 ? rowT.body_text : "";

                    _subject = _subject.replaceAll('{{TICKET_ID}}', ticket_id);

                    body_text = body_text.replaceAll('{{FULL_NAME}}', first_name + ' ' + last_name);
                    body_text = body_text.replaceAll('{{TICKET_ID}}', ticket_id);
                    body_text = body_text.replaceAll('{{ISSUE_TYPE}}', row2.category_name);
                    body_text = body_text.replaceAll('{{SUBJECT}}', subject);
                    body_text = body_text.replaceAll('{{MESSAGE}}', message);
                    body_text = body_text.replaceAll(process.env.SITE_URL_TAG, process.env.FRONT_SITE_URL);
                    let mailOptions = {
                        from: process.env.EMAIL_SUPPORT_EMAIL, // sender address
                        to: email_id, // list of receivers
                        subject: _subject, // Subject line
                        html: body_text, // html body
                    }
                    let is_success = false;
                    try {
                        await supportTransporter.sendMail(mailOptions);
                        is_success = true;
                    } catch (err) {
                        _logger.error(err.stack);
                    }
                    return res.status(200).json(success(true, res.statusCode, "Your message submitted successfully.", null));
                } else {
                    return res.status(200).json(success(true, res.statusCode, "Your message submitted successfully.", null));
                }
            }
            else {
                return res.status(200).json(success(true, res.statusCode, "Your message submitted successfully.", null));
            }
        }
        else {
            return res.status(200).json(success(false, res.statusCode, "Unable to save your feedback, Please try again.", null));
        }
    }
    catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const send_reset_link = async (req, res, next) => {
    const { email } = req.body;
    try {
        const { CstCustomer, EmailTemplate } = getModels();
        const row4 = await CstCustomer.findOne({
            where: { email_id: email, is_deleted: false }
        });
        if (row4) {
            const customer_id = row4.customer_id;
            const uuid = randomUUID();
            const uuid_encoded = encodeURIComponent(Buffer.from(uuid.toString(), 'utf8').toString('base64'));
            let activation_link = process.env.FRONT_SITE_URL + 'reset/' + uuid_encoded;
            console.log(activation_link);

            const [i] = await CstCustomer.update(
                {
                    reset_pass_token_id: uuid,
                    reset_pass_token_time: db.get_ist_current_date()
                },
                { where: { customer_id: customer_id } }
            );
            if (i > 0) {
                const rowT = await EmailTemplate.findOne({
                    attributes: ['subject', 'body_text', 'is_enabled'],
                    where: { template_id: EmailTemplates.ACTIVATION_LINK_RESET_PASS.value }
                });
                if (rowT) {
                    if (rowT.is_enabled) {
                        let subject = rowT.subject && rowT.subject.length > 0 ? rowT.subject : "";
                        let body_text = rowT.body_text && rowT.body_text.length > 0 ? rowT.body_text : "";

                        subject = subject.replaceAll(process.env.EMAIL_TAG_FIRST_NAME, row4.first_name);
                        subject = subject.replaceAll(process.env.EMAIL_TAG_LAST_NAME, row4.last_name);
                        subject = subject.replaceAll(process.env.EMAIL_TAG_EMAIL_ID, row4.email_id);
                        subject = subject.replaceAll(process.env.EMAIL_TAG_MOBILE_NO, row4.mobile_no);
                        subject = subject.replaceAll(process.env.SITE_URL_TAG, process.env.FRONT_SITE_URL);

                        body_text = body_text.replaceAll(process.env.EMAIL_TAG_FIRST_NAME, row4.first_name);
                        body_text = body_text.replaceAll(process.env.EMAIL_TAG_LAST_NAME, row4.last_name);
                        body_text = body_text.replaceAll(process.env.EMAIL_TAG_EMAIL_ID, row4.email_id);
                        body_text = body_text.replaceAll(process.env.EMAIL_TAG_MOBILE_NO, row4.mobile_no);
                        body_text = body_text.replaceAll(process.env.EMAIL_TAG_RESET_PASS_LINK, activation_link);
                        body_text = body_text.replaceAll(process.env.SITE_URL_TAG, process.env.FRONT_SITE_URL);
                        body_text = body_text.replaceAll(process.env.SITE_URL_TAG, process.env.FRONT_SITE_URL);
                        body_text = body_text.replaceAll(process.env.SITE_URL_TAG, process.env.FRONT_SITE_URL);
                        body_text = body_text.replaceAll(process.env.SITE_URL_TAG, process.env.FRONT_SITE_URL);

                        let mailOptions = {
                            from: process.env.EMAIL_CONFIG_SENDER, // sender address
                            to: row4.email_id, // list of receivers
                            subject: subject, // Subject line
                            html: body_text, // html body
                        }
                        let is_success = false;
                        try {
                            await emailTransporter.sendMail(mailOptions);
                            is_success = true;
                        } catch (err) {
                            console.log(err);
                            _logger.error(err.stack);
                        }
                        if (is_success) {
                            return res.status(200).json(success(true, res.statusCode, "Reset password link has been sent on your email address.", null));
                        } else {
                            return res.status(200).json(success(false, res.statusCode, "Unable to send reset password link.", null));
                        }
                    } else {
                        return res.status(200).json(success(false, res.statusCode, "Unable to generate reset password link.", null));
                    }
                } else {
                    return res.status(200).json(success(false, res.statusCode, "Unable to generate reset password link.", null));
                }
            } else {
                return res.status(200).json(success(false, res.statusCode, "Unable to generate reset password link.", null));
            }
        } else {
            return res.status(200).json(success(false, res.statusCode, "Email address is not registered with us.", null));
        }
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
        const specialChars = /[`!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]/;
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
    const { page_no, filter_id, search_text, grid_type, category_id } = req.body;
    try {
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0;
        if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";
        let _filter_id = filter_id && filter_id > 0 ? filter_id : 0;
        let _grid_type = grid_type && grid_type > 0 ? grid_type : 0;
        let categoryId = category_id && validator.isNumeric(category_id.toString()) ? parseInt(category_id) : 0;
        const _query0 = `SELECT count(1) AS total_record
          FROM endpoint e INNER JOIN proxies s ON e.proxy_id = s.proxy_id INNER JOIN product p on s.product_id = p.product_id
          WHERE e.is_published = true AND e.is_deleted = false AND s.is_deleted = false
          AND p.is_published = true AND p.is_deleted = false AND
          CASE WHEN :filter_id = 1 THEN e.added_date BETWEEN (CURRENT_DATE - INTERVAL '7 days') AND CURRENT_DATE
          ELSE (LOWER(p.product_name) LIKE LOWER(:search_text) OR LOWER(e.display_name) LIKE LOWER(:search_text))
          END AND (:categoryId = 0 OR e.category_id = :categoryId)`;

        const row0 = await db.sequelize.query(_query0, {
            replacements: {
                search_text: "%" + _search_text + "%",
                filter_id: _filter_id,
                categoryId: categoryId,
            },
            type: QueryTypes.SELECT,
        });
        let total_record = 0;
        if (row0 && row0.length > 0) {
            total_record = row0[0].total_record;
        }

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
        //   LIMIT :page_size OFFSET ((:page_no - 1) * :page_size)
        const row1 = await db.sequelize.query(_query1, {
            replacements: {
                search_text: "%" + _search_text + "%",
                page_size: process.env.PAGINATION_SIZE,
                page_no: _page_no,
                filter_id: _filter_id,
                grid_type: _grid_type,
                categoryId: categoryId,

            },
            type: QueryTypes.SELECT,
        });
        let list = [];
        if (row1) {
            for (const e of row1) {
                let product_id = e.product_id;
                if (!product_id || product_id == null) {
                    const _query3 = `SELECT proxy_id, product_id, proxy_name FROM proxies WHERE proxy_id = ?`;
                    const row3 = await db.sequelize.query(_query3, { replacements: [e.proxy_id], type: QueryTypes.SELECT });
                    if (row3 && row3.length > 0) {
                        product_id = row3[0].product_id;
                    }
                }
                let product_icon = e.product_icon && e.product_icon.length > 0 ? e.product_icon : db.get_uploads_url(req) + 'defaultIcon.png';
                list.push({
                    sr_no: e.sr_no,
                    endpoint_id: e.endpoint_id,
                    product_id: product_id,
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
                    product_icon: product_icon,
                });
            }
        }

        const results = {
            current_page: _page_no,
            total_record: total_record,
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
    const { page_no, filter_id, search_text, category_id } = req.body;
    try {
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0;
        if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";
        let _filter_id = filter_id && filter_id > 0 ? filter_id : 0;
        let categoryId = category_id && validator.isNumeric(category_id.toString()) ? parseInt(category_id) : 0;
        const _query0 = `SELECT count(1) AS total_record
          FROM product p where p.is_product_published = true AND is_deleted = false AND CASE WHEN :filter_id = 1 THEN added_date BETWEEN (CURRENT_DATE - INTERVAL '7 days') AND CURRENT_DATE
          ELSE (LOWER(p.product_name) LIKE LOWER(:search_text) OR (LOWER(p.display_name) LIKE LOWER(:search_text)) OR  LOWER(p.description)  LIKE LOWER(:search_text))
       END  AND (:categoryId = 0 OR p.category_id = :categoryId) `;
        const row0 = await db.sequelize.query(_query0, {
            replacements: {
                search_text: "%" + _search_text + "%",
                filter_id: _filter_id,
                categoryId: categoryId,
            },
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
                search_text: "%" + _search_text + "%",
                // page_size: process.env.PAGINATION_SIZE,
                page_size: 1000,
                page_no: _page_no,
                filter_id: _filter_id,
                categoryId: categoryId,
            },
            type: QueryTypes.SELECT,
        });
        let product_list = [];
        if (row1) {
            for (const p of row1) {
                let endpoints_list = [];
                const _query4 = `SELECT endpoint_id, product_id, endpoint_url, display_name, description, methods, is_manual, redirect_url FROM endpoint
                        WHERE product_id = ? AND is_deleted = false AND is_product_published = true
                        ORDER BY CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 9223372036854775807 ELSE COALESCE(sort_order, 0) END, endpoint_id`;
                const row4 = await db.sequelize.query(_query4, { replacements: [p.product_id], type: QueryTypes.SELECT });
                if (row4 && row4.length > 0) {
                    for (const e of row4) {
                        endpoints_list.push({
                            endpoint_id: e.endpoint_id,
                            name: e.display_name,
                            url: e.endpoint_url,
                            description: e.description,
                            methods: e.methods,
                            icon_url: '',
                            is_manual: e.is_manual,
                            redirect_url: e.redirect_url,
                        });
                    }
                } else {
                    const _query3 = `SELECT proxy_id, proxy_name FROM proxies WHERE product_id = ? AND is_deleted = false AND is_published = true`;
                    const row3 = await db.sequelize.query(_query3, { replacements: [p.product_id], type: QueryTypes.SELECT });
                    if (row3) {
                        for (const item of row3) {
                            const _query4 = `SELECT endpoint_id, endpoint_url, display_name, description, methods, is_manual, redirect_url FROM endpoint
                            WHERE proxy_id = ? AND is_deleted = false AND is_product_published = true
                            ORDER BY CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 9223372036854775807 ELSE COALESCE(sort_order, 0) END, endpoint_id`;
                            const row4 = await db.sequelize.query(_query4, { replacements: [item.proxy_id], type: QueryTypes.SELECT });
                            if (row4) {
                                for (const e of row4) {
                                    endpoints_list.push({
                                        endpoint_id: e.endpoint_id,
                                        name: e.display_name,
                                        url: e.endpoint_url,
                                        description: e.description,
                                        methods: e.methods,
                                        icon_url: '',
                                        is_manual: e.is_manual,
                                        redirect_url: e.redirect_url,
                                    });
                                }
                            }
                        }
                    }
                }

                let product_icon = p.product_icon && p.product_icon.length > 0 ? p.product_icon : db.get_uploads_url(req) + 'defaultIcon.png';
                product_list.push({
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
                    product_icon: product_icon,
                    endpoints_list: endpoints_list,
                });
            }
        }

        const results = {
            current_page: _page_no,
            total_record: total_record,
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
