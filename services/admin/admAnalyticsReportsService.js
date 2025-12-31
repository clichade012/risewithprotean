import { logger as _logger, action_logger } from '../../logger/winston.js';
import db from '../../database/db_helper.js';
import { QueryTypes, Op, fn, col } from 'sequelize';
import { success } from "../../model/responseModel.js";
import dateFormat from 'date-format';
import validator from 'validator';
import excel from 'exceljs';
import correlator from 'express-correlation-id';
import { STATUS_TYPE, EmailTemplates } from "../../model/enumModel.js";
import cloudStorage from "../cloudStorage.js";
import moment from 'moment';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import cron from 'node-cron';
import emailTransporter from "../../services/emailService.js";
import * as sftpHelper from '../../modules/sftpHelper.js';
import { Parser } from 'json2csv';
const PAGINATION_SIZE = process.env.PAGINATION_SIZE;

const customer_analytics_reports_get = async (req, res, next) => {
    const { page_no, customer_id, search_text, product_id, from_date, upto_date, type } = req.body;
    try {
        let _customer_id = customer_id && validator.isNumeric(customer_id.toString()) ? parseInt(customer_id) : 0;
        let _search_text = search_text && search_text.length > 0 ? search_text : "";
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0;
        let _type = type && validator.isNumeric(type.toString()) ? parseInt(type) : 0;// 1 = prod and 2 = UAT
        let email_id = '';
        let previousfrom_Date = '';
        if (from_date) {
            let date = new Date(from_date);
            date.setDate(date.getDate() - 1);
            previousfrom_Date = date.toISOString().split('T')[0];
        }

        let from_dateTime = '18:30:00.000 UTC';
        let to_dateTime = '18:29:59.999 UTC';
        let _from_date = previousfrom_Date + ' ' + from_dateTime;
        let _upto_date = upto_date + ' ' + to_dateTime;
        if (_page_no <= 0) { _page_no = 1; } if (_type <= 0) { _type = 1; }
        const table_name = _type == 1 ? 'apigee_logs_prod' : 'apigee_logs';
        const customer = await getCustomerById(_customer_id);
        if (customer) {
            email_id = customer.email_id;
            //  developerId = customer.developer_id;
        }


        const total_record = await fetchTotalRecordCount(table_name, _search_text, product_id, _from_date, _upto_date, email_id);
        const reports = await fetchReportsData(table_name, _search_text, product_id, _from_date, _upto_date, _page_no, email_id);

        if (reports && reports.length > 0) {
            const results = {
                current_page: _page_no,
                total_pages: Math.ceil(total_record / process.env.PAGINATION_SIZE),
                total_record: total_record,
                data: reports,
            };

            return res.status(200).json(success(true, res.statusCode, "Reports Data.", results));
        } else {
            const results = { current_page: _page_no, total_pages: '', data: [], };
            return res.status(200).json(success(true, res.statusCode, "Unable to find reports detail, Please try again.", results));
        }

    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

/**
 * Fetches paginated report data.
 * @param {string} tableName - Database table name
 * @param {string} emailId - Customer email ID
 * @returns {Promise<Array>} - Formatted report data
 */
const fetchReportsData = async (tableName, searchText, productId, fromDate, uptoDate, pageNo, emailId) => {
    const { query, replacements } = buildQuery(`SELECT ROW_NUMBER() OVER(ORDER BY ax_created_time DESC) AS sr_no, 
        id, organization, environment, apiproxy, request_uri, proxy, proxy_basepath, request_verb, request_size, response_status_code,
        is_error, client_received_start_timestamp, client_received_end_timestamp, target_sent_start_timestamp, target_sent_end_timestamp, 
        target_received_start_timestamp, target_received_end_timestamp, client_sent_start_timestamp, client_sent_end_timestamp, client_ip, 
        client_id, REPLACE(developer, 'apigeeprotean@@@', '') AS developer, developer_app, api_product, flow_resource, target, target_url,
        target_host, apiproxy_revision, proxy_pathsuffix, proxy_client_ip, target_basepath, target_ip, request_path, response_size, developer_email, virtual_host, gateway_flow_id, message_count, 
        total_response_time, request_processing_latency, response_processing_latency, target_response_time, 
        target_response_code, target_error, policy_error, ax_created_time,  dc_api_product, dc_api_resource, 
        dc_developer_app, dc_developer_app_display_name, dc_developer_email, dc_flow_type, dc_response_code_gateway, dc_response_code_target,
        dc_functional_error_code, x_apigee_mintng_rate, dc_functional_success_code, dc_api_name, dc_api_request_id, dc_case_id, dc_req_path, 
        dc_target_req_path, dc_karzastauscode AS karza_status_code, dc_backendstatusreason AS response_description,
        dc_signzyresponseid AS id_field_from_signzy_response, x_apigee_mintng_price_multiplier, x_apigee_mintng_rate,
        x_apigee_mintng_rate::FLOAT / NULLIF(x_apigee_mintng_price_multiplier::FLOAT, 0) AS rate_plan_rate, dc_billing_type, dc_programid 
        FROM ${tableName}`, { searchText, productId, fromDate, uptoDate, emailId, pageNo, pageSize: PAGINATION_SIZE });

    const rows = await db.sequelize2.query(query, { replacements, type: QueryTypes.SELECT, });

    return rows.map(row => formatReportData(row));
};


const formatReportData = (item) => ({
    sr_no: item.sr_no,
    id: item.id,
    organization: item.organization,
    environment: item.environment,
    apiproxy: item.apiproxy,
    request_uri: item.request_uri,
    proxy: item.proxy,
    proxy_basepath: item.proxy_basepath,
    request_size: item.request_size,
    response_status_code: item.response_status_code,
    is_error: item.is_error,
    client_received_start_timestamp: item.client_received_start_timestamp,
    client_received_end_timestamp: item.client_received_end_timestamp,
    target_sent_start_timestamp: item.target_sent_start_timestamp,
    target_sent_end_timestamp: item.target_sent_end_timestamp,
    target_received_start_timestamp: item.target_received_start_timestamp,
    target_received_end_timestamp: item.target_received_end_timestamp,
    client_sent_start_timestamp: item.client_sent_start_timestamp,
    client_sent_end_timestamp: item.client_sent_end_timestamp,

    ist_client_received_start_timestamp: db.convertUTCtoIST(item.client_received_start_timestamp) || '',
    ist_client_received_end_timestamp: db.convertUTCtoIST(item.client_received_end_timestamp) || '',
    ist_target_sent_start_timestamp: db.convertUTCtoIST(item.target_sent_start_timestamp) || '',
    ist_target_sent_end_timestamp: db.convertUTCtoIST(item.target_sent_end_timestamp) || '',
    ist_target_received_start_timestamp: db.convertUTCtoIST(item.target_received_start_timestamp) || '',
    ist_target_received_end_timestamp: db.convertUTCtoIST(item.target_received_end_timestamp) || '',
    ist_client_sent_start_timestamp: db.convertUTCtoIST(item.client_sent_start_timestamp) || '',
    ist_client_sent_end_timestamp: db.convertUTCtoIST(item.client_sent_end_timestamp) || '',

    client_ip: item.client_ip,
    client_id: item.client_id,
    developer: item.developer,
    developer_app: item.developer_app,
    api_product: item.api_product,
    flow_resource: item.flow_resource,
    target_url: item.target_url,
    target_host: item.target_host,
    apiproxy_revision: item.apiproxy_revision,
    proxy_pathsuffix: item.proxy_pathsuffix,
    proxy_client_ip: item.proxy_client_ip,
    target_basepath: item.target_basepath,
    target_ip: item.target_ip,
    request_path: item.request_path,
    response_size: item.response_size,
    developer_email: item.developer_email,
    virtual_host: item.virtual_host,
    gateway_flow_id: item.gateway_flow_id,
    message_count: item.message_count,
    total_response_time: item.total_response_time,
    request_processing_latency: item.request_processing_latency,
    response_processing_latency: item.response_processing_latency,
    target_response_time: item.target_response_time,
    target_response_code: item.target_response_code,
    target: item.target,
    _error: item._error,
    policy_error: item.policy_error,
    ax_created_time: item.ax_created_time,
    ax_created_time_ist: item.ax_created_time,
    dc_api_product: item.dc_api_product,
    dc_api_resource: item.dc_api_resource,
    dc_developer_app: item.dc_developer_app,
    dc_developer_app_display_name: item.dc_developer_app_display_name,
    dc_developer_email: item.dc_developer_email,
    dc_flow_type: item.dc_flow_type,
    dc_response_code_gateway: item.dc_response_code_gateway,
    dc_response_code_target: item.dc_response_code_target,
    dc_functional_error_code: item.dc_functional_error_code,
    dc_functional_success_code: item.dc_functional_success_code,
    dc_api_name: item.dc_api_name,
    dc_api_request_id: item.dc_api_request_id,
    dc_case_id: item.dc_case_id,
    dc_req_path: item.dc_req_path,
    dc_target_req_path: item.dc_target_req_path,
    karza_status_code: item.karza_status_code || '',
    response_description: item.response_description || '',
    id_field_from_signzy_response: item.id_field_from_signzy_response || '',
    // dc_perUnitPriceMultiplyer: item.dc_perUnitPriceMultiplyer,
    x_apigee_mintng_price_multiplier: '',//item.x_apigee_mintng_price_multiplier,
    x_apigee_mintng_rate: '',//item.x_apigee_mintng_rate,
    rate_plan_rate: '',//|| item.rate_plan_rate,
    billing_type: item.dc_billing_type,
    dc_programid: item.dc_programid,
});

/**
 * Builds a query with conditions and replacements.
 * @param {string} baseQuery - Base SQL query
 * @param {Object} params - Query parameters
 * @returns {Object} - Query string and replacements
 */
const buildQuery = (baseQuery, { searchText, productId, fromDate, uptoDate, emailId, pageNo, pageSize, isCountQuery = false }) => {
    const conditions = [];
    const replacements = {};

    if (emailId) {
        conditions.push('developer_email = :email_id');
        replacements.email_id = emailId;
    }
    if (searchText) {
        conditions.push('target_host ILIKE :search_text');
        replacements.search_text = `%${searchText}%`;
    }
    if (productId) {
        conditions.push('api_product = :product_id');
        replacements.product_id = productId;
    }
    if (fromDate) {
        conditions.push('ax_created_time >= :from_date');
        replacements.from_date = fromDate;
    }
    if (uptoDate) {
        conditions.push('ax_created_time <= :upto_date');
        replacements.upto_date = uptoDate;
    }

    if (conditions.length) {
        baseQuery += ` WHERE ${conditions.join(' AND ')}`;
    }

    if (!isCountQuery) {
        baseQuery += ' ORDER BY ax_created_time DESC';
        if (pageNo && pageSize) {
            replacements.page_size = pageSize;
            replacements.page_no = pageNo;
            baseQuery += ' LIMIT :page_size OFFSET ((:page_no - 1) * :page_size)';
        }
    }


    return { query: baseQuery, replacements };
};

/**
 * Fetches total record count for pagination.
 * @param {string} tableName - Database table name
 * @param {Object} params - Validated parameters
 * @param {string} emailId - Customer email ID
 * @returns {Promise<number>} - Total number of records
 */
const fetchTotalRecordCount = async (tableName, searchText, productId, fromDate, uptoDate, emailId) => {
    const { query, replacements } = buildQuery(`SELECT count(1) AS total_record FROM ${tableName}`,
        { searchText, productId, fromDate, uptoDate, emailId, isCountQuery: true }
    );
    const [result] = await db.sequelize2.query(query, { replacements, type: QueryTypes.SELECT, });
    return result?.total_record || 0;
};

const HEADERS = {
    Administrator: [
        'Sr No', 'Developer', 'Developer Email', 'API Product', 'Target URL', 'Target Host', 'Target Response Code',
        'DC API Name', 'DC API Product', 'DC API Request ID', 'DC Case ID', 'DC Req Path', 'Developer App', 'Request Path',
        'Total Response Time', 'Request Processing Latency', 'Response Processing Latency', 'Karza Status Code', 'Program ID',
        'Response Description', 'ID Field from Signzy Response', 'Response Status Code', ' Price Multiplier',
        'Final Rate', 'Rate Plan Rate', 'Billing Type', 'Target Response Time',
        'Client Received End Timestamp', 'Target Sent End Timestamp', 'Target Received End Timestamp',
        'Client Sent End Timestamp', 'Client Received End Timestamp (IST)', 'Target Sent End Timestamp (IST)',
        'Target Received End Timestamp (IST)', 'Client Sent End Timestamp (IST)'
    ],
    Default: [
        'Sr No', 'Developer', 'Developer Email', 'API Product', 'Target Host', 'Target Response Code', 'DC API Name',
        'DC API Product', 'DC API Request ID', 'DC Case ID', 'Request Path', 'Total Response Time', 'Karza Status Code', 'Program ID', 'Response Description',
        'ID Field from Signzy Response', 'Response Status Code', ' Price Multiplier', 'Final Rate', 'Rate Plan Rate', 'Billing Type', 'Target Response Time', 'Client Received End Timestamp',
        'Target Sent End Timestamp', 'Target Received End Timestamp', 'Client Sent End Timestamp',
        'Client Received End Timestamp (IST)', 'Target Sent End Timestamp (IST)', 'Target Received End Timestamp (IST)',
        'Client Sent End Timestamp (IST)'
    ],
};

// Helper: Build Excel export query with conditions
function buildExcelExportQuery(tableName, params) {
    const { email_id, search_text, product_id, from_date, upto_date, _from_date, _upto_date, currentPage, pageSize } = params;

    let query = `SELECT ROW_NUMBER() OVER(ORDER BY ax_created_time DESC) AS sr_no,
        id, organization, environment, apiproxy, request_uri, proxy, response_status_code,
        is_error, client_received_start_timestamp, client_received_end_timestamp, target_sent_start_timestamp, target_sent_end_timestamp,
        target_received_start_timestamp, target_received_end_timestamp, client_sent_start_timestamp, client_sent_end_timestamp, client_ip,
        client_id, REPLACE(developer, 'apigeeprotean@@@', '') AS developer, developer_app, api_product, target, target_url,
        target_host, proxy_client_ip, target_basepath, target_ip, request_path, developer_email, total_response_time, request_processing_latency,
        response_processing_latency, target_response_time, target_response_code, ax_created_time, dc_api_product, dc_api_resource,
        dc_developer_app, dc_developer_app_display_name, dc_developer_email, dc_api_name, dc_api_request_id, dc_case_id,
        dc_req_path, dc_karzastauscode AS karza_status_code, dc_backendstatusreason AS response_description,
        dc_signzyresponseid AS id_field_from_signzy_response, x_apigee_mintng_price_multiplier, x_apigee_mintng_rate,
        x_apigee_mintng_rate::FLOAT / NULLIF(x_apigee_mintng_price_multiplier::FLOAT, 0) AS rate_plan_rate, dc_billing_type, dc_programid FROM ${tableName}`;

    const conditions = [];
    const replacements = { page_size: pageSize, page_no: currentPage };

    if (email_id?.length > 0) {
        conditions.push('developer_email = :email_id');
        replacements.email_id = email_id;
    }
    if (search_text?.length > 0) {
        conditions.push('target_host ILIKE :search_text');
        replacements.search_text = `%${search_text}%`;
    }
    if (product_id?.length > 0) {
        conditions.push('api_product = :product_id');
        replacements.product_id = product_id;
    }
    if (from_date) {
        conditions.push('ax_created_time >= :from_date');
        replacements.from_date = _from_date;
    }
    if (upto_date) {
        conditions.push('ax_created_time <= :upto_date');
        replacements.upto_date = _upto_date;
    }

    if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY ax_created_time DESC LIMIT :page_size OFFSET ((:page_no - 1) * :page_size)';

    return { query, replacements };
}

// Helper: Process rows and manage worksheet sheets
function processExcelRows(pageData, context) {
    const { worksheet, workbook, role_name, maxRowsPerSheet } = context;
    let { currentRow, sheetIndex } = context;
    let currentWorksheet = worksheet;

    const addHeaders = (ws) => ws.addRow(HEADERS[role_name] || HEADERS.Default).commit();

    for (const row of pageData) {
        if (currentRow > maxRowsPerSheet) {
            currentWorksheet.commit();
            sheetIndex++;
            currentWorksheet = workbook.addWorksheet(`Sheet ${sheetIndex}`);
            addHeaders(currentWorksheet);
            currentRow = 1;
        }
        try {
            currentWorksheet.addRow(formatRowData(row, role_name)).commit();
            currentRow++;
        } catch (err) {
            console.log("Error adding row to worksheet:", err);
        }
    }

    return { worksheet: currentWorksheet, currentRow, sheetIndex };
}

const generateExcelFile = async (req, { filePath, requestId, _type, role_name, _from_date, _upto_date, email_id }) => {
    const { search_text, product_id, from_date, upto_date } = req.body;
    try {
        console.log("---------generateExcelFile-----------", filePath, requestId, _type, role_name, _from_date, _upto_date, email_id);

        const _search_text = search_text?.length > 0 ? search_text : "";
        const workbook = new excel.stream.xlsx.WorkbookWriter({ filename: filePath });
        const table_name = _type == 1 ? 'apigee_logs_prod' : 'apigee_logs';
        const pageSize = 20000;
        const maxRowsPerSheet = 1048570;

        let worksheet = workbook.addWorksheet('Sheet 1');
        worksheet.addRow(HEADERS[role_name] || HEADERS.Default).commit();

        let currentPage = 1;
        let context = { worksheet, workbook, role_name, maxRowsPerSheet, currentRow: 0, sheetIndex: 1 };

        while (true) {
            const { query, replacements } = buildExcelExportQuery(table_name, {
                email_id, search_text: _search_text, product_id, from_date, upto_date, _from_date, _upto_date, currentPage, pageSize
            });

            const pageData = await db.sequelize2.query(query, { replacements, type: QueryTypes.SELECT, raw: true });

            if (!pageData?.length) break;

            context = processExcelRows(pageData, context);
            currentPage++;
        }

        await workbook.commit();
        await uploadToCloudStorage(filePath, requestId);
        console.log(`Excel file generated successfully: ${filePath}`);
    } catch (err) {
        console.error('Error generating Excel file:', err);
        await updateAnalyticsStatus(requestId, STATUS_TYPE.Failed, '', '');
        throw err;
    }
};

/**
 * Updates the analytics_file_object table with the status and file details.
 * @param {string} requestId - Unique request ID
 * @param {string} status - Status of the operation
 * @param {string} filePath - File path in cloud storage
 * @param {string} fileName - Name of the file
 */
const updateAnalyticsStatus = async (requestId, status, filePath, fileName) => {
    const { AnalyticsFileObject } = db.models;
    await AnalyticsFileObject.update(
        { status: status, file_path: filePath, file_name: fileName },
        { where: { request_id: requestId } }
    );
};

/**
 * Uploads the Excel file to cloud storage and updates the database.
 * @param {string} filePath - Path to the Excel file
 * @param {string} requestId - Unique request ID
 */
const uploadToCloudStorage = async (filePath, requestId) => {
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }
    const fileName = `analytics_data/${requestId}.xlsx`;
    const excelRes = await cloudStorage.UploadFile(filePath, fileName, true);
    const excelFilePath = `${process.env.BUCKET_URL}/${excelRes.bucket}/${excelRes.name}`;
    await updateAnalyticsStatus(requestId, STATUS_TYPE.Completed, excelFilePath, requestId);
    db.delete_file_by_path(filePath);
};

const formatRowData = (row, roleName) => {
    const commonFields = [
        row.sr_no, row.developer, row.developer_email, row.api_product, row.target_host,
        row.target_response_code, row.dc_api_name, row.dc_api_product, row.dc_api_request_id, row.dc_case_id,
        row.request_path, row.total_response_time, row.karza_status_code || '', row.dc_programid, row.response_description || '',
        row.id_field_from_signzy_response || '', row.response_status_code, '',
        '', '', row.dc_billing_type, row.target_response_time,
        row.client_received_end_timestamp, row.target_sent_end_timestamp, row.target_received_end_timestamp,
        row.client_sent_end_timestamp,
        db.convertUTCtoIST(row.client_received_end_timestamp),
        db.convertUTCtoIST(row.target_sent_end_timestamp),
        db.convertUTCtoIST(row.target_received_end_timestamp),
        db.convertUTCtoIST(row.client_sent_end_timestamp),];

    if (roleName === 'Administrator') {
        return [
            row.sr_no, row.developer, row.developer_email, row.api_product, row.target_url, row.target_host,
            row.target_response_code, row.dc_api_name, row.dc_api_product, row.dc_api_request_id, row.dc_case_id,
            row.dc_req_path, row.developer_app, row.request_path, row.total_response_time, row.request_processing_latency,
            row.response_processing_latency, row.karza_status_code || '', row.dc_programid, row.response_description || '',
            row.id_field_from_signzy_response || '', row.response_status_code, row.x_apigee_mintng_price_multiplier,
            row.x_apigee_mintng_rate, row.rate_plan_rate, row.dc_billing_type, row.target_response_time,
            row.client_received_end_timestamp, row.target_sent_end_timestamp, row.target_received_end_timestamp,
            row.client_sent_end_timestamp,
            db.convertUTCtoIST(row.client_received_end_timestamp),
            db.convertUTCtoIST(row.target_sent_end_timestamp),
            db.convertUTCtoIST(row.target_received_end_timestamp),
            db.convertUTCtoIST(row.client_sent_end_timestamp)
        ];
    }

    return commonFields;
};

async function getCustomerById(customerId) {
    if (!customerId || customerId <= 0) { return null; }
    const { CstCustomer } = db.models;
    const result = await CstCustomer.findOne({
        where: { customer_id: customerId, is_deleted: false },
        attributes: ['customer_id', 'developer_id', 'first_name', 'last_name', 'email_id'],
        raw: true
    });
    return result || null;
}

// Helper: Parse numeric value with validation
function parseNumericValue(value, defaultVal = 0) {
    return value && validator.isNumeric(value.toString()) ? parseInt(value) : defaultVal;
}

// Helper: Validate date range for excel export
function validateDateRange(from_date, upto_date) {
    if (!from_date || from_date.length <= 0 || !validator.isDate(from_date)) {
        return { valid: false, message: "Please select a valid from date." };
    }
    if (!upto_date || upto_date.length <= 0 || !validator.isDate(upto_date)) {
        return { valid: false, message: "Please select a valid upto date." };
    }
    const dateDifference = moment(upto_date).diff(moment(from_date), 'days');
    if (dateDifference > 32) {
        return { valid: false, message: "Date range should not be greater than 31 days." };
    }
    return { valid: true };
}

// Helper: Calculate previous date and format date ranges
function calculateDateRanges(from_date, upto_date) {
    const from_dateTime = '18:30:00.000 UTC';
    const to_dateTime = '18:29:59.999 UTC';

    let previousfrom_Date = '';
    if (from_date) {
        const date = new Date(from_date);
        date.setDate(date.getDate() - 1);
        previousfrom_Date = date.toISOString().split('T')[0];
    }

    return {
        _from_date: previousfrom_Date + ' ' + from_dateTime,
        _upto_date: upto_date + ' ' + to_dateTime
    };
}

const analytics_reports_generate_excel = async (req, res, next) => {
    const { page_no, customer_id, product_id, from_date, upto_date, type } = req.body;
    try {
        const _customer_id = parseNumericValue(customer_id);
        const _page_no = parseNumericValue(page_no) || 1;
        const _type = parseNumericValue(type) || 1; // 1 = prod and 2 = UAT

        const roleData = await getRoleByAdminId(req.token_data.admin_id);
        const role_name = roleData?.role_name || "";

        const customer = await getCustomerById(_customer_id);
        const email_id = customer?.email_id || '';

        // Validate date range if no customer or product filter
        const requiresDateValidation = _customer_id <= 0 || (product_id && product_id.length <= 0);
        if (requiresDateValidation) {
            const dateValidation = validateDateRange(from_date, upto_date);
            if (!dateValidation.valid) {
                return res.status(200).json(success(false, res.statusCode, dateValidation.message, null));
            }
        }

        const { _from_date, _upto_date } = calculateDateRanges(from_date, upto_date);
        const table_name = _type == 1 ? 'apigee_logs_prod' : 'apigee_logs';
        console.log("------s-table_name-------------------", table_name);

        const requestId = `${uuidv4()}_${moment().format('YYYYMMDD_HHmmss')}`;
        const file_id = await insertAnalyticsFileObject(req, requestId, from_date, upto_date);

        if (file_id === 0) {
            return res.status(200).json(success(false, res.statusCode, "Unable to insert request id, Please try again.", null));
        }

        const filePath = path.join(__dirname, `../../uploads/download_excel/${requestId}.xlsx`);
        await fs.ensureDir(path.join(__dirname, '../../uploads/download_excel'));
        console.log("==============filePath=======================", filePath);

        generateExcelFile(req, { filePath, requestId, _type, role_name, _from_date, _upto_date, email_id });

        res.status(200).json(success(true, res.statusCode, "Excel generation started.", { request_id: requestId }));
    } catch (err) {
        _logger.error(err.stack);
        console.log("----------err.stack---------------", err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

async function getRoleByAdminId(adminId) {
    if (!adminId) return null;
    const { AdmUser, AdmRole } = db.models;
    const result = await AdmUser.findOne({
        where: { admin_id: adminId },
        attributes: ['role_id'],
        include: [{
            model: AdmRole,
            as: 'role',
            attributes: ['role_name', 'is_editable', 'checker_maker'],
            required: true
        }],
        raw: true,
        nest: true
    });
    if (result) {
        return {
            role_id: result.role_id,
            role_name: result.role.role_name,
            is_editable: result.role.is_editable,
            checker_maker: result.role.checker_maker
        };
    }
    return null;
}

async function insertAnalyticsFileObject(req, requestId, from_date, upto_date) {
    const { AnalyticsFileObject } = db.models;
    const newRecord = await AnalyticsFileObject.create({
        request_id: requestId,
        added_by: req.token_data.account_id,
        added_date: db.get_ist_current_date(),
        status: STATUS_TYPE.Pending,
        from_date: new Date(from_date),
        upto_date: new Date(upto_date)
    });
    const file_id = newRecord?.file_id ?? 0;
    if (file_id > 0) {
        try {
            const data_to_log = {
                correlation_id: correlator.getId(),
                token_id: 0,
                account_id: req.token_data.account_id,
                user_type: 2,
                user_id: req.token_data.account_id,
                narration: `excel generate with requestid: ${requestId}`,
                query: `AnalyticsFileObject.create({ request_id: ${requestId}, added_by: ${req.token_data.account_id} })`,
            };
            action_logger.info(JSON.stringify(data_to_log));
        } catch (err) {
            // swallow logging error
        }
    }
    return file_id;
}

const customer_analytics_reports_download = async (req, res, next) => {
    const { request_id } = req.body;
    try {
        const { AnalyticsFileObject } = db.models;
        const fileRecord = await AnalyticsFileObject.findOne({
            where: { request_id: request_id },
            attributes: ['status', 'file_path'],
            raw: true
        });
        if (!fileRecord) {
            return res.status(404).json(success(false, res.statusCode, "Request ID not found.", null));
        }
        const requestStatus = fileRecord.status;
        const file_path = fileRecord.file_path;
        console.log("Database status value:", requestStatus, "===file_path==", file_path);
        if (requestStatus == STATUS_TYPE.Completed || requestStatus == STATUS_TYPE.Downloaded) {

            const gcp_file_url = `analytics_data/${request_id}.xlsx`
            const signUrl = await cloudStorage.GenerateSignedUrl(gcp_file_url);
            console.log("=======signUrl=======", signUrl);
            await AnalyticsFileObject.update(
                { status: STATUS_TYPE.Downloaded },
                { where: { request_id: request_id } }
            );
            // if direct download using google storage url you also need to be change in fronted also for this to triger download url
            const data = {
                status: 'Completed',
                downloadUrl: signUrl
            }
            return res.status(200).json(success(true, res.statusCode, "Report is completed.", data));
        }
        else {
            return res.status(202).json(success(false, res.statusCode, "Report is still being generated ", null));
        }
    } catch (err) {
        console.error("Error during download:", err);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const report_list = async (req, res, next) => {
    const { page_no } = req.body;
    try {
        const { AnalyticsFileObject } = db.models;
        const getPageNo = (page_no) => {
            const num = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0;
            return num > 0 ? num : 1;
        };
        const formatDate = (date) => date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(date)) : "";
        const _page_no = getPageNo(page_no);
        const pageSize = parseInt(process.env.PAGINATION_SIZE);
        const offset = (_page_no - 1) * pageSize;

        const total_record = await AnalyticsFileObject.count({
            where: { added_by: req.token_data.account_id }
        });

        const rows = await AnalyticsFileObject.findAll({
            where: { added_by: req.token_data.account_id },
            attributes: ['file_id', 'request_id', 'status', 'added_by', 'added_date', 'downloaded_date', 'file_path', 'file_name', 'from_date', 'upto_date'],
            order: [['file_id', 'DESC']],
            limit: pageSize,
            offset: offset,
            raw: true
        });

        const list = (rows || []).map((item, index) => ({
            sr_no: offset + index + 1,
            file_id: item.file_id,
            request_id: item.request_id,
            added_date: formatDate(item.added_date),
            from_date: formatDate(item.from_date),
            upto_date: formatDate(item.upto_date),
            status: item.status,
        }));
        const results = {
            current_page: _page_no,
            total_pages: Math.ceil(total_record / process.env.PAGINATION_SIZE),
            data: list,
        };
        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};


const delete_file_after_3days = async (req, res, next) => {
    const { AnalyticsFileObject } = db.models;
    // Calculate the date 3 days ago from today
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 5);
    console.log("-----------------", threeDaysAgo);

    // Query to find files added more than 3 days ago
    const filesToDelete = await AnalyticsFileObject.findAll({
        where: { added_date: { [Op.lt]: threeDaysAgo } },
        attributes: ['file_id', 'request_id', 'status', 'added_by', 'added_date', 'downloaded_date', 'file_path', 'file_name', 'from_date', 'upto_date'],
        raw: true
    });
    console.log(filesToDelete);
    for (const file of filesToDelete) {
        const { file_id, file_path, request_id } = file;
        // Delete file from GCP cloud storage if enabled
        if (file_path && file_path.length > 0) {
            if (parseInt(process.env.GCP_STORAGE_ENABLE) > 0) {
                try {
                    const fileName = `analytics_data/${request_id}.xlsx`;
                    await cloudStorage.DeleteFile(file_path);
                    console.log(`File deleted from cloud storage: ${fileName}`);
                } catch (err) {
                    console.error(`Failed to delete file from cloud storage: ${file_path}`, err);
                }
            } else {
                // Add any local file deletion logic here if applicable
            }
        }

        // Delete record from the database
        try {
            await AnalyticsFileObject.destroy({
                where: { file_id: file_id }
            });
            console.log(`File record deleted from database for file_id: ${file_id}`);
        } catch (err) {
            console.log(`Failed to delete file record from database for file_id: ${file_id}`, err);
        }
    }
};

cron.schedule('0 2 * * *', () => {
    delete_file_after_3days();
}, {
    timezone: "Asia/Kolkata"
});


/** this is for cron job to get daily mis data and send the report on mai */
async function fetchDailyApiUsageReport(req, res, next) {
    try {

        let fyYearData = await fetchFYYearData() || [];
        let apiUsageData = await getDailyMisData() || [];
        if (!apiUsageData.length) {
            _logger.warn("No API usage data found for the given date range.");
            return res.status(200).json({ success: true, statusCode: res.statusCode, message: "No data found", data: [] });
        }

        // **Step 2: Extract Unique Emails & Normalize**
        const uniqueEmails = [...new Set(fyYearData.map(row => row.developer_email))];
        _logger.debug(`Unique Emails List: ${JSON.stringify(uniqueEmails)}`);

        if (uniqueEmails.length === 0) {
            return res.status(200).json({ success: true, statusCode: res.statusCode, message: "No customer data found", data: null });
        }

        // in this function they will update the wallet balance in customer table from apigeee then after we get the data from customer table
        const balanceUpdated = await updatePrepaidCustomerBalance(uniqueEmails);
        if (!balanceUpdated) {
            _logger.warn("Failed to update prepaid customer balances.");
        }
        // get customer data by email Id array
        let customerData = await getCustomerDataByEmail(uniqueEmails);
        _logger.info(`Fetched Customer Data Count: ${customerData.length}`);

        // **Step 4: Create a Customer Map**
        const customerMap = new Map(customerData.map(customer => [customer.email_id, customer]));
        _logger.debug(`Customer Map Keys: ${[...customerMap.keys()]}`);

        // **Step 6: Merge API Data with Customer and FY Data**
        const finalData = apiUsageData.map(item => {
            const customerInfo = customerMap.get(item.developer_email) || {
                company_name: null,
                mobile_no: null,
                industry_name: null,
                billing_type: null,
                wallets_amount: null,
            };
            return {
                ...item,
                ...customerInfo
            };
        });
        // **Step 7: Prepare Financial Year Data**
        const fyFinalData = fyYearData.map(fy => {
            const customerInfo = customerMap.get(fy.developer_email) || {
                company_name: null,
                mobile_no: null,
                industry_name: null,
                billing_type: null,
                wallets_amount: null,
            };

            return {
                developer_email: fy.developer_email,
                total_success_count_fy: fy.total_success_count_fy || 0,
                avg_success_count_fy: fy.avg_success_count_fy || 0,
                total_failure_count_fy: fy.total_failure_count_fy || 0,
                avg_failure_count_fy: fy.avg_failure_count_fy || 0,
                total_count_fy: fy.total_count_fy || 0,
                ...customerInfo
            };
        });

        await createAndSendExcelReport(finalData, fyFinalData);

        _logger.info(`Successfully fetched ${finalData.length} records.`);
        return res.status(200).json(success(true, res.statusCode, 'Successfully fetched', finalData));

    } catch (err) {
        _logger.error("Error generating API report", err.stack);
        // return res.status(500).json(success(false, res.statusCode, err.stack, ''));
    }
}

async function updatePrepaidCustomerBalance(uniqueEmails) {
    try {
        const { CstCustomer } = db.models;
        const customerData = await CstCustomer.findAll({
            attributes: [
                'customer_id',
                [fn('LOWER', col('email_id')), 'email_id'],
                'company_name',
                'mobile_no',
                [fn('COALESCE', col('billing_type'), 'POSTPAID'), 'billing_type'],
                'wallets_amount'
            ],
            where: db.sequelize.where(fn('LOWER', col('email_id')), { [Op.in]: uniqueEmails }),
            raw: true
        });
        const prepaidCustomers = customerData.filter(customer => customer.billing_type.toLowerCase() === 'prepaid');
        console.log(prepaidCustomers);
        await Promise.all(prepaidCustomers.map(customer =>
            db.get_apigee_wallet_balance(customer.customer_id)
        ));
        return true;
    } catch (ex) {
        console.log("error while update wallet balance", ex);
        return false;
    }
}

async function getCustomerDataByEmail(uniqueEmails) {
    try {
        const { CstCustomer } = db.models;
        const customerData = await CstCustomer.findAll({
            attributes: [
                'customer_id',
                [fn('LOWER', col('email_id')), 'email_id'],
                'company_name',
                'mobile_no',
                'developer_id',
                [fn('COALESCE', col('billing_type'), 'POSTPAID'), 'billing_type'],
                'wallets_amount'
            ],
            where: db.sequelize.where(fn('LOWER', col('email_id')), { [Op.in]: uniqueEmails }),
            raw: true
        });
        return customerData;
    } catch (error) {
        console.log(error);
        return false;
    }
}


// this is getting data from materilized view we create a fucntion from that function we call mv daily from cron 
async function getDailyMisData(req, res, next) {
    try {
        const now = new Date();
        const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 18, 30, 0, 0));
        const monthStartDate = new Date(startOfMonth);
        monthStartDate.setUTCDate(monthStartDate.getUTCDate() - 1);  // Subtract one day

        const yesterdayEnd = new Date(now);
        yesterdayEnd.setUTCDate(now.getUTCDate() - 1);
        yesterdayEnd.setUTCHours(18, 29, 59, 999);
        // Convert to ISO format for PostgreSQL
        const startTime = monthStartDate.toISOString().replace("T", " ").replace("Z", " UTC");
        const endTime = yesterdayEnd.toISOString().replace("T", " ").replace("Z", " UTC");

        _logger.info(`Fetching API usage from ${startTime} to ${endTime}`);
        console.log(`Fetching API usage from ${startTime} to ${endTime}`);

        // **Step 1: Fetch API Usage Data**
        const query1 = ` SELECT * from mv_daily_weekly_apigee_data where developer_email NOT IN ('ketan@velociters.com','(not set)','minals@proteantech.in','hrushikesh.jadhav@alliedglobetech.com')`;
        const apiUsageData = await db.sequelize2.query(query1, { type: QueryTypes.SELECT, });
        return apiUsageData;
    } catch (error) {
        console.log("error while getting dail mis data", error);
        return false;
    }
}

async function fetchFYYearData(req, res, next) {
    try {
        const query1 = `select * from mv_fy_year_apigee_data where developer_email NOT IN ('ketan@velociters.com','(not set)','minals@proteantech.in','hrushikesh.jadhav@alliedglobetech.com')`;
        const apiUsageData = await db.sequelize2.query(query1, { type: QueryTypes.SELECT, });
        console.log("===============apiUsageData===========", apiUsageData);
        return apiUsageData; // Sending response with the fetched data
    } catch (error) {
        _logger.error("Error fetching API usage data for fiscal year:", error);
        return false;
        // Passing the error to the next middleware
    }
}

// Helper: Convert row to Excel format with numeric defaults
function formatRowForExcel(row) {
    const numericFields = [
        'wallets_amount', 'success_count', 'avg_success_rate', 'failure_count', 'avg_failure_rate',
        'total_count', 'total_success_count_fy', 'avg_success_count_fy', 'total_failure_count_fy',
        'avg_failure_count_fy', 'total_count_fy', 'prev_day_success_count', 'percent_increase',
        'mtd_success_rate', 'week1_success_count', 'week2_success_count', 'week3_success_count',
        'week4_success_count', 'week5_success_count'
    ];

    const result = {
        developer_email: row.developer_email,
        company_name: row.company_name,
        mobile_no: row.mobile_no,
        billing_type: row.billing_type
    };

    numericFields.forEach(field => {
        result[field] = Number(row[field]) || 0;
    });

    return result;
}

// Helper: Generate HTML table row
function generateHtmlTableRow(row) {
    const tdLeft = (val) => `<td style="border: 1px solid white; padding: 8px; text-align: left;">${val}</td>`;
    const tdRight = (val) => `<td style="border: 1px solid white; padding: 8px; text-align: right;">${val || 0}</td>`;

    return `<tr>
        ${tdLeft(row.developer_email)}${tdLeft(row.company_name)}${tdLeft(row.mobile_no)}${tdRight(row.billing_type)}
        ${tdRight(row.wallets_amount)}${tdRight(row.success_count)}${tdRight(row.avg_success_rate)}
        ${tdRight(row.failure_count)}${tdRight(row.avg_failure_rate)}${tdRight(row.total_count)}
        ${tdRight(row.total_success_count_fy)}${tdRight(row.avg_success_count_fy)}${tdRight(row.total_failure_count_fy)}
        ${tdRight(row.avg_failure_count_fy)}${tdRight(row.total_count_fy)}${tdRight(row.prev_day_success_count)}
        ${tdRight(row.percent_increase)}${tdRight(row.mtd_success_rate)}${tdRight(row.week1_success_count)}
        ${tdRight(row.week2_success_count)}${tdRight(row.week3_success_count)}${tdRight(row.week4_success_count)}
        ${tdRight(row.week5_success_count)}
    </tr>`;
}

// Helper: Calculate totals from merged data
function calculateTotals(mergedData) {
    const sumField = (field) => mergedData.reduce((sum, row) => sum + (Number(row[field]) || 0), 0);

    return {
        wallets_amount: sumField('wallets_amount'),
        success_count: sumField('success_count'),
        failure_count: sumField('failure_count'),
        total_count: sumField('total_count'),
        total_success_count_fy: sumField('total_success_count_fy'),
        total_failure_count_fy: sumField('total_failure_count_fy'),
        total_count_fy: sumField('total_count_fy'),
        prev_day_success_count: sumField('prev_day_success_count'),
        week1_success_count: sumField('week1_success_count'),
        week2_success_count: sumField('week2_success_count'),
        week3_success_count: sumField('week3_success_count'),
        week4_success_count: sumField('week4_success_count'),
        week5_success_count: sumField('week5_success_count')
    };
}

// Helper: Generate HTML total row for email
function generateHtmlTotalRow(totals) {
    const tdEmpty = `<td style="border: 1px solid white; padding: 8px; text-align: left;"></td>`;
    const tdRight = (val) => `<td style="border: 1px solid white; padding: 8px; text-align: right;">${val}</td>`;

    return `<tr style="font-weight: bold; background-color: #301e1e;">
        <td style="border: 1px solid white; padding: 8px; text-align: left;">TOTAL</td>
        ${tdEmpty}${tdEmpty}${tdEmpty}
        ${tdRight(totals.wallets_amount)}${tdRight(totals.success_count)}${tdEmpty}
        ${tdRight(totals.failure_count)}${tdEmpty}${tdRight(totals.total_count)}
        ${tdRight(totals.total_success_count_fy)}${tdEmpty}${tdRight(totals.total_failure_count_fy)}
        ${tdEmpty}${tdRight(totals.total_count_fy)}${tdEmpty}${tdEmpty}${tdEmpty}
        ${tdRight(totals.week1_success_count)}${tdRight(totals.week2_success_count)}
        ${tdRight(totals.week3_success_count)}${tdRight(totals.week4_success_count)}
        ${tdRight(totals.week5_success_count)}
    </tr>`;
}

async function createAndSendExcelReport(finalData, fyFinalData) {
    try {
        const dataMap = buildMISDataMap(fyFinalData, finalData);
        const mergedData = Array.from(dataMap.values()).sort((a, b) => (Number(b.total_count) || 0) - (Number(a.total_count) || 0));
        console.log('Sorted mergedData:', mergedData);

        // Create Excel Workbook
        const workbook = new excel.Workbook();
        const dailySheet = workbook.addWorksheet('Daily MIS Data');
        dailySheet.columns = getExcelColumns();

        // Add data rows
        mergedData.forEach(row => dailySheet.addRow(formatRowForExcel(row)));

        // Calculate totals and generate HTML
        const totals = calculateTotals(mergedData);
        const tableRows = mergedData.map(generateHtmlTableRow).join('');
        const fullTableRows = tableRows + generateHtmlTotalRow(totals);

        // Add total row to Excel
        const totalRowData = {
            developer_email: 'TOTAL', company_name: '', mobile_no: '', billing_type: '',
            avg_success_rate: '', avg_failure_rate: '', avg_success_count_fy: '',
            avg_failure_count_fy: '', percent_increase: '', mtd_success_rate: '',
            ...totals
        };
        const totalRow = dailySheet.addRow(totalRowData);
        totalRow.eachCell((cell) => { cell.font = { bold: true }; });

        // Save and send
        const filePath = path.join(__dirname, 'API_Report.xlsx');
        await workbook.xlsx.writeFile(filePath);
        console.log('Excel file created successfully at ' + filePath);

        const status = await sendDailyMISMailer(filePath, fullTableRows);
        console.log(status === 1 ? "MIS mail sent successfully ✅" : `Failed with status: ${status}`);
    } catch (error) {
        console.log('Error in creating or sending the email: ', error);
        return -5;
    }
}

function getExcelColumns() {
    return [
        { header: 'Developer Email', key: 'developer_email', width: 30 },
        { header: 'Company Name', key: 'company_name', width: 20 },
        { header: 'Mobile No', key: 'mobile_no', width: 15 },
        { header: 'Billing Type', key: 'billing_type', width: 15 },
        { header: 'Available Balance', key: 'wallets_amount', width: 15, numFmt: '#,##0.00' },
        { header: 'Total Success Count (MTD)', key: 'success_count', width: 15, numFmt: '#,##0' },
        { header: 'Total MTD Success %', key: 'avg_success_rate', width: 15, numFmt: '0.00%' },
        { header: 'Total Failure Count (MTD)', key: 'failure_count', width: 15, numFmt: '#,##0' },
        { header: 'Total MTD Fail %', key: 'avg_failure_rate', width: 15, numFmt: '0.00%' },
        { header: 'Total Count (MTD)', key: 'total_count', width: 15, numFmt: '#,##0' },
        { header: 'Total Success Count (FY)', key: 'total_success_count_fy', width: 20, numFmt: '#,##0' },
        { header: 'Total FY Success %', key: 'avg_success_count_fy', width: 15, numFmt: '0.00%' },
        { header: 'Total Failure Count (FY)', key: 'total_failure_count_fy', width: 20, numFmt: '#,##0' },
        { header: 'Total FY Fail %', key: 'avg_failure_count_fy', width: 15, numFmt: '0.00%' },
        { header: 'Total Count (FY)', key: 'total_count_fy', width: 20, numFmt: '#,##0' },
        { header: 'Prev Day Success Count', key: 'prev_day_success_count', width: 20, numFmt: '#,##0' },
        { header: 'Percent Increase', key: 'percent_increase', width: 15, numFmt: '0.00%' },
        { header: 'Avg success count (MTD)', key: 'mtd_success_rate', width: 15, numFmt: '#,##0' },
        { header: 'Week 1 Success', key: 'week1_success_count', width: 15, numFmt: '#,##0' },
        { header: 'Week 2 Success', key: 'week2_success_count', width: 15, numFmt: '#,##0' },
        { header: 'Week 3 Success', key: 'week3_success_count', width: 15, numFmt: '#,##0' },
        { header: 'Week 4 Success', key: 'week4_success_count', width: 15, numFmt: '#,##0' },
        { header: 'Week 5 Success', key: 'week5_success_count', width: 15, numFmt: '#,##0' },
    ];
}

function buildMISDataMap(fyFinalData, finalData) {
    const dataMap = new Map();

    // Add all users from FY Year Data first (ensuring all 50 users are included)
    fyFinalData.forEach(row => {
        dataMap.set(row.developer_email, {
            developer_email: row.developer_email,
            company_name: row.company_name || "",
            mobile_no: row.mobile_no || "",
            billing_type: row.billing_type || "",
            wallets_amount: row.wallets_amount || 0,
            success_count: 0, // Keep blank if no MTD data
            avg_success_rate: 0,
            failure_count: 0,
            avg_failure_rate: 0,
            total_count: 0,
            total_success_count_fy: row.total_success_count_fy || 0,
            avg_success_count_fy: row.avg_success_count_fy || 0,
            total_failure_count_fy: row.total_failure_count_fy || 0,
            avg_failure_count_fy: row.avg_failure_count_fy || 0,
            total_count_fy: row.total_count_fy || 0,
            prev_day_success_count: 0,
            percent_increase: 0,
            mtd_success_rate: 0,
            week1_success_count: 0,
            week2_success_count: 0,
            week3_success_count: 0,
            week4_success_count: 0,
            week5_success_count: 0,
        });
    });

    // Update with Daily MIS Data (MTD), keeping FY data unchanged
    finalData.forEach(row => {
        if (dataMap.has(row.developer_email)) {
            Object.assign(dataMap.get(row.developer_email), {
                total_count: row.total_count || 0,
                success_count: row.success_count || 0,
                avg_success_rate: row.avg_success_rate || 0,
                failure_count: row.failure_count || 0,
                avg_failure_rate: row.avg_failure_rate || 0,
                prev_day_success_count: row.prev_day_success_count || 0,
                percent_increase: row.percent_increase || 0,
                mtd_success_rate: row.mtd_success_rate || 0,
                week1_success_count: row.week1_success_count || 0,
                week2_success_count: row.week2_success_count || 0,
                week3_success_count: row.week3_success_count || 0,
                week4_success_count: row.week4_success_count || 0,
                week5_success_count: row.week5_success_count || 0,
            });
        } else {
            dataMap.set(row.developer_email, {
                developer_email: row.developer_email,
                company_name: row.company_name || "",
                mobile_no: row.mobile_no || "",
                billing_type: row.billing_type || "",
                wallets_amount: row.wallets_amount || 0,
                success_count: row.success_count || 0,
                avg_success_rate: row.avg_success_rate || 0,
                failure_count: row.failure_count || 0,
                avg_failure_rate: row.avg_failure_rate || 0,
                total_count: row.total_count || 0,
                prev_day_success_count: row.prev_day_success_count || 0,
                percent_increase: row.percent_increase || 0,
                mtd_success_rate: row.mtd_success_rate || 0,
                week1_success_count: row.week1_success_count || 0,
                week2_success_count: row.week2_success_count || 0,
                week3_success_count: row.week3_success_count || 0,
                week4_success_count: row.week4_success_count || 0,
                week5_success_count: row.week5_success_count || 0,
            });
        }
    });
    return dataMap;
}

// Helper function to prepare email content
function prepareEmailContent(template, fullTableRows) {
    const now = new Date();
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(now.getDate() - 1);
    const formattedDate = yesterdayDate.toISOString().split('T')[0];

    let subject = template.subject || "";
    let body_text = template.body_text || "";

    subject = subject.replaceAll(process.env.EMAIL_TAG_DATE, formattedDate);
    subject = subject.replaceAll(process.env.SITE_URL_TAG, process.env.FRONT_SITE_URL);
    body_text = body_text.replaceAll(process.env.EMAIL_TAG_DATE, formattedDate);
    body_text = body_text.replaceAll(process.env.SITE_URL_TAG, process.env.FRONT_SITE_URL);
    body_text = body_text.replaceAll(process.env.MIS_TABLE_DATA, fullTableRows);

    return { subject, body_text };
}

// Helper function to send email
async function sendEmailWithAttachment(emailList, subject, body_text, filePath) {
    const mailOptions = {
        from: process.env.EMAIL_CONFIG_SENDER,
        to: emailList,
        subject: subject,
        html: body_text,
        attachments: [{ filename: 'API_Report.xlsx', path: filePath }]
    };

    try {
        await emailTransporter.sendMail(mailOptions);
        console.log('Email sent successfully to ' + emailList);
        fs.unlinkSync(filePath);
        return 1; /* Send */
    } catch (err) {
        _logger.error(err.stack);
        return 0; /* Sending fail */
    }
}

async function sendDailyMISMailer(filePath, fullTableRows) {
    const { BusinessEmail, EmailTemplate } = db.models;

    const rows = await BusinessEmail.findAll({
        where: { is_enabled: true, type_id: { [Op.in]: [1, 3] } },
        attributes: ['email_id'],
        raw: true
    });
    const emailList = rows.map(row => row.email_id).join(', ');

    if (!emailList.length) {
        return -2; /* Unable to find business email */
    }

    const rowT = await EmailTemplate.findAll({
        where: { template_id: EmailTemplates.DAILY_MIS_AUTO_MAILER.value },
        attributes: ['subject', 'body_text', 'is_enabled'],
        raw: true
    });

    if (!rowT || !rowT.length) {
        return -3; /* Template not found */
    }

    if (!rowT[0].is_enabled) {
        return -4; /* Template is disabled */
    }

    const { subject, body_text } = prepareEmailContent(rowT[0], fullTableRows);
    return sendEmailWithAttachment(emailList, subject, body_text, filePath);
}


/**
 * 
 * getting data of starting date is current month 1st day to (current date - 1 day) ex 5 july -1 =4 
   july so data is getting from 1 july to 4 july in utc
   in date range for sql query they want like this 
   ex .. 2025-06-30 18:30:00.000 UTC to 2025-07-04 18:29:59.999 UTC
 * 
 */
async function getDailyMisDataCron(req, res, next) {
    try {
        const now = new Date();
        let startTime, endTime;

        // Calculate endTime (yesterday at 18:29:59.999 UTC)
        const yesterdayEnd = new Date(now);
        yesterdayEnd.setUTCDate(now.getUTCDate() - 1);
        yesterdayEnd.setUTCHours(18, 29, 59, 999);

        // Check if today is the 1st of the month
        if (now.getUTCDate() === 1) {
            // Start from the last day of the previous month at 18:30:00.000 UTC
            const startOfPreviousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1, 18, 30, 0, 0));
            const monthStartDate = new Date(startOfPreviousMonth);
            monthStartDate.setUTCDate(monthStartDate.getUTCDate() - 1); // Subtract one day
            startTime = monthStartDate.toISOString().replace("T", " ").replace("Z", " UTC");
        } else {
            // Start from the first day of the current month minus one day at 18:30:00.000 UTC
            const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 18, 30, 0, 0));
            const monthStartDate = new Date(startOfMonth);
            monthStartDate.setUTCDate(monthStartDate.getUTCDate() - 1); // Subtract one day
            startTime = monthStartDate.toISOString().replace("T", " ").replace("Z", " UTC");
        }

        endTime = yesterdayEnd.toISOString().replace("T", " ").replace("Z", " UTC");

        _logger.info(`Fetching API usage from ${startTime} to ${endTime}`);
        console.log(`Fetching API usage from ${startTime} to ${endTime}`);
        // **Step 1: Fetch API Usage Data**
        const query1 = ` SELECT public.refresh_mv_daily_weekly_apigee_data(:startTime, :endTime)`;
        const apiUsageData = await db.sequelize2.query(query1, { replacements: { startTime, endTime }, type: QueryTypes.SELECT, });
        console.log(apiUsageData);

        return true;
    } catch (error) {
        console.log("error while getting dail mis data", error);
        return false;
    }
}


/**
 * 
 * getting data of starting fincacial year only    in date range for sql query they want like this 
   ex .. 2025-03-31 18:30:00.000 UTC to 2026-03-31 18:29:59.999 UTC 
   means the financial year 2025-26 starts on April 1, 2025, and ends on March 31, 2026.
 * 
 */
async function getFYYearDataCron(req, res, next) {
    try {
        const now = new Date();

        // Determine the current fiscal year based on the current date
        let currentYear = now.getUTCFullYear();
        if (now.getUTCMonth() < 3) {  // If current month is before April (i.e., Jan, Feb, Mar), consider previous year as fiscal year
            currentYear -= 1;
        }
        // Fiscal year start date (1st April of the current/fiscal year)
        const fiscalYearStart = new Date(Date.UTC(currentYear, 3, 1)); // April 1st of the fiscal year -1 day
        fiscalYearStart.setUTCHours(18, 30, 0, 0);
        fiscalYearStart.setUTCDate(fiscalYearStart.getUTCDate() - 1);
        const fiscalYearEnd = new Date(Date.UTC(currentYear + 1, 2, 31)); // March 31st of the next year
        fiscalYearEnd.setUTCHours(18, 29, 59, 999);
        // Convert to ISO format for PostgreSQL
        const startTime = fiscalYearStart.toISOString().replace("T", " ").replace("Z", " UTC");
        const endTime = fiscalYearEnd.toISOString().replace("T", " ").replace("Z", " UTC");

        _logger.info(`Fetching API usage data for FY ${currentYear} from ${startTime} to ${endTime}`);
        console.log(`Fetching API usage data for FY ${currentYear} from ${startTime} to ${endTime}`);

        // **Step 1: Fetch API Usage Data for the Fiscal Year**
        const query1 = `SELECT public.refresh_fy_year_apigee_data(:startTime, :endTime) `;
        const apiUsageData = await db.sequelize2.query(query1, { replacements: { startTime, endTime }, type: QueryTypes.SELECT, });
        console.log("===============apiUsageData===========", apiUsageData);
        return apiUsageData; // Sending response with the fetched data
    } catch (error) {
        _logger.error("Error fetching API usage data for fiscal year:", error);
        return false;
        // Passing the error to the next middleware
    }
}


// **sftp Helper Functions start**
async function createCSVAndUploadSFTP(req, res) {
    try {
        // **Define Time Ranges**
        const now = new Date();
        const startDate = new Date(now);
        startDate.setUTCDate(now.getUTCDate() - 2);
        startDate.setUTCHours(18, 30, 0, 0);

        const yesterdayEnd = new Date(now);
        yesterdayEnd.setUTCDate(now.getUTCDate() - 1);
        yesterdayEnd.setUTCHours(18, 29, 59, 999);
        // Convert to ISO format for PostgreSQL
        const startTime = startDate.toISOString().replace("T", " ").replace("Z", " UTC");
        const endTime = yesterdayEnd.toISOString().replace("T", " ").replace("Z", " UTC");

        _logger.info(`Fetching API usage from ${startTime} to ${endTime}`);

        // **Step 1: Fetch API Usage Data**
        const apiUsageData = await fetchApiUsageData(startTime, endTime);
        // debugger;
        if (!apiUsageData.length) {
            return res.status(200).json({ success: true, message: "No customer data found", data: null });
        }

        // **Step 2: Fetch Customer Data**
        const uniqueEmails = [...new Set(apiUsageData.map(row => row.developer_email))];
        const customerData = await getCustomerDataByEmail(uniqueEmails);

        const customerMap = new Map(customerData.map(customer => [customer.email_id, customer]));

        // **Step 3: Merge API Data with Customer Data**
        const finalData = mergeApiDataWithCustomer(apiUsageData, customerMap, yesterdayEnd);

        // **Step 4: Generate and Upload CSV**
        const filePath = await generateCsv(finalData);
        const uploadResponse = await uploadCsvToSftp(filePath);

        return res.status(200).json(uploadResponse);
    } catch (error) {
        _logger.error('Error uploading CSV:', error);
        console.log(error);
        return res.status(500).json({ success: false, message: error.message });
    }
}

async function fetchApiUsageData(startTime, endTime) {
    const query = `
        SELECT LOWER(developer_email) AS developer_email, developer, api_product, target_host, apiproxy,
               COUNT(*) AS total_count,
               COUNT(CASE WHEN response_status_code::INT >= 200 AND response_status_code::INT < 300 THEN 1 END) AS success_count,
               COUNT(CASE WHEN response_status_code::INT >= 300 THEN 1 END) AS failure_count
        FROM apigee_logs_prod
        WHERE apiproxy != 'Get-oAuth-Token' 
              AND ax_created_time ::TIMESTAMP WITH TIME ZONE >= :startTime 
              AND ax_created_time ::TIMESTAMP WITH TIME ZONE <= :endTime
        GROUP BY developer_email, developer, api_product, target_host, apiproxy; `;

    return await db.sequelize2.query(query, { replacements: { startTime, endTime }, type: QueryTypes.SELECT, });
}

function mergeApiDataWithCustomer(apiUsageData, customerMap, endTime) {
    const endDate = typeof endTime === 'string' ? new Date(endTime.replace(" UTC", "")) : endTime;

    return apiUsageData.map(item => {
        const customerInfo = customerMap.get(item.developer_email) || {
            company_name: null,
            mobile_no: null,
            industry_name: null,
            developer_id: null,
        };

        return {
            date: endDate.toISOString().split('T')[0],
            entity_name: customerInfo.company_name,
            api_product: item.api_product,
            apiproxy: item.apiproxy,
            target_host: item.target_host,
            success_count: Number(item.success_count) || 0,
            total_count: Number(item.total_count) || 0,
            failure_count: Number(item.failure_count) || 0,
            developer_email: item.developer_email,
            developer: item.developer,
            developer_id: customerInfo.developer_id,
            company_name: customerInfo.company_name,
            company_name_updated: customerInfo.company_name,
            email_id: item.developer_email,
        };
    });
}

async function generateCsv(data) {
    try {
        if (!data || data.length === 0) {
            throw new Error("No data available for CSV export.");
        }

        const fields = [
            { label: 'Date', value: 'date' },
            { label: 'Entity name', value: 'entity_name' },
            { label: 'API Product', value: 'api_product' },
            { label: 'API Proxy', value: 'apiproxy' },
            { label: 'Target Host', value: 'target_host' },
            { label: 'Success Count', value: 'success_count' },
            { label: 'Total Count', value: 'total_count' },
            { label: 'Failure Count', value: 'failure_count' },
            { label: 'Developer Email', value: 'developer_email' },
            { label: 'Developer', value: 'developer' },
            { label: 'Developer Id', value: 'developer_id' },
            { label: 'Company Name', value: 'company_name' },
            { label: 'Company Name Updated', value: 'company_name_updated' },
            { label: 'Email Id', value: 'email_id' }
        ];

        // Convert data to string format (prevent potential issues with objects)
        const csvData = data.map(row => ({
            date: row.date ? row.date.toString() : '',
            entity_name: row.entity_name || '',
            api_product: row.api_product || '',
            apiproxy: row.apiproxy || '',
            target_host: row.target_host || '',
            success_count: row.success_count?.toString() || '0',
            total_count: row.total_count?.toString() || '0',
            failure_count: row.failure_count?.toString() || '0',
            developer_email: row.developer_email || '',
            developer: row.developer || '',
            developer_id: row.developer_id || '',
            company_name: row.company_name || '',
            company_name_updated: row.company_name_updated || '',
            email_id: row.email_id || '',
        }));
        const json2csvParser = new Parser({ fields });
        const csv = json2csvParser.parse(csvData);

        // const fileName = `export_${Date.now()}.csv`;
        // const filePath = path.join(__dirname, '../../uploads/sftp/', fileName);

        const fileName = `RISEWITHPROTEAN_${moment().format('DD.MM.YYYY')}.csv`;
        const filePath = path.join(__dirname, '../../uploads/sftp/', fileName);
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, csv);
        console.log(`CSV file created successfully at: ${filePath}`);
        return filePath;
    } catch (error) {
        console.error('Error generating CSV:', error);
        throw error;
    }
}

async function uploadCsvToSftp(filePath) {
    try {
        const fileName = path.basename(filePath);
        const fileJson = [{ local: filePath, name: fileName }];

        const sftpResponse = await sftpHelper.sftpFileUpload(fileJson);
        console.log("sftp respnse", sftpResponse);

        if (!sftpResponse?.success) {
            await fs.unlink(filePath);
            _logger.error(`Failed to upload CSV. File deleted: ${filePath}`);
            return { success: false, message: 'SFTP upload failed' };
        }

        _logger.info(`File uploaded successfully: ${fileName}`);
        return { success: true, message: 'File uploaded successfully' };
    } catch (error) {
        console.log("sftp error:", error);
        _logger.error('Error uploading file to SFTP:', error);
        throw error;
    }
}

// ** sftp Helper Functions  end**

//Runs Every Day at 11:30 AM (IST)
cron.schedule('30 11 * * *', () => {
    console.log("started cron fetchDailyApiUsageReport ");
    fetchDailyApiUsageReport();
    // createCSVAndUploadSFTP();
}, {
    timezone: "Asia/Kolkata"
});




//Runs Every Day at 11:01 PM (IST)
cron.schedule('01 11 * * *', () => {
    console.log("started cron getFYYearDataCron ");
    getFYYearDataCron();
    console.log("started cron getDailyMisDataCron ");
    getDailyMisDataCron();
}, {
    timezone: "Asia/Kolkata"
});



export default {
    customer_analytics_reports_get,
    analytics_reports_generate_excel,
    customer_analytics_reports_download,
    report_list,
    delete_file_after_3days,
    fetchDailyApiUsageReport,
    getDailyMisDataCron,
    getFYYearDataCron,
    createCSVAndUploadSFTP
};
