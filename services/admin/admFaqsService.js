import { logger as _logger, action_logger } from '../../logger/winston.js';
import db from '../../database/db_helper.js';
import { success } from "../../model/responseModel.js";
import { Op, literal } from 'sequelize';
import dateFormat from 'date-format';
import validator from 'validator';
import correlator from 'express-correlation-id';

// Helper: Parse numeric ID
const parseNumericId = (value) => {
    return value && validator.isNumeric(value.toString()) ? parseInt(value) : 0;
};

// Helper: Log FAQ action
const logFaqAction = (tokenData, narration, query) => {
    try {
        const data_to_log = {
            correlation_id: correlator.getId(),
            token_id: tokenData.token_id,
            account_id: tokenData.account_id,
            user_type: 1,
            user_id: tokenData.admin_id,
            narration,
            query,
            date_time: db.get_ist_current_date(),
        };
        action_logger.info(JSON.stringify(data_to_log));
    } catch (_) { /* ignore logging errors */ }
};

// Helper: Update FAQ type record
const updateFaqType = async (FaqType, type_id, data, tokenData, oldRecord, name) => {
    const [affectedRows] = await FaqType.update(
        { ...data, modify_date: db.get_ist_current_date(), modify_by: tokenData.account_id },
        { where: { type_id } }
    );
    if (affectedRows > 0) {
        const nameChanged = oldRecord?.faq_type !== name;
        const narration = `FAQ type updated. FAQ type name = ${nameChanged ? oldRecord?.faq_type + ' to ' + name : name}`;
        logFaqAction(tokenData, narration, `FaqType.update({ faq_type: '${name}' }, { where: { type_id: ${type_id} }})`);
    }
    return affectedRows;
};

// Helper: Create FAQ type record
const createFaqType = async (FaqType, data, tokenData) => {
    const newRecord = await FaqType.create({
        ...data,
        added_by: tokenData.account_id,
        modify_by: tokenData.account_id,
        added_date: db.get_ist_current_date(),
        modify_date: db.get_ist_current_date()
    });
    if (newRecord?.type_id > 0) {
        logFaqAction(tokenData, `New FAQ type added. FAQ type name = ${data.faq_type}`,
            `FaqType.create({ faq_type: '${data.faq_type}' })`);
    }
    return newRecord;
};

// Helper: Update FAQ detail record
const updateFaqDetail = async (FaqDetail, faq_id, data, tokenData, question) => {
    const [affectedRows] = await FaqDetail.update(
        { ...data, modify_date: db.get_ist_current_date(), modify_by: tokenData.account_id },
        { where: { faq_id } }
    );
    if (affectedRows > 0) {
        logFaqAction(tokenData, `FAQ details updated. Question name = ${question}`,
            `FaqDetail.update({ question: '${question}' }, { where: { faq_id: ${faq_id} }})`);
    }
    return affectedRows;
};

// Helper: Create FAQ detail record
const createFaqDetail = async (FaqDetail, data, tokenData) => {
    const newRecord = await FaqDetail.create({
        ...data,
        is_enabled: true,
        added_by: tokenData.account_id,
        modify_by: tokenData.account_id,
        added_date: db.get_ist_current_date(),
        modify_date: db.get_ist_current_date()
    });
    if (newRecord?.faq_id > 0) {
        logFaqAction(tokenData, `New FAQ details added. Question name = ${data.question}`,
            `FaqDetail.create({ question: '${data.question}' })`);
    }
    return newRecord;
};

const faq_type_list = async (req, res, next) => {
    try {
        const { FaqType } = db.models;

        const rows = await FaqType.findAll({
            attributes: ['type_id', 'faq_type', 'sort_order', 'is_enabled', 'added_date', 'modify_date'],
            where: { is_deleted: false },
            order: [
                [literal('CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 2147483647 ELSE COALESCE(sort_order, 0) END'), 'ASC'],
                ['type_id', 'ASC']
            ],
            raw: true
        });

        const list = rows.map(item => ({
            id: item.type_id,
            name: item.faq_type,
            order: item.sort_order,
            enabled: item.is_enabled,
            added_on: item.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.added_date)) : "",
            modify_on: item.modify_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.modify_date)) : "",
        }));

        return res.status(200).json(success(true, res.statusCode, "", list));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const faq_type_get = async (req, res, next) => {
    const { id } = req.body;
    try {
        const { FaqType } = db.models;

        const row = await FaqType.findOne({
            where: { type_id: id, is_deleted: false },
            raw: true
        });

        if (!row) {
            return res.status(200).json(success(false, res.statusCode, "Faq type details not found.", null));
        }

        const results = {
            id: row.type_id,
            name: row.faq_type,
            order: row.sort_order,
            enabled: row.is_enabled,
            added_on: dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(row.added_date)),
            modify_on: dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(row.modify_date)),
        };

        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const faq_type_set = async (req, res, next) => {
    const { id, name, order, enabled } = req.body;
    try {
        const { FaqType } = db.models;
        const type_id = parseNumericId(id);

        if (!name?.length) {
            return res.status(200).json(success(false, res.statusCode, "Please enter faq type.", null));
        }

        const existingType = await FaqType.findOne({
            where: { type_id: { [Op.ne]: type_id }, faq_type: name, is_deleted: false },
            raw: true
        });

        if (existingType) {
            return res.status(200).json(success(false, res.statusCode, "Faq type is already exists.", null));
        }

        const data = { faq_type: name, sort_order: order, is_enabled: enabled };

        if (type_id > 0) {
            const oldRecord = await FaqType.findOne({ where: { type_id, is_deleted: false }, raw: true });
            const affectedRows = await updateFaqType(FaqType, type_id, data, req.token_data, oldRecord, name);
            return affectedRows > 0
                ? res.status(200).json(success(true, res.statusCode, "Updated successfully.", null))
                : res.status(200).json(success(false, res.statusCode, "Unable to update, Please try again", null));
        }

        const newRecord = await createFaqType(FaqType, data, req.token_data);
        return newRecord?.type_id > 0
            ? res.status(200).json(success(true, res.statusCode, "Saved successfully.", null))
            : res.status(200).json(success(false, res.statusCode, "Unable to save, Please try again", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const faq_type_toggle = async (req, res, next) => {
    const { id } = req.body;
    try {
        const { FaqType } = db.models;

        const row = await FaqType.findOne({
            where: { type_id: id, is_deleted: false },
            raw: true
        });

        if (!row) {
            return res.status(200).json(success(false, res.statusCode, "Faq type details not found.", null));
        }

        const newEnabledStatus = !row.is_enabled;

        const [affectedRows] = await FaqType.update(
            {
                is_enabled: newEnabledStatus,
                modify_date: db.get_ist_current_date(),
                modify_by: req.token_data.account_id
            },
            { where: { type_id: id } }
        );

        if (affectedRows > 0) {
            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: 'FAQ type ' + (row.is_enabled ? 'disabled' : 'enabled') + '. Faq type name = ' + row.faq_type,
                    query: `FaqType.update({ is_enabled: ${newEnabledStatus} }, { where: { type_id: ${id} }})`,
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

const faq_type_dropdown = async (req, res, next) => {
    try {
        const { FaqType } = db.models;

        const rows = await FaqType.findAll({
            attributes: ['type_id', 'faq_type'],
            where: { is_enabled: true, is_deleted: false },
            order: [
                [literal('CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 2147483647 ELSE COALESCE(sort_order, 0) END'), 'ASC'],
                ['type_id', 'ASC']
            ],
            raw: true
        });

        const list = rows.map(item => ({
            id: item.type_id,
            name: item.faq_type,
        }));

        return res.status(200).json(success(true, res.statusCode, "", list));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const faq_detail_list = async (req, res, next) => {
    const { page_no, type_id, search_text } = req.body;
    try {
        const { FaqDetail, FaqType } = db.models;

        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0;
        if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";
        let _type_id = type_id && validator.isNumeric(type_id.toString()) ? parseInt(type_id) : 0;

        const pageSize = parseInt(process.env.PAGINATION_SIZE);
        const offset = (_page_no - 1) * pageSize;

        // Build where clause for FaqDetail
        const whereClause = {
            is_deleted: false,
            ...(_search_text && {
                question: { [Op.iLike]: `${_search_text}%` }
            }),
            ...(_type_id > 0 && { type_id: _type_id })
        };

        // Get total count with JOIN to check FaqType.is_deleted
        const total_record = await FaqDetail.count({
            where: whereClause,
            include: [{
                model: FaqType,
                as: 'faq_type_rel',
                required: true,
                where: { is_deleted: false },
                attributes: []
            }]
        });

        // Get paginated list
        const rows = await FaqDetail.findAll({
            where: whereClause,
            include: [{
                model: FaqType,
                as: 'faq_type_rel',
                required: true,
                where: { is_deleted: false },
                attributes: ['faq_type']
            }],
            order: [['faq_id', 'DESC']],
            limit: pageSize,
            offset: offset,
            raw: true,
            nest: true
        });

        const list = rows.map((item, index) => ({
            sr_no: offset + index + 1,
            id: item.faq_id,
            type: item.faq_type_rel?.faq_type || '',
            question: item.question,
            answer: item.answer,
            order: item.sort_order,
            enabled: item.is_enabled,
            added_on: item.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.added_date)) : "",
            modify_on: item.modify_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.modify_date)) : "",
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

const faq_detail_get = async (req, res, next) => {
    const { id } = req.body;
    try {
        const { FaqDetail } = db.models;

        const row = await FaqDetail.findOne({
            where: { faq_id: id, is_deleted: false },
            raw: true
        });

        if (!row) {
            return res.status(200).json(success(false, res.statusCode, "Faq details not found.", null));
        }

        const results = {
            id: row.faq_id,
            type_id: row.type_id,
            question: row.question,
            answer: row.answer,
            order: row.sort_order,
            enabled: row.is_enabled,
            added_on: dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(row.added_date)),
            modify_on: dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(row.modify_date)),
        };

        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const faq_detail_set = async (req, res, next) => {
    const { id, type_id, question, answer, order } = req.body;
    try {
        const { FaqDetail } = db.models;
        const _id = parseNumericId(id);
        const _type_id = parseNumericId(type_id);

        if (_type_id <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please select FAQ type.", null));
        }
        if (!question?.length) {
            return res.status(200).json(success(false, res.statusCode, "Please enter question.", null));
        }
        if (!answer?.length) {
            return res.status(200).json(success(false, res.statusCode, "Please enter answer.", null));
        }

        const existingFaq = await FaqDetail.findOne({
            where: { faq_id: { [Op.ne]: _id }, type_id: _type_id, question, is_deleted: false },
            raw: true
        });

        if (existingFaq) {
            return res.status(200).json(success(false, res.statusCode, "Faq question is already exists.", null));
        }

        const data = { type_id: _type_id, question, answer, sort_order: order };

        if (_id > 0) {
            const affectedRows = await updateFaqDetail(FaqDetail, _id, data, req.token_data, question);
            return affectedRows > 0
                ? res.status(200).json(success(true, res.statusCode, "Updated Successfully.", null))
                : res.status(200).json(success(false, res.statusCode, "Unable to update, Please try again", null));
        }

        const newRecord = await createFaqDetail(FaqDetail, data, req.token_data);
        return newRecord?.faq_id > 0
            ? res.status(200).json(success(true, res.statusCode, "Saved successfully.", null))
            : res.status(200).json(success(false, res.statusCode, "Unable to save, Please try again", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const faq_detail_toggle = async (req, res, next) => {
    const { id } = req.body;
    try {
        const { FaqDetail } = db.models;

        const row = await FaqDetail.findOne({
            where: { faq_id: id, is_deleted: false },
            raw: true
        });

        if (!row) {
            return res.status(200).json(success(false, res.statusCode, "Faq details not found.", null));
        }

        const newEnabledStatus = !row.is_enabled;

        const [affectedRows] = await FaqDetail.update(
            {
                is_enabled: newEnabledStatus,
                modify_date: db.get_ist_current_date(),
                modify_by: req.token_data.account_id
            },
            { where: { faq_id: id } }
        );

        if (affectedRows > 0) {
            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: 'FAQ details ' + (row.is_enabled ? 'disabled' : 'enabled') + '. Faq question = ' + row.question,
                    query: `FaqDetail.update({ is_enabled: ${newEnabledStatus} }, { where: { faq_id: ${id} }})`,
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

export default {
    faq_type_list,
    faq_type_get,
    faq_type_set,
    faq_type_toggle,
    faq_type_dropdown,
    faq_detail_list,
    faq_detail_get,
    faq_detail_set,
    faq_detail_toggle,
};
