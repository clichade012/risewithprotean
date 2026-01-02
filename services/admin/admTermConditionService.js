import { logger as _logger, action_logger } from '../../logger/winston.js';
import db from '../../database/db_helper.js';
import { success } from "../../model/responseModel.js";
import {  Op } from 'sequelize';
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

const term_condition_list = async (req, res, next) => {
    const { page_no, search_text } = req.body;
    const { TermConditions } = db.models;
    try {
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0; if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";
        const formatDate = (date) => date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(date)) : "";

        // Build where clause with case-insensitive search
        const whereClause = {
            is_deleted: false,
            ...(_search_text && {
                [Op.and]: [
                    db.sequelize.where(
                        db.sequelize.fn('LOWER', db.sequelize.col('sidebar_title')),
                        {
                            [Op.like]: db.sequelize.fn('LOWER', _search_text + '%')
                        }
                    )
                ]
            })
        };

        // Get total count
        const total_record = await TermConditions.count({
            where: whereClause
        });

        // Get paginated list with row numbers
        // Using raw query for ROW_NUMBER() as it's complex window function, but with ORM-like structure
        const offset = (_page_no - 1) * process.env.PAGINATION_SIZE;
        const row1 = await TermConditions.findAll({
            where: whereClause,
            attributes: [
                [db.sequelize.literal('ROW_NUMBER() OVER(ORDER BY CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 2147483647 ELSE COALESCE(sort_order, 0) END, table_id)'), 'sr_no'],
                'table_id',
                'sidebar_title',
                'term_content',
                'sort_order',
                'is_enabled',
                'added_date',
                'modify_date'
            ],
            order: [
                [db.sequelize.literal('CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 2147483647 ELSE COALESCE(sort_order, 0) END'), 'ASC'],
                ['table_id', 'ASC']
            ],
            limit: parseInt(process.env.PAGINATION_SIZE),
            offset: offset,
            raw: true
        });

        const list = (row1 || []).map((item, index) => ({
            sr_no: offset + index + 1,
            id: item.table_id,
            title: item.sidebar_title,
            content: item.term_content,
            order: item.sort_order,
            enabled: item.is_enabled,
            added_on: formatDate(item.added_date),
            modify_on: formatDate(item.modify_date)
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

const term_condition_set = async (req, res, next) => {
    const { id, title, content, order } = req.body;
    const { TermConditions } = db.models;
    try {
        const _id = parseNumericWithDefault(id);

        if (!title || title.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter side bar menu title.", null));
        }
        if (!content || content.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter content of term and conditions.", null));
        }

        // Check for duplicate title
        const existingTitle = await TermConditions.findOne({
            where: { table_id: { [Op.ne]: _id }, sidebar_title: title, is_deleted: false },
            attributes: ['table_id']
        });
        if (existingTitle) {
            return res.status(200).json(success(false, res.statusCode, "Side bar menu title is already exists.", null));
        }

        // Update existing record
        if (_id > 0) {
            const existing = await TermConditions.findOne({
                where: { table_id: _id, is_deleted: false },
                attributes: ['table_id', 'sidebar_title']
            });
            if (!existing) {
                return res.status(200).json(success(false, res.statusCode, "Term & conditions details not found, Please try again.", null));
            }

            const [affectedRows] = await TermConditions.update({
                sidebar_title: title, term_content: content, sort_order: order,
                modify_by: req.token_data.account_id, modify_date: db.get_ist_current_date()
            }, { where: { table_id: _id } });

            if (affectedRows <= 0) {
                return res.status(200).json(success(false, res.statusCode, "Unable to update, Please try again", null));
            }

            const titleChange = existing.sidebar_title === title ? title : existing.sidebar_title + ' to ' + title;
            logAction(req, 'Term & conditions updated. Title name = ' + titleChange,
                { table_id: _id, sidebar_title: title, term_content: content, sort_order: order });
            return res.status(200).json(success(true, res.statusCode, "Updated successfully.", null));
        }

        // Create new record
        const newRecord = await TermConditions.create({
            sidebar_title: title, term_content: content, sort_order: order, is_enabled: true,
            added_by: req.token_data.account_id, modify_by: req.token_data.account_id,
            added_date: db.get_ist_current_date(), modify_date: db.get_ist_current_date()
        });

        if ((newRecord?.table_id ?? 0) <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Unable to save, Please try again", null));
        }

        logAction(req, 'New term & conditions added. Title name = ' + title,
            { sidebar_title: title, term_content: content, sort_order: order });
        return res.status(200).json(success(true, res.statusCode, "Saved successfully.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const term_condition_toggle = async (req, res, next) => {
    const { id } = req.body;
    const { TermConditions } = db.models;
    try {
        const row1 = await TermConditions.findOne({
            where: {
                table_id: id,
                is_deleted: false
            },
            attributes: ['table_id', 'is_enabled', 'sidebar_title']
        });

        if (!row1) {
            return res.status(200).json(success(false, res.statusCode, "Term conditions details not found.", null));
        }

        const [affectedRows] = await TermConditions.update(
            {
                is_enabled: !row1.is_enabled,
                modify_by: req.token_data.account_id,
                modify_date: db.get_ist_current_date()
            },
            {
                where: { table_id: id }
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
                    narration: 'Term & conditions ' + (row1.is_enabled ? 'disabled' : 'enabled') + '. Title name = ' + row1.sidebar_title,
                    query: JSON.stringify({
                        table_id: id,
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

const term_condition_delete = async (req, res, next) => {
    const { id } = req.body;
    const { TermConditions } = db.models;
    try {
        const row1 = await TermConditions.findOne({
            where: {
                table_id: id,
                is_deleted: false
            },
            attributes: ['table_id', 'sidebar_title']
        });

        if (!row1) {
            return res.status(200).json(success(false, res.statusCode, "Term conditions details not found.", null));
        }

        await TermConditions.update(
            { is_deleted: true },
            { where: { table_id: id } }
        );

        try {
            let data_to_log = {
                correlation_id: correlator.getId(),
                token_id: req.token_data.token_id,
                account_id: req.token_data.account_id,
                user_type: 1,
                user_id: req.token_data.admin_id,
                narration: 'Term & conditions deleted. Title name ' + row1.sidebar_title,
                query: JSON.stringify({
                    table_id: id,
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
    term_condition_list,
    term_condition_set,
    term_condition_toggle,
    term_condition_delete,
};
