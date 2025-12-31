import { logger as _logger, action_logger } from "../../logger/winston.js";
import db from "../../database/db_helper.js";
import { success } from "../../model/responseModel.js";
import { Op } from "sequelize";
import dateFormat from "date-format";
import validator from "validator";
import { fetch } from 'cross-fetch';
import correlator from 'express-correlation-id';
import { API_STATUS } from "../../model/enumModel.js";
import commonModule from "../../modules/commonModule.js";

// Helper function to get models - must be called after db is initialized
const getModels = () => db.models;

// Helper: Validate product rate data
const validateProductRateData = (app_product_rate_data) => {
    if (!app_product_rate_data?.length) {
        return { valid: false, message: "Please enter product rate value.", field: null };
    }
    for (const item of app_product_rate_data) {
        const { name, value } = item;
        if (!name || !value) {
            return { valid: false, message: `Value for ${name || 'unknown product'} is required.`, field: name };
        }
        if (!validator.isNumeric(value.toString())) {
            return { valid: false, message: `Value for ${name} must be numeric.`, field: name };
        }
    }
    return { valid: true };
};

// Helper: Call Apigee API to update app attributes
const updateApigeeAppAttributes = async (email_id, app_name, attributeData) => {
    const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers/${email_id}/apps/${app_name}/attributes`;
    const apigeeAuth = await db.get_apigee_token();
    const response = await fetch(product_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json" },
        body: JSON.stringify({ attribute: attributeData }),
    });
    const responseData = await response.json();
    return { response, responseData };
};

// Helper: Log action
const logRateAction = (req, narration, query) => {
    try {
        const data_to_log = {
            correlation_id: correlator.getId(),
            token_id: req.token_data.token_id,
            account_id: req.token_data.account_id,
            user_type: 1,
            user_id: req.token_data.admin_id,
            narration,
            query,
            date_time: db.get_ist_current_date(),
        };
        action_logger.info(JSON.stringify(data_to_log));
    } catch (_) { }
};

// Helper: Handle admin rate addition flow
const handleAdminRateAdd = async (req, res, appDetails, app_product_rate_data, _app_id) => {
    const { AppProductRate, CstAppMast } = getModels();
    const { email_id, app_name, customer_id, in_live_env } = appDetails;

    await AppProductRate.create({
        app_id: _app_id,
        customer_id,
        added_date: db.get_ist_current_date(),
        added_by: req.token_data.account_id,
        rate_plan_value: JSON.stringify(app_product_rate_data),
        is_rate_plan_approved: true
    });

    const { response, responseData } = await updateApigeeAppAttributes(email_id, app_name, app_product_rate_data);

    if (response.ok && responseData) {
        const kvm_rate_response = JSON.stringify(responseData);
        const [i] = await CstAppMast.update({
            app_wallet_rate_added_by: req.token_data.account_id,
            app_wallet_rate_added_date: db.get_ist_current_date(),
            app_wallet_rate_data: JSON.stringify(app_product_rate_data),
            app_wallet_rate_kvm_json_data: kvm_rate_response
        }, { where: { app_id: _app_id } });

        if (i > 0) {
            logRateAction(req, `${in_live_env ? 'Live' : 'Sandbox'} app product rate added. Customer email = ${email_id}, App name = ${app_name}`, 'ORM update CstAppMast');
            return res.status(200).json(success(true, res.statusCode, "App approved successfully.", null));
        }
        return res.status(200).json(success(false, res.statusCode, "Unable to approve, Please try again.", null));
    }

    if (responseData?.error?.message) {
        const message = `Apigee response: ${responseData.error.message}`;
        const statusCode = responseData.error.status === 'ABORTED' && responseData.error.code === 409 ? 200 : 400;
        return res.status(statusCode).json(success(false, statusCode, message, null));
    }
    return res.status(200).json(success(false, res.statusCode, "Unable to Add Rate, Please try again.", null));
};

// Helper: Handle maker rate addition flow
const handleMakerRateAdd = async (req, res, appDetails, app_product_rate_data, _app_id) => {
    const { AppProductRate } = getModels();
    const { app_name, customer_id } = appDetails;

    const newRate = await AppProductRate.create({
        app_id: _app_id,
        customer_id,
        added_date: db.get_ist_current_date(),
        added_by: req.token_data.account_id,
        rate_plan_value: JSON.stringify(app_product_rate_data)
    });

    if (newRate?.ap_rate_id > 0) {
        logRateAction(req, `App Product Rate added  App name = ${app_name}, App Product Data = ${JSON.stringify(app_product_rate_data)}`, 'ORM create AppProductRate');
        return res.status(200).json(success(true, res.statusCode, "Saved successfully.", null));
    }
    return res.status(200).json(success(false, res.statusCode, "Unable to save, Please try again", null));
};

const app_product_rate_add = async (req, res, next) => {
    const { app_id, app_product_rate_data } = req.body;
    try {
        const { CstAppMast, CstCustomer } = getModels();
        const _app_id = app_id && validator.isNumeric(app_id.toString()) ? parseInt(app_id) : 0;

        const validation = validateProductRateData(app_product_rate_data);
        if (!validation.valid) {
            const statusCode = validation.field ? 400 : 200;
            return res.status(statusCode).json(success(false, statusCode, validation.message, null));
        }

        const appDetails = await CstAppMast.findOne({
            where: { app_id: _app_id, is_deleted: false },
            attributes: ['customer_id', 'app_name', 'description', 'app_id', 'in_live_env', 'is_approved', 'is_rejected', 'mkr_is_approved', 'mkr_is_rejected'],
            include: [{
                model: CstCustomer,
                as: 'customer',
                where: { is_deleted: false },
                attributes: ['email_id', 'developer_id'],
                required: true
            }]
        });

        if (!appDetails) {
            return res.status(200).json(success(false, res.statusCode, "App details not found.", null));
        }

        const appInfo = {
            email_id: appDetails.customer.email_id,
            in_live_env: !!appDetails.in_live_env,
            app_name: appDetails.app_name,
            customer_id: appDetails.customer_id
        };

        const [is_admin, is_checker] = await commonModule.getUserRoles(req);

        if (is_checker) {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have authority.", null));
        }

        if (is_admin) {
            return handleAdminRateAdd(req, res, appInfo, app_product_rate_data, _app_id);
        }
        return handleMakerRateAdd(req, res, appInfo, app_product_rate_data, _app_id);

    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};



// Helper: Parse pagination params
const parsePaginationParams = (page_no, search_text) => {
    let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 1;
    if (_page_no <= 0) _page_no = 1;
    const _search_text = search_text?.length > 0 ? search_text : "";
    const offset = (_page_no - 1) * process.env.PAGINATION_SIZE;
    return { _page_no, _search_text, offset };
};

// Helper: Get user full name from user object
const getUserFullName = (user) => {
    if (!user) return '';
    return `${user.first_name || ''} ${user.last_name || ''}`.trim();
};

// Helper: Format date or return empty string
const formatDateField = (dateValue) => {
    return dateValue ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(dateValue)) : "";
};

// Helper: Get products for an app
const getAppProducts = async (app_id) => {
    const { Product, CstAppProduct } = getModels();
    const appProducts = await CstAppProduct.findAll({
        where: { app_id },
        include: [{
            model: Product,
            as: 'product',
            attributes: ['product_id', 'product_name', 'description', 'key_features'],
            required: true
        }]
    });
    return appProducts.map(ap => ({
        product_id: ap.product.product_id,
        product_name: ap.product.product_name,
        description: ap.product.description,
        key_features: ap.product.key_features,
    }));
};

// Helper: Build paginated results
const buildPaginatedResults = (_page_no, total_record, data, roles) => ({
    current_page: _page_no,
    total_pages: Math.ceil(total_record / process.env.PAGINATION_SIZE),
    data,
    is_admin: roles.is_admin,
    is_maker: roles.is_maker,
    is_checker: roles.is_checker,
});

const app_product_rate_pending_list = async (req, res, next) => {
    const { page_no, search_text } = req.body;
    try {
        const { AppProductRate, CstAppMast, AdmUser } = getModels();
        const { _page_no, _search_text, offset } = parsePaginationParams(page_no, search_text);

        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);

        if (!is_maker && !is_checker && !is_admin) {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have checker/maker authority.", null));
        }

        const whereClause = {
            is_deleted: false,
            is_rate_plan_approved: false,
            ckr_is_rate_plan_approved: false,
            ckr_rate_plan_is_rejected: false,
            is_rate_plan_rejected: false
        };

        const includeApp = {
            model: CstAppMast,
            as: 'app',
            where: {
                is_deleted: false,
                ...(_search_text && { app_name: { [Op.iLike]: `${_search_text}%` } })
            },
            attributes: ['app_name'],
            required: true
        };

        const total_record = await AppProductRate.count({ where: whereClause, include: [includeApp] });

        const rows = await AppProductRate.findAll({
            where: whereClause,
            include: [
                includeApp,
                { model: AdmUser, as: 'addedByUser', attributes: ['first_name', 'last_name'], required: false }
            ],
            order: [['ap_rate_id', 'DESC']],
            limit: process.env.PAGINATION_SIZE,
            offset
        });

        const list = await Promise.all(rows.map(async (item, index) => ({
            sr_no: offset + index + 1,
            ap_rate_id: item.ap_rate_id,
            app_id: item.app_id,
            app_name: item.app?.app_name || '',
            customer_id: item.customer_id,
            product_id: item.product_id,
            rate_plan_value: item.rate_plan_value,
            added_date: formatDateField(item.added_date),
            ckr_full_name: getUserFullName(item.addedByUser),
            products: await getAppProducts(item.app_id)
        })));

        const results = buildPaginatedResults(_page_no, total_record, list, { is_admin, is_maker, is_checker });
        return res.status(200).json(success(true, res.statusCode, "", results));

    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const app_product_rate_approve_list = async (req, res, next) => {
    const { page_no, search_text } = req.body;
    try {
        const { AppProductRate, CstAppMast, AdmUser } = getModels();
        const { _page_no, _search_text, offset } = parsePaginationParams(page_no, search_text);

        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);

        if (!is_maker && !is_checker && !is_admin) {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have checker/maker authority.", null));
        }

        const whereClause = {
            is_deleted: false,
            [Op.or]: [
                { ckr_is_rate_plan_approved: true },
                { is_rate_plan_approved: true }
            ],
            ckr_rate_plan_is_rejected: false,
            is_rate_plan_rejected: false
        };

        const includeApp = {
            model: CstAppMast,
            as: 'app',
            where: {
                is_deleted: false,
                ...(_search_text && { app_name: { [Op.iLike]: `%${_search_text}%` } })
            },
            attributes: ['app_name'],
            required: true
        };

        const total_record = await AppProductRate.count({ where: whereClause, include: [includeApp] });

        const rows = await AppProductRate.findAll({
            where: whereClause,
            include: [
                includeApp,
                { model: AdmUser, as: 'approvedByUser', attributes: ['first_name', 'last_name'], required: false },
                { model: AdmUser, as: 'addedByUser', attributes: ['first_name', 'last_name'], required: false }
            ],
            order: [['ap_rate_id', 'DESC']],
            limit: process.env.PAGINATION_SIZE,
            offset
        });

        const list = await Promise.all(rows.map(async (app, index) => ({
            sr_no: offset + index + 1,
            ap_rate_id: app.ap_rate_id,
            app_id: app.app_id,
            app_name: app.app?.app_name || '',
            customer_id: app.customer_id,
            product_id: app.product_id,
            rate_plan_value: app.rate_plan_value,
            mkr_name: getUserFullName(app.addedByUser),
            added_date: formatDateField(app.added_date),
            ckr_approved: app.ckr_is_rate_plan_approved,
            ckr_full_name: getUserFullName(app.approvedByUser),
            ckr_approve_date: formatDateField(app.ckr_rate_plan_approved_date),
            ckr_remark: app.ckr_rate_plan_approved_rmk,
            products: await getAppProducts(app.app_id)
        })));

        const results = buildPaginatedResults(_page_no, total_record, list, { is_admin, is_maker, is_checker });
        return res.status(200).json(success(true, res.statusCode, "", results));

    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const app_product_rate_rejected_list = async (req, res, next) => {
    const { page_no, search_text } = req.body;
    try {
        const { AppProductRate, CstAppMast, AdmUser } = getModels();
        const { _page_no, _search_text, offset } = parsePaginationParams(page_no, search_text);

        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);

        if (!is_maker && !is_checker && !is_admin) {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have checker/maker authority.", null));
        }

        const whereClause = {
            is_deleted: false,
            [Op.or]: [
                { ckr_rate_plan_is_rejected: true },
                { is_rate_plan_rejected: true }
            ],
            ckr_is_rate_plan_approved: false,
            is_rate_plan_approved: false
        };

        const includeApp = {
            model: CstAppMast,
            as: 'app',
            where: {
                is_deleted: false,
                ...(_search_text && { app_name: { [Op.iLike]: `${_search_text}%` } })
            },
            attributes: ['app_name'],
            required: true
        };

        const total_record = await AppProductRate.count({ where: whereClause, include: [includeApp] });

        const rows = await AppProductRate.findAll({
            where: whereClause,
            include: [
                includeApp,
                { model: AdmUser, as: 'rejectedByUser', attributes: ['first_name', 'last_name'], required: false },
                { model: AdmUser, as: 'addedByUser', attributes: ['first_name', 'last_name'], required: false }
            ],
            order: [['ap_rate_id', 'DESC']],
            limit: process.env.PAGINATION_SIZE,
            offset
        });

        const list = await Promise.all(rows.map(async (app, index) => ({
            sr_no: offset + index + 1,
            ap_rate_id: app.ap_rate_id,
            app_id: app.app_id,
            app_name: app.app?.app_name || '',
            customer_id: app.customer_id,
            product_id: app.product_id,
            rate_plan_value: app.rate_plan_value,
            ckr_rate_plan_is_rejected: app.ckr_rate_plan_is_rejected,
            ckr_remark: app.ckr_rate_plan_rejected_rmk,
            product_name: '',
            mkr_name: getUserFullName(app.addedByUser),
            added_date: formatDateField(app.added_date),
            rejected_date: formatDateField(app.ckr_rate_plan_rejected_date),
            ckr_full_name: getUserFullName(app.rejectedByUser),
            products: await getAppProducts(app.app_id)
        })));

        const results = buildPaginatedResults(_page_no, total_record, list, { is_admin, is_maker, is_checker });
        return res.status(200).json(success(true, res.statusCode, "", results));

    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

// Helper: Parse numeric ID from input
const parseNumericId = (value) => {
    return value && validator.isNumeric(value.toString()) ? parseInt(value) : 0;
};

// Helper: Validate rate record for rejection
const validateRateRecordForRejection = (rateRecord) => {
    if (!rateRecord) {
        return { valid: false, message: "App Product Rate Attribute details not found." };
    }
    if (rateRecord.ckr_rate_plan_rejected_by || rateRecord.is_rate_plan_rejected) {
        return { valid: false, message: "App Product Rate Attribute is already rejected." };
    }
    if (rateRecord.is_rate_plan_approved) {
        return { valid: false, message: "App Product Rate Attribute is approved, cannot reject." };
    }
    return { valid: true };
};

const app_product_rate_reject = async (req, res, next) => {
    const { ap_rate_id, app_id, remark } = req.body;
    try {
        const { AppProductRate, CstAppMast } = getModels();
        const _ap_rate_id = parseNumericId(ap_rate_id);
        const _app_id = parseNumericId(app_id);

        if (!remark?.length) {
            return res.status(200).json(success(false, res.statusCode, "Please enter remark.", null));
        }

        const [is_admin, is_checker] = await commonModule.getUserRoles(req);

        if (!is_admin && !is_checker) {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have checker/maker authority.", null));
        }

        const rateRecord = await AppProductRate.findOne({
            where: { ap_rate_id: _ap_rate_id, app_id: _app_id, is_deleted: false },
            attributes: ['ap_rate_id', 'app_id', 'customer_id', 'product_id', 'rate_plan_value', 'is_rate_plan_rejected', 'ckr_rate_plan_rejected_by', 'is_rate_plan_approved', 'ckr_is_rate_plan_approved'],
            include: [{
                model: CstAppMast,
                as: 'app',
                where: { is_deleted: false },
                attributes: ['app_name'],
                required: true
            }]
        });

        const validation = validateRateRecordForRejection(rateRecord);
        if (!validation.valid) {
            return res.status(200).json(success(false, res.statusCode, validation.message, null));
        }

        const [i] = await AppProductRate.update({
            ckr_rate_plan_is_rejected: true,
            ckr_rate_plan_rejected_by: req.token_data.account_id,
            ckr_rate_plan_rejected_date: db.get_ist_current_date(),
            ckr_rate_plan_rejected_rmk: remark
        }, { where: { ap_rate_id: _ap_rate_id, app_id: _app_id } });

        if (i <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Unable to reject, Please try again.", null));
        }

        const roleLabel = is_admin ? 'admin' : 'checker';
        logRateAction(req, `App Product Attribute Rate rejected by ${roleLabel}. App Name = ${rateRecord.app?.app_name}, Product Rate Value = ${rateRecord.rate_plan_value}`, 'ORM update AppProductRate');
        return res.status(200).json(success(true, res.statusCode, "App Product Rate Value rejected successfully.", null));

    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

// Helper: Validate rate record for approval
const validateRateRecordForApproval = (rateRecord) => {
    if (!rateRecord) {
        return { valid: false, message: "App Product Rate Attribute details not found." };
    }
    if (rateRecord.is_rate_plan_approved || rateRecord.ckr_is_rate_plan_approved) {
        return { valid: false, message: "App Product Rate Attribute is already approved." };
    }
    if (rateRecord.is_rate_plan_rejected || rateRecord.ckr_rate_plan_is_rejected) {
        return { valid: false, message: "App Product Rate Attribute is rejected, cannot approve." };
    }
    return { valid: true };
};

// Helper: Handle Apigee error response
const handleApigeeErrorResponse = (res, responseData) => {
    if (responseData?.error?.message) {
        const message = `Apigee response: ${responseData.error.message}`;
        const statusCode = responseData.error.status === 'ABORTED' && responseData.error.code === 409 ? 200 : 400;
        return res.status(statusCode).json(success(false, statusCode, message, null));
    }
    return res.status(200).json(success(false, res.statusCode, "Unable to Add Rate, Please try again.", null));
};

// Helper: Process approval success - update DB records
const processApprovalSuccess = async (req, remark, _app_id, _ap_rate_id, product_rate_value, rate_plan_response, product_name) => {
    const { AppProductRate, CstAppMast } = getModels();

    const [i] = await CstAppMast.update({
        app_wallet_rate_added_by: req.token_data.account_id,
        app_wallet_rate_added_date: db.get_ist_current_date(),
        app_wallet_rate_data: JSON.stringify(product_rate_value),
        app_wallet_rate_kvm_json_data: rate_plan_response
    }, { where: { app_id: _app_id } });

    if (i <= 0) {
        return { success: false, message: "Unable to Add Product Attribute Rate, Please try again." };
    }

    await AppProductRate.update({
        is_rate_plan_approved: true,
        ckr_is_rate_plan_approved: true,
        rate_plan_json_data: rate_plan_response,
        ckr_rate_plan_approved_by: req.token_data.account_id,
        ckr_rate_plan_approved_date: db.get_ist_current_date(),
        ckr_rate_plan_approved_rmk: remark
    }, { where: { ap_rate_id: _ap_rate_id, app_id: _app_id } });

    logRateAction(req, `Product Attribute Rate added  Product name = ${product_name}, Product Attribute Value = ${product_rate_value}`, 'ORM update AppProductRate');
    return { success: true, message: "Product Attribute Rate Added successfully." };
};

const app_product_rate_approve = async (req, res, next) => {
    const { ap_rate_id, app_id, remark } = req.body;
    try {
        const { AppProductRate, CstAppMast, CstCustomer } = getModels();
        const _ap_rate_id = parseNumericId(ap_rate_id);
        const _app_id = parseNumericId(app_id);

        if (!remark?.length) {
            return res.status(200).json(success(false, res.statusCode, "Please enter remark.", null));
        }

        const appDetails = await CstAppMast.findOne({
            where: { app_id: _app_id, is_deleted: false },
            attributes: ['customer_id', 'app_name', 'description', 'app_id', 'in_live_env', 'is_approved', 'is_rejected', 'mkr_is_approved', 'mkr_is_rejected'],
            include: [{
                model: CstCustomer,
                as: 'customer',
                where: { is_deleted: false },
                attributes: ['email_id', 'developer_id'],
                required: true
            }]
        });

        if (!appDetails) {
            return res.status(200).json(success(false, res.statusCode, "App details not found.", null));
        }

        const { email_id } = appDetails.customer;
        const { app_name } = appDetails;

        const [is_admin, is_checker] = await commonModule.getUserRoles(req);

        if (!is_admin && !is_checker) {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have checker/maker authority.", null));
        }

        const rateRecord = await AppProductRate.findOne({
            where: { ap_rate_id: _ap_rate_id, app_id: _app_id, is_deleted: false },
            attributes: ['ap_rate_id', 'app_id', 'customer_id', 'product_id', 'rate_plan_value', 'is_rate_plan_rejected', 'ckr_rate_plan_is_rejected', 'ckr_rate_plan_rejected_by', 'is_rate_plan_approved', 'ckr_is_rate_plan_approved'],
            include: [{
                model: CstAppMast,
                as: 'app',
                where: { is_deleted: false },
                attributes: ['app_name'],
                required: true
            }]
        });

        const validation = validateRateRecordForApproval(rateRecord);
        if (!validation.valid) {
            return res.status(200).json(success(false, res.statusCode, validation.message, null));
        }

        const product_rate_value = transformData(JSON.parse(rateRecord.rate_plan_value));
        const product_name = rateRecord.product_name;

        const { response, responseData } = await updateApigeeAppAttributes(email_id, app_name, product_rate_value);

        if (!response.ok || !responseData) {
            return handleApigeeErrorResponse(res, responseData);
        }

        const rate_plan_response = JSON.stringify(responseData);
        const result = await processApprovalSuccess(req, remark, _app_id, _ap_rate_id, product_rate_value, rate_plan_response, product_name);
        return res.status(200).json(success(result.success, res.statusCode, result.message, null));

    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const transformData = (data) => {
    if (!Array.isArray(data)) {
        console.error("Provided data is not an array:", data);
        return [];
    }

    return data.map((item) => {
        return {
            name: item.name,
            value: item.value,
        };
    });
};

export default {
    app_product_rate_add,
    app_product_rate_pending_list,
    app_product_rate_approve_list,
    app_product_rate_rejected_list,
    app_product_rate_reject,
    app_product_rate_approve
};
