import { logger as _logger, action_logger } from '../../logger/winston.js';
import db from '../../database/db_helper.js';
import { success } from "../../model/responseModel.js";
import validator from 'validator';
import correlator from 'express-correlation-id';

const cms_get_started_get = async (req, res, next) => {
    try {
        const { GetStarted } = db.models;
        let section_1 = null;
        const row2 = await GetStarted.findOne({
            where: { table_id: 1 },
            attributes: ['title_text', 'heading_text', 'contents', 'image_1']
        });
        if (row2) {
            let image_1 = row2.image_1 && row2.image_1.length > 0 ? db.get_uploads_url(req) + row2.image_1 : '';
            section_1 = {
                title: row2.title_text,
                heading: row2.heading_text,
                contents: row2.contents,
                image_1: image_1,
            };
        }
        let section_2 = null;
        const row3 = await GetStarted.findOne({
            where: { table_id: 2 },
            attributes: ['title_text', 'heading_text', 'contents', 'image_1']
        });
        if (row3) {
            let image_1 = row3.image_1 && row3.image_1.length > 0 ? db.get_uploads_url(req) + row3.image_1 : '';
            section_2 = {
                title: row3.title_text,
                heading: row3.heading_text,
                contents: row3.contents,
                image_1: image_1,
            };
        }
        let section_3 = null;
        const row4 = await GetStarted.findOne({
            where: { table_id: 3 },
            attributes: ['title_text', 'heading_text', 'contents', 'image_1']
        });
        if (row4) {
            let image_1 = row4.image_1 && row4.image_1.length > 0 ? db.get_uploads_url(req) + row4.image_1 : '';
            section_3 = {
                title: row4.title_text,
                heading: row4.heading_text,
                contents: row4.contents,
                image_1: image_1,
            };
        }
        let results = {
            section_1: section_1,
            section_2: section_2,
            section_3: section_3,
        };
        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
}

const cms_get_started_set = async (req, res, next) => {
    const { table_id, title, heading, contents } = req.body;
    try {
        const { GetStarted } = db.models;
        let _table_id = table_id && validator.isNumeric(table_id.toString()) ? parseInt(table_id) : 0;

        const row1 = await GetStarted.findOne({
            where: { table_id: _table_id },
            attributes: ['table_id', 'section_name']
        });
        if (!row1) {
            return res.status(200).json(success(false, res.statusCode, "Section details not found, Please try again.", null));
        }

        if (!title || title.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter title.", null));
        }
        if (!heading || heading.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter heading.", null));
        }
        if (!contents || contents.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter contents.", null));
        }
        let image_1 = req.files['desktop'] && req.files['desktop'].length > 0 ? req.files['desktop'][0].filename : '';

        const updateData = {
            title_text: title,
            heading_text: heading,
            contents: contents,
            modify_by: req.token_data.account_id,
            modify_date: db.get_ist_current_date(),
        };
        if (image_1.length > 0) {
            updateData.image_1 = image_1;
        }

        const [affectedRows] = await GetStarted.update(updateData, {
            where: { table_id: _table_id }
        });
        if (affectedRows > 0) {

            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: 'Update contents for "Get Started" (section = ' + row1.section_name + ')',
                    query: 'GetStarted.update',
                    date_time: db.get_ist_current_date(),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }


            return res.status(200).json(success(true, res.statusCode, "Updated successfully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to updated, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
}

export default {
    cms_get_started_get,
    cms_get_started_set,
}
