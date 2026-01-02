import { logger as _logger, action_logger } from '../../logger/winston.js';
import db from "../../database/db_helper.js";
import { success } from "../../model/responseModel.js";
import { QueryTypes, Op } from 'sequelize';
import dateFormat from "date-format";
import validator from "validator";
import { fetch } from 'cross-fetch';
import correlator from 'express-correlation-id';
import moment from 'moment';
import { Constants } from "../../model/constantModel.js";
import commonModule from "../../modules/commonModule.js";

// Helper function to get models - must be called after db is initialized
const getModels = () => db.models;

// Shared helper function to get products for an app
const getAppProductsForApp = async (app_id, CstAppProduct, Product) => {
    const appProducts = await CstAppProduct.findAll({
        where: { app_id },
        include: [{ model: Product, as: 'product', attributes: ['product_name'], required: true }]
    });
    return appProducts.map(ap => ap.product.product_name).join(', ');
};

// Helper function to format full name from user object
const formatFullName = (user, firstNameKey = 'first_name', lastNameKey = 'last_name') => {
    if (!user) return '';
    return `${user[firstNameKey] || ''} ${user[lastNameKey] || ''}`.trim();
};

// Helper function to format date
const formatDateField = (dateValue) => {
    return dateValue ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(dateValue)) : "";
};

const app_req_pending = async (req, res, next) => {
    const { page_no, search_text, in_live } = req.body;
    try {
        const { CstAppMast, CstCustomer, AdmUser, Product, CstAppProduct } = getModels();
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0; if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";
        const _in_live = !!in_live;
        const offset = (_page_no - 1) * process.env.PAGINATION_SIZE;
        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);

        // Use shared helper function for products
        const getAppProducts = (app_id) => getAppProductsForApp(app_id, CstAppProduct, Product);

        // Helper function to build list from rows
        const buildList = async (rows, startSrNo) => {
            let list = [];
            let sr_no = startSrNo;
            for (const app of rows) {
                sr_no++;
                const products = await getAppProducts(app.app_id);
                list.push({
                    sr_no,
                    app_id: app.app_id,
                    full_name: formatFullName(app.customer),
                    email_id: app.customer?.email_id || '',
                    mobile_no: app.customer?.mobile_no || '',
                    app_name: app.app_name,
                    products,
                    expected_volume: app.expected_volume,
                    register_date: formatDateField(app.added_date),
                    mkr_approved: app.mkr_is_approved,
                    mkr_full_name: formatFullName(app.mkrApprovedByUser),
                    mkr_approve_date: formatDateField(app.mkr_approved_date),
                    mkr_remark: app.mkr_approved_rmk,
                });
            }
            return list;
        };

        let whereClause = {
            is_deleted: false,
            in_live_env: _in_live,
            is_approved: false,
            is_rejected: false,
        };

        const searchCondition = _search_text ? {
            [Op.or]: [
                { '$customer.email_id$': { [Op.iLike]: `${_search_text}%` } },
                { '$customer.mobile_no$': { [Op.iLike]: `${_search_text}%` } },
                { app_name: { [Op.iLike]: `${_search_text}%` } }
            ]
        } : {};

        const includeCustomer = {
            model: CstCustomer,
            as: 'customer',
            where: { is_deleted: false },
            attributes: ['first_name', 'last_name', 'email_id', 'mobile_no'],
            required: true
        };

        const includeMkrApproved = {
            model: AdmUser,
            as: 'mkrApprovedByUser',
            attributes: ['first_name', 'last_name'],
            required: false
        };

        if (is_maker) {
            whereClause = { ...whereClause, mkr_is_approved: false, mkr_is_rejected: false, ...searchCondition };
            const total_record = await CstAppMast.count({ where: whereClause, include: [includeCustomer] });
            const rows = await CstAppMast.findAll({
                where: whereClause,
                include: [includeCustomer, includeMkrApproved],
                order: [['app_id', 'DESC']],
                limit: process.env.PAGINATION_SIZE,
                offset
            });
            const list = await buildList(rows, offset);
            const results = { current_page: _page_no, total_pages: Math.ceil(total_record / process.env.PAGINATION_SIZE), data: list, is_admin, is_maker, is_checker };
            return res.status(200).json(success(true, res.statusCode, "", results));
        }
        else if (is_checker) {
            whereClause = { ...whereClause, mkr_is_approved: true, mkr_is_rejected: false, ...searchCondition };
            const total_record = await CstAppMast.count({ where: whereClause, include: [includeCustomer] });
            const rows = await CstAppMast.findAll({
                where: whereClause,
                include: [includeCustomer, includeMkrApproved],
                order: [['app_id', 'DESC']],
                limit: process.env.PAGINATION_SIZE,
                offset
            });
            const list = await buildList(rows, offset);
            const results = { current_page: _page_no, total_pages: Math.ceil(total_record / process.env.PAGINATION_SIZE), data: list, is_admin, is_maker, is_checker };
            return res.status(200).json(success(true, res.statusCode, "", results));
        }
        else if (is_admin) {
            whereClause = { ...whereClause, mkr_is_rejected: false, ...searchCondition };
            const total_record = await CstAppMast.count({ where: whereClause, include: [includeCustomer] });
            const rows = await CstAppMast.findAll({
                where: whereClause,
                include: [includeCustomer, includeMkrApproved],
                order: [['app_id', 'DESC']],
                limit: process.env.PAGINATION_SIZE,
                offset
            });
            const list = await buildList(rows, offset);
            const results = { current_page: _page_no, total_pages: Math.ceil(total_record / process.env.PAGINATION_SIZE), data: list, is_admin, is_maker, is_checker };
            return res.status(200).json(success(true, res.statusCode, "", results));
        } else {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have checker/maker authority.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const app_req_approved = async (req, res, next) => {
    const { page_no, search_text, in_live } = req.body;
    try {
        const { CstAppMast, CstCustomer, AdmUser, Product, CstAppProduct } = getModels();
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0; if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";
        const _in_live = in_live === true;
        const offset = (_page_no - 1) * process.env.PAGINATION_SIZE;

        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);

        // Use shared helper function for products
        const getAppProducts = (app_id) => getAppProductsForApp(app_id, CstAppProduct, Product);

        // Helper function to build a single list item (reduces cognitive complexity)
        const buildListItem = async (app, sr_no) => {
            const products = await getAppProducts(app.app_id);
            return {
                sr_no,
                app_id: app.app_id,
                full_name: formatFullName(app.customer),
                email_id: app.customer?.email_id || '',
                mobile_no: app.customer?.mobile_no || '',
                app_name: app.app_name,
                products,
                apigee_status: app.apigee_status,
                is_monetization_enabled: app.is_monetization_enabled,
                is_monetization_rate_appliacable: app.is_monetization_rate_appliacable,
                mkr_approved: app.mkr_is_approved,
                mkr_name: formatFullName(app.mkrApprovedByUser),
                mkr_remark: app.mkr_approved_rmk,
                mkr_date: formatDateField(app.mkr_approved_date),
                chkr_approved: app.is_approved,
                chkr_name: formatFullName(app.approvedByUser),
                chkr_remark: app.approve_remark,
                chkr_date: formatDateField(app.approve_date),
            };
        };

        // Helper function to build list from rows
        const buildList = async (rows, startSrNo) => {
            const list = [];
            let sr_no = startSrNo;
            for (const app of rows) {
                sr_no++;
                list.push(await buildListItem(app, sr_no));
            }
            return list;
        };

        const searchCondition = _search_text ? {
            [Op.or]: [
                { '$customer.email_id$': { [Op.iLike]: `${_search_text}%` } },
                { '$customer.mobile_no$': { [Op.iLike]: `${_search_text}%` } },
                { app_name: { [Op.iLike]: `${_search_text}%` } }
            ]
        } : {};

        const includeCustomer = {
            model: CstCustomer,
            as: 'customer',
            where: { is_deleted: false },
            attributes: ['first_name', 'last_name', 'email_id', 'mobile_no'],
            required: true
        };

        const includes = [
            includeCustomer,
            { model: AdmUser, as: 'mkrApprovedByUser', attributes: ['first_name', 'last_name'], required: false },
            { model: AdmUser, as: 'approvedByUser', attributes: ['first_name', 'last_name'], required: false }
        ];

        if (is_maker) {
            const whereClause = {
                is_deleted: false,
                in_live_env: _in_live,
                [Op.or]: [{ mkr_is_approved: true }, { is_approved: true }],
                mkr_is_rejected: false,
                is_rejected: false,
                ...searchCondition
            };
            const total_record = await CstAppMast.count({ where: whereClause, include: [includeCustomer] });
            const rows = await CstAppMast.findAll({ where: whereClause, include: includes, order: [['app_id', 'DESC']], limit: process.env.PAGINATION_SIZE, offset });
            const list = await buildList(rows, offset);
            const results = { current_page: _page_no, total_pages: Math.ceil(total_record / process.env.PAGINATION_SIZE), data: list, is_admin, is_maker, is_checker };
            return res.status(200).json(success(true, res.statusCode, "", results));
        }
        else if (is_checker || is_admin) {
            const whereClause = {
                is_deleted: false,
                in_live_env: _in_live,
                is_approved: true,
                ...searchCondition
            };
            const total_record = await CstAppMast.count({ where: whereClause, include: [includeCustomer] });
            const rows = await CstAppMast.findAll({ where: whereClause, include: includes, order: [['app_id', 'DESC']], limit: process.env.PAGINATION_SIZE, offset });
            const list = await buildList(rows, offset);
            const results = { current_page: _page_no, total_pages: Math.ceil(total_record / process.env.PAGINATION_SIZE), data: list, is_admin, is_maker, is_checker };
            return res.status(200).json(success(true, res.statusCode, "", results));
        } else {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have checker/maker authority.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const app_req_rejected = async (req, res, next) => {
    const { page_no, search_text, in_live } = req.body;
    try {
        const { CstAppMast, CstCustomer, AdmUser, Product, CstAppProduct } = getModels();
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0; if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";
        const _in_live = in_live === true;
        const offset = (_page_no - 1) * process.env.PAGINATION_SIZE;

        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);

        // Use shared helper function for products
        const getAppProducts = (app_id) => getAppProductsForApp(app_id, CstAppProduct, Product);

        // Helper function to build list from rows
        const buildList = async (rows, startSrNo) => {
            const list = [];
            let sr_no = startSrNo;
            for (const app of rows) {
                sr_no++;
                const products = await getAppProducts(app.app_id);
                list.push({
                    sr_no,
                    app_id: app.app_id,
                    full_name: formatFullName(app.customer),
                    email_id: app.customer?.email_id || '',
                    mobile_no: app.customer?.mobile_no || '',
                    app_name: app.app_name,
                    products,
                    mkr_rejected: app.mkr_is_rejected,
                    mkr_date: formatDateField(app.mkr_rejected_date),
                    mkr_remark: app.mkr_rejected_rmk,
                    mkr_name: formatFullName(app.mkrRejectedByUser),
                    chkr_rejected: app.is_rejected,
                    chkr_date: formatDateField(app.rejected_date),
                    chkr_remark: app.reject_remark,
                    chkr_name: formatFullName(app.rejectedByUser),
                });
            }
            return list;
        };

        const searchCondition = _search_text ? {
            [Op.or]: [
                { '$customer.email_id$': { [Op.iLike]: `${_search_text}%` } },
                { '$customer.mobile_no$': { [Op.iLike]: `${_search_text}%` } },
                { app_name: { [Op.iLike]: `${_search_text}%` } }
            ]
        } : {};

        const whereClause = {
            is_deleted: false,
            in_live_env: _in_live,
            is_approved: false,
            [Op.or]: [{ mkr_is_rejected: true }, { is_rejected: true }],
            ...searchCondition
        };

        const includeCustomer = {
            model: CstCustomer,
            as: 'customer',
            where: { is_deleted: false },
            attributes: ['first_name', 'last_name', 'email_id', 'mobile_no'],
            required: true
        };

        const includes = [
            includeCustomer,
            { model: AdmUser, as: 'mkrRejectedByUser', attributes: ['first_name', 'last_name'], required: false },
            { model: AdmUser, as: 'rejectedByUser', attributes: ['first_name', 'last_name'], required: false }
        ];

        if (is_maker || is_checker || is_admin) {
            const total_record = await CstAppMast.count({ where: whereClause, include: [includeCustomer] });
            const rows = await CstAppMast.findAll({ where: whereClause, include: includes, order: [['app_id', 'DESC']], limit: process.env.PAGINATION_SIZE, offset });
            const list = await buildList(rows, offset);
            const results = { current_page: _page_no, total_pages: Math.ceil(total_record / process.env.PAGINATION_SIZE), data: list, is_admin, is_maker, is_checker };
            return res.status(200).json(success(true, res.statusCode, "", results));
        } else {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have checker/maker authority.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

// Helper function to build app detail result object (reduces cognitive complexity)
const buildAppDetailResult = (appData, products, certificateFile, roles) => {
    const { is_admin, is_checker, is_maker } = roles;
    const customer = appData.customer || {};

    return {
        app_id: appData.app_id,
        first_name: customer.first_name || '',
        last_name: customer.last_name || '',
        email_id: customer.email_id || '',
        mobile_no: customer.mobile_no || '',
        app_name: appData.app_name,
        description: appData.description,
        expected_volume: appData.expected_volume,
        callback_url: appData.callback_url,
        ip_addresses: appData.ip_addresses,
        certificate_file: certificateFile,
        products: products,
        in_live_env: appData.in_live_env,
        added_date: formatDateField(appData.added_date),
        apigee_status: appData.apigee_status,
        is_approved: appData.is_approved,
        approve_date: formatDateField(appData.approve_date),
        approve_remark: appData.approve_remark,
        chkr_approve_by: formatFullName(appData.approvedByUser),
        is_rejected: appData.is_rejected,
        rejected_date: formatDateField(appData.rejected_date),
        reject_remark: appData.reject_remark,
        chkr_reject_by: formatFullName(appData.rejectedByUser),
        api_key: appData.api_key,
        api_secret: appData.api_secret,
        key_issued_date: formatDateField(appData.key_issued_date),
        key_expiry_date: formatDateField(appData.key_expiry_date),
        mkr_is_approved: appData.mkr_is_approved,
        mkr_approved_date: formatDateField(appData.mkr_approved_date),
        mkr_approved_rmk: appData.mkr_approved_rmk,
        mkr_approve_by: formatFullName(appData.mkrApprovedByUser),
        mkr_is_rejected: appData.mkr_is_rejected,
        mkr_rejected_date: formatDateField(appData.mkr_rejected_date),
        mkr_rejected_rmk: appData.mkr_rejected_rmk,
        mkr_reject_by: formatFullName(appData.mkrRejectedByUser),
        is_admin,
        is_maker,
        is_checker,
    };
};

// Helper function to get certificate file URL
const getCertificateFileUrl = (req, certificateFile) => {
    return certificateFile && certificateFile.length > 0
        ? db.get_uploads_url(req) + certificateFile
        : '';
};

const app_req_view_detail = async (req, res, next) => {
    const { app_id } = req.body;
    try {
        const { CstAppMast, CstCustomer, CstAppProduct, Product, AdmUser } = getModels();
        const _app_id = app_id && validator.isNumeric(app_id.toString()) ? parseInt(app_id) : 0;

        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);

        // Early return for unauthorized users
        if (!is_admin && !is_checker && !is_maker) {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have checker/maker authority.", null));
        }

        const appData = await CstAppMast.findOne({
            where: { app_id: _app_id, is_deleted: false },
            include: [
                { model: CstCustomer, as: 'customer', attributes: ['company_name', 'first_name', 'last_name', 'email_id', 'mobile_no'] },
                { model: AdmUser, as: 'mkrApprovedByUser', attributes: ['first_name', 'last_name'], required: false },
                { model: AdmUser, as: 'mkrRejectedByUser', attributes: ['first_name', 'last_name'], required: false },
                { model: AdmUser, as: 'approvedByUser', attributes: ['first_name', 'last_name'], required: false },
                { model: AdmUser, as: 'rejectedByUser', attributes: ['first_name', 'last_name'], required: false }
            ]
        });

        if (!appData) {
            return res.status(200).json(success(false, res.statusCode, "App details not found.", null));
        }

        const products = await getAppProductsForApp(_app_id, CstAppProduct, Product);
        const certificateFile = getCertificateFileUrl(req, appData.certificate_file);
        const roles = { is_admin, is_checker, is_maker };
        const results = buildAppDetailResult(appData, products, certificateFile, roles);

        return res.status(200).json(success(true, res.statusCode, "App Details Data.", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

// Helper: Validate app approval status
const validateAppApprovalStatus = (appData, is_maker) => {
    if (appData.is_approved) {
        return { valid: false, message: "App is already approved." };
    }
    if (is_maker && appData.mkr_is_approved) {
        return { valid: false, message: "App is already approved." };
    }
    if (appData.is_rejected || appData.mkr_is_rejected) {
        return { valid: false, message: "App is rejected, can not approve." };
    }
    return { valid: true };
};

// Helper: Process maker approval
const processMakerApproval = async (CstAppMast, appId, tokenData, remark, appData) => {
    const [affectedRows] = await CstAppMast.update(
        {
            mkr_is_approved: true,
            mkr_approved_by: tokenData.account_id,
            mkr_approved_date: db.get_ist_current_date(),
            mkr_approved_rmk: remark
        },
        { where: { app_id: appId } }
    );

    if (affectedRows > 0) {
        logApprovalAction(tokenData, appData, 'maker');
        return { success: true, message: "App approved successfully." };
    }
    return { success: false, message: "Unable to approve, Please try again." };
};

// Helper: Log approval action
const logApprovalAction = (tokenData, appData, approverType) => {
    try {
        const envLabel = appData.in_live_env ? 'Live' : 'Sandbox';
        const data_to_log = {
            correlation_id: correlator.getId(),
            token_id: tokenData.token_id,
            account_id: tokenData.account_id,
            user_type: 1,
            user_id: tokenData.admin_id,
            narration: `${envLabel} app approved by ${approverType}. Customer email = ${appData.email_id}, App name = ${appData.app_name}`,
            query: `CstAppMast.update({ approval update })`,
        };
        action_logger.info(JSON.stringify(data_to_log));
    } catch (_) { /* ignore logging errors */ }
};

// Helper: Create Apigee app
const createApigeeApp = async (email_id, appData, products, callback_url) => {
    const data = {
        developerId: appData.developer_id,
        name: appData.app_name,
        callbackUrl: callback_url,
        status: "approved",
        apiProducts: products,
    };
    const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers/${email_id}/apps`;
    const apigeeAuth = await db.get_apigee_token();
    const response = await fetch(product_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    return { responseData: await response.json(), apigeeAuth };
};

// Helper: Subscribe products
const subscribeProducts = async (products, email_id) => {
    try {
        for (const element of products) {
            const data = { apiproduct: element };
            const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers/${email_id}/subscriptions`;
            const apigeeAuth = await db.get_apigee_token();
            await fetch(product_URL, {
                method: "POST",
                headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
        }
    } catch (error) {
        _logger.error('Product subscription error: ' + error.message);
    }
};

// Helper: Build KVM input
const buildKvmInput = (ip_addresses, cert_public_key) => {
    const hasValidIp = ip_addresses && ip_addresses.length > 1;
    const hasPublicKey = cert_public_key && cert_public_key.length > 0;
    return {
        authenticationType: hasValidIp ? "apikey_ip" : "apikey",
        enableEncryption: hasPublicKey,
        publicKey: hasPublicKey ? cert_public_key : "",
        validIpList: hasValidIp ? ip_addresses : "",
        mode: "",
        isInternal: "false"
    };
};

// Helper: Update KVM in Apigee
const updateApigeeKvm = async (apigee_app_id, kvm_input, in_live_env, apigeeAuth, CstAppMast, appId) => {
    try {
        const kvm_2 = { name: apigee_app_id, value: JSON.stringify(kvm_input) };
        const kvm_environment = in_live_env ? 'prod-01' : 'uat-01';
        const kvm_url = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/environments/${kvm_environment}/keyvaluemaps/MERCHANT-CONFIG/entries`;
        const kvm_response = await fetch(kvm_url, {
            method: "POST",
            headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json" },
            body: JSON.stringify(kvm_2),
        });
        const kvm_responseData = await kvm_response.json();
        await CstAppMast.update({ kvm_json_data: JSON.stringify(kvm_responseData) }, { where: { app_id: appId } });
    } catch (_) {
        _logger.error('KVM update error');
    }
};

// Helper: Insert customer app data
const insertCustomerAppData = async (appId, appData, apigee_app_id, approval_response) => {
    try {
        const _ad_query = `INSERT INTO customer_app_data(app_id, customer_id, apigee_app_id, app_name, apigee_status, json_data) VALUES (?, ?, ?, ?, ?, ?)`;
        const _replacementsad = [appId, appData.customer_id, apigee_app_id, appData.app_name, 'approve', approval_response];
        const [, ad] = await db.sequelize2.query(_ad_query, { replacements: _replacementsad, type: QueryTypes.INSERT });

        if (ad > 0) {
            await insertProductData(appId);
        }
    } catch (__err) {
        _logger.error(__err.stack);
    }
};

// Helper: Insert product data
const insertProductData = async (appId) => {
    const _queryad = `SELECT cam.app_id, p.product_name, pr.proxy_id, pr.proxy_name, e.endpoint_id, e.endpoint_url, cm.in_live_env as is_prod,
        CASE WHEN cm.in_live_env = true THEN 'https://prod.risewithprotean.io/' ELSE 'https://uat.risewithprotean.io/' END as url
        FROM cst_app_product cam
        INNER JOIN product p ON cam.product_id = p.product_id
        INNER JOIN proxies pr ON cam.product_id = pr.product_id
        INNER JOIN endpoint e ON pr.proxy_id = e.proxy_id
        LEFT JOIN cst_app_mast cm ON cam.app_id = cm.app_id
        WHERE cam.app_id = ?`;
    const ad1 = await db.sequelize.query(_queryad, { replacements: [appId], type: QueryTypes.SELECT });

    if (!ad1) return;

    for (const item of ad1) {
        const _ad2_query = `INSERT INTO productdata(product_name, proxy_name, endpoint_id, endpoint_url, is_prod, url, app_id, proxy_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        const _replacementsad2 = [item.product_name, item.proxy_name, item.endpoint_id, item.endpoint_url, item.is_prod, item.url, item.app_id, item.proxy_id];
        await db.sequelize2.query(_ad2_query, { replacements: _replacementsad2, type: QueryTypes.INSERT });
    }
};

// Helper: Process checker/admin approval with Apigee
const processCheckerAdminApproval = async (CstAppMast, CstAppProduct, Product, appId, tokenData, remark, appData, is_admin) => {
    const appProducts = await CstAppProduct.findAll({
        where: { app_id: appId },
        include: [{ model: Product, as: 'product', attributes: ['product_id', 'product_name'], required: true }]
    });
    const products = appProducts.map(ap => ap.product.product_name);
    const email_id = appData.email_id;
    const developer_id = appData.developer_id;
    const callback_url = appData.callback_url || "";
    const cert_public_key = appData.cert_public_key || "";
    const ip_addresses = appData.ip_addresses || "";

    if (!developer_id || !email_id) {
        return { success: false, message: "Apigee response : Developer id not found" };
    }

    const { responseData, apigeeAuth } = await createApigeeApp(email_id, appData, products, callback_url);

    if (!responseData?.appId) {
        if (responseData?.error?.message) {
            return { success: false, message: `Apigee response : ${responseData.error.message}` };
        }
        return { success: false, message: "Unable to approve, Please try again." };
    }

    await subscribeProducts(products, email_id);

    const api_key = responseData.credentials[0].consumerKey;
    const api_secret = responseData.credentials[0].consumerSecret;
    const apigee_app_id = responseData.appId;
    const approval_response = JSON.stringify(responseData);

    const [affectedRows2] = await CstAppMast.update(
        {
            apigee_app_id,
            is_approved: true,
            approved_by: tokenData.account_id,
            approve_date: db.get_ist_current_date(),
            approve_remark: remark,
            api_key,
            api_secret,
            key_issued_date: db.get_ist_current_date(),
            json_data: approval_response,
            apigee_status: 'approve'
        },
        { where: { app_id: appId } }
    );

    if (affectedRows2 <= 0) {
        return { success: false, message: "Unable to approve, Please try again." };
    }

    const kvm_input = buildKvmInput(ip_addresses, cert_public_key);
    await updateApigeeKvm(apigee_app_id, kvm_input, appData.in_live_env, apigeeAuth, CstAppMast, appId);
    logApprovalAction(tokenData, appData, is_admin ? 'admin' : 'checker');
    await insertCustomerAppData(appId, appData, apigee_app_id, approval_response);

    return { success: true, message: "App approved successfully." };
};

const app_req_approve = async (req, res, next) => {
    const { app_id, remark } = req.body;
    try {
        const { CstAppMast, CstCustomer, CstAppProduct, Product } = getModels();
        const _app_id = app_id && validator.isNumeric(app_id.toString()) ? parseInt(app_id) : 0;

        if (!remark || remark.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter remark.", null));
        }

        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);

        if (!is_admin && !is_checker && !is_maker) {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have checker/maker authority.", null));
        }

        const appData = await CstAppMast.findOne({
            where: { app_id: _app_id, is_deleted: false },
            include: [{
                model: CstCustomer,
                as: 'customer',
                where: { is_deleted: false },
                attributes: ['customer_id', 'email_id', 'developer_id']
            }],
            attributes: ['customer_id', 'app_name', 'description', 'expected_volume', 'callback_url', 'ip_addresses', 'cert_public_key', 'app_id', 'in_live_env', 'is_approved', 'is_rejected', 'mkr_is_approved', 'mkr_is_rejected']
        });

        if (!appData) {
            return res.status(200).json(success(false, res.statusCode, "App details not found.", null));
        }

        const appInfo = {
            customer_id: appData.customer_id,
            app_name: appData.app_name,
            callback_url: appData.callback_url || "",
            ip_addresses: appData.ip_addresses || "",
            cert_public_key: appData.cert_public_key || "",
            in_live_env: !!appData.in_live_env,
            is_approved: appData.is_approved,
            is_rejected: appData.is_rejected,
            mkr_is_approved: appData.mkr_is_approved,
            mkr_is_rejected: appData.mkr_is_rejected,
            email_id: appData.customer?.email_id,
            developer_id: appData.customer?.developer_id
        };

        const validation = validateAppApprovalStatus(appInfo, is_maker);
        if (!validation.valid) {
            return res.status(200).json(success(false, res.statusCode, validation.message, null));
        }

        let result;
        if (is_maker) {
            result = await processMakerApproval(CstAppMast, _app_id, req.token_data, remark, appInfo);
        } else {
            result = await processCheckerAdminApproval(CstAppMast, CstAppProduct, Product, _app_id, req.token_data, remark, appInfo, is_admin);
        }

        return res.status(200).json(success(result.success, res.statusCode, result.message, null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

// Helper: Validate app rejection status
const validateAppRejectionStatus = (appData, is_maker) => {
    if (appData.mkr_is_rejected || appData.is_rejected) {
        return { valid: false, message: "App is already rejected." };
    }
    if (appData.is_approved) {
        return { valid: false, message: "App is approved, can not reject" };
    }
    if (is_maker && appData.mkr_is_approved) {
        return { valid: false, message: "App is approved, can not reject" };
    }
    return { valid: true };
};

// Helper: Log rejection action
const logRejectionAction = (tokenData, appData, rejecterType) => {
    try {
        const envLabel = appData.in_live_env ? 'Live' : 'Sandbox';
        const data_to_log = {
            correlation_id: correlator.getId(),
            token_id: tokenData.token_id,
            account_id: tokenData.account_id,
            user_type: 1,
            user_id: tokenData.admin_id,
            narration: `${envLabel} app rejected by ${rejecterType}. Customer email = ${appData.email_id}, App name = ${appData.app_name}`,
            query: `CstAppMast.update({ rejection update })`,
        };
        action_logger.info(JSON.stringify(data_to_log));
    } catch (_) { /* ignore logging errors */ }
};

// Helper: Process rejection
const processRejection = async (CstAppMast, appId, tokenData, remark, appData, is_maker, is_admin) => {
    const updateData = is_maker
        ? {
            mkr_is_rejected: true,
            mkr_rejected_by: tokenData.account_id,
            mkr_rejected_date: db.get_ist_current_date(),
            mkr_rejected_rmk: remark
        }
        : {
            is_rejected: true,
            rejected_by: tokenData.account_id,
            rejected_date: db.get_ist_current_date(),
            reject_remark: remark
        };

    const [affectedRows] = await CstAppMast.update(updateData, { where: { app_id: appId } });

    if (affectedRows > 0) {
        const rejecterType = is_maker ? 'maker' : (is_admin ? 'admin' : 'checker');
        logRejectionAction(tokenData, appData, rejecterType);
        return { success: true, message: "App rejected successfully." };
    }
    return { success: false, message: "Unable to reject, Please try again." };
};

const app_req_reject = async (req, res, next) => {
    const { app_id, remark } = req.body;
    try {
        const { CstAppMast, CstCustomer } = getModels();
        const _app_id = app_id && validator.isNumeric(app_id.toString()) ? parseInt(app_id) : 0;

        if (!remark || remark.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter remark.", null));
        }

        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);

        if (!is_admin && !is_checker && !is_maker) {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have checker/maker authority.", null));
        }

        const appData = await CstAppMast.findOne({
            where: { app_id: _app_id, is_deleted: false },
            include: [{ model: CstCustomer, as: 'customer', attributes: ['email_id'] }],
            attributes: ['app_id', 'app_name', 'in_live_env', 'is_approved', 'is_rejected', 'mkr_is_approved', 'mkr_is_rejected']
        });

        if (!appData) {
            return res.status(200).json(success(false, res.statusCode, "App details not found.", null));
        }

        const appInfo = {
            app_id: appData.app_id,
            app_name: appData.app_name,
            in_live_env: !!appData.in_live_env,
            email_id: appData.customer?.email_id,
            is_approved: appData.is_approved,
            is_rejected: appData.is_rejected,
            mkr_is_approved: appData.mkr_is_approved,
            mkr_is_rejected: appData.mkr_is_rejected
        };

        const validation = validateAppRejectionStatus(appInfo, is_maker);
        if (!validation.valid) {
            return res.status(200).json(success(false, res.statusCode, validation.message, null));
        }

        const result = await processRejection(CstAppMast, _app_id, req.token_data, remark, appInfo, is_maker, is_admin);
        return res.status(200).json(success(result.success, res.statusCode, result.message, null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const app_req_move_live = async (req, res, next) => {
    const { app_id, remark } = req.body;
    try {
        const { CstAppMast } = getModels();
        let _app_id = app_id && validator.isNumeric(app_id.toString()) ? parseInt(app_id) : 0;
        if (!remark || remark.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter remark.", null));
        }

        const row1 = await CstAppMast.findOne({
            where: { app_id: _app_id, is_deleted: false },
            attributes: ['app_id', 'is_approved', 'in_live_env'],
            raw: true
        });

        if (!row1) {
            return res.status(200).json(success(false, res.statusCode, "App details not found.", null));
        }
        if (row1.in_live_env) {
            return res.status(200).json(success(false, res.statusCode, "App is already in live mode.", null));
        }

        const [affectedRows] = await CstAppMast.update(
            {
                in_live_env: true,
                live_by: req.token_data.account_id,
                live_date: db.get_ist_current_date(),
                live_remark: remark,
                modify_by: req.token_data.account_id
            },
            { where: { app_id: _app_id } }
        );

        if (affectedRows > 0) {
            return res.status(200).json(success(true, res.statusCode, "status change successfully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to change status, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const app_req_live = async (req, res, next) => {
    const { page_no, search_text } = req.body;
    try {
        const { CstAppMast, CstCustomer, CstAppProduct, Product } = getModels();
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0; if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";
        const offset = (_page_no - 1) * process.env.PAGINATION_SIZE;

        // Use shared helper function for products
        const getAppProducts = (app_id) => getAppProductsForApp(app_id, CstAppProduct, Product);

        const searchCondition = _search_text ? {
            [Op.or]: [
                { '$customer.email_id$': { [Op.iLike]: `${_search_text}%` } },
                { '$customer.mobile_no$': { [Op.iLike]: `${_search_text}%` } }
            ]
        } : {};

        const whereClause = {
            is_deleted: false,
            is_approved: true,
            is_rejected: false,
            in_live_env: true,
            ...searchCondition
        };

        const includeCustomer = {
            model: CstCustomer,
            as: 'customer',
            where: { is_deleted: false },
            attributes: ['first_name', 'last_name', 'email_id', 'mobile_no'],
            required: true
        };

        const total_record = await CstAppMast.count({ where: whereClause, include: [includeCustomer] });

        const rows = await CstAppMast.findAll({
            where: whereClause,
            include: [includeCustomer],
            order: [['app_id', 'DESC']],
            limit: parseInt(process.env.PAGINATION_SIZE),
            offset
        });

        const list = [];
        let sr_no = offset;
        for (const app of rows) {
            sr_no++;
            const products = await getAppProducts(app.app_id);
            list.push({
                sr_no,
                app_id: app.app_id,
                full_name: formatFullName(app.customer),
                email_id: app.customer?.email_id || '',
                mobile_no: app.customer?.mobile_no || '',
                app_name: app.app_name,
                products,
                live_remark: app.live_remark,
                live_date: formatDateField(app.live_date),
            });
        }

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

// Helper: Toggle Apigee app status
const toggleApigeeAppStatus = async (email_id, app_name, newStatus) => {
    const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers/${email_id}/apps/${app_name}?action=${newStatus}`;
    const apigeeAuth = await db.get_apigee_token();
    const response = await fetch(product_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/octet-stream" },
    });
    return response;
};

// Helper: Log status change action
const logStatusChangeAction = (tokenData, appData, customerData, apigee_status) => {
    try {
        const envLabel = appData.in_live_env ? 'Live' : 'Sandbox';
        const statusLabel = apigee_status === 'approve' ? 'enabled' : 'disabled';
        const data_to_log = {
            correlation_id: correlator.getId(),
            token_id: tokenData.token_id,
            account_id: tokenData.account_id,
            user_type: 1,
            user_id: tokenData.admin_id,
            narration: `${envLabel} app ${statusLabel}. Customer email = ${customerData.email_id}, App name = ${appData.app_name}`,
            query: `CstAppMast.update({ apigee_status: '${apigee_status}' })`,
        };
        action_logger.info(JSON.stringify(data_to_log));
    } catch (_) { /* ignore logging errors */ }
};

// Helper: Process status change in database
const processStatusChange = async (CstAppMast, CstAppStatus, appId, tokenData, status_remark, apigee_status, appData, customerData) => {
    const [affectedRows] = await CstAppMast.update(
        {
            apigee_status: apigee_status,
            modify_date: db.get_ist_current_date(),
            modify_by: tokenData.account_id
        },
        { where: { app_id: appId } }
    );

    if (affectedRows <= 0) {
        return { success: false, message: "Unable to change status, Please try again." };
    }

    const newStatus = await CstAppStatus.create({
        app_id: appId,
        app_status: apigee_status,
        remark: status_remark,
        updated_by: tokenData.account_id,
        update_date: db.get_ist_current_date()
    });

    if (newStatus?.id) {
        logStatusChangeAction(tokenData, appData, customerData, apigee_status);
    }

    return { success: true, message: "Status changed successfully." };
};

const app_req_status_change = async (req, res, next) => {
    const { app_id, status_remark } = req.body;
    try {
        const { CstAppMast, CstCustomer, CstAppStatus } = getModels();
        const _app_id = app_id && validator.isNumeric(app_id.toString()) ? parseInt(app_id) : 0;

        if (!status_remark || status_remark.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter remark.", null));
        }

        const appData = await CstAppMast.findOne({
            where: { app_id: _app_id, is_deleted: false },
            attributes: ['customer_id', 'app_id', 'apigee_app_id', 'app_name', 'apigee_status', 'in_live_env'],
            raw: true
        });

        if (!appData?.app_name) {
            return res.status(200).json(success(false, res.statusCode, "App details not found.", null));
        }

        const customerData = await CstCustomer.findOne({
            where: { customer_id: appData.customer_id, is_deleted: false },
            attributes: ['developer_id', 'email_id'],
            raw: true
        });

        if (!customerData) {
            return res.status(200).json(success(false, res.statusCode, "Unable to change status, Please try again.", null));
        }

        const apigee_status = appData.apigee_status === 'approve' ? 'revoke' : 'approve';
        const response = await toggleApigeeAppStatus(customerData.email_id, appData.app_name, apigee_status);

        if (response.status !== 204) {
            return res.status(200).json(success(false, res.statusCode, "Apigee response : " + response.statusText, null));
        }

        const appInfo = { ...appData, in_live_env: !!appData.in_live_env };
        const result = await processStatusChange(CstAppMast, CstAppStatus, _app_id, req.token_data, status_remark, apigee_status, appInfo, customerData);
        return res.status(200).json(success(result.success, res.statusCode, result.message, null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

// Helper: Extract service ratios from tab
const extractServiceRatios = (services) => {
    let Ratio_Signzy = '';
    let Ratio_Karza = '';
    services.forEach(service => {
        const serviceName = service.name.toLowerCase();
        if (serviceName === 'signzy') {
            Ratio_Signzy = service.value;
        } else if (serviceName === 'karza') {
            Ratio_Karza = service.value;
        }
    });
    return { Ratio_Signzy, Ratio_Karza };
};

// Helper: Validate routing logic input
const validateRoutingLogic = (app_routing_logic) => {
    for (const [product_id, tabs] of Object.entries(app_routing_logic)) {
        for (const tab of tabs) {
            if (!tab.isSelectedTab) continue;

            const tabType = tab.name.split(/(\d+)/)[0];
            if (tabType === 'Split') {
                const { Ratio_Signzy, Ratio_Karza } = extractServiceRatios(tab.services || []);
                if (!Ratio_Signzy) {
                    return { valid: false, message: `Please insert value for Signzy in product tab: ${product_id}` };
                }
                if (!Ratio_Karza) {
                    return { valid: false, message: `Please insert value for Karza in product tab: ${product_id}` };
                }
            } else if (!tab.selectedService) {
                return { valid: false, message: `Please select a service in product: ${product_id}` };
            }
        }
    }
    return { valid: true };
};

// Helper: Build KVM value based on tab type
const buildKvmValueForTab = (tab) => {
    const tabType = tab.name.split(/(\d+)/)[0];
    const selectedService = tab.selectedService;
    const baseKvm = {
        signzy: '0.0',
        karza: '0.0',
        getTime: moment().format('YYYYMMDDHHmmss'),
    };

    switch (tabType) {
        case 'Fix':
            return {
                ...baseKvm,
                Ratio_S: selectedService === "Signzy" ? 1 : 0,
                Ratio_K: selectedService === "Karza" ? 1 : 0,
                fallback: "false"
            };
        case 'Split': {
            const { Ratio_Signzy, Ratio_Karza } = extractServiceRatios(tab.services || []);
            return {
                ...baseKvm,
                Ratio_S: Ratio_Signzy,
                Ratio_K: Ratio_Karza,
                fallback: tab.isFallback ? 'true' : 'false'
            };
        }
        case 'Fallback':
            return {
                ...baseKvm,
                Ratio_S: selectedService === "Signzy" ? 1 : 0,
                Ratio_K: selectedService === "Karza" ? 1 : 0,
                fallback: 'true'
            };
        default:
            throw new Error(`Unknown tab type: ${tabType}`);
    }
};

// Helper: Update routing KVM in Apigee
const updateRoutingKvm = async (appInfo, app_routing_logic) => {
    const kvm_environment = appInfo.in_live_env ? 'prod-01' : 'uat-01';
    const hasExistingKvm = appInfo.app_kvm_json_data && appInfo.app_kvm_json_data.length > 0;

    for (const [product_id, tabs] of Object.entries(app_routing_logic)) {
        let kvm_value = {};
        for (const tab of tabs) {
            if (tab.isSelectedTab) {
                kvm_value = buildKvmValueForTab(tab);
            }
        }

        const kvm_name = `${appInfo.apigee_app_id}_${product_id}`;
        const kvm_2 = { name: kvm_name, value: JSON.stringify(kvm_value) };
        const method = hasExistingKvm ? 'PUT' : 'POST';
        const kvm_url = hasExistingKvm
            ? `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/environments/${kvm_environment}/keyvaluemaps/routingLogic-KS/entries/${kvm_name}`
            : `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/environments/${kvm_environment}/keyvaluemaps/routingLogic-KS/entries`;

        const apigeeAuth = await db.get_apigee_token();
        await fetch(kvm_url, {
            method,
            headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json" },
            body: JSON.stringify(kvm_2),
        });
    }
};

// Helper: Log routing KVM update
const logRoutingKvmUpdate = (tokenData, appInfo, appId) => {
    try {
        const envLabel = appInfo.in_live_env ? 'Live' : 'UAT';
        const data_to_log = {
            correlation_id: correlator.getId(),
            token_id: tokenData.token_id,
            account_id: tokenData.account_id,
            user_type: 1,
            user_id: tokenData.admin_id,
            narration: `${envLabel} app kvm update by admin. App Id = ${appId}, App name = ${appInfo.app_name}`,
            query: `CstAppMast.update({ app_routing_logic: '...' }, { where: { app_id: ${appId} }})`,
        };
        action_logger.info(JSON.stringify(data_to_log));
    } catch (_) { /* ignore logging errors */ }
};

const app_routing_logic_kvm_update = async (req, res, next) => {
    const { app_id, app_routing_logic } = req.body;
    try {
        const { CstAppMast, CstCustomer } = getModels();
        const _app_id = app_id && validator.isNumeric(app_id.toString()) ? parseInt(app_id) : 0;

        if (!app_routing_logic) {
            return res.status(200).json(success(false, res.statusCode, "Please enter ratio.", null));
        }

        const validation = validateRoutingLogic(app_routing_logic);
        if (!validation.valid) {
            return res.status(200).json(success(false, res.statusCode, validation.message, null));
        }

        const appData = await CstAppMast.findOne({
            where: { app_id: _app_id, is_deleted: false },
            include: [{
                model: CstCustomer,
                as: 'customer',
                where: { is_deleted: false },
                attributes: ['email_id', 'developer_id']
            }],
            attributes: ['customer_id', 'app_name', 'description', 'in_live_env', 'app_id', 'apigee_app_id', 'app_kvm_json_data']
        });

        if (!appData) {
            return res.status(200).json(success(false, res.statusCode, "App details not found.", null));
        }

        const appInfo = {
            app_name: appData.app_name,
            in_live_env: !!appData.in_live_env,
            apigee_app_id: appData.apigee_app_id,
            app_kvm_json_data: appData.app_kvm_json_data
        };

        const [affectedRows] = await CstAppMast.update(
            {
                app_routing_logic_added_by: req.token_data.account_id,
                app_routing_logic_added_date: db.get_ist_current_date(),
                app_routing_logic: JSON.stringify(app_routing_logic)
            },
            { where: { app_id: _app_id } }
        );

        if (affectedRows <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Unable to process, Please try again.", null));
        }

        try {
            await updateRoutingKvm(appInfo, app_routing_logic);
        } catch (kvmError) {
            _logger.error('KVM update error: ' + kvmError.message);
        }

        logRoutingKvmUpdate(req.token_data, appInfo, _app_id);
        return res.status(200).json(success(true, res.statusCode, "App Routing KVM Updated successfully.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

// Helper: Parse routing logic safely
const parseRoutingLogic = (app_routing_logic) => {
    try {
        return app_routing_logic ? JSON.parse(app_routing_logic) : {};
    } catch (error) {
        _logger.error('Error parsing app_routing_logic: ' + error.message);
        return {};
    }
};

// Helper: Build product list with routing
const buildProductListWithRouting = (appProducts, routingLogic) => {
    return appProducts.map(appProduct => {
        const item = appProduct.product;
        const productRouting = routingLogic[item.product_name] || [];
        return {
            id: item.product_id,
            name: item.product_name,
            tabs: routingLogic[item.product_id] || [],
            activeTabId: productRouting.length > 0 ? productRouting[0].id : '',
        };
    });
};

const app_product_list_get = async (req, res, next) => {
    const { app_id } = req.body;
    try {
        const { CstAppMast, CstCustomer, CstAppProduct, Product } = getModels();
        const _app_id = app_id && validator.isNumeric(app_id.toString()) ? parseInt(app_id) : 0;

        const appData = await CstAppMast.findOne({
            where: { app_id: _app_id, is_deleted: false },
            include: [{ model: CstCustomer, as: 'customer', attributes: ['first_name', 'last_name'] }],
            attributes: ['app_id', 'app_name', 'description', 'app_routing_logic']
        });

        let apps_data = {};
        let products = [];

        if (appData) {
            const appProducts = await CstAppProduct.findAll({
                where: { app_id: _app_id },
                include: [{
                    model: Product,
                    as: 'product',
                    where: { is_routing_applicable: true },
                    attributes: ['product_id', 'product_name', 'description', 'key_features'],
                    required: true
                }],
                order: [[{ model: Product, as: 'product' }, 'product_id', 'ASC']]
            });

            const routingLogic = parseRoutingLogic(appData.app_routing_logic);
            products = buildProductListWithRouting(appProducts, routingLogic);

            apps_data = {
                app_id: appData.app_id,
                app_name: appData.app_name,
                app_routing_logic: appData.app_routing_logic,
                display_name: appData.display_name,
                description: appData.description,
                full_name: formatFullName(appData.customer),
                routing_tab_data: Constants.routing_tab_data,
            };
        }

        const results = { apps_data, app_products_list: products };
        return res.status(200).json(success(true, res.statusCode, "My Apps Data.", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

// Helper: Add product rate to Apigee
const addApigeeProductRate = async (email_id, app_name, product_data) => {
    const data = { attribute: product_data };
    const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers/${email_id}/apps/${app_name}/attributes`;
    const apigeeAuth = await db.get_apigee_token();
    const response = await fetch(product_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    return response.json();
};

// Helper: Log product rate addition
const logProductRateAddition = (tokenData, appInfo) => {
    try {
        const envLabel = appInfo.in_live_env ? 'Live' : 'Sandbox';
        const data_to_log = {
            correlation_id: correlator.getId(),
            token_id: tokenData.token_id,
            account_id: tokenData.account_id,
            user_type: 1,
            user_id: tokenData.admin_id,
            narration: `${envLabel} app product rate added. Customer email = ${appInfo.email_id}, App name = ${appInfo.app_name}`,
            query: `CstAppMast.update({ app_wallet_rate_data: '...' })`,
        };
        action_logger.info(JSON.stringify(data_to_log));
    } catch (_) { /* ignore logging errors */ }
};

const app_product_apigee_rate_add = async (req, res, next) => {
    const { app_id, product_data } = req.body;
    try {
        const { CstAppMast, CstCustomer } = getModels();
        const _app_id = app_id && validator.isNumeric(app_id.toString()) ? parseInt(app_id) : 0;

        const appData = await CstAppMast.findOne({
            where: { app_id: _app_id, is_deleted: false },
            include: [{ model: CstCustomer, as: 'customer', where: { is_deleted: false }, attributes: ['email_id', 'developer_id'] }],
            attributes: ['customer_id', 'app_name', 'description', 'app_id', 'in_live_env', 'is_approved', 'is_rejected', 'mkr_is_approved', 'mkr_is_rejected']
        });

        if (!appData) {
            return res.status(200).json(success(false, res.statusCode, "App details not found.", null));
        }

        const email_id = appData.customer?.email_id;
        const app_name = appData.app_name;

        if (!_app_id || !app_name || !email_id) {
            return res.status(200).json(success(false, res.statusCode, "Apigee response : email or app name not found", null));
        }

        const responseData = await addApigeeProductRate(email_id, app_name, product_data);

        if (responseData?.error?.message) {
            return res.status(200).json(success(false, res.statusCode, `Apigee response : ${responseData.error.message}`, null));
        }

        if (!responseData) {
            return res.status(200).json(success(false, res.statusCode, "Unable to approve, Please try again.", null));
        }

        const [affectedRows] = await CstAppMast.update(
            {
                app_wallet_rate_added_by: req.token_data.account_id,
                app_wallet_rate_added_date: db.get_ist_current_date(),
                app_wallet_rate_data: JSON.stringify(product_data),
                app_wallet_rate_kvm_json_data: JSON.stringify(responseData)
            },
            { where: { app_id: _app_id } }
        );

        if (affectedRows <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Unable to approve, Please try again.", null));
        }

        const appInfo = { email_id, app_name, in_live_env: !!appData.in_live_env };
        logProductRateAddition(req.token_data, appInfo);
        return res.status(200).json(success(true, res.statusCode, "App approved successfully.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

// Helper: Toggle monetization KVM in Apigee
const toggleMonetizationKvm = async (appInfo, newValue) => {
    const kvm_environment = appInfo.in_live_env ? 'prod-01' : 'uat-01';
    const kvm_input = { monetisation: newValue };
    const kvm_2 = { name: appInfo.apigee_app_id, value: JSON.stringify(kvm_input) };
    const method = appInfo.is_monetization_added ? 'PUT' : 'POST';
    const kvm_url = appInfo.is_monetization_added
        ? `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/environments/${kvm_environment}/keyvaluemaps/Monetisation-Enable/entries/${appInfo.apigee_app_id}`
        : `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/environments/${kvm_environment}/keyvaluemaps/Monetisation-Enable/entries`;

    const apigeeAuth = await db.get_apigee_token();
    const kvm_response = await fetch(kvm_url, {
        method,
        headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json" },
        body: JSON.stringify(kvm_2),
    });
    return { response: kvm_response, data: await kvm_response.json() };
};

// Helper: Log monetization toggle
const logMonetizationToggle = (tokenData, appInfo, newStatus) => {
    try {
        const envLabel = appInfo.in_live_env ? 'Live' : 'Sandbox';
        const statusLabel = appInfo.is_monetization_enabled ? 'disabled' : 'enabled';
        const data_to_log = {
            correlation_id: correlator.getId(),
            token_id: tokenData.token_id,
            account_id: tokenData.account_id,
            user_type: 1,
            user_id: tokenData.admin_id,
            narration: `${envLabel} ${statusLabel} app monetization status updated. Customer email = ${appInfo.email_id}, App name = ${appInfo.app_name}`,
            query: `CstAppMast.update({ is_monetization_enabled: ${newStatus} })`,
        };
        action_logger.info(JSON.stringify(data_to_log));
    } catch (_) { /* ignore logging errors */ }
};

const app_monitization_toggle = async (req, res, next) => {
    const { app_id } = req.body;
    try {
        const { CstAppMast, CstCustomer } = getModels();
        const _app_id = app_id && validator.isNumeric(app_id.toString()) ? parseInt(app_id) : 0;

        const appData = await CstAppMast.findOne({
            where: { app_id: _app_id, is_deleted: false },
            include: [{ model: CstCustomer, as: 'customer', where: { is_deleted: false }, attributes: ['email_id', 'developer_id'] }],
            attributes: ['customer_id', 'app_name', 'apigee_app_id', 'app_id', 'in_live_env', 'is_monetization_enabled', 'is_monetization_added']
        });

        if (!appData) {
            return res.status(200).json(success(false, res.statusCode, "App details not found.", null));
        }

        if (!appData.apigee_app_id) {
            return res.status(200).json(success(false, res.statusCode, "Apigee App Id not found.", null));
        }

        const appInfo = {
            app_name: appData.app_name,
            apigee_app_id: appData.apigee_app_id,
            in_live_env: !!appData.in_live_env,
            is_monetization_enabled: appData.is_monetization_enabled,
            is_monetization_added: !!appData.is_monetization_added,
            email_id: appData.customer?.email_id
        };

        const newEnabledStatus = !appInfo.is_monetization_enabled;

        try {
            const { response, data: kvm_responseData } = await toggleMonetizationKvm(appInfo, newEnabledStatus);

            if (response.ok && kvm_responseData?.name) {
                await CstAppMast.update(
                    {
                        is_monetization_enabled: newEnabledStatus,
                        monetization_kvm_json_data: JSON.stringify(kvm_responseData),
                        monetization_enabled_date: db.get_ist_current_date(),
                        is_monetization_added: true
                    },
                    { where: { app_id: _app_id } }
                );
                logMonetizationToggle(req.token_data, appInfo, newEnabledStatus);
                return res.status(200).json(success(true, res.statusCode, "App Monetization Status Change successfully.", null));
            }

            if (kvm_responseData?.error?.message) {
                return res.status(200).json(success(false, res.statusCode, `Apigee response: ${kvm_responseData.error.message}`, null));
            }

            return res.status(200).json(success(false, res.statusCode, "Unable to update, Please try again.", null));
        } catch (kvmError) {
            _logger.error('Monetization toggle error: ' + kvmError.message);
            return res.status(200).json(success(false, res.statusCode, "Unable to update, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

// Helper: Subscribe single product to Apigee
const subscribeProductToApigee = async (email_id, productName) => {
    const data = { apiproduct: productName };
    const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers/${email_id}/subscriptions`;
    const apigeeAuth = await db.get_apigee_token();
    const response = await fetch(product_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    return response.json();
};

const app_rate_subscription = async (req, res, next) => {
    const { app_id } = req.body;
    try {
        const { CstAppMast, CstCustomer, CstAppProduct, Product } = getModels();
        const _app_id = app_id && validator.isNumeric(app_id.toString()) ? parseInt(app_id) : 0;

        const appData = await CstAppMast.findOne({
            where: { app_id: _app_id, is_deleted: false },
            include: [{ model: CstCustomer, as: 'customer', where: { is_deleted: false }, attributes: ['email_id', 'developer_id'] }],
            attributes: ['customer_id', 'app_name', 'app_id', 'in_live_env']
        });

        if (!appData) {
            return res.status(200).json(success(false, res.statusCode, "App details not found.", null));
        }

        const developer_id = appData.customer?.developer_id;
        const email_id = appData.customer?.email_id;

        if (!developer_id || !email_id) {
            return res.status(200).json(success(false, res.statusCode, "Apigee response : Developer id not found", null));
        }

        const appProducts = await CstAppProduct.findAll({
            where: { app_id: _app_id },
            include: [{ model: Product, as: 'product', attributes: ['product_id', 'product_name'], required: true }]
        });
        const products = appProducts.map(ap => ap.product.product_name);

        for (const productName of products) {
            const responseData = await subscribeProductToApigee(email_id, productName);
            if (responseData?.error?.message) {
                _logger.error(`Subscription error for ${productName}: ${responseData.error.message}`);
            }
        }

        return res.status(200).json(success(true, res.statusCode, "product subscriptions successfully.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

// Helper: Update monetization rate in Apigee
const updateMonetizationRateInApigee = async (email_id, app_name, isCurrentlyApplicable) => {
    const value_data = isCurrentlyApplicable ? "False" : "";
    const jsondata = { name: "is_monetization_active", value: value_data };
    const data = { attribute: jsondata };
    const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers/${email_id}/apps/${app_name}/attributes`;
    const apigeeAuth = await db.get_apigee_token();
    const response = await fetch(product_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    return { response, data: await response.json() };
};

// Helper: Log monetization rate toggle
const logMonetizationRateToggle = (tokenData, appInfo, appId) => {
    try {
        const data_to_log = {
            correlation_id: correlator.getId(),
            token_id: tokenData.token_id,
            account_id: tokenData.account_id,
            user_type: 1,
            user_id: tokenData.admin_id,
            narration: `App monetization status updated. Customer email = ${appInfo.email_id}, App name = ${appInfo.app_name}`,
            query: `CstAppMast.update({ is_monetization_rate_appliacable: ... }, { where: { app_id: ${appId} }})`,
        };
        action_logger.info(JSON.stringify(data_to_log));
    } catch (_) { /* ignore logging errors */ }
};

const app_monitization_toggle_uat_prod = async (req, res, next) => {
    const { app_id } = req.body;
    try {
        const { CstAppMast, CstCustomer } = getModels();
        const _app_id = app_id && validator.isNumeric(app_id.toString()) ? parseInt(app_id) : 0;

        const appData = await CstAppMast.findOne({
            where: { app_id: _app_id, is_deleted: false },
            include: [{ model: CstCustomer, as: 'customer', where: { is_deleted: false }, attributes: ['email_id', 'developer_id'] }],
            attributes: ['customer_id', 'app_name', 'is_monetization_rate_appliacable', 'apigee_app_id', 'app_id', 'in_live_env', 'is_approved']
        });

        if (!appData) {
            return res.status(200).json(success(false, res.statusCode, "App details not found.", null));
        }

        if (!appData.apigee_app_id) {
            return res.status(200).json(success(false, res.statusCode, "Apigee App Id not found.", null));
        }

        const appInfo = {
            app_name: appData.app_name,
            email_id: appData.customer?.email_id,
            developer_id: appData.customer?.developer_id,
            is_monetization_rate_appliacable: !!appData.is_monetization_rate_appliacable
        };

        if (!appInfo.developer_id || !appInfo.email_id || !appInfo.app_name) {
            return res.status(200).json(success(false, res.statusCode, "Required data not found.", null));
        }

        try {
            const { response, data: responseData } = await updateMonetizationRateInApigee(
                appInfo.email_id, appInfo.app_name, appInfo.is_monetization_rate_appliacable
            );

            if (response.ok && responseData) {
                const newRateApplicable = !appInfo.is_monetization_rate_appliacable;
                await CstAppMast.update({ is_monetization_rate_appliacable: newRateApplicable }, { where: { app_id: _app_id } });
            }
        } catch (apiError) {
            _logger.error('Monetization rate toggle error: ' + apiError.message);
        }

        logMonetizationRateToggle(req.token_data, appInfo, _app_id);
        return res.status(200).json(success(true, res.statusCode, "App Monetization Status Change successfully.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

export default {
    app_req_pending,
    app_req_approved,
    app_req_rejected,
    app_req_view_detail,
    app_req_approve,
    app_req_reject,
    app_req_move_live,
    app_req_live,
    app_req_status_change,
    app_routing_logic_kvm_update,
    app_product_list_get,
    app_product_apigee_rate_add,
    app_monitization_toggle,
    app_rate_subscription,
    app_monitization_toggle_uat_prod
};
