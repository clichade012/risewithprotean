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

const app_req_pending = async (req, res, next) => {
    const { page_no, search_text, in_live } = req.body;
    try {
        const { CstAppMast, CstCustomer, AdmUser, Product, CstAppProduct } = getModels();
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0; if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";
        const _in_live = !!in_live;
        const offset = (_page_no - 1) * process.env.PAGINATION_SIZE;
        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);

        // Helper function to get products for an app
        const getAppProducts = async (app_id) => {
            const appProducts = await CstAppProduct.findAll({
                where: { app_id },
                include: [{ model: Product, as: 'product', attributes: ['product_name'], required: true }]
            });
            return appProducts.map(ap => ap.product.product_name).join(', ');
        };

        // Helper function to build list from rows
        const buildList = async (rows, startSrNo) => {
            let list = [];
            let sr_no = startSrNo;
            for (const app of rows) {
                sr_no++;
                const products = await getAppProducts(app.app_id);
                const full_name = `${app.customer?.first_name || ''} ${app.customer?.last_name || ''}`.trim();
                const mkr_name = app.mkrApprovedByUser ? `${app.mkrApprovedByUser.first_name || ''} ${app.mkrApprovedByUser.last_name || ''}`.trim() : '';
                list.push({
                    sr_no,
                    app_id: app.app_id,
                    full_name,
                    email_id: app.customer?.email_id || '',
                    mobile_no: app.customer?.mobile_no || '',
                    app_name: app.app_name,
                    products,
                    expected_volume: app.expected_volume,
                    register_date: app.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(app.added_date)) : "",
                    mkr_approved: app.mkr_is_approved,
                    mkr_full_name: mkr_name,
                    mkr_approve_date: app.mkr_approved_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(app.mkr_approved_date)) : "",
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
        let _in_live = false; if (in_live && in_live == true) { _in_live = true; } else { _in_live = false; }
        const offset = (_page_no - 1) * process.env.PAGINATION_SIZE;

        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);
        console.log(is_admin, is_checker, is_maker);

        // Helper function to get products for an app
        const getAppProducts = async (app_id) => {
            const appProducts = await CstAppProduct.findAll({
                where: { app_id },
                include: [{ model: Product, as: 'product', attributes: ['product_name'], required: true }]
            });
            return appProducts.map(ap => ap.product.product_name).join(', ');
        };

        // Helper function to build list from rows
        const buildList = async (rows, startSrNo) => {
            let list = [];
            let sr_no = startSrNo;
            for (const app of rows) {
                sr_no++;
                const products = await getAppProducts(app.app_id);
                const full_name = `${app.customer?.first_name || ''} ${app.customer?.last_name || ''}`.trim();
                const mkr_name = app.mkrApprovedByUser ? `${app.mkrApprovedByUser.first_name || ''} ${app.mkrApprovedByUser.last_name || ''}`.trim() : '';
                const chkr_name = app.approvedByUser ? `${app.approvedByUser.first_name || ''} ${app.approvedByUser.last_name || ''}`.trim() : '';
                list.push({
                    sr_no,
                    app_id: app.app_id,
                    full_name,
                    email_id: app.customer?.email_id || '',
                    mobile_no: app.customer?.mobile_no || '',
                    app_name: app.app_name,
                    products,
                    apigee_status: app.apigee_status,
                    is_monetization_enabled: app.is_monetization_enabled,
                    is_monetization_rate_appliacable: app.is_monetization_rate_appliacable,
                    mkr_approved: app.mkr_is_approved,
                    mkr_name,
                    mkr_remark: app.mkr_approved_rmk,
                    mkr_date: app.mkr_approved_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(app.mkr_approved_date)) : "",
                    chkr_approved: app.is_approved,
                    chkr_name,
                    chkr_remark: app.approve_remark,
                    chkr_date: app.approve_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(app.approve_date)) : "",
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
        let _in_live = false; if (in_live && in_live == true) { _in_live = true; } else { _in_live = false; }
        const offset = (_page_no - 1) * process.env.PAGINATION_SIZE;

        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);

        // Helper function to get products for an app
        const getAppProducts = async (app_id) => {
            const appProducts = await CstAppProduct.findAll({
                where: { app_id },
                include: [{ model: Product, as: 'product', attributes: ['product_name'], required: true }]
            });
            return appProducts.map(ap => ap.product.product_name).join(', ');
        };

        // Helper function to build list from rows
        const buildList = async (rows, startSrNo) => {
            let list = [];
            let sr_no = startSrNo;
            for (const app of rows) {
                sr_no++;
                const products = await getAppProducts(app.app_id);
                const full_name = `${app.customer?.first_name || ''} ${app.customer?.last_name || ''}`.trim();
                const mkr_name = app.mkrRejectedByUser ? `${app.mkrRejectedByUser.first_name || ''} ${app.mkrRejectedByUser.last_name || ''}`.trim() : '';
                const chkr_name = app.rejectedByUser ? `${app.rejectedByUser.first_name || ''} ${app.rejectedByUser.last_name || ''}`.trim() : '';
                list.push({
                    sr_no,
                    app_id: app.app_id,
                    full_name,
                    email_id: app.customer?.email_id || '',
                    mobile_no: app.customer?.mobile_no || '',
                    app_name: app.app_name,
                    products,
                    mkr_rejected: app.mkr_is_rejected,
                    mkr_date: app.mkr_rejected_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(app.mkr_rejected_date)) : "",
                    mkr_remark: app.mkr_rejected_rmk,
                    mkr_name,
                    chkr_rejected: app.is_rejected,
                    chkr_date: app.rejected_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(app.rejected_date)) : "",
                    chkr_remark: app.reject_remark,
                    chkr_name,
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

const app_req_view_detail = async (req, res, next) => {
    const { app_id } = req.body;
    try {
        const { CstAppMast, CstCustomer, CstAppProduct, Product, AdmUser } = getModels();
        let _app_id = app_id && validator.isNumeric(app_id.toString()) ? parseInt(app_id) : 0;

        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);

        if (is_admin || is_checker || is_maker) {
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

            // Get products
            const appProducts = await CstAppProduct.findAll({
                where: { app_id: _app_id },
                include: [{ model: Product, as: 'product', attributes: ['product_name'], required: true }]
            });
            const products = appProducts.map(ap => ap.product.product_name).join(', ');

            let _certificate_file = appData.certificate_file && appData.certificate_file.length > 0 ? db.get_uploads_url(req) + appData.certificate_file : '';

            const mkr_approve_by = appData.mkrApprovedByUser ? `${appData.mkrApprovedByUser.first_name || ''} ${appData.mkrApprovedByUser.last_name || ''}`.trim() : '';
            const mkr_reject_by = appData.mkrRejectedByUser ? `${appData.mkrRejectedByUser.first_name || ''} ${appData.mkrRejectedByUser.last_name || ''}`.trim() : '';
            const chkr_approve_by = appData.approvedByUser ? `${appData.approvedByUser.first_name || ''} ${appData.approvedByUser.last_name || ''}`.trim() : '';
            const chkr_reject_by = appData.rejectedByUser ? `${appData.rejectedByUser.first_name || ''} ${appData.rejectedByUser.last_name || ''}`.trim() : '';

            const results = {
                app_id: appData.app_id,
                first_name: appData.customer?.first_name || '',
                last_name: appData.customer?.last_name || '',
                email_id: appData.customer?.email_id || '',
                mobile_no: appData.customer?.mobile_no || '',
                app_name: appData.app_name,
                description: appData.description,
                expected_volume: appData.expected_volume,
                callback_url: appData.callback_url,
                ip_addresses: appData.ip_addresses,
                certificate_file: _certificate_file,
                products: products,
                in_live_env: appData.in_live_env,
                added_date: appData.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(appData.added_date)) : "",
                apigee_status: appData.apigee_status,

                is_approved: appData.is_approved,
                approve_date: appData.approve_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(appData.approve_date)) : "",
                approve_remark: appData.approve_remark,
                chkr_approve_by: chkr_approve_by,

                is_rejected: appData.is_rejected,
                rejected_date: appData.rejected_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(appData.rejected_date)) : "",
                reject_remark: appData.reject_remark,
                chkr_reject_by: chkr_reject_by,

                api_key: appData.api_key,
                api_secret: appData.api_secret,
                key_issued_date: appData.key_issued_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(appData.key_issued_date)) : "",
                key_expiry_date: appData.key_expiry_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(appData.key_expiry_date)) : "",

                mkr_is_approved: appData.mkr_is_approved,
                mkr_approved_date: appData.mkr_approved_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(appData.mkr_approved_date)) : "",
                mkr_approved_rmk: appData.mkr_approved_rmk,
                mkr_approve_by: mkr_approve_by,

                mkr_is_rejected: appData.mkr_is_rejected,
                mkr_rejected_date: appData.mkr_rejected_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(appData.mkr_rejected_date)) : "",
                mkr_rejected_rmk: appData.mkr_rejected_rmk,
                mkr_reject_by: mkr_reject_by,

                is_admin: is_admin,
                is_maker: is_maker,
                is_checker: is_checker,
            };
            return res.status(200).json(success(true, res.statusCode, "App Details Data.", results));
        } else {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have checker/maker authority.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const app_req_approve = async (req, res, next) => {
    const { app_id, remark } = req.body;
    try {
        const { CstAppMast, CstCustomer, CstAppProduct, Product } = getModels();
        let _app_id = app_id && validator.isNumeric(app_id.toString()) ? parseInt(app_id) : 0;
        if (!remark || remark.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter remark.", null));
        }
        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);

        if (is_admin || is_checker || is_maker) {
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
            const row1 = [{
                customer_id: appData.customer_id,
                app_name: appData.app_name,
                description: appData.description,
                expected_volume: appData.expected_volume,
                callback_url: appData.callback_url,
                ip_addresses: appData.ip_addresses,
                cert_public_key: appData.cert_public_key,
                app_id: appData.app_id,
                in_live_env: appData.in_live_env,
                is_approved: appData.is_approved,
                is_rejected: appData.is_rejected,
                mkr_is_approved: appData.mkr_is_approved,
                mkr_is_rejected: appData.mkr_is_rejected,
                email_id: appData.customer?.email_id,
                developer_id: appData.customer?.developer_id
            }];

            if (row1[0]?.is_approved) {
                return res.status(200).json(success(false, res.statusCode, "App is already approved.", null));
            }
            if (is_maker && row1[0]?.mkr_is_approved) {
                return res.status(200).json(success(false, res.statusCode, "App is already approved.", null));
            }

            if (row1[0]?.is_rejected) {
                return res.status(200).json(success(false, res.statusCode, "App is rejected, can not approve.", null));
            }
            if (row1[0]?.mkr_is_rejected) {
                return res.status(200).json(success(false, res.statusCode, "App is rejected, can not approve.", null));
            }
            const in_live_env = !!row1[0].in_live_env;

            if (is_maker) {
                const [affectedRows] = await CstAppMast.update(
                    {
                        mkr_is_approved: true,
                        mkr_approved_by: req.token_data.account_id,
                        mkr_approved_date: db.get_ist_current_date(),
                        mkr_approved_rmk: remark
                    },
                    { where: { app_id: _app_id } }
                );

                if (affectedRows > 0) {
                    try {
                        let data_to_log = {
                            correlation_id: correlator.getId(),
                            token_id: req.token_data.token_id,
                            account_id: req.token_data.account_id,
                            user_type: 1,
                            user_id: req.token_data.admin_id,
                            narration: (in_live_env ? 'Live' : 'Sandbox') + ' app approved by maker. Customer email = ' + row1[0].email_id + ', App name = ' + row1[0].app_name,
                            query: `CstAppMast.update({ mkr_is_approved: true }, { where: { app_id: ${_app_id} }})`,
                        }
                        action_logger.info(JSON.stringify(data_to_log));
                    } catch (_) { }

                    return res.status(200).json(success(true, res.statusCode, "App approved successfully.", null));
                } else {
                    return res.status(200).json(success(false, res.statusCode, "Unable to approve, Please try again.", null));
                }
            } else {
                const appProducts = await CstAppProduct.findAll({
                    where: { app_id: _app_id },
                    include: [{ model: Product, as: 'product', attributes: ['product_id', 'product_name'], required: true }]
                });
                const row5 = appProducts.map(ap => ({ product_id: ap.product.product_id, product_name: ap.product.product_name }));
                const products = row5?.map(item => item.product_name) || [];
                const developer_id = row1[0].developer_id;
                const email_id = row1[0].email_id;
                const callback_url = row1[0].callback_url && row1[0].callback_url.length > 0 ? row1[0].callback_url : "";
                const cert_public_key = row1[0].cert_public_key && row1[0].cert_public_key.length > 0 ? row1[0].cert_public_key : "";
                let ip_addresses = row1[0].ip_addresses && row1[0].ip_addresses.length > 0 ? row1[0].ip_addresses : "";
                // ip_addresses = ''; // IP VALIDATION IS CURRENTLY REMOVED

                if (developer_id && developer_id.length > 0 && email_id.length > 0) {
                    const data = { developerId: developer_id, name: row1[0].app_name, callbackUrl: callback_url, status: "approved", apiProducts: products, };
                    const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers/${email_id}/apps`;
                    const apigeeAuth = await db.get_apigee_token();
                    const response = await fetch(product_URL, {
                        method: "POST",
                        headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json", },
                        body: JSON.stringify(data),
                    });
                    const responseData = await response.json();
                    if (responseData && responseData.appId) {
                        try {
                            for (const element of products) {
                                const data = { apiproduct: element };
                                console.log("======data======", data);
                                const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers/${email_id}/subscriptions`;
                                const apigeeAuth = await db.get_apigee_token();
                                const response = await fetch(product_URL, {
                                    method: "POST",
                                    headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json", },
                                    body: JSON.stringify(data),
                                });
                                console.log("========response=========", response);
                            }
                        } catch (error) {
                            console.log("========error=========", error);
                        }
                        const api_key = responseData.credentials[0].consumerKey;
                        const api_secret = responseData.credentials[0].consumerSecret;
                        const apigee_app_id = responseData.appId;
                        const approval_response = JSON.stringify(responseData);

                        const [affectedRows2] = await CstAppMast.update(
                            {
                                apigee_app_id: apigee_app_id,
                                is_approved: true,
                                approved_by: req.token_data.account_id,
                                approve_date: db.get_ist_current_date(),
                                approve_remark: remark,
                                api_key: api_key,
                                api_secret: api_secret,
                                key_issued_date: db.get_ist_current_date(),
                                json_data: approval_response,
                                apigee_status: 'approve'
                            },
                            { where: { app_id: _app_id } }
                        );
                        if (affectedRows2 > 0) {
                            try {
                                let kvm_input = {};
                                // if (in_live_env) {
                                kvm_input = {
                                    authenticationType: (ip_addresses && ip_addresses.length > 1 ? "apikey_ip" : "apikey"),
                                    enableEncryption: (cert_public_key && cert_public_key.length > 0 ? true : false),
                                    publicKey: (cert_public_key && cert_public_key.length > 0 ? cert_public_key : ""),
                                    validIpList: (ip_addresses && ip_addresses.length > 1 ? ip_addresses : ""),
                                    mode: "",
                                    isInternal: "false"
                                };
                                // } else {
                                //     kvm_input = {
                                //         authenticationType: "apikey",
                                //         enableEncryption: false,
                                //         publicKey: "",
                                //         validIpList: "",
                                //         mode: "",
                                //         isInternal: "false"
                                //     };
                                // }
                                let kvm_2 = { "name": apigee_app_id, "value": JSON.stringify(kvm_input), };

                                let kvm_environment = ''; if (in_live_env) { kvm_environment = 'prod-01'; } else { kvm_environment = 'uat-01'; }
                                const kvm_url = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/environments/${kvm_environment}/keyvaluemaps/MERCHANT-CONFIG/entries`
                                const kvm_response = await fetch(kvm_url, {
                                    method: "POST",
                                    headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json", },
                                    body: JSON.stringify(kvm_2),
                                });
                                const kvm_responseData = await kvm_response.json();

                                await CstAppMast.update(
                                    { kvm_json_data: JSON.stringify(kvm_responseData) },
                                    { where: { app_id: _app_id } }
                                );


                            } catch (_) {
                                console.log("-------------");
                            }

                            try {
                                let data_to_log = {
                                    correlation_id: correlator.getId(),
                                    token_id: req.token_data.token_id,
                                    account_id: req.token_data.account_id,
                                    user_type: 1,
                                    user_id: req.token_data.admin_id,
                                    narration: (in_live_env ? 'Live' : 'Sandbox') + ' app approved by ' + (is_admin ? 'admin' : 'checker') + '. Customer email = ' + row[0].email_id + ', App name = ' + row1[0].app_name,
                                    query: db.buildQuery_Array(_query2, _replacements2),
                                }
                                action_logger.info(JSON.stringify(data_to_log));
                            } catch (_) { console.log("---catch----------"); }

                            try {
                                console.log("----------customer_app_data----------");
                                const _ad_query = `INSERT INTO customer_app_data(app_id, customer_id, apigee_app_id, app_name, apigee_status, json_data) VALUES (?, ?, ?, ?, ?, ?)`;
                                const _replacementsad = [_app_id, row1[0].customer_id, apigee_app_id, row1[0].app_name, 'approve', approval_response]
                                const [, ad] = await db.sequelize2.query(_ad_query, { replacements: _replacementsad, type: QueryTypes.INSERT });
                                if (ad > 0) {
                                    console.log("----------add----------");
                                    const _queryad = `SELECT cam.app_id, p.product_name, pr.proxy_id,pr.proxy_name, e.endpoint_id, e.endpoint_url,cm.in_live_env as is_prod,CASE WHEN cm.in_live_env = true THEN 'https://prod.risewithprotean.io/'
                                    ELSE 'https://uat.risewithprotean.io/' END as url from  cst_app_product cam 
                                    INNER JOIN product p ON cam.product_id= p.product_id INNER JOIN proxies pr ON cam.product_id= pr.product_id 
                                    INNER JOIN endpoint e on pr.proxy_id= e.proxy_id LEFT JOIN cst_app_mast cm on cam.app_id=cm.app_id WHERE cam.app_id = ? `;
                                    const ad1 = await db.sequelize.query(_queryad, { replacements: [_app_id], type: QueryTypes.SELECT });
                                    if (ad1) {
                                        for (const item of ad1) {
                                            console.log("----------for ad1----------");
                                            const _ad2_query = `INSERT INTO productdata(product_name, proxy_name, endpoint_id, endpoint_url, is_prod, url, app_id, proxy_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
                                            const _replacementsad2 = [item.product_name, item.proxy_name, item.endpoint_id, item.endpoint_url, item.is_prod, item.url, item.app_id, item.proxy_id]
                                            await db.sequelize2.query(_ad2_query, { replacements: _replacementsad2, type: QueryTypes.INSERT });
                                        }
                                    }
                                }
                            } catch (__err) {
                                _logger.error(__err.stack);
                            }

                            return res.status(200).json(success(true, res.statusCode, "App approved successfully.", null));
                        } else {
                            return res.status(200).json(success(false, res.statusCode, "Unable to approve, Please try again.", null));
                        }
                    }
                    else if ((responseData?.error?.status === 'ABORTED' && responseData?.error?.code === 409) || responseData?.error?.message?.length > 0) {
                        return res.status(200).json(success(false, res.statusCode, `Apigee response : ${responseData?.error?.message ?? 'Unknown error'}`, null));
                    }

                    return res.status(200).json(success(false, res.statusCode, "Unable to approve, Please try again.", null));

                } else {
                    return res.status(200).json(success(false, res.statusCode, "Apigee response : Developer id not found", null));
                }
            }
        } else {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have checker/maker authority.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const app_req_reject = async (req, res, next) => {
    const { app_id, remark } = req.body;
    try {
        const { CstAppMast, CstCustomer } = getModels();
        let _app_id = app_id && validator.isNumeric(app_id.toString()) ? parseInt(app_id) : 0;
        if (!remark || remark.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter remark.", null));
        }

        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);

        if (is_admin || is_checker || is_maker) {
            const appData = await CstAppMast.findOne({
                where: { app_id: _app_id, is_deleted: false },
                include: [{ model: CstCustomer, as: 'customer', attributes: ['email_id'] }],
                attributes: ['app_id', 'app_name', 'in_live_env', 'is_approved', 'is_rejected', 'mkr_is_approved', 'mkr_is_rejected']
            });

            if (!appData) {
                return res.status(200).json(success(false, res.statusCode, "App details not found.", null));
            }

            const row1 = [{
                app_id: appData.app_id,
                app_name: appData.app_name,
                in_live_env: appData.in_live_env,
                email_id: appData.customer?.email_id,
                is_approved: appData.is_approved,
                is_rejected: appData.is_rejected,
                mkr_is_approved: appData.mkr_is_approved,
                mkr_is_rejected: appData.mkr_is_rejected
            }];

            if ((row1[0].mkr_is_rejected && row1[0].mkr_is_rejected == true) ||
                (row1[0].is_rejected && row1[0].is_rejected == true)) {
                return res.status(200).json(success(false, res.statusCode, "App is already rejected.", null));
            }
            if (row1[0].is_approved && row1[0].is_approved == true) {
                return res.status(200).json(success(false, res.statusCode, "App is approved, can not reject", null));
            }
            if (is_maker) {
                if (row1[0].mkr_is_approved && row1[0].mkr_is_approved == true) {
                    return res.status(200).json(success(false, res.statusCode, "App is approved, can not reject", null));
                }
            }
            const in_live_env = !!row1[0].in_live_env;
            if (is_maker) {
                const [affectedRows] = await CstAppMast.update(
                    {
                        mkr_is_rejected: true,
                        mkr_rejected_by: req.token_data.account_id,
                        mkr_rejected_date: db.get_ist_current_date(),
                        mkr_rejected_rmk: remark
                    },
                    { where: { app_id: _app_id } }
                );

                if (affectedRows > 0) {
                    try {
                        let data_to_log = {
                            correlation_id: correlator.getId(),
                            token_id: req.token_data.token_id,
                            account_id: req.token_data.account_id,
                            user_type: 1,
                            user_id: req.token_data.admin_id,
                            narration: (in_live_env ? 'Live' : 'Sandbox') + ' app rejected by maker. Customer email = ' + row1[0].email_id + ', App name = ' + row1[0].app_name,
                            query: `CstAppMast.update({ mkr_is_rejected: true }, { where: { app_id: ${_app_id} }})`,
                        }
                        action_logger.info(JSON.stringify(data_to_log));
                    } catch (_) {
                    }
                    return res.status(200).json(success(true, res.statusCode, "App rejected successfully.", null));
                } else {
                    return res.status(200).json(success(false, res.statusCode, "Unable to reject, Please try again.", null));
                }
            } else {
                const [affectedRows] = await CstAppMast.update(
                    {
                        is_rejected: true,
                        rejected_by: req.token_data.account_id,
                        rejected_date: db.get_ist_current_date(),
                        reject_remark: remark
                    },
                    { where: { app_id: _app_id } }
                );

                if (affectedRows > 0) {
                    try {
                        let data_to_log = {
                            correlation_id: correlator.getId(),
                            token_id: req.token_data.token_id,
                            account_id: req.token_data.account_id,
                            user_type: 1,
                            user_id: req.token_data.admin_id,
                            narration: (in_live_env ? 'Live' : 'Sandbox') + ' app rejected by ' + (is_admin ? 'admin' : 'checker') + '. Customer email = ' + row1[0].email_id + ', App name = ' + row1[0].app_name,
                            query: `CstAppMast.update({ is_rejected: true }, { where: { app_id: ${_app_id} }})`,
                        }
                        action_logger.info(JSON.stringify(data_to_log));
                    } catch (_) {
                    }
                    return res.status(200).json(success(true, res.statusCode, "App rejected successfully.", null));
                } else {
                    return res.status(200).json(success(false, res.statusCode, "Unable to reject, Please try again.", null));
                }
            }
        } else {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have checker/maker authority.", null));
        }
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

        // Helper function to get products for an app
        const getAppProducts = async (app_id) => {
            const appProducts = await CstAppProduct.findAll({
                where: { app_id },
                include: [{ model: Product, as: 'product', attributes: ['product_name'], required: true }]
            });
            return appProducts.map(ap => ap.product.product_name).join(', ');
        };

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

        let list = [];
        let sr_no = offset;
        for (const app of rows) {
            sr_no++;
            const products = await getAppProducts(app.app_id);
            const full_name = `${app.customer?.first_name || ''} ${app.customer?.last_name || ''}`.trim();
            list.push({
                sr_no,
                app_id: app.app_id,
                full_name,
                email_id: app.customer?.email_id || '',
                mobile_no: app.customer?.mobile_no || '',
                app_name: app.app_name,
                products,
                live_remark: app.live_remark,
                live_date: app.live_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(app.live_date)) : "",
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

const app_req_status_change = async (req, res, next) => {
    const { app_id, status_remark } = req.body;
    try {
        const { CstAppMast, CstCustomer, CstAppStatus } = getModels();
        let _app_id = app_id && validator.isNumeric(app_id.toString()) ? parseInt(app_id) : 0;
        if (!status_remark || status_remark.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter remark.", null));
        }

        const appData = await CstAppMast.findOne({
            where: { app_id: _app_id, is_deleted: false },
            attributes: ['customer_id', 'app_id', 'apigee_app_id', 'app_name', 'apigee_status', 'in_live_env'],
            raw: true
        });

        if (!appData) {
            return res.status(200).json(success(false, res.statusCode, "App details not found.", null));
        }

        if (appData.app_name && appData.app_name.length > 0) {
            const customerData = await CstCustomer.findOne({
                where: { customer_id: appData.customer_id, is_deleted: false },
                attributes: ['developer_id', 'email_id'],
                raw: true
            });

            if (customerData) {
                const email_id = customerData.email_id;
                const app_name = appData.app_name;
                const in_live_env = !!appData.in_live_env;
                const apigee_status = appData.apigee_status && appData.apigee_status == 'approve' ? 'revoke' : 'approve';
                console.log("=======apigee_status==========", apigee_status);
                const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers/${email_id}/apps/${app_name}?action=${apigee_status}`;
                const apigeeAuth = await db.get_apigee_token();
                const response = await fetch(product_URL, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/octet-stream", },
                });
                console.log("=======response==========", response);

                if (response.status != 204) {
                    return res.status(200).json(success(false, res.statusCode, "Apigee response : " + response.statusText, null));
                }
                if (response.status == 204) {
                    const [affectedRows] = await CstAppMast.update(
                        {
                            apigee_status: apigee_status,
                            modify_date: db.get_ist_current_date(),
                            modify_by: req.token_data.account_id
                        },
                        { where: { app_id: _app_id } }
                    );

                    if (affectedRows > 0) {
                        const newStatus = await CstAppStatus.create({
                            app_id: _app_id,
                            app_status: apigee_status,
                            remark: status_remark,
                            updated_by: req.token_data.account_id,
                            update_date: db.get_ist_current_date()
                        });

                        if (newStatus && newStatus.id) {
                            try {
                                let data_to_log = {
                                    correlation_id: correlator.getId(),
                                    token_id: req.token_data.token_id,
                                    account_id: req.token_data.account_id,
                                    user_type: 1,
                                    user_id: req.token_data.admin_id,
                                    narration: (in_live_env ? 'Live' : 'Sandbox') + ' app ' + (apigee_status == 'approve' ? 'enabled' : 'disabled') + '. Customer email = ' + customerData.email_id + ', App name = ' + appData.app_name,
                                    query: `CstAppStatus.create({ app_id: ${_app_id}, app_status: '${apigee_status}' })`,
                                }
                                action_logger.info(JSON.stringify(data_to_log));
                            } catch (_) { }
                        }
                        try {
                            let data_to_log = {
                                correlation_id: correlator.getId(),
                                token_id: req.token_data.token_id,
                                account_id: req.token_data.account_id,
                                user_type: 1,
                                user_id: req.token_data.admin_id,
                                narration: (in_live_env ? 'Live' : 'Sandbox') + ' app ' + (apigee_status == 'approve' ? 'enabled' : 'disabled') + '. Customer email = ' + customerData.email_id + ', App name = ' + appData.app_name,
                                query: `CstAppMast.update({ apigee_status: '${apigee_status}' }, { where: { app_id: ${_app_id} }})`,
                            }
                            action_logger.info(JSON.stringify(data_to_log));
                        } catch (_) { }

                        return res.status(200).json(success(true, res.statusCode, "Status changed successfully.", null));
                    } else {
                        return res.status(200).json(success(false, res.statusCode, "Unable to change status, Please try again.", null));
                    }
                }
                else {
                    return res.status(200).json(success(false, res.statusCode, "Unable to change status, Please try again.", null));
                }
            }
            else {
                return res.status(200).json(success(false, res.statusCode, "Unable to change status, Please try again.", null));
            }
        }
        else {
            return res.status(200).json(success(false, res.statusCode, "Unable to change status, Please try again.", null));
        }
    }
    catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const app_routing_logic_kvm_update = async (req, res, next) => {
    const { app_id, app_routing_logic } = req.body;
    try {
        const { CstAppMast, CstCustomer } = getModels();
        let _app_id = app_id && validator.isNumeric(app_id.toString()) ? parseInt(app_id) : 0;
        if (!app_routing_logic) {
            return res.status(200).json(success(false, res.statusCode, "Please enter ratio.", null));
        }
        for (const [product_id, tabs] of Object.entries(app_routing_logic)) {
            for (const tab of tabs) {
                const selectedService = tab.selectedService;
                const tabType = tab.name.split(/(\d+)/)[0];

                if (tab.isSelectedTab && tab.isSelectedTab === true) {
                    if (tabType === 'Split') {
                        let Ratio_Signzy = '';
                        let Ratio_Karza = '';

                        tab.services.forEach(service => {
                            if (service.name.toLowerCase() === 'signzy') {
                                Ratio_Signzy = service.value;
                            }
                            if (service.name.toLowerCase() === 'karza') {
                                Ratio_Karza = service.value;
                            }
                        });

                        if (!Ratio_Signzy) {
                            return res.status(200).json(success(false, res.statusCode, `Please insert value for Signzy in product tab: ${product_id}`, null));
                        }

                        if (!Ratio_Karza) {
                            return res.status(200).json(success(false, res.statusCode, `Please insert value for Karza in product tab: ${product_id}`, null));
                        }

                    } else if (!selectedService) {
                        return res.status(200).json(success(false, res.statusCode, `Please select a service in product: ${product_id}`, null));
                    }
                }
            }
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

        const row1 = [{
            customer_id: appData.customer_id,
            app_name: appData.app_name,
            description: appData.description,
            in_live_env: appData.in_live_env,
            app_id: appData.app_id,
            apigee_app_id: appData.apigee_app_id,
            email_id: appData.customer?.email_id,
            developer_id: appData.customer?.developer_id,
            app_kvm_json_data: appData.app_kvm_json_data
        }];

        const in_live_env = !!row1[0].in_live_env;

        const [affectedRows] = await CstAppMast.update(
            {
                app_routing_logic_added_by: req.token_data.account_id,
                app_routing_logic_added_date: db.get_ist_current_date(),
                app_routing_logic: JSON.stringify(app_routing_logic)
            },
            { where: { app_id: _app_id } }
        );

        const i = affectedRows;
        if (i > 0) {
            try {
                for (const [product_id, tabs] of Object.entries(app_routing_logic)) {
                    let kvm_name = ''; let kvm_value = {};
                    for (const tab of tabs) {
                        const selectedService = tab.selectedService;
                        const isFallback = tab.isFallback;
                        const tabType = tab.name.split(/(\d+)/)[0];
                        if (tab.isSelectedTab) {
                            switch (tabType) {
                                case 'Fix':
                                    kvm_value = {
                                        signzy: '0.0',
                                        karza: '0.0',
                                        getTime: moment().format('YYYYMMDDHHmmss'),
                                        Ratio_S: selectedService && selectedService == "Signzy" ? 1 : 0,
                                        Ratio_K: selectedService && selectedService == "Karza" ? 1 : 0,
                                        fallback: "false"
                                    }
                                    break;

                                case 'Split':
                                    let Ratio_Signzy = ''; let Ratio_Karza = '';
                                    tab.services.forEach(service => {
                                        if (service.name.toLowerCase() === 'signzy') {
                                            Ratio_Signzy = service.value;
                                        }
                                        if (service.name.toLowerCase() === 'karza') {
                                            Ratio_Karza = service.value;
                                        }
                                    });

                                    kvm_value = {
                                        signzy: '0.0',
                                        karza: '0.0',
                                        getTime: moment().format('YYYYMMDDHHmmss'),
                                        Ratio_S: Ratio_Signzy,
                                        Ratio_K: Ratio_Karza,
                                        fallback: isFallback ? 'true' : 'false'

                                    }
                                    break;

                                case 'Fallback':
                                    kvm_value = {
                                        signzy: '0.0',
                                        karza: '0.0',
                                        getTime: moment().format('YYYYMMDDHHmmss'),
                                        Ratio_S: selectedService && selectedService == "Signzy" ? 1 : 0,
                                        Ratio_K: selectedService && selectedService == "Karza" ? 1 : 0,
                                        fallback: 'true'
                                    }
                                    break;

                                default:
                                    throw new Error(`Unknown tab type: ${tabType}`);
                            }
                        }
                    }

                    kvm_name = row1[0].apigee_app_id + '_' + product_id;
                    let kvm_2 = { "name": kvm_name, "value": JSON.stringify(kvm_value), };
                    console.log("=========================kvm_2=================", kvm_2)

                    let kvm_url = '';
                    let method = '';
                    const kvm_environment = in_live_env ? 'prod-01' : 'uat-01';
                    if (!row1[0].app_kvm_json_data || row1[0].app_kvm_json_data.length === 0) {
                        kvm_url = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/environments/${kvm_environment}/keyvaluemaps/routingLogic-KS/entries`
                        method = 'POST';
                    }
                    else {
                        kvm_url = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/environments/${kvm_environment}/keyvaluemaps/routingLogic-KS/entries/${kvm_name}`
                        method = 'PUT';
                    }
                    console.log(method + "___kvm_url ============", kvm_url);
                    const apigeeAuth = await db.get_apigee_token();
                    const kvm_response = await fetch(kvm_url, {
                        method: method,
                        headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json", },
                        body: JSON.stringify(kvm_2),
                    });
                    const kvm_responseData = await kvm_response.json();
                    console.log("====kvm_responseData====:", kvm_responseData);
                    // const _query10 = `UPDATE cst_app_mast SET app_routing_logic = ?, app_kvm_json_data = ? WHERE app_id = ?`;
                    // await db.sequelize.query(_query10, { replacements: [JSON.stringify(kvm_responseData), _app_id], type: QueryTypes.UPDATE });
                    // console.log("-------------", product_id);
                }
            } catch (_) { console.log("-------------", _.message); }

            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: (in_live_env ? 'Live' : 'UAT') + ' app kvm update by  admin. App Id = ' + _app_id + ', App name = ' + row1[0].app_name,
                    query: `CstAppMast.update({ app_routing_logic: '...' }, { where: { app_id: ${_app_id} }})`,
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { console.log("---catch----------"); }

            return res.status(200).json(success(true, res.statusCode, "App Routing KVM Updated successfully.", null));
        }
        else {
            return res.status(200).json(success(false, res.statusCode, "Unable to process, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const app_product_list_get = async (req, res, next) => {
    const { app_id } = req.body;
    try {
        const { CstAppMast, CstCustomer, CstAppProduct, Product } = getModels();
        let _app_id = app_id && validator.isNumeric(app_id.toString()) ? parseInt(app_id) : 0;

        const appData = await CstAppMast.findOne({
            where: { app_id: _app_id, is_deleted: false },
            include: [{
                model: CstCustomer,
                as: 'customer',
                attributes: ['first_name', 'last_name']
            }],
            attributes: ['app_id', 'app_name', 'description', 'app_routing_logic']
        });

        let apps_data = {}; let products = [];
        if (appData) {
            const full_name = `${appData.customer?.first_name || ''} ${appData.customer?.last_name || ''}`.trim();

            // Get products for the app with routing applicable
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

            for (const appProduct of appProducts) {
                const item = appProduct.product;
                let routingLogic = {};
                try {
                    routingLogic = appData.app_routing_logic ? JSON.parse(appData.app_routing_logic) : {};
                } catch (error) {
                    console.log('Error parsing app_routing_logic:', error);
                    routingLogic = {};
                }
                products.push({
                    id: item.product_id,
                    name: item.product_name,
                    tabs: routingLogic[item.product_id] || [],
                    activeTabId: routingLogic[item.product_name] && routingLogic[item.product_name].length > 0 ? routingLogic[item.product_name][0].id : '',
                });
            }

            apps_data = {
                app_id: appData.app_id,
                app_name: appData.app_name,
                app_routing_logic: appData.app_routing_logic,
                display_name: appData.display_name,
                description: appData.description,
                full_name: full_name,
                routing_tab_data: Constants.routing_tab_data,
            }
        }
        const results = {
            apps_data: apps_data,
            app_products_list: products,
        };

        return res.status(200).json(success(true, res.statusCode, "My Apps Data.", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const app_product_apigee_rate_add = async (req, res, next) => {
    const { app_id, product_data } = req.body;
    try {
        const { CstAppMast, CstCustomer } = getModels();
        let _app_id = app_id && validator.isNumeric(app_id.toString()) ? parseInt(app_id) : 0;

        const appData = await CstAppMast.findOne({
            where: { app_id: _app_id, is_deleted: false },
            include: [{
                model: CstCustomer,
                as: 'customer',
                where: { is_deleted: false },
                attributes: ['email_id', 'developer_id']
            }],
            attributes: ['customer_id', 'app_name', 'description', 'app_id', 'in_live_env', 'is_approved', 'is_rejected', 'mkr_is_approved', 'mkr_is_rejected']
        });

        if (!appData) {
            return res.status(200).json(success(false, res.statusCode, "App details not found.", null));
        }

        const email_id = appData.customer?.email_id;
        const in_live_env = !!appData.in_live_env;
        const app_name = appData.app_name;

        if (_app_id && app_name.length > 0 && email_id.length > 0) {

            const data = { attribute: product_data };
            const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers/${email_id}/apps/${app_name}/attributes`;
            const apigeeAuth = await db.get_apigee_token();
            const response = await fetch(product_URL, {
                method: "POST",
                headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json", },
                body: JSON.stringify(data),
            });


            const responseData = await response.json();
            console.log("---------------", responseData);
            console.log("------product_URL---------", product_URL);
            console.log("------JSON.stringify(data)---------", JSON.stringify(data));
            if (responseData) {
                console.log("-----responseData---------", JSON.stringify(responseData));
                const kvm_rate_response = JSON.stringify(responseData);

                const [affectedRows] = await CstAppMast.update(
                    {
                        app_wallet_rate_added_by: req.token_data.account_id,
                        app_wallet_rate_added_date: db.get_ist_current_date(),
                        app_wallet_rate_data: JSON.stringify(product_data),
                        app_wallet_rate_kvm_json_data: kvm_rate_response
                    },
                    { where: { app_id: _app_id } }
                );

                if (affectedRows > 0) {
                    try {
                        let data_to_log = {
                            correlation_id: correlator.getId(),
                            token_id: req.token_data.token_id,
                            account_id: req.token_data.account_id,
                            user_type: 1,
                            user_id: req.token_data.admin_id,
                            narration: (in_live_env ? 'Live' : 'Sandbox') + ' app product rate added. Customer email = ' + email_id + ', App name = ' + app_name,
                            query: `CstAppMast.update({ app_wallet_rate_data: '...' }, { where: { app_id: ${_app_id} }})`,
                        }
                        action_logger.info(JSON.stringify(data_to_log));
                    } catch (_) { console.log("---catch----------", _.stack); }

                    return res.status(200).json(success(true, res.statusCode, "App approved successfully.", null));
                } else {
                    return res.status(200).json(success(false, res.statusCode, "Unable to approve, Please try again.", null));
                }
            }
            else if ((responseData?.error?.status === 'ABORTED' && responseData?.error?.code === 409) || responseData?.error?.message?.length > 0) {
                return res.status(200).json(success(false, res.statusCode, `Apigee response : ${responseData?.error?.message ?? 'Unknown error'}`, null));
            }
            return res.status(200).json(success(false, res.statusCode, "Unable to approve, Please try again.", null));

        } else {
            return res.status(200).json(success(false, res.statusCode, "Apigee response : email or app name not found", null));
        }

    } catch (err) {
        console.log("------err.message---------", err.stack);
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const app_monitization_toggle = async (req, res, next) => {
    const { app_id } = req.body;
    try {
        const { CstAppMast, CstCustomer } = getModels();
        let _app_id = app_id && validator.isNumeric(app_id.toString()) ? parseInt(app_id) : 0;

        const appData = await CstAppMast.findOne({
            where: { app_id: _app_id, is_deleted: false },
            include: [{
                model: CstCustomer,
                as: 'customer',
                where: { is_deleted: false },
                attributes: ['email_id', 'developer_id']
            }],
            attributes: ['customer_id', 'app_name', 'apigee_app_id', 'description', 'expected_volume', 'callback_url', 'ip_addresses', 'cert_public_key', 'app_id', 'in_live_env', 'is_approved', 'is_rejected', 'mkr_is_approved', 'mkr_is_rejected', 'is_monetization_enabled', 'is_monetization_added']
        });

        if (!appData) {
            return res.status(200).json(success(false, res.statusCode, "App details not found.", null));
        }

        const row1 = [{
            customer_id: appData.customer_id,
            app_name: appData.app_name,
            apigee_app_id: appData.apigee_app_id,
            in_live_env: appData.in_live_env,
            is_monetization_enabled: appData.is_monetization_enabled,
            is_monetization_added: appData.is_monetization_added,
            email_id: appData.customer?.email_id
        }];

        if (!row1[0].apigee_app_id) {
            return res.status(200).json(success(false, res.statusCode, "Apigee App Id not found.", null));
        }
        const in_live_env = !!row1[0].in_live_env;
        const apigee_app_id = row1[0].apigee_app_id;
        try {
            let kvm_url = '';
            let method = '';
            const value_data = !row1[0].is_monetization_enabled;
            const kvm_input = { monetisation: value_data };
            const kvm_2 = { "name": apigee_app_id, "value": JSON.stringify(kvm_input), };
            const kvm_environment = in_live_env ? 'prod-01' : 'uat-01';
            if (row1[0].is_monetization_added && row1[0].is_monetization_added == true) {
                kvm_url = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/environments/${kvm_environment}/keyvaluemaps/Monetisation-Enable/entries/${apigee_app_id}`
                method = 'PUT';
            }
            else {
                kvm_url = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/environments/${kvm_environment}/keyvaluemaps/Monetisation-Enable/entries`
                method = 'POST';
            }
            console.log("===kvm url====", kvm_url, "===method==", method,);
            console.log("===kvm_2====", kvm_2);
            const apigeeAuth = await db.get_apigee_token();
            const kvm_response = await fetch(kvm_url, {
                method: method,
                headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json", },
                body: JSON.stringify(kvm_2),
            });
            const kvm_responseData = await kvm_response.json();
            console.log(kvm_responseData);
            if (kvm_response.ok && kvm_responseData?.name?.length > 0) {
                const newEnabledStatus = !row1[0].is_monetization_enabled;
                await CstAppMast.update(
                    {
                        is_monetization_enabled: newEnabledStatus,
                        monetization_kvm_json_data: JSON.stringify(kvm_responseData),
                        monetization_enabled_date: db.get_ist_current_date(),
                        is_monetization_added: true
                    },
                    { where: { app_id: _app_id } }
                );

                try {
                    let data_to_log = {
                        correlation_id: correlator.getId(),
                        token_id: req.token_data.token_id,
                        account_id: req.token_data.account_id,
                        user_type: 1,
                        user_id: req.token_data.admin_id,
                        narration: (in_live_env ? 'Live' : 'Sandbox') + + (row1[0].is_monetization_enabled ? 'disabled' : 'enabled') + ' app monitazation status updated. Customer email = ' + row1[0].email_id + ', App name = ' + row1[0].app_name,
                        query: `CstAppMast.update({ is_monetization_enabled: ${newEnabledStatus} }, { where: { app_id: ${_app_id} }})`,
                    }
                    action_logger.info(JSON.stringify(data_to_log));
                } catch (_) { console.log("---catch----------", _); }
            } else if (kvm_responseData?.error?.message) {
                const message = `Apigee response: ${kvm_responseData.error.message}`;
                const statusCode = kvm_responseData.error.status === 'ABORTED' && kvm_responseData.error.code === 409 ? 200 : 400;
                return res.status(statusCode).json(success(false, statusCode, message, null));
            }
            return res.status(200).json(success(false, res.statusCode, "Unable to approve, Please try again.", null));

        } catch (_) { console.log("-------------", _); }
        return res.status(200).json(success(true, res.statusCode, "App Monitazation Status Change successfully.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const app_rate_subscription = async (req, res, next) => {
    const { app_id } = req.body;
    try {
        const { CstAppMast, CstCustomer, CstAppProduct, Product } = getModels();
        let _app_id = app_id && validator.isNumeric(app_id.toString()) ? parseInt(app_id) : 0;

        const appData = await CstAppMast.findOne({
            where: { app_id: _app_id, is_deleted: false },
            include: [{
                model: CstCustomer,
                as: 'customer',
                where: { is_deleted: false },
                attributes: ['email_id', 'developer_id']
            }],
            attributes: ['customer_id', 'app_name', 'description', 'expected_volume', 'callback_url', 'ip_addresses', 'cert_public_key', 'app_id', 'in_live_env', 'is_approved', 'is_rejected', 'mkr_is_approved', 'mkr_is_rejected']
        });

        if (!appData) {
            return res.status(200).json(success(false, res.statusCode, "App details not found.", null));
        }

        // Get products for the app
        const appProducts = await CstAppProduct.findAll({
            where: { app_id: _app_id },
            include: [{
                model: Product,
                as: 'product',
                attributes: ['product_id', 'product_name'],
                required: true
            }]
        });
        const products = appProducts?.map(ap => ap.product.product_name) || [];

        const developer_id = appData.customer?.developer_id;
        const email_id = appData.customer?.email_id;
        if (developer_id && developer_id.length > 0 && email_id.length > 0) {
            for (const element of products) {
                const data = { apiproduct: element };
                console.log("======productsdata======", data);
                const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers/${email_id}/subscriptions`;
                const apigeeAuth = await db.get_apigee_token();
                const response = await fetch(product_URL, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json", },
                    body: JSON.stringify(data),
                });
                const responseData = await response.json();
                const subscriptions_response = JSON.stringify(response);
                if (responseData?.appId) {
                    console.log("========subscriptions_response=========", subscriptions_response);
                }
                else if (
                    (responseData?.error?.status?.toUpperCase() === 'ABORTED' && String(responseData?.error?.code) === '409') ||
                    responseData?.error?.message?.length > 0
                ) {
                    console.log("========apigee_error_response=========", responseData?.error?.message ?? 'Unknown error');
                }
            }
            return res.status(200).json(success(true, res.statusCode, "product subscriptions successfully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Apigee response : Developer id not found", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const app_monitization_toggle_uat_prod = async (req, res, next) => {
    const { app_id } = req.body;
    try {
        const { CstAppMast, CstCustomer } = getModels();
        let _app_id = app_id && validator.isNumeric(app_id.toString()) ? parseInt(app_id) : 0;

        const appData = await CstAppMast.findOne({
            where: { app_id: _app_id, is_deleted: false },
            include: [{
                model: CstCustomer,
                as: 'customer',
                where: { is_deleted: false },
                attributes: ['email_id', 'developer_id']
            }],
            attributes: ['customer_id', 'app_name', 'is_monetization_rate_appliacable', 'apigee_app_id', 'app_id', 'in_live_env', 'is_approved']
        });

        if (!appData) {
            return res.status(200).json(success(false, res.statusCode, "App details not found.", null));
        }

        const row1 = [{
            customer_id: appData.customer_id,
            app_name: appData.app_name,
            is_monetization_rate_appliacable: appData.is_monetization_rate_appliacable,
            apigee_app_id: appData.apigee_app_id,
            app_id: appData.app_id,
            in_live_env: appData.in_live_env,
            is_approved: appData.is_approved,
            email_id: appData.customer?.email_id,
            developer_id: appData.customer?.developer_id
        }];

        if (!row1[0].apigee_app_id) {
            return res.status(200).json(success(false, res.statusCode, "Apigee App Id not found.", null));
        }
        const app_name = row1[0].app_name;
        const developer_id = row1[0].developer_id;
        const email_id = row1[0].email_id;
        if (developer_id && developer_id.length > 0 && email_id.length > 0 && app_name) {
            try {
                let value_data = row1[0].is_monetization_rate_appliacable && row1[0].is_monetization_rate_appliacable == true ? "False" : "";
                let jsondata = { name: "is_monetization_active", value: value_data };
                const data = { attribute: jsondata };
                const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers/${email_id}/apps/${app_name}/attributes`;
                console.log("=====product_URL=======", product_URL);
                const apigeeAuth = await db.get_apigee_token();
                const response = await fetch(product_URL, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json", },
                    body: JSON.stringify(data),
                });
                console.log("=====response=====", response);
                const responseData = await response.json();
                console.log("=======responseData==========", responseData);
                if (response.ok && responseData) {
                    const newRateApplicable = !row1[0].is_monetization_rate_appliacable;
                    await CstAppMast.update(
                        { is_monetization_rate_appliacable: newRateApplicable },
                        { where: { app_id: _app_id } }
                    );
                }
            } catch (_) { console.log("-------------", _); }
            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: ' app monitazation status updated by . Customer email = ' + row1[0].email_id + ', App name = ' + row1[0].app_name,
                    query: `CstAppMast.update({ is_monetization_rate_appliacable: ... }, { where: { app_id: ${_app_id} }})`,
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { console.log("---catch----------", _); }
        }
        return res.status(200).json(success(true, res.statusCode, "App Monitazation Status Change successfully.", null));
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
