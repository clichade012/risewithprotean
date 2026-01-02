import { logger as _logger, action_logger } from '../../logger/winston.js';
import db from '../../database/db_helper.js';
import { QueryTypes, Op } from 'sequelize';
import { success } from "../../model/responseModel.js";
import dateFormat from 'date-format';
import validator from 'validator';
import { EmailTemplates, API_STATUS, STATUS_TYPE } from "../../model/enumModel.js";
import emailTransporter from "../../services/emailService.js";
import bcrypt from 'bcryptjs';
import excel from 'exceljs';
import { fetch } from 'cross-fetch';
import correlator from 'express-correlation-id';
import { rsa_decrypt } from "../../services/rsaEncryption.js";
import customerService from '../../services/customerService.js';
import { PassThrough } from 'stream';
import moment from 'moment';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import commonModule from "../../modules/commonModule.js";

// Helper: Parse numeric ID from input
const parseNumericId = (value) => {
    return value && validator.isNumeric(value.toString()) ? parseInt(value) : 0;
};

// Helper: Log customer action
const logCustomerAction = (tokenData, narration, query) => {
    try {
        const data_to_log = {
            correlation_id: correlator.getId(),
            token_id: tokenData.token_id,
            account_id: tokenData.account_id,
            user_type: 1,
            user_id: tokenData.admin_id,
            narration,
            query: typeof query === 'string' ? query : JSON.stringify(query),
            date_time: db.get_ist_current_date(),
        };
        action_logger.info(JSON.stringify(data_to_log));
    } catch (_) { /* ignore logging errors */ }
};

// Helper: Create Apigee developer
const createApigeeDeveloper = async (customerData) => {
    const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers`;
    const data = {
        firstName: customerData.first_name,
        lastName: customerData.last_name,
        userName: customerData.email_id,
        email: customerData.email_id
    };
    const apigeeAuth = await db.get_apigee_token();
    const response = await fetch(product_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    return response.json();
};

// Helper: Replace email template tags
const replaceEmailTags = (text, customerData) => {
    let result = text;
    result = result.replaceAll(process.env.EMAIL_TAG_FIRST_NAME, customerData.first_name);
    result = result.replaceAll(process.env.EMAIL_TAG_LAST_NAME, customerData.last_name);
    result = result.replaceAll(process.env.EMAIL_TAG_EMAIL_ID, customerData.email_id);
    result = result.replaceAll(process.env.EMAIL_TAG_MOBILE_NO, customerData.mobile_no);
    result = result.replaceAll(process.env.SITE_URL_TAG, process.env.FRONT_SITE_URL);
    return result;
};

// Helper: Toggle Apigee developer status
const toggleApigeeDeveloperStatus = async (developer_id, isEnabled) => {
    const dev_status = isEnabled ? 'inactive' : 'active';
    const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers/${developer_id}?action=${dev_status}`;
    const apigeeAuth = await db.get_apigee_token();
    return fetch(product_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/octet-stream" },
    });
};

// Helper: Delete Apigee developer
const deleteApigeeDeveloper = async (email_id) => {
    const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers/${email_id}`;
    const apigeeAuth = await db.get_apigee_token();
    const response = await fetch(product_URL, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${apigeeAuth}` },
    });
    const responseData = await response.json();
    return { status: response.status, data: responseData };
};

// Helper: Delete customer apps from Apigee
const deleteCustomerAppsFromApigee = async (apps, email_id) => {
    for (const app of apps) {
        if (app.apigee_app_id?.length > 0) {
            const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers/${email_id}/apps/${app.app_name}`;
            const apigeeAuth = await db.get_apigee_token();
            await fetch(product_URL, { method: "DELETE", headers: { Authorization: `Bearer ${apigeeAuth}` } });
        }
    }
};

// Helper: Soft delete customer and related records
const softDeleteCustomerRecords = async (models, customer_id, tokenData, email_id) => {
    const { CstCustomer, CstAppMast, CstToken } = models;

    const [affectedRows] = await CstCustomer.update(
        { is_deleted: true, modify_date: db.get_ist_current_date(), modify_by: tokenData.account_id },
        { where: { customer_id } }
    );

    if (affectedRows <= 0) return false;

    await CstAppMast.update({ is_deleted: true }, { where: { customer_id, is_deleted: false } });
    await CstToken.update({ is_logout: true, logout_time: db.get_ist_current_date() }, { where: { customer_id, is_logout: false } });

    logCustomerAction(tokenData, `Customer deleted. Customer email = ${email_id}`, `CstCustomer.update({ is_deleted: true }, { where: { customer_id: ${customer_id} }})`);
    return true;
};

// Helper: Validate required string field
const validateRequiredString = (value, fieldName, maxLength = 0) => {
    if (!value?.length) return `Please enter ${fieldName}.`;
    if (maxLength > 0 && value.length > maxLength) return `${fieldName} should not be more than ${maxLength} character`;
    return null;
};

// Helper: Validate required numeric field
const validateRequiredNumeric = (value, fieldName) => {
    if (!value || !validator.isNumeric(value.toString()) || value <= 0) return `Please select ${fieldName}.`;
    return null;
};

// Helper: Validate registration fields
const validateRegistrationFields = (data, res) => {
    const { first_name, last_name, network_id, mobile_no, email_id, industry_id, company_name } = data;

    const validations = [
        validateRequiredString(first_name, 'first name', 30),
        validateRequiredString(last_name, 'last name', 30),
        validateRequiredNumeric(network_id, 'country code'),
        validateRequiredString(mobile_no, 'mobile number'),
        (!validator.isNumeric(mobile_no || '') || mobile_no?.length !== 10) ? 'Invalid mobile number.' : null,
        validateRequiredString(email_id, 'email address'),
        (email_id?.length > 0 && !validator.isEmail(email_id)) ? 'Invalid email address.' : null,
        validateRequiredNumeric(industry_id, 'business category'),
        validateRequiredString(company_name, 'company name'),
    ];

    const errorMsg = validations.find(v => v !== null);
    if (errorMsg) {
        return { valid: false, response: res.status(200).json(success(false, res.statusCode, errorMsg, null)) };
    }
    return { valid: true };
};

// Helper: Validate password requirements
const validatePassword = (password, res) => {
    if (!password || password.length <= 0) {
        return { valid: false, response: res.status(200).json(success(false, res.statusCode, "Please enter password.", null)) };
    }
    if (password.length < 8) {
        return { valid: false, response: res.status(200).json(success(false, res.statusCode, "The password must contain atleast 8 characters.", null)) };
    }
    if (!/\d/.test(password)) {
        return { valid: false, response: res.status(200).json(success(false, res.statusCode, "The password must contain a number.", null)) };
    }
    if (!/[`!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~]/.test(password)) {
        return { valid: false, response: res.status(200).json(success(false, res.statusCode, "The password must contain a special character.", null)) };
    }
    return { valid: true };
};

// Helper: Check duplicate email/mobile
const checkDuplicateCustomer = async (CstCustomer, email_id, mobile_no, res) => {
    const emailExists = await CstCustomer.findOne({
        where: { email_id, is_deleted: false },
        attributes: ['customer_id'],
        raw: true
    });
    if (emailExists) {
        return { exists: true, response: res.status(200).json(success(false, res.statusCode, "Email address is already registered.", null)) };
    }

    const mobileExists = await CstCustomer.findOne({
        where: { mobile_no, is_deleted: false },
        attributes: ['customer_id'],
        raw: true
    });
    if (mobileExists) {
        return { exists: true, response: res.status(200).json(success(false, res.statusCode, "Mobile number is already registered.", null)) };
    }
    return { exists: false };
};

// Helper: Validate analytics date range
const validateAnalyticsDateRange = (from_date, upto_date) => {
    if (!from_date || from_date.length <= 0 || !validator.isDate(from_date)) {
        return { valid: false, message: "Please select a valid from date." };
    }
    if (!upto_date || upto_date.length <= 0 || !validator.isDate(upto_date)) {
        return { valid: false, message: "Please select a valid upto date." };
    }
    const fromDateMoment = moment(from_date);
    const uptoDateMoment = moment(upto_date);
    const dateDifference = uptoDateMoment.diff(fromDateMoment, 'days');
    if (dateDifference > 32) {
        return { valid: false, message: "Date range should not be greater than 31 days." };
    }
    return { valid: true };
};

// Helper: Get user role name
const getUserRoleName = async (admin_id) => {
    const query = `SELECT r.role_name FROM adm_user a INNER JOIN adm_role r ON a.role_id = r.role_id WHERE a.admin_id = ?`;
    const rows = await db.sequelize.query(query, { replacements: [admin_id], type: QueryTypes.SELECT });
    return rows?.[0]?.role_name || '';
};

// Helper: Get customer developer info
const getCustomerDeveloperInfo = async (customer_id) => {
    if (customer_id <= 0) return { developerId: '', emailId: '' };
    const query = `SELECT developer_id, email_id FROM cst_customer WHERE customer_id = ? AND is_deleted = false`;
    const rows = await db.sequelize.query(query, { replacements: [customer_id], type: QueryTypes.SELECT });
    if (rows?.length > 0) {
        return { developerId: rows[0].developer_id || '', emailId: rows[0].email_id || '' };
    }
    return { developerId: '', emailId: '' };
};

// Helper: Prepare analytics date filters (converts to UTC)
const prepareAnalyticsDateFilters = (from_date, upto_date) => {
    const from_dateTime = '18:30:00.000 UTC';
    const to_dateTime = '18:29:59.999 UTC';
    let previousFromDate = '';
    if (from_date) {
        const date = new Date(from_date);
        date.setDate(date.getDate() - 1);
        previousFromDate = date.toISOString().split('T')[0];
    }
    return {
        fromDate: previousFromDate + ' ' + from_dateTime,
        uptoDate: upto_date + ' ' + to_dateTime
    };
};

// Helper: Build analytics query conditions
const buildAnalyticsQueryConditions = (params) => {
    const { developerId, emailId, searchText, productId, fromDate, uptoDate, useEmailFilter } = params;
    const conditions = [];
    const replacements = {};

    if (useEmailFilter && emailId?.length > 0) {
        conditions.push(` developer_email = :email_id`);
        replacements.email_id = emailId;
    } else if (developerId?.length > 0) {
        conditions.push(` REPLACE(developer, 'apigeeprotean@@@', '') = :developerId`);
        replacements.developerId = developerId;
    }
    if (searchText?.length > 0) {
        conditions.push(` developer_email ILIKE :search_text`);
        replacements.search_text = `%${searchText}%`;
    }
    if (productId?.length > 0) {
        conditions.push(` dc_api_product ILIKE :product_id `);
        replacements.product_id = `%${productId}%`;
    }
    if (fromDate) {
        conditions.push(` ax_created_time >= :from_date`);
        replacements.from_date = fromDate;
    }
    if (uptoDate) {
        conditions.push(` ax_created_time <= :upto_date`);
        replacements.upto_date = uptoDate;
    }
    return { conditions, replacements };
};

// Helper: Get analytics export headers
const getAnalyticsExportHeaders = (isAdmin) => {
    if (isAdmin) {
        return [
            'Sr No', 'Developer', 'Developer Email', 'API Product', 'Target URL', 'Target Host',
            'Target Response Code', 'DC API Name', 'DC API Product', 'DC API Request ID', 'DC Case ID',
            'DC Req Path', 'Developer App', 'Request Path', 'Total Response Time', 'Request Processing Latency',
            'Response Processing Latency', 'Karza Status Code', 'Response Description', 'ID Field from Signzy Response',
            'Response Status Code', 'Target Response Time', 'Client Received End Timestamp', 'Target Sent End Timestamp',
            'Target Received End Timestamp', 'Client Sent End Timestamp', 'Client Received End Timestamp (IST)',
            'Target Sent End Timestamp (IST)', 'Target Received End Timestamp (IST)', 'Client Sent End Timestamp (IST)'
        ];
    }
    return [
        'Sr No', 'Developer', 'Developer Email', 'API Product', 'DC API Name', 'Request URI',
        'Target Response Code', 'Total Response Time', 'DC Case ID', 'Response Status Code',
        'Target Response Time', 'Target Sent Start Timestamp', 'Target Received End Timestamp',
        'Target Sent Start Timestamp (IST)', 'Target Received End Timestamp (IST)'
    ];
};

// Helper: Map analytics row for export
const mapAnalyticsRowForExport = (row, isAdmin) => {
    if (isAdmin) {
        return [
            row.sr_no, row.developer, row.developer_email, row.api_product, row.target_url, row.target_host,
            row.target_response_code, row.dc_api_name, row.dc_api_product, row.dc_api_request_id, row.dc_case_id,
            row.dc_req_path, row.developer_app, row.request_path, row.total_response_time, row.request_processing_latency,
            row.response_processing_latency, row.karza_status_code || '', row.response_description || '',
            row.id_field_from_signzy_response || '', row.response_status_code, row.target_response_time,
            row.client_received_end_timestamp, row.target_sent_end_timestamp, row.target_received_end_timestamp,
            row.client_sent_end_timestamp, db.convertUTCtoIST(row.client_received_end_timestamp),
            db.convertUTCtoIST(row.target_sent_end_timestamp), db.convertUTCtoIST(row.target_received_end_timestamp),
            db.convertUTCtoIST(row.client_sent_end_timestamp)
        ];
    }
    return [
        row.sr_no, row.developer, row.developer_email, row.api_product, row.dc_api_name, row.request_uri,
        row.target_response_code, row.total_response_time, row.dc_case_id, row.response_status_code,
        row.target_response_time, row.target_sent_start_timestamp, row.target_received_end_timestamp,
        db.convertUTCtoIST(row.target_sent_start_timestamp), db.convertUTCtoIST(row.target_received_end_timestamp)
    ];
};

// Helper: Get analytics generate headers (for file generation)
const getAnalyticsGenerateHeaders = (isAdmin) => {
    if (isAdmin) {
        return [
            'Sr No', 'Developer', 'Developer Email', 'API Product', 'Target URL', 'Target Host', 'Target Response Code',
            'DC API Name', 'DC API Product', 'DC API Request ID', 'DC Case ID', 'DC Req Path', 'Developer App', 'Request Path',
            'Total Response Time', 'Request Processing Latency', 'Response Processing Latency', 'Karza Status Code',
            'Response Description', 'ID Field from Signzy Response', 'Response Status Code', ' Price Multiplier',
            'Final Rate', 'Rate Plan Rate', 'Billing Type', 'Target Response Time',
            'Client Received End Timestamp', 'Target Sent End Timestamp', 'Target Received End Timestamp',
            'Client Sent End Timestamp', 'Client Received End Timestamp (IST)', 'Target Sent End Timestamp (IST)',
            'Target Received End Timestamp (IST)', 'Client Sent End Timestamp (IST)'
        ];
    }
    return [
        'Sr No', 'Developer', 'Developer Email', 'API Product', 'Target Host', 'Target Response Code', 'DC API Name',
        'DC API Product', 'DC Case ID', 'Request Path', 'Total Response Time', 'Karza Status Code', 'Response Description',
        'ID Field from Signzy Response', 'Response Status Code', ' Price Multiplier', 'Final Rate', 'Rate Plan Rate', 'Billing Type', 'Target Response Time', 'Client Received End Timestamp',
        'Target Sent End Timestamp', 'Target Received End Timestamp', 'Client Sent End Timestamp',
        'Client Received End Timestamp (IST)', 'Target Sent End Timestamp (IST)', 'Target Received End Timestamp (IST)',
        'Client Sent End Timestamp (IST)'
    ];
};

// Helper: Map analytics row for file generation
const mapAnalyticsRowForGenerate = (row, isAdmin) => {
    if (isAdmin) {
        return [
            row.sr_no, row.developer, row.developer_email, row.api_product, row.target_url, row.target_host,
            row.target_response_code, row.dc_api_name, row.dc_api_product, row.dc_api_request_id, row.dc_case_id,
            row.dc_req_path, row.developer_app, row.request_path, row.total_response_time, row.request_processing_latency,
            row.response_processing_latency, row.karza_status_code || '', row.response_description || '',
            row.id_field_from_signzy_response || '', row.response_status_code, row.x_apigee_mintng_price_multiplier,
            row.x_apigee_mintng_rate, row.rate_plan_rate, row.dc_billing_type, row.target_response_time,
            row.client_received_end_timestamp, row.target_sent_end_timestamp, row.target_received_end_timestamp,
            row.client_sent_end_timestamp, db.convertUTCtoIST(row.client_received_end_timestamp),
            db.convertUTCtoIST(row.target_sent_end_timestamp), db.convertUTCtoIST(row.target_received_end_timestamp),
            db.convertUTCtoIST(row.client_sent_end_timestamp)
        ];
    }
    return [
        row.sr_no, row.developer, row.developer_email, row.api_product, row.target_host,
        row.target_response_code, row.dc_api_name, row.dc_api_product, row.dc_case_id,
        row.request_path, row.total_response_time, row.karza_status_code || '', row.response_description || '',
        row.id_field_from_signzy_response || '', row.response_status_code, '',
        '', '', row.dc_billing_type, row.target_response_time,
        row.client_received_end_timestamp, row.target_sent_end_timestamp, row.target_received_end_timestamp,
        row.client_sent_end_timestamp, db.convertUTCtoIST(row.client_received_end_timestamp),
        db.convertUTCtoIST(row.target_sent_end_timestamp), db.convertUTCtoIST(row.target_received_end_timestamp),
        db.convertUTCtoIST(row.client_sent_end_timestamp)
    ];
};

// Helper: Build analytics query conditions for file generation (slightly different from export)
const buildAnalyticsGenerateConditions = (params) => {
    const { emailId, searchText, productId, fromDate, uptoDate, fromDateRaw, uptoDateRaw } = params;
    const conditions = [];
    const replacements = {};

    if (emailId?.length > 0) {
        conditions.push(` developer_email = :email_id`);
        replacements.email_id = emailId;
    }
    if (searchText?.length > 0) {
        conditions.push(` target_host ILIKE :search_text`);
        replacements.search_text = `%${searchText}%`;
    }
    if (productId?.length > 0) {
        conditions.push(` api_product = :product_id `);
        replacements.product_id = productId;
    }
    if (fromDateRaw) {
        conditions.push(` ax_created_time >= :from_date`);
        replacements.from_date = fromDate;
    }
    if (uptoDateRaw) {
        conditions.push(` ax_created_time <= :upto_date`);
        replacements.upto_date = uptoDate;
    }
    return { conditions, replacements };
};

// Helper: Get analytics base query for export
const getAnalyticsExportQuery = (tableName) => {
    return `SELECT ROW_NUMBER() OVER(ORDER BY id DESC) AS sr_no,
        id, organization, environment, apiproxy, request_uri, proxy, proxy_basepath, request_size, response_status_code,
        is_error, client_received_start_timestamp, client_received_end_timestamp, target_sent_start_timestamp, target_sent_end_timestamp,
        target_received_start_timestamp, target_received_end_timestamp, client_sent_start_timestamp, client_sent_end_timestamp, client_ip,
        client_id, REPLACE(developer, 'apigeeprotean@@@', '') AS developer, developer_app, api_product, flow_resource, target, target_url,
        target_host, proxy_client_ip, target_basepath, target_ip, request_path, response_size, developer_email, virtual_host, message_count,
        total_response_time, request_processing_latency, response_processing_latency, target_response_time,
        target_response_code, target_error, policy_error, ax_created_time, dc_api_product, dc_api_resource,
        dc_developer_app, dc_developer_app_display_name, dc_developer_email, dc_flow_type, dc_response_code_gateway,
        dc_api_name, dc_api_request_id, dc_case_id, dc_req_path,
        dc_target_req_path FROM ${tableName}`;
};

// Helper: Get analytics base query for file generation
const getAnalyticsGenerateQuery = (tableName) => {
    return `SELECT ROW_NUMBER() OVER(ORDER BY ax_created_time DESC) AS sr_no,
        id, organization, environment, apiproxy, request_uri, proxy, response_status_code,
        is_error, client_received_start_timestamp, client_received_end_timestamp, target_sent_start_timestamp, target_sent_end_timestamp,
        target_received_start_timestamp, target_received_end_timestamp, client_sent_start_timestamp, client_sent_end_timestamp, client_ip,
        client_id, REPLACE(developer, 'apigeeprotean@@@', '') AS developer, developer_app, api_product, target, target_url,
        target_host, proxy_client_ip, target_basepath, target_ip, request_path, developer_email, total_response_time, request_processing_latency,
        response_processing_latency, target_response_time, target_response_code, ax_created_time, dc_api_product, dc_api_resource,
        dc_developer_app, dc_developer_app_display_name, dc_developer_email, dc_api_name, dc_api_request_id, dc_case_id,
        dc_req_path, dc_karzastauscode AS karza_status_code, dc_backendstatusreason AS response_description,
        dc_signzyresponseid AS id_field_from_signzy_response, x_apigee_mintng_price_multiplier, x_apigee_mintng_rate,
        x_apigee_mintng_rate::FLOAT / NULLIF(x_apigee_mintng_price_multiplier::FLOAT, 0) AS rate_plan_rate, dc_billing_type FROM ${tableName}`;
};

// Helper: Log analytics file request
const logAnalyticsFileRequest = (tokenData, requestId, query, replacements) => {
    try {
        const data_to_log = {
            correlation_id: correlator.getId(),
            token_id: 0,
            account_id: tokenData.account_id,
            user_type: 2,
            user_id: tokenData.account_id,
            narration: 'excel genrate with requestid:' + requestId,
            query: db.buildQuery_Array(query, replacements),
        };
        action_logger.info(JSON.stringify(data_to_log));
    } catch (_) { /* ignore logging errors */ }
};

// Helper: Update analytics file status
const updateAnalyticsFileStatus = async (requestId, status) => {
    const query = `UPDATE analytics_file_object SET status = ? WHERE request_id = ?`;
    await db.sequelize.query(query, { replacements: [status, requestId], type: QueryTypes.UPDATE });
};

// Helper: Update Apigee developer billing type
const updateApigeeBillingType = async (email_id, billing_type) => {
    const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers/${email_id}/monetizationConfig`;
    const apigeeAuth = await db.get_apigee_token();
    const response = await fetch(product_URL, {
        method: "PUT",
        headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json" },
        body: JSON.stringify({ billingType: billing_type }),
    });
    return response.status;
};

// Helper: Process and write analytics rows to worksheet
const writeAnalyticsRowsToWorksheet = (pageData, worksheet, isAdmin, mapFunction) => {
    const processData = pageData.map(row => mapFunction(row, isAdmin));
    processData.forEach(rowData => {
        try {
            worksheet.addRow(rowData).commit();
        } catch (err) {
            console.log("Error adding row to worksheet:", err);
        }
    });
};

// Helper: Process Excel rows with sheet management
const processExcelRowsWithSheetManagement = (pageData, context) => {
    const { workbook, isAdmin, maxRowsPerSheet, addHeaders } = context;
    let { worksheet, sheetIndex, currentRow } = context;

    for (const row of pageData) {
        if (currentRow >= maxRowsPerSheet) {
            worksheet.commit();
            sheetIndex++;
            worksheet = workbook.addWorksheet(`Sheet ${sheetIndex}`);
            addHeaders(worksheet);
            currentRow = 0;
        }
        try {
            worksheet.addRow(mapAnalyticsRowForGenerate(row, isAdmin)).commit();
            currentRow++;
        } catch (err) {
            console.log("Error adding row to worksheet:", err);
        }
    }
    return { worksheet, sheetIndex, currentRow };
};

const customer_search_list = async (req, res, next) => {
    const { page_no, search_text } = req.body;
    try {
        const { CstCustomer, MobileNetwork, Industry, AdmUser } = db.models;

        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0;
        if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";

        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);

        const pageSize = parseInt(process.env.PAGINATION_SIZE);
        const offset = (_page_no - 1) * pageSize;

        // Build where clause
        const whereClause = {
            is_deleted: false,
            ..._search_text && {
                [Op.or]: [
                    { email_id: { [Op.iLike]: `%${_search_text}%` } },
                    { mobile_no: { [Op.iLike]: `%${_search_text}%` } }
                ]
            }
        };

        // Get total count
        const total_record = await CstCustomer.count({ where: whereClause });

        // Get paginated list with associations
        const rows = await CstCustomer.findAll({
            where: whereClause,
            include: [
                {
                    model: MobileNetwork,
                    as: 'mobileNetwork',
                    attributes: ['network_code'],
                    required: false
                },
                {
                    model: Industry,
                    as: 'industry',
                    attributes: ['industry_name'],
                    required: false
                },
                {
                    model: AdmUser,
                    as: 'addedByUser',
                    attributes: ['first_name', 'last_name'],
                    required: false
                }
            ],
            order: [['customer_id', 'DESC']],
            limit: pageSize,
            offset: offset
        });

        const list = rows.map((item, index) => ({
            sr_no: offset + index + 1,
            id: item.customer_id,
            company_name: item.company_name,
            first_name: item.first_name,
            last_name: item.last_name,
            email_id: item.email_id,
            mobile_no: item.mobile_no,
            industry_name: item.industry?.industry_name || '',
            register_date: item.register_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.register_date)) : "",
            is_enabled: item.is_enabled,
            is_approved: item.is_approved,
            total_credits: item.total_credits,
            wallets_amount: item.wallets_amount,
            is_live_sandbox: item.is_live_sandbox,
            approved_date: item.approved_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.approved_date)) : "",
            is_activated: item.is_activated,
            activated_date: item.activated_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.activated_date)) : "",
            added_by: item.addedByUser ? `${item.addedByUser.first_name || ''} ${item.addedByUser.last_name || ''}`.trim() : '',
            is_for_sandbox: item.is_for_sandbox,
            is_from_admin: item.is_from_admin,
            billing_type: item.billing_type || 'POSTPAID',
            sandbox_added_date: item.sandbox_added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.sandbox_added_date)) : "",
            billing_type_modified_date: item.billing_type_modified_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.billing_type_modified_date)) : "",
        }));

        const results = {
            current_page: _page_no,
            total_pages: Math.ceil(total_record / pageSize),
            data: list,
            is_admin: is_admin,
            is_maker: is_maker,
            is_checker: is_checker,
        };
        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const customer_to_approve = async (req, res, next) => {
    const { page_no, search_text } = req.body;
    try {
        const { CstCustomer, MobileNetwork, Industry } = db.models;

        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0;
        if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";

        const pageSize = parseInt(process.env.PAGINATION_SIZE);
        const offset = (_page_no - 1) * pageSize;

        // Build where clause for pending approval
        const whereClause = {
            is_deleted: false,
            is_approved: { [Op.lte]: 0 },
            ..._search_text && {
                [Op.or]: [
                    { email_id: { [Op.iLike]: `%${_search_text}%` } },
                    { mobile_no: { [Op.iLike]: `%${_search_text}%` } }
                ]
            }
        };

        // Get total count
        const total_record = await CstCustomer.count({ where: whereClause });

        // Get paginated list
        const rows = await CstCustomer.findAll({
            where: whereClause,
            include: [
                {
                    model: MobileNetwork,
                    as: 'mobileNetwork',
                    attributes: ['network_code'],
                    required: false
                },
                {
                    model: Industry,
                    as: 'industry',
                    attributes: ['industry_name'],
                    required: false
                }
            ],
            order: [['customer_id', 'DESC']],
            limit: pageSize,
            offset: offset
        });

        const list = rows.map((item, index) => ({
            sr_no: offset + index + 1,
            id: item.customer_id,
            company_name: item.company_name,
            first_name: item.first_name,
            last_name: item.last_name,
            email_id: item.email_id,
            mobile_no: item.mobile_no,
            industry_name: item.industry?.industry_name || '',
            register_date: item.register_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.register_date)) : "",
            is_enabled: item.is_enabled,
            is_approved: item.is_approved,
            approved_date: item.approved_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.approved_date)) : "",
            is_activated: item.is_activated,
            activated_date: item.activated_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.activated_date)) : "",
        }));

        const results = {
            current_page: _page_no,
            total_pages: Math.ceil(total_record / pageSize),
            data: list,
        };
        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const customer_to_activate = async (req, res, next) => {
    const { page_no, search_text } = req.body;
    try {
        const { CstCustomer, MobileNetwork, Industry } = db.models;

        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0;
        if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";

        const pageSize = parseInt(process.env.PAGINATION_SIZE);
        const offset = (_page_no - 1) * pageSize;

        // Build where clause for pending activation
        const whereClause = {
            is_deleted: false,
            is_activated: { [Op.lte]: 0 },
            ..._search_text && {
                [Op.or]: [
                    { email_id: { [Op.iLike]: `%${_search_text}%` } },
                    { mobile_no: { [Op.iLike]: `%${_search_text}%` } }
                ]
            }
        };

        // Get total count
        const total_record = await CstCustomer.count({ where: whereClause });

        // Get paginated list
        const rows = await CstCustomer.findAll({
            where: whereClause,
            include: [
                {
                    model: MobileNetwork,
                    as: 'mobileNetwork',
                    attributes: ['network_code'],
                    required: false
                },
                {
                    model: Industry,
                    as: 'industry',
                    attributes: ['industry_name'],
                    required: false
                }
            ],
            order: [['customer_id', 'DESC']],
            limit: pageSize,
            offset: offset
        });

        const list = rows.map((item, index) => ({
            sr_no: offset + index + 1,
            id: item.customer_id,
            company_name: item.company_name,
            first_name: item.first_name,
            last_name: item.last_name,
            email_id: item.email_id,
            mobile_no: item.mobile_no,
            industry_name: item.industry?.industry_name || '',
            register_date: item.register_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.register_date)) : "",
            is_enabled: item.is_enabled,
            is_approved: item.is_approved,
            approved_date: item.approved_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.approved_date)) : "",
            is_activated: item.is_activated,
            activated_date: item.activated_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.activated_date)) : "",
        }));

        const results = {
            current_page: _page_no,
            total_pages: Math.ceil(total_record / pageSize),
            data: list,
        };
        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

// Helper: Create developer in Apigee
// async function createApigeeDeveloper(customerData) {
//     const { first_name, last_name, email_id } = customerData;
//     const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers`;
//     const data = { firstName: first_name, lastName: last_name, userName: email_id, email: email_id };

//     const apigeeAuth = await db.get_apigee_token();
//     const response = await fetch(product_URL, {
//         method: "POST",
//         headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json" },
//         body: JSON.stringify(data),
//     });
//     return response.json();
// }

// Helper: Handle successful customer approval
async function handleApprovalSuccess(req, customerId, customer, developerId, responseData) {
    const { CstCustomer } = db.models;
    const { first_name, last_name, email_id, company_name } = customer;

    const [affectedRows] = await CstCustomer.update(
        {
            is_approved: 1,
            approved_date: db.get_ist_current_date(),
            developer_id: developerId,
            approval_response: JSON.stringify(responseData),
            approved_by: req.token_data.account_id
        },
        { where: { customer_id: customerId } }
    );

    if (affectedRows <= 0) return false;

    // Insert into customer_data
    try {
        const _ad_query = `INSERT INTO customer_data(customer_id, first_name, last_name, email_id, developer_id, company_name) VALUES (?, ?, ?, ?, ?, ?)`;
        await db.sequelize2.query(_ad_query, { replacements: [customerId, first_name, last_name, email_id, developerId, company_name], type: QueryTypes.INSERT });
    } catch (_err) { _logger.error(_err.stack); }

    await send_approved_email(customerId);
    logCustomerApproval(req, customerId, email_id, developerId);
    return true;
}

// Helper: Log customer approval action
function logCustomerApproval(req, customerId, email_id, developerId) {
    try {
        const data_to_log = {
            correlation_id: correlator.getId(),
            token_id: req.token_data.token_id,
            account_id: req.token_data.account_id,
            user_type: 1,
            user_id: req.token_data.admin_id,
            narration: ' Customer approved by admin user manually. Customer email = ' + email_id,
            query: JSON.stringify({ customer_id: customerId, is_approved: 1, developer_id: developerId }),
            date_time: db.get_ist_current_date(),
        };
        action_logger.info(JSON.stringify(data_to_log));
    } catch (_) { }
}

// Helper: Get Apigee error message
function getApigeeErrorMessage(responseData) {
    if (responseData?.error?.status === 'ABORTED' && responseData?.error?.code === 409) {
        return 'Apigee response : ' + responseData?.error?.message;
    }
    if (responseData?.error?.message?.length > 0) {
        return 'Apigee response : ' + responseData?.error?.message;
    }
    return "Unable to approve, Please try again.";
}

const customer_approve = async (req, res, next) => {
    const { customer_id } = req.body;
    const { CstCustomer } = db.models;
    try {
        const _customer_id = customer_id && validator.isNumeric(customer_id.toString()) ? parseInt(customer_id) : 0;

        const row1 = await CstCustomer.findOne({
            where: { customer_id: _customer_id, is_deleted: false },
            attributes: ['customer_id', 'is_approved', 'first_name', 'last_name', 'email_id', 'user_name', 'company_name']
        });

        if (!row1) {
            return res.status(200).json(success(false, res.statusCode, "Customer details not found, Please try again.", null));
        }
        if (row1.is_approved > 0) {
            return res.status(200).json(success(false, res.statusCode, "Customer is already approved.", null));
        }

        const hasRequiredDetails = row1.first_name?.length > 0 && row1.last_name?.length > 0 && row1.email_id?.length > 0;
        if (!hasRequiredDetails) {
            return res.status(200).json(success(false, res.statusCode, "Unable to approve, details not available.", null));
        }

        const responseData = await createApigeeDeveloper(row1);

        if (!responseData?.developerId) {
            return res.status(200).json(success(false, res.statusCode, getApigeeErrorMessage(responseData), null));
        }

        const approved = await handleApprovalSuccess(req, _customer_id, row1, responseData.developerId, responseData);

        if (approved) {
            return res.status(200).json(success(true, res.statusCode, "Customer approved successfully.", null));
        }
        return res.status(200).json(success(false, res.statusCode, "Unable to approve, Please try again.", null));

    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const customer_approve_auto = async (customer_id) => {
    const { CstCustomer } = db.models;
    try {
        const _customer_id = parseNumericId(customer_id);

        const row1 = await CstCustomer.findOne({
            where: { customer_id: _customer_id, is_deleted: false },
            attributes: ['customer_id', 'is_approved', 'first_name', 'last_name', 'email_id', 'user_name']
        });

        if (!row1) return -1;
        if (row1.is_approved > 0) return -2;

        const hasRequiredFields = row1.first_name?.length > 0 && row1.last_name?.length > 0 && row1.email_id?.length > 0;
        if (!hasRequiredFields) return 0;

        const responseData = await createApigeeDeveloper(row1);

        if (!responseData?.developerId) {
            return 0;
        }

        const [affectedRows] = await CstCustomer.update(
            {
                is_approved: 1,
                approved_date: db.get_ist_current_date(),
                developer_id: responseData.developerId,
                approval_response: JSON.stringify(responseData)
            },
            { where: { customer_id: _customer_id } }
        );

        if (affectedRows <= 0) return 0;

        await send_approved_email(_customer_id);
        return 1;
    } catch (err) {
        _logger.error(err.stack);
        return 0;
    }
};

const send_approved_email = async (customer_id) => {
    const { CstCustomer, EmailTemplate } = db.models;

    const customer = await CstCustomer.findOne({
        where: { customer_id, is_deleted: false },
        attributes: ['first_name', 'last_name', 'email_id', 'mobile_no', 'is_approved']
    });

    if (!customer) return 0; // customer data not found
    if (!customer.is_approved) return -1; // account not approved

    const template = await EmailTemplate.findOne({
        where: { template_id: EmailTemplates.CUSTOMER_APPROVED_EMAIL.value },
        attributes: ['subject', 'body_text', 'is_enabled']
    });

    if (!template) return -3; // template not found
    if (!template.is_enabled) return -4; // template is disabled

    const subject = replaceEmailTags(template.subject || '', customer);
    const body_text = replaceEmailTags(template.body_text || '', customer);

    const mailOptions = {
        from: process.env.EMAIL_CONFIG_SENDER,
        to: customer.email_id,
        subject,
        html: body_text,
    };

    try {
        await emailTransporter.sendMail(mailOptions);
        return 1;
    } catch (err) {
        _logger.error(err.stack);
        return 0; // sending fail
    }
}

const customer_activate = async (req, res, next) => {
    const { customer_id } = req.body;
    const { CstCustomer } = db.models;
    try {
        let _customer_id = customer_id && validator.isNumeric(customer_id.toString()) ? parseInt(customer_id) : 0;

        const row1 = await CstCustomer.findOne({
            where: {
                customer_id: _customer_id,
                is_deleted: false
            },
            attributes: ['customer_id', 'is_activated', 'email_id']
        });

        if (!row1) {
            return res.status(200).json(success(false, res.statusCode, "Customer details not found, Please try again.", null));
        }
        if (row1.is_activated > 0) {
            return res.status(200).json(success(false, res.statusCode, "Customer is already activated.", null));
        }

        const [affectedRows] = await CstCustomer.update(
            {
                is_activated: 1,
                activated_date: db.get_ist_current_date(),
                activated_by: req.token_data.account_id
            },
            {
                where: { customer_id: _customer_id }
            }
        );
        if (affectedRows > 0) {
            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: ' Customer activated by admin user manually. Customer email = ' + row1.email_id,
                    query: JSON.stringify({
                        customer_id: _customer_id,
                        is_activated: 1,
                        activated_by: req.token_data.account_id
                    }),
                    date_time: db.get_ist_current_date(),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }

            return res.status(200).json(success(true, res.statusCode, "Customer activated successfully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to activate, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const customer_toggle = async (req, res, next) => {
    const { customer_id } = req.body;
    try {
        const { CstCustomer } = db.models;
        const _customer_id = parseNumericId(customer_id);

        const customer = await CstCustomer.findOne({
            where: { customer_id: _customer_id, is_deleted: false },
            attributes: ['customer_id', 'developer_id', 'is_enabled', 'email_id']
        });

        if (!customer) {
            return res.status(200).json(success(false, res.statusCode, "Customer details not found, Please try again.", null));
        }

        if (customer.developer_id?.length > 0) {
            const response = await toggleApigeeDeveloperStatus(customer.developer_id, customer.is_enabled);
            if (response.status !== 204) {
                return res.status(200).json(success(false, res.statusCode, "Apigee response : " + response.statusText, null));
            }
        }

        const newEnabledStatus = !customer.is_enabled;
        const [affectedRows] = await CstCustomer.update(
            { is_enabled: newEnabledStatus, modify_date: db.get_ist_current_date(), modify_by: req.token_data.account_id },
            { where: { customer_id: _customer_id } }
        );

        if (affectedRows <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Unable to change, Please try again.", null));
        }

        const action = customer.is_enabled ? 'disabled' : 'enabled';
        logCustomerAction(req.token_data, `Customer ${action}. Customer email = ${customer.email_id}`, `CstCustomer.update({ is_enabled: ${newEnabledStatus} }, { where: { customer_id: ${_customer_id} }})`);
        return res.status(200).json(success(true, res.statusCode, "Customer status changed successfully.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const customer_delete = async (req, res, next) => {
    const { customer_id } = req.body;
    try {
        const { CstCustomer, CstAppMast, CstToken } = db.models;
        const _customer_id = parseNumericId(customer_id);

        const customer = await CstCustomer.findOne({
            where: { customer_id: _customer_id, is_deleted: false },
            attributes: ['customer_id', 'developer_id', 'email_id', 'is_enabled'],
            raw: true
        });

        if (!customer) {
            return res.status(200).json(success(false, res.statusCode, "Customer details not found, Please try again.", null));
        }

        const models = { CstCustomer, CstAppMast, CstToken };

        // No developer_id - just soft delete locally
        if (!customer.developer_id?.length) {
            const deleted = await softDeleteCustomerRecords(models, _customer_id, req.token_data, customer.email_id);
            return deleted
                ? res.status(200).json(success(true, res.statusCode, "Customer delete successfully.", null))
                : res.status(200).json(success(false, res.statusCode, "Unable to delete, Please try again.", null));
        }

        // Has developer_id - try to delete from Apigee
        const apigeeResult = await deleteApigeeDeveloper(customer.email_id);

        // Apigee delete successful
        if (apigeeResult.status === 200) {
            const apps = await CstAppMast.findAll({
                where: { customer_id: _customer_id, is_deleted: false },
                attributes: ['customer_id', 'app_id', 'apigee_app_id', 'is_approved', 'app_name'],
                raw: true
            });

            if (apps?.length > 0) {
                await CstAppMast.update({ is_deleted: true }, { where: { customer_id: _customer_id, is_deleted: false } });
                await deleteCustomerAppsFromApigee(apps, customer.email_id);
                logCustomerAction(req.token_data, `Customer apps deleted due to deletion of customer. Customer email = ${customer.email_id}`, `CstAppMast.update({ is_deleted: true }, { where: { customer_id: ${_customer_id} }})`);
            }

            const deleted = await softDeleteCustomerRecords(models, _customer_id, req.token_data, customer.email_id);
            return deleted
                ? res.status(200).json(success(true, res.statusCode, "Customer delete successfully.", null))
                : res.status(200).json(success(false, res.statusCode, "Unable to delete, Please try again.", null));
        }

        // Apigee developer not found - still delete locally
        if (apigeeResult.data?.error?.status === 'NOT_FOUND' && apigeeResult.data?.error?.code === 404) {
            const deleted = await softDeleteCustomerRecords(models, _customer_id, req.token_data, customer.email_id);
            return deleted
                ? res.status(200).json(success(true, res.statusCode, "Customer delete successfully.", null))
                : res.status(200).json(success(false, res.statusCode, "Unable to delete, Please try again.", null));
        }

        return res.status(200).json(success(false, res.statusCode, "Apigee response error", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const all_customer_excel = async (req, res, next) => {
    const { search_text } = req.body;
    try {
        const { CstCustomer, MobileNetwork, Industry, AdmUser } = db.models;
        let _search_text = search_text && search_text.length > 0 ? search_text : "";

        const whereClause = {
            is_deleted: false,
            ..._search_text && {
                [Op.or]: [
                    { email_id: { [Op.iLike]: `%${_search_text}%` } },
                    { mobile_no: { [Op.iLike]: `%${_search_text}%` } }
                ]
            }
        };

        const rows = await CstCustomer.findAll({
            where: whereClause,
            include: [
                { model: MobileNetwork, as: 'mobileNetwork', attributes: ['network_code'], required: false },
                { model: Industry, as: 'industry', attributes: ['industry_name'], required: false },
                { model: AdmUser, as: 'addedByUser', attributes: ['first_name', 'last_name'], required: false }
            ],
            order: [['customer_id', 'DESC']],
            raw: true,
            nest: true
        });

        let list = [];
        if (rows) {
            rows.forEach((item, index) => {
                list.push({
                    sr_no: index + 1,
                    company_name: item.company_name,
                    first_name: item.first_name,
                    last_name: item.last_name,
                    email_id: item.email_id,
                    mobile_no: item.mobile_no,
                    industry_name: item.industry?.industry_name || '',
                    is_enabled: item.is_enabled ? 'Enable' : 'Disable',
                    is_approved: item.is_approved ? 'Approved' : 'Not Approved',
                    is_activated: item.is_activated ? 'Activated' : 'Not Activated',
                    approved_date: item.approved_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.approved_date)) : "",
                    register_date: item.register_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.register_date)) : "",
                    activated_date: item.activated_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.activated_date)) : "",
                    developer_id: item.developer_id,
                    is_live_sandbox: item.is_live_sandbox ? 'Yes' : 'No',
                    added_by: item.addedByUser ? `${item.addedByUser.first_name || ''} ${item.addedByUser.last_name || ''}`.trim() : '',
                    sandbox_added_date: item.sandbox_added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.sandbox_added_date)) : "",
                });
            });
        }
        const workbook = new excel.Workbook();
        const worksheet = workbook.addWorksheet('Sheet 1');
        const headers = ['Sr No', 'Company Name', 'First Name', 'Last Name', 'Email', 'Mobile No', 'Industry', 'Is Enabled', 'Is Approved', 'Is Activated', 'Approved Date', 'Register Date', 'Activated Date', 'Developer Id', 'Sandbox User', 'Created By', 'Sandbox Added Date', 'Billing Type'];
        const headerRow = worksheet.addRow(headers);
        headerRow.eachCell((cell, colNumber) => {
            cell.font = { bold: true };
        });
        for (const item of list) {
            const rowValues = Object.values(item);
            worksheet.addRow(rowValues);
        }
        const excelBuffer = await workbook.xlsx.writeBuffer();
        res.setHeader('Content-Length', excelBuffer.length);
        res.send(excelBuffer);
    }
    catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const pending_customer_excel = async (req, res, next) => {
    const { search_text } = req.body;
    try {
        const { CstCustomer, MobileNetwork, Industry } = db.models;
        let _search_text = search_text && search_text.length > 0 ? search_text : "";

        const whereClause = {
            is_deleted: false,
            is_approved: { [Op.lte]: 0 },
            ..._search_text && {
                [Op.or]: [
                    { email_id: { [Op.iLike]: `%${_search_text}%` } },
                    { mobile_no: { [Op.iLike]: `%${_search_text}%` } }
                ]
            }
        };

        const rows = await CstCustomer.findAll({
            where: whereClause,
            include: [
                { model: MobileNetwork, as: 'mobileNetwork', attributes: ['network_code'], required: false },
                { model: Industry, as: 'industry', attributes: ['industry_name'], required: false }
            ],
            order: [['customer_id', 'DESC']],
            raw: true,
            nest: true
        });

        let list = [];
        if (rows) {
            rows.forEach((item, index) => {
                list.push({
                    sr_no: index + 1,
                    company_name: item.company_name,
                    first_name: item.first_name,
                    last_name: item.last_name,
                    email_id: item.email_id,
                    mobile_no: item.mobile_no,
                    industry_name: item.industry?.industry_name || '',
                    is_enabled: item.is_enabled ? 'Enable' : 'Disable',
                    is_approved: item.is_approved ? 'Approved' : 'Not Approved',
                    is_activated: item.is_activated ? 'Activated' : 'Not Activated',
                    register_date: item.register_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.register_date)) : "",
                    approved_date: item.approved_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.approved_date)) : "",
                    activated_date: item.activated_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.activated_date)) : "",
                });
            });
        }
        const workbook = new excel.Workbook();
        const worksheet = workbook.addWorksheet('Sheet 1');
        const headers = ['Sr No', 'Company Name', 'First Name', 'Last Name', 'Email', 'Mobile No', 'Industry', 'Is Enabled', 'Is Approved', 'Is Activated', 'Approved Date', 'Register Date', 'Activated Date'];
        const headerRow = worksheet.addRow(headers);
        headerRow.eachCell((cell, colNumber) => {
            cell.font = { bold: true };
        });
        for (const item of list) {
            const rowValues = Object.values(item);
            worksheet.addRow(rowValues);
        }
        const excelBuffer = await workbook.xlsx.writeBuffer();
        res.setHeader('Content-Length', excelBuffer.length);
        res.send(excelBuffer);
    }
    catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const activation_customer_excel = async (req, res, next) => {
    const { search_text } = req.body;
    try {
        const { CstCustomer, MobileNetwork, Industry } = db.models;
        let _search_text = search_text && search_text.length > 0 ? search_text : "";

        const whereClause = {
            is_deleted: false,
            is_activated: { [Op.lte]: 0 },
            ..._search_text && {
                [Op.or]: [
                    { email_id: { [Op.iLike]: `%${_search_text}%` } },
                    { mobile_no: { [Op.iLike]: `%${_search_text}%` } }
                ]
            }
        };

        const rows = await CstCustomer.findAll({
            where: whereClause,
            include: [
                { model: MobileNetwork, as: 'mobileNetwork', attributes: ['network_code'], required: false },
                { model: Industry, as: 'industry', attributes: ['industry_name'], required: false }
            ],
            order: [['customer_id', 'DESC']],
            raw: true,
            nest: true
        });

        let list = [];
        if (rows) {
            rows.forEach((item, index) => {
                list.push({
                    sr_no: index + 1,
                    company_name: item.company_name,
                    first_name: item.first_name,
                    last_name: item.last_name,
                    email_id: item.email_id,
                    mobile_no: item.mobile_no,
                    industry_name: item.industry?.industry_name || '',
                    is_enabled: item.is_enabled ? 'Enable' : 'Disable',
                    is_approved: item.is_approved ? 'Approved' : 'Not Approved',
                    is_activated: item.is_activated ? 'Activated' : 'Not Activated',
                    register_date: item.register_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.register_date)) : "",
                    approved_date: item.approved_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.approved_date)) : "",
                    activated_date: item.activated_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.activated_date)) : "",
                });
            });
        }
        const workbook = new excel.Workbook();
        const worksheet = workbook.addWorksheet('Sheet 1');
        const headers = ['Sr No', 'Company Name', 'First Name', 'Last Name', 'Email', 'Mobile No', 'Industry', 'Is Enabled', 'Is Approved', 'Is Activated', 'Approved Date', 'Register Date', 'Activated Date'];
        const headerRow = worksheet.addRow(headers);
        headerRow.eachCell((cell, colNumber) => {
            cell.font = { bold: true };
        });
        for (const item of list) {
            const rowValues = Object.values(item);
            worksheet.addRow(rowValues);
        }
        const excelBuffer = await workbook.xlsx.writeBuffer();
        res.setHeader('Content-Length', excelBuffer.length);
        res.send(excelBuffer);
    }
    catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const sandbox_customer_add = async (req, res, next) => {
    const { post_data } = req.body;
    try {
        const temp_admin_id = req?.token_data?.admin_id;
        const jsonData = JSON.parse(rsa_decrypt(post_data));
        const { CstCustomer } = db.models;

        // Extract and normalize data
        const { company_name, first_name, last_name, email_id, network_id, mobile_no, industry_id, password } = jsonData;
        const user_name = jsonData.user_name || '';
        const segment_id = (!jsonData.segment_id || !validator.isNumeric(jsonData.segment_id.toString()) || jsonData.segment_id <= 0) ? 0 : jsonData.segment_id;

        // Validate registration fields
        const fieldValidation = validateRegistrationFields({ first_name, last_name, network_id, mobile_no, email_id, industry_id, company_name }, res);
        if (!fieldValidation.valid) return fieldValidation.response;

        // Validate password
        const passwordValidation = validatePassword(password, res);
        if (!passwordValidation.valid) return passwordValidation.response;

        // Check for duplicates
        const duplicateCheck = await checkDuplicateCustomer(CstCustomer, email_id, mobile_no, res);
        if (duplicateCheck.exists) return duplicateCheck.response;

        // Create customer
        const password_hash = await bcrypt.hash(password, 10);
        const newCustomer = await CstCustomer.create({
            company_name, first_name, last_name, email_id, network_id, mobile_no, user_name,
            user_pass: password_hash,
            register_date: db.get_ist_current_date(),
            is_enabled: true, is_deleted: false, is_approved: 0,
            industry_id, segment_id,
            is_live_sandbox: true,
            added_by: temp_admin_id,
            is_for_sandbox: true, is_from_admin: true,
            sandbox_added_date: db.get_ist_current_date()
        });

        const customer_id = newCustomer?.customer_id || 0;
        if (customer_id <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Unable to register, Please try again.", null));
        }

        await customer_approve_auto(customer_id);
        await customerService.send_activation_link(customer_id);

        logCustomerAction(req.token_data, 'New Sandbox customer registered from admin and activation link sent.', `CstCustomer.create({ email_id: '${email_id}' })`);

        const results = { id: newCustomer?.unique_id || "" };
        return res.status(200).json(success(true, API_STATUS.CUSTOMER_REGISTERED.value, "Your registration is successful. You will receive an email with activation link.", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const customer_credit_add = async (req, res, next) => {
    const { customer_id, credit, transaction_type, description } = req.body;
    try {
        const { CstCustomer, CstCredits } = db.models;
        const _customer_id = parseNumericId(customer_id);
        const _transaction_type = parseNumericId(transaction_type) || 1; // credit=1, debit=2

        if (!credit || credit.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter credit.", null));
        }

        const customer = await CstCustomer.findOne({
            where: { customer_id: _customer_id, is_deleted: false },
            attributes: ['customer_id', 'total_credits', 'developer_id', 'is_enabled', 'email_id', 'is_live_sandbox'],
            raw: true
        });

        if (!customer) {
            return res.status(200).json(success(false, res.statusCode, "Customer details not found, Please try again.", null));
        }
        if (!customer.is_live_sandbox) {
            return res.status(200).json(success(false, res.statusCode, "credit functionality available for only sandbox customer.", null));
        }

        const isCredit = _transaction_type === 1;
        const updatedCredits = isCredit
            ? parseInt(customer.total_credits) + parseInt(credit)
            : parseInt(customer.total_credits) - parseInt(credit);

        const [affectedRows] = await CstCustomer.update(
            { total_credits: updatedCredits, modify_date: db.get_ist_current_date(), modify_by: req.token_data.account_id },
            { where: { customer_id: _customer_id } }
        );

        if (affectedRows <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Unable to add credit, Please try again.", null));
        }

        const newCredit = await CstCredits.create({
            customer_id: _customer_id, credits: credit, added_by: req.token_data.account_id,
            added_date: db.get_ist_current_date(), description, transaction_type: _transaction_type
        });

        if (!newCredit?.credit_id) {
            return res.status(200).json(success(false, res.statusCode, "Unable to add credit, Please try again.", null));
        }

        logCustomerAction(req.token_data, 'credits add & credit add mail sent.', `CstCredits.create({ customer_id: ${_customer_id}, credits: ${credit} })`);
        return res.status(200).json(success(true, res.statusCode, "Credit add succefully.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const customer_credit_details_get = async (req, res, next) => {
    const { page_no, customer_id, search_text, transaction_type, from_date, upto_date } = req.body;
    try {
        const { CstCustomer, CstCredits } = db.models;
        let _customer_id = customer_id && validator.isNumeric(customer_id.toString()) ? parseInt(customer_id) : 0;
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0;

        const row2 = await CstCustomer.findOne({
            where: { customer_id: _customer_id, is_deleted: false },
            attributes: ['customer_id', 'first_name', 'last_name', 'total_credits', 'is_enabled', 'email_id', 'is_live_sandbox', 'is_for_sandbox'],
            raw: true
        });

        if (!row2) {
            return res.status(200).json(success(false, res.statusCode, "Customer details not found, Please try again.", null));
        }
        if (_page_no <= 0) { _page_no = 1; }

        const pageSize = parseInt(process.env.PAGINATION_SIZE);
        const offset = (_page_no - 1) * pageSize;

        // Build where clause dynamically
        const whereClause = { customer_id: _customer_id };

        if (search_text) {
            whereClause.description = { [Op.iLike]: `%${search_text}%` };
        }
        if (transaction_type) {
            whereClause.transaction_type = transaction_type;
        }
        if (from_date) {
            whereClause.added_date = { ...whereClause.added_date, [Op.gte]: new Date(from_date) };
        }
        if (upto_date) {
            const endDate = new Date(upto_date);
            endDate.setHours(23, 59, 59, 999);
            whereClause.added_date = { ...whereClause.added_date, [Op.lte]: endDate };
        }

        const total_record = await CstCredits.count({ where: { customer_id: _customer_id } });

        const rows = await CstCredits.findAll({
            where: whereClause,
            attributes: ['credit_id', 'credits', 'added_date', 'transaction_type', 'description'],
            order: [['credit_id', 'DESC']],
            limit: pageSize,
            offset: offset,
            raw: true
        });

        if (rows && rows.length > 0) {
            let _credits = rows.map((item, index) => ({
                sr_no: offset + index + 1,
                credits: item.credits,
                transaction_type: item.transaction_type == 1 ? "Credited" : "Debited",
                description: item.description,
                added_date: item.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.added_date)) : "",
            }));

            const results = {
                current_page: _page_no,
                total_pages: Math.ceil(total_record / pageSize),
                first_name: row2.first_name,
                last_name: row2.last_name,
                email_id: row2.email_id,
                is_live_sandbox: row2.is_live_sandbox,
                is_for_sandbox: row2.is_for_sandbox,
                total_credits: row2.total_credits,
                data: _credits,
            };

            return res.status(200).json(success(true, res.statusCode, "Credits Data.", results));
        } else {
            const results = {
                current_page: _page_no,
                total_pages: '',
                first_name: row2.first_name,
                last_name: row2.last_name,
                email_id: row2.email_id,
                is_live_sandbox: row2.is_live_sandbox,
                is_for_sandbox: row2.is_for_sandbox,
                total_credits: row2.total_credits,
                data: [],
            };
            return res.status(200).json(success(true, res.statusCode, "Unable to find Credits detail, Please try again.", results));
        }

    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const customer_search_list_sandbox = async (req, res, next) => {
    const { page_no, search_text } = req.body;
    try {
        const { CstCustomer, MobileNetwork, Industry, AdmUser } = db.models;

        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0;
        if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";

        const pageSize = parseInt(process.env.PAGINATION_SIZE);
        const offset = (_page_no - 1) * pageSize;

        // Build where clause for sandbox customers
        const whereClause = {
            is_deleted: false,
            is_for_sandbox: true,
            ..._search_text && {
                [Op.or]: [
                    { email_id: { [Op.iLike]: `%${_search_text}%` } },
                    { mobile_no: { [Op.iLike]: `%${_search_text}%` } },
                    { company_name: { [Op.iLike]: `%${_search_text}%` } }
                ]
            }
        };

        // Get total count
        const total_record = await CstCustomer.count({ where: whereClause });

        // Get paginated list with associations
        const rows = await CstCustomer.findAll({
            where: whereClause,
            include: [
                {
                    model: MobileNetwork,
                    as: 'mobileNetwork',
                    attributes: ['network_code'],
                    required: false
                },
                {
                    model: Industry,
                    as: 'industry',
                    attributes: ['industry_name'],
                    required: false
                },
                {
                    model: AdmUser,
                    as: 'addedByUser',
                    attributes: ['first_name', 'last_name'],
                    required: false
                }
            ],
            order: [['customer_id', 'DESC']],
            limit: pageSize,
            offset: offset
        });

        const list = rows.map((item, index) => ({
            sr_no: offset + index + 1,
            id: item.customer_id,
            company_name: item.company_name,
            first_name: item.first_name,
            last_name: item.last_name,
            email_id: item.email_id,
            mobile_no: item.mobile_no,
            industry_name: item.industry?.industry_name || '',
            register_date: item.register_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.register_date)) : "",
            is_enabled: item.is_enabled,
            is_approved: item.is_approved,
            total_credits: item.total_credits,
            billing_type: item.billing_type,
            is_live_sandbox: item.is_live_sandbox,
            approved_date: item.approved_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.approved_date)) : "",
            is_activated: item.is_activated,
            activated_date: item.activated_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.activated_date)) : "",
            added_by: item.addedByUser ? `${item.addedByUser.first_name || ''} ${item.addedByUser.last_name || ''}`.trim() : '',
            is_for_sandbox: item.is_for_sandbox,
            is_from_admin: item.is_from_admin,
            sandbox_added_date: item.sandbox_added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.sandbox_added_date)) : "",
        }));

        const results = {
            current_page: _page_no,
            total_pages: Math.ceil(total_record / pageSize),
            data: list,
        };
        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const sandbox_customer_excel = async (req, res, next) => {
    const { search_text } = req.body;
    try {
        const { CstCustomer, MobileNetwork, Industry, AdmUser } = db.models;
        let _search_text = search_text && search_text.length > 0 ? search_text : "";

        const whereClause = {
            is_deleted: false,
            is_live_sandbox: true,
            ..._search_text && {
                [Op.or]: [
                    { email_id: { [Op.iLike]: `%${_search_text}%` } },
                    { mobile_no: { [Op.iLike]: `%${_search_text}%` } }
                ]
            }
        };

        const rows = await CstCustomer.findAll({
            where: whereClause,
            include: [
                { model: MobileNetwork, as: 'mobileNetwork', attributes: ['network_code'], required: false },
                { model: Industry, as: 'industry', attributes: ['industry_name'], required: false },
                { model: AdmUser, as: 'addedByUser', attributes: ['first_name', 'last_name'], required: false }
            ],
            order: [['customer_id', 'DESC']],
            raw: true,
            nest: true
        });

        let list = [];
        if (rows) {
            rows.forEach((item, index) => {
                list.push({
                    sr_no: index + 1,
                    company_name: item.company_name,
                    first_name: item.first_name,
                    last_name: item.last_name,
                    email_id: item.email_id,
                    mobile_no: item.mobile_no,
                    industry_name: item.industry?.industry_name || '',
                    is_enabled: item.is_enabled ? 'Enable' : 'Disable',
                    is_approved: item.is_approved ? 'Approved' : 'Not Approved',
                    is_activated: item.is_activated ? 'Activated' : 'Not Activated',
                    register_date: item.register_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.register_date)) : "",
                    approved_date: item.approved_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.approved_date)) : "",
                    activated_date: item.activated_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.activated_date)) : "",
                    developer_id: item.developer_id,
                    is_from_admin: item.is_from_admin ? 'New' : 'Existing',
                    added_by: item.addedByUser ? `${item.addedByUser.first_name || ''} ${item.addedByUser.last_name || ''}`.trim() : ''
                });
            });
        }
        const workbook = new excel.Workbook();
        const worksheet = workbook.addWorksheet('Sheet 1');
        const headers = ['Sr No', 'Company Name', 'First Name', 'Last Name', 'Email', 'Mobile No', 'Industry', 'Is Enabled', 'Is Approved', 'Is Activated', 'Register Date', 'Approved Date', 'Activated Date', 'Developer Id', 'Customer Type', 'Added By'];
        const headerRow = worksheet.addRow(headers);
        headerRow.eachCell((cell, colNumber) => {
            cell.font = { bold: true };
        });
        for (const item of list) {
            const rowValues = Object.values(item);
            worksheet.addRow(rowValues);
        }
        const excelBuffer = await workbook.xlsx.writeBuffer();
        res.setHeader('Content-Length', excelBuffer.length);
        res.send(excelBuffer);
    }
    catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const all_customer_dropdown = async (req, res, next) => {
    const { page_no } = req.body;
    try {
        const { CstCustomer, MobileNetwork, Industry } = db.models;
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0; if (_page_no <= 0) { _page_no = 1; }
        // let _search_text = search_text && search_text.length > 0 ? search_text : "";

        const rows = await CstCustomer.findAll({
            where: {
                is_deleted: false,
                is_live_sandbox: false
            },
            include: [
                { model: MobileNetwork, as: 'mobileNetwork', attributes: ['network_code'], required: false },
                { model: Industry, as: 'industry', attributes: ['industry_name'], required: false }
            ],
            order: [['customer_id', 'DESC']],
            raw: true,
            nest: true
        });

        let list = [];
        if (rows) {
            rows.forEach((item, index) => {
                list.push({
                    sr_no: index + 1,
                    id: item.customer_id,
                    company_name: item.company_name,
                    first_name: item.first_name,
                    last_name: item.last_name,
                    email_id: item.email_id,
                    mobile_no: item.mobile_no,
                    industry_name: item.industry?.industry_name || '',
                    register_date: item.register_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.register_date)) : "",
                    is_enabled: item.is_enabled,
                    is_approved: item.is_approved,
                    total_credits: item.total_credits,
                    is_live_sandbox: item.is_live_sandbox,
                    approved_date: item.approved_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.approved_date)) : "",
                    is_activated: item.is_activated,
                    activated_date: item.activated_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.activated_date)) : "",
                });
            });
        }
        const results = { data: list, };
        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const sandbox_customer_add_existing = async (req, res, next) => {
    const { temp_customer_id } = req.body;
    try {
        const { CstCustomer } = db.models;
        const temp_admin_id = req?.token_data?.admin_id;
        if (!temp_customer_id || temp_customer_id <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please select customer.", null));
        }

        const row1 = await CstCustomer.findOne({
            where: { customer_id: temp_customer_id, is_deleted: false },
            attributes: ['customer_id', 'is_live_sandbox', 'unique_id'],
            raw: true
        });

        if (!row1) {
            return res.status(200).json(success(false, res.statusCode, "Customer not found.", null));
        }
        if (row1.is_live_sandbox) {
            return res.status(200).json(success(false, res.statusCode, "Customer already sandbox user.", null));
        }

        const [affectedRows] = await CstCustomer.update(
            {
                is_live_sandbox: true,
                is_for_sandbox: true,
                is_from_admin: false,
                sandbox_added_date: db.get_ist_current_date(),
                added_by: temp_admin_id
            },
            { where: { customer_id: temp_customer_id } }
        );

        if (affectedRows > 0) {
            const results = { id: row1.unique_id, };
            await customerService.send_mail_existing_user_to_sandbox(temp_customer_id);

            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: 'Promote existing customer to live sandbox environment by.' + req?.token_data?.admin_id,
                    query: `CstCustomer.update({ is_live_sandbox: true }, { where: { customer_id: ${temp_customer_id} }})`,
                    date_time: db.get_ist_current_date(),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }

            return res.status(200).json(success(true, API_STATUS.CUSTOMER_REGISTERED.value, "Successfully promote customer to live sandbox. Email notification sent.", results));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to register, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};


const customer_toggle_sandbox = async (req, res, next) => {
    const { customer_id } = req.body;
    try {
        const { CstCustomer } = db.models;
        let _customer_id = customer_id && validator.isNumeric(customer_id.toString()) ? parseInt(customer_id) : 0;

        const row1 = await CstCustomer.findOne({
            where: { customer_id: _customer_id, is_deleted: false },
            attributes: ['customer_id', 'developer_id', 'is_enabled', 'email_id', 'is_live_sandbox'],
            raw: true
        });

        if (!row1) {
            return res.status(200).json(success(false, res.statusCode, "Customer details not found, Please try again.", null));
        }

        const newSandboxStatus = !row1.is_live_sandbox;

        const [affectedRows] = await CstCustomer.update(
            {
                is_live_sandbox: newSandboxStatus,
                modify_date: db.get_ist_current_date(),
                modify_by: req.token_data.account_id
            },
            { where: { customer_id: _customer_id } }
        );

        if (affectedRows > 0) {
            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: `Customer live sandbox ${row1.is_live_sandbox ? 'disabled' : 'enabled'}. Customer email = ${row1.email_id}`,
                    query: `CstCustomer.update({ is_live_sandbox: ${newSandboxStatus} }, { where: { customer_id: ${_customer_id} }})`,
                    date_time: db.get_ist_current_date(),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }

            return res.status(200).json(success(true, res.statusCode, "Customer status changed successfully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to change, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const credits_transaction_export = async (req, res, next) => {
    const { customer_id, search_text, transaction_type, from_date, upto_date } = req.body;
    try {
        const { CstCredits } = db.models;
        if (!customer_id) {
            return res.status(200).json(success(false, res.statusCode, "Customer Details not found.", null));
        }

        // Build where clause dynamically
        const whereClause = { customer_id: customer_id };

        if (search_text) {
            whereClause.description = { [Op.iLike]: `%${search_text}%` };
        }
        if (transaction_type) {
            whereClause.transaction_type = transaction_type;
        }
        if (from_date) {
            whereClause.added_date = { ...whereClause.added_date, [Op.gte]: new Date(from_date) };
        }
        if (upto_date) {
            const endDate = new Date(upto_date);
            endDate.setHours(23, 59, 59, 999);
            whereClause.added_date = { ...whereClause.added_date, [Op.lte]: endDate };
        }

        const rows = await CstCredits.findAll({
            where: whereClause,
            attributes: ['credit_id', 'credits', 'added_date', 'transaction_type', 'description'],
            order: [['credit_id', 'DESC']],
            raw: true
        });

        if (rows?.length) {
            let list = rows.map((item, index) => ({
                sr_no: index + 1,
                added_date: item.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.added_date)) : "",
                credits: item.credits,
                transaction_type: item.transaction_type == 1 ? "Credited" : "Debited",
                description: item.description,
            }));

            const workbook = new excel.Workbook();
            const worksheet = workbook.addWorksheet('Sheet 1');
            const headers = ['Sr No', 'Transaction Date', 'Credits', 'Transaction Type', 'Description'];
            const headerRow = worksheet.addRow(headers);
            headerRow.eachCell((cell, colNumber) => {
                cell.font = { bold: true };
            });
            for (const item of list) {
                const rowValues = Object.values(item);
                worksheet.addRow(rowValues);
            }
            const excelBuffer = await workbook.xlsx.writeBuffer();
            res.setHeader('Content-Length', excelBuffer.length);
            res.send(excelBuffer);
        } else {
            const workbook = new excel.Workbook();
            const worksheet = workbook.addWorksheet('Sheet 1');
            const headers = ['Sr No', 'Transaction Date', 'Credit', 'Transaction Type', 'Description'];
            const headerRow = worksheet.addRow(headers);
            headerRow.eachCell((cell, colNumber) => {
                cell.font = { bold: true };
            });
            const excelBuffer = await workbook.xlsx.writeBuffer();
            res.setHeader('Content-Length', excelBuffer.length);
            res.send(excelBuffer);
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

// Helper: Format date field
const formatAppDate = (dateValue) => {
    return dateValue ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(dateValue)) : "";
};

// Helper: Get products for an app
const getAppProducts = async (app_id) => {
    const query = `SELECT p.product_id, p.product_name, p.description, p.key_features FROM product p
        INNER JOIN cst_app_product m ON p.product_id = m.product_id WHERE m.app_id = ?`;
    const rows = await db.sequelize.query(query, { replacements: [app_id], type: QueryTypes.SELECT });
    return rows.map(pr => ({
        product_id: pr.product_id,
        product_name: pr.product_name,
        description: pr.description,
        key_features: pr.key_features,
    }));
};

// Helper: Get proxies for products
const getProxiesForProducts = async (products) => {
    const proxies = [];
    for (const pr of products) {
        const query = `SELECT proxy_id, proxy_name, display_name, product_id FROM proxies WHERE product_id = ? AND is_deleted = false AND is_published = true ORDER BY proxy_id DESC`;
        const rows = await db.sequelize.query(query, { replacements: [pr.product_id], type: QueryTypes.SELECT });
        for (const item of rows) {
            proxies.push({
                product_id: item.product_id,
                proxy_id: item.proxy_id,
                proxy_name: item.display_name?.length > 0 ? item.display_name : item.proxy_name,
                display_name: item.display_name,
            });
        }
    }
    return proxies;
};

// Helper: Transform app data to response format
const transformAppData = (app, products, proxies) => ({
    sr_no: app.sr_no,
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
    app_rate_plan: app.app_rate_plan,
    app_wallet_rate_data: app.app_wallet_rate_data,
    app_routing_logic_added_by: app.app_routing_logic_added_by,
    app_routing_logic_added_date: app.app_routing_logic_added_date,
    products,
    proxies,
});

// Helper: Process all apps with their products and proxies
const processAppsWithDetails = async (apps) => {
    const result = [];
    for (const app of apps) {
        const products = await getAppProducts(app.app_id);
        const proxies = await getProxiesForProducts(products);
        result.push(transformAppData(app, products, proxies));
    }
    return result;
};

const customer_app_list_get = async (req, res, next) => {
    const { page_no, customer_id } = req.body;
    try {
        let _page_no = parseNumericId(page_no) || 1;
        const _customer_id = parseNumericId(customer_id);

        const customerQuery = `SELECT customer_id, developer_id, is_enabled, email_id, first_name, last_name FROM cst_customer WHERE customer_id = ? AND is_deleted = false`;
        const customerData = await db.sequelize.query(customerQuery, { replacements: [_customer_id], type: QueryTypes.SELECT });

        if (!customerData?.length) {
            return res.status(200).json(success(false, res.statusCode, "Customer details not found, Please try again.", null));
        }

        const countQuery = `SELECT count(1) AS total_record FROM cst_app_mast a WHERE a.customer_id = :_customer_id AND a.is_deleted = false`;
        const countResult = await db.sequelize.query(countQuery, { replacements: { _customer_id }, type: QueryTypes.SELECT });
        const total_record = countResult?.[0]?.total_record || 0;

        const appsQuery = `SELECT ROW_NUMBER() OVER(ORDER BY a.app_id DESC) AS sr_no, a.app_id, a.app_name, a.description, a.expected_volume, a.callback_url, a.ip_addresses, a.certificate_file, a.added_date,
            a.is_approved, a.approved_by, a.approve_date, a.approve_remark, a.is_rejected, a.rejected_by, a.rejected_date, a.reject_remark, a.app_rate_plan,
            a.api_key, a.api_secret, a.key_issued_date, a.key_expiry_date, a.in_live_env, a.is_live_app_created, a.live_app_id, a.display_name,
            a.mkr_is_rejected AS mkr_rejected, a.mkr_rejected_date AS mkr_date, a.mkr_rejected_rmk AS mkr_remark,
            COALESCE((SELECT TRIM(COALESCE(i.first_name, '') || ' ' || COALESCE(i.last_name, '')) FROM adm_user i WHERE i.account_id = a.mkr_rejected_by), '') AS mkr_name,
            a.is_rejected AS chkr_rejected, a.rejected_date AS chkr_date, a.reject_remark AS chkr_remark,
            COALESCE((SELECT TRIM(COALESCE(i.first_name, '') || ' ' || COALESCE(i.last_name, '')) FROM adm_user i WHERE i.account_id = a.rejected_by), '') AS chkr_name,
            a.app_wallet_rate_data, a.app_routing_logic_added_by, a.app_routing_logic_added_date
            FROM cst_app_mast a WHERE a.customer_id = :customer_id AND a.is_deleted = false`;

        const apps = await db.sequelize.query(appsQuery, { replacements: { customer_id: _customer_id }, type: QueryTypes.SELECT });
        const my_apps = apps?.length ? await processAppsWithDetails(apps) : [];

        const results = {
            customer: {
                id: customerData[0].customer_id,
                email_id: customerData[0].email_id,
                first_name: customerData[0].first_name,
                last_name: customerData[0].last_name,
            },
            live_app: my_apps.filter(el => el.in_live_env),
            uat_app: my_apps.filter(el => !el.in_live_env),
            current_page: _page_no,
            total_pages: Math.ceil(total_record / process.env.PAGINATION_SIZE),
        };

        return res.status(200).json(success(true, res.statusCode, "My Apps Data.", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};


/*  analytics reports start */


const customer_analytics_reports_export = async (req, res, next) => {
    const { page_no, customer_id, search_text, product_id, from_date, upto_date, type } = req.body;
    try {
        const _customer_id = parseNumericId(customer_id);
        const _type = parseNumericId(type) || 1;
        const _search_text = search_text?.length > 0 ? search_text : "";
        let currentPage = parseNumericId(page_no) || 1;

        const role_name = await getUserRoleName(req.token_data.admin_id);
        const { developerId } = await getCustomerDeveloperInfo(_customer_id);
        const isAdmin = role_name === 'Administrator';

        if (_customer_id <= 0 || !product_id?.length) {
            const dateValidation = validateAnalyticsDateRange(from_date, upto_date);
            if (!dateValidation.valid) {
                return res.status(200).json(success(false, res.statusCode, dateValidation.message, null));
            }
        }

        const { fromDate, uptoDate } = prepareAnalyticsDateFilters(from_date, upto_date);
        const table_name = _type === 1 ? 'apigee_logs_prod' : 'apigee_logs';
        const pageSize = 10000;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="customer_analytics_reports_data.xlsx"');

        const stream = new PassThrough();
        const workbook = new excel.stream.xlsx.WorkbookWriter({ stream });
        const worksheet = workbook.addWorksheet('Sheet 1');

        worksheet.addRow(getAnalyticsExportHeaders(isAdmin)).commit();
        stream.pipe(res);

        let hasMoreData = true;
        while (hasMoreData) {
            const { conditions, replacements } = buildAnalyticsQueryConditions({
                developerId, searchText: _search_text, productId: product_id,
                fromDate, uptoDate, useEmailFilter: false
            });
            replacements.page_size = pageSize;
            replacements.page_no = currentPage;

            let query = getAnalyticsExportQuery(table_name);
            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND ');
            }
            query += ` LIMIT :page_size OFFSET ((:page_no - 1) * :page_size)`;

            const pageData = await db.sequelize2.query(query, { replacements, type: QueryTypes.SELECT, raw: true });

            if (pageData?.length > 0) {
                writeAnalyticsRowsToWorksheet(pageData, worksheet, isAdmin, mapAnalyticsRowForExport);
                currentPage++;
            } else {
                hasMoreData = false;
            }
        }

        await workbook.commit();
        stream.end();
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const analytics_reports_generate_excel = async (req, res, next) => {
    const { customer_id, product_id, from_date, upto_date, type } = req.body;
    try {
        const _customer_id = parseNumericId(customer_id);
        const _type = parseNumericId(type) || 1;

        const role_name = await getUserRoleName(req.token_data.admin_id);
        const { developerId, emailId } = await getCustomerDeveloperInfo(_customer_id);

        if (_customer_id <= 0 || !product_id?.length) {
            const dateValidation = validateAnalyticsDateRange(from_date, upto_date);
            if (!dateValidation.valid) {
                return res.status(200).json(success(false, res.statusCode, dateValidation.message, null));
            }
        }

        const { fromDate, uptoDate } = prepareAnalyticsDateFilters(from_date, upto_date);
        const requestId = `${uuidv4()}_${moment().format('YYYYMMDD_HHmmss')}`;

        const insertQuery = `INSERT INTO analytics_file_object(request_id, added_by, added_date, status) VALUES (?, ?, ?, ?) RETURNING "file_id"`;
        const insertParams = [requestId, req.token_data.account_id, db.get_ist_current_date(), STATUS_TYPE.Pending];
        const [rowOut] = await db.sequelize.query(insertQuery, { replacements: insertParams, type: QueryTypes.INSERT });
        const file_id = rowOut?.[0]?.file_id || 0;

        if (file_id <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Unable to insert request id, Please try again.", null));
        }

        logAnalyticsFileRequest(req.token_data, requestId, insertQuery, insertParams);

        const filePath = path.join(__dirname, `../../uploads/download_excel/${requestId}.xlsx`);
        await fs.ensureDir(path.join(__dirname, '../../uploads/download_excel'));

        const options = { filePath, requestId, type: _type, roleName: role_name, developerId, fromDate, uptoDate, emailId };
        generateExcelFile(req, options);

        res.status(200).json(success(true, res.statusCode, "Excel generation started.", { request_id: requestId }));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const generateExcelFile = async (req, options) => {
    const { filePath, requestId, type, roleName, emailId, fromDate, uptoDate } = options;
    const { search_text, product_id, from_date, upto_date } = req.body;
    try {
        const _search_text = search_text?.length > 0 ? search_text : "";
        const isAdmin = roleName === 'Administrator';
        const table_name = type === 1 ? 'apigee_logs_prod' : 'apigee_logs';
        const pageSize = 20000;

        const workbook = new excel.stream.xlsx.WorkbookWriter({ filename: filePath });
        const addHeaders = (ws) => ws.addRow(getAnalyticsGenerateHeaders(isAdmin)).commit();

        let context = {
            workbook, isAdmin, maxRowsPerSheet: 1048576, addHeaders,
            worksheet: workbook.addWorksheet('Sheet 1'), sheetIndex: 1, currentRow: 0
        };
        addHeaders(context.worksheet);

        let currentPage = 1;
        let hasMoreData = true;

        while (hasMoreData) {
            const { conditions, replacements } = buildAnalyticsGenerateConditions({
                emailId, searchText: _search_text, productId: product_id,
                fromDate, uptoDate, fromDateRaw: from_date, uptoDateRaw: upto_date
            });
            replacements.page_size = pageSize;
            replacements.page_no = currentPage;

            let query = getAnalyticsGenerateQuery(table_name);
            if (conditions.length > 0) {
                query += ' WHERE ' + conditions.join(' AND ');
            }
            query += ` ORDER BY ax_created_time DESC LIMIT :page_size OFFSET ((:page_no - 1) * :page_size)`;

            const pageData = await db.sequelize2.query(query, { replacements, type: QueryTypes.SELECT, raw: true });

            if (pageData?.length > 0) {
                context = processExcelRowsWithSheetManagement(pageData, context);
                currentPage++;
            } else {
                hasMoreData = false;
            }
        }

        await workbook.commit();
        await updateAnalyticsFileStatus(requestId, STATUS_TYPE.Completed);
        console.log(`Excel file generated successfully: ${filePath}`);
    } catch (err) {
        console.error("Error generating Excel file:", err);
        await updateAnalyticsFileStatus(requestId, STATUS_TYPE.Failed);
    }
};

const customer_analytics_reports_download = async (req, res, next) => {
    const { request_id } = req.body;
    try {
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
            const filePath = path.join(__dirname, `../../uploads/download_excel/${request_id}.xlsx`);
            if (fs.existsSync(filePath)) {
                // Update status to "Downloaded" after successful download
                try {
                    const _query1 = `UPDATE analytics_file_object SET status = ? WHERE request_id = ?`;
                    const _replacements2 = [STATUS_TYPE.Downloaded, request_id];
                    await db.sequelize.query(_query1, { replacements: _replacements2, type: QueryTypes.UPDATE });
                } catch (error) {
                    console.log("=========error==========", error);
                }

                setTimeout(() => {
                    fs.unlink(filePath, (err) => {
                        if (err) {
                            console.error("Error deleting file:", err);
                        }
                    });
                }, 10000);

                const data = {
                    status: 'Completed',
                    downloadUrl: `uploads/download_excel/${request_id}.xlsx`
                }
                return res.status(200).json(success(true, res.statusCode, "Report is completed.", data));
            } else {
                return res.status(404).json(success(false, res.statusCode, 'File not found.', null));
            }
        } else {
            return res.status(202).json(success(false, res.statusCode, "Report is still being generated.", null));
        }
    } catch (err) {
        console.error("Error during download:", err);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

/* analytics reports end*/

const approve_customer_dropdown = async (req, res, next) => {
    try {
        const { CstCustomer } = db.models;

        const rows = await CstCustomer.findAll({
            where: {
                is_deleted: false,
                is_approved: { [Op.gt]: 0 }
            },
            attributes: ['customer_id', 'first_name', 'last_name'],
            raw: true
        });

        let list = rows.map(item => ({
            customer_id: item.customer_id,
            full_name: `${item.first_name || ''} ${item.last_name || ''}`.trim(),
        }));

        return res.status(200).json(success(true, res.statusCode, "", list));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const customer_wallets_balance_add = async (req, res, next) => {
    const { customer_id, wallets_amount, transaction_type, description } = req.body;
    try {
        const { CstCustomer, CstWallets } = db.models;
        let _customer_id = customer_id && validator.isNumeric(customer_id.toString()) ? parseInt(customer_id) : 0;
        let _transaction_type = transaction_type && validator.isNumeric(transaction_type.toString()) ? parseInt(transaction_type) : 1; //type credit=1 and debit=2

        if (!wallets_amount || wallets_amount.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter wallets amount.", null));
        }

        const row0 = await CstCustomer.findOne({
            where: { customer_id: _customer_id, is_deleted: false },
            attributes: ['customer_id', 'wallets_amount', 'wallets_amt_updated_date', 'developer_id', 'is_enabled', 'email_id', 'is_live_sandbox'],
            raw: true
        });

        if (!row0) {
            return res.status(200).json(success(false, res.statusCode, "Customer details not found, Please try again.", null));
        }

        const existingTotalBalance = parseFloat(row0.wallets_amount);
        if (_transaction_type == 1) {
            await db.update_apigee_wallet_balance(_customer_id, parseFloat(wallets_amount));
        } else {
            await db.debited_apigee_wallet_balance(_customer_id, parseFloat(wallets_amount));
        }

        const newWallet = await CstWallets.create({
            customer_id: customer_id,
            amount: parseFloat(wallets_amount),
            added_date: db.get_ist_current_date(),
            description: description,
            transaction_type: _transaction_type,
            previous_amount: existingTotalBalance
        });

        const _new_wallet_id = newWallet?.wallet_id || 0;
        if (_new_wallet_id > 0) {
            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: 0,
                    account_id: (req.token_data.account_id),
                    user_type: 2,
                    user_id: customer_id,
                    narration: 'wallets balance history added',
                    query: `CstWallets.create({ customer_id: ${customer_id}, amount: ${wallets_amount} })`,
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }

            return res.status(200).json(success(true, res.statusCode, "wallets Amount updated succefully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to add wallets amount, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const customer_wallets_balance_details_get = async (req, res, next) => {
    const { page_no, customer_id, search_text, transaction_type, from_date, upto_date } = req.body;
    try {
        const { CstCustomer, CstWallets } = db.models;
        let _customer_id = customer_id && validator.isNumeric(customer_id.toString()) ? parseInt(customer_id) : 0;
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0;

        const row2 = await CstCustomer.findOne({
            where: { customer_id: _customer_id, is_deleted: false },
            attributes: ['customer_id', 'first_name', 'last_name', 'wallets_amount', 'is_enabled', 'email_id'],
            raw: true
        });

        if (!row2) {
            return res.status(200).json(success(false, res.statusCode, "Customer details not found, Please try again.", null));
        }

        if (_page_no <= 0) { _page_no = 1; }

        const pageSize = parseInt(process.env.PAGINATION_SIZE);
        const offset = (_page_no - 1) * pageSize;

        const total_record = await CstWallets.count({ where: { customer_id: _customer_id } });

        // Build where clause dynamically
        const whereClause = { customer_id: _customer_id };

        if (search_text) {
            whereClause.description = { [Op.iLike]: `%${search_text}%` };
        }
        if (transaction_type) {
            whereClause.transaction_type = transaction_type;
        }
        if (from_date) {
            whereClause.added_date = { ...whereClause.added_date, [Op.gte]: new Date(from_date) };
        }
        if (upto_date) {
            const endDate = new Date(upto_date);
            endDate.setHours(23, 59, 59, 999);
            whereClause.added_date = { ...whereClause.added_date, [Op.lte]: endDate };
        }

        const rows = await CstWallets.findAll({
            where: whereClause,
            attributes: ['wallet_id', 'amount', 'previous_amount', 'added_date', 'transaction_type', 'description'],
            order: [['wallet_id', 'DESC']],
            limit: pageSize,
            offset: offset,
            raw: true
        });

        if (rows?.length) {
            let _wallets_data = rows.map((item, index) => ({
                sr_no: offset + index + 1,
                amount: item.amount,
                previous_amount: item.previous_amount,
                transaction_type: item.transaction_type == 1 ? "Credited" : "Debited",
                description: item.description,
                added_date: item.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.added_date)) : "",
            }));

            const results = {
                current_page: _page_no,
                total_pages: Math.ceil(total_record / pageSize),
                first_name: row2.first_name,
                last_name: row2.last_name,
                email_id: row2.email_id,
                total_wallets_amount: row2.wallets_amount,
                data: _wallets_data,
            };

            return res.status(200).json(success(true, res.statusCode, "Wallets Amount Data.", results));
        } else {
            const results = {
                current_page: _page_no,
                total_pages: '',
                first_name: row2.first_name,
                last_name: row2.last_name,
                email_id: row2.email_id,
                total_wallets_amount: row2.wallets_amount,
                data: [],
            };
            return res.status(200).json(success(true, res.statusCode, "Unable to find Wallets Amount detail, Please try again.", results));
        }

    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const customer_wallets_balance_history_export = async (req, res, next) => {
    const { customer_id, search_text, transaction_type, from_date, upto_date } = req.body;
    try {
        const { CstCustomer, CstWallets } = db.models;

        const row2 = await CstCustomer.findOne({
            where: { customer_id: customer_id, is_deleted: false },
            attributes: ['customer_id', 'first_name', 'last_name', 'wallets_amount', 'is_enabled', 'email_id'],
            raw: true
        });

        if (!row2) {
            return res.status(200).json(success(false, res.statusCode, "Customer details not found, Please try again.", null));
        }

        // Build where clause dynamically
        const whereClause = { customer_id: customer_id };

        if (search_text) {
            whereClause.description = { [Op.iLike]: `%${search_text}%` };
        }
        if (transaction_type) {
            whereClause.transaction_type = transaction_type;
        }
        if (from_date) {
            whereClause.added_date = { ...whereClause.added_date, [Op.gte]: new Date(from_date) };
        }
        if (upto_date) {
            const endDate = new Date(upto_date);
            endDate.setHours(23, 59, 59, 999);
            whereClause.added_date = { ...whereClause.added_date, [Op.lte]: endDate };
        }

        const rows = await CstWallets.findAll({
            where: whereClause,
            attributes: ['wallet_id', 'amount', 'previous_amount', 'added_date', 'transaction_type', 'description'],
            order: [['wallet_id', 'DESC']],
            raw: true
        });

        if (rows?.length) {
            let list = rows.map((item, index) => ({
                sr_no: index + 1,
                email_id: row2.email_id,
                added_date: item.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.added_date)) : "",
                wallets_amount: item.amount,
                transaction_type: item.transaction_type == 1 ? "Credited" : "Debited",
                description: item.description,
            }));

            const workbook = new excel.Workbook();
            const worksheet = workbook.addWorksheet('Sheet 1');
            const headers = ['Sr No', 'Email-ID', 'Transaction Date', 'Wallets Amount', 'Transaction Type', 'Description'];
            const headerRow = worksheet.addRow(headers);
            headerRow.eachCell((cell, colNumber) => {
                cell.font = { bold: true };
            });
            for (const item of list) {
                const rowValues = Object.values(item);
                worksheet.addRow(rowValues);
            }
            const excelBuffer = await workbook.xlsx.writeBuffer();
            res.setHeader('Content-Length', excelBuffer.length);
            res.send(excelBuffer);
        } else {
            const workbook = new excel.Workbook();
            const worksheet = workbook.addWorksheet('Sheet 1');
            const headers = ['Sr No', 'Email-ID', 'Transaction Date', 'Credit', 'Transaction Type', 'Description'];
            const headerRow = worksheet.addRow(headers);
            headerRow.eachCell((cell, colNumber) => {
                cell.font = { bold: true };
            });
            const excelBuffer = await workbook.xlsx.writeBuffer();
            res.setHeader('Content-Length', excelBuffer.length);
            res.send(excelBuffer);
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const customer_billing_type_toggle = async (req, res, next) => {
    const { customer_id } = req.body;
    try {
        const { CstCustomer } = db.models;
        const _customer_id = parseNumericId(customer_id);

        const row1 = await CstCustomer.findOne({
            where: { customer_id: _customer_id, is_deleted: false },
            attributes: ['customer_id', 'developer_id', 'is_enabled', 'email_id', 'billing_type'],
            raw: true
        });

        if (!row1) {
            return res.status(200).json(success(false, res.statusCode, "Customer details not found, Please try again.", null));
        }
        if (!row1.developer_id) {
            return res.status(400).json(success(false, res.statusCode, "You do not have an Apigee developer ID. First, approve the customer.", null));
        }
        if (!row1.email_id?.length) {
            return res.status(200).json(success(false, res.statusCode, "Customer email not found.", null));
        }

        const billing_type = row1.billing_type === 'PREPAID' ? 'POSTPAID' : 'PREPAID';
        const responseStatus = await updateApigeeBillingType(row1.email_id, billing_type);

        if (responseStatus === 204) {
            return res.status(200).json(success(true, res.statusCode, "Customer Billing Type status changed successfully.", null));
        }

        const [affectedRows] = await CstCustomer.update(
            { billing_type, billing_type_modified_date: db.get_ist_current_date(), billing_type_modify_by: req.token_data.account_id },
            { where: { customer_id: _customer_id } }
        );

        if (affectedRows <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Unable to change, Please try again.", null));
        }

        logCustomerAction(req.token_data, `Customer Billing Type Modified ${billing_type}. Customer email = ${row1.email_id}`,
            `CstCustomer.update({ billing_type: '${billing_type}' }, { where: { customer_id: ${_customer_id} }})`);
        return res.status(200).json(success(true, res.statusCode, "Customer Billing Type status changed successfully.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const customer_apigee_balance_update = async (req, res, next) => {
    const { customer_id } = req.body;
    try {
        const { CstCustomer } = db.models;
        let _customer_id = customer_id && validator.isNumeric(customer_id.toString()) ? parseInt(customer_id) : 0;

        const row1 = await CstCustomer.findOne({
            where: { customer_id: _customer_id, is_deleted: false },
            attributes: ['customer_id', 'developer_id', 'is_enabled', 'email_id', 'billing_type'],
            raw: true
        });

        if (!row1) {
            return res.status(200).json(success(false, res.statusCode, "Customer details not found, Please try again.", null));
        }
        await db.get_apigee_wallet_balance(_customer_id);
        return res.status(200).json(success(true, res.statusCode, "Apigee wallet balance fetch success.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};



export default {
    customer_to_approve,
    customer_to_activate,
    customer_search_list,
    customer_approve,
    customer_approve_auto,
    send_approved_email,
    customer_activate,
    customer_toggle,
    customer_delete,
    all_customer_excel,
    pending_customer_excel,
    activation_customer_excel,
    sandbox_customer_add,
    customer_credit_add,
    customer_credit_details_get,
    customer_search_list_sandbox,
    sandbox_customer_excel,
    all_customer_dropdown,
    sandbox_customer_add_existing,
    customer_toggle_sandbox,
    credits_transaction_export,
    customer_app_list_get,
    customer_analytics_reports_export,
    approve_customer_dropdown,

    analytics_reports_generate_excel,
    customer_analytics_reports_download,

    customer_wallets_balance_details_get,
    customer_wallets_balance_add,
    customer_wallets_balance_history_export,
    customer_billing_type_toggle,
    customer_apigee_balance_update
};
