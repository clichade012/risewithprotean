import { logger as _logger } from '../logger/winston.js';
import db from '../database/db_helper.js';
import { QueryTypes } from 'sequelize';

const country_calling_code = async () => {
    let list = [];
    list.push('+91');
    return list;
};

const email_template_get = async (template_id) => {
    const _query1 = `SELECT template_name, subject, body_text, is_enabled
    FROM email_template WHERE template_id = ?`;
    const row1 = await db.sequelize.query(_query1, { replacements: [template_id], type: QueryTypes.SELECT });
    if (row1 && row1.length > 0) {
        return row1[0];
    }
    return null;
};

const sms_template_get = async (template_id) => {
    const _query1 = `SELECT template_name, message_text, is_enabled
    FROM sms_template WHERE template_id = ?`;
    const row1 = await db.sequelize.query(_query1, { replacements: [template_id], type: QueryTypes.SELECT });
    if (row1 && row1.length > 0) {
        return row1[0];
    }
    return null;
};


const is_mobile_registered = async (_entity_id, _mobile_no) => {
    if (_entity_id.toString() == '4') {
        const _query1 = `SELECT u.reg_id AS id FROM user_master u 
        WHERE u.is_deleted = false AND LENGTH(COALESCE(u.mobile_no, '')) > 0 AND LOWER(u.mobile_no) = LOWER(:mobile_no) AND u.entity_id = 4
        UNION ALL
        SELECT a.reg_id AS id FROM user_account a INNER JOIN user_master u ON a.reg_id = u.reg_id 
        WHERE u.is_deleted = false AND a.is_deleted = false AND LENGTH(COALESCE(a.mobile_no, '')) > 0 AND LOWER(a.mobile_no) = LOWER(:mobile_no)
        AND u.entity_id = 4`;
        const row1 = await db.sequelize.query(_query1, { replacements: { mobile_no: _mobile_no }, type: QueryTypes.SELECT });
        if (row1 && row1.length > 0) {
            return true;
        }
    } else {
        const _query1 = `SELECT u.reg_id AS id FROM user_master u 
        WHERE u.is_deleted = false AND LENGTH(COALESCE(u.mobile_no, '')) > 0 AND LOWER(u.mobile_no) = LOWER(:mobile_no) AND u.entity_id <> 4
        UNION ALL
        SELECT a.reg_id AS id FROM user_account a INNER JOIN user_master u ON a.reg_id = u.reg_id 
        WHERE u.is_deleted = false AND a.is_deleted = false AND LENGTH(COALESCE(a.mobile_no, '')) > 0 AND LOWER(a.mobile_no) = LOWER(:mobile_no)
        AND u.entity_id <> 4`;
        const row1 = await db.sequelize.query(_query1, { replacements: { mobile_no: _mobile_no }, type: QueryTypes.SELECT });
        if (row1 && row1.length > 0) {
            return true;
        }
    }
    return false;
};


const is_email_registered = async (_entity_id, _email_id) => {
    if (_entity_id.toString() == '4') {
        const _query2 = `SELECT u.reg_id AS id FROM user_master u 
        WHERE u.is_deleted = false AND LENGTH(COALESCE(u.email_id, '')) > 0 AND LOWER(u.email_id) = LOWER(:email_id) AND u.entity_id = 4
        UNION ALL
        SELECT a.reg_id AS id FROM user_account a INNER JOIN user_master u ON a.reg_id = u.reg_id 
        WHERE u.is_deleted = false AND a.is_deleted = false AND LENGTH(COALESCE(a.email_id, '')) > 0 AND LOWER(a.email_id) = LOWER(:email_id)
        AND u.entity_id = 4`;
        const row2 = await db.sequelize.query(_query2, { replacements: { email_id: _email_id }, type: QueryTypes.SELECT });
        if (row2 && row2.length > 0) {
            return true;
        }
    } else {
        const _query2 = `SELECT u.reg_id AS id FROM user_master u 
        WHERE u.is_deleted = false AND LENGTH(COALESCE(u.email_id, '')) > 0 AND LOWER(u.email_id) = LOWER(:email_id) AND u.entity_id <> 4
        UNION ALL
        SELECT a.reg_id AS id FROM user_account a INNER JOIN user_master u ON a.reg_id = u.reg_id 
        WHERE u.is_deleted = false AND a.is_deleted = false AND LENGTH(COALESCE(a.email_id, '')) > 0 AND LOWER(a.email_id) = LOWER(:email_id)
        AND u.entity_id <> 4`;
        const row2 = await db.sequelize.query(_query2, { replacements: { email_id: _email_id }, type: QueryTypes.SELECT });
        if (row2 && row2.length > 0) {
            return true;
        }
    }
    return false;
};

const payment_order_id_new = async () => {
    let order_id = '';
    const row = await db.sequelize.query(`SELECT nextval('seq_random_payment_id') as order_id`,
        { type: QueryTypes.SELECT });
    if (row && row.length > 0) {
        order_id = row[0].order_id.toString().padStart(7, '0');
    }
    return order_id;
};

async function getUserRoles(req) {
    const _qry20 = `SELECT a.role_id, r.is_editable, r.checker_maker FROM adm_user a INNER JOIN adm_role r ON a.role_id = r.role_id WHERE a.admin_id = ?`;
    const _rw20 = await db.sequelize.query(_qry20, { replacements: [req.token_data.admin_id], type: QueryTypes.SELECT });

    let is_admin = false;
    let is_checker = false;
    let is_maker = false;

    if (_rw20 && _rw20.length > 0) {
        is_admin = !_rw20[0].is_editable;
        if (!is_admin) {
            is_checker = _rw20[0].checker_maker === 2;
            is_maker = _rw20[0].checker_maker === 1;
        }
    }

    return [is_admin, is_checker, is_maker];
}
// const [is_admin, is_checker, is_maker] = await getUserRoles(req);

export default {
    country_calling_code,
    email_template_get,
    sms_template_get,
    is_mobile_registered,
    is_email_registered,
    payment_order_id_new,
    getUserRoles
};