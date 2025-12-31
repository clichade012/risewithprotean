import { logger as _logger, action_logger } from '../../logger/winston.js';
import db from '../../database/db_helper.js';
import { QueryTypes, Op, fn, col, literal } from 'sequelize';
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
import { createObjectCsvWriter } from 'csv-writer';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import commonModule from "../../modules/commonModule.js";

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

const customer_approve = async (req, res, next) => {
    const { customer_id } = req.body;
    const { CstCustomer } = db.models;
    try {
        let _customer_id = customer_id && validator.isNumeric(customer_id.toString()) ? parseInt(customer_id) : 0;

        const row1 = await CstCustomer.findOne({
            where: {
                customer_id: _customer_id,
                is_deleted: false
            },
            attributes: ['customer_id', 'is_approved', 'first_name', 'last_name', 'email_id', 'user_name', 'company_name']
        });

        if (!row1) {
            return res.status(200).json(success(false, res.statusCode, "Customer details not found, Please try again.", null));
        }
        if (row1.is_approved > 0) {
            return res.status(200).json(success(false, res.statusCode, "Customer is already approved.", null));
        }
        if (row1.first_name.length > 0 && row1.last_name.length > 0 && row1.email_id.length > 0) {
            const first_name = row1.first_name;
            const last_name = row1.last_name;
            const email_id = row1.email_id;
            const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers`;
            const data = {
                firstName: first_name,
                lastName: last_name,
                userName: email_id,
                email: email_id
            };
            const apigeeAuth = await db.get_apigee_token();
            const response = await fetch(product_URL, {
                method: "POST",
                headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json", },
                body: JSON.stringify(data),
            });
            const responseData = await response.json();
            if (responseData?.developerId) {
                const developer_id = responseData.developerId;
                const approval_response = JSON.stringify(responseData);

                const [affectedRows] = await CstCustomer.update(
                    {
                        is_approved: 1,
                        approved_date: db.get_ist_current_date(),
                        developer_id: developer_id,
                        approval_response: approval_response,
                        approved_by: req.token_data.account_id
                    },
                    {
                        where: { customer_id: _customer_id }
                    }
                );

                if (affectedRows > 0) {
                    try {
                        const _ad_query = `INSERT INTO customer_data(customer_id, first_name, last_name, email_id,developer_id, company_name) VALUES (?, ?, ?, ?, ?, ?)`;
                        const _replacementsad = [_customer_id, first_name, last_name, email_id, developer_id, row1.company_name]
                        await db.sequelize2.query(_ad_query, { replacements: _replacementsad, type: QueryTypes.INSERT });

                    } catch (_err) { _logger.error(_err.stack); }
                    await send_approved_email(_customer_id);

                    try {
                        let data_to_log = {
                            correlation_id: correlator.getId(),
                            token_id: req.token_data.token_id,
                            account_id: req.token_data.account_id,
                            user_type: 1,
                            user_id: req.token_data.admin_id,
                            narration: ' Customer approved by admin user manually. Customer email = ' + row1.email_id,
                            query: JSON.stringify({
                                customer_id: _customer_id,
                                is_approved: 1,
                                developer_id: developer_id
                            }),
                            date_time: db.get_ist_current_date(),
                        }
                        action_logger.info(JSON.stringify(data_to_log));
                    } catch (_) { }

                    return res.status(200).json(success(true, res.statusCode, "Customer approved successfully.", null));
                } else {
                    return res.status(200).json(success(false, res.statusCode, "Unable to approve, Please try again.", null));
                }
            }
            if (responseData?.error?.status === 'ABORTED' && responseData?.error?.code === 409) {
                return res.status(200).json(success(false, res.statusCode, 'Apigee response : ' + responseData?.error?.message, null));
            }
            if (responseData?.error?.message?.length > 0) {
                return res.status(200).json(success(false, res.statusCode, "Apigee response : " + responseData?.error?.message, null));
            }
            return res.status(200).json(success(false, res.statusCode, "Unable to approve, Please try again.", null));

        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to approve, details not available.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const customer_approve_auto = async (customer_id) => {
    const { CstCustomer } = db.models;
    try {
        let _customer_id = customer_id && validator.isNumeric(customer_id.toString()) ? parseInt(customer_id) : 0;

        const row1 = await CstCustomer.findOne({
            where: {
                customer_id: _customer_id,
                is_deleted: false
            },
            attributes: ['customer_id', 'is_approved', 'first_name', 'last_name', 'email_id', 'user_name']
        });

        if (!row1) {
            return -1;
        }
        if (row1.is_approved > 0) {
            return -2;
        }
        if (row1.first_name.length > 0 && row1.last_name.length > 0 && row1.email_id.length > 0) {
            const first_name = row1.first_name;
            const last_name = row1.last_name;
            const email_id = row1.email_id;
            const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers`;
            const data = {
                firstName: first_name,
                lastName: last_name,
                userName: email_id,
                email: email_id
            };
            const apigeeAuth = await db.get_apigee_token();
            const response = await fetch(product_URL, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apigeeAuth}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(data),
            });
            const responseData = await response.json();
            if (responseData?.developerId) {
                const developer_id = responseData.developerId;
                const approval_response = JSON.stringify(responseData);

                const [affectedRows] = await CstCustomer.update(
                    {
                        is_approved: 1,
                        approved_date: db.get_ist_current_date(),
                        developer_id: developer_id,
                        approval_response: approval_response
                    },
                    {
                        where: { customer_id: _customer_id }
                    }
                );

                if (affectedRows > 0) {
                    await send_approved_email(_customer_id);
                    return 1;
                } else {
                    return 0;
                }
            }
            else if ((responseData?.error?.status == 'ABORTED' && responseData?.error?.code === 409) || responseData?.error?.message?.length > 0) {
                return 0;
            }


        } else {
            return 0;
        }
    } catch (err) {
        _logger.error(err.stack);
        return 0;
    }
};

const send_approved_email = async (customer_id) => {
    const { CstCustomer, EmailTemplate } = db.models;

    const row4 = await CstCustomer.findOne({
        where: {
            customer_id: customer_id,
            is_deleted: false
        },
        attributes: ['first_name', 'last_name', 'email_id', 'mobile_no', 'is_approved']
    });

    if (row4) {
        if (row4.is_approved && row4.is_approved == true) {
            const rowT = await EmailTemplate.findOne({
                where: { template_id: EmailTemplates.CUSTOMER_APPROVED_EMAIL.value },
                attributes: ['subject', 'body_text', 'is_enabled']
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
                        _logger.error(err.stack);
                    }
                    if (is_success) {
                        return 1;
                    } else {
                        return 0; /* Sending fail*/
                    }
                } else {
                    return -4;      /*Templete is disabled*/
                }
            } else {
                return -3;      /*Templete not found*/
            }
        } else {
            return -1;      /*account not approved*/
        }
    }
    return 0;       /*customer data not found*/
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
        let _customer_id = customer_id && validator.isNumeric(customer_id.toString()) ? parseInt(customer_id) : 0;

        const customer = await CstCustomer.findOne({
            where: {
                customer_id: _customer_id,
                is_deleted: false
            },
            attributes: ['customer_id', 'developer_id', 'is_enabled', 'email_id']
        });

        if (!customer) {
            return res.status(200).json(success(false, res.statusCode, "Customer details not found, Please try again.", null));
        }

        if (customer.developer_id && customer.developer_id.length > 0) {
            const developer_id = customer.developer_id;
            const dev_status = customer.is_enabled ? 'inactive' : 'active';
            const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers/${developer_id}?action=${dev_status}`;
            const apigeeAuth = await db.get_apigee_token();
            const response = await fetch(product_URL, {
                method: "POST",
                headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/octet-stream", },
            });
            if (response.status != 204) {
                return res.status(200).json(success(false, res.statusCode, "Apigee response : " + response.statusText, null));
            }
        }

        const newEnabledStatus = !customer.is_enabled;

        const [affectedRows] = await CstCustomer.update(
            {
                is_enabled: newEnabledStatus,
                modify_date: db.get_ist_current_date(),
                modify_by: req.token_data.account_id
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
                    narration: `Customer ${customer.is_enabled ? 'disabled' : 'enabled'}. Customer email = ${customer.email_id}`,
                    query: `CstCustomer.update({ is_enabled: ${newEnabledStatus} }, { where: { customer_id: ${_customer_id} }})`,
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

const customer_delete = async (req, res, next) => {
    const { customer_id } = req.body;
    try {
        const { CstCustomer, CstAppMast, CstToken } = db.models;
        let _customer_id = customer_id && validator.isNumeric(customer_id.toString()) ? parseInt(customer_id) : 0;

        const row1 = await CstCustomer.findOne({
            where: { customer_id: _customer_id, is_deleted: false },
            attributes: ['customer_id', 'developer_id', 'email_id', 'is_enabled'],
            raw: true
        });

        if (!row1) {
            return res.status(200).json(success(false, res.statusCode, "Customer details not found, Please try again.", null));
        }

        if (row1.developer_id && row1.developer_id.length > 0) {
            const email_id = row1.email_id;
            const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers/${email_id}`;
            const apigeeAuth = await db.get_apigee_token();
            const response = await fetch(product_URL, {
                method: "DELETE", headers: { Authorization: `Bearer ${apigeeAuth}` },
            });
            const responseData = await response.json();

            if (response.status == 200) {
                const row47 = await CstAppMast.findAll({
                    where: { customer_id: _customer_id, is_deleted: false },
                    attributes: ['customer_id', 'app_id', 'apigee_app_id', 'is_approved', 'app_name'],
                    raw: true
                });

                if (row47 && row47.length > 0) {
                    await CstAppMast.update(
                        { is_deleted: true },
                        { where: { customer_id: _customer_id, is_deleted: false } }
                    );

                    for (const element of row47) {
                        if (element.apigee_app_id && element.apigee_app_id.length > 0) {
                            const app_name = element.app_name;
                            const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers/${row1.email_id}/apps/${app_name}`;
                            const apigeeAuth = await db.get_apigee_token();
                            await fetch(product_URL, { method: "DELETE", headers: { Authorization: `Bearer ${apigeeAuth}` }, });
                        }
                    }
                    try {
                        let data_to_log = {
                            correlation_id: correlator.getId(),
                            token_id: req.token_data.token_id,
                            account_id: req.token_data.account_id,
                            user_type: 1,
                            user_id: req.token_data.admin_id,
                            narration: 'Customer apps deleted due to deletion of customer. Customer email = ' + row1.email_id,
                            query: `CstAppMast.update({ is_deleted: true }, { where: { customer_id: ${_customer_id} }})`,
                            date_time: db.get_ist_current_date(),
                        }
                        action_logger.info(JSON.stringify(data_to_log));
                    } catch (_) { }
                }

                const [affectedRows] = await CstCustomer.update(
                    {
                        is_deleted: true,
                        modify_date: db.get_ist_current_date(),
                        modify_by: req.token_data.account_id
                    },
                    { where: { customer_id: _customer_id } }
                );

                if (affectedRows > 0) {
                    await CstToken.update(
                        { is_logout: true, logout_time: db.get_ist_current_date() },
                        { where: { customer_id: _customer_id, is_logout: false } }
                    );
                    try {
                        let data_to_log = {
                            correlation_id: correlator.getId(),
                            token_id: req.token_data.token_id,
                            account_id: req.token_data.account_id,
                            user_type: 1,
                            user_id: req.token_data.admin_id,
                            narration: 'Customer deleted. Customer email = ' + row1.email_id,
                            query: `CstCustomer.update({ is_deleted: true }, { where: { customer_id: ${_customer_id} }})`,
                            date_time: db.get_ist_current_date(),
                        }
                        action_logger.info(JSON.stringify(data_to_log));
                    } catch (_) { }

                    return res.status(200).json(success(true, res.statusCode, "Customer delete successfully.", null));
                } else {
                    return res.status(200).json(success(false, res.statusCode, "Unable to delete, Please try again.", null));
                }
            }
            else if (responseData?.error?.status == 'NOT_FOUND' && responseData?.error?.code == 404) {
                const [affectedRows] = await CstCustomer.update(
                    {
                        is_deleted: true,
                        modify_date: db.get_ist_current_date(),
                        modify_by: req.token_data.account_id
                    },
                    { where: { customer_id: _customer_id } }
                );

                if (affectedRows > 0) {
                    await CstAppMast.update(
                        { is_deleted: true },
                        { where: { customer_id: _customer_id, is_deleted: false } }
                    );

                    await CstToken.update(
                        { is_logout: true, logout_time: db.get_ist_current_date() },
                        { where: { customer_id: _customer_id, is_logout: false } }
                    );

                    try {
                        let data_to_log = {
                            correlation_id: correlator.getId(),
                            token_id: req.token_data.token_id,
                            account_id: req.token_data.account_id,
                            user_type: 1,
                            user_id: req.token_data.admin_id,
                            narration: 'Customer deleted. Customer email = ' + row1.email_id,
                            query: `CstCustomer.update({ is_deleted: true }, { where: { customer_id: ${_customer_id} }})`,
                            date_time: db.get_ist_current_date(),
                        }
                        action_logger.info(JSON.stringify(data_to_log));
                    } catch (_) { }

                    return res.status(200).json(success(true, res.statusCode, "Customer delete successfully.", null));
                } else {
                    return res.status(200).json(success(false, res.statusCode, "Unable to delete, Please try again.", null));
                }
            }
            else {
                return res.status(200).json(success(false, res.statusCode, "Apigee response : " + response.statusText, null));
            }
        }
        else {
            const [affectedRows] = await CstCustomer.update(
                {
                    is_deleted: true,
                    modify_date: db.get_ist_current_date(),
                    modify_by: req.token_data.account_id
                },
                { where: { customer_id: _customer_id } }
            );

            if (affectedRows > 0) {
                await CstAppMast.update(
                    { is_deleted: true },
                    { where: { customer_id: _customer_id, is_deleted: false } }
                );

                await CstToken.update(
                    { is_logout: true, logout_time: db.get_ist_current_date() },
                    { where: { customer_id: _customer_id, is_logout: false } }
                );

                try {
                    let data_to_log = {
                        correlation_id: correlator.getId(),
                        token_id: req.token_data.token_id,
                        account_id: req.token_data.account_id,
                        user_type: 1,
                        user_id: req.token_data.admin_id,
                        narration: ' Customer deleted. Customer email = ' + row1.email_id,
                        query: `CstCustomer.update({ is_deleted: true }, { where: { customer_id: ${_customer_id} }})`,
                        date_time: db.get_ist_current_date(),
                    }
                    action_logger.info(JSON.stringify(data_to_log));
                } catch (_) { }

                return res.status(200).json(success(true, res.statusCode, "Customer delete successfully.", null));
            } else {
                return res.status(200).json(success(false, res.statusCode, "Unable to delete, Please try again.", null));
            }
        }
    }
    catch (err) {
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

        let jsonData = JSON.parse(rsa_decrypt(post_data));

        let company_name = jsonData.company_name;
        let first_name = jsonData.first_name;
        let last_name = jsonData.last_name;
        let email_id = jsonData.email_id;
        let network_id = jsonData.network_id;
        let mobile_no = jsonData.mobile_no;
        let segment_id = jsonData.segment_id;
        let industry_id = jsonData.industry_id;
        let user_name = jsonData.user_name;
        let password = jsonData.password;
        // let _captcha_token = ''; if (captcha_token && captcha_token.length > 0) { _captcha_token = captcha_token; }

        // let captcha_valid = false;
        // const captchaUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.CAPTCHA_SECRET}&response=${_captcha_token}`
        // const captchaResp = await fetch(captchaUrl);
        // if (captchaResp && captchaResp.status == true || captchaResp.status == 200) {
        //     captcha_valid = true;
        // }
        // if (!captcha_valid) {
        //     return res.status(200).json(success(false, res.statusCode, "Incorrect captcha.", null));
        // }

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

        const { CstCustomer } = db.models;

        const emailExists = await CstCustomer.findOne({
            where: { email_id: email_id, is_deleted: false },
            attributes: ['customer_id'],
            raw: true
        });
        if (emailExists) {
            return res.status(200).json(success(false, res.statusCode, "Email address is already registered.", null));
        }

        const mobileExists = await CstCustomer.findOne({
            where: { mobile_no: mobile_no, is_deleted: false },
            attributes: ['customer_id'],
            raw: true
        });
        if (mobileExists) {
            return res.status(200).json(success(false, res.statusCode, "Mobile number is already registered.", null));
        }

        let password_hash = await bcrypt.hash(password, 10);

        const newCustomer = await CstCustomer.create({
            company_name: company_name,
            first_name: first_name,
            last_name: last_name,
            email_id: email_id,
            network_id: network_id,
            mobile_no: mobile_no,
            user_name: user_name,
            user_pass: password_hash,
            register_date: db.get_ist_current_date(),
            is_enabled: true,
            is_deleted: false,
            is_approved: 0,
            industry_id: industry_id,
            segment_id: segment_id,
            is_live_sandbox: true,
            added_by: temp_admin_id,
            is_for_sandbox: true,
            is_from_admin: true,
            sandbox_added_date: db.get_ist_current_date()
        });

        const customer_id = newCustomer?.customer_id || 0;
        const unique_id = newCustomer?.unique_id || "";

        if (customer_id > 0) {
            const results = { id: unique_id, };
            // res.setHeader('x-customer-key', unique_id);

            await customer_approve_auto(customer_id);
            await customerService.send_activation_link(customer_id);

            const row15 = await CstCustomer.findOne({
                where: { customer_id: customer_id },
                attributes: ['account_id'],
                raw: true
            });

            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: 'New Sandbox customer registered from admin and activation link sent.',
                    query: `CstCustomer.create({ email_id: '${email_id}' })`,
                    date_time: db.get_ist_current_date(),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }

            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: 0,
                    account_id: row15?.account_id || 0,
                    user_type: 2,
                    user_id: customer_id,
                    narration: 'New Sandbox customer registered and activation link sent.',
                    query: `CstCustomer.create({ email_id: '${email_id}' })`,
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

const customer_credit_add = async (req, res, next) => {
    const { customer_id, credit, transaction_type, description } = req.body;
    try {
        const { CstCustomer, CstCredits } = db.models;
        let _customer_id = customer_id && validator.isNumeric(customer_id.toString()) ? parseInt(customer_id) : 0;
        let _transaction_type = transaction_type && validator.isNumeric(transaction_type.toString()) ? parseInt(transaction_type) : 1; //type credit=1 and debit=2

        if (!credit || credit.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter credit.", null));
        }

        const row0 = await CstCustomer.findOne({
            where: { customer_id: _customer_id, is_deleted: false },
            attributes: ['customer_id', 'total_credits', 'developer_id', 'is_enabled', 'email_id', 'is_live_sandbox'],
            raw: true
        });

        if (!row0) {
            return res.status(200).json(success(false, res.statusCode, "Customer details not found, Please try again.", null));
        }
        if (!row0.is_live_sandbox && row0.is_live_sandbox != true) {
            return res.status(200).json(success(false, res.statusCode, "credit functionality available for only sandbox customer.", null));
        }

        const existingTotalCredits = row0.total_credits;
        let updatedCredits = 0;
        if (_transaction_type == 1) {
            updatedCredits = parseInt(existingTotalCredits) + parseInt(credit);
        } else {
            updatedCredits = parseInt(existingTotalCredits) - parseInt(credit);
        }

        const [affectedRows] = await CstCustomer.update(
            {
                total_credits: updatedCredits,
                modify_date: db.get_ist_current_date(),
                modify_by: req.token_data.account_id
            },
            { where: { customer_id: _customer_id } }
        );

        if (affectedRows > 0) {
            const newCredit = await CstCredits.create({
                customer_id: _customer_id,
                credits: credit,
                added_by: req.token_data.account_id,
                added_date: db.get_ist_current_date(),
                description: description,
                transaction_type: _transaction_type
            });

            const credit_id = newCredit?.credit_id || 0;
            if (credit_id > 0) {
                try {
                    let data_to_log = {
                        correlation_id: correlator.getId(),
                        token_id: 0,
                        account_id: (req.token_data.account_id),
                        user_type: 2,
                        user_id: customer_id,
                        narration: 'credits add & credit add mail sent sent.',
                        query: `CstCredits.create({ customer_id: ${_customer_id}, credits: ${credit} })`,
                    }
                    action_logger.info(JSON.stringify(data_to_log));
                } catch (_) { }
                return res.status(200).json(success(true, res.statusCode, "Credit add succefully.", null));
            } else {
                return res.status(200).json(success(false, res.statusCode, "Unable to add credit, Please try again.", null));
            }
        }
        else {
            return res.status(200).json(success(false, res.statusCode, "Unable to add credit,Please try again.", null));
        }

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
    const { page_no, search_text } = req.body;
    try {
        const { CstCustomer, MobileNetwork, Industry } = db.models;
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0; if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";

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
                    narration: 'Customer live sandbox ' + (row1.is_live_sandbox == true ? 'disabled' : 'enabled') + '. Customer email = ' + row1.email_id,
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

const customer_app_list_get = async (req, res, next) => {
    const { page_no, customer_id } = req.body;
    try {
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0; if (_page_no <= 0) { _page_no = 1; }
        let _customer_id = customer_id && validator.isNumeric(customer_id.toString()) ? parseInt(customer_id) : 0;
        const _query1 = `SELECT customer_id, developer_id, is_enabled, email_id ,first_name, last_name FROM cst_customer WHERE customer_id = ? AND is_deleted = false`;
        const row1 = await db.sequelize.query(_query1, { replacements: [_customer_id], type: QueryTypes.SELECT, });
        if (!row1 || row1.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Customer details not found, Please try again.", null));
        }

        const _query0 = `SELECT count(1) AS total_record FROM cst_app_mast a WHERE a.customer_id = :_customer_id AND a.is_deleted = false `;
        const row0 = await db.sequelize.query(_query0, { replacements: { _customer_id: _customer_id }, type: QueryTypes.SELECT });
        let total_record = 0;
        if (row0 && row0.length > 0) {
            total_record = row0[0].total_record;
        }


        const _query3 = `SELECT ROW_NUMBER() OVER(ORDER BY a.app_id DESC) AS sr_no, a.app_id, a.app_name, a.description, a.expected_volume, a.callback_url, a.ip_addresses, a.certificate_file, a.added_date,
        a.is_approved, a.approved_by, a.approve_date, a.approve_remark, a.is_rejected, a.rejected_by, a.rejected_date, a.reject_remark,a.app_rate_plan,
        a.api_key, a.api_secret, a.key_issued_date, a.key_expiry_date, a.in_live_env, a.is_live_app_created, a.live_app_id, a.display_name,
        a.mkr_is_rejected AS mkr_rejected, a.mkr_rejected_date AS mkr_date, a.mkr_rejected_rmk AS mkr_remark,
        COALESCE((SELECT TRIM(COALESCE(i.first_name, '') || ' ' || COALESCE(i.last_name, '')) FROM adm_user i WHERE i.account_id = a.mkr_rejected_by), '') AS mkr_name,
        a.is_rejected AS chkr_rejected, a.rejected_date AS chkr_date, a.reject_remark AS chkr_remark, 
        COALESCE((SELECT TRIM(COALESCE(i.first_name, '') || ' ' || COALESCE(i.last_name, '')) FROM adm_user i WHERE i.account_id = a.rejected_by), '') AS chkr_name,	
        a.app_wallet_rate_data, a.app_routing_logic_added_by, a.app_routing_logic_added_date    
        FROM cst_app_mast a WHERE a.customer_id = :customer_id AND a.is_deleted = false `;
        // LIMIT :page_size OFFSET ((:page_no - 1) * :page_size)
        const row4 = await db.sequelize.query(_query3, {
            replacements: {
                customer_id: _customer_id,
                page_size: process.env.PAGINATION_SIZE,
                page_no: _page_no
            }, type: QueryTypes.SELECT
        });

        let my_apps = [];
        if (row4) {
            for (const app of row4) {
                const _app_id = app.app_id;
                const _is_approved = app.is_approved;

                let api_key = ""; let api_secret = "";
                if (_is_approved == true) {
                    api_key = app.api_key; api_secret = app.api_secret;
                }
                const _query2 = `SELECT p.product_id, p.product_name,p.description, p.key_features FROM product p 
            INNER JOIN cst_app_product m ON p.product_id = m.product_id WHERE m.app_id = ? `;
                const row2 = await db.sequelize.query(_query2, { replacements: [_app_id], type: QueryTypes.SELECT });
                let products = [];
                let proxies = [];
                if (row1) {
                    for (const pr of row2) {
                        products.push({
                            product_id: pr.product_id,
                            product_name: pr.product_name,
                            description: pr.description,
                            key_features: pr.key_features,
                        });

                        const _query1 = `SELECT proxy_id, proxy_name, display_name, product_id FROM proxies  WHERE product_id = ? AND is_deleted = false AND is_published=true  ORDER BY proxy_id DESC`;
                        const row1 = await db.sequelize.query(_query1, { replacements: [pr.product_id], type: QueryTypes.SELECT });
                        if (row1) {
                            for (const item of row1) {
                                proxies.push({
                                    product_id: item.product_id,
                                    proxy_id: item.proxy_id,
                                    proxy_name: item.display_name && item.display_name.length > 0 ? item.display_name : item.proxy_name,
                                    display_name: item.display_name,
                                });
                            }
                        }
                    }
                }
                my_apps.push({
                    sr_no: app.sr_no,
                    app_id: app.app_id,
                    app_name: app.app_name,
                    display_name: app.display_name,
                    description: app.description,
                    expected_volume: app.expected_volume,
                    callback_url: app.callback_url,
                    ip_addresses: app.ip_addresses,
                    added_date: app.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(app.added_date)) : "",
                    is_approved: app.is_approved,
                    approved_by: app.approved_by,
                    approve_date: app.approve_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(app.approve_date)) : "",
                    approve_remark: app.approve_remark,
                    is_rejected: app.is_rejected,
                    rejected_by: app.rejected_by,
                    rejected_date: app.rejected_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(app.rejected_date)) : "",
                    reject_remark: app.reject_remark,
                    api_key: api_key,
                    api_secret: api_secret,
                    key_issued_date: app.key_issued_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(app.key_issued_date)) : "",
                    key_expiry_date: app.key_expiry_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(app.key_expiry_date)) : "",
                    in_live_env: app.in_live_env,
                    is_live_app_created: app.is_live_app_created,
                    live_app_id: app.live_app_id,

                    mkr_rejected: app.mkr_rejected,
                    mkr_date: app.mkr_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(app.mkr_date)) : "",
                    mkr_remark: app.mkr_remark,
                    // mkr_name: app.mkr_name,
                    app_rate_plan: app.app_rate_plan,
                    app_wallet_rate_data: app.app_wallet_rate_data,
                    app_routing_logic_added_by: app.app_routing_logic_added_by,
                    app_routing_logic_added_date: app.app_routing_logic_added_date,
                    products: products,
                    proxies: proxies,
                });
            }
        }

        const results = {
            customer: {
                id: row1[0].customer_id,
                email_id: row1[0].email_id,
                first_name: row1[0].first_name,
                last_name: row1[0].last_name,
            },
            live_app: my_apps.filter(function (el) { return el.in_live_env == true; }),
            uat_app: my_apps.filter(function (el) { return el.in_live_env == false; }),
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
        let _customer_id = customer_id && validator.isNumeric(customer_id.toString()) ? parseInt(customer_id) : 0;
        let _search_text = search_text && search_text.length > 0 ? search_text : "";
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0;
        let _type = type && validator.isNumeric(type.toString()) ? parseInt(type) : 0;// 1 = prod and 2 = UAT
        let developerId = '';
        let role_name = '';
        const _qry20 = `SELECT a.role_id, r.role_name, r.is_editable, r.checker_maker FROM adm_user a INNER JOIN adm_role r ON a.role_id = r.role_id WHERE a.admin_id = ?`;
        const _rw20 = await db.sequelize.query(_qry20, { replacements: [req.token_data.admin_id], type: QueryTypes.SELECT });
        if (_rw20 && _rw20.length > 0) {
            role_name = _rw20[0].role_name;
        }
        let row2 = '';
        if (_customer_id > 0) {
            const _query2 = `SELECT customer_id, developer_id, first_name, last_name, email_id FROM cst_customer WHERE  customer_id = ? AND is_deleted = false`;
            row2 = await db.sequelize.query(_query2, { replacements: [_customer_id], type: QueryTypes.SELECT, });
            if (row2 || row2.length > 0) {
                developerId = row2[0].developer_id;
            }
        }
        let previousfrom_Date = '';
        console.log("------productname--------------------", product_id);
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
        console.log("------developerId-------------------", developerId);
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
        const pageSize = 10000; // Set your desired page size

        if (_page_no <= 0) { _page_no = 1; } if (_type <= 0) { _type = 1; }
        const table_name = _type == 1 ? 'apigee_logs_prod' : 'apigee_logs';
        console.log("------s-table_name-------------------", table_name);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="customer_analytics_reports_data.xlsx"');

        const stream = new PassThrough();
        const workbook = new excel.stream.xlsx.WorkbookWriter({ stream });
        const worksheet = workbook.addWorksheet('Sheet 1');

        if (role_name === 'Administrator') { // for administrator roles 
            const headers = [
                'Sr No',
                'Developer',
                'Developer Email',
                'API Product',
                'Target URL',
                'Target Host',
                'Target Response Code',
                'DC API Name',
                'DC API Product',
                'DC API Request ID',
                'DC Case ID',
                'DC Req Path',
                'Developer App',
                'Request Path',
                'Total Response Time',
                'Request Processing Latency',
                'Response Processing Latency',
                'Karza Status Code',
                'Response Description',
                'ID Field from Signzy Response',
                'Response Status Code',
                'Target Response Time',
                'Client Received End Timestamp',
                'Target Sent End Timestamp',
                'Target Received End Timestamp',
                'Client Sent End Timestamp',
                'Client Received End Timestamp (IST)',
                'Target Sent End Timestamp (IST)',
                'Target Received End Timestamp (IST)',
                'Client Sent End Timestamp (IST)',

            ];
            worksheet.addRow(headers).commit();
        } else {
            const headers = [
                'Sr No',
                'Developer',
                'Developer Email',
                'API Product',
                'DC API Name',
                'Request URI',
                'Target Response Code',
                'Total Response Time',
                'DC Case ID',
                'Response Status Code',
                'Target Response Time',
                'Target Sent Start Timestamp',
                'Target Received End Timestamp',
                'Target Sent Start Timestamp (IST)',
                'Target Received End Timestamp (IST)',
            ];
            worksheet.addRow(headers).commit();
        }

        stream.pipe(res);

        while (hasMoreData) {
            let _query3 = `SELECT ROW_NUMBER() OVER(ORDER BY id DESC) AS sr_no, 
        id, organization, environment, apiproxy, request_uri, proxy, proxy_basepath, request_size, response_status_code,
        is_error, client_received_start_timestamp, client_received_end_timestamp, target_sent_start_timestamp, target_sent_end_timestamp, 
        target_received_start_timestamp, target_received_end_timestamp, client_sent_start_timestamp, client_sent_end_timestamp, client_ip, 
        client_id, REPLACE(developer, 'apigeeprotean@@@', '') AS developer, developer_app, api_product, flow_resource, target, target_url, 
        target_host, proxy_client_ip, target_basepath, target_ip, request_path, response_size, developer_email, virtual_host, message_count, 
        total_response_time, request_processing_latency, response_processing_latency, target_response_time, 
        target_response_code, target_error, policy_error, ax_created_time, dc_api_product, dc_api_resource, 
        dc_developer_app, dc_developer_app_display_name, dc_developer_email, dc_flow_type, dc_response_code_gateway,
        dc_api_name, dc_api_request_id, dc_case_id, dc_req_path, 
        dc_target_req_path FROM ${table_name}`;
            const conditions = [];
            const replacements = {
                page_size: pageSize,
                page_no: currentPage,
            };
            console.log("--------------------------", developerId);
            if (developerId && developerId.length > 0) {
                conditions.push(` REPLACE(developer, 'apigeeprotean@@@', '') = :developerId`);
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

            _query3 += ` LIMIT :page_size OFFSET ((:page_no - 1) * :page_size)`;

            const pageData = await db.sequelize2.query(_query3, { replacements, type: QueryTypes.SELECT, raw: true });

            if (pageData && pageData.length > 0) {
                const processData = role_name === 'Administrator'
                    ? pageData.map(row => {
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
                    })
                    : pageData.map(row => {
                        return [
                            row.sr_no, row.developer, row.developer_email, row.api_product, row.dc_api_name, row.request_uri,
                            row.target_response_code, row.total_response_time, row.dc_case_id, row.response_status_code,
                            row.target_response_time, row.target_sent_start_timestamp, row.target_received_end_timestamp,
                            db.convertUTCtoIST(row.target_sent_start_timestamp), db.convertUTCtoIST(row.target_received_end_timestamp)
                        ];
                    });

                processData.forEach(rowData => {
                    try {
                        worksheet.addRow(rowData).commit();
                    } catch (err) {
                        console.log("Error adding row to worksheet:", err);
                    }
                });

                currentPage++;
            } else {
                hasMoreData = false;
            }
        }

        await workbook.commit();
        stream.end();

    } catch (err) {
        _logger.error(err.stack);
        console.log("----------err.stack---------------", err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const analytics_reports_generate_excel = async (req, res, next) => {
    const { page_no, customer_id, search_text, product_id, from_date, upto_date, type } = req.body;
    try {
        let _customer_id = customer_id && validator.isNumeric(customer_id.toString()) ? parseInt(customer_id) : 0;
        let _search_text = search_text && search_text.length > 0 ? search_text : "";
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0;
        let _type = type && validator.isNumeric(type.toString()) ? parseInt(type) : 0;// 1 = prod and 2 = UAT
        let total_record = 0;
        let developerId = '';
        let email_id = '';
        let role_name = '';
        const _qry20 = `SELECT a.role_id, r.role_name, r.is_editable, r.checker_maker FROM adm_user a INNER JOIN adm_role r ON a.role_id = r.role_id WHERE a.admin_id = ?`;
        const _rw20 = await db.sequelize.query(_qry20, { replacements: [req.token_data.admin_id], type: QueryTypes.SELECT });
        if (_rw20 && _rw20.length > 0) {
            role_name = _rw20[0].role_name;
        }
        let row2 = '';
        if (_customer_id > 0) {
            const _query2 = `SELECT customer_id, developer_id, first_name, last_name, email_id FROM cst_customer WHERE  customer_id = ? AND is_deleted = false`;
            row2 = await db.sequelize.query(_query2, { replacements: [_customer_id], type: QueryTypes.SELECT, });
            if (row2 || row2.length > 0) {
                developerId = row2[0].developer_id;
                email_id = row2[0].email_id;
            }
        }
        let previousfrom_Date = '';
        console.log("------productname--------------------", product_id);
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
                    user_type: 2,
                    user_id: req.token_data.account_id,
                    narration: 'excel genrate with requestid:' + requestId,
                    query: db.buildQuery_Array(_query1, _replacements2),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to insert request id, Please try again.", null));
        }


        const filePath = path.join(__dirname, `../../uploads/download_excel/${requestId}.xlsx`);

        // Ensure the directory exists
        await fs.ensureDir(path.join(__dirname, '../../uploads/download_excel'));

        console.log("==============filePath=======================", filePath);
        generateExcelFile(req, filePath, requestId, _type, role_name, developerId, _from_date, _upto_date, email_id);
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

const generateExcelFile = async (req, filePath, requestId, _type, role_name, developerId, _from_date, _upto_date, email_id) => {
    const { customer_id, search_text, product_id, from_date, upto_date } = req.body;
    try {
        let _customer_id = customer_id && validator.isNumeric(customer_id.toString()) ? parseInt(customer_id) : 0;
        let _search_text = search_text && search_text.length > 0 ? search_text : "";
        const workbook = new excel.stream.xlsx.WorkbookWriter({ filename: filePath });
        let worksheet = workbook.addWorksheet('Sheet 1');
        let currentPage = 1;
        let hasMoreData = true;
        const pageSize = 20000;
        const table_name = _type == 1 ? 'apigee_logs_prod' : 'apigee_logs';
        const maxRowsPerSheet = 1048576; // Excel row limit per sheet
        let sheetIndex = 1;
        let currentRow = 0;
        console.log("----------_customer_id----------------", _customer_id);
        const addHeaders = (worksheet) => {
            const headers = role_name === 'Administrator' ? [
                'Sr No', 'Developer', 'Developer Email', 'API Product', 'Target URL', 'Target Host', 'Target Response Code',
                'DC API Name', 'DC API Product', 'DC API Request ID', 'DC Case ID', 'DC Req Path', 'Developer App', 'Request Path',
                'Total Response Time', 'Request Processing Latency', 'Response Processing Latency', 'Karza Status Code',
                'Response Description', 'ID Field from Signzy Response', 'Response Status Code', ' Price Multiplier',
                'Final Rate', 'Rate Plan Rate', 'Billing Type', 'Target Response Time',
                'Client Received End Timestamp', 'Target Sent End Timestamp', 'Target Received End Timestamp',
                'Client Sent End Timestamp', 'Client Received End Timestamp (IST)', 'Target Sent End Timestamp (IST)',
                'Target Received End Timestamp (IST)', 'Client Sent End Timestamp (IST)'
            ] : [
                'Sr No', 'Developer', 'Developer Email', 'API Product', 'Target Host', 'Target Response Code', 'DC API Name',
                'DC API Product', 'DC Case ID', 'Request Path', 'Total Response Time', 'Karza Status Code', 'Response Description',
                'ID Field from Signzy Response', 'Response Status Code', ' Price Multiplier', 'Final Rate', 'Rate Plan Rate', 'Billing Type', 'Target Response Time', 'Client Received End Timestamp',
                'Target Sent End Timestamp', 'Target Received End Timestamp', 'Client Sent End Timestamp',
                'Client Received End Timestamp (IST)', 'Target Sent End Timestamp (IST)', 'Target Received End Timestamp (IST)',
                'Client Sent End Timestamp (IST)'
            ];
            worksheet.addRow(headers).commit();
        };
        addHeaders(worksheet);
        while (hasMoreData) {
            let _query3 = `SELECT ROW_NUMBER() OVER(ORDER BY ax_created_time DESC) AS sr_no, 
        id, organization, environment, apiproxy, request_uri, proxy, response_status_code,
        is_error, client_received_start_timestamp, client_received_end_timestamp, target_sent_start_timestamp, target_sent_end_timestamp, 
        target_received_start_timestamp, target_received_end_timestamp, client_sent_start_timestamp, client_sent_end_timestamp, client_ip, 
        client_id, REPLACE(developer, 'apigeeprotean@@@', '') AS developer, developer_app, api_product, target, target_url, 
        target_host, proxy_client_ip, target_basepath, target_ip, request_path, developer_email, total_response_time, request_processing_latency,
        response_processing_latency, target_response_time, target_response_code, ax_created_time, dc_api_product, dc_api_resource, 
        dc_developer_app, dc_developer_app_display_name, dc_developer_email, dc_api_name, dc_api_request_id, dc_case_id, 
        dc_req_path, dc_karzastauscode AS karza_status_code, dc_backendstatusreason AS response_description,
        dc_signzyresponseid AS id_field_from_signzy_response, x_apigee_mintng_price_multiplier, x_apigee_mintng_rate,
	    x_apigee_mintng_rate::FLOAT / NULLIF(x_apigee_mintng_price_multiplier::FLOAT, 0) AS rate_plan_rate, dc_billing_type FROM ${table_name}`;
            const conditions = [];
            const replacements = {
                page_size: pageSize,
                page_no: currentPage,
            };
            console.log("--------------------------", developerId);
            // if (developerId && developerId.length > 0) {
            //     conditions.push(` REPLACE(developer, 'apigeeprotean@@@', '') = :developerId`);
            //     replacements.developerId = developerId;
            // }

            if (email_id && email_id.length > 0) {
                conditions.push(` developer_email = :email_id`);
                replacements.email_id = email_id;
            }
            if (_search_text && _search_text.length > 0) {
                conditions.push(` target_host ILIKE :search_text`);
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
                    let rowData;

                    if (currentRow >= maxRowsPerSheet) {
                        worksheet.commit(); // Finalize the current sheet
                        sheetIndex++;
                        worksheet = workbook.addWorksheet(`Sheet ${sheetIndex}`);
                        addHeaders(worksheet);
                        currentRow = 0; // Reset the row counter for the new sheet
                    }
                    if (role_name === 'Administrator') {
                        rowData = [
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

                    } else {
                        rowData = [
                            row.sr_no, row.developer, row.developer_email, row.api_product, row.target_host,
                            row.target_response_code, row.dc_api_name, row.dc_api_product, row.dc_case_id,
                            row.request_path, row.total_response_time, row.karza_status_code || '', row.response_description || '',
                            row.id_field_from_signzy_response || '', row.response_status_code, '',
                            '', '', row.dc_billing_type, row.target_response_time,
                            row.client_received_end_timestamp, row.target_sent_end_timestamp, row.target_received_end_timestamp,
                            row.client_sent_end_timestamp, db.convertUTCtoIST(row.client_received_end_timestamp),
                            db.convertUTCtoIST(row.target_sent_end_timestamp), db.convertUTCtoIST(row.target_received_end_timestamp),
                            db.convertUTCtoIST(row.client_sent_end_timestamp),
                        ];
                    }
                    try {
                        worksheet.addRow(rowData).commit();
                        currentRow++;
                    } catch (err) {
                        console.log("Error adding row to worksheet:", err);
                    }
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
        let _customer_id = customer_id && validator.isNumeric(customer_id.toString()) ? parseInt(customer_id) : 0;

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
        const billing_type = row1.billing_type && row1.billing_type === 'PREPAID' ? 'POSTPAID' : 'PREPAID';
        if (row1.email_id && row1.email_id.length > 0) {
            const email_id = row1.email_id;
            const Billing_type_data = { "billingType": billing_type }
            const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers/${email_id}/monetizationConfig`;
            const apigeeAuth = await db.get_apigee_token();
            const response = await fetch(product_URL, {
                method: "PUT",
                headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json", },
                body: JSON.stringify(Billing_type_data),
            });
            console.log("======response==========", response);

            if (response.status != 204) {
                const [affectedRows] = await CstCustomer.update(
                    {
                        billing_type: billing_type,
                        billing_type_modified_date: db.get_ist_current_date(),
                        billing_type_modify_by: req.token_data.account_id
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
                            narration: 'Customer Billing Type Modified ' + billing_type + '. Customer email = ' + row1.email_id,
                            query: `CstCustomer.update({ billing_type: '${billing_type}' }, { where: { customer_id: ${_customer_id} }})`,
                            date_time: db.get_ist_current_date(),
                        }
                        action_logger.info(JSON.stringify(data_to_log));
                    } catch (_) { }
                    return res.status(200).json(success(true, res.statusCode, "Customer Billing Type status changed successfully.", null));
                } else {
                    return res.status(200).json(success(false, res.statusCode, "Unable to change, Please try again.", null));
                }
            }
        }

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
