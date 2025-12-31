import { logger as _logger, api_logger as _api_logger } from '../logger/winston.js';
import db from '../database/db_helper.js';
import jwt from 'jsonwebtoken';
import { success } from "../model/responseModel.js";
import customerService from '../services/customerService.js';
import requestIp from 'request-ip';
import { PassThrough } from 'stream';
import correlator from 'express-correlation-id';
import { API_STATUS } from "../model/enumModel.js";

const verifyTokenAdmin = async (req, res, next) => {
    /************************ API REQ LOG ************************************/
    const defaultWrite = res.write.bind(res);
    const defaultEnd = res.end.bind(res);
    const ps = new PassThrough();
    const chunks = [];
    ps.on('data', data => {
        chunks.push(data);
    });
    res.write = (...args) => {
        ps.write(...args);
        defaultWrite(...args);
    };
    res.end = (...args) => {
        ps.end(...args);
        defaultEnd(...args);
    };
    res.on('finish', () => {
        try {
            if (req.token_data != null) {
                let resp_data = '';
                if (res.get('Content-type') == 'application/json; charset=utf-8' || res.get('Content-type') == 'application/json' ||
                    res.get('Content-type') == 'application/xml; charset=utf-8' || res.get('Content-type') == 'application/xml' ||
                    res.get('Content-type') == 'text/html; charset=utf-8' || res.get('Content-type') == 'text/html') {
                    resp_data = Buffer.concat(chunks).toString();
                }
                let ip_address = ''; try { const clientIp = requestIp.getClientIp(req); ip_address = clientIp; } catch { }
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 2,
                    table_id: req.token_data.customer_id,
                    url: req.url,
                    method: req.method,
                    payload: JSON.stringify(req.body),
                    ip_address: ip_address,
                    date_time: db.get_ist_current_date(),
                    response: resp_data,
                };
                _api_logger.info(JSON.stringify(data_to_log));
            }
        } catch (_) {
        }
    });
    /************************ API REQ LOG ************************************/

    const accessToken = req.headers["x-access-token"];
    if (!accessToken) {
        return res.status(200).json(success(false, API_STATUS.SESSION_EXPIRED.value, "Access token is required for authentication.", null));
    }
    try {
        jwt.verify(accessToken, process.env.JWT_ACCESS_TOKEN_KEY);
        const authKey = req.headers["x-auth-key"];
        if (!authKey) {
            return res.status(200).json(success(false, API_STATUS.SESSION_EXPIRED.value, "Auth key is required for authentication.", null));
        }
        const user_data = await customerService.token_data(authKey);

        if (!user_data || user_data.length <= 0) {
            return res.status(200).json(success(false, API_STATUS.SESSION_EXPIRED.value, "Session is expired or invalid.", null));
        }
        if (user_data[0].is_deleted) {
            return res.status(200).json(success(false, API_STATUS.SESSION_EXPIRED.value, "Your account does not exist.", null));
        }
        if (user_data[0].is_logout) {
            return res.status(200).json(success(false, API_STATUS.SESSION_EXPIRED.value, "Session is expired or invalid.", null));
        }
        if (!user_data[0].is_enabled) {
            return res.status(200).json(success(false, API_STATUS.SESSION_EXPIRED.value, "Your account has been blocked, contact system administrator.", null));
        }

        req.token_data = user_data[0];
        req.token_data.auth_key = authKey;
        return next();
    } catch (err) {
        _logger.error(err.stack);
        return res.status(200).json(success(false, API_STATUS.SESSION_EXPIRED.value, "Unauthorized! Invalid access token.", null));
    }
};

export default verifyTokenAdmin;
