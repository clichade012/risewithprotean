import { logger as _logger, action_logger } from '../../logger/winston.js';
import db from '../../database/db_helper.js';
import { success } from "../../model/responseModel.js";
import { Op } from 'sequelize';
import dateFormat from 'date-format';
import validator from 'validator';
import correlator from 'express-correlation-id';

// Helper: Parse numeric value with default
const parseNumericWithDefault = (value, defaultVal = 0) => {
    return value && validator.isNumeric(value.toString()) ? parseInt(value) : defaultVal;
};

// Helper: Log action to action_logger
const logAction = (req, narration, query) => {
    try {
        action_logger.info(JSON.stringify({
            correlation_id: correlator.getId(),
            token_id: req.token_data.token_id,
            account_id: req.token_data.account_id,
            user_type: 1,
            user_id: req.token_data.admin_id,
            narration,
            query: JSON.stringify(query),
            date_time: db.get_ist_current_date(),
        }));
    } catch (_) { }
};

const email_template_list = async (req, res, next) => {
    const { EmailTemplate } = db.models;
    try {
        const row1 = await EmailTemplate.findAll({
            attributes: ['template_id', 'template_name', 'subject', 'body_text', 'is_enabled', 'added_date', 'modify_date'],
            order: [
                [db.sequelize.literal('CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 2147483647 ELSE COALESCE(sort_order, 0) END'), 'ASC'],
                ['template_id', 'ASC']
            ],
            raw: true
        });

        const list = (row1 || []).map(item => ({
            id: item.template_id,
            name: item.template_name,
            subject: item.subject,
            body_text: item.body_text,
            is_enabled: item.is_enabled,
            added_on: item.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.added_date)) : "",
            modify_on: item.modify_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.modify_date)) : "",
        }));

        return res.status(200).json(success(true, res.statusCode, "", list));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const email_template_get = async (req, res, next) => {
    const { id } = req.body;
    const { EmailTemplate } = db.models;
    try {
        const row1 = await EmailTemplate.findOne({
            where: { template_id: id },
            attributes: ['template_id', 'template_name', 'subject', 'body_text', 'is_enabled']
        });

        if (!row1) {
            return res.status(200).json(success(false, res.statusCode, "Email template details not found.", null));
        }

        const results = {
            id: row1.template_id,
            name: row1.template_name,
            subject: row1.subject,
            body_text: row1.body_text,
            is_enabled: row1.is_enabled,
        };
        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const email_template_set = async (req, res, next) => {
    const { id, subject, body_text } = req.body;
    const { EmailTemplate } = db.models;
    try {
        let template_id = id && validator.isNumeric(id.toString()) ? parseInt(id) : 0;
        if (!subject || subject.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter email subject.", null));
        }
        if (!body_text || body_text.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter email body text.", null));
        }

        const row1 = await EmailTemplate.findOne({
            where: { template_id: template_id },
            attributes: ['template_name']
        });

        if (!row1) {
            return res.status(200).json(success(false, res.statusCode, "Email template details not found.", null));
        }

        const [affectedRows] = await EmailTemplate.update(
            {
                subject: subject,
                body_text: body_text,
                modify_date: db.get_ist_current_date(),
                modify_by: req.token_data.account_id
            },
            {
                where: { template_id: template_id }
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
                    narration: 'Email template updated. Template name ' + row1.template_name,
                    query: JSON.stringify({
                        template_id: template_id,
                        subject: subject,
                        body_text: body_text
                    }),
                    date_time: db.get_ist_current_date(),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }

            return res.status(200).json(success(true, res.statusCode, "Email template updated successfully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to update, Please try again", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const sms_template_list = async (req, res, next) => {
    const { SmsTemplate } = db.models;
    try {
        const row1 = await SmsTemplate.findAll({
            attributes: ['template_id', 'template_name', 'message_text', 'is_enabled', 'added_date', 'modify_date'],
            order: [
                [db.sequelize.literal('CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 2147483647 ELSE COALESCE(sort_order, 0) END'), 'ASC'],
                ['template_id', 'ASC']
            ],
            raw: true
        });

        const list = (row1 || []).map(item => ({
            id: item.template_id,
            name: item.template_name,
            message_text: item.message_text,
            is_enabled: item.is_enabled,
            added_on: item.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.added_date)) : "",
            modify_on: item.modify_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.modify_date)) : "",
        }));

        return res.status(200).json(success(true, res.statusCode, "", list));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const sms_template_get = async (req, res, next) => {
    const { id } = req.body;
    const { SmsTemplate } = db.models;
    try {
        const row1 = await SmsTemplate.findOne({
            where: { template_id: id },
            attributes: ['template_id', 'template_name', 'message_text', 'is_enabled']
        });

        if (!row1) {
            return res.status(200).json(success(false, res.statusCode, "SMS template details not found.", null));
        }

        const results = {
            id: row1.template_id,
            name: row1.template_name,
            message_text: row1.message_text,
            is_enabled: row1.is_enabled,
        };
        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const sms_template_set = async (req, res, next) => {
    const { id, message_text } = req.body;
    const { SmsTemplate } = db.models;
    try {
        let template_id = id && validator.isNumeric(id.toString()) ? parseInt(id) : 0;
        if (!message_text || message_text.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter message text.", null));
        }

        const row1 = await SmsTemplate.findOne({
            where: { template_id: template_id },
            attributes: ['template_name']
        });

        if (!row1) {
            return res.status(200).json(success(false, res.statusCode, "SMS template details not found.", null));
        }

        const [affectedRows] = await SmsTemplate.update(
            {
                message_text: message_text,
                modify_date: db.get_ist_current_date(),
                modify_by: req.token_data.account_id
            },
            {
                where: { template_id: template_id }
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
                    narration: 'SMS template updated. Template name ' + row1.template_name,
                    query: JSON.stringify({
                        template_id: template_id,
                        message_text: message_text
                    }),
                    date_time: db.get_ist_current_date(),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }
            return res.status(200).json(success(true, res.statusCode, "SMS template updated successfully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to update, Please try again", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};


const businessEmailList = async (req, res, next) => {
    const { page_no, search_text } = req.body;
    const { BusinessEmail } = db.models;
    try {
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0; if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";
        const formatDate = (date) => date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(date)) : "";

        // Build where clause with case-insensitive search
        const whereClause = {
            is_deleted: false,
            ...(_search_text && {
                [Op.or]: [
                    db.sequelize.where(
                        db.sequelize.fn('LOWER', db.sequelize.col('email_id')),
                        { [Op.like]: db.sequelize.fn('LOWER', '%' + _search_text + '%') }
                    ),
                    db.sequelize.where(
                        db.sequelize.fn('LOWER', db.sequelize.col('first_name')),
                        { [Op.like]: db.sequelize.fn('LOWER', '%' + _search_text + '%') }
                    )
                ]
            })
        };

        // Get total count
        const total_record = await BusinessEmail.count({ where: whereClause });

        // Get paginated list
        const offset = (_page_no - 1) * process.env.PAGINATION_SIZE;
        const row1 = await BusinessEmail.findAll({
            where: whereClause,
            attributes: ['id', 'email_id', 'first_name', 'last_name', 'mobile_no', 'is_enabled', 'is_deleted', 'added_date', 'modify_date', 'added_by', 'modify_by', 'type_id'],
            order: [['id', 'DESC']],
            limit: parseInt(process.env.PAGINATION_SIZE),
            offset: offset,
            raw: true
        });

        const list = (row1 || []).map((item, index) => ({
            sr_no: offset + index + 1,
            id: item.id,
            email_id: item.email_id,
            first_name: item.first_name,
            last_name: item.last_name,
            mobile_no: item.mobile_no,
            enabled: item.is_enabled,
            type_id: item.type_id,
            added_on: formatDate(item.added_date),
            modify_on: formatDate(item.modify_date),
        }));

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

const businessEmailSet = async (req, res, next) => {
    const { id, email_id, first_name, last_name, mobile_no, type_id } = req.body;
    const { BusinessEmail } = db.models;
    try {
        const businessId = parseNumericWithDefault(id);
        const typeId = parseNumericWithDefault(type_id);

        if (!email_id || email_id.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter email-id.", null));
        }

        // Check for duplicate email
        const existingEmail = await BusinessEmail.findOne({
            where: { id: { [Op.ne]: businessId }, email_id, is_deleted: false },
            attributes: ['id']
        });
        if (existingEmail) {
            return res.status(200).json(success(false, res.statusCode, "email-id is already exists.", null));
        }

        // Update existing record
        if (businessId > 0) {
            const [affectedRows] = await BusinessEmail.update({
                email_id, first_name, last_name, mobile_no,
                modify_date: db.get_ist_current_date(), modify_by: req.token_data.account_id, type_id: typeId
            }, { where: { id: businessId } });

            if (affectedRows <= 0) {
                return res.status(200).json(success(false, res.statusCode, "Unable to update, Please try again", null));
            }

            logAction(req, 'EmailId updated. email id name = ' + email_id,
                { id: businessId, email_id, first_name, last_name });
            return res.status(200).json(success(true, res.statusCode, "Updated successfully.", null));
        }

        // Create new record
        const newRecord = await BusinessEmail.create({
            email_id, first_name, last_name, mobile_no,
            added_by: req.token_data.account_id, modify_by: req.token_data.account_id,
            added_date: db.get_ist_current_date(), modify_date: db.get_ist_current_date(), type_id: typeId
        });

        if ((newRecord?.id ?? 0) <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Unable to save, Please try again", null));
        }

        logAction(req, 'New Email added. email name = ' + email_id, { email_id, first_name, last_name });
        return res.status(200).json(success(true, res.statusCode, "Saved successfully.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const businessEmailToggle = async (req, res, next) => {
    const { id } = req.body;
    const { BusinessEmail } = db.models;
    try {
        const row1 = await BusinessEmail.findOne({
            where: {
                id: id,
                is_deleted: false
            },
            attributes: ['id', 'email_id', 'is_enabled']
        });

        if (!row1) {
            return res.status(200).json(success(false, res.statusCode, "email-id details not found.", null));
        }

        const [affectedRows] = await BusinessEmail.update(
            {
                is_enabled: !row1.is_enabled,
                modify_date: db.get_ist_current_date(),
                modify_by: req.token_data.account_id
            },
            {
                where: { id: id }
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
                    narration: 'Email-id ' + (row1.is_enabled ? 'disabled' : 'enabled') + '. email-id name = ' + row1.email_id,
                    query: JSON.stringify({
                        id: id,
                        is_enabled: !row1.is_enabled
                    }),
                    date_time: db.get_ist_current_date(),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }

            return res.status(200).json(success(true, res.statusCode, "Status changed successfully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to change, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const businessEmailDropdown = async (req, res, next) => {
    const { BusinessEmail } = db.models;
    try {
        const row1 = await BusinessEmail.findAll({
            where: {
                is_enabled: true,
                is_deleted: false
            },
            attributes: ['id', 'email_id', 'is_enabled', 'is_deleted', 'added_date', 'modify_date'],
            raw: true
        });

        const list = (row1 || []).map(item => ({
            id: item.id,
            email_id: item.email_id,
        }));

        return res.status(200).json(success(true, res.statusCode, "", list));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const businessEmailDelete = async (req, res, next) => {
    const { id } = req.body;
    const { BusinessEmail } = db.models;
    try {
        const row1 = await BusinessEmail.findOne({
            where: {
                id: id,
                is_deleted: false
            },
            attributes: ['id', 'email_id']
        });

        if (!row1) {
            return res.status(200).json(success(false, res.statusCode, "Email-id details not found.", null));
        }

        await BusinessEmail.update(
            { is_deleted: true },
            { where: { id: id } }
        );

        try {
            let data_to_log = {
                correlation_id: correlator.getId(),
                token_id: req.token_data.token_id,
                account_id: req.token_data.account_id,
                user_type: 1,
                user_id: req.token_data.admin_id,
                narration: 'email-id deleted. email-id name ' + row1.email_id,
                query: JSON.stringify({
                    id: id,
                    is_deleted: true
                }),
                date_time: db.get_ist_current_date(),
            }
            action_logger.info(JSON.stringify(data_to_log));
        } catch (_) { }

        return res.status(200).json(success(true, res.statusCode, "Deleted successfully.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};



export default {
    email_template_list,
    email_template_get,
    email_template_set,
    sms_template_list,
    sms_template_get,
    sms_template_set,

    businessEmailList,
    businessEmailSet,
    businessEmailToggle,
    businessEmailDropdown,
    businessEmailDelete
};
