import { logger as _logger, action_logger } from "../../logger/winston.js";
import db from "../../database/db_helper.js";
import { success } from "../../model/responseModel.js";
import { Op } from "sequelize";
import dateFormat from "date-format";
import validator from "validator";
import { fetch } from 'cross-fetch';
import correlator from 'express-correlation-id';
import { API_STATUS } from "../../model/enumModel.js";
import { v4 as uuidv4 } from 'uuid';
import commonModule from "../../modules/commonModule.js";
const wallet_balance_add = async (req, res, next) => {
    const { customer_id, wallets_amount, transaction_type, description } = req.body;
    const { CstCustomer, CstWallets, CstWalletsChecker } = db.models;
    try {
        let _customer_id = customer_id && validator.isNumeric(customer_id.toString()) ? parseInt(customer_id) : 0;
        let _transaction_type = transaction_type && validator.isNumeric(transaction_type.toString()) ? parseInt(transaction_type) : 0;

        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);
        console.log(is_admin, is_checker, is_maker);

        if (is_checker) {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have authority.", null));
        }

        const row0 = await CstCustomer.findOne({
            where: {
                customer_id: _customer_id,
                is_deleted: false
            },
            attributes: ['customer_id', 'wallets_amount', 'wallets_amt_updated_date', 'developer_id', 'is_enabled', 'email_id', 'is_live_sandbox']
        });

        if (!row0) {
            return res.status(200).json(success(false, res.statusCode, "Customer details not found, Please try again.", null));
        }
        const existingTotalBalance = parseFloat(row0.wallets_amount);
        if (is_admin) {
            if (_transaction_type == 1) {//credit
                let data = await admin_add_apigee_wallet_balance(_customer_id, parseFloat(wallets_amount));
                console.log("=======data==========", JSON.stringify(data));
                if (data?.wallets?.length > 0) {
                    const units = parseFloat(data?.wallets?.[0]?.balance?.units ?? 0);
                    const nanos = parseFloat(data?.wallets?.[0]?.balance?.nanos ?? 0) / 1e9;
                    const balance = units + nanos;

                    await CstCustomer.update(
                        {
                            wallets_amount: balance,
                            wallets_amt_updated_date: db.get_ist_current_date()
                        },
                        {
                            where: { customer_id: _customer_id }
                        }
                    );

                    const newWallet = await CstWallets.create({
                        customer_id: _customer_id,
                        amount: parseFloat(wallets_amount),
                        added_date: db.get_ist_current_date(),
                        description: description,
                        transaction_type: _transaction_type,
                        previous_amount: existingTotalBalance
                    });

                    const _new_wallet_id = newWallet?.wallet_id ?? 0;
                    if (_new_wallet_id > 0) {
                        await CstWalletsChecker.create({
                            customer_id: _customer_id,
                            amount: parseFloat(wallets_amount),
                            description: description,
                            transaction_type: _transaction_type,
                            previous_amount: existingTotalBalance,
                            added_date: db.get_ist_current_date(),
                            added_by: req.token_data.account_id,
                            is_wallet_amount_approved: true,
                            ckr_wallet_amount_approved_by: req.token_data.account_id,
                            ckr_wallet_amount_approved_date: db.get_ist_current_date()
                        });

                        try {
                            let data_to_log = {
                                correlation_id: correlator.getId(),
                                token_id: 0,
                                account_id: (req.token_data.account_id),
                                user_type: 2,
                                user_id: customer_id,
                                narration: 'wallets balance history added',
                                query: JSON.stringify({
                                    customer_id: _customer_id,
                                    amount: parseFloat(wallets_amount),
                                    transaction_type: _transaction_type
                                }),
                            }
                            action_logger.info(JSON.stringify(data_to_log));
                        } catch (_) { }
                        return res.status(200).json(success(true, res.statusCode, "Update successfully.", null));
                    }
                } const apigeeError = data?.error;
                if (apigeeError?.status === 'ABORTED' && apigeeError?.code === 409) {
                    return res.status(200).json(success(false, res.statusCode, `Apigee response : ${apigeeError.message}`, null));
                }

                if (apigeeError?.message?.length > 0) {
                    return res.status(200).json(success(false, res.statusCode, `Apigee response : ${apigeeError.message}`, null));
                }
                return res.status(200).json(success(false, res.statusCode, "Unable to Add Product Monetization Rate, Please try again.", null));

            } else {
                console.log("------------debitedtype-----------");
                const email_id = row0.email_id;
                const WalletGet_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers/${email_id}/balance`;
                const apigeeAuth = await db.get_apigee_token();
                const response = await fetch(WalletGet_URL, {
                    method: "GET",
                    headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json", },
                });
                const responseData = await response.json();
                if (responseData?.wallets?.length > 0) {
                    const units = parseFloat(responseData.wallets[0]?.balance?.units || 0);
                    const nanos = parseFloat(responseData.wallets[0]?.balance?.nanos || 0) / 1e9;
                    const available_balance = units + nanos;
                    const local_balance = parseFloat(wallets_amount || 0);
                    if (local_balance > available_balance) {
                        return res.status(200).json({ success: false, statusCode: res.statusCode, message: 'Debited Balance should not be greater than available balance', data: null });
                    }
                }
                let data = await admin_debited_apigee_wallet_balance(_customer_id, parseFloat(wallets_amount));
                console.log("=======data==========", JSON.stringify(data));
                if (data && data.wallets && data.wallets.length > 0) {
                    const units = parseFloat(data.wallets[0]?.balance?.units);
                    const nanos = parseFloat(data.wallets[0]?.balance?.nanos || 0) / 1e9;
                    const balance = units + nanos;

                    await CstCustomer.update(
                        {
                            wallets_amount: balance,
                            wallets_amt_updated_date: db.get_ist_current_date()
                        },
                        {
                            where: { customer_id: _customer_id }
                        }
                    );

                    const newWallet = await CstWallets.create({
                        customer_id: _customer_id,
                        amount: parseFloat(wallets_amount),
                        added_date: db.get_ist_current_date(),
                        description: description,
                        transaction_type: _transaction_type,
                        previous_amount: existingTotalBalance
                    });

                    const _new_wallet_id = newWallet?.wallet_id ?? 0;
                    if (_new_wallet_id > 0) {
                        console.log("------------debited-----------");
                        await CstWalletsChecker.create({
                            customer_id: _customer_id,
                            amount: parseFloat(wallets_amount),
                            description: description,
                            transaction_type: _transaction_type,
                            previous_amount: existingTotalBalance,
                            added_date: db.get_ist_current_date(),
                            added_by: req.token_data.account_id,
                            is_wallet_amount_approved: true,
                            ckr_wallet_amount_approved_by: req.token_data.account_id,
                            ckr_wallet_amount_approved_date: db.get_ist_current_date()
                        });
                        console.log("-----------------------");
                        try {
                            let data_to_log = {
                                correlation_id: correlator.getId(),
                                token_id: 0,
                                account_id: (req.token_data.account_id),
                                user_type: 2,
                                user_id: customer_id,
                                narration: 'wallets balance history added',
                                query: JSON.stringify({
                                    customer_id: _customer_id,
                                    amount: parseFloat(wallets_amount),
                                    transaction_type: _transaction_type
                                }),
                            }
                            action_logger.info(JSON.stringify(data_to_log));
                        } catch (_) { }
                        return res.status(200).json(success(true, res.statusCode, "Update successfully.", null));
                    }
                }
                const apigeeError = data?.error;
                if (apigeeError?.status === 'ABORTED' && apigeeError?.code === 409) {
                    return res.status(200).json(success(false, res.statusCode, `Apigee response : ${apigeeError.message}`, null));
                }

                if (apigeeError?.message?.length > 0) {
                    return res.status(200).json(success(false, res.statusCode, `Apigee response : ${apigeeError.message}`, null));
                }
                return res.status(200).json(success(false, res.statusCode, "Unable to Add Product Monetization Rate, Please try again.", null));

            }
        } else {
            const newWalletsChecker = await CstWalletsChecker.create({
                customer_id: _customer_id,
                amount: parseFloat(wallets_amount),
                description: description,
                transaction_type: _transaction_type,
                previous_amount: existingTotalBalance,
                added_date: db.get_ist_current_date(),
                added_by: req.token_data.account_id
            });

            const cust_wallet_id = newWalletsChecker?.cust_wallet_id ?? 0;
            if (cust_wallet_id > 0) {
                try {
                    let data_to_log = {
                        correlation_id: correlator.getId(),
                        token_id: req.token_data.token_id,
                        account_id: req.token_data.account_id,
                        user_type: 1,
                        user_id: req.token_data.admin_id,
                        narration: 'Wallet amount addded customer Email = ' + row0.email_id,
                        query: JSON.stringify({
                            customer_id: _customer_id,
                            amount: parseFloat(wallets_amount),
                            transaction_type: _transaction_type
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

const wallet_balance_pending_list = async (req, res, next) => {
    const { page_no, search_text } = req.body;
    try {
        const { CstWalletsChecker, CstCustomer, AdmUser } = db.models;

        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0;
        if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";

        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);

        if (is_maker || is_checker || is_admin) {
            const offset = (_page_no - 1) * process.env.PAGINATION_SIZE;

            // Build where clause for pending items
            const whereClause = {
                is_deleted: false,
                is_wallet_amount_approved: false,
                ckr_wallet_amount_is_approved: false,
                ckr_wallet_amount_is_rejected: false,
                is_wallet_amount_rejected: false
            };

            // Get total count
            const total_record = await CstWalletsChecker.count({ where: whereClause });

            // Get paginated list with associations
            const rows = await CstWalletsChecker.findAll({
                where: whereClause,
                include: [
                    {
                        model: CstCustomer,
                        as: 'customer',
                        where: {
                            is_deleted: false,
                            ..._search_text && {
                                first_name: { [Op.iLike]: `${_search_text}%` }
                            }
                        },
                        attributes: ['customer_id', 'first_name', 'last_name', 'email_id'],
                        required: true
                    },
                    {
                        model: AdmUser,
                        as: 'addedByUser',
                        attributes: ['first_name', 'last_name'],
                        required: false
                    }
                ],
                order: [['cust_wallet_id', 'DESC']],
                limit: process.env.PAGINATION_SIZE,
                offset: offset
            });

            const list = rows.map((item, index) => ({
                sr_no: offset + index + 1,
                cust_wallet_id: item.cust_wallet_id,
                customer_id: item.customer?.customer_id,
                full_name: item.customer ? `${item.customer.first_name || ''} ${item.customer.last_name || ''}`.trim() : '',
                amount: item.amount,
                description: item.description,
                transaction_type: item.transaction_type == 1 ? "Credited" : "Debited",
                previous_amount: item.previous_amount,
                email_id: item.customer?.email_id || '',
                added_date: item.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.added_date)) : "",
                mkr_name: item.addedByUser ? `${item.addedByUser.first_name || ''} ${item.addedByUser.last_name || ''}`.trim() : '',
            }));

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

const wallet_balance_approve_list = async (req, res, next) => {
    const { page_no, search_text } = req.body;
    try {
        const { CstWalletsChecker, CstCustomer, AdmUser } = db.models;

        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0;
        if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";

        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);

        if (is_maker || is_checker || is_admin) {
            const offset = (_page_no - 1) * process.env.PAGINATION_SIZE;

            // Build where clause for approved items
            const whereClause = {
                is_deleted: false,
                [Op.or]: [
                    { ckr_wallet_amount_is_approved: true },
                    { is_wallet_amount_approved: true }
                ],
                ckr_wallet_amount_is_rejected: false,
                is_wallet_amount_rejected: false
            };

            // Get total count
            const total_record = await CstWalletsChecker.count({ where: whereClause });

            // Get paginated list with associations
            const rows = await CstWalletsChecker.findAll({
                where: whereClause,
                include: [
                    {
                        model: CstCustomer,
                        as: 'customer',
                        where: {
                            is_deleted: false,
                            ..._search_text && {
                                first_name: { [Op.iLike]: `%${_search_text}%` }
                            }
                        },
                        attributes: ['customer_id', 'first_name', 'last_name', 'email_id'],
                        required: true
                    },
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
                order: [['cust_wallet_id', 'DESC']],
                limit: process.env.PAGINATION_SIZE,
                offset: offset
            });

            const list = rows.map((item, index) => ({
                sr_no: offset + index + 1,
                cust_wallet_id: item.cust_wallet_id,
                customer_id: item.customer?.customer_id,
                full_name: item.customer ? `${item.customer.first_name || ''} ${item.customer.last_name || ''}`.trim() : '',
                amount: item.amount,
                description: item.description,
                transaction_type: item.transaction_type == 1 ? "Credited" : "Debited",
                previous_amount: item.previous_amount,
                email_id: item.customer?.email_id || '',
                added_date: item.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.added_date)) : "",
                ckr_full_name: item.approvedByUser ? `${item.approvedByUser.first_name || ''} ${item.approvedByUser.last_name || ''}`.trim() : '',
                mkr_name: item.addedByUser ? `${item.addedByUser.first_name || ''} ${item.addedByUser.last_name || ''}`.trim() : '',
                ckr_approved: item.ckr_wallet_amount_is_approved,
                ckr_approve_date: item.ckr_wallet_amount_approved_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.ckr_wallet_amount_approved_date)) : "",
                ckr_remark: item.ckr_wallet_amount_approved_rmk,
            }));

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

const wallet_balance_rejected_list = async (req, res, next) => {
    const { page_no, search_text } = req.body;
    try {
        const { CstWalletsChecker, CstCustomer, AdmUser } = db.models;

        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0;
        if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";

        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);

        if (is_maker || is_checker || is_admin) {
            const offset = (_page_no - 1) * process.env.PAGINATION_SIZE;

            // Build where clause for rejected items
            const whereClause = {
                is_deleted: false,
                [Op.or]: [
                    { ckr_wallet_amount_is_rejected: true },
                    { is_wallet_amount_rejected: true }
                ],
                ckr_wallet_amount_is_approved: false,
                is_wallet_amount_approved: false
            };

            // Get total count
            const total_record = await CstWalletsChecker.count({ where: whereClause });

            // Get paginated list with associations
            const rows = await CstWalletsChecker.findAll({
                where: whereClause,
                include: [
                    {
                        model: CstCustomer,
                        as: 'customer',
                        where: {
                            is_deleted: false,
                            ..._search_text && {
                                first_name: { [Op.iLike]: `${_search_text}%` }
                            }
                        },
                        attributes: ['customer_id', 'first_name', 'last_name', 'email_id'],
                        required: true
                    },
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
                order: [['cust_wallet_id', 'DESC']],
                limit: process.env.PAGINATION_SIZE,
                offset: offset
            });

            const list = rows.map((item, index) => ({
                sr_no: offset + index + 1,
                cust_wallet_id: item.cust_wallet_id,
                customer_id: item.customer?.customer_id,
                full_name: item.customer ? `${item.customer.first_name || ''} ${item.customer.last_name || ''}`.trim() : '',
                amount: item.amount,
                description: item.description,
                transaction_type: item.transaction_type == 1 ? "Credited" : "Debited",
                previous_amount: item.previous_amount,
                email_id: item.customer?.email_id || '',
                added_date: item.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.added_date)) : "",
                ckr_full_name: item.rejectedByUser ? `${item.rejectedByUser.first_name || ''} ${item.rejectedByUser.last_name || ''}`.trim() : '',
                mkr_name: item.addedByUser ? `${item.addedByUser.first_name || ''} ${item.addedByUser.last_name || ''}`.trim() : '',
                rejected_date: item.ckr_wallet_amount_rejected_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.ckr_wallet_amount_rejected_date)) : "",
                ckr_remark: item.ckr_wallet_amount_rejected_rmk,
            }));

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

const wallet_balance_reject = async (req, res, next) => {
    const { cust_wallet_id, customer_id, remark } = req.body;
    const { CstCustomer, CstWalletsChecker } = db.models;
    try {
        let _cust_wallet_id = cust_wallet_id && validator.isNumeric(cust_wallet_id.toString()) ? parseInt(cust_wallet_id) : 0;
        let _customer_id = customer_id && validator.isNumeric(customer_id.toString()) ? parseInt(customer_id) : 0;
        if (!remark || remark.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter remark.", null));
        }
        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);
        console.log(is_admin, is_checker, is_maker);
        if (is_admin || is_checker) {
            const record = await CstWalletsChecker.findOne({
                where: {
                    cust_wallet_id: _cust_wallet_id,
                    customer_id: _customer_id,
                    is_deleted: false
                },
                include: [{
                    model: CstCustomer,
                    as: 'customer',
                    where: { is_deleted: false },
                    attributes: ['email_id']
                }],
                attributes: ['cust_wallet_id', 'amount', 'added_date', 'description', 'transaction_type', 'previous_amount', 'is_wallet_amount_rejected', 'ckr_wallet_amount_is_rejected', 'is_wallet_amount_approved', 'ckr_wallet_amount_is_approved']
            });

            if (!record) {
                return res.status(200).json(success(false, res.statusCode, "Wallet Amount details not found.", null));
            }

            if (record.is_wallet_amount_rejected || record.ckr_wallet_amount_is_rejected) {
                return res.status(200).json(success(false, res.statusCode, "Wallet Amount is already rejected.", null));
            }

            if (record.is_wallet_amount_approved || record.ckr_wallet_amount_is_approved) {
                return res.status(200).json(success(false, res.statusCode, "Wallet Amount is approved, cannot reject", null));
            }

            const [affectedRows] = await CstWalletsChecker.update(
                {
                    ckr_wallet_amount_is_rejected: true,
                    ckr_wallet_amount_rejected_by: req.token_data.account_id,
                    ckr_wallet_amount_rejected_date: db.get_ist_current_date(),
                    ckr_wallet_amount_rejected_rmk: remark
                },
                {
                    where: {
                        cust_wallet_id: _cust_wallet_id,
                        customer_id: _customer_id
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
                        narration: ' Wallet Amount  rejected by ' + (is_admin ? 'admin' : 'checker') + '. Customer Email = ' + record.customer.email_id,
                        query: JSON.stringify({
                            cust_wallet_id: _cust_wallet_id,
                            customer_id: _customer_id,
                            rejected_by: req.token_data.account_id
                        }),
                    }
                    action_logger.info(JSON.stringify(data_to_log));
                } catch (_) {
                }
                return res.status(200).json(success(true, res.statusCode, "Wallet Amount rejected successfully.", null));
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

const wallet_balance_approve = async (req, res, next) => {
    const { cust_wallet_id, customer_id, remark } = req.body;
    const { CstCustomer, CstWallets, CstWalletsChecker } = db.models;
    try {
        let _cust_wallet_id = cust_wallet_id && validator.isNumeric(cust_wallet_id.toString()) ? parseInt(cust_wallet_id) : 0;
        let _customer_id = customer_id && validator.isNumeric(customer_id.toString()) ? parseInt(customer_id) : 0;
        if (!remark || remark.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter remark.", null));
        }
        const [is_admin, is_checker] = await commonModule.getUserRoles(req);
        if (is_admin || is_checker) {
            const record = await CstWalletsChecker.findOne({
                where: {
                    cust_wallet_id: _cust_wallet_id,
                    customer_id: _customer_id,
                    is_deleted: false
                },
                include: [{
                    model: CstCustomer,
                    as: 'customer',
                    where: { is_deleted: false },
                    attributes: ['email_id']
                }],
                attributes: ['cust_wallet_id', 'amount', 'added_date', 'description', 'transaction_type', 'previous_amount', 'is_wallet_amount_rejected', 'ckr_wallet_amount_is_rejected', 'is_wallet_amount_approved', 'ckr_wallet_amount_is_approved']
            });

            if (!record) {
                return res.status(200).json(success(false, res.statusCode, "Wallet Amount  details not found.", null));
            }

            if (record.is_wallet_amount_approved || record.ckr_wallet_amount_is_approved) {
                return res.status(200).json(success(false, res.statusCode, "Wallet Amount is already approved.", null));
            }

            if (record.is_wallet_amount_rejected || record.ckr_wallet_amount_is_rejected) {
                return res.status(200).json(success(false, res.statusCode, "Wallet Amount is rejected, cannot approve.", null));
            }

            let data;
            if (record.transaction_type && record.transaction_type == 1) {
                data = await admin_add_apigee_wallet_balance(_customer_id, parseFloat(record.amount));
            }
            else {
                const email_id = record.customer.email_id;
                const WalletGet_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers/${email_id}/balance`;
                const apigeeAuth = await db.get_apigee_token();
                const response = await fetch(WalletGet_URL, {
                    method: "GET",
                    headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json", },
                });
                const responseData = await response.json();
                if (responseData?.wallets?.length > 0) {
                    const units = parseFloat(responseData.wallets[0]?.balance?.units || 0);
                    const nanos = parseFloat(responseData.wallets[0]?.balance?.nanos || 0) / 1e9;
                    const available_balance = units + nanos;
                    const local_balance = parseFloat(record.amount || 0);
                    if (local_balance > available_balance) {
                        return res.status(200).json({ success: false, statusCode: res.statusCode, message: 'Debited Balance should not be greater than available balance', data: null });
                    }
                }
                data = await admin_debited_apigee_wallet_balance(_customer_id, parseFloat(record.amount));
            }
            console.log("=======data==========", JSON.stringify(data));
            if (data?.wallets?.length > 0) {
                const newWallet = await CstWallets.create({
                    customer_id: customer_id,
                    amount: parseFloat(record.amount),
                    added_date: db.get_ist_current_date(),
                    description: record.description,
                    transaction_type: record.transaction_type,
                    previous_amount: record.previous_amount
                });

                const _new_wallet_id = newWallet?.wallet_id ?? 0;
                if (_new_wallet_id > 0) {
                    await CstWalletsChecker.update(
                        {
                            ckr_wallet_amount_is_approved: true,
                            ckr_wallet_amount_approved_by: req.token_data.account_id,
                            ckr_wallet_amount_approved_date: db.get_ist_current_date(),
                            ckr_wallet_amount_approved_rmk: remark
                        },
                        {
                            where: { cust_wallet_id: _cust_wallet_id }
                        }
                    );
                }
                const units = parseFloat(data.wallets[0]?.balance?.units || 0);
                const nanos = parseFloat(data.wallets[0]?.balance?.nanos || 0) / 1e9;
                const balance = units + nanos;

                await CstCustomer.update(
                    {
                        wallets_amount: balance,
                        wallets_amt_updated_date: db.get_ist_current_date()
                    },
                    {
                        where: { customer_id: _customer_id }
                    }
                );

                return res.status(200).json(success(true, res.statusCode, "Wallet Amount Balance Updated successfully.", null));
            } else if ((data?.error?.status?.toUpperCase() === 'ABORTED' && String(data?.error?.code) === '409') || data?.error?.message?.length > 0) {
                return res.status(200).json(success(false, res.statusCode, `Apigee response : ${data?.error?.message ?? 'Unknown error'}`, null));
            }
            return res.status(200).json(success(false, res.statusCode, "Unable to Add Product Monetization Rate, Please try again.", null));
        }
        else {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have checker/maker authority.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

async function admin_add_apigee_wallet_balance(customer_id, wallet_amount_new) {
    const { CstCustomer } = db.models;
    try {
        const units = Math.floor(wallet_amount_new); // Get the integer part
        const nanos = Math.round((wallet_amount_new - units) * 1e9); // Get the decimal part as nanos

        console.log(`Units: ${units}`);
        console.log(`Nanos: ${nanos}`);
        let _customer_id = customer_id && validator.isNumeric(customer_id.toString()) ? parseInt(customer_id) : 0;

        const row1 = await CstCustomer.findOne({
            where: {
                customer_id: _customer_id,
                is_deleted: false
            },
            attributes: ['customer_id', 'developer_id', 'email_id', 'wallets_amount']
        });

        if (!row1) {
            return false;
        }
        let uuid = uuidv4();
        if (row1.email_id && row1.email_id.length > 0) {
            const wallet_data = { "transactionAmount": { "currencyCode": "INR", "nanos": nanos, "units": units }, "transactionId": uuid }
            const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers/${row1.email_id}/balance:credit`;
            const apigeeAuth = await db.get_apigee_token();
            const response = await fetch(product_URL, {
                method: "POST",
                headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json", },
                body: JSON.stringify(wallet_data),
            });
            const responseData = await response.json();
            return responseData;
        } else {
            return false;
        }
    } catch (error) {
        console.error("Error in update_apigee_wallet_balance:", error);
        return false;
    }
}

async function admin_debited_apigee_wallet_balance(customer_id, wallet_amount_new) {
    const { CstCustomer } = db.models;
    try {
        const units = Math.floor(wallet_amount_new); // Get the integer part
        const nanos = Math.round((wallet_amount_new - units) * 1e9); // Get the decimal part as nanos
        console.log(`Units: ${units}`);
        console.log(`Nanos: ${nanos}`);
        let _customer_id = customer_id && validator.isNumeric(customer_id.toString()) ? parseInt(customer_id) : 0;

        const row1 = await CstCustomer.findOne({
            where: {
                customer_id: _customer_id,
                is_deleted: false
            },
            attributes: ['customer_id', 'developer_id', 'email_id', 'wallets_amount']
        });

        if (!row1) {
            return false;
        }
        if (row1.email_id && row1.email_id.length > 0) {
            const wallet_data = { "adjustment": { "currencyCode": "INR", "nanos": nanos, "units": units } }
            const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/developers/${row1.email_id}/balance:adjust`;
            const apigeeAuth = await db.get_apigee_token();
            const response = await fetch(product_URL, {
                method: "POST",
                headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json", },
                body: JSON.stringify(wallet_data),
            });
            const responseData = await response.json();
            return responseData;
        } else {
            return false;
        }
    } catch (error) {
        console.error("Error in update_apigee_wallet_balance:", error);
        return false;
    }
}


export default {
    wallet_balance_add,
    wallet_balance_pending_list,
    wallet_balance_approve_list,
    wallet_balance_rejected_list,
    wallet_balance_reject,
    wallet_balance_approve
};
