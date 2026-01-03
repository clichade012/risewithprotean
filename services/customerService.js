import { logger as _logger, action_logger } from '../logger/winston.js';
import db from '../database/db_helper.js';
import { QueryTypes, Op, literal } from 'sequelize';
import { success } from "../model/responseModel.js";
import { Constants } from "../model/constantModel.js";
import { EmailTemplates, STATUS_TYPE } from "../model/enumModel.js";
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { fetch } from 'cross-fetch';
import redisDB from '../database/redis_cache.js';
import crypto, { randomUUID, X509Certificate } from 'crypto';
import dateFormat from 'date-format';
import validator from 'validator';
import emailTransporter from "../services/emailService.js";
import supportTransporter from "../services/supportService.js";
import paymentService from "../services/paymentService.js";
import billDeskModule from "../modules/billDeskModule.js";
import commonModule from "../modules/commonModule.js";
import fs from 'fs-extra';
import jws from 'jws';
import { readFileSync } from 'fs';
import correlator from 'express-correlation-id';
import cloudStorage from "./cloudStorage.js";
import moment from 'moment';
import excel from 'exceljs';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import requestIp from 'request-ip';

const getModels = () => db.models;

const contact_us_form = async (req, res, next) => {
    try {
        const { FeedbackCategory, MobileNetwork, CstCustomer } = getModels();

        // Get feedback categories
        const categories = await FeedbackCategory.findAll({
            attributes: ['category_id', 'category_name'],
            where: {
                is_enabled: true,
                is_deleted: false,
            },
            order: [
                [literal('CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 2147483647 ELSE COALESCE(sort_order, 0) END'), 'ASC'],
                ['category_id', 'ASC'],
            ],
        });
        const issue_type = categories.map(item => ({
            id: item.category_id,
            name: item.category_name,
        }));

        // Get mobile networks
        const networks = await MobileNetwork.findAll({
            attributes: ['network_id', 'network_code'],
            where: {
                is_enabled: true,
                is_deleted: false,
            },
            order: [
                [literal('CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 2147483647 ELSE COALESCE(sort_order, 0) END'), 'ASC'],
                ['network_id', 'ASC'],
            ],
        });
        const network = networks.map(item => ({
            id: item.network_id,
            name: item.network_code,
        }));

        // Get customer details
        const customer = await CstCustomer.findOne({
            attributes: ['company_name', 'first_name', 'last_name', 'email_id', 'network_id', 'mobile_no'],
            where: {
                customer_id: req.token_data.customer_id,
            },
        });

        if (customer) {
            const results = {
                first_name: customer.first_name,
                last_name: customer.last_name,
                email_id: customer.email_id,
                network_id: customer.network_id,
                mobile_no: customer.mobile_no,
                company_name: customer.company_name,
                issue_type: issue_type,
                network: network,
            };
            return res.status(200).json(success(true, res.statusCode, "", results));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to find profile detail, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

// Helper to parse numeric ID from input
const parseNumericId = (value) => {
    return (value && validator.isNumeric(value.toString())) ? parseInt(value) : 0;
};

// Helper to validate contact form fields - returns { error, _category_id, _network_id }
const validateContactForm = (data) => {
    const { first_name, last_name, email_id, company_name, category_id, network_id, mobile_no, subject, message } = data;
    const _category_id = parseNumericId(category_id);
    const _network_id = parseNumericId(network_id);

    let error = null;
    if (!first_name?.length) error = "Please enter first name.";
    else if (!last_name?.length) error = "Please enter last name.";
    else if (!email_id?.length) error = "Please enter email address.";
    else if (!validator.isEmail(email_id)) error = "Please enter correct email address.";
    else if (!company_name?.length) error = "Please enter company name.";
    else if (_category_id <= 0) error = "Please select issue type.";
    else if (_network_id <= 0) error = "Please select country code.";
    else if (!mobile_no?.length) error = "Please enter mobile number.";
    else if (!validator.isNumeric(mobile_no) || mobile_no.length !== 10) error = "Please enter correct mobile number.";
    else if (!subject?.length) error = "Please enter subject.";
    else if (!message?.length) error = "Please enter message.";

    return { error, _category_id, _network_id };
};

// Helper to send contact us confirmation email
const sendContactUsConfirmationEmail = async (template, data) => {
    if (!template?.is_enabled) return;

    let _subject = template.subject || "";
    let body_text = template.body_text || "";

    _subject = _subject.replaceAll('{{TICKET_ID}}', data.ticket_id);
    body_text = body_text.replaceAll('{{FULL_NAME}}', `${data.first_name} ${data.last_name}`);
    body_text = body_text.replaceAll('{{TICKET_ID}}', data.ticket_id);
    body_text = body_text.replaceAll('{{ISSUE_TYPE}}', data.category_name);
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

const contact_us_save = async (req, res, next) => {
    const { first_name, last_name, email_id, company_name,  mobile_no, subject, message } = req.body;
    try {
        const { FeedbackCategory, EmailTemplate } = getModels();

        const { error, _category_id, _network_id } = validateContactForm(req.body);
        if (error) {
            return res.status(200).json(success(false, res.statusCode, error, null));
        }

        const _query1 = `INSERT INTO feedback_data(customer_id, first_name, last_name, email_id, company_name, category_id, network_id, mobile_no,
             subject, message, is_deleted, added_date, ticket_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (NEXTVAL('feedback_ticket_id_sequence') * 100 + currval('feedback_ticket_id_sequence'))) RETURNING "feedback_id" , "ticket_id"`;
        const _replacements2 = [req.token_data.customer_id, first_name, last_name, email_id, company_name, _category_id, _network_id, mobile_no, subject, message, false, db.get_ist_current_date()];
        const [row1] = await db.sequelize.query(_query1, { replacements: _replacements2, type: QueryTypes.INSERT });

        const feedback_id = row1?.[0]?.feedback_id || 0;
        const ticket_id = row1?.[0]?.ticket_id || 0;

        if (feedback_id <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Unable to save your feedback, Please try again.", null));
        }

        const categoryData = await FeedbackCategory.findOne({
            attributes: ['category_id', 'category_name'],
            where: { is_enabled: true, is_deleted: false, category_id: _category_id },
        });

        if (!categoryData) {
            return res.status(200).json(success(false, res.statusCode, "Contact us category not found.", null));
        }

        const emailTemplate = await EmailTemplate.findOne({
            attributes: ['subject', 'body_text', 'is_enabled'],
            where: { template_id: EmailTemplates.CONTACT_US_REPLY.value },
        });

        await sendContactUsConfirmationEmail(emailTemplate, {
            ticket_id, first_name, last_name, email_id, subject, message,
            category_name: categoryData.category_name
        });

        try {
            action_logger.info(JSON.stringify({
                correlation_id: correlator.getId(),
                token_id: req.token_data.token_id,
                account_id: req.token_data.account_id,
                user_type: 2,
                user_id: req.token_data.customer_id,
                narration: 'New contact us issue raised.',
                query: db.buildQuery_Array(_query1, _replacements2),
                date_time: db.get_ist_current_date(),
            }));
        } catch (_) { }

        return res.status(200).json(success(true, res.statusCode, "Your message submitted successfully.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

// Helper to generate activation token and link
const generateActivationLink = () => {
    const uuid = randomUUID();
    const uuid_encoded = encodeURIComponent(Buffer.from(uuid.toString(), 'utf8').toString('base64'));
    return { uuid, link: process.env.FRONT_SITE_URL + 'verify/' + uuid_encoded };
};

// Helper to process customer email template with replacements
const processCustomerEmailTemplate = (template, customer, extraReplacements = {}) => {
    let subject = template.subject || "";
    let body_text = template.body_text || "";

    const replacements = {
        [process.env.EMAIL_TAG_FIRST_NAME]: customer.first_name,
        [process.env.EMAIL_TAG_LAST_NAME]: customer.last_name,
        [process.env.EMAIL_TAG_EMAIL_ID]: customer.email_id,
        [process.env.EMAIL_TAG_MOBILE_NO]: customer.mobile_no,
        [process.env.SITE_URL_TAG]: process.env.FRONT_SITE_URL,
        ...extraReplacements
    };

    for (const [tag, value] of Object.entries(replacements)) {
        if (tag && value !== undefined) {
            subject = subject.replaceAll(tag, value);
            body_text = body_text.replaceAll(tag, value);
        }
    }

    return { subject, body_text };
};

// Helper to send email via transporter
const sendCustomerEmail = async (to, subject, body_text) => {
    try {
        await emailTransporter.sendMail({
            from: process.env.EMAIL_CONFIG_SENDER,
            to,
            subject,
            html: body_text,
        });
        return true;
    } catch (err) {
        _logger.error(err.stack);
        return false;
    }
};

const send_activation_link = async (customer_id) => {
    const { CstCustomer, EmailTemplate } = getModels();

    const customerData = await CstCustomer.findOne({
        attributes: ['company_name', 'first_name', 'last_name', 'email_id', 'mobile_no', 'register_date', 'is_activated'],
        where: { customer_id }
    });

    if (!customerData) return 0; // Customer data not found

    if (customerData.is_activated > 0) return -1; // Already activated

    const { uuid, link } = generateActivationLink();

    const [updateCount] = await CstCustomer.update(
        { activation_token_id: uuid, activation_token_time: db.get_ist_current_date() },
        { where: { customer_id } }
    );

    if (updateCount <= 0) return -2; // Unable to update link uuid

    const emailTemplate = await EmailTemplate.findOne({
        attributes: ['subject', 'body_text', 'is_enabled'],
        where: { template_id: EmailTemplates.ACTIVATION_LINK_AFTER_REG.value }
    });

    if (!emailTemplate) return -3; // Template not found
    if (!emailTemplate.is_enabled) return -4; // Template is disabled

    const { subject, body_text } = processCustomerEmailTemplate(emailTemplate, customerData, {
        [process.env.EMAIL_TAG_ACTIVATION_LINK]: link
    });

    const emailSent = await sendCustomerEmail(customerData.email_id, subject, body_text);
    return emailSent ? 1 : 0; // 1 = sent, 0 = sending fail
}

// Helper to process signup email template
const processSignUpEmailTemplate = (template, customerData) => {
    const extraReplacements = {
        [process.env.EMAIL_TAG_CATEGORY_NAME]: customerData.industry?.industry_name,
        [process.env.EMAIL_TAG_COMPANY_NAME]: customerData.company_name || ''
    };
    return processCustomerEmailTemplate(template, customerData, extraReplacements);
};

// Helper to send the signup email
const sendSignUpMailToList = async (emailList, subject, body_text) => {
    try {
        await emailTransporter.sendMail({
            from: process.env.EMAIL_CONFIG_SENDER,
            to: emailList,
            subject: subject,
            html: body_text,
        });
        return 1; // Send success
    } catch (err) {
        _logger.error(err.stack);
        return 0; // Sending fail
    }
};

const sendSignUpMail = async (customerId) => {
    try {
        const { CstCustomer, Industry, BusinessEmail, EmailTemplate } = getModels();

        const customerData = await CstCustomer.findOne({
            attributes: ['company_name', 'first_name', 'last_name', 'email_id', 'mobile_no', 'register_date'],
            where: { customer_id: customerId },
            include: [{
                model: Industry,
                as: 'industry',
                attributes: ['industry_name'],
                where: { is_enabled: true, is_deleted: false },
                required: true
            }]
        });

        if (!customerData) return 0; // Customer data not found

        const businessEmails = await BusinessEmail.findAll({
            attributes: ['email_id'],
            where: { is_enabled: true, type_id: { [Op.in]: [2, 3] } }
        });
        const emailList = businessEmails.map(row => row.email_id).join(', ');

        if (!emailList.length) return -2; // Unable to find business email

        const emailTemplate = await EmailTemplate.findOne({
            attributes: ['subject', 'body_text', 'is_enabled'],
            where: { template_id: EmailTemplates.BUSINESS_MAIL_AFTER_SIGNUP.value }
        });

        if (!emailTemplate) return -3; // Template not found
        if (!emailTemplate.is_enabled) return -4; // Template is disabled

        const { subject, body_text } = processSignUpEmailTemplate(emailTemplate, customerData);
        return await sendSignUpMailToList(emailList, subject, body_text);
    } catch (error) {
        console.error(`Error sending signup email: ${error.message}`);
        return 0;
    }
}

const refresh_token = async (req, res, next) => {
    const authKey = req.headers["x-auth-key"];
    if (!authKey) {
        return res.status(403).json(success(false, res.statusCode, "Auth key is required for authentication.", null));
    }
    const { refresh_token } = req.body;
    try {
        if (!refresh_token || refresh_token.length <= 0) {
            return res.status(400).json(success(false, res.statusCode, "Invalid request.", null));
        }
        try {
            const decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_TOKEN_KEY);
            const jwtUser = { id: decoded.id };

            let dbKey = null;
            if (process.env.REDIS_ENABLED > 0) {
                dbKey = await redisDB.get(authKey);
            }
            if (dbKey && refresh_token === dbKey) {

                const accessToken = jwt.sign(jwtUser, process.env.JWT_ACCESS_TOKEN_KEY,
                    { algorithm: 'HS256', allowInsecureKeySizes: true, expiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRES * 1000, }
                );
                const refreshToken = jwt.sign(jwtUser, process.env.JWT_REFRESH_TOKEN_KEY,
                    { algorithm: 'HS256', allowInsecureKeySizes: true, expiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRES * 1000, }
                );
                if (process.env.REDIS_ENABLED > 0) {
                    await redisDB.set(authKey, refreshToken, { EX: process.env.REDIS_CACHE_EXPIRY });
                }
                const results = {
                    access_token: accessToken,
                    refresh_token: refreshToken,
                    token_expiry: process.env.JWT_ACCESS_TOKEN_EXPIRES,
                    token_issued_at: dateFormat(process.env.DATE_FORMAT, db.get_ist_current_date()),
                };

                return res.status(200).json(success(true, res.statusCode, "Success.", results));

            } else {
                return res.status(400).json(success(false, res.statusCode, "Invalid request.", null));
            }
        } catch (err) {
            _logger.error(err.stack);
            return res.status(400).json(success(false, res.statusCode, "Invalid request.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const token_data = async (unique_id) => {
    const { CstToken, CstCustomer } = getModels();

    // Get token with customer using ORM
    const tokenData = await CstToken.findAll({
        attributes: ['token_id', 'customer_id', 'is_logout'],
        where: { unique_id: unique_id },
        include: [{
            model: CstCustomer,
            as: 'customer',
            attributes: ['is_enabled', 'is_deleted', 'account_id', 'email_id', 'is_live_sandbox', 'billing_type']
        }]
    });

    // Transform to match original query structure
    return tokenData.map(t => ({
        token_id: t.token_id,
        customer_id: t.customer_id,
        is_logout: t.is_logout,
        is_enabled: t.customer?.is_enabled,
        is_deleted: t.customer?.is_deleted,
        account_id: t.customer?.account_id,
        email_id: t.customer?.email_id,
        is_live_sandbox: t.customer?.is_live_sandbox,
        billing_type: t.customer?.billing_type
    }));
}

const logout = async (req, res, next) => {
    try {
        const { CstToken } = getModels();
        const auth_key = req.token_data.auth_key;

        // Update token logout status using ORM
        await CstToken.update(
            { is_logout: true, logout_time: db.get_ist_current_date() },
            { where: { unique_id: auth_key } }
        );
        if (process.env.REDIS_ENABLED > 0) {
            await redisDB.del(auth_key);
        }
        /*
                try {
                    let data_to_log = {
                        correlation_id: correlator.getId(),
                        token_id: req.token_data.token_id,
                        account_id: req.token_data.account_id,
                        user_type: 2,
                        user_id: req.token_data.customer_id,
                        narration: 'Logged out.',
                        query: db.buildQuery_Array(_query1, _replacements2),
                        date_time: db.get_ist_current_date(),
                    }
                    action_logger.info(JSON.stringify(data_to_log));
                } catch (_) { }
                */

        return res.status(200).json(success(true, res.statusCode, "Logout successfully.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const dashboard = async (req, res, next) => {
    try {
        const { HomePage } = getModels();

        // Helper function to get section with images
        const getSectionWithImages = (data) => {
            if (!data) return null;
            return {
                title: data.title_text,
                heading: data.heading_text,
                contents: data.contents,
                image_1: data.image_1 && data.image_1.length > 0 ? db.get_uploads_url(req) + data.image_1 : '',
                image_2: data.image_2 && data.image_2.length > 0 ? db.get_uploads_url(req) + data.image_2 : '',
                image_3: data.image_3 && data.image_3.length > 0 ? db.get_uploads_url(req) + data.image_3 : '',
            };
        };

        // Get all home page sections using ORM
        const homePageData = await HomePage.findAll({
            attributes: ['table_id', 'title_text', 'heading_text', 'contents', 'image_1', 'image_2', 'image_3'],
            where: { table_id: { [Op.in]: [1, 2, 3, 4, 5, 6, 7, 8] } }
        });

        // Map data by table_id
        const dataMap = {};
        homePageData.forEach(row => { dataMap[row.table_id] = row; });

        let scroll_strip = '';
        if (dataMap[1]) {
            scroll_strip = dataMap[1].contents;
        }

        let section_1 = getSectionWithImages(dataMap[2]);
        let section_2 = getSectionWithImages(dataMap[3]);
        let section_3 = getSectionWithImages(dataMap[4]);
        let section_4 = getSectionWithImages(dataMap[5]);

        let section_5 = [];
        [6, 7, 8].forEach(id => {
            if (dataMap[id]) {
                section_5.push({
                    id: dataMap[id].table_id,
                    title: dataMap[id].heading_text,
                    contents: dataMap[id].contents,
                });
            }
        });
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

let session_list_max_threshold = 4;

const my_profile = async (req, res, next) => {
    try {
        const { CstCustomer, Industry, MobileNetwork, CstToken } = getModels();

        // Get customer with industry and network using ORM
        const customerData = await CstCustomer.findOne({
            attributes: ['company_name', 'first_name', 'last_name', 'email_id', 'mobile_no', 'billing_type', 'register_date', 'is_live_sandbox', 'wallets_amount'],
            where: { customer_id: req.token_data.customer_id },
            include: [
                {
                    model: Industry,
                    as: 'industry',
                    attributes: ['industry_name'],
                    required: false
                },
                {
                    model: MobileNetwork,
                    as: 'mobileNetwork',
                    attributes: ['network_code'],
                    required: false
                }
            ]
        });

        if (customerData) {
            // Get sessions using ORM
            const tokenData = await CstToken.findAll({
                attributes: ['ip_address', 'login_time', 'is_logout', 'logout_time', 'device_name', 'ip_location'],
                where: { customer_id: req.token_data.customer_id },
                order: [['token_id', 'DESC']],
                limit: session_list_max_threshold + 1
            });

            const sessions = tokenData.map(item => ({
                location: item.ip_location,
                device: item.device_name,
                ip_address: item.ip_address,
                login_date: item.login_time ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.login_time)) : "",
                is_logout: item.is_logout,
                logout_time: item.logout_time ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.logout_time)) : "",
            }));

            const results = {
                company_name: customerData.company_name,
                first_name: customerData.first_name,
                last_name: customerData.last_name,
                email_id: customerData.email_id,
                network_code: customerData.mobileNetwork?.network_code,
                mobile_no: customerData.mobile_no,
                billing_type: customerData.billing_type,
                wallets_amount: customerData.wallets_amount,
                industry_name: customerData.industry?.industry_name,
                is_live_sandbox: customerData.is_live_sandbox,
                register_date: dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(customerData.register_date)),
                session_max_count: session_list_max_threshold,
                sessions: sessions,
            };
            return res.status(200).json(success(true, res.statusCode, "Profile Data.", results));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to find profile detail, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const profile_get = async (req, res, next) => {
    try {
        const { CstCustomer, Industry, MobileNetwork, CstToken } = getModels();

        // Get customer data using ORM
        const customerData = await CstCustomer.findOne({
            attributes: ['company_name', 'first_name', 'last_name', 'email_id', 'network_id', 'billing_type', 'wallets_amount', 'mobile_no', 'industry_id', 'register_date', 'is_live_sandbox'],
            where: { customer_id: req.token_data.customer_id }
        });

        if (customerData) {
            // Get industries using ORM
            const industries = await Industry.findAll({
                attributes: ['industry_id', 'industry_name'],
                where: { is_enabled: true, is_deleted: false },
                order: [
                    [literal('CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 2147483647 ELSE COALESCE(sort_order, 0) END'), 'ASC'],
                    ['industry_id', 'ASC']
                ]
            });
            const industry = industries.map(item => ({ id: item.industry_id, name: item.industry_name }));

            // Get mobile networks using ORM
            const networks = await MobileNetwork.findAll({
                attributes: ['network_id', 'network_code'],
                where: { is_enabled: true, is_deleted: false },
                order: [
                    [literal('CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 2147483647 ELSE COALESCE(sort_order, 0) END'), 'ASC'],
                    ['network_id', 'ASC']
                ]
            });
            const network = networks.map(item => ({ id: item.network_id, name: item.network_code }));

            // Get sessions using ORM
            const tokenData = await CstToken.findAll({
                attributes: ['ip_address', 'login_time', 'is_logout', 'logout_time', 'device_name', 'ip_location'],
                where: { customer_id: req.token_data.customer_id },
                order: [['token_id', 'DESC']],
                limit: session_list_max_threshold + 1
            });

            const sessions = tokenData.map(item => ({
                location: item.ip_location,
                device: item.device_name,
                ip_address: item.ip_address,
                login_date: item.login_time ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.login_time)) : "",
                is_logout: item.is_logout,
                logout_time: item.logout_time ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.logout_time)) : "",
            }));

            const results = {
                company_name: customerData.company_name,
                first_name: customerData.first_name,
                last_name: customerData.last_name,
                email_id: customerData.email_id,
                network_id: customerData.network_id,
                mobile_no: customerData.mobile_no,
                billing_type: customerData.billing_type,
                wallets_amount: customerData.wallets_amount,
                industry_id: customerData.industry_id,
                is_live_sandbox: customerData.is_live_sandbox,
                industries: industry,
                networks: network,
                session_max_count: session_list_max_threshold,
                sessions: sessions
            };
            return res.status(200).json(success(true, res.statusCode, "Profile Data.", results));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to find profile detail, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

// Helper to validate profile fields
const validateProfileFields = (data) => {
    const { first_name, last_name, network_id, mobile_no, industry_id, company_name } = data;

    if (!first_name?.length) return "Please enter first name.";
    if (first_name.length > 30) return "First name  should not be more than 30 character";
    if (!last_name?.length) return "Please enter last name.";
    if (last_name.length > 30) return "Last name  should not be more than 30 character";
    if (!network_id || !validator.isNumeric(network_id.toString()) || network_id <= 0) return "Please select country code.";
    if (!mobile_no?.length) return "Please enter mobile number.";
    if (!validator.isNumeric(mobile_no) || mobile_no.length !== 10) return "Invalid mobile number.";
    if (!industry_id || !validator.isNumeric(industry_id.toString()) || industry_id <= 0) return "Please select business category.";
    if (!company_name?.length) return "Please enter company name.";

    return null;
};

// Helper to validate password change requirements
const validatePasswordChange = (old_password, new_password) => {
    if (!old_password?.length) return "Please enter old password.";
    if (!new_password?.length) return "Please enter new password.";
    if (new_password.length < 8) return "The new password must contain atleast 8 characters.";
    if (!/\d/.test(new_password)) return "The new password must contain a number.";
    if (!/[`!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~]/.test(new_password)) return "The new password must contain a special character.";
    return null;
};

const profile_set = async (req, res, next) => {
    const { company_name, first_name, last_name, network_id, mobile_no, industry_id } = req.body;
    try {
        const customer_id = req.token_data.customer_id;

        const validationError = validateProfileFields(req.body);
        if (validationError) {
            return res.status(200).json(success(false, res.statusCode, validationError, null));
        }

        const { CstCustomer } = getModels();

        // Check if mobile exists using ORM
        const existingMobile = await CstCustomer.findOne({
            attributes: ['customer_id'],
            where: {
                customer_id: { [Op.ne]: customer_id },
                mobile_no: mobile_no,
                is_deleted: false
            }
        });
        if (existingMobile) {
            return res.status(200).json(success(false, res.statusCode, "Mobile number is already registered.", null));
        }

        // Update profile using ORM
        const [i] = await CstCustomer.update(
            { company_name, first_name, last_name, network_id, mobile_no, industry_id },
            { where: { customer_id: customer_id } }
        );
        const _query4 = `UPDATE cst_customer SET company_name, first_name, last_name, network_id, mobile_no, industry_id`;
        const _replacements2 = [company_name, first_name, last_name, network_id, mobile_no, industry_id, customer_id];
        if (i > 0) {
            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 2,
                    user_id: req.token_data.customer_id,
                    narration: 'Profile details updated.',
                    query: db.buildQuery_Array(_query4, _replacements2),
                    date_time: db.get_ist_current_date(),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }

            return res.status(200).json(success(true, res.statusCode, "Updated successfully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to update, Please try again", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const change_password = async (req, res, next) => {
    const { old_password, new_password } = req.body;
    try {
        const customer_id = req.token_data.customer_id;

        const validationError = validatePasswordChange(old_password, new_password);
        if (validationError) {
            return res.status(200).json(success(false, res.statusCode, validationError, null));
        }

        const { CstCustomer } = getModels();
        const customerData = await CstCustomer.findOne({
            attributes: ['customer_id', 'user_pass'],
            where: { customer_id: customer_id }
        });

        if (!customerData) {
            return res.status(200).json(success(false, res.statusCode, "Unable to find profile detail, Please try again.", null));
        }

        const isValidPass = await bcrypt.compare(old_password, customerData.user_pass);
        if (!isValidPass) {
            return res.status(200).json(success(false, res.statusCode, "Invalid old password, Please enter correct password.", null));
        }

        const password_hash = await bcrypt.hash(new_password, 10);
        const [i] = await CstCustomer.update(
            { user_pass: password_hash },
            { where: { customer_id: customer_id } }
        );

        if (i <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Unable to update password, Please try again", null));
        }

        try {
            const _query4 = `UPDATE cst_customer SET user_pass`;
            const _replacements2 = [password_hash, customer_id];
            action_logger.info(JSON.stringify({
                correlation_id: correlator.getId(),
                token_id: req.token_data.token_id,
                account_id: req.token_data.account_id,
                user_type: 2,
                user_id: req.token_data.customer_id,
                narration: 'Password changed.',
                query: db.buildQuery_Array(_query4, _replacements2),
                date_time: db.get_ist_current_date(),
            }));
        } catch (_) { }

        return res.status(200).json(success(true, res.statusCode, "Password changed successfully.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const logout_all_sessions = async (req, res, next) => {
    try {
        const { CstToken } = getModels();

        // Logout all sessions using ORM
        await CstToken.update(
            { is_logout: true, logout_time: db.get_ist_current_date() },
            { where: { customer_id: req.token_data.customer_id, is_logout: false } }
        );
        /*
                try {
                    let data_to_log = {
                        correlation_id: correlator.getId(),
                        token_id: req.token_data.token_id,
                        account_id: req.token_data.account_id,
                        user_type: 2,
                        user_id: req.token_data.customer_id,
                        narration: 'Sign out all sessions.',
                        query: db.buildQuery_Array(_query1, _replacements2),
                        date_time: db.get_ist_current_date(),
                    }
                    action_logger.info(JSON.stringify(data_to_log));
                } catch (_) { }
                */
        return res.status(200).json(success(true, res.statusCode, "Sign out all sessions successfully.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const sessions_get = async (req, res, next) => {
    const { page_no } = req.body;
    try {
        const { CstToken } = getModels();
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0;
        if (_page_no <= 0) { _page_no = 1; }

        // Get total count using ORM
        const total_record = await CstToken.count({
            where: { customer_id: req.token_data.customer_id }
        });

        // Get sessions with pagination using ORM
        const page_size = parseInt(process.env.PAGINATION_SIZE);
        const tokenData = await CstToken.findAll({
            attributes: ['ip_address', 'login_time', 'is_logout', 'logout_time', 'device_name', 'ip_location'],
            where: { customer_id: req.token_data.customer_id },
            order: [['token_id', 'DESC']],
            limit: page_size,
            offset: (_page_no - 1) * page_size
        });

        if (tokenData) {
            const sessions = tokenData.map((item, index) => ({
                sr_no: (_page_no - 1) * page_size + index + 1,
                location: item.ip_location,
                device: item.device_name,
                ip_address: item.ip_address,
                login_date: item.login_time ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.login_time)) : "",
                is_logout: item.is_logout,
                logout_time: item.logout_time ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.logout_time)) : "",
            }));

            const results = {
                current_page: _page_no,
                total_pages: Math.ceil(total_record / page_size),
                data: sessions,
            };
            return res.status(200).json(success(true, res.statusCode, "Session Data.", results));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to find session detail, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const live_mode_toggle = async (req, res, next) => {
    try {
        const { CstCustomer } = getModels();

        // Get current live environment using ORM
        const customerData = await CstCustomer.findOne({
            attributes: ['live_environment'],
            where: { customer_id: req.token_data.customer_id, is_deleted: false }
        });

        if (!customerData) {
            return res.status(200).json(success(false, res.statusCode, "Account details not found, Please try again.", null));
        }

        let new_status = !customerData.live_environment;

        // Update live environment using ORM
        const [i] = await CstCustomer.update(
            { live_environment: new_status },
            { where: { customer_id: req.token_data.customer_id } }
        );

        if (i > 0) {
            // Get updated status using ORM
            const updatedData = await CstCustomer.findOne({
                attributes: ['live_environment'],
                where: { customer_id: req.token_data.customer_id }
            });
            let mode = updatedData ? updatedData.live_environment : false;
            let results = { live_environment: mode };

            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 2,
                    user_id: req.token_data.customer_id,
                    narration: 'Live / Sandbox mode changed. current mode = ' + (mode ? 'Live' : 'Sandbox'),
                    query: 'ORM: CstCustomer.update live_environment',
                    date_time: db.get_ist_current_date(),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (err) {
                _logger.error(err.stack);
            }

            return res.status(200).json(success(true, res.statusCode, "Updated Successfully.", results));
        } else {
            const currentData = await CstCustomer.findOne({
                attributes: ['live_environment'],
                where: { customer_id: req.token_data.customer_id }
            });
            let mode = currentData ? currentData.live_environment : false;
            let results = { live_environment: mode };
            return res.status(200).json(success(false, res.statusCode, "Unable to update environment, Please try again.", results));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const live_mode_get = async (req, res, next) => {
    try {
        const { CstCustomer } = getModels();

        // Get live environment using ORM
        const customerData = await CstCustomer.findOne({
            attributes: ['live_environment'],
            where: { customer_id: req.token_data.customer_id }
        });
        let mode = customerData ? customerData.live_environment : false;
        let results = { live_environment: mode };
        return res.status(200).json(success(true, res.statusCode, "Success.", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

// Helper to validate app name format
const validateAppName = (app_name) => {
    if (!app_name?.length) return { error: "Please enter app name." };
    const regularChars = /^([A-Za-z0-9][A-Za-z0-9_#\-.$% ]*)$/;
    if (!regularChars.test(app_name)) return { error: "App name format is invalid." };
    const trimmed = app_name.trim();
    if (!trimmed?.length) return { error: "Please enter app name." };
    return { _app_name: trimmed };
};

// Helper to parse product IDs from comma/pipe separated string
const parseProductIds = (product_ids) => {
    if (!product_ids?.length) return [];
    const idList = product_ids.split(',').join('|').split('|');
    return idList
        .map(id => parseNumericId(id))
        .filter(id => id > 0);
};

// Helper to upload certificate and extract public key
const processCertificate = async (files) => {
    let certificateUrl = "";
    let publicKeySingleLine = "";

    if (!files?.['certificate']) {
        return { error: "Please upload certificate." };
    }

    try {
        const fi = files['certificate'][0];
        const cert = await cloudStorage.UploadFile(fi.path, 'certificate/' + fi.filename, true);
        certificateUrl = `https://storage.cloud.google.com/${cert.bucket}/${cert.name}`;
    } catch (err) {
        _logger.error(err.stack);
        return { error: "Please upload certificate." };
    }

    try {
        const certificatePath = files['certificate'][0].path;
        const certificateData = readFileSync(certificatePath);
        const cert = new X509Certificate(certificateData);
        const publicKey = cert.publicKey.export({ format: 'pem', type: 'spki' });
        publicKeySingleLine = publicKey.replace(/\n/g, '').replace('-----BEGIN PUBLIC KEY-----', '').replace('-----END PUBLIC KEY-----', '');
    } catch (err) {
        _logger.error(err.stack);
        return { error: "unable to extract public key from given certificate." };
    }

    return { certificateUrl, publicKeySingleLine };
};

// Helper to validate and parse IP addresses
const parseIpAddresses = (ip_addresses) => {
    if (!ip_addresses?.length) return { error: "Please enter ip addresses." };
    const ipList = ip_addresses.split(',').join('|').split('|');
    const validIps = [];
    for (const ip of ipList) {
        if (ip?.length) {
            if (!db.isValidIP(ip)) return { error: "Please enter valid ip addresses." };
            validIps.push(ip);
        }
    }
    return { validIps };
};

const app_new = async (req, res, next) => {
    const { app_name, product_ids, description, expected_volume, callback_url, ip_addresses } = req.body;
    try {
        const appNameResult = validateAppName(app_name);
        if (appNameResult.error) {
            return res.status(200).json(success(false, res.statusCode, appNameResult.error, null));
        }
        const _app_name = appNameResult._app_name;

        const { CstAppMast } = getModels();

        const existingApp = await CstAppMast.findOne({
            attributes: ['app_id', 'app_name'],
            where: { customer_id: req.token_data.customer_id, is_deleted: false, app_name: 'uat_' + _app_name }
        });
        if (existingApp) {
            return res.status(200).json(success(false, res.statusCode, "App name already exist.", null));
        }

        const existingLiveApp = await CstAppMast.findOne({
            attributes: ['app_id', 'app_name'],
            where: { customer_id: req.token_data.customer_id, is_deleted: false, app_name: _app_name, is_live_app_created: true }
        });
        if (existingLiveApp) {
            return res.status(200).json(success(false, res.statusCode, "App name already exist in production.", null));
        }

        const prodIds = parseProductIds(product_ids);
        if (prodIds.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please select api product.", null));
        }

        const certResult = await processCertificate(req.files);
        if (certResult.error) {
            return res.status(200).json(success(false, res.statusCode, certResult.error, null));
        }
        const { certificateUrl: certificate, publicKeySingleLine } = certResult;

        if (!expected_volume || !validator.isNumeric(expected_volume.toString()) || expected_volume <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter expected traffic.", null));
        }

        const ipResult = parseIpAddresses(ip_addresses);
        if (ipResult.error) {
            return res.status(200).json(success(false, res.statusCode, ipResult.error, null));
        }
        const ipAddress = ipResult.validIps;

        if (callback_url?.length && !db.isValidURL(callback_url)) {
            return res.status(200).json(success(false, res.statusCode, "Please enter valid callback url.", null));
        }

        const _description = description?.length ? description : '';
        const { CstCustomer, CstAppProduct } = getModels();

        // Get live environment using ORM
        const customerEnv = await CstCustomer.findOne({
            attributes: ['live_environment'],
            where: { customer_id: req.token_data.customer_id }
        });
        let live_environment = false; if (customerEnv) { live_environment = customerEnv.live_environment; }

        // Create app using ORM
        const newApp = await CstAppMast.create({
            customer_id: req.token_data.customer_id,
            app_name: 'uat_' + _app_name,
            description: _description,
            expected_volume: expected_volume,
            callback_url: callback_url,
            ip_addresses: ipAddress.join(','),
            certificate_file: certificate,
            is_enabled: true,
            is_deleted: false,
            added_date: db.get_ist_current_date(),
            is_approved: 0,
            in_live_env: live_environment,
            cert_public_key: publicKeySingleLine,
            display_name: _app_name
        });
        const app_id = newApp ? newApp.app_id : 0;
        const _query1 = `INSERT INTO cst_app_mast`;
        const _replacements2 = [req.token_data.customer_id, 'uat_' + _app_name, _description, expected_volume, callback_url, ipAddress.join(','), certificate, true, false, db.get_ist_current_date(), false, live_environment, publicKeySingleLine, _app_name];

        if (app_id > 0) {
            // Create app products using ORM
            for (const item of prodIds) {
                let prod_id = item;
                await CstAppProduct.create({ app_id: app_id, product_id: prod_id });
            }

            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 2,
                    user_id: req.token_data.customer_id,
                    narration: 'Created new app (' + (live_environment ? 'Live' : 'Sandbox') + '). App name = ' + _app_name,
                    query: db.buildQuery_Array(_query1, _replacements2),
                    date_time: db.get_ist_current_date(),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }

            return res.status(200).json(success(true, res.statusCode, "App created successfully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to save your app, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const app_products = async (req, res, next) => {
    try {
        const { Product } = getModels();

        // Get products using ORM
        const products = await Product.findAll({
            attributes: ['product_id', 'product_name'],
            where: { is_published: true }
        });
        let list = [];
        for (const item of products || []) {
            list.push({
                product_id: item.product_id,
                product_name: item.product_name,
            });
        }
        const results = { data: list };
        return res.status(200).json(success(true, res.statusCode, "All product list", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

// Helper to format date or return empty string
const formatAppDate = (date) => date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(date)) : "";

// Helper to get proxies for a product
const getProxiesForProduct = async (productId) => {
    const query = `SELECT proxy_id, proxy_name, display_name, product_id FROM proxies WHERE product_id = ? AND is_deleted = false AND is_published=true ORDER BY proxy_id DESC`;
    const rows = await db.sequelize.query(query, { replacements: [productId], type: QueryTypes.SELECT });
    return (rows || []).map(prx => ({
        product_id: prx.product_id,
        proxy_id: prx.proxy_id,
        proxy_name: prx.display_name?.length ? prx.display_name : prx.proxy_name,
        display_name: prx.display_name,
    }));
};

// Helper to get products and proxies for an app
const getAppProductsAndProxies = async (appId) => {
    const query = `SELECT p.product_id, p.product_name, p.description, p.key_features FROM product p INNER JOIN cst_app_product m ON p.product_id = m.product_id WHERE m.app_id = ?`;
    const rows = await db.sequelize.query(query, { replacements: [appId], type: QueryTypes.SELECT });
    const products = [];
    const proxies = [];
    for (const item of rows || []) {
        products.push({ product_id: item.product_id, product_name: item.product_name, description: item.description, key_features: item.key_features });
        const itemProxies = await getProxiesForProduct(item.product_id);
        proxies.push(...itemProxies);
    }
    return { products, proxies };
};

// Helper to format app data
const formatAppData = (app, products, proxies) => ({
    app_id: app.app_id,
    app_name: app.app_name,
    display_name: app.display_name,
    description: app.description,
    expected_volume: app.expected_volume,
    callback_url: app.callback_url,
    ip_addresses: app.ip_addresses,
    added_date: formatAppDate(app.added_date),
    is_approved: app.is_approved,
    approved_by: app.approved_by,
    approve_date: formatAppDate(app.approve_date),
    approve_remark: app.approve_remark,
    is_rejected: app.is_rejected,
    rejected_by: app.rejected_by,
    rejected_date: formatAppDate(app.rejected_date),
    reject_remark: app.reject_remark,
    api_key: app.is_approved ? app.api_key : "",
    api_secret: app.is_approved ? app.api_secret : "",
    key_issued_date: formatAppDate(app.key_issued_date),
    key_expiry_date: formatAppDate(app.key_expiry_date),
    in_live_env: app.in_live_env,
    is_live_app_created: app.is_live_app_created,
    live_app_id: app.live_app_id,
    mkr_rejected: app.mkr_rejected,
    mkr_date: formatAppDate(app.mkr_date),
    mkr_remark: app.mkr_remark,
    products: products,
    proxies: proxies,
});

const my_app_list_get = async (req, res, next) => {
    try {
        const { CstCustomer } = getModels();
        const customerEnv = await CstCustomer.findOne({
            attributes: ['live_environment'],
            where: { customer_id: req.token_data.customer_id }
        });
        const live_environment = customerEnv?.live_environment || false;

        const _query3 = `SELECT a.app_id, a.app_name, a.description, a.expected_volume, a.callback_url, a.ip_addresses, a.certificate_file, a.added_date,
        a.is_approved, a.approved_by, a.approve_date, a.approve_remark, a.is_rejected, a.rejected_by, a.rejected_date, a.reject_remark,
        a.api_key, a.api_secret, a.key_issued_date, a.key_expiry_date, a.in_live_env, a.is_live_app_created, a.live_app_id, a.display_name,
        a.mkr_is_rejected AS mkr_rejected, a.mkr_rejected_date AS mkr_date, a.mkr_rejected_rmk AS mkr_remark,
        COALESCE((SELECT TRIM(COALESCE(i.first_name, '') || ' ' || COALESCE(i.last_name, '')) FROM adm_user i WHERE i.account_id = a.mkr_rejected_by), '') AS mkr_name,
        a.is_rejected AS chkr_rejected, a.rejected_date AS chkr_date, a.reject_remark AS chkr_remark,
        COALESCE((SELECT TRIM(COALESCE(i.first_name, '') || ' ' || COALESCE(i.last_name, '')) FROM adm_user i WHERE i.account_id = a.rejected_by), '') AS chkr_name
        FROM cst_app_mast a WHERE a.customer_id = ? AND a.is_deleted = false`;

        const appRows = await db.sequelize.query(_query3, { replacements: [req.token_data.customer_id], type: QueryTypes.SELECT });
        const my_apps = [];
        for (const app of appRows || []) {
            const { products, proxies } = await getAppProductsAndProxies(app.app_id);
            my_apps.push(formatAppData(app, products, proxies));
        }

        const results = {
            live_app: my_apps.filter(el => el.in_live_env),
            sandbox_app: my_apps.filter(el => !el.in_live_env),
            live_environment: live_environment,
        };

        return res.status(200).json(success(true, res.statusCode, "My Apps Data.", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

// Helper to check if app can be edited
const checkAppEditability = (appStatus) => {
    if (!appStatus) return "App details not found, Please try again.";
    if (appStatus.is_approved) return "Approved app cannot be edited.";
    if (appStatus.is_rejected) return "Rejected app cannot be edited.";
    return null;
};

// Helper to extract public key from certificate file
const extractPublicKeyFromCert = (certPath) => {
    const certificateData = readFileSync(certPath);
    const cert = new X509Certificate(certificateData);
    const publicKey = cert.publicKey.export({ format: 'pem', type: 'spki' });
    return publicKey.replace(/\n/g, '').replace('-----BEGIN PUBLIC KEY-----', '').replace('-----END PUBLIC KEY-----', '');
};

// Helper to upload certificate for update (optional)
const processUpdateCertificate = async (files, existingCert, existingPubKey) => {
    if (!files?.['certificate']) {
        return { certificateUrl: existingCert, publicKeySingleLine: existingPubKey };
    }
    try {
        const fi = files['certificate'][0];
        const cert = await cloudStorage.UploadFile(fi.path, 'certificate/' + fi.filename, true);
        const certificateUrl = `https://storage.cloud.google.com/${cert.bucket}/${cert.name}`;
        const publicKeySingleLine = extractPublicKeyFromCert(fi.path);
        return { certificateUrl, publicKeySingleLine };
    } catch (err) {
        _logger.error(err.stack);
        return { error: "unable to extract public key from given certificate." };
    }
};

const app_update = async (req, res, next) => {
    const { app_id, app_name, product_ids, description, expected_volume, callback_url, ip_addresses } = req.body;
    try {
        const _app_id = parseNumericId(app_id);
        if (_app_id <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Incorrect app id.", null));
        }

        const appNameResult = validateAppName(app_name);
        if (appNameResult.error) {
            return res.status(200).json(success(false, res.statusCode, appNameResult.error, null));
        }
        const _app_name = appNameResult._app_name;

        const { CstAppMast } = getModels();

        const existingApp = await CstAppMast.findOne({
            attributes: ['app_id', 'app_name', 'display_name'],
            where: { customer_id: req.token_data.customer_id, is_deleted: false, app_name: 'uat_' + _app_name, app_id: { [Op.ne]: _app_id } }
        });
        if (existingApp) {
            return res.status(200).json(success(false, res.statusCode, "App name already exist.", null));
        }

        const existingLiveApp = await CstAppMast.findOne({
            attributes: ['app_id', 'app_name'],
            where: { customer_id: req.token_data.customer_id, is_deleted: false, app_name: _app_name, app_id: { [Op.ne]: _app_id }, is_live_app_created: true }
        });
        if (existingLiveApp) {
            return res.status(200).json(success(false, res.statusCode, "App name already exist in production.", null));
        }

        const appStatus = await CstAppMast.findOne({
            attributes: ['app_id', 'is_approved', 'is_rejected'],
            where: { app_id: _app_id, is_deleted: false }
        });
        const editError = checkAppEditability(appStatus);
        if (editError) {
            return res.status(500).json(success(false, res.statusCode, editError, null));
        }

        const prodIds = parseProductIds(product_ids);
        if (prodIds.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please select api product.", null));
        }

        if (!expected_volume || !validator.isNumeric(expected_volume.toString()) || expected_volume <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter expected traffic.", null));
        }

        if (callback_url?.length && !db.isValidURL(callback_url)) {
            return res.status(200).json(success(false, res.statusCode, "Please enter valid callback url.", null));
        }

        const ipResult = parseIpAddresses(ip_addresses);
        if (ipResult.error) {
            return res.status(200).json(success(false, res.statusCode, ipResult.error, null));
        }
        const ipAddress = ipResult.validIps;

        const appDetails = await CstAppMast.findOne({
            attributes: ['app_id', 'app_name', 'description', 'expected_volume', 'callback_url', 'ip_addresses', 'certificate_file', 'cert_public_key', 'in_live_env'],
            where: { app_id: _app_id, customer_id: req.token_data.customer_id, is_deleted: false }
        });

        if (!appDetails) {
            return res.status(200).json(success(false, res.statusCode, "Unable to find your app, Please try again.", null));
        }

        const certResult = await processUpdateCertificate(req.files, appDetails.certificate_file, appDetails.cert_public_key);
        if (certResult.error) {
            return res.status(200).json(success(false, res.statusCode, certResult.error, null));
        }
        const { certificateUrl: certificate, publicKeySingleLine: cert_public_key } = certResult;

        const _description = description?.length ? description : '';
        const [j] = await CstAppMast.update({
            cert_public_key: cert_public_key,
            app_name: 'uat_' + _app_name,
            description: _description,
            expected_volume: expected_volume,
            callback_url: callback_url,
            ip_addresses: ipAddress.join(','),
            certificate_file: certificate,
            modify_by: req.token_data.customer_id,
            modify_date: db.get_ist_current_date(),
            display_name: _app_name
        }, { where: { app_id: _app_id } });

        if (j <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Unable to save your app, Please try again.", null));
        }

        const { CstAppProduct } = getModels();
        await CstAppProduct.destroy({ where: { app_id: _app_id } });
        for (const prod_id of prodIds) {
            await CstAppProduct.create({ app_id: _app_id, product_id: prod_id });
        }

        try {
            const _query1 = `update cst_app_mast`;
            const _replacements2 = [cert_public_key, 'uat_' + _app_name, _description, expected_volume, callback_url, ipAddress.join(','), certificate, req.token_data.customer_id, db.get_ist_current_date(), _app_name, _app_id];
            action_logger.info(JSON.stringify({
                correlation_id: correlator.getId(),
                token_id: req.token_data.token_id,
                account_id: req.token_data.account_id,
                user_type: 2,
                user_id: req.token_data.customer_id,
                narration: 'App details updated(' + (appDetails.in_live_env ? 'Live' : 'Sandbox') + '). App name = ' + (appDetails.app_name == _app_name ? _app_name : appDetails.app_name + ' to ' + _app_name),
                query: db.buildQuery_Array(_query1, _replacements2),
                date_time: db.get_ist_current_date(),
            }));
        } catch (_) { }

        return res.status(200).json(success(true, res.statusCode, "App update successfully.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

// Helper to delete app from Apigee if approved
const deleteApigeeApp = async (appData) => {
    if (!appData.is_approved) return;
    try {
        const email_id = appData.customer?.email_id;
        const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers/${email_id}/apps/${appData.app_name}`;
        const apigeeAuth = await db.get_apigee_token();
        await fetch(product_URL, { method: "DELETE", headers: { Authorization: `Bearer ${apigeeAuth}` } });
    } catch (err) {
        _logger.error(err.stack);
    }
};

const cust_app_del = async (req, res, next) => {
    const { app_id } = req.body;
    const _app_id = parseNumericId(app_id);
    if (_app_id <= 0) {
        return res.status(200).json(success(false, res.statusCode, "Incorrect app id.", null));
    }
    try {
        const { CstAppMast, CstCustomer } = getModels();

        const appData = await CstAppMast.findOne({
            attributes: ['app_id', 'app_name', 'is_approved', 'customer_id', 'in_live_env'],
            where: { app_id: _app_id, is_deleted: false },
            include: [{ model: CstCustomer, as: 'customer', attributes: ['email_id'] }]
        });

        if (!appData) {
            return res.status(200).json(success(false, res.statusCode, "App details not found, Please try again.", null));
        }

        await deleteApigeeApp(appData);

        const [i] = await CstAppMast.update({ is_deleted: true }, { where: { app_id: _app_id } });

        if (i <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Unable to delete app, please try again.", null));
        }

        try {
            const _query1 = `UPDATE cst_app_mast SET is_deleted = true WHERE app_id = ?`;
            action_logger.info(JSON.stringify({
                correlation_id: correlator.getId(),
                token_id: req.token_data.token_id,
                account_id: req.token_data.account_id,
                user_type: 2,
                user_id: req.token_data.customer_id,
                narration: 'App deleted (' + (appData.in_live_env ? 'Live' : 'Sandbox') + '). App name = ' + appData.app_name,
                query: db.buildQuery_Array(_query1, [_app_id]),
                date_time: db.get_ist_current_date(),
            }));
        } catch (err) {
            console.log(err.stack);
        }

        return res.status(200).json(success(true, res.statusCode, "App deleted successfully.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

// Helper to format app for edit view
const formatAppForEdit = (item, products) => ({
    app_id: item.app_id,
    app_name: item.display_name?.length ? item.display_name : item.app_name.replace(/^uat_/, ''),
    display_name: item.display_name,
    description: item.description,
    expected_volume: item.expected_volume,
    callback_url: item.callback_url,
    ip_addresses: item.ip_addresses,
    added_date: formatAppDate(item.added_date),
    is_approved: item.is_approved,
    approved_by: item.approved_by,
    approve_date: formatAppDate(item.approve_date),
    approve_remark: item.approve_remark,
    is_rejected: item.is_rejected,
    rejected_by: item.rejected_by,
    rejected_date: formatAppDate(item.rejected_date),
    reject_remark: item.reject_remark,
    api_key: item.is_approved ? item.api_key : "",
    api_secret: item.is_approved ? item.api_secret : "",
    key_issued_date: formatAppDate(item.key_issued_date),
    key_expiry_date: formatAppDate(item.key_expiry_date),
    in_live_env: item.in_live_env,
    products: products,
});

// Helper to get products for an app (for edit view)
const getAppProducts = async (appId) => {
    const query = `SELECT p.product_id, p.product_name, p.description, p.key_features FROM product p INNER JOIN cst_app_product m ON p.product_id = m.product_id WHERE m.app_id = ?`;
    const rows = await db.sequelize.query(query, { replacements: [appId], type: QueryTypes.SELECT });
    return (rows || []).map(cap => ({
        product_id: cap.product_id,
        product_name: cap.product_name,
        description: cap.description,
        key_features: cap.key_features,
    }));
};

const my_app_edit_get = async (req, res, next) => {
    const { app_id } = req.body;
    const _appid = parseNumericId(app_id);
    try {
        const _query3 = `SELECT a.app_id, a.is_approved, a.is_rejected, a.app_name, a.description, a.expected_volume, a.callback_url, a.ip_addresses, a.certificate_file, a.added_date,
        a.approved_by, a.approve_date, a.approve_remark, a.rejected_by, a.rejected_date, a.reject_remark,
        a.api_key, a.api_secret, a.key_issued_date, a.key_expiry_date, a.in_live_env, a.display_name
        FROM cst_app_mast a WHERE a.app_id = ? AND a.customer_id = ? AND a.is_deleted = false`;
        const row4 = await db.sequelize.query(_query3, { replacements: [_appid, req.token_data.customer_id], type: QueryTypes.SELECT });

        const item = row4?.[0];
        if (item) {
            const editError = checkAppEditability({ is_approved: item.is_approved, is_rejected: item.is_rejected });
            if (editError) {
                return res.status(500).json(success(false, res.statusCode, editError, null));
            }
        }

        const products = item ? await getAppProducts(item.app_id) : [];
        const my_apps = item ? formatAppForEdit(item, products) : null;

        const { Product, PageLabelInfo } = getModels();
        const productsList = await Product.findAll({
            attributes: ['product_id', 'product_name'],
            where: { is_published: true }
        });
        const list = (productsList || []).map(p => ({ product_id: p.product_id, product_name: p.product_name }));

        const rowLabel = await PageLabelInfo.findAll({
            attributes: ['label_id', 'pages_name', 'label_name', 'info_text']
        });

        return res.status(200).json(success(true, res.statusCode, "My Apps Data.", {
            my_apps: my_apps,
            products_list: list,
            label_info_list: rowLabel
        }));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const create_app_data = async (req, res, next) => {
    try {
        const { CstCustomer, Product, PageLabelInfo } = getModels();

        // Get live environment using ORM
        const customerEnv = await CstCustomer.findOne({
            attributes: ['live_environment'],
            where: { customer_id: req.token_data.customer_id }
        });
        let live_environment = false; if (customerEnv) { live_environment = customerEnv.live_environment; }

        // Get products using ORM
        const products = await Product.findAll({
            attributes: ['product_id', 'product_name'],
            where: { is_published: true }
        });
        let list = [];
        products?.forEach(item => {
            list.push({
                product_id: item.product_id,
                product_name: item.product_name,
            });
        });

        // Get page labels using ORM
        const labelInfo = await PageLabelInfo.findAll({
            attributes: ['label_id', 'pages_name', 'label_name', 'info_text']
        });
        const results = {
            data: list,
            live_environment: live_environment,
            label_info_list: labelInfo
        };
        return res.status(200).json(success(true, res.statusCode, "All product list", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const get_started_get = async (req, res, next) => {
    try {
        const { GetStarted } = getModels();

        // Helper function to get section with image
        const getSectionWithImage = (data) => {
            if (!data) return null;
            return {
                title: data.title_text,
                heading: data.heading_text,
                contents: data.contents,
                image_1: data.image_1 && data.image_1.length > 0 ? db.get_uploads_url(req) + data.image_1 : '',
            };
        };

        // Get all sections using ORM
        const getStartedData = await GetStarted.findAll({
            attributes: ['table_id', 'title_text', 'heading_text', 'contents', 'image_1'],
            where: { table_id: { [Op.in]: [1, 2, 3] } }
        });

        // Map data by table_id
        const dataMap = {};
        getStartedData.forEach(row => { dataMap[row.table_id] = row; });

        let results = {
            section_1: getSectionWithImage(dataMap[1]),
            section_2: getSectionWithImage(dataMap[2]),
            section_3: getSectionWithImage(dataMap[3]),
        };
        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
}

// Helper to process production certificate
const processProductionCertificate = async (files) => {
    if (!files?.['certificate']?.[0]?.filename) {
        return { error: "Please upload certificate." };
    }
    try {
        const fi = files['certificate'][0];
        const cert = await cloudStorage.UploadFile(fi.path, 'certificate/' + fi.filename, true);
        const certificateUrl = `https://storage.cloud.google.com/${cert.bucket}/${cert.name}`;
        const publicKeySingleLine = extractPublicKeyFromCert(fi.path);
        return { certificateUrl, publicKeySingleLine };
    } catch (err) {
        _logger.error(err.stack);
        return { error: "unable to extract public key from given certificate." };
    }
};

const move_to_production = async (req, res, next) => {
    const { app_id, callback_url, ip_addresses } = req.body;
    res.on('finish', () => { db.delete_uploaded_files(req); });

    try {
        const { CstAppMast, CstAppProduct } = getModels();
        const _app_id = parseNumericId(app_id);

        const appData = await CstAppMast.findOne({
            attributes: ['app_id', 'customer_id', 'app_name', 'description', 'expected_volume', 'callback_url', 'ip_addresses', 'cert_public_key', 'in_live_env', 'display_name'],
            where: { app_id: _app_id, is_deleted: false }
        });

        if (!appData) {
            return res.status(200).json(success(false, res.statusCode, "App details not found.", null));
        }

        const existingLiveApp = await CstAppMast.findOne({
            attributes: ['app_id'],
            where: { customer_id: req.token_data.customer_id, is_deleted: false, is_live_app_created: true, app_id: _app_id }
        });

        if (existingLiveApp) {
            return res.status(200).json(success(false, res.statusCode, "App already exist in production.", null));
        }

        const certResult = await processProductionCertificate(req.files);
        if (certResult.error) {
            return res.status(200).json(success(false, res.statusCode, certResult.error, null));
        }

        const ipResult = parseIpAddresses(ip_addresses);
        if (ipResult.error) {
            return res.status(200).json(success(false, res.statusCode, ipResult.error, null));
        }

        const _callback_url = callback_url?.trim() || '';
        if (_callback_url && !db.isValidURL(_callback_url)) {
            return res.status(200).json(success(false, res.statusCode, "Please enter valid callback url.", null));
        }

        const new_app_name = appData.display_name?.length ? appData.display_name : appData.app_name.replace(/^uat_/, '');

        const newLiveApp = await CstAppMast.create({
            customer_id: req.token_data.customer_id,
            app_name: new_app_name,
            description: appData.description,
            expected_volume: appData.expected_volume,
            callback_url: _callback_url,
            ip_addresses: ipResult.validIps.join(','),
            certificate_file: certResult.certificateUrl,
            is_enabled: true,
            is_deleted: false,
            added_date: db.get_ist_current_date(),
            is_approved: 0,
            in_live_env: true,
            cert_public_key: certResult.publicKeySingleLine,
            display_name: appData.display_name
        });

        const app_id_new = newLiveApp?.app_id || 0;
        if (app_id_new <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Unable to move your app, Please try again.", null));
        }

        await CstAppMast.update({ is_live_app_created: true, live_app_id: app_id_new }, { where: { app_id: _app_id } });

        const appProducts = await CstAppProduct.findAll({ attributes: ['product_id'], where: { app_id: _app_id } });
        for (const item of appProducts) {
            await CstAppProduct.create({ app_id: app_id_new, product_id: item.product_id });
        }

        try {
            action_logger.info(JSON.stringify({
                correlation_id: correlator.getId(),
                token_id: req.token_data.token_id,
                account_id: req.token_data.account_id,
                user_type: 2,
                user_id: req.token_data.customer_id,
                narration: 'Created new app Live App name = ' + new_app_name,
                query: 'INSERT INTO cst_app_mast',
                date_time: db.get_ist_current_date(),
            }));
        } catch (_) { }

        return res.status(200).json(success(true, res.statusCode, "App Move to Live successfully.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};


const test_upload = async (req, res, next) => {
    res.on('finish', () => { db.delete_uploaded_files(req); });
    try {
        let certificate = "";
        if (req.files['certificate']) {
            const fi = req.files['certificate'][0];
            certificate = await cloudStorage.UploadFile(fi.path, 'temp/' + fi.filename, true);
        }
        const logo_image_filename = `https://storage.cloud.google.com/${certificate.bucket}/${certificate.name}`;

        console.log(logo_image_filename);
        console.log("============================");
        console.log(certificate);
        return res.status(200).json(success(true, res.statusCode, "", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const delete_uploaded_filesss = (req) => {
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

// Helper to get product IDs for analytics
const getAnalyticsProductIds = async (appId, productId) => {
    if (productId > 0) return [productId];
    const query = `SELECT app_id, product_id FROM cst_app_product WHERE app_id = ?`;
    const rows = await db.sequelize.query(query, { replacements: [appId], type: QueryTypes.SELECT });
    return rows.filter(app => app.product_id > 0).map(app => app.product_id);
};

// Helper to build analytics URL
const buildAnalyticsUrl = (environment, from, upto, email, productName, appName) => {
    return `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/environments/${environment}/stats/apiproxy/?select=sum(message_count)%2Csum(is_error)%2Csum(policy_error)%2Csum(target_error)%2Cavg(target_response_time)%2Cavg(total_response_time)&timeRange=${from}~${upto}&filter=(developer_email eq '${email}')and(api_product in ${productName})and(developer_app eq '${appName}')`;
};

const analytics = async (req, res, next) => {
    const { app_id, from_date, upto_date, product_id } = req.body;

    try {
        const _app_id = parseNumericId(app_id);
        const _product_id = parseNumericId(product_id);
        const _from = moment(from_date).format('MM/DD/YYYY%20HH:mm');
        const _upto = moment(upto_date).format('MM/DD/YYYY%20HH:mm');

        const prodIds = await getAnalyticsProductIds(_app_id, _product_id);

        const _query = `SELECT a.app_id, a.customer_id, a.app_name, a.in_live_env, cs.email_id FROM cst_app_mast a
                         INNER JOIN cst_customer cs ON a.customer_id = cs.customer_id WHERE a.app_id = ? AND a.is_deleted = false`;
        const row = await db.sequelize.query(_query, { replacements: [_app_id], type: QueryTypes.SELECT });
        if (!row?.length) {
            return res.status(200).json(success(false, res.statusCode, "App details not found.", null));
        }

        const _query1 = `SELECT p.product_id, p.product_name FROM product p WHERE p.product_id in (?) AND p.is_deleted = false`;
        const row1 = await db.sequelize.query(_query1, { replacements: [prodIds], type: QueryTypes.SELECT });
        if (!row1?.length) {
            return res.status(200).json(success(false, res.statusCode, "products details not found.", null));
        }

        const productNames = row1.map(el => `'${el.product_name}'`).join(', ');
        const { email_id: email, app_name, in_live_env } = row[0];
        const environment = in_live_env ? 'prod-01' : 'uat-01';
        // const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/environments/${environment}/stats/apiproxy/?select=sum(message_count)%2Csum(is_error)%2Csum(policy_error)%2Csum(target_error)%2Cavg(target_response_time)%2Cavg(total_response_time)%2Cmin(response_processing_latency)%2Cmax(response_processing_latency)%2Csum(message_count)&timeRange=${_from}~${_upto}&filter=(developer_email eq '${email}')and(api_product in ${product_name})and(developer_app eq '${app_name}') `;
        // const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/environments/${environment}/stats/apiproxy/?select=sum(message_count)%2Csum(is_error)%2Csum(policy_error)%2Csum(target_error)%2Cavg(target_response_time)%2Cavg(total_response_time)%2Cmin(response_processing_latency)%2Cmax(response_processing_latency)%2Csum(message_count)&timeRange=${_from}~${_upto}&filter=(developer_email eq '${email}')and(api_product in ${product_name})and(developer_app eq '${app_name}')and(apiproxy in '${proxy_name}')`;
        const product_URL = buildAnalyticsUrl(environment, _from, _upto, email, productNames, app_name);

        console.log(product_URL);
        const apigeeAuth = await db.get_apigee_token();
        const responseMain = await fetch(product_URL, { method: "GET", headers: { Authorization: `Bearer ${apigeeAuth}` } });
        const data = await responseMain.json();

        try {
            action_logger.info(JSON.stringify({
                correlation_id: correlator.getId(),
                token_id: req.token_data.token_id,
                account_id: req.token_data.account_id,
                user_type: 2,
                user_id: req.token_data.customer_id,
                narration: 'Analytics API(' + (in_live_env ? 'Live' : 'Sandbox') + '). App name = ' + app_name,
                query: product_URL,
                date_time: db.get_ist_current_date(),
            }));
        } catch (err) { console.log(err.stack); }

        return res.status(200).json(success(true, res.statusCode, "suceess.", data));

    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};


const live_sandbox_product = async (req, res, next) => {
    try {
        const { Product } = getModels();

        // Get products using ORM
        const productData = await Product.findAll({
            attributes: ['product_id', 'product_name', 'display_name', 'product_icon', 'product_open_spec', 'product_open_spec_json', 'api_doc_version'],
            where: {
                is_deleted: false,
                [Op.or]: [{ is_published: true }, { is_product_published: true }]
            }
        });
        const products = (productData || []).map(item => ({
            id: item.product_id,
            name: item.product_name,
            display_name: item.display_name,
            icon: item.product_icon?.length > 0 ? item.product_icon : '',
            definition_yaml: item.product_open_spec?.length > 0 ? item.product_open_spec : '',
            definition_json: item.product_open_spec_json?.length > 0 ? item.product_open_spec_json : '',
            api_doc_version: item.api_doc_version,
        }));
        const menus = await fn_nav_menus(req);
        const first_page = productData?.length > 0 ? await fn_first_menu(productData[0].product_id) : null;
        const results = {
            product_id: '',
            name: '',
            display_name: '',
            icon: '',
            products: products,
            menus: menus,
            first_page: first_page,
        };
        return res.status(200).json(success(true, res.statusCode, "", results));

    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const fn_nav_menus = async (req) => {
    const { Product, ProductPages } = getModels();
    let menus = [];

    // Get products using ORM
    const products = await Product.findAll({
        attributes: ['product_id', 'product_name', 'display_name', 'product_icon'],
        where: {
            is_deleted: false,
            [Op.or]: [{ is_published: true }, { is_product_published: true }]
        },
        order: [
            [literal('CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 9223372036854775807 ELSE COALESCE(sort_order, 0) END'), 'ASC'],
            ['product_id', 'ASC']
        ]
    });

    if (products) {
        for (const pr of products) {
            // Get pages using ORM
            const pagesData = await ProductPages.findAll({
                attributes: ['page_id', 'menu_name', 'show_api_method'],
                where: { is_deleted: false, is_published: true, product_id: pr.product_id },
                order: [
                    [literal('CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 9223372036854775807 ELSE COALESCE(sort_order, 0) END'), 'ASC'],
                    ['page_id', 'ASC']
                ]
            });
            let pages = [];
            pagesData?.forEach(item => {
                pages.push({
                    id: item.page_id,
                    name: item.menu_name,
                    api_ref_page: item.show_api_method,
                });
            });

            let product_icon = pr.product_icon && pr.product_icon.length > 0 ? pr.product_icon : '';
            if (pages.length > 0) {
                menus.push({
                    id: pr.product_id,
                    name: pr.product_name,
                    display_name: pr.display_name,
                    icon: product_icon,
                    pages: pages,
                });
            }
        }
    }
    return menus;
};

const fn_first_menu = async (product_id) => {
    const { ProductPages } = getModels();

    // Get first page using ORM
    const firstPage = await ProductPages.findOne({
        attributes: ['page_id', 'menu_name', 'show_api_method'],
        where: { is_deleted: false, is_published: true, product_id: product_id },
        order: [
            [literal('CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 9223372036854775807 ELSE COALESCE(sort_order, 0) END'), 'ASC'],
            ['page_id', 'ASC']
        ]
    });
    if (firstPage) {
        const p = { id: firstPage.page_id, name: firstPage.menu_name, api_ref_page: firstPage.show_api_method };
        return p;
    }
    return null;
};

const live_sandbox_proxies = async (req, res, next) => {
    const { id } = req.body;
    try {
        let _product_id = id && validator.isNumeric(id.toString()) ? parseInt(id) : 0;
        const { Product, Endpoint, Proxies } = getModels();

        const row1 = await Product.findOne({
            attributes: ['product_name', 'display_name', 'product_icon', 'product_open_spec', 'product_open_spec_json', 'api_doc_version'],
            where: {
                product_id: _product_id,
                is_deleted: false,
                [Op.or]: [{ is_published: true }, { is_product_published: true }]
            }
        });
        if (row1) {
            const row4 = await Endpoint.findAll({
                attributes: ['endpoint_id', 'endpoint_url', 'display_name'],
                include: [{
                    model: Proxies,
                    as: 'proxy',
                    attributes: [],
                    where: { product_id: _product_id, is_deleted: false, is_published: true },
                    required: true
                }],
                where: {
                    is_deleted: false,
                    [Op.or]: [{ is_published: true }, { is_product_published: true }]
                }
            });
            const proxies = (row4 || []).map(r => ({
                id: r.endpoint_id,
                name: r.display_name,
                url: r.endpoint_url,
            }));

            const results = { proxies: proxies };
            return res.status(200).json(success(true, res.statusCode, "", results));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Product details not found, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

// Helper to format live proxy result
const formatLiveProxyResult = (endpointData, productData, schemaData) => ({
    product: {
        id: endpointData.proxy.product_id,
        name: productData.product_name,
        display_name: productData.display_name,
        icon: productData.product_icon || '',
        definition_yaml: productData.product_open_spec || '',
        definition_json: productData.product_open_spec_json || '',
        api_doc_version: productData.api_doc_version,
    },
    proxy: {
        proxy_name: endpointData.proxy.proxy_name,
        endpoint_url: endpointData.endpoint_url,
        endpoint_name: endpointData.display_name,
        methods: endpointData.methods,
        path_params: endpointData.path_params,
        header_param: endpointData.header_param,
        request_schema: endpointData.request_schema,
        request_sample: endpointData.request_sample,
        updated_endpoint: endpointData.updated_endpoint,
    },
    schema: {
        status: schemaData.status_code,
        path_params: schemaData.path_params,
        headers: schemaData.header_json,
        req_schema: schemaData.req_schema,
        req_json: schemaData.req_json,
        res_schema: schemaData.res_schema,
        res_json: schemaData.res_json,
    },
    uat_portal: process.env.UAT_SITE_URL,
    prod_portal: process.env.PROD_SITE_URL,
});

const live_proxy_data = async (req, res, next) => {
    const { endpoint } = req.body;
    try {
        const endpoint_id = parseNumericId(endpoint);
        const { Endpoint, Proxies, Product } = getModels();

        const row1 = await Endpoint.findOne({
            attributes: ['endpoint_id', 'display_name', 'endpoint_url', 'updated_endpoint', 'methods', 'path_params', 'header_param', 'request_schema', 'request_sample'],
            where: { endpoint_id, is_deleted: false, [Op.or]: [{ is_published: true }, { is_product_published: true }] },
            include: [{ model: Proxies, as: 'proxy', attributes: ['proxy_id', 'product_id', 'proxy_name'], where: { is_published: true, is_deleted: false }, required: true }]
        });

        if (!row1) {
            return res.status(200).json(success(false, res.statusCode, "Api details not found, Please try again.", null));
        }

        const row2 = await Product.findOne({
            attributes: ['product_name', 'display_name', 'product_icon', 'product_open_spec', 'product_open_spec_json', 'api_doc_version'],
            where: { product_id: row1.proxy.product_id, is_deleted: false, [Op.or]: [{ is_published: true }, { is_product_published: true }] }
        });

        if (!row2) {
            return res.status(200).json(success(false, res.statusCode, "Product details not found, Please try again.", null));
        }

        const _query3 = `SELECT status_code, path_params, header_json, req_schema, req_json, res_schema, res_json
                        FROM proxy_schema WHERE schema_id IN (
                            SELECT MAX(schema_id) AS schema_id FROM proxy_schema WHERE endpoint_id = ? AND is_deleted = false AND is_enabled = true GROUP BY status_code
                        ) ORDER BY CAST(status_code AS INTEGER) LIMIT 1`;
        const row3 = await db.sequelize.query(_query3, { replacements: [endpoint_id], type: QueryTypes.SELECT });

        if (!row3?.length) {
            return res.status(200).json(success(false, res.statusCode, "Api details not found, Please try again.", null));
        }

        const results = formatLiveProxyResult(row1, row2, row3[0]);
        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const default_res = { status: 401, data: JSON.stringify({ "status": false, "error_code": 401, "error_description": "Invalid Access Token" }, null, 4), };

// Helper to check if required param is valid
const isParamValid = (requiredParam, providedParams) => {
    for (const element of providedParams || []) {
        if (requiredParam.name === element.name && requiredParam.value === element.value) {
            return true;
        }
    }
    return false;
};

// Helper to get 401 response schema
const get401Schema = async (endpointId) => {
    const query = `SELECT status_code, res_json FROM proxy_schema WHERE endpoint_id = ? AND is_deleted = false AND is_enabled = true AND status_code = '401' ORDER BY schema_id DESC LIMIT 1`;
    const rows = await db.sequelize.query(query, { replacements: [endpointId], type: QueryTypes.SELECT });
    return rows?.[0] ? { status: rows[0].status_code, data: rows[0].res_json } : null;
};

// Helper to validate required params
const validateRequiredParams = async (paramsJson, providedParams, endpointId) => {
    if (!paramsJson?.length) return null;
    const params = JSON.parse(paramsJson);
    for (const param of params) {
        if (param.is_required && !isParamValid(param, providedParams)) {
            return await get401Schema(endpointId);
        }
    }
    return null;
};

// Helper to find matching response by request body
const findMatchingResponse = (schemas, jsonBody) => {
    for (const element of schemas) {
        try {
            if (JSON.stringify(JSON.parse(element.req_json)) === JSON.stringify(jsonBody)) {
                return { status: element.status_code, data: element.res_json };
            }
        } catch (_) { /* ignore parse errors */ }
    }
    return null;
};

const live_play_api = async (req, res, next) => {
    const { endpoint, path_param, header_param, json_body } = req.body;
    try {
        const endpoint_id = parseNumericId(endpoint);

        const _query1 = `SELECT p.proxy_id, p.product_id, p.proxy_name, e.display_name, e.endpoint_url, e.updated_endpoint, e.methods, e.path_params, e.header_param, e.request_schema, e.request_sample
        FROM endpoint e INNER JOIN proxies p ON e.proxy_id = p.proxy_id WHERE e.endpoint_id = ? AND (e.is_published = true OR e.is_product_published = true) AND e.is_deleted = false
        AND p.is_published = true AND p.is_deleted = false`;
        const row1 = await db.sequelize.query(_query1, { replacements: [endpoint_id], type: QueryTypes.SELECT });

        if (!row1?.length) {
            return res.status(200).json(success(true, res.statusCode, "success", default_res));
        }

        // Validate path params
        const pathValidation = await validateRequiredParams(row1[0].path_params, path_param, endpoint_id);
        if (pathValidation) {
            return res.status(200).json(success(true, res.statusCode, "success", pathValidation));
        }

        // Validate header params
        const headerValidation = await validateRequiredParams(row1[0].header_param, header_param, endpoint_id);
        if (headerValidation) {
            return res.status(200).json(success(true, res.statusCode, "success", headerValidation));
        }

        // Find matching response
        const _query3 = `SELECT status_code, req_json, res_json FROM proxy_schema WHERE endpoint_id = ? AND is_deleted = false AND is_enabled = true ORDER BY CAST(status_code AS INTEGER), schema_id DESC`;
        const row3 = await db.sequelize.query(_query3, { replacements: [endpoint_id], type: QueryTypes.SELECT });

        if (row3?.length) {
            const matchedResponse = findMatchingResponse(row3, json_body);
            if (matchedResponse) {
                return res.status(200).json(success(true, res.statusCode, "success", matchedResponse));
            }
        }

        return res.status(200).json(success(true, res.statusCode, "success", default_res));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const credit_details_get = async (req, res, next) => {
    const { page_no, search_text, transaction_type, from_date, upto_date } = req.body;

    try {
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0;
        if (_page_no <= 0) { _page_no = 1; }
        const { CstCustomer, CstCredits } = getModels();

        const _row1 = await CstCustomer.findOne({
            attributes: ['total_credits'],
            where: { customer_id: req.token_data.customer_id }
        });
        if (!_row1) {
            return res.status(200).json(success(false, res.statusCode, "Customer details not found, Please try again.", null));
        }
        let total_credits = _row1.total_credits || 0;

        // Build where clause for credits
        const whereClause = { customer_id: req.token_data.customer_id };
        if (search_text) {
            whereClause.description = { [Op.iLike]: `%${search_text}%` };
        }
        if (transaction_type) {
            whereClause.transaction_type = transaction_type;
        }
        if (from_date) {
            whereClause.added_date = { ...(whereClause.added_date || {}), [Op.gte]: new Date(from_date) };
        }
        if (upto_date) {
            const existingCondition = whereClause.added_date || {};
            whereClause.added_date = { ...existingCondition, [Op.lte]: new Date(upto_date + 'T23:59:59') };
        }

        const total_record = await CstCredits.count({ where: whereClause });

        const row3 = await CstCredits.findAll({
            attributes: ['credit_id', 'credits', 'added_date', 'transaction_type', 'description'],
            where: whereClause,
            order: [['credit_id', 'DESC']],
            limit: parseInt(process.env.PAGINATION_SIZE),
            offset: (_page_no - 1) * parseInt(process.env.PAGINATION_SIZE)
        });

        let _credits = [];
        if (row3 && row3.length > 0) {
            row3.forEach((item, index) => {
                _credits.push({
                    sr_no: ((_page_no - 1) * parseInt(process.env.PAGINATION_SIZE)) + index + 1,
                    credits: item.credits,
                    transaction_type: item.transaction_type == 1 ? "Credited" : "Debited",
                    description: item.description,
                    added_date: item.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.added_date)) : "",
                });
            });
        }
        const results = {
            current_page: _page_no,
            total_pages: Math.ceil(total_record / process.env.PAGINATION_SIZE),
            total_credits: total_credits,
            data: _credits,
        };
        return res.status(200).json(success(true, res.statusCode, "Credits Data.", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const user_details = async (req, res, next) => {
    try {
        const { CstCustomer } = getModels();

        const row4 = await CstCustomer.findOne({
            attributes: ['company_name', 'first_name', 'last_name', 'email_id', 'network_id', 'mobile_no', 'industry_id', 'register_date', 'is_live_sandbox'],
            where: { customer_id: req.token_data.customer_id }
        });
        if (row4) {
            const results = {
                company_name: row4.company_name,
                first_name: row4.first_name,
                last_name: row4.last_name,
                email_id: row4.email_id,
                network_id: row4.network_id,
                mobile_no: row4.mobile_no,
                industry_id: row4.industry_id,
                is_live_sandbox: row4.is_live_sandbox
            };
            return res.status(200).json(success(true, res.statusCode, "Profile Data.", results));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to find profile detail, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const credit_details_export = async (req, res, next) => {
    const { search_text, transaction_type, from_date, upto_date } = req.body;

    try {
        const { CstCustomer, CstCredits } = getModels();

        const _row1 = await CstCustomer.findOne({
            attributes: ['total_credits'],
            where: { customer_id: req.token_data.customer_id }
        });
        if (!_row1) {
            return res.status(200).json(success(false, res.statusCode, "Customer details not found, Please try again.", null));
        }

        // Build where clause for credits
        const whereClause = { customer_id: req.token_data.customer_id };
        if (search_text) {
            whereClause.description = { [Op.iLike]: `%${search_text}%` };
        }
        if (transaction_type) {
            whereClause.transaction_type = transaction_type;
        }
        if (from_date) {
            whereClause.added_date = { ...(whereClause.added_date || {}), [Op.gte]: new Date(from_date) };
        }
        if (upto_date) {
            const existingCondition = whereClause.added_date || {};
            whereClause.added_date = { ...existingCondition, [Op.lte]: new Date(upto_date + 'T23:59:59') };
        }

        const row3 = await CstCredits.findAll({
            attributes: ['credit_id', 'credits', 'added_date', 'transaction_type', 'description'],
            where: whereClause,
            order: [['credit_id', 'DESC']]
        });

        const workbook = new excel.Workbook();
        const worksheet = workbook.addWorksheet('Sheet 1');
        const headers = ['Sr No', 'Transaction Date', 'Credits', 'Transaction Type', 'Description'];
        const headerRow = worksheet.addRow(headers);
        headerRow.eachCell((cell, colNumber) => {
            cell.font = { bold: true };
        });

        if (row3 && row3.length > 0) {
            row3.forEach((item, index) => {
                const rowValues = [
                    index + 1,
                    item.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.added_date)) : "",
                    item.credits,
                    item.transaction_type == 1 ? "Credited" : "Debited",
                    item.description
                ];
                worksheet.addRow(rowValues);
            });
        }

        const excelBuffer = await workbook.xlsx.writeBuffer();
        res.setHeader('Content-Length', excelBuffer.length);
        res.send(excelBuffer);
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const send_mail_existing_user_to_sandbox = async (customer_id) => {
    const { CstCustomer, EmailTemplate } = getModels();

    const row4 = await CstCustomer.findOne({
        attributes: ['company_name', 'first_name', 'last_name', 'email_id', 'mobile_no', 'register_date', 'is_activated'],
        where: { customer_id: customer_id }
    });
    if (row4) {
        const rowT = await EmailTemplate.findOne({
            attributes: ['subject', 'body_text', 'is_enabled'],
            where: { template_id: EmailTemplates.UPGRATE_TO_SANDBOX.value }
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
                    _logger.error(err.stack);
                }
                if (is_success) {
                    return 1; /* Send*/
                } else {
                    return 0; /* Sending fail*/
                }
            } else {
                return -4;      /*Templete is disabled*/
            }
        } else {
            return -3;      /*Templete not found*/
        }
    }
    return 0;       /*Customer data not found*/
}


const analytics_reports_get = async (req, res, next) => {
    const { page_no, search_text, product_id, from_date, upto_date, type } = req.body;
    try {
        let _customer_id = req.token_data.customer_id;
        let _search_text = search_text && search_text.length > 0 ? search_text : "";
        // let _product_id = product_id && validator.isNumeric(product_id.toString()) ? parseInt(product_id) : 0;
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0;
        let _type = type && validator.isNumeric(type.toString()) ? parseInt(type) : 0;// 1 = prod and 2 = UAT
        let total_record = 0;
        let developerId = '';
        let email_id = '';
        let from_dateTime = '18:30:00.000 UTC';
        let to_dateTime = '18:30:00.000 UTC';
        let previousfrom_Date = '';
        if (from_date) {
            let date = new Date(from_date);
            date.setDate(date.getDate() - 1);
            previousfrom_Date = date.toISOString().split('T')[0];
        }

        let _from_date = previousfrom_Date + ' ' + from_dateTime;
        let _upto_date = upto_date + ' ' + to_dateTime;
        let row2 = '';
        if (_customer_id > 0) {
            const _query2 = `SELECT customer_id,developer_id, first_name, last_name, email_id FROM cst_customer WHERE  customer_id = ? AND is_deleted = false`;
            row2 = await db.sequelize.query(_query2, { replacements: [_customer_id], type: QueryTypes.SELECT, });
            if (row2 || row2.length > 0) {
                developerId = row2[0].developer_id;
                email_id = row2[0].email_id;
            }
        }

        if (_page_no <= 0) { _page_no = 1; } if (_type <= 0) { _type = 1; }
        const table_name = _type == 1 ? 'apigee_logs_prod' : 'apigee_logs';
        let _query0 = `SELECT count(1) AS total_record FROM ${table_name} `;
        const conditions0 = [];
        const replacements0 = {};


        // Add conditions based on provided letiables
        if (_search_text && _search_text.length > 0) {
            conditions0.push(` request_path ILIKE :search_text`);
            replacements0.search_text = `%${_search_text}%`;
        }
        // if (developerId && developerId.length > 0) {
        //     // conditions0.push(` REPLACE(developer, 'apigeeprotean@@@', '') = :developerId`);
        //     conditions0.push(`developer_email = :'dhavan.k@phonepe.com'`);
        //     replacements0.developerId = developerId;
        //}

        if (email_id && email_id.length > 0) {
            conditions0.push(` developer_email = :email_id`);
            replacements0.email_id = email_id;
        }
        if (product_id && product_id.length > 0) {
            conditions0.push(` api_product = :product_id `);
            replacements0.product_id = product_id;
        }
        if (from_date) {
            conditions0.push(` ax_created_time >= :from_date`);
            replacements0.from_date = _from_date;
        }
        if (upto_date) {
            conditions0.push(` ax_created_time <= :upto_date`);
            replacements0.upto_date = _upto_date;
        }
        if (conditions0.length > 0) {
            _query0 += ' WHERE ' + conditions0.join(' AND ');
        }

        const row0 = await db.sequelize2.query(_query0, {
            replacements: replacements0,
            type: QueryTypes.SELECT
        });

        if (row0 && row0.length > 0) {
            total_record = row0[0].total_record;
        }

        let _query3 = `SELECT ROW_NUMBER() OVER(ORDER BY ax_created_time DESC) AS sr_no, 
        id, organization, environment, apiproxy, request_uri, proxy,request_path, proxy_basepath, request_verb, request_size, response_status_code,
        is_error, client_received_start_timestamp, client_received_end_timestamp, target_sent_start_timestamp, target_sent_end_timestamp, 
        target_received_start_timestamp, target_received_end_timestamp, client_sent_start_timestamp, client_sent_end_timestamp, client_ip, 
        client_id, REPLACE(developer, 'apigeeprotean@@@', '') AS developer, developer_app, api_product, response_size, developer_email,
        total_response_time, request_processing_latency, response_processing_latency,  ax_created_time,  dc_api_product, dc_api_resource, 
        dc_developer_app, dc_developer_app_display_name, dc_developer_email, dc_api_name, dc_api_request_id, dc_case_id,
        dc_karzastauscode AS karza_status_code,dc_backendstatusreason AS response_description,
        dc_signzyresponseid AS id_field_from_signzy_response, x_apigee_mintng_price_multiplier, x_apigee_mintng_rate,
	    x_apigee_mintng_rate::FLOAT /NULLIF(x_apigee_mintng_price_multiplier::FLOAT , 0) as rate_plan_rate, dc_billing_type, dc_programid FROM ${table_name}`;
        const conditions = [];
        const replacements = {
            page_size: process.env.PAGINATION_SIZE,
            page_no: _page_no,
        };

        // if (developerId && developerId.length > 0) {
        //     // conditions.push(` REPLACE(developer, 'apigeeprotean@@@', '') = :developerId`);
        //     conditions.push(`developer_email = : 'dhavan.k@phonepe.com'`);
        //     replacements.developerId = developerId;
        // }

        if (email_id && email_id.length > 0) {
            conditions.push(` developer_email = :email_id`);
            replacements.email_id = email_id;
        }
        // Add conditions based on provided letiables
        if (_search_text && _search_text.length > 0) {
            conditions.push(` request_path ILIKE :search_text`);
            replacements.search_text = `%${_search_text}%`;
        }
        if (product_id && product_id.length > 0) {
            conditions.push(` api_product = :product_id `);
            replacements.product_id = product_id;
        }

        if (from_date) {
            conditions.push(` ax_created_time >= :from_date`);
            replacements.from_date = _from_date;
        }

        if (upto_date) {
            conditions.push(` ax_created_time <= :upto_date`);
            replacements.upto_date = _upto_date;
        }

        if (conditions.length > 0) {
            _query3 += ' WHERE ' + conditions.join(' AND ');
        }
        // Add LIMIT and OFFSET
        _query3 += ` ORDER BY ax_created_time DESC LIMIT :page_size OFFSET ((:page_no - 1) * :page_size)`;


        // Execute the query with replacements
        const row3 = await db.sequelize2.query(_query3, {
            replacements,
            type: QueryTypes.SELECT
        });

        // const customerMap = row2.reduce((acc, customer) => {
        //     acc[customer.developer_id] = `${customer.first_name} ${customer.last_name}`;
        //     return acc;
        // }, {});

        if (row3 && row3.length > 0) {
            let reports = [];
            for (const item of row3) {
                reports.push({
                    sr_no: item.sr_no,
                    id: item.id,
                    // client_name: customerMap[item.developer] || null,
                    organization: item.organization,
                    environment: item.environment,
                    request_uri: item.request_uri,
                    response_status_code: item.response_status_code,
                    client_received_start_timestamp: item.client_received_start_timestamp,
                    client_received_end_timestamp: item.client_received_end_timestamp,
                    client_sent_start_timestamp: item.client_sent_start_timestamp,
                    client_sent_end_timestamp: item.client_sent_end_timestamp,

                    ist_client_received_start_timestamp: db.convertUTCtoIST(item.client_received_start_timestamp) || '',
                    ist_client_received_end_timestamp: db.convertUTCtoIST(item.client_received_end_timestamp) || '',
                    ist_client_sent_start_timestamp: db.convertUTCtoIST(item.client_sent_start_timestamp) || '',
                    ist_client_sent_end_timestamp: db.convertUTCtoIST(item.client_sent_end_timestamp) || '',
                    request_path: item.request_path,
                    developer: item.developer,
                    developer_app: item.developer_app,
                    api_product: item.api_product,
                    dc_api_request_id: item.dc_api_request_id,
                    dc_api_name: item.dc_api_name,
                    dc_case_id: item.dc_case_id,
                    total_response_time: item.total_response_time,
                    developer_email: item.developer_email,
                    ax_created_time: item.ax_created_time,
                    dc_api_product: item.dc_api_product,
                    dc_api_resource: item.dc_api_resource,
                    dc_developer_app: item.dc_developer_app,
                    dc_developer_app_display_name: item.dc_developer_app_display_name,
                    karza_status_code: item.karza_status_code || '',
                    response_description: item.response_description || '',
                    id_field_from_signzy_response: item.id_field_from_signzy_response || '',
                    x_apigee_mintng_price_multiplier: '',//item.x_apigee_mintng_price_multiplier,
                    x_apigee_mintng_rate: '',//item.x_apigee_mintng_rate,
                    rate_plan_rate: '',//item.rate_plan_rate,
                    billing_type: item.dc_billing_type,
                    dc_programid: item.dc_programid,
                });
            }
            const results = {
                current_page: _page_no,
                total_pages: Math.ceil(total_record / process.env.PAGINATION_SIZE),
                total_record: total_record,
                data: reports,
            };

            return res.status(200).json(success(true, res.statusCode, "Reports Data.", results));
        } else {
            const results = {
                current_page: _page_no,
                total_pages: '',
                data: [],
            };
            return res.status(200).json(success(true, res.statusCode, "Unable to find reports detail, Please try again.", results));
        }

    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const analytics_reports_export = async (req, res, next) => {
    const { page_no, search_text, product_id, from_date, upto_date, type } = req.body;
    try {
        let _customer_id = req.token_data.customer_id;
        let _search_text = search_text && search_text.length > 0 ? search_text : "";
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0;
        let _type = type && validator.isNumeric(type.toString()) ? parseInt(type) : 0;// 1 = prod and 2 = UAT
        let developerId = '';
        let row2 = '';
        if (_customer_id > 0) {
            const _query2 = `SELECT customer_id, developer_id, first_name, last_name, email_id FROM cst_customer WHERE  customer_id = ? AND is_deleted = false`;
            row2 = await db.sequelize.query(_query2, { replacements: [_customer_id], type: QueryTypes.SELECT, });
            if (row2 || row2.length > 0) {
                developerId = row2[0].developer_id;
            }
        }
        if (_customer_id <= 0 || (product_id && product_id.length <= 0)) {

            if (!from_date || from_date.length <= 0 || !validator.isDate(from_date)) {
                return res.status(200).json(success(false, res.statusCode, "Please select a valid from date.", null));
            }

            if (!upto_date || upto_date.length <= 0 || !validator.isDate(upto_date)) {
                return res.status(200).json(success(false, res.statusCode, "Please select a valid upto date.", null));
            }


            const fromDateMoment = moment(from_date);
            const uptoDateMoment = moment(upto_date);
            const dateDifference = uptoDateMoment.diff(fromDateMoment, 'days');

            if (dateDifference > 32) {
                return res.status(200).json({ success: false, message: "Date range should not be greater than 31 days." });
            }
        }
        console.log("------s-product_id-------------------", developerId);
        let from_dateTime = '18:30:00.000 UTC';
        let to_dateTime = '18:29:59.999 UTC';

        if (from_date) {
            let date = new Date(from_date);
            date.setDate(date.getDate() - 1);
            previousfrom_Date = date.toISOString().split('T')[0];
        }

        let _from_date = previousfrom_Date + ' ' + from_dateTime;
        let _upto_date = upto_date + ' ' + to_dateTime;
        let hasMoreData = true;
        let currentPage = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 1;
        const pageSize = 1000; // Set your desired page size

        if (_page_no <= 0) { _page_no = 1; } if (_type <= 0) { _type = 1; }
        const table_name = _type == 1 ? 'apigee_logs_prod' : 'apigee_logs';
        console.log("------s-table_name-------------------", table_name);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="customer_analytics_reports_data.xlsx"');

        const workbook = new excel.stream.xlsx.WorkbookWriter({ stream: res });
        const worksheet = workbook.addWorksheet('Sheet 1');
        const headers = ['Sr No', 'Email ID', 'Developer ID', 'Api Product', 'API Request ID', 'Api Name', 'Case_Id', 'Request Path', 'API Response Status Code',
            'Response ID Filed', 'Total Response Time', 'Response Packet Status Code', 'Response Description', 'API Request Timestamp<',
            'API Response Timestamp', 'API Request Timestamp (IST)', 'API Response Timestamp (IST)'];
        worksheet.addRow(headers).commit();

        while (hasMoreData) {
            let _query3 = `SELECT ROW_NUMBER() OVER(ORDER BY id DESC) AS sr_no, 
        id, organization, environment, apiproxy, request_uri, proxy, proxy_basepath,request_path, request_verb, request_size, response_status_code,
        is_error, client_received_start_timestamp, client_received_end_timestamp, target_sent_start_timestamp, target_sent_end_timestamp, 
        target_received_start_timestamp, target_received_end_timestamp, client_sent_start_timestamp, client_sent_end_timestamp, client_ip, 
        client_id, REPLACE(developer, 'apigeeprotean@@@', '') AS developer, developer_app, api_product, response_size, developer_email,
        total_response_time, request_processing_latency, response_processing_latency,  ax_created_time,  dc_api_product, dc_api_resource, 
        dc_developer_app, dc_developer_app_display_name, dc_developer_email, dc_api_name, dc_api_request_id, dc_case_id ,
        x_apigee_mintng_price_multiplier, x_apigee_mintng_rate, x_apigee_mintng_rate::FLOAT /NULLIF(x_apigee_mintng_price_multiplier::FLOAT , 0) as rate_plan_rate 
        FROM ${table_name} `;
            const conditions = [];
            const replacements = {
                page_size: pageSize,
                page_no: currentPage,
            };
            console.log("--------------------------", developerId);
            if (developerId && developerId.length > 0) {
                // conditions.push(` REPLACE(developer, 'apigeeprotean@@@', '') = :developerId`);
                conditions.push(`developer_email = :'dhavan.k@phonepe.com'`);
                replacements.developerId = developerId;
            }
            // Add conditions based on provided letiables
            if (_search_text && _search_text.length > 0) {
                conditions.push(`developer_email ILIKE :search_text`);
                replacements.search_text = `%${_search_text}%`;
            }
            if (product_id && product_id.length > 0) {
                conditions.push(` dc_api_product ILIKE :product_id `);
                replacements.product_id = `%${product_id}%`;
            }

            if (from_date) {
                conditions.push(` ax_created_time >= :from_date`);
                replacements.from_date = _from_date;
            }

            if (upto_date) {
                conditions.push(` ax_created_time <= :upto_date`);
                replacements.upto_date = _upto_date;
            }

            if (conditions.length > 0) {
                _query3 += ' WHERE ' + conditions.join(' AND ');
            }
            // Add LIMIT and OFFSET
            _query3 += ` LIMIT :page_size OFFSET ((:page_no - 1) * :page_size)`;

            const pageData = await db.sequelize2.query(_query3, { replacements, type: QueryTypes.SELECT, raw: true });
            if (pageData && pageData.length > 0) {
                pageData.forEach(row => {
                    const rowData = [
                        row.sr_no,
                        row.dc_developer_email,
                        row.developer,
                        row.dc_api_product,
                        row.dc_api_request_id,
                        row.dc_api_name,
                        row.dc_case_id,
                        row.request_path,
                        row.response_status_code,
                        row.id_field_from_signzy_response || '',
                        row.total_response_time,
                        row.karza_status_code || '',
                        row.response_description || '',
                        row.target_sent_start_timestamp,
                        row.target_received_end_timestamp,
                        db.convertUTCtoIST(row.target_sent_start_timestamp),
                        db.convertUTCtoIST(row.target_received_end_timestamp),
                        row.x_apigee_mintng_price_multiplier,
                        row.x_apigee_mintng_rate,
                        row.rate_plan_rate,
                    ];
                    worksheet.addRow(rowData).commit();
                });
                currentPage++;
            } else {
                hasMoreData = false;
            }
        }

        await workbook.commit();
        res.end();
    } catch (err) {
        _logger.error(err.stack);
        console.log("----------err.stack---------------", err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const cst_analytics_reports_generate_excel = async (req, res, next) => {
    const { page_no, search_text, product_id, from_date, upto_date, type } = req.body;
    try {
        let _customer_id = req.token_data.customer_id;
        let _search_text = search_text && search_text.length > 0 ? search_text : "";
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0;
        let _type = type && validator.isNumeric(type.toString()) ? parseInt(type) : 0;// 1 = prod and 2 = UAT
        let developerId = '';
        let email_id = '';
        let row2 = '';
        if (_customer_id > 0) {
            const _query2 = `SELECT customer_id, developer_id, first_name, last_name, email_id FROM cst_customer WHERE  customer_id = ? AND is_deleted = false`;
            row2 = await db.sequelize.query(_query2, { replacements: [_customer_id], type: QueryTypes.SELECT, });
            if (row2 || row2.length > 0) {
                developerId = row2[0].developer_id;
                email_id = row2[0].email_id;
            }
        }
        if (_customer_id > 0) {

            if (!from_date || from_date.length <= 0 || !validator.isDate(from_date)) {
                return res.status(200).json(success(false, res.statusCode, "Please select a valid from date.", null));
            }

            if (!upto_date || upto_date.length <= 0 || !validator.isDate(upto_date)) {
                return res.status(200).json(success(false, res.statusCode, "Please select a valid upto date.", null));
            }


            const fromDateMoment = moment(from_date);
            const uptoDateMoment = moment(upto_date);
            const dateDifference = uptoDateMoment.diff(fromDateMoment, 'days');

            if (dateDifference > 32) {
                return res.status(200).json({ success: false, message: "Date range should not be greater than 31 days." });
            }
        }

        let previousfrom_Date;
        console.log("------s-product_id-------------------", developerId);
        let from_dateTime = '18:30:00.000 UTC';
        let to_dateTime = '18:29:59.999 UTC';

        if (from_date) {
            let date = new Date(from_date);
            date.setDate(date.getDate() - 1);
            previousfrom_Date = date.toISOString().split('T')[0];
        }

        let _from_date = previousfrom_Date + ' ' + from_dateTime;
        let _upto_date = upto_date + ' ' + to_dateTime;
        if (_page_no <= 0) { _page_no = 1; } if (_type <= 0) { _type = 1; }
        const table_name = _type == 1 ? 'apigee_logs_prod' : 'apigee_logs';
        console.log("------s-table_name-------------------", table_name);
        const uuid = uuidv4();
        const formattedDateTime = moment().format('YYYYMMDD_HHmmss');
        const requestId = `${uuid}_${formattedDateTime}`;

        const _query1 = `INSERT INTO analytics_file_object(request_id, added_by, added_date, status) VALUES (?, ?, ?, ? )RETURNING "file_id"`;
        const _replacements2 = [requestId, req.token_data.account_id, db.get_ist_current_date(), STATUS_TYPE.Pending];
        const [rowOut] = await db.sequelize.query(_query1, { replacements: _replacements2, type: QueryTypes.INSERT });
        const file_id = (rowOut && rowOut.length > 0 && rowOut[0] ? rowOut[0].file_id : 0);
        if (file_id > 0) {
            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: 0,
                    account_id: (req.token_data.account_id),
                    user_type: 1,
                    user_id: req.token_data.account_id,
                    narration: 'excel genrate with requestid:' + requestId,
                    query: db.buildQuery_Array(_query1, _replacements2),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to insert request id, Please try again.", null));
        }

        const filePath = path.join(__dirname, `../../../uploads/download_excel/${requestId}.xlsx`);

        // Ensure the directory exists
        await fs.ensureDir(path.join(__dirname, '../../../uploads/download_excel'));

        console.log("==============filePath=======================", filePath);
        generateExcelFile(req, filePath, requestId, _type, developerId, _from_date, _upto_date, email_id);
        let data = {
            request_id: requestId
        }
        res.status(200).json(success(true, res.statusCode, "Excel generation started.", data));

    } catch (err) {
        _logger.error(err.stack);
        console.log("----------err.stack---------------", err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const generateExcelFile = async (req, filePath, requestId, _type, developerId, _from_date, _upto_date, email_id) => {
    const { customer_id, search_text, product_id, from_date, upto_date } = req.body;
    try {
        let _customer_id = customer_id && validator.isNumeric(customer_id.toString()) ? parseInt(customer_id) : 0;
        let _search_text = search_text && search_text.length > 0 ? search_text : "";
        let _email_id = email_id && email_id.length > 0 ? email_id : "";
        const workbook = new excel.stream.xlsx.WorkbookWriter({ filename: filePath });
        const worksheet = workbook.addWorksheet('Sheet 1');
        let currentPage = 1;
        let hasMoreData = true;
        const pageSize = 10000;
        const table_name = _type == 1 ? 'apigee_logs_prod' : 'apigee_logs';

        const headers = ['Sr No', 'Email ID', 'Developer ID', 'Api Product', 'API Request ID', 'Api Name', 'Case_Id', 'Request Path', 'API Response Status Code',
            'Response ID Field', 'Total Response Time (ms)', 'Response Packet Status Code', 'Price Multiplier',
            'Final Rate', 'Rate Plan Rate', 'Billing Type', 'Response Description', 'API Request Timestamp',
            'API Response Timestamp', 'API Request Timestamp (IST)', 'API Response Timestamp (IST)'];
        worksheet.addRow(headers).commit();

        while (hasMoreData) {
            let _query3 = `SELECT ROW_NUMBER() OVER(ORDER BY ax_created_time DESC) AS sr_no, 
        id, organization, environment, apiproxy, request_uri, proxy, proxy_basepath, request_path, request_verb, request_size, response_status_code,
        is_error, client_received_start_timestamp, client_received_end_timestamp, target_sent_start_timestamp, target_sent_end_timestamp, 
        target_received_start_timestamp, target_received_end_timestamp, client_sent_start_timestamp, client_sent_end_timestamp, client_ip, 
        client_id, REPLACE(developer, 'apigeeprotean@@@', '') AS developer, developer_app, api_product, response_size, developer_email,
        total_response_time, request_processing_latency, response_processing_latency,  ax_created_time,  dc_api_product, dc_api_resource, 
        dc_developer_app, dc_developer_app_display_name, dc_developer_email, dc_api_name, dc_api_request_id, dc_case_id,
        dc_karzastauscode AS karza_status_code, dc_backendstatusreason AS response_description,
        dc_signzyresponseid AS id_field_from_signzy_response, x_apigee_mintng_price_multiplier, x_apigee_mintng_rate,
	    x_apigee_mintng_rate::FLOAT / NULLIF(x_apigee_mintng_price_multiplier::FLOAT, 0) AS rate_plan_rate, dc_billing_type FROM ${table_name} `;

            const conditions = [];
            const replacements = {
                page_size: pageSize,
                page_no: currentPage,
            };
            console.log("--------------------------", email_id);
            // if (developerId && developerId.length > 0) {
            //     // conditions.push(` REPLACE(developer, 'apigeeprotean@@@', '') = :developerId`);
            //     conditions.push(`developer_email =: 'dhavan.k@phonepe.com'`);
            //     replacements.developerId = developerId;
            // }


            if (_email_id && _email_id.length > 0) {
                conditions.push(`developer_email = :email_id`);
                replacements.email_id = _email_id;
            }

            if (_search_text && _search_text.length > 0) {
                conditions.push(`request_path ILIKE :search_text`);
                replacements.search_text = `%${_search_text}%`;
            }
            if (product_id && product_id.length > 0) {
                conditions.push(` api_product = :product_id `);
                replacements.product_id = product_id;
            }

            if (from_date) {
                conditions.push(` ax_created_time >= :from_date`);
                replacements.from_date = _from_date;
            }

            if (upto_date) {
                conditions.push(` ax_created_time <= :upto_date`);
                replacements.upto_date = _upto_date;
            }

            if (conditions.length > 0) {
                _query3 += ' WHERE ' + conditions.join(' AND ');
            }
            _query3 += ` ORDER BY ax_created_time DESC LIMIT :page_size OFFSET ((:page_no - 1) * :page_size)`;
            const pageData = await db.sequelize2.query(_query3, { replacements, type: QueryTypes.SELECT, raw: true });
            if (pageData && pageData.length > 0) {
                pageData.forEach(row => {
                    const rowData = [
                        row.sr_no,
                        row.developer_email,
                        row.developer,
                        row.api_product,
                        row.dc_api_request_id,
                        row.dc_api_name,
                        row.dc_case_id,
                        row.request_path,
                        row.response_status_code,
                        row.id_field_from_signzy_response || '',
                        row.total_response_time,
                        row.karza_status_code || '',
                        row.x_apigee_mintng_price_multiplier,
                        row.x_apigee_mintng_rate,
                        null, // row.rate_plan_rate,
                        row.dc_billing_type,
                        row.response_description || '',
                        row.client_received_end_timestamp,
                        row.client_sent_end_timestamp,
                        db.convertUTCtoIST(row.client_received_end_timestamp),
                        db.convertUTCtoIST(row.client_sent_end_timestamp),

                    ];
                    worksheet.addRow(rowData).commit();
                });
                currentPage++;
            } else {
                hasMoreData = false;
            }
        }
        await workbook.commit();
        const _query1 = `Update analytics_file_object SET status = ? WHERE  request_id =?`;
        const _replacements2 = [STATUS_TYPE.Completed, requestId];
        await db.sequelize.query(_query1, { replacements: _replacements2, type: QueryTypes.UPDATE });
        console.log(`Excel file generated successfully: ${filePath}`);
    } catch (err) {
        console.error("Error generating Excel file:", err);
        const _query1 = `Update analytics_file_object SET status = ? WHERE  request_id = ?`;
        const _replacements2 = [STATUS_TYPE.Failed, requestId];
        await db.sequelize.query(_query1, { replacements: _replacements2, type: QueryTypes.UPDATE });
    }
};

const cst_analytics_reports_download = async (req, res, next) => {
    const { request_id } = req.body;
    try {
        console.log("==========request_id,=====================", request_id);
        const _qry20 = `SELECT status FROM analytics_file_object WHERE request_id = ?`;
        const _rw20 = await db.sequelize.query(_qry20, { replacements: [request_id], type: QueryTypes.SELECT });
        if (!_rw20 || _rw20.length <= 0) {
            return res.status(404).json(success(false, res.statusCode, "Request ID not found.", null));
        }
        const requestStatus = _rw20[0].status;
        console.log("Database status value:", requestStatus);
        if (requestStatus !== STATUS_TYPE.Completed) {
            return res.status(202).json(success(false, res.statusCode, "Report is still being generated.", null));
        }
        if (requestStatus == STATUS_TYPE.Completed) {
            const filePath = path.join(__dirname, `../../../uploads/download_excel/${request_id}.xlsx`);
            const data = {
                status: 'Completed',
                downloadUrl: `uploads/download_excel/${request_id}.xlsx`
            }
            if (fs.existsSync(filePath)) {
                setTimeout(() => {
                    fs.unlink(filePath, (err) => {
                        if (err) {
                            console.error("Error deleting file:", err);
                        }
                    });
                }, 10000);
                return res.status(200).json(success(true, res.statusCode, "Report is completed.", data));
            } else {
                return res.status(404).json(success(false, res.statusCode, 'File not found.', null));
            }
        }
        // Check if the file exists before downloading
        // if (fs.existsSync(filePath)) {
        //     res.download(filePath, 'customer_analytics_reports_data.xlsx', async (err) => {
        //         if (err) {
        //             console.error("Download error:", err);
        //         } else {
        //             // Update status to "Downloaded" after successful download
        //             const _query1 = `UPDATE analytics_file_object SET status = ? WHERE request_id = ?`;
        //             const _replacements2 = [STATUS_TYPE.Downloaded, request_id];
        //             await db.sequelize.query(_query1, { replacements: _replacements2, type: QueryTypes.UPDATE });

        //             // Delete the file from the server after download
        //             fs.unlink(filePath, (err) => {
        //                 if (err) console.error("Error deleting file:", err);
        //             });
        //         }
        //     });
        // } else {
        //     return res.status(404).json(success(false, res.statusCode, 'File not found.', null));
        // }
    } catch (err) {
        console.error("Error during download:", err);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const wallet_balance_pay_get = async (req, res, next) => {
    const { total_amount, user_agent, browser_language, browser_javascript_enabled, browser_tz,
        browser_color_depth, browser_java_enabled, browser_screen_height, browser_screen_width, } = req.body;
    try {
        const { CstCustomer } = getModels();

        const row = await CstCustomer.findOne({
            attributes: ['customer_id', 'developer_id', 'email_id', 'is_enabled'],
            where: { customer_id: req.token_data.customer_id, is_deleted: false }
        });
        if (row) {
            const _user_agent = (user_agent != null && user_agent.length > 0) ? user_agent : "";
            const _total_amount = total_amount != null && validator.isNumeric(total_amount.toString()) ? parseFloat(parseFloat(total_amount).toFixed(2)) : 0;
            if (_total_amount <= 0) {
                return res.status(200).json(success(false, res.statusCode, 'Please enter wallet balance amount.', null));
            }
            try {
                if (process.env.REDIS_ENABLED > 0) {
                    const paymentStatus = await redisDB.get(`payment:${req.token_data.customer_id}`);
                    if (paymentStatus === 'success') {
                        return res.status(200).json(success(false, res.statusCode, 'A recent payment was made. Please wait 5 minutes before trying again.', null));
                    }
                }
            } catch (error) {
                console.log("===========rediserror==========", error);

            }

            if (_user_agent.toLowerCase().trim() != req.headers['user-agent'].toLowerCase().trim()) {
                return res.status(200).json(success(false, res.statusCode, 'browser user agent does not matched.', null));
            }

            const temp_id = await commonModule.payment_order_id_new(); const currDate = new Date();
            if (temp_id.length <= 0) {
                return res.status(200).json(success(false, res.statusCode, 'Unable to create order id, Please try again.', null));
            }

            const order_id = Constants.proj_payment_order_id_int_prefix + temp_id.toString();
            const curr_order_date = dateFormat(Constants.payment_api_order_date_format, currDate);
            let ip = ''; try { const clientIp = requestIp.getClientIp(req); ip = clientIp; } catch { }
            const _traceid = crypto.randomUUID().toString().replaceAll('-', ''); const _timestamp = currDate.getTime().toString();
            const _browser_javascript_enabled = browser_javascript_enabled && browser_javascript_enabled.toString().toLowerCase() == 'true' ? true : false;

            let deviceObj = {
                accept_header: 'text/html', init_channel: 'internet', ip: ip,
                user_agent: user_agent, browser_language: browser_language,
                browser_javascript_enabled: _browser_javascript_enabled,
            }
            if (_browser_javascript_enabled) {
                deviceObj['browser_tz'] = browser_tz;
                deviceObj['browser_color_depth'] = browser_color_depth;
                deviceObj['browser_java_enabled'] = browser_java_enabled;
                deviceObj['browser_screen_height'] = browser_screen_height;
                deviceObj['browser_screen_width'] = browser_screen_width;
            }
            console.log(process.env.APIS_BASE_URL);

            const returnUrl = `${process.env.APIS_BASE_URL}customer/bill_desk_response`;
            console.log("================returnUrl==============", returnUrl);
            const payment_raw_object = JSON.stringify({
                orderid: order_id,
                mercid: process.env.BILL_DESK_MERCID,
                order_date: curr_order_date,
                amount: _total_amount,
                currency: '356',
                ru: returnUrl,
                itemcode: 'DIRECT',
                device: deviceObj,
            });

            console.log("================payment_raw_object================", payment_raw_object);

            const req_signature = billDeskModule.jws_hmac(payment_raw_object);

            const kvm_response = await billDeskModule.create_order(payment_raw_object, req_signature, _traceid, _timestamp);
            console.log("================kvm_response==============", kvm_response);

            if (kvm_response.status == 200) {
                const success_text = await kvm_response.text();
                const is_verified = jws.verify(success_text, "HS256", process.env.BILL_DESK_SECRETKEY);
                if (is_verified) {
                    const success_data = jws.decode(success_text);
                    if (success_data != null) {
                        const payloadData = JSON.parse(success_data.payload);
                        let _authToken = '';
                        for (const element of payloadData.links) {
                            if (element.rel == payloadData.next_step) {
                                _authToken = element.headers.authorization;
                            }
                        }

                        const _queryPayIn = `INSERT INTO cst_wallets_payment(gateway_order_id, correlation_id, wallet_id, customer_id, payment_date, total_amount,
                                        net_amount, added_by, order_id, order_date, ip_address, bd_traceid, bd_timestamp, create_order_payload_object, create_order_payload_signature, 
                                        create_order_resp_signature, create_order_resp_object, is_pg_payment, form_order_no, form_order_date, form_invoice_no, form_invoice_date)
                                        VALUES( ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, true, ?, ?, ?, ?) RETURNING "payment_id", "unique_id"`;
                        const _replPayIn = [payloadData.bdorderid, correlator.getId(), 0, req.token_data.customer_id, currDate, _total_amount,
                            _total_amount, req.token_data.account_id, order_id, curr_order_date, ip, _traceid, _timestamp, payment_raw_object,
                            req_signature, success_text, JSON.stringify(success_data), 0, currDate, '', currDate];
                        const [rowPayIn] = await db.sequelize.query(_queryPayIn, { replacements: _replPayIn, returning: true });
                        const _new_pay_id = (rowPayIn && rowPayIn.length > 0 && rowPayIn[0] ? rowPayIn[0].payment_id : 0);
                        const _new_unique_id = (rowPayIn && rowPayIn.length > 0 && rowPayIn[0] ? rowPayIn[0].unique_id : 0);
                        if (_new_pay_id > 0) {
                            let flow_config = {
                                merchantLogo: process.env.MERCHANT_LOGO,
                                merchantId: payloadData.mercid,
                                bdOrderId: payloadData.bdorderid,
                                authToken: _authToken,
                                childWindow: true,
                                returnUrl: "",
                                retryCount: Constants.proj_payment_retry_count,
                                prefs: billDeskModule.preferences,
                                netBanking: billDeskModule.net_banking,
                                payment_id: _new_unique_id,
                            };

                            const logData = {
                                traceid: _traceid, timestamp: _timestamp, order_id: order_id, payload: payment_raw_object, signature: req_signature,
                            };
                            paymentService.log_bill_desk_payment('info', ip, 'Order created and it will be send for payment.', logData);

                            return res.status(200).json(success(true, res.statusCode, '', flow_config));
                        } else {
                            return res.status(200).json(success(false, res.statusCode, 'Unable to add record, Please try again.', null));
                        }
                    } else {
                        return res.status(200).json(success(false, res.statusCode, 'Payment gateway response decoding failed.', null));
                    }
                } else {
                    return res.status(200).json(success(false, res.statusCode, 'Payment gateway response verification failed.', null));
                }
            } else {
                let error_msg = ''; let error_data = null; let tmpBody = null; let tmpRspPayload = null;
                try {
                    const error_text = await kvm_response.text(); tmpBody = error_text;
                    const is_verified = jws.verify(error_text, "HS256", process.env.BILL_DESK_SECRETKEY);
                    if (is_verified) {
                        error_data = jws.decode(error_text);
                        if (error_data != null) {
                            const payloadData = JSON.parse(error_data.payload);
                            tmpRspPayload = payloadData;
                            error_msg = payloadData != null && payloadData.message != null && payloadData.message.length > 0 ? payloadData.message : '';
                        }
                    }
                } catch (_) {
                }
                if (error_msg.length <= 0) {
                    error_msg = kvm_response.statusText;
                }

                let rspHeadersValues = {};
                if (kvm_response.headers) {
                    for (const [rhKey, rhValue] of kvm_response.headers.entries()) { rspHeadersValues[rhKey] = rhValue; }
                }

                const logData = {
                    traceid: _traceid, timestamp: _timestamp, order_id: order_id, payload: payment_raw_object, signature: req_signature,
                    resp_hdeader: rspHeadersValues, resp_err: error_msg, resp_text: tmpBody,
                    status_code: kvm_response.status, resp_payload: tmpRspPayload,
                };
                console.log("=============logData==============", logData);

                paymentService.log_bill_desk_payment('error', ip, 'Create order gateway error: ' + error_msg, logData);

                return res.status(200).json(success(false, res.statusCode, 'Payment gateway error.<br>"' + error_msg + '".', null));
            }

        } else {
            return res.status(200).json(success(false, res.statusCode, 'User details not found, please try again.', null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(200).json(success(false, res.statusCode, err.message, null));
    }
};

const wallet_balance_pay_chk = async (req, res, next) => {
    const { payment_id } = req.body;
    try {
        const _payment_id = (payment_id != null && payment_id.length > 0) ? payment_id.trim() : "";
        if (_payment_id.length > 0 && db.isUUID(_payment_id)) {
            const { CstWalletsPayment } = getModels();

            const row = await CstWalletsPayment.findOne({
                attributes: ['is_success', 'bank_ref_no', 'transactionid', 'payment_date'],
                where: { unique_id: _payment_id }
            });
            if (row) {
                const is_success = !!row.is_success;
                const results = {
                    is_success: is_success,
                    bank_ref_no: row.bank_ref_no,
                    transactionid: row.transactionid,
                    payment_date: row.payment_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(row.payment_date)) : "",
                };
                return res.status(200).json(success(true, res.statusCode, '', results));
            } else {
                return res.status(200).json(success(false, res.statusCode, 'Invalid payment id.', null));
            }
        } else {
            return res.status(200).json(success(false, res.statusCode, 'Invalid payment id.', null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(200).json(success(false, res.statusCode, err.message, null));
    }
};

const cst_wallets_balance_details_get = async (req, res, next) => {
    const { page_no, search_text, transaction_type, from_date, upto_date } = req.body;
    try {
        let _customer_id = req.token_data.customer_id;
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0;
        if (_page_no <= 0) { _page_no = 1; }
        const { CstCustomer, CstWallets } = getModels();

        const row2 = await CstCustomer.findOne({
            attributes: ['customer_id', 'first_name', 'last_name', 'wallets_amount', 'is_enabled', 'email_id'],
            where: { customer_id: _customer_id, is_deleted: false }
        });
        if (!row2) {
            return res.status(200).json(success(false, res.statusCode, "Customer details not found, Please try again.", null));
        }

        // Build where clause for wallets
        const whereClause = { customer_id: _customer_id };
        if (search_text) {
            whereClause.description = { [Op.iLike]: `%${search_text}%` };
        }
        if (transaction_type) {
            whereClause.transaction_type = transaction_type;
        }
        if (from_date) {
            whereClause.added_date = { ...(whereClause.added_date || {}), [Op.gte]: new Date(from_date) };
        }
        if (upto_date) {
            const existingCondition = whereClause.added_date || {};
            whereClause.added_date = { ...existingCondition, [Op.lte]: new Date(upto_date + 'T23:59:59') };
        }

        const total_record = await CstWallets.count({ where: whereClause });

        const row3 = await CstWallets.findAll({
            attributes: ['wallet_id', 'amount', 'previous_amount', 'added_date', 'transaction_type', 'description'],
            where: whereClause,
            order: [['wallet_id', 'DESC']],
            limit: parseInt(process.env.PAGINATION_SIZE),
            offset: (_page_no - 1) * parseInt(process.env.PAGINATION_SIZE)
        });

        let _wallets_data = [];
        if (row3 && row3.length > 0) {
            row3.forEach((item, index) => {
                _wallets_data.push({
                    sr_no: ((_page_no - 1) * parseInt(process.env.PAGINATION_SIZE)) + index + 1,
                    amount: item.amount,
                    previous_amount: item.previous_amount,
                    transaction_type: item.transaction_type == 1 ? "Credited" : "Debited",
                    description: item.description,
                    added_date: item.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.added_date)) : "",
                });
            });
        }
        const results = {
            current_page: _page_no,
            total_pages: Math.ceil(total_record / process.env.PAGINATION_SIZE) || '',
            first_name: row2.first_name,
            last_name: row2.last_name,
            email_id: row2.email_id,
            total_wallets_amount: row2.wallets_amount,
            data: _wallets_data,
        };
        return res.status(200).json(success(true, res.statusCode, "Wallets Amount Data.", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const cst_wallets_balance_get = async (req, res, next) => {
    const { developer_id } = req.body;
    try {
        const _developer_id = (developer_id != null && developer_id.length > 0) ? developer_id : "";
        if (_developer_id <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter a valid developer ID ", null));
        }
        const { CstCustomer } = getModels();

        const row2 = await CstCustomer.findOne({
            attributes: ['customer_id', 'first_name', 'last_name', 'developer_id', 'wallets_amount', 'email_id'],
            where: { developer_id: _developer_id, is_deleted: false }
        });
        if (!row2) {
            return res.status(200).json(success(false, res.statusCode, "Customer details not found, Please try again.", null));
        }
        const results = {
            first_name: row2.first_name,
            last_name: row2.last_name,
            email_id: row2.email_id,
            developer_id: row2.developer_id,
            wallets_amount: row2.wallets_amount,
        };

        return res.status(200).json(success(true, res.statusCode, "Wallets Amount Data.", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const wallets_details_export = async (req, res, next) => {
    const { search_text, transaction_type, from_date, upto_date } = req.body;

    try {
        const { CstCustomer, CstWallets } = getModels();

        const _row1 = await CstCustomer.findOne({
            attributes: ['wallets_amount'],
            where: { customer_id: req.token_data.customer_id }
        });
        if (!_row1) {
            return res.status(200).json(success(false, res.statusCode, "Customer details not found, Please try again.", null));
        }

        // Build where clause for wallets
        const whereClause = { customer_id: req.token_data.customer_id };
        if (search_text) {
            whereClause.description = { [Op.iLike]: `%${search_text}%` };
        }
        if (transaction_type) {
            whereClause.transaction_type = transaction_type;
        }
        if (from_date) {
            whereClause.added_date = { ...(whereClause.added_date || {}), [Op.gte]: new Date(from_date) };
        }
        if (upto_date) {
            const existingCondition = whereClause.added_date || {};
            whereClause.added_date = { ...existingCondition, [Op.lte]: new Date(upto_date + 'T23:59:59') };
        }

        const row3 = await CstWallets.findAll({
            attributes: ['wallet_id', 'amount', 'added_date', 'transaction_type', 'description'],
            where: whereClause,
            order: [['wallet_id', 'DESC']]
        });

        const workbook = new excel.Workbook();
        const worksheet = workbook.addWorksheet('Sheet 1');
        const headers = ['Sr No', 'Transaction Date', 'Amount', 'Transaction Type', 'Description'];
        const headerRow = worksheet.addRow(headers);
        headerRow.eachCell((cell, colNumber) => {
            cell.font = { bold: true };
        });

        if (row3 && row3.length > 0) {
            row3.forEach((item, index) => {
                const rowValues = [
                    index + 1,
                    item.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.added_date)) : "",
                    item.amount,
                    item.transaction_type == 1 ? "Credited" : "Debited",
                    item.description
                ];
                worksheet.addRow(rowValues);
            });
        }

        const excelBuffer = await workbook.xlsx.writeBuffer();
        res.setHeader('Content-Length', excelBuffer.length);
        res.send(excelBuffer);
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const customer_apigee_balance_update = async (req, res, next) => {
    try {
        let _customer_id = req.token_data.customer_id && validator.isNumeric(req.token_data.customer_id.toString()) ? parseInt(req.token_data.customer_id) : 0;
        const { CstCustomer } = getModels();

        const row1 = await CstCustomer.findOne({
            attributes: ['customer_id', 'developer_id', 'is_enabled', 'email_id', 'billing_type'],
            where: { customer_id: req.token_data.customer_id, is_deleted: false }
        });
        if (!row1) {
            return res.status(200).json(success(false, res.statusCode, "Customer details not found, Please try again.", null));
        }
        if (!row1.developer_id && row1.developer_id <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Unable to process. Please try again ", null));
        }
        await db.get_apigee_wallet_balance(req.token_data.customer_id);

        return res.status(200).json(success(true, res.statusCode, "Apigee wallet balance fetch success.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const app_list_rate_get = async (req, res, next) => {
    const { app_id } = req.body;
    try {
        let _app_id = app_id && validator.isNumeric(app_id.toString()) ? parseInt(app_id) : 0;
        const { CstAppMast, CstCustomer, CstAppProduct, Product, ProductMonitazationRate } = getModels();

        const row = await CstAppMast.findOne({
            attributes: ['app_id', 'customer_id', 'app_name', 'in_live_env'],
            where: { app_id: _app_id, is_deleted: false },
            include: [{
                model: CstCustomer,
                as: 'customer',
                attributes: ['email_id'],
                required: true
            }]
        });
        if (!row) {
            return res.status(200).json(success(false, res.statusCode, "App details not found.", null));
        }

        const appData = await CstAppMast.findOne({
            attributes: ['app_wallet_rate_data'],
            where: { app_id: _app_id }
        });

        const row2 = await CstAppProduct.findAll({
            attributes: ['product_id'],
            where: { app_id: _app_id },
            include: [{
                model: Product,
                as: 'product',
                attributes: ['product_id', 'product_name', 'description', 'key_features', 'rate_plan_value', 'monitization_rate_id'],
                include: [{
                    model: ProductMonitazationRate,
                    as: 'monitizationRate',
                    attributes: ['consumption_pricing_type', 'consumption_pricing_rates'],
                    required: false
                }]
            }]
        });

        let products = []; let app_rateValue = '';
        if (row2) {
            for (const appProduct of row2) {
                const item = appProduct.product;
                if (!item) continue;

                const product_pricing_rates = db.convertStringToJson(item.monitizationRate?.consumption_pricing_rates);
                const app_wallet_rate_data = db.convertStringToJson(appData?.app_wallet_rate_data);
                if (app_wallet_rate_data) {
                    for (const rate of app_wallet_rate_data) {
                        const rateName = rate.name.replace("rateMultiper-", "").toLowerCase().trim();
                        if (rateName === item.product_name.toLowerCase().trim()) {
                            app_rateValue = rate.value;
                            break;
                        }
                    }
                }
                let consumption_pricing_rates = product_pricing_rates;
                if (item.monitizationRate?.consumption_pricing_type === 'FIXED_PER_UNIT') {
                    consumption_pricing_rates = app_rateValue ? consumption_pricing_rates[0]?.fee?.units * app_rateValue : consumption_pricing_rates[0]?.fee?.units * item.rate_plan_value;
                }
                products.push({
                    product_id: item.product_id,
                    product_name: item.product_name,
                    consumption_pricing_type: item.monitizationRate?.consumption_pricing_type,
                    consumption_pricing_rates: consumption_pricing_rates,
                    app_rate_value: app_rateValue && app_rateValue.length > 0 ? app_rateValue : item.rate_plan_value,
                });
            }
        }
        const results = { products: products };
        return res.status(200).json(success(true, res.statusCode, "My Apps Product Rate Data.", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

export default {
    contact_us_form,
    contact_us_save,
    send_activation_link,
    refresh_token,
    token_data,
    logout,
    dashboard,
    my_profile,
    profile_get,
    profile_set,
    change_password,
    logout_all_sessions,
    sessions_get,
    live_mode_toggle,
    live_mode_get,
    app_new,
    app_products,
    my_app_list_get,
    app_update,
    cust_app_del,
    my_app_edit_get,
    create_app_data,
    get_started_get,
    move_to_production,
    test_upload,
    analytics,
    live_sandbox_product,
    live_sandbox_proxies,
    live_proxy_data,
    live_play_api,
    credit_details_get,
    user_details,
    credit_details_export,
    send_mail_existing_user_to_sandbox,
    analytics_reports_get,
    analytics_reports_export,
    cst_analytics_reports_generate_excel,
    cst_analytics_reports_download,
    wallet_balance_pay_get,
    wallet_balance_pay_chk,
    cst_wallets_balance_details_get,
    cst_wallets_balance_get,
    wallets_details_export,
    customer_apigee_balance_update,
    app_list_rate_get,
    sendSignUpMail
};
