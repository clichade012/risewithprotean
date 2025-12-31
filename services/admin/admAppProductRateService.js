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


const app_product_rate_add = async (req, res, next) => {
    const { app_id, app_product_rate_data } = req.body;
    try {
        const { AppProductRate, CstAppMast, CstCustomer} = getModels();
        let _app_id = app_id && validator.isNumeric(app_id.toString()) ? parseInt(app_id) : 0;
        if (!app_product_rate_data || app_product_rate_data.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter product rate value.", null));
        }

        for (const item of app_product_rate_data) {
            const { name, value } = item;
            if (!name || !value) {
                return res.status(400).json({ success: false, statusCode: 400, message: `Value for ${name || 'unknown product'} is required.`, data: null, });
            }
            if (!validator.isNumeric(value.toString())) {
                return res.status(400).json({ success: false, statusCode: 400, message: `Value for ${name} must be numeric.`, data: null, });
            }
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
        const email_id = appDetails.customer.email_id;
        const in_live_env = !!appDetails.in_live_env;
        const app_name = appDetails.app_name;
        const customer_id = appDetails.customer_id;

        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);
        console.log(is_admin, is_checker, is_maker);
        if (is_checker) {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have authority.", null));
        }
        if (is_admin) {
            await AppProductRate.create({
                app_id: _app_id,
                customer_id: customer_id,
                added_date: db.get_ist_current_date(),
                added_by: req.token_data.account_id,
                rate_plan_value: JSON.stringify(app_product_rate_data),
                is_rate_plan_approved: true
            });

            const data = { attribute: app_product_rate_data };
            console.log("======data=======", data);

            const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers/${email_id}/apps/${app_name}/attributes`;
            const apigeeAuth = await db.get_apigee_token();
            const response = await fetch(product_URL, {
                method: "POST",
                headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json", },
                body: JSON.stringify(data),
            });

            const responseData = await response.json();
            if (response.ok && responseData) {
                console.log("-----responseData---------", JSON.stringify(responseData));
                const kvm_rate_response = JSON.stringify(responseData);
                const [i] = await CstAppMast.update({
                    app_wallet_rate_added_by: req.token_data.account_id,
                    app_wallet_rate_added_date: db.get_ist_current_date(),
                    app_wallet_rate_data: JSON.stringify(app_product_rate_data),
                    app_wallet_rate_kvm_json_data: kvm_rate_response
                }, { where: { app_id: _app_id } });
                if (i > 0) {
                    try {
                        let data_to_log = {
                            correlation_id: correlator.getId(),
                            token_id: req.token_data.token_id,
                            account_id: req.token_data.account_id,
                            user_type: 1,
                            user_id: req.token_data.admin_id,
                            narration: (in_live_env ? 'Live' : 'Sandbox') + ' app product rate added. Customer email = ' + email_id + ', App name = ' + app_name,
                            query: 'ORM update CstAppMast',
                        }
                        action_logger.info(JSON.stringify(data_to_log));
                    } catch (_) { console.log("---catch----------", _.stack); }
                    return res.status(200).json(success(true, res.statusCode, "App approved successfully.", null));
                } else {
                    return res.status(200).json(success(false, res.statusCode, "Unable to approve, Please try again.", null));
                }
            }
            if (responseData?.error?.message) {
                const message = `Apigee response: ${responseData.error.message}`;
                const statusCode = responseData.error.status === 'ABORTED' && responseData.error.code === 409 ? 200 : 400;
                return res.status(statusCode).json(success(false, statusCode, message, null));
            }
            return res.status(200).json(success(false, res.statusCode, "Unable to Add Rate, Please try again.", null));

        } else {
            const newRate = await AppProductRate.create({
                app_id: _app_id,
                customer_id: customer_id,
                added_date: db.get_ist_current_date(),
                added_by: req.token_data.account_id,
                rate_plan_value: JSON.stringify(app_product_rate_data)
            });
            const ap_rate_id = newRate?.ap_rate_id || 0;
            if (ap_rate_id > 0) {
                try {
                    let data_to_log = {
                        correlation_id: correlator.getId(),
                        token_id: req.token_data.token_id,
                        account_id: req.token_data.account_id,
                        user_type: 1,
                        user_id: req.token_data.admin_id,
                        narration: 'App Product Rate added  App name = ' + app_name + ', App Product Data = ' + JSON.stringify(app_product_rate_data),
                        query: 'ORM create AppProductRate',
                        date_time: db.get_ist_current_date(),
                    }
                    action_logger.info(JSON.stringify(data_to_log));
                } catch (_) { }
                return res.status(200).json(success(true, res.statusCode, "Saved successfully.", null));
            } else {
                return res.status(200).json(success(false, res.statusCode, "Unable to save, Please try again", null));
            }
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};



const app_product_rate_pending_list = async (req, res, next) => {
    const { page_no, search_text } = req.body;
    try {
        const { AppProductRate, CstAppMast,  AdmUser, Product, CstAppProduct } = getModels();
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0; if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";
        const offset = (_page_no - 1) * process.env.PAGINATION_SIZE;

        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);
        console.log(is_admin, is_checker, is_maker);
        if (is_maker || is_checker || is_admin) {
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

            const total_record = await AppProductRate.count({
                where: whereClause,
                include: [includeApp]
            });

            const rows = await AppProductRate.findAll({
                where: whereClause,
                include: [
                    includeApp,
                    {
                        model: AdmUser,
                        as: 'addedByUser',
                        attributes: ['first_name', 'last_name'],
                        required: false
                    }
                ],
                order: [['ap_rate_id', 'DESC']],
                limit: process.env.PAGINATION_SIZE,
                offset: offset
            });

            let list = [];
            let sr_no = offset;
            for (const item of rows) {
                sr_no++;
                const appProducts = await CstAppProduct.findAll({
                    where: { app_id: item.app_id },
                    include: [{
                        model: Product,
                        as: 'product',
                        attributes: ['product_id', 'product_name', 'description', 'key_features'],
                        required: true
                    }]
                });
                let products = appProducts.map(ap => ({
                    product_id: ap.product.product_id,
                    product_name: ap.product.product_name,
                    description: ap.product.description,
                    key_features: ap.product.key_features,
                }));

                const ckr_name = item.addedByUser ? `${item.addedByUser.first_name || ''} ${item.addedByUser.last_name || ''}`.trim() : '';
                list.push({
                    sr_no: sr_no,
                    ap_rate_id: item.ap_rate_id,
                    app_id: item.app_id,
                    app_name: item.app?.app_name || '',
                    customer_id: item.customer_id,
                    product_id: item.product_id,
                    rate_plan_value: item.rate_plan_value,
                    added_date: item.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.added_date)) : "",
                    ckr_full_name: ckr_name,
                    products: products
                });
            }
            const results = {
                current_page: _page_no,
                total_pages: Math.ceil(total_record / process.env.PAGINATION_SIZE),
                data: list,
                is_admin: is_admin,
                is_maker: is_maker,
                is_checker: is_checker,
            };
            return res.status(200).json(success(true, res.statusCode, "", results));
        } else {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have checker/maker authority.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const app_product_rate_approve_list = async (req, res, next) => {
    const { page_no, search_text } = req.body;
    try {
        const { AppProductRate, CstAppMast,  AdmUser, Product, CstAppProduct } = getModels();
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0; if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";
        const offset = (_page_no - 1) * process.env.PAGINATION_SIZE;

        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);
        console.log(is_admin, is_checker, is_maker);
        if (is_maker || is_checker || is_admin) {
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

            const total_record = await AppProductRate.count({
                where: whereClause,
                include: [includeApp]
            });

            const rows = await AppProductRate.findAll({
                where: whereClause,
                include: [
                    includeApp,
                    {
                        model: AdmUser,
                        as: 'approvedByUser',
                        attributes: ['first_name', 'last_name'],
                        required: false
                    },
                    {
                        model: AdmUser,
                        as: 'addedByUser',
                        attributes: ['first_name', 'last_name'],
                        required: false
                    }
                ],
                order: [['ap_rate_id', 'DESC']],
                limit: process.env.PAGINATION_SIZE,
                offset: offset
            });

            let list = [];
            let sr_no = offset;
            for (const app of rows) {
                sr_no++;
                const appProducts = await CstAppProduct.findAll({
                    where: { app_id: app.app_id },
                    include: [{
                        model: Product,
                        as: 'product',
                        attributes: ['product_id', 'product_name', 'description', 'key_features'],
                        required: true
                    }]
                });
                let products = appProducts.map(ap => ({
                    product_id: ap.product.product_id,
                    product_name: ap.product.product_name,
                    description: ap.product.description,
                    key_features: ap.product.key_features,
                }));

                const ckr_name = app.approvedByUser ? `${app.approvedByUser.first_name || ''} ${app.approvedByUser.last_name || ''}`.trim() : '';
                const mkr_name = app.addedByUser ? `${app.addedByUser.first_name || ''} ${app.addedByUser.last_name || ''}`.trim() : '';
                list.push({
                    sr_no: sr_no,
                    ap_rate_id: app.ap_rate_id,
                    app_id: app.app_id,
                    app_name: app.app?.app_name || '',
                    customer_id: app.customer_id,
                    product_id: app.product_id,
                    rate_plan_value: app.rate_plan_value,
                    mkr_name: mkr_name,
                    added_date: app.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(app.added_date)) : "",
                    ckr_approved: app.ckr_is_rate_plan_approved,
                    ckr_full_name: ckr_name,
                    ckr_approve_date: app.ckr_rate_plan_approved_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(app.ckr_rate_plan_approved_date)) : "",
                    ckr_remark: app.ckr_rate_plan_approved_rmk,
                    products: products
                });
            }
            const results = {
                current_page: _page_no,
                total_pages: Math.ceil(total_record / process.env.PAGINATION_SIZE),
                data: list,
                is_admin: is_admin,
                is_maker: is_maker,
                is_checker: is_checker,
            };
            return res.status(200).json(success(true, res.statusCode, "", results));
        }
        else {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have checker/maker authority.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const app_product_rate_rejected_list = async (req, res, next) => {
    const { page_no, search_text } = req.body;
    try {
        const { AppProductRate, CstAppMast,  AdmUser, Product, CstAppProduct } = getModels();
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0; if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";
        const offset = (_page_no - 1) * process.env.PAGINATION_SIZE;

        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);
        if (is_maker || is_checker || is_admin) {
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

            const total_record = await AppProductRate.count({
                where: whereClause,
                include: [includeApp]
            });

            const rows = await AppProductRate.findAll({
                where: whereClause,
                include: [
                    includeApp,
                    {
                        model: AdmUser,
                        as: 'rejectedByUser',
                        attributes: ['first_name', 'last_name'],
                        required: false
                    },
                    {
                        model: AdmUser,
                        as: 'addedByUser',
                        attributes: ['first_name', 'last_name'],
                        required: false
                    }
                ],
                order: [['ap_rate_id', 'DESC']],
                limit: process.env.PAGINATION_SIZE,
                offset: offset
            });

            let list = [];
            let sr_no = offset;
            for (const app of rows) {
                sr_no++;
                const appProducts = await CstAppProduct.findAll({
                    where: { app_id: app.app_id },
                    include: [{
                        model: Product,
                        as: 'product',
                        attributes: ['product_id', 'product_name', 'description', 'key_features'],
                        required: true
                    }]
                });
                let products = appProducts.map(ap => ({
                    product_id: ap.product.product_id,
                    product_name: ap.product.product_name,
                    description: ap.product.description,
                    key_features: ap.product.key_features,
                }));

                const ckr_name = app.rejectedByUser ? `${app.rejectedByUser.first_name || ''} ${app.rejectedByUser.last_name || ''}`.trim() : '';
                const mkr_name = app.addedByUser ? `${app.addedByUser.first_name || ''} ${app.addedByUser.last_name || ''}`.trim() : '';
                list.push({
                    sr_no: sr_no,
                    ap_rate_id: app.ap_rate_id,
                    app_id: app.app_id,
                    app_name: app.app?.app_name || '',
                    customer_id: app.customer_id,
                    product_id: app.product_id,
                    rate_plan_value: app.rate_plan_value,
                    ckr_rate_plan_is_rejected: app.ckr_rate_plan_is_rejected,
                    ckr_remark: app.ckr_rate_plan_rejected_rmk,
                    product_name: '',
                    mkr_name: mkr_name,
                    added_date: app.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(app.added_date)) : "",
                    rejected_date: app.ckr_rate_plan_rejected_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(app.ckr_rate_plan_rejected_date)) : "",
                    ckr_full_name: ckr_name,
                    products: products
                });
            }
            const results = {
                current_page: _page_no,
                total_pages: Math.ceil(total_record / process.env.PAGINATION_SIZE),
                data: list,
                is_admin: is_admin,
                is_maker: is_maker,
                is_checker: is_checker,
            };
            return res.status(200).json(success(true, res.statusCode, "", results));
        } else {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have checker/maker authority.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const app_product_rate_reject = async (req, res, next) => {
    const { ap_rate_id, app_id, remark } = req.body;
    try {
        const { AppProductRate, CstAppMast } = getModels();
        let _ap_rate_id = ap_rate_id && validator.isNumeric(ap_rate_id.toString()) ? parseInt(ap_rate_id) : 0;
        let _app_id = app_id && validator.isNumeric(app_id.toString()) ? parseInt(app_id) : 0;
        if (!remark || remark.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter remark.", null));
        }
        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);
        console.log(is_admin, is_checker, is_maker);
        if (is_admin || is_checker) {
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
            if (!rateRecord) {
                return res.status(200).json(success(false, res.statusCode, "App Product Rate Attribute details not found.", null));
            }

            if (rateRecord.ckr_rate_plan_rejected_by || rateRecord.is_rate_plan_rejected) {
                return res.status(200).json(success(false, res.statusCode, "App Product Rate Attribute is already rejected.", null));
            }

            if (rateRecord.is_rate_plan_approved) {
                return res.status(200).json(success(false, res.statusCode, "App Product Rate Attribute is approved, cannot reject.", null));
            }

            const [i] = await AppProductRate.update({
                ckr_rate_plan_is_rejected: true,
                ckr_rate_plan_rejected_by: req.token_data.account_id,
                ckr_rate_plan_rejected_date: db.get_ist_current_date(),
                ckr_rate_plan_rejected_rmk: remark
            }, { where: { ap_rate_id: _ap_rate_id, app_id: _app_id } });
            if (i > 0) {
                try {
                    let data_to_log = {
                        correlation_id: correlator.getId(),
                        token_id: req.token_data.token_id,
                        account_id: req.token_data.account_id,
                        user_type: 1,
                        user_id: req.token_data.admin_id,
                        narration: ' App Product Attribute Rate rejected by ' + (is_admin ? 'admin' : 'checker') + '. App Name = ' + rateRecord.app?.app_name + ', Product Rate Value = ' + rateRecord.rate_plan_value,
                        query: 'ORM update AppProductRate',
                    }
                    action_logger.info(JSON.stringify(data_to_log));
                } catch (_) {
                }
                return res.status(200).json(success(true, res.statusCode, "App Product Rate Value rejected successfully.", null));
            } else {
                return res.status(200).json(success(false, res.statusCode, "Unable to reject, Please try again.", null));
            }
        } else {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have checker/maker authority.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const app_product_rate_approve = async (req, res, next) => {
    const { ap_rate_id, app_id, remark } = req.body;
    try {
        const { AppProductRate, CstAppMast, CstCustomer} = getModels();
        let _ap_rate_id = ap_rate_id && validator.isNumeric(ap_rate_id.toString()) ? parseInt(ap_rate_id) : 0;
        let _app_id = app_id && validator.isNumeric(app_id.toString()) ? parseInt(app_id) : 0;

        if (!remark || remark.length <= 0) {
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
        const email_id = appDetails.customer.email_id;
        const app_name = appDetails.app_name;

        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);
        console.log(is_admin, is_checker, is_maker);
        if (is_admin || is_checker) {
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
            if (!rateRecord) {
                return res.status(200).json(success(false, res.statusCode, "App Product Rate Attribute details not found.", null));
            }

            if (rateRecord.is_rate_plan_approved || rateRecord.ckr_is_rate_plan_approved) {
                return res.status(200).json(success(false, res.statusCode, "App Product Rate Attribute is already approved.", null));
            }

            if (rateRecord.is_rate_plan_rejected || rateRecord.ckr_rate_plan_is_rejected) {
                return res.status(200).json(success(false, res.statusCode, "App Product Rate Attribute is rejected, cannot approve.", null));
            }

            let data2 = JSON.parse(rateRecord.rate_plan_value);
            const product_name = rateRecord.product_name;
            const product_rate_value = transformData(data2);
            console.log("=========product_rate_value========", product_rate_value);

            const data = { attribute: product_rate_value };
            console.log("======data=======", data);

            const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers/${email_id}/apps/${app_name}/attributes`;
            const apigeeAuth = await db.get_apigee_token();
            const response = await fetch(product_URL, {
                method: "POST",
                headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json", },
                body: JSON.stringify(data),
            });
            console.log("=======response==========", response);
            const responseData = await response.json();
            console.log("=======responseData==========", responseData);
            if (response.ok && responseData) {
                const rate_plan_response = JSON.stringify(responseData);
                const [i] = await CstAppMast.update({
                    app_wallet_rate_added_by: req.token_data.account_id,
                    app_wallet_rate_added_date: db.get_ist_current_date(),
                    app_wallet_rate_data: JSON.stringify(product_rate_value),
                    app_wallet_rate_kvm_json_data: rate_plan_response
                }, { where: { app_id: _app_id } });
                if (i > 0) {
                    await AppProductRate.update({
                        is_rate_plan_approved: true,
                        ckr_is_rate_plan_approved: true,
                        rate_plan_json_data: rate_plan_response,
                        ckr_rate_plan_approved_by: req.token_data.account_id,
                        ckr_rate_plan_approved_date: db.get_ist_current_date(),
                        ckr_rate_plan_approved_rmk: remark
                    }, { where: { ap_rate_id: _ap_rate_id, app_id: _app_id } });
                    try {
                        let data_to_log = {
                            correlation_id: correlator.getId(),
                            token_id: req.token_data.token_id,
                            account_id: req.token_data.account_id,
                            user_type: 1,
                            user_id: req.token_data.admin_id,
                            narration: 'Product Attribute Rate added  Product name = ' + product_name + ', Product Attribute Value = ' + product_rate_value,
                            query: 'ORM update AppProductRate',
                        }
                        action_logger.info(JSON.stringify(data_to_log));
                    } catch (_) { console.log("---catch----------"); }

                    return res.status(200).json(success(true, res.statusCode, "Product Attribute Rate Added successfully.", null));
                } else {
                    return res.status(200).json(success(false, res.statusCode, "Unable to Add Product Attribute Rate, Please try again.", null));
                }
            }
            if (responseData?.error?.message) {
                const message = `Apigee response: ${responseData.error.message}`;
                const statusCode = responseData.error.status === 'ABORTED' && responseData.error.code === 409 ? 200 : 400;
                return res.status(statusCode).json(success(false, statusCode, message, null));
            }
            return res.status(200).json(success(false, res.statusCode, "Unable to Add Rate, Please try again.", null));

        } else {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have checker/maker authority.", null));
        }
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
