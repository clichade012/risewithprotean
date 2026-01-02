import { logger as _logger, action_logger } from '../../logger/winston.js';
import db from '../../database/db_helper.js';
import { success } from "../../model/responseModel.js";
import { Op, literal } from 'sequelize';
import dateFormat from 'date-format';
import validator from 'validator';
import correlator from 'express-correlation-id';

// Helper: Parse numeric value
const parseNumericId = (value, defaultVal = 0) => {
    return value && validator.isNumeric(value.toString()) ? parseInt(value) : defaultVal;
};

// Helper: Update existing category
const updateCategory = async (ProductCategory, categoryId, name, order, groupTypeId, accountId) => {
    const oldCategory = await ProductCategory.findOne({
        where: { category_id: categoryId, is_deleted: false },
        raw: true
    });

    const [affectedRows] = await ProductCategory.update(
        {
            category_name: name,
            order_by: order,
            group_type: groupTypeId,
            modify_date: db.get_ist_current_date(),
            modify_by: accountId
        },
        { where: { category_id: categoryId } }
    );

    return { affectedRows, oldName: oldCategory?.category_name || "" };
};

// Helper: Create new category
const createCategory = async (ProductCategory, name, order, groupTypeId, accountId) => {
    const newCategory = await ProductCategory.create({
        category_name: name,
        order_by: order,
        group_type: groupTypeId,
        added_by: accountId,
        modify_by: accountId,
        added_date: db.get_ist_current_date(),
        modify_date: db.get_ist_current_date()
    });
    return newCategory?.category_id ?? 0;
};

const productCategoryList = async (req, res, next) => {
    const { page_no, search_text } = req.body;
    try {
        const { ProductCategory } = db.models;

        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0;
        if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";

        const pageSize = parseInt(process.env.PAGINATION_SIZE);
        const offset = (_page_no - 1) * pageSize;

        // Build where clause
        const whereClause = {
            is_deleted: false,
            ..._search_text && {
                category_name: {
                    [Op.iLike]: `${_search_text}%`
                }
            }
        };

        // Get total count
        const total_record = await ProductCategory.count({ where: whereClause });

        // Get paginated list with custom ordering
        const rows = await ProductCategory.findAll({
            where: whereClause,
            order: [
                [literal('CASE WHEN COALESCE(order_by, 0) <= 0 THEN 2147483647 ELSE COALESCE(order_by, 0) END'), 'ASC'],
                ['category_id', 'ASC']
            ],
            limit: pageSize,
            offset: offset,
            raw: true
        });

        const formatDate = (date) => date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(date)) : "";

        const list = rows.map((item, index) => ({
            sr_no: offset + index + 1,
            category_id: item.category_id,
            category_name: item.category_name,
            order_by: item.order_by,
            group_type: item.group_type,
            enabled: item.is_enabled,
            added_date: formatDate(item.added_date),
            modify_on: formatDate(item.modify_date),
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

const productCategoryGet = async (req, res, next) => {
    const { id } = req.body;
    try {
        const { ProductCategory } = db.models;

        const category = await ProductCategory.findOne({
            where: {
                category_id: id,
                is_deleted: false
            },
            raw: true
        });

        if (!category) {
            return res.status(200).json(success(false, res.statusCode, "Product Category details not found.", null));
        }

        const results = {
            category_id: category.category_id,
            category_name: category.category_name,
            order_by: category.order_by,
            group_type: category.group_type,
            enabled: category.is_enabled,
            added_on: category.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(category.added_date)) : "",
            modify_on: category.modify_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(category.modify_date)) : "",
        };

        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const productCategorySet = async (req, res, next) => {
    const { id, name, order, groupType } = req.body;
    try {
        const { ProductCategory } = db.models;

        const categoryId = parseNumericId(id);
        const groupTypeId = parseNumericId(groupType, 1);

        if (!name || name.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter category.", null));
        }

        const existingCategory = await ProductCategory.findOne({
            where: { category_id: { [Op.ne]: categoryId }, category_name: name, is_deleted: false },
            raw: true
        });

        if (existingCategory) {
            return res.status(200).json(success(false, res.statusCode, "Category is already exists.", null));
        }

        if (categoryId > 0) {
            const { affectedRows, oldName } = await updateCategory(ProductCategory, categoryId, name, order, groupTypeId, req.token_data.account_id);

            if (affectedRows <= 0) {
                return res.status(200).json(success(false, res.statusCode, "Unable to update, Please try again", null));
            }

            const narration = oldName && oldName !== name
                ? `Product category updated. Name changed from "${oldName}" to "${name}"`
                : `Product category updated. Name = "${name}"`;
            logAction(req, narration, 'UPDATE', { categoryId, name, order, groupTypeId });
            return res.status(200).json(success(true, res.statusCode, "Updated successfully.", null));
        }

        const newCategoryId = await createCategory(ProductCategory, name, order, groupTypeId, req.token_data.account_id);

        if (newCategoryId <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Unable to save, Please try again", null));
        }

        logAction(req, `New category added. Category name = ${name}`, 'INSERT', { name, order, groupTypeId });
        return res.status(200).json(success(true, res.statusCode, "Saved successfully.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const productCategoryToggle = async (req, res, next) => {
    const { id } = req.body;
    try {
        const { ProductCategory } = db.models;

        const category = await ProductCategory.findOne({
            where: {
                category_id: id,
                is_deleted: false
            },
            raw: true
        });

        if (!category) {
            return res.status(200).json(success(false, res.statusCode, "Category details not found.", null));
        }

        const newEnabledStatus = !category.is_enabled;

        const [affectedRows] = await ProductCategory.update(
            {
                is_enabled: newEnabledStatus,
                modify_date: db.get_ist_current_date(),
                modify_by: req.token_data.account_id
            },
            {
                where: { category_id: id }
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
                    narration: 'Category ' + (category.is_enabled === true ? 'disabled' : 'enabled') + '. Category name = ' + category.category_name,
                    query: `ProductCategory.update({ is_enabled: ${newEnabledStatus} }, { where: { category_id: ${id} }})`,
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

const productCategoryDropdown = async (req, res, next) => {
    const { groupType } = req.body;
    try {
        const { ProductCategory } = db.models;

        let groupTypeId = groupType && validator.isNumeric(groupType.toString()) ? parseInt(groupType) : 1;

        const rows = await ProductCategory.findAll({
            attributes: ['category_id', 'category_name'],
            where: {
                group_type: groupTypeId,
                is_enabled: true,
                is_deleted: false
            },
            order: [
                [literal('CASE WHEN COALESCE(order_by, 0) <= 0 THEN 2147483647 ELSE COALESCE(order_by, 0) END'), 'ASC'],
                ['category_id', 'ASC']
            ],
            raw: true
        });

        const list = rows.map(item => ({
            category_id: item.category_id,
            category_name: item.category_name,
        }));

        return res.status(200).json(success(true, res.statusCode, "", list));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const productCategoryDelete = async (req, res, next) => {
    const { id } = req.body;
    try {
        const { ProductCategory } = db.models;

        const category = await ProductCategory.findOne({
            where: {
                category_id: id,
                is_deleted: false
            },
            raw: true
        });

        if (!category) {
            return res.status(200).json(success(false, res.statusCode, "category details not found.", null));
        }

        await ProductCategory.update(
            { is_deleted: true },
            { where: { category_id: id } }
        );

        try {
            let data_to_log = {
                correlation_id: correlator.getId(),
                token_id: req.token_data.token_id,
                account_id: req.token_data.account_id,
                user_type: 1,
                user_id: req.token_data.admin_id,
                narration: 'category deleted. category name ' + category.category_name,
                query: `ProductCategory.update({ is_deleted: true }, { where: { category_id: ${id} }})`,
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

function logAction(req, narration, operation, data) {
    try {
        const dataToLog = {
            correlation_id: correlator.getId(),
            token_id: req.token_data.token_id,
            account_id: req.token_data.account_id,
            user_type: 1,
            user_id: req.token_data.admin_id,
            narration,
            query: `ProductCategory.${operation}(${JSON.stringify(data)})`,
            date_time: db.get_ist_current_date()
        };
        action_logger.info(JSON.stringify(dataToLog));
    } catch (logErr) {
        _logger.warn("Failed to log action: " + logErr.message);
    }
}

export default {
    productCategoryList,
    productCategoryGet,
    productCategorySet,
    productCategoryToggle,
    productCategoryDropdown,
    productCategoryDelete
};
