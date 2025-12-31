import { logger as _logger, log_payment } from '../logger/winston.js';
import db from '../database/db_helper.js';
import jws from 'jws';
import * as emailModule from '../modules/emailModule.js';
import { Constants } from "../model/constantModel.js";
import requestIp from 'request-ip';
import { TRANSACTION_TYPE } from "../model/enumModel.js";
import redisDB from '../database/redis_cache.js';

// Helper function to get models - must be called after db is initialized
const getModels = () => db.models;

const bill_desk_response = async (req, res, next) => {
    const { transaction_response } = req.body;
    try {
        const { CstWalletsPaymentResp, CstWalletsPayment, CstCustomer, CstWallets } = getModels();

        let ip_addr = ''; try { const clientIp = requestIp.getClientIp(req); ip_addr = clientIp; } catch { }
        log_bill_desk_payment('debug', ip_addr, 'Payment response received.', req.body);

        const is_verified = jws.verify(transaction_response, "HS256", process.env.BILL_DESK_SECRETKEY);
        if (is_verified) {
            const success_data = jws.decode(transaction_response);
            console.log("=============success_data==========",success_data);

            if (success_data != null) {
                let payloadData = null; try { payloadData = JSON.parse(success_data.payload); } catch (_) { }
                if (payloadData != null) {
                    const orderid = (payloadData.orderid && payloadData.orderid.length > 0 ? payloadData.orderid : "");

                    const logData = {
                        order_id: orderid, payload: payloadData, signature: transaction_response,
                    };
                    log_bill_desk_payment('info', ip_addr, 'Transaction status updating.', logData);

                    const is_success = payloadData.auth_status.toString() == '0300' ? true : false;
                    const bank_ref_no = (payloadData.bank_ref_no && payloadData.bank_ref_no.length > 0 ? payloadData.bank_ref_no : "");
                    const transactionid = (payloadData.transactionid && payloadData.transactionid.length > 0 ? payloadData.transactionid : "");
                    const resp_error_type = (payloadData.transaction_error_type && payloadData.transaction_error_type.length > 0 ? payloadData.transaction_error_type : "");
                    const resp_error_code = (payloadData.transaction_error_code && payloadData.transaction_error_code.length > 0 ? payloadData.transaction_error_code : "");
                    const resp_error_desc = (payloadData.transaction_error_desc && payloadData.transaction_error_desc.length > 0 ? payloadData.transaction_error_desc : "");

                    const currDate = new Date();

                    // INSERT INTO cst_wallets_payment_resp - Using ORM
                    await CstWalletsPaymentResp.create({
                        order_id: orderid,
                        response_date: currDate,
                        response_data: JSON.stringify(success_data),
                        response_payload: JSON.stringify(payloadData),
                        bank_ref_no: bank_ref_no,
                        transactionid: transactionid,
                        resp_error_type: resp_error_type,
                        resp_error_code: resp_error_code,
                        resp_error_desc: resp_error_desc
                    });

                    console.log("=============orderid==========", orderid);

                    if (orderid.startsWith(Constants.proj_payment_order_id_int_prefix)) {
                        console.log("=============orderid.startsWith(constants.proj_payment_order_id_int_prefix)==========", orderid.startsWith(Constants.proj_payment_order_id_int_prefix));

                        // UPDATE cst_wallets_payment - Using ORM
                        await CstWalletsPayment.update({
                            is_success: is_success,
                            response_data_body: JSON.stringify(req.body),
                            response_data_signature: transaction_response,
                            response_data_decoded: JSON.stringify(success_data),
                            response_data_payload: JSON.stringify(payloadData),
                            bank_ref_no: bank_ref_no,
                            transactionid: transactionid,
                            response_date: currDate,
                            resp_error_type: resp_error_type,
                            resp_error_code: resp_error_code,
                            resp_error_desc: resp_error_desc,
                            response_received: true
                        }, {
                            where: {
                                order_id: orderid,
                                is_success: false
                            }
                        });

                        if (is_success) {
                            // SELECT customer_id FROM cst_wallets_payment - Using ORM
                            const paymentRecord = await CstWalletsPayment.findOne({
                                where: { order_id: orderid },
                                attributes: ['customer_id']
                            });

                            if (paymentRecord) {
                                const customer_id = paymentRecord.customer_id;

                                try {
                                    if (process.env.REDIS_ENABLED > 0) {
                                        await redisDB.set(`payment:${customer_id}`, 'success', { EX: 300 }); // EX is the expiration in seconds 5 min
                                    }
                                } catch (error) {
                                    console.log("=============not set in redis==========", error);
                                }

                                // SELECT customer_id, wallets_amount FROM cst_customer - Using ORM
                                const customerRecord = await CstCustomer.findOne({
                                    where: { customer_id: customer_id },
                                    attributes: ['customer_id', 'wallets_amount']
                                });
                                console.log("=============customerRecord==========", customerRecord);

                                const _total_amount = parseFloat(payloadData.amount);
                                let wallets_amount = parseFloat(customerRecord.wallets_amount) || 0;
                                let transaction_description = 'Amount credited by customer via payment gateway';
                                console.log("=============wallets_amount==========", wallets_amount, "=========_total_amount=========", _total_amount);
                                log_bill_desk_payment('info', ip_addr, `new wallet balance added of customer. customer_id: ${customer_id}`, 'TotalAmount: ' + _total_amount);
                                let new_balance = _total_amount;

                                // INSERT INTO cst_wallets - Using ORM
                                const newWallet = await CstWallets.create({
                                    customer_id: customer_id,
                                    amount: new_balance,
                                    added_date: db.get_ist_current_date(),
                                    description: transaction_description,
                                    transaction_type: TRANSACTION_TYPE.Credited.value,
                                    previous_amount: wallets_amount
                                });

                                const _new_wallet_id = newWallet.wallet_id;
                                console.log("=============_new_wallet_id==========", _new_wallet_id);

                                if (_new_wallet_id > 0) {
                                    let cwb = await db.update_apigee_wallet_balance(customer_id, _total_amount);
                                    if (!cwb) {
                                        console.log("First attempt to update wallet balance failed. Retrying...");
                                        cwb = await db.update_apigee_wallet_balance(customer_id, _total_amount);
                                    }
                                    log_bill_desk_payment('info', ip_addr, 'previous balance amount available of customer.', customerRecord);
                                    // update balance in apigee first  from apigee update balance will be update then updated amount in cst_customer table

                                    // let total_new_balance = wallets_amount + _total_amount;
                                    // await CstCustomer.update({
                                    //     wallets_amount: total_new_balance,
                                    //     wallets_amt_updated_date: db.get_ist_current_date()
                                    // }, {
                                    //     where: { customer_id: customer_id }
                                    // });
                                }
                            }
                        }
                    }
                    else {
                        console.log("=============else id.startsWithorderid==========", orderid, "==constants.proj_payment_order_id_int_prefix==", Constants.proj_payment_order_id_int_prefix);
                        console.log("=============else id.startsWithorderid==========", orderid.startsWith(Constants.proj_payment_order_id_int_prefix));
                    }
                } else {
                    console.log("=====Signature payload parsing failed.=====", success_data);
                    log_bill_desk_payment('debug', ip_addr, 'Signature payload parsing failed.', success_data);
                }
            } else {
                console.log("=====Signature decryption failed=====", transaction_response);
                log_bill_desk_payment('debug', ip_addr, 'Signature decryption failed.', transaction_response);
            }
        } else {
            console.log("=====Signature verification failed=====", transaction_response);
            log_bill_desk_payment('debug', ip_addr, 'Signature verification failed.', transaction_response);
        }
    } catch (err) {
        try { _logger.error(err.stack); } catch (_) { console.log("=====catch=====", _); }
    }
    return res.status(200).send('<body onload="window.close();"></body>');
};

function log_bill_desk_payment(level, ip_addr, message, data) {
    try {
        let data_to_log = {
            level: level,
            ip_addr: ip_addr,
            message: message,
            data: data
        };
        log_payment.info(JSON.stringify(data_to_log));
    } catch (err) {
        try { _logger.error(err.stack); } catch (_) { }
    }
};

export {
    bill_desk_response,
    log_bill_desk_payment,
};

export default {
    bill_desk_response,
    log_bill_desk_payment,
};
