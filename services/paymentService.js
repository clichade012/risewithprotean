import { logger as _logger, log_payment } from '../logger/winston.js';
import db from '../database/db_helper.js';
import jws from 'jws';
import { Constants } from "../model/constantModel.js";
import requestIp from 'request-ip';
import { TRANSACTION_TYPE } from "../model/enumModel.js";
import redisDB from '../database/redis_cache.js';

// Helper function to get models - must be called after db is initialized
const getModels = () => db.models;

// Helper: Verify and decode JWS transaction response
const verifyAndDecodeTransaction = (transaction_response) => {
    const is_verified = jws.verify(transaction_response, "HS256", process.env.BILL_DESK_SECRETKEY);
    if (!is_verified) return { error: 'verification_failed' };

    const success_data = jws.decode(transaction_response);
    if (!success_data) return { error: 'decryption_failed' };

    let payloadData = null;
    try { payloadData = JSON.parse(success_data.payload); } catch (_) { }
    if (!payloadData) return { error: 'parsing_failed', success_data };

    return { success_data, payloadData };
};

// Helper: Extract fields from payload
const extractPayloadFields = (payloadData) => {
    return {
        orderid: payloadData.orderid?.length > 0 ? payloadData.orderid : "",
        is_success: payloadData.auth_status?.toString() === '0300',
        bank_ref_no: payloadData.bank_ref_no?.length > 0 ? payloadData.bank_ref_no : "",
        transactionid: payloadData.transactionid?.length > 0 ? payloadData.transactionid : "",
        resp_error_type: payloadData.transaction_error_type?.length > 0 ? payloadData.transaction_error_type : "",
        resp_error_code: payloadData.transaction_error_code?.length > 0 ? payloadData.transaction_error_code : "",
        resp_error_desc: payloadData.transaction_error_desc?.length > 0 ? payloadData.transaction_error_desc : ""
    };
};

// Helper: Save payment response to database
const savePaymentResponse = async (orderid, success_data, payloadData, fields, currDate) => {
    const { CstWalletsPaymentResp } = getModels();
    await CstWalletsPaymentResp.create({
        order_id: orderid,
        response_date: currDate,
        response_data: JSON.stringify(success_data),
        response_payload: JSON.stringify(payloadData),
        bank_ref_no: fields.bank_ref_no,
        transactionid: fields.transactionid,
        resp_error_type: fields.resp_error_type,
        resp_error_code: fields.resp_error_code,
        resp_error_desc: fields.resp_error_desc
    });
};

// Helper: Update payment record
const updatePaymentRecord = async (orderid, reqBody, transaction_response, success_data, payloadData, fields, currDate) => {
    const { CstWalletsPayment } = getModels();
    await CstWalletsPayment.update({
        is_success: fields.is_success,
        response_data_body: JSON.stringify(reqBody),
        response_data_signature: transaction_response,
        response_data_decoded: JSON.stringify(success_data),
        response_data_payload: JSON.stringify(payloadData),
        bank_ref_no: fields.bank_ref_no,
        transactionid: fields.transactionid,
        response_date: currDate,
        resp_error_type: fields.resp_error_type,
        resp_error_code: fields.resp_error_code,
        resp_error_desc: fields.resp_error_desc,
        response_received: true
    }, {
        where: { order_id: orderid, is_success: false }
    });
};

// Helper: Process successful payment - update wallet
const processSuccessfulPayment = async (orderid, payloadData, ip_addr) => {
    const { CstWalletsPayment, CstCustomer, CstWallets } = getModels();

    const paymentRecord = await CstWalletsPayment.findOne({
        where: { order_id: orderid },
        attributes: ['customer_id']
    });
    if (!paymentRecord) return;

    const customer_id = paymentRecord.customer_id;

    try {
        if (process.env.REDIS_ENABLED > 0) {
            await redisDB.set(`payment:${customer_id}`, 'success', { EX: 300 });
        }
    } catch (error) {
        console.log("=============not set in redis==========", error);
    }

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
            await db.update_apigee_wallet_balance(customer_id, _total_amount);
        }
        log_bill_desk_payment('info', ip_addr, 'previous balance amount available of customer.', customerRecord);
    }
};

// Helper: Log transaction error
const logTransactionError = (ip_addr, errorType, data) => {
    const messages = {
        verification_failed: 'Signature verification failed.',
        decryption_failed: 'Signature decryption failed.',
        parsing_failed: 'Signature payload parsing failed.'
    };
    console.log(`=====${messages[errorType]}=====`, data);
    log_bill_desk_payment('debug', ip_addr, messages[errorType], data);
};

// Helper: Process payment for internal order
const processInternalOrderPayment = async (context) => {
    const { orderid, reqBody, transaction_response, success_data, payloadData, fields, currDate, ip_addr } = context;
    console.log("=============orderid.startsWith(constants.proj_payment_order_id_int_prefix)==========", true);
    await updatePaymentRecord(orderid, reqBody, transaction_response, success_data, payloadData, fields, currDate);

    if (fields.is_success) {
        await processSuccessfulPayment(orderid, payloadData, ip_addr);
    }
};

const bill_desk_response = async (req, res, next) => {
    const { transaction_response } = req.body;
    try {
        let ip_addr = ''; try { const clientIp = requestIp.getClientIp(req); ip_addr = clientIp; } catch { }
        log_bill_desk_payment('debug', ip_addr, 'Payment response received.', req.body);

        const decoded = verifyAndDecodeTransaction(transaction_response);

        if (decoded.error) {
            logTransactionError(ip_addr, decoded.error, decoded.success_data || transaction_response);
            return res.status(200).send('<body onload="window.close();"></body>');
        }

        const { success_data, payloadData } = decoded;
        console.log("=============success_data==========", success_data);

        const fields = extractPayloadFields(payloadData);
        const logData = { order_id: fields.orderid, payload: payloadData, signature: transaction_response };
        log_bill_desk_payment('info', ip_addr, 'Transaction status updating.', logData);

        const currDate = new Date();
        await savePaymentResponse(fields.orderid, success_data, payloadData, fields, currDate);

        console.log("=============orderid==========", fields.orderid);

        if (fields.orderid.startsWith(Constants.proj_payment_order_id_int_prefix)) {
            await processInternalOrderPayment({
                orderid: fields.orderid,
                reqBody: req.body,
                transaction_response,
                success_data,
                payloadData,
                fields,
                currDate,
                ip_addr
            });
        } else {
            console.log("=============else id.startsWithorderid==========", fields.orderid, "==constants.proj_payment_order_id_int_prefix==", Constants.proj_payment_order_id_int_prefix);
            console.log("=============else id.startsWithorderid==========", fields.orderid.startsWith(Constants.proj_payment_order_id_int_prefix));
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