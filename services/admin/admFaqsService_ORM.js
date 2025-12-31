/**
 * ============================================
 * FAQ Service - ORM Version
 * ============================================
 *
 * This is the CONVERTED version of admFaqsService.js
 * using Sequelize ORM instead of raw SQL queries.
 *
 * COMPARISON:
 * -----------
 * OLD (Raw SQL):  db.sequelize.query("SELECT * FROM faq_type WHERE...", {...})
 * NEW (ORM):      FaqType.findAll({ where: {...} })
 *
 */

const _logger = require('../../logger/winston').logger;
const action_logger = require('../../logger/winston').action_logger;
const db = require('../../database/db_helper');
const { success } = require("../../model/responseModel");
const { Op } = require('sequelize');  // Op = Operators for queries (like, gt, lt, etc.)
let dateFormat = require('date-format');
let validator = require('validator');
const correlator = require('express-correlation-id');

/**
 * ============================================
 * faq_type_list - Get all FAQ types
 * ============================================
 *
 * OLD SQL:
 *   SELECT type_id, faq_type, sort_order, is_enabled, added_date, modify_date
 *   FROM faq_type WHERE is_deleted = false
 *   ORDER BY sort_order, type_id
 *
 * NEW ORM:
 *   FaqType.findAll({ where: { is_deleted: false }, order: [...] })
 */
const faq_type_list = async (req, res, next) => {
    try {
        // Get FaqType model from db.models
        const { FaqType } = db.models;

        // Use ORM to find all records
        const rows = await FaqType.findAll({
            where: {
                is_deleted: false,              // Only non-deleted records
            },
            order: [
                // ORDER BY: null/0 values go last, then sort by sort_order, then type_id
                [db.sequelize.literal('CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 2147483647 ELSE COALESCE(sort_order, 0) END'), 'ASC'],
                ['type_id', 'ASC'],
            ],
            // Select specific attributes (columns)
            attributes: ['type_id', 'faq_type', 'sort_order', 'is_enabled', 'added_date', 'modify_date'],
        });

        // Map the results to response format
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


/**
 * ============================================
 * faq_type_get - Get single FAQ type by ID
 * ============================================
 *
 * OLD SQL:
 *   SELECT ... FROM faq_type WHERE type_id = ? AND is_deleted = false
 *
 * NEW ORM:
 *   FaqType.findOne({ where: { type_id: id, is_deleted: false } })
 */
const faq_type_get = async (req, res, next) => {
    const { id } = req.body;
    try {
        const { FaqType } = db.models;

        // findOne = SELECT ... LIMIT 1
        const faqType = await FaqType.findOne({
            where: {
                type_id: id,
                is_deleted: false,
            },
        });

        // Check if record exists
        if (!faqType) {
            return res.status(200).json(success(false, res.statusCode, "Faq type details not found.", null));
        }

        // Build response - access properties directly from the model instance
        const results = {
            id: faqType.type_id,
            name: faqType.faq_type,
            order: faqType.sort_order,
            enabled: faqType.is_enabled,
            added_on: dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(faqType.added_date)),
            modify_on: dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(faqType.modify_date)),
        };

        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};


/**
 * ============================================
 * faq_type_set - Create or Update FAQ type
 * ============================================
 *
 * OLD SQL (Insert):
 *   INSERT INTO faq_type(...) VALUES (?, ?, ?, ...) RETURNING "type_id"
 *
 * OLD SQL (Update):
 *   UPDATE faq_type SET ... WHERE type_id = ?
 *
 * NEW ORM:
 *   FaqType.create({...})   - for INSERT
 *   FaqType.update({...}, { where: {...} })  - for UPDATE
 */
const faq_type_set = async (req, res, next) => {
    const { id, name, order, enabled } = req.body;
    try {
        const { FaqType } = db.models;

        let type_id = id && validator.isNumeric(id.toString()) ? parseInt(id) : 0;

        // Validation
        if (!name || name.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter faq type.", null));
        }

        // Check for duplicate name (excluding current record)
        const existingType = await FaqType.findOne({
            where: {
                type_id: { [Op.ne]: type_id },   // Op.ne = NOT EQUAL (type_id <> ?)
                faq_type: name,
                is_deleted: false,
            },
        });

        if (existingType) {
            return res.status(200).json(success(false, res.statusCode, "Faq type is already exists.", null));
        }

        if (type_id > 0) {
            // ========== UPDATE ==========
            const [affectedRows] = await FaqType.update(
                {
                    // Fields to update
                    faq_type: name,
                    sort_order: order,
                    is_enabled: enabled,
                    modify_date: db.get_ist_current_date(),
                    modify_by: req.token_data.account_id,
                },
                {
                    // WHERE condition
                    where: { type_id: type_id },
                }
            );

            if (affectedRows > 0) {
                // Log the action
                try {
                    let data_to_log = {
                        correlation_id: correlator.getId(),
                        token_id: req.token_data.token_id,
                        account_id: req.token_data.account_id,
                        user_type: 1,
                        user_id: req.token_data.admin_id,
                        narration: 'FAQ type updated. FAQ type name = ' + name,
                        query: '[ORM] FaqType.update()',
                        date_time: db.get_ist_current_date(),
                    };
                    action_logger.info(JSON.stringify(data_to_log));
                } catch (_) { }

                return res.status(200).json(success(true, res.statusCode, "Updated successfully.", null));
            } else {
                return res.status(200).json(success(false, res.statusCode, "Unable to update, Please try again", null));
            }
        } else {
            // ========== INSERT (CREATE) ==========
            const newFaqType = await FaqType.create({
                faq_type: name,
                sort_order: order,
                is_enabled: enabled,
                added_by: req.token_data.account_id,
                modify_by: req.token_data.account_id,
                added_date: db.get_ist_current_date(),
                modify_date: db.get_ist_current_date(),
            });

            if (newFaqType && newFaqType.type_id > 0) {
                // Log the action
                try {
                    let data_to_log = {
                        correlation_id: correlator.getId(),
                        token_id: req.token_data.token_id,
                        account_id: req.token_data.account_id,
                        user_type: 1,
                        user_id: req.token_data.admin_id,
                        narration: 'New FAQ type added. FAQ type name = ' + name,
                        query: '[ORM] FaqType.create()',
                        date_time: db.get_ist_current_date(),
                    };
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


/**
 * ============================================
 * faq_type_toggle - Enable/Disable FAQ type
 * ============================================
 *
 * OLD SQL:
 *   UPDATE faq_type SET is_enabled = CASE WHEN is_enabled = true THEN false ELSE true END
 *
 * NEW ORM:
 *   1. First find the record
 *   2. Toggle the value
 *   3. Save using update()
 */
const faq_type_toggle = async (req, res, next) => {
    const { id } = req.body;
    try {
        const { FaqType } = db.models;

        // First, find the record
        const faqType = await FaqType.findOne({
            where: {
                type_id: id,
                is_deleted: false,
            },
        });

        if (!faqType) {
            return res.status(200).json(success(false, res.statusCode, "Faq type details not found.", null));
        }

        // Toggle the is_enabled value
        const newEnabledValue = !faqType.is_enabled;

        // Update the record
        const [affectedRows] = await FaqType.update(
            {
                is_enabled: newEnabledValue,
                modify_date: db.get_ist_current_date(),
                modify_by: req.token_data.account_id,
            },
            {
                where: { type_id: id },
            }
        );

        if (affectedRows > 0) {
            // Log the action
            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: 'FAQ type ' + (faqType.is_enabled ? 'disabled' : 'enabled') + '. Faq type name = ' + faqType.faq_type,
                    query: '[ORM] FaqType.update()',
                    date_time: db.get_ist_current_date(),
                };
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


/**
 * ============================================
 * faq_type_dropdown - Get FAQ types for dropdown
 * ============================================
 *
 * Simple findAll with minimal data for dropdown lists
 */
const faq_type_dropdown = async (req, res, next) => {
    try {
        const { FaqType } = db.models;

        const rows = await FaqType.findAll({
            where: {
                is_enabled: true,
                is_deleted: false,
            },
            order: [
                [db.sequelize.literal('CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 2147483647 ELSE COALESCE(sort_order, 0) END'), 'ASC'],
                ['type_id', 'ASC'],
            ],
            attributes: ['type_id', 'faq_type'],  // Only select needed columns
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


/**
 * ============================================
 * faq_detail_list - Get all FAQ details with pagination
 * ============================================
 *
 * This shows:
 * - Pagination (LIMIT, OFFSET)
 * - JOIN with related table (include)
 * - Search/filter (Op.like)
 * - Count for pagination
 */
const faq_detail_list = async (req, res, next) => {
    const { page_no, type_id, search_text } = req.body;
    try {
        const { FaqDetail, FaqType } = db.models;

        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 1;
        if (_page_no <= 0) _page_no = 1;

        let _search_text = search_text && search_text.length > 0 ? search_text : "";
        let _type_id = type_id && validator.isNumeric(type_id.toString()) ? parseInt(type_id) : 0;
        const pageSize = parseInt(process.env.PAGINATION_SIZE);

        // Build WHERE conditions
        const whereConditions = {
            is_deleted: false,
        };

        // Add search filter if provided
        if (_search_text.length > 0) {
            whereConditions.question = {
                [Op.iLike]: _search_text + '%',   // Op.iLike = case-insensitive LIKE
            };
        }

        // Add type filter if provided
        if (_type_id > 0) {
            whereConditions.type_id = _type_id;
        }

        // Count total records for pagination
        const total_record = await FaqDetail.count({
            where: whereConditions,
            include: [{
                model: FaqType,
                as: 'faqType',
                where: { is_deleted: false },
                required: true,  // INNER JOIN (only if FaqType exists and not deleted)
            }],
        });

        // Get paginated data with JOIN
        const rows = await FaqDetail.findAll({
            where: whereConditions,
            include: [{
                model: FaqType,
                as: 'faqType',               // This is the alias we defined in models/index.js
                where: { is_deleted: false },
                required: true,
                attributes: ['faq_type'],    // Only get the faq_type name
            }],
            order: [['faq_id', 'DESC']],
            limit: pageSize,
            offset: (_page_no - 1) * pageSize,
        });

        // Map results
        const list = rows.map((item, index) => ({
            sr_no: ((_page_no - 1) * pageSize) + index + 1,
            id: item.faq_id,
            type: item.faqType ? item.faqType.faq_type : '',  // Access related model data
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


/**
 * ============================================
 * faq_detail_get - Get single FAQ detail
 * ============================================
 */
const faq_detail_get = async (req, res, next) => {
    const { id } = req.body;
    try {
        const { FaqDetail } = db.models;

        const faqDetail = await FaqDetail.findOne({
            where: {
                faq_id: id,
                is_deleted: false,
            },
        });

        if (!faqDetail) {
            return res.status(200).json(success(false, res.statusCode, "Faq details not found.", null));
        }

        const results = {
            id: faqDetail.faq_id,
            type_id: faqDetail.type_id,
            question: faqDetail.question,
            answer: faqDetail.answer,
            order: faqDetail.sort_order,
            enabled: faqDetail.is_enabled,
            added_on: dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(faqDetail.added_date)),
            modify_on: dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(faqDetail.modify_date)),
        };

        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};


/**
 * ============================================
 * faq_detail_set - Create or Update FAQ detail
 * ============================================
 */
const faq_detail_set = async (req, res, next) => {
    const { id, type_id, question, answer, order } = req.body;
    try {
        const { FaqDetail } = db.models;

        let _id = id && validator.isNumeric(id.toString()) ? parseInt(id) : 0;
        let _type_id = type_id && validator.isNumeric(type_id.toString()) ? parseInt(type_id) : 0;

        // Validations
        if (_type_id <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please select FAQ type.", null));
        }
        if (!question || question.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter question.", null));
        }
        if (!answer || answer.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter answer.", null));
        }

        // Check for duplicate question
        const existingFaq = await FaqDetail.findOne({
            where: {
                faq_id: { [Op.ne]: _id },
                type_id: _type_id,
                question: question,
                is_deleted: false,
            },
        });

        if (existingFaq) {
            return res.status(200).json(success(false, res.statusCode, "Faq question is already exists.", null));
        }

        if (_id > 0) {
            // UPDATE
            const [affectedRows] = await FaqDetail.update(
                {
                    type_id: _type_id,
                    question: question,
                    answer: answer,
                    sort_order: order,
                    modify_date: db.get_ist_current_date(),
                    modify_by: req.token_data.account_id,
                },
                {
                    where: { faq_id: _id },
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
                        narration: 'FAQ details updated. Question name = ' + question,
                        query: '[ORM] FaqDetail.update()',
                        date_time: db.get_ist_current_date(),
                    };
                    action_logger.info(JSON.stringify(data_to_log));
                } catch (_) { }

                return res.status(200).json(success(true, res.statusCode, "Updated Successfully.", null));
            } else {
                return res.status(200).json(success(false, res.statusCode, "Unable to update, Please try again", null));
            }
        } else {
            // CREATE
            const newFaqDetail = await FaqDetail.create({
                type_id: _type_id,
                question: question,
                answer: answer,
                sort_order: order,
                is_enabled: true,
                added_by: req.token_data.account_id,
                modify_by: req.token_data.account_id,
                added_date: db.get_ist_current_date(),
                modify_date: db.get_ist_current_date(),
            });

            if (newFaqDetail && newFaqDetail.faq_id > 0) {
                try {
                    let data_to_log = {
                        correlation_id: correlator.getId(),
                        token_id: req.token_data.token_id,
                        account_id: req.token_data.account_id,
                        user_type: 1,
                        user_id: req.token_data.admin_id,
                        narration: 'New FAQ details added. Question name = ' + question,
                        query: '[ORM] FaqDetail.create()',
                        date_time: db.get_ist_current_date(),
                    };
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


/**
 * ============================================
 * faq_detail_toggle - Enable/Disable FAQ detail
 * ============================================
 */
const faq_detail_toggle = async (req, res, next) => {
    const { id } = req.body;
    try {
        const { FaqDetail } = db.models;

        const faqDetail = await FaqDetail.findOne({
            where: {
                faq_id: id,
                is_deleted: false,
            },
        });

        if (!faqDetail) {
            return res.status(200).json(success(false, res.statusCode, "Faq details not found.", null));
        }

        const [affectedRows] = await FaqDetail.update(
            {
                is_enabled: !faqDetail.is_enabled,
                modify_date: db.get_ist_current_date(),
                modify_by: req.token_data.account_id,
            },
            {
                where: { faq_id: id },
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
                    narration: 'FAQ details ' + (faqDetail.is_enabled ? 'disabled' : 'enabled') + '. Faq question = ' + faqDetail.question,
                    query: '[ORM] FaqDetail.update()',
                    date_time: db.get_ist_current_date(),
                };
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


// Export all functions
module.exports = {
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
