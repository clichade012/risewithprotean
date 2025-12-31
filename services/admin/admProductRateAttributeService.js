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

const product_rate_attribute_add = async (req, res, next) => {
    const { product_id, product_rate_value } = req.body;
    const { Product, ProductRateAttribute } = db.models;
    try {
        let _product_id = product_id && validator.isNumeric(product_id.toString()) ? parseInt(product_id) : 0;
        if (!product_rate_value || product_rate_value.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter product rate value.", null));
        }

        const row1 = await Product.findOne({
            where: {
                product_id: _product_id,
                is_deleted: false
            },
            attributes: ['product_id', 'product_name'],
            raw: true
        });

        if (!row1) {
            return res.status(200).json(success(false, res.statusCode, "Product details not found.", null));
        }
        const product_name = row1.product_name;

        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);
        console.log(is_admin, is_checker, is_maker);
        if (is_checker) {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have authority.", null));
        }
        if (is_admin) {
            await ProductRateAttribute.create({
                product_id: _product_id,
                added_date: db.get_ist_current_date(),
                added_by: req.token_data.account_id,
                rate_plan_value: product_rate_value,
                ckr_rate_plan_approved_date: db.get_ist_current_date(),
                is_rate_plan_approved: true
            });

            const data = { attribute: [{ name: "defaultRateMultiper", value: product_rate_value, }], };
            const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/apiproducts/${product_name}/attributes`;
            const apigeeAuth = await db.get_apigee_token();
            const response = await fetch(product_URL, {
                method: "POST",
                headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json", },
                body: JSON.stringify(data),
            });
            const responseData = await response.json();
            if (responseData) {
                const rate_plan_response = JSON.stringify(responseData);
                const [affectedRows] = await Product.update(
                    {
                        rate_plan_value: product_rate_value,
                        rate_plan_added_by: req.token_data.account_id,
                        rate_added_date: db.get_ist_current_date(),
                        rate_plan_json_data: rate_plan_response
                    },
                    {
                        where: { product_id: _product_id }
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
                            narration: 'Product Rate added  Product name = ' + product_name + ', Product Value = ' + product_rate_value,
                            query: JSON.stringify({
                                product_id: _product_id,
                                rate_plan_value: product_rate_value
                            }),
                        }
                        action_logger.info(JSON.stringify(data_to_log));
                    } catch (_) { console.log("---catch----------"); }

                    return res.status(200).json(success(true, res.statusCode, "Product Rate Added successfully.", null));
                } else {
                    return res.status(200).json(success(false, res.statusCode, "Unable to Add Rate, Please try again.", null));
                }
            }
            else if ((responseData?.error?.status == 'ABORTED' && responseData?.error?.code === 409) || responseData?.error?.message?.length > 0) {
                return res.status(200).json(success(false, res.statusCode, `Apigee response : ${responseData?.error?.message ?? 'Unknown error'}`, null));
            }

            return res.status(200).json(success(false, res.statusCode, "Unable to Add Rate, Please try again.", null));

        } else {
            const newRateAttribute = await ProductRateAttribute.create({
                product_id: _product_id,
                added_date: db.get_ist_current_date(),
                added_by: req.token_data.account_id,
                rate_plan_value: product_rate_value
            });

            const arate_id = newRateAttribute?.arate_id ?? 0;
            if (arate_id > 0) {
                try {
                    let data_to_log = {
                        correlation_id: correlator.getId(),
                        token_id: req.token_data.token_id,
                        account_id: req.token_data.account_id,
                        user_type: 1,
                        user_id: req.token_data.admin_id,
                        narration: 'Product Rate added  Product name = ' + product_name + ', Product Value = ' + product_rate_value,
                        query: JSON.stringify({
                            product_id: _product_id,
                            rate_plan_value: product_rate_value
                        }),
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

const product_rate_attribute_pending_list = async (req, res, next) => {
    const { page_no, search_text } = req.body;
    const { ProductRateAttribute, Product } = db.models;
    try {
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0; if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";

        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);
        if (is_maker || is_checker || is_admin) {
            // Count total records using ORM with include
            const total_record = await ProductRateAttribute.count({
                include: [{
                    model: Product,
                    as: 'product',
                    where: {
                        is_deleted: false,
                        ...(_search_text && {
                            [Op.and]: [
                                db.sequelize.where(
                                    db.sequelize.fn('LOWER', db.sequelize.col('product.product_name')),
                                    { [Op.like]: db.sequelize.fn('LOWER', _search_text + '%') }
                                )
                            ]
                        })
                    },
                    attributes: [],
                    required: true
                }],
                where: {
                    is_deleted: false,
                    is_rate_plan_approved: false,
                    ckr_is_rate_plan_approved: false,
                    ckr_rate_plan_is_rejected: false,
                    is_rate_plan_rejected: false
                }
            });
            const { AdmUser } = db.models;
            const row1 = await ProductRateAttribute.findAll({
                include: [
                    {
                        model: Product,
                        as: 'product',
                        where: {
                            is_deleted: false,
                            ...(_search_text && {
                                [Op.and]: [
                                    db.sequelize.where(
                                        db.sequelize.fn('LOWER', db.sequelize.col('product.product_name')),
                                        { [Op.like]: db.sequelize.fn('LOWER', _search_text + '%') }
                                    )
                                ]
                            })
                        },
                        attributes: ['product_name'],
                        required: true
                    },
                    {
                        model: AdmUser,
                        as: 'added_by_user',
                        attributes: ['first_name', 'last_name'],
                        required: false
                    }
                ],
                where: {
                    is_deleted: false,
                    is_rate_plan_approved: false,
                    ckr_is_rate_plan_approved: false,
                    ckr_rate_plan_is_rejected: false,
                    is_rate_plan_rejected: false
                },
                attributes: ['arate_id', 'product_id', 'added_date', 'rate_plan_value', 'rate_plan_json_data',
                            'is_rate_plan_approved', 'ckr_rate_plan_approved_date', 'ckr_rate_plan_approved_rmk'],
                order: [['arate_id', 'DESC']],
                limit: parseInt(process.env.PAGINATION_SIZE),
                offset: (_page_no - 1) * parseInt(process.env.PAGINATION_SIZE),
                raw: true,
                nest: true
            });

            let list = [];
            if (row1 && row1.length > 0) {
                const startIndex = (_page_no - 1) * parseInt(process.env.PAGINATION_SIZE);
                for (let i = 0; i < row1.length; i++) {
                    const item = row1[i];
                    const ckr_full_name = (item.added_by_user?.first_name || '') + (item.added_by_user?.last_name ? ' ' + item.added_by_user.last_name : '');
                    list.push({
                        sr_no: startIndex + i + 1,
                        product_rate_id: item.arate_id,
                        product_id: item.product_id,
                        product_name: item.product?.product_name || '',
                        rate_plan_value: item.rate_plan_value,
                        added_date: item.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.added_date)) : "",
                        ckr_full_name: ckr_full_name.trim(),
                    });
                }
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

const product_rate_attribute_approve_list = async (req, res, next) => {
    const { page_no, search_text } = req.body;
    const { ProductRateAttribute, Product } = db.models;
    try {
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0; if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";

        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);
        if (is_maker || is_checker || is_admin) {
            // Count total records using ORM
            const total_record = await ProductRateAttribute.count({
                include: [{
                    model: Product,
                    as: 'product',
                    where: {
                        is_deleted: false,
                        ...(_search_text && {
                            [Op.and]: [
                                db.sequelize.where(
                                    db.sequelize.fn('LOWER', db.sequelize.col('product.product_name')),
                                    { [Op.like]: db.sequelize.fn('LOWER', _search_text + '%') }
                                )
                            ]
                        })
                    },
                    attributes: [],
                    required: true
                }],
                where: {
                    is_deleted: false,
                    [Op.or]: [
                        { ckr_is_rate_plan_approved: true },
                        { is_rate_plan_approved: true }
                    ],
                    ckr_rate_plan_is_rejected: false,
                    is_rate_plan_rejected: false
                }
            });

            const { AdmUser } = db.models;
            const row1 = await ProductRateAttribute.findAll({
                include: [
                    {
                        model: Product,
                        as: 'product',
                        where: {
                            is_deleted: false,
                            ...(_search_text && {
                                [Op.and]: [
                                    db.sequelize.where(
                                        db.sequelize.fn('LOWER', db.sequelize.col('product.product_name')),
                                        { [Op.like]: db.sequelize.fn('LOWER', '%' + _search_text + '%') }
                                    )
                                ]
                            })
                        },
                        attributes: ['product_name'],
                        required: true
                    },
                    {
                        model: AdmUser,
                        as: 'approved_by_user',
                        attributes: ['first_name', 'last_name'],
                        required: false
                    },
                    {
                        model: AdmUser,
                        as: 'added_by_user',
                        attributes: ['first_name', 'last_name'],
                        required: false
                    }
                ],
                where: {
                    is_deleted: false,
                    [Op.or]: [
                        { ckr_is_rate_plan_approved: true },
                        { is_rate_plan_approved: true }
                    ],
                    ckr_rate_plan_is_rejected: false,
                    is_rate_plan_rejected: false
                },
                attributes: ['arate_id', 'product_id', 'added_date', 'rate_plan_value', 'rate_plan_json_data',
                            'is_rate_plan_approved', 'ckr_rate_plan_approved_date', 'ckr_rate_plan_approved_rmk'],
                order: [['arate_id', 'DESC']],
                limit: parseInt(process.env.PAGINATION_SIZE),
                offset: (_page_no - 1) * parseInt(process.env.PAGINATION_SIZE),
                raw: true,
                nest: true
            });

            let list = [];
            if (row1 && row1.length > 0) {
                const startIndex = (_page_no - 1) * parseInt(process.env.PAGINATION_SIZE);
                for (let i = 0; i < row1.length; i++) {
                    const item = row1[i];
                    const ckr_full_name = (item.approved_by_user?.first_name || '') + (item.approved_by_user?.last_name ? ' ' + item.approved_by_user.last_name : '');
                    const mkr_name = (item.added_by_user?.first_name || '') + (item.added_by_user?.last_name ? ' ' + item.added_by_user.last_name : '');
                    list.push({
                        sr_no: startIndex + i + 1,
                        product_rate_id: item.arate_id,
                        product_id: item.product_id,
                        product_name: item.product?.product_name || '',
                        rate_plan_value: item.rate_plan_value,
                        mkr_name: mkr_name.trim(),
                        added_date: item.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.added_date)) : "",

                        ckr_approved: item.ckr_is_approved,
                        ckr_full_name: ckr_full_name.trim(),
                        ckr_approve_date: item.ckr_rate_plan_approved_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.ckr_rate_plan_approved_date)) : "",
                        ckr_remark: item.ckr_rate_plan_approved_rmk,
                    });
                }
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

const product_rate_attribute_rejected_list = async (req, res, next) => {
    const { page_no, search_text } = req.body;
    const { ProductRateAttribute, Product } = db.models;
    try {
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0; if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";

        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);
        if (is_maker || is_checker || is_admin) {
            // Count total records using ORM
            const total_record = await ProductRateAttribute.count({
                include: [{
                    model: Product,
                    as: 'product',
                    where: {
                        is_deleted: false,
                        ...(_search_text && {
                            [Op.and]: [
                                db.sequelize.where(
                                    db.sequelize.fn('LOWER', db.sequelize.col('product.product_name')),
                                    { [Op.like]: db.sequelize.fn('LOWER', _search_text + '%') }
                                )
                            ]
                        })
                    },
                    attributes: [],
                    required: true
                }],
                where: {
                    is_deleted: false,
                    [Op.or]: [
                        { ckr_rate_plan_is_rejected: true },
                        { is_rate_plan_rejected: true }
                    ],
                    ckr_is_rate_plan_approved: false,
                    is_rate_plan_approved: false
                }
            });

            const { AdmUser } = db.models;
            const row1 = await ProductRateAttribute.findAll({
                include: [
                    {
                        model: Product,
                        as: 'product',
                        where: {
                            is_deleted: false,
                            ...(_search_text && {
                                [Op.and]: [
                                    db.sequelize.where(
                                        db.sequelize.fn('LOWER', db.sequelize.col('product.product_name')),
                                        { [Op.like]: db.sequelize.fn('LOWER', _search_text + '%') }
                                    )
                                ]
                            })
                        },
                        attributes: ['product_name'],
                        required: true
                    },
                    {
                        model: AdmUser,
                        as: 'rejected_by_user',
                        attributes: ['first_name', 'last_name'],
                        required: false
                    },
                    {
                        model: AdmUser,
                        as: 'added_by_user',
                        attributes: ['first_name', 'last_name'],
                        required: false
                    }
                ],
                where: {
                    is_deleted: false,
                    [Op.or]: [
                        { ckr_rate_plan_is_rejected: true },
                        { is_rate_plan_rejected: true }
                    ],
                    ckr_is_rate_plan_approved: false,
                    is_rate_plan_approved: false
                },
                attributes: ['arate_id', 'product_id', 'added_date', 'rate_plan_value', 'rate_plan_json_data',
                            'is_rate_plan_approved', 'ckr_rate_plan_approved_date', 'ckr_rate_plan_approved_rmk',
                            'ckr_rate_plan_is_rejected', 'ckr_rate_plan_rejected_rmk', 'ckr_rate_plan_rejected_by',
                            'ckr_rate_plan_rejected_date'],
                order: [['arate_id', 'DESC']],
                limit: parseInt(process.env.PAGINATION_SIZE),
                offset: (_page_no - 1) * parseInt(process.env.PAGINATION_SIZE),
                raw: true,
                nest: true
            });

            let list = [];
            if (row1 && row1.length > 0) {
                const startIndex = (_page_no - 1) * parseInt(process.env.PAGINATION_SIZE);
                for (let i = 0; i < row1.length; i++) {
                    const item = row1[i];
                    const ckr_full_name = (item.rejected_by_user?.first_name || '') + (item.rejected_by_user?.last_name ? ' ' + item.rejected_by_user.last_name : '');
                    const mkr_name = (item.added_by_user?.first_name || '') + (item.added_by_user?.last_name ? ' ' + item.added_by_user.last_name : '');
                    list.push({
                        sr_no: startIndex + i + 1,
                        product_rate_id: item.arate_id,
                        product_id: item.product_id,
                        ckr_rate_plan_is_rejected: item.ckr_rate_plan_is_rejected,
                        ckr_remark: item.ckr_rate_plan_rejected_rmk,
                        product_name: item.product?.product_name || '',
                        mkr_name: mkr_name.trim(),
                        added_date: item.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.added_date)) : "",
                        rejected_date: item.ckr_rate_plan_rejected_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.ckr_rate_plan_rejected_date)) : "",
                        ckr_full_name: ckr_full_name.trim(),
                    });
                }
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

const product_rate_attribute_reject = async (req, res, next) => {
    const { product_rate_id, product_id, remark } = req.body;
    const { ProductRateAttribute, Product } = db.models;
    try {
        let _product_rate_id = product_rate_id && validator.isNumeric(product_rate_id.toString()) ? parseInt(product_rate_id) : 0;
        let _product_id = product_id && validator.isNumeric(product_id.toString()) ? parseInt(product_id) : 0;
        if (!remark || remark.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter remark.", null));
        }
        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);
        console.log(is_admin, is_checker, is_maker);
        if (is_admin || is_checker) {
            const row1 = await ProductRateAttribute.findOne({
                include: [{
                    model: Product,
                    as: 'product',
                    where: { is_deleted: false },
                    attributes: ['product_name'],
                    required: true
                }],
                where: {
                    arate_id: _product_rate_id,
                    product_id: _product_id,
                    is_deleted: false
                },
                attributes: ['arate_id', 'product_id', 'rate_plan_value', 'is_rate_plan_rejected', 'ckr_rate_plan_rejected_by',
                    'is_rate_plan_approved', 'ckr_is_rate_plan_approved'],
                raw: true
            });

            if (!row1) {
                return res.status(200).json(success(false, res.statusCode, "Product Rate Attribute details not found.", null));
            }
            if ((row1.ckr_rate_plan_rejected_by && row1.ckr_rate_plan_rejected_by == true) ||
                (row1.is_rate_plan_rejected && row1.is_rate_plan_rejected == true)) {
                return res.status(200).json(success(false, res.statusCode, "Product Rate Attribute is already rejected.", null));
            }
            if (row1.is_rate_plan_approved && row1.is_rate_plan_approved == true) {
                return res.status(200).json(success(false, res.statusCode, "Product Rate Attribute is approved, can not reject", null));
            }

            const updateData = is_admin ? {
                is_rate_plan_rejected: true,
                ckr_rate_plan_rejected_by: req.token_data.account_id,
                ckr_rate_plan_rejected_date: db.get_ist_current_date(),
                ckr_rate_plan_rejected_rmk: remark
            } : {
                ckr_rate_plan_is_rejected: true,
                ckr_rate_plan_rejected_by: req.token_data.account_id,
                ckr_rate_plan_rejected_date: db.get_ist_current_date(),
                ckr_rate_plan_rejected_rmk: remark
            };

            const [affectedRows] = await ProductRateAttribute.update(
                updateData,
                {
                    where: {
                        arate_id: _product_rate_id,
                        product_id: _product_id
                    }
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
                        narration: ' Product Attribute Rate rejected by ' + (is_admin ? 'admin' : 'checker') + '. Product Name = ' + row1['product.product_name'] + ', Product Rate Value = ' + row1.rate_plan_value,
                        query: JSON.stringify(updateData),
                    }
                    action_logger.info(JSON.stringify(data_to_log));
                } catch (_) {
                }
                return res.status(200).json(success(true, res.statusCode, "Product Rate Attribute rejected successfully.", null));
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

const product_rate_attribute_approve = async (req, res, next) => {
    const { product_rate_id, product_id, remark } = req.body;
    const { ProductRateAttribute, Product } = db.models;
    try {
        let _product_rate_id = product_rate_id && validator.isNumeric(product_rate_id.toString()) ? parseInt(product_rate_id) : 0;
        let _product_id = product_id && validator.isNumeric(product_id.toString()) ? parseInt(product_id) : 0;

        if (!remark || remark.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter remark.", null));
        }
        const [is_admin, is_checker] = await commonModule.getUserRoles(req);
        if (is_admin || is_checker) {
            const row1 = await ProductRateAttribute.findOne({
                include: [{
                    model: Product,
                    as: 'product',
                    where: { is_deleted: false },
                    attributes: ['product_name'],
                    required: true
                }],
                where: {
                    arate_id: _product_rate_id,
                    product_id: _product_id,
                    is_deleted: false
                },
                attributes: ['arate_id', 'product_id', 'rate_plan_value', 'is_rate_plan_rejected', 'ckr_rate_plan_is_rejected',
                            'is_rate_plan_approved', 'ckr_is_rate_plan_approved'],
                raw: true
            });

            if (!row1) {
                return res.status(200).json(success(false, res.statusCode, "Product Rate Attribute details not found.", null));
            }
            if (row1.is_rate_plan_approved && row1.is_rate_plan_approved == true) {
                return res.status(200).json(success(false, res.statusCode, "Product Rate Attribute is already approved.", null));
            }
            if (row1.ckr_is_rate_plan_approved && row1.ckr_is_rate_plan_approved == true) {
                return res.status(200).json(success(false, res.statusCode, "Product Rate Attribute is already approved.", null));
            }
            if (row1.is_rate_plan_rejected && row1.is_rate_plan_rejected == true) {
                return res.status(200).json(success(false, res.statusCode, "Product Rate Attribute is rejected, can not approve.", null));
            }
            if (row1.ckr_rate_plan_is_rejected && row1.ckr_rate_plan_is_rejected == true) {
                return res.status(200).json(success(false, res.statusCode, "Product Rate Attribute is rejected, can not approve.", null));
            }

            const product_name = row1['product.product_name'];
            const product_rate_value = row1.rate_plan_value;

            const data = { attribute: [{ name: "defaultRateMultiper", value: product_rate_value, }], };
            const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/apiproducts/${product_name}/attributes`;
            const apigeeAuth = await db.get_apigee_token();
            const response = await fetch(product_URL, {
                method: "POST",
                headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json", },
                body: JSON.stringify(data),
            });
            const responseData = await response.json();
            if (responseData) {
                const rate_plan_response = JSON.stringify(responseData);

                const [affectedRows1] = await Product.update(
                    {
                        rate_plan_value: product_rate_value,
                        rate_plan_added_by: req.token_data.account_id,
                        rate_added_date: db.get_ist_current_date(),
                        rate_plan_json_data: rate_plan_response
                    },
                    {
                        where: { product_id: _product_id }
                    }
                );

                if (affectedRows1 > 0) {
                    await ProductRateAttribute.update(
                        {
                            is_rate_plan_approved: true,
                            ckr_is_rate_plan_approved: true,
                            rate_plan_json_data: rate_plan_response,
                            ckr_rate_plan_approved_by: req.token_data.account_id,
                            ckr_rate_plan_approved_date: db.get_ist_current_date(),
                            ckr_rate_plan_approved_rmk: remark
                        },
                        {
                            where: {
                                arate_id: product_rate_id,
                                product_id: _product_id
                            }
                        }
                    );

                    try {
                        let data_to_log = {
                            correlation_id: correlator.getId(),
                            token_id: req.token_data.token_id,
                            account_id: req.token_data.account_id,
                            user_type: 1,
                            user_id: req.token_data.admin_id,
                            narration: 'Product Attribute Rate added  Product name = ' + product_name + ', Product Attribute Value = ' + product_rate_value,
                            query: JSON.stringify({
                                product_id: _product_id,
                                arate_id: product_rate_id,
                                rate_plan_value: product_rate_value,
                                approved_by: req.token_data.account_id,
                                remark: remark
                            }),
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
                const statusCode = responseData?.error?.status === 'ABORTED' && responseData?.error?.code === 409 ? 200 : 400;
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


export default {
    product_rate_attribute_add,
    product_rate_attribute_pending_list,
    product_rate_attribute_approve_list,
    product_rate_attribute_rejected_list,
    product_rate_attribute_reject,
    product_rate_attribute_approve
};