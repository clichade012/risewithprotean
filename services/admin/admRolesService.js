import { logger as _logger, action_logger } from '../../logger/winston.js';
import db from '../../database/db_helper.js';
import { success } from "../../model/responseModel.js";
import { Op } from 'sequelize';
import dateFormat from 'date-format';
import validator from 'validator';
import { API_STATUS } from '../../model/enumModel.js';
import correlator from 'express-correlation-id';


const role_set = async (req, res, next) => {
    const { role_id, role_name, role_level, checker_maker } = req.body;
    const { AdmRole } = db.models;
    try {
        let is_editable = true;

        let _role_id = role_id && validator.isNumeric(role_id.toString()) ? parseInt(role_id) : 0;
        let _checker_maker = checker_maker && validator.isNumeric(checker_maker.toString()) ? parseInt(checker_maker) : 0;
        let _role_level = role_level && validator.isNumeric(role_level.toString()) ? parseInt(role_level) : 0;

        if (!role_name || role_name.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter role name.", null));
        }

        // Check for duplicate role name
        const row1 = await AdmRole.findOne({
            where: {
                role_id: { [Op.ne]: _role_id },
                role_name: role_name,
                is_deleted: false
            },
            attributes: ['role_id']
        });

        if (row1) {
            return res.status(200).json(success(false, res.statusCode, "Role name is already exists.", null));
        }

        // Check if role exists and is editable (for update)
        const row2 = await AdmRole.findOne({
            where: {
                role_id: _role_id,
                is_deleted: false
            },
            attributes: ['role_id', 'is_editable', 'role_name']
        });

        if (row2 && !row2.is_editable) {
            return res.status(200).json(success(false, res.statusCode, "Administrator role can not edit.", null));
        }

        if (_role_id > 0) {
            // Update existing role
            const [affectedRows] = await AdmRole.update(
                {
                    role_name: role_name,
                    role_level: _role_level,
                    checker_maker: _checker_maker,
                    modify_by: req.token_data.account_id,
                    is_editable: is_editable,
                    modify_date: db.get_ist_current_date()
                },
                {
                    where: { role_id: _role_id }
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
                        narration: 'Role updated. Role name = ' + (row2.role_name == role_name ? role_name : row2.role_name + ' to ' + role_name),
                        query: JSON.stringify({
                            role_id: _role_id,
                            role_name: role_name,
                            role_level: _role_level
                        }),
                        date_time: db.get_ist_current_date(),
                    }
                    action_logger.info(JSON.stringify(data_to_log));
                } catch (_) { }

                return res.status(200).json(success(true, res.statusCode, "Updated successfully.", null));
            } else {
                return res.status(200).json(success(false, res.statusCode, "Unable to update, Please try again", null));
            }
        } else {
            // Create new role
            const newRole = await AdmRole.create({
                role_name: role_name,
                role_level: _role_level,
                is_enabled: true,
                is_deleted: false,
                added_by: req.token_data.account_id,
                modify_by: req.token_data.account_id,
                added_date: db.get_ist_current_date(),
                modify_date: db.get_ist_current_date(),
                is_editable: is_editable,
                checker_maker: _checker_maker
            });

            const roleId = newRole?.role_id ?? 0;

            if (roleId > 0) {
                try {
                    let data_to_log = {
                        correlation_id: correlator.getId(),
                        token_id: req.token_data.token_id,
                        account_id: req.token_data.account_id,
                        user_type: 1,
                        user_id: req.token_data.admin_id,
                        narration: 'New role added. Role name ' + role_name,
                        query: JSON.stringify({
                            role_name: role_name,
                            role_level: _role_level
                        }),
                        date_time: db.get_ist_current_date(),
                    }
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

const role_list = async (req, res, next) => {
    const { page_no, role_level, search_text } = req.body;
    const { AdmRole } = db.models;
    try {
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0; if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";
        let _role_level = role_level && validator.isNumeric(role_level.toString()) ? parseInt(role_level) : 0;

        // Build where clause with case-insensitive search
        const whereClause = {
            is_deleted: false,
            ...(_search_text && {
                [Op.and]: [
                    db.sequelize.where(
                        db.sequelize.fn('LOWER', db.sequelize.col('role_name')),
                        { [Op.like]: db.sequelize.fn('LOWER', _search_text + '%') }
                    )
                ]
            })
        };

        // Count total records
        const total_record = await AdmRole.count({ where: whereClause });

        // Get paginated list
        const row1 = await AdmRole.findAll({
            where: whereClause,
            attributes: ['role_id', 'role_name', 'role_level', 'is_editable', 'checker_maker', 'is_enabled', 'added_date', 'modify_date'],
            order: [['role_id', 'DESC']],
            limit: parseInt(process.env.PAGINATION_SIZE),
            offset: (_page_no - 1) * parseInt(process.env.PAGINATION_SIZE),
            raw: true
        });

        let list = [];
        if (row1) {
            for (let index = 0; index < row1.length; index++) {
                const item = row1[index];
                list.push({
                    sr_no: (_page_no - 1) * parseInt(process.env.PAGINATION_SIZE) + index + 1,
                    role_id: item.role_id,
                    role_level: item.role_level,
                    role_name: item.role_name,
                    enabled: item.is_enabled,
                    is_editable: item.is_editable,
                    checker_maker: item.checker_maker,
                    added_on: item.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.added_date)) : "",
                    modify_on: item.modify_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.modify_date)) : "",
                })
            }
        }
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

const role_get = async (req, res, next) => {
    const { role_id } = req.body;
    const { AdmRole } = db.models;
    try {
        const row1 = await AdmRole.findOne({
            where: {
                role_id: role_id,
                is_deleted: false
            },
            attributes: ['role_id', 'role_name', 'role_level', 'checker_maker', 'is_enabled', 'is_deleted', 'added_date', 'modify_date', 'is_editable'],
            raw: true
        });

        if (!row1) {
            return res.status(200).json(success(false, res.statusCode, "role details not found.", null));
        }

        const results = {
            role_id: row1.role_id,
            role_name: row1.role_name,
            role_level: row1.role_level,
            is_enabled: row1.is_enabled,
            is_editable: row1.is_editable,
            checker_maker: row1.checker_maker,
            added_date: dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(row1.added_date)),
            modify_date: dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(row1.modify_date)),
        };

        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const role_toggle = async (req, res, next) => {
    const { role_id } = req.body;
    const { AdmRole } = db.models;
    try {
        const row1 = await AdmRole.findOne({
            where: {
                role_id: role_id,
                is_deleted: false
            },
            attributes: ['role_id', 'is_enabled', 'role_name', 'is_editable'],
            raw: true
        });

        if (!row1) {
            return res.status(200).json(success(false, res.statusCode, "Role details not found.", null));
        }

        if (!row1.is_editable) {
            return res.status(200).json(success(false, API_STATUS.RELOAD_PAGE_DATA.value, "Administrator role can not be edit.", null));
        }

        // Toggle is_enabled - Using ORM
        const newEnabledStatus = !row1.is_enabled;
        const [affectedRows] = await AdmRole.update(
            {
                is_enabled: newEnabledStatus,
                modify_date: db.get_ist_current_date(),
                modify_by: req.token_data.account_id
            },
            {
                where: { role_id: role_id }
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
                    narration: 'Role ' + (row1.is_enabled == true ? 'disabled' : 'enabled') + '. Role name = ' + row1.role_name,
                    query: JSON.stringify({
                        role_id: role_id,
                        is_enabled_toggled: true
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

const role_delete = async (req, res, next) => {
    const { role_id } = req.body;
    const { AdmRole, AdmUser } = db.models;
    try {
        let _role_id = role_id && validator.isNumeric(role_id.toString()) ? parseInt(role_id) : 0;

        const row3 = await AdmRole.findOne({
            where: {
                role_id: role_id,
                is_deleted: false
            },
            attributes: ['role_id', 'is_editable', 'role_name'],
            raw: true
        });

        if (!row3) {
            return res.status(200).json(success(false, res.statusCode, "Role details not found.", null));
        }

        if (!row3.is_editable) {
            return res.status(200).json(success(false, res.statusCode, "Administrator role name can not be deleted.", null));
        }

        const row4 = await AdmUser.findOne({
            where: {
                role_id: role_id,
                is_deleted: false
            },
            attributes: ['admin_id'],
            raw: true
        });

        if (row4) {
            return res.status(200).json(success(false, res.statusCode, "This role is already assign to users and can not be deleted.", null));
        }

        const [affectedRows] = await AdmRole.update(
            {
                is_deleted: true,
                modify_date: db.get_ist_current_date(),
                modify_by: req.token_data.account_id
            },
            {
                where: { role_id: _role_id }
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
                    narration: 'Role deleted. Role name = ' + row3.role_name,
                    query: JSON.stringify({
                        role_id: _role_id,
                        is_deleted: true
                    }),
                    date_time: db.get_ist_current_date(),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }

            return res.status(200).json(success(true, res.statusCode, "Role deleted successfully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to delete role, please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
}

const role_dropdown = async (req, res, next) => {
    const { AdmRole } = db.models;
    try {
        const row1 = await AdmRole.findAll({
            where: {
                is_deleted: false,
                is_enabled: true
            },
            attributes: ['role_id', 'role_name'],
            raw: true
        });

        const list = row1?.map(item => ({
            role_id: item.role_id,
            role_name: item.role_name,
        })) || [];

        return res.status(200).json(success(true, res.statusCode, "", list));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const permission_list = async (req, res, next) => {
    const { role_id } = req.body;
    const { AdmRole, AdmPermission, AdmRolePermission } = db.models;
    try {
        let _role_id = role_id && validator.isNumeric(role_id.toString()) ? parseInt(role_id) : 0;

        // Get role details - Using ORM
        const row5 = await AdmRole.findOne({
            where: {
                role_id: _role_id,
                is_deleted: false
            },
            attributes: ['role_name'],
            raw: true
        });

        if (row5) {
            // Get all permissions - Using ORM
            const allPermissions = await AdmPermission.findAll({
                attributes: ['permission_id', 'menu_name', 'has_submenu', 'parent_id'],
                raw: true
            });

            // Get role permissions for this role - Using ORM
            const rolePermissions = await AdmRolePermission.findAll({
                where: { role_id: _role_id },
                attributes: ['permission_id', 'is_allowed'],
                raw: true
            });

            // Create a map of permission_id to is_allowed for quick lookup
            const permissionMap = {};
            for (const rp of rolePermissions) {
                permissionMap[rp.permission_id] = rp.is_allowed;
            }

            // Merge permissions with role permissions
            let results = [];
            if (allPermissions) {
                for (const item of allPermissions) {
                    results.push({
                        menu_id: item.permission_id,
                        menu_name: item.menu_name,
                        has_submenu: item.has_submenu,
                        parent_id: item.parent_id,
                        is_allowed: permissionMap[item.permission_id] || false,
                    });
                }
            }

            return res.status(200).json(success(true, res.statusCode, "Roles Permission Data.", {
                role: row5.role_name,
                data: results
            }));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Role details not found, Please try again", null));
        }

    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const permission_update = async (req, res, next) => {
    const { role_id, permissions } = req.body;
    const { AdmRole, AdmRolePermission } = db.models;
    try {
        let _role_id = role_id && validator.isNumeric(role_id.toString()) ? parseInt(role_id) : 0;

        const row4 = await AdmRole.findOne({
            where: {
                role_id: _role_id,
                is_deleted: false
            },
            raw: true
        });

        if (row4) {
            console.log(permissions);
            for (const item of permissions) {
                let _menu_id = item.menu_id && validator.isNumeric(item.menu_id.toString()) ? parseInt(item.menu_id) : 0;
                let is_allowed = item.is_allowed || false;

                const row1 = await AdmRolePermission.findOne({
                    where: {
                        role_id: _role_id,
                        permission_id: _menu_id
                    },
                    attributes: ['permission_id'],
                    raw: true
                });

                if (row1) {
                    await AdmRolePermission.update(
                        {
                            is_allowed: is_allowed,
                            modify_by: req.token_data.account_id,
                            modify_date: db.get_ist_current_date()
                        },
                        {
                            where: {
                                role_id: _role_id,
                                permission_id: _menu_id
                            }
                        }
                    );
                }
                else {
                    await AdmRolePermission.create({
                        role_id: _role_id,
                        permission_id: _menu_id,
                        is_allowed: is_allowed,
                        added_by: req.token_data.account_id,
                        modify_by: req.token_data.account_id,
                        added_date: db.get_ist_current_date(),
                        modify_date: db.get_ist_current_date()
                    });
                }
            }
            let tempArray = [];
            for (const item of permissions) {
                let _menu_id = item.menu_id && validator.isNumeric(item.menu_id.toString()) ? parseInt(item.menu_id) : 0;
                if (_menu_id > 0) {
                    tempArray.push(_menu_id);
                }
            }
            if (tempArray.length > 0) {
                await AdmRolePermission.update(
                    {
                        is_allowed: false,
                        modify_by: req.token_data.account_id,
                        modify_date: db.get_ist_current_date()
                    },
                    {
                        where: {
                            role_id: _role_id,
                            permission_id: { [Op.notIn]: tempArray }
                        }
                    }
                );

                try {
                    let data_to_log = {
                        correlation_id: correlator.getId(),
                        token_id: req.token_data.token_id,
                        account_id: req.token_data.account_id,
                        user_type: 1,
                        user_id: req.token_data.admin_id,
                        narration: 'Role permission updated. Role name = ' + row4.role_name,
                        query: JSON.stringify({
                            role_id: _role_id,
                            permissions_updated: tempArray
                        }),
                        date_time: db.get_ist_current_date(),
                    }
                    action_logger.info(JSON.stringify(data_to_log));
                } catch (_) { }
            }

            return res.status(200).json(success(true, res.statusCode, "Permission saved successfully.", null));
        }
        else {
            return res.status(200).json(success(false, res.statusCode, "Role details not found, Please try again.", null));
        }

    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};


export default {
    role_set,
    role_list,
    role_get,
    role_toggle,
    role_delete,
    role_dropdown,
    permission_list,
    permission_update,
};
