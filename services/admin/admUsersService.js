import { logger as _logger, action_logger } from '../../logger/winston.js';
import db from '../../database/db_helper.js';
import { success } from '../../model/responseModel.js';
import { Op } from 'sequelize';
import dateFormat from 'date-format';
import validator from 'validator';
import { randomUUID } from 'crypto';
import { EmailTemplates } from '../../model/enumModel.js';
import emailTransporter from '../../services/emailService.js';
import excel from 'exceljs';
import correlator from 'express-correlation-id';

// Helper function to get models - must be called after db is initialized
const getModels = () => db.models;

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
            query,
            date_time: db.get_ist_current_date(),
        }));
    } catch (_) { }
};

// Helper: Replace email template tags
const replaceEmailTags = (text, userData, extraTags = {}) => {
    if (!text) return "";
    let result = text;
    result = result.replaceAll(process.env.EMAIL_TAG_FIRST_NAME, userData.first_name);
    result = result.replaceAll(process.env.EMAIL_TAG_LAST_NAME, userData.last_name);
    result = result.replaceAll(process.env.EMAIL_TAG_EMAIL_ID, userData.email_id);
    result = result.replaceAll(process.env.EMAIL_TAG_MOBILE_NO, userData.mobile_no);
    result = result.replaceAll(process.env.SITE_URL_TAG, process.env.FRONT_SITE_URL);
    Object.entries(extraTags).forEach(([tag, value]) => {
        result = result.replaceAll(tag, value);
    });
    return result;
};

// Helper: Send email with template
const sendEmailWithTemplate = async (templateId, userData, extraTags = {}) => {
    const { EmailTemplate } = getModels();
    const template = await EmailTemplate.findOne({
        where: { template_id: templateId },
        attributes: ['subject', 'body_text', 'is_enabled']
    });

    if (!template) return { success: false, code: -3 }; // Template not found
    if (!template.is_enabled) return { success: false, code: -4 }; // Template disabled

    const subject = replaceEmailTags(template.subject, userData, extraTags);
    const body = replaceEmailTags(template.body_text, userData, extraTags);

    try {
        await emailTransporter.sendMail({
            from: process.env.EMAIL_CONFIG_SENDER,
            to: userData.email_id,
            subject,
            html: body
        });
        return { success: true, code: 1 };
    } catch (err) {
        _logger.error(err.stack);
        return { success: false, code: 0 }; // Send failed
    }
};




const send_invite_link = async (admin_id) => {
    const { AdmUser, AdmLinkAct } = getModels();

    const user = await AdmUser.findOne({
        where: { admin_id, is_deleted: false },
        attributes: ['first_name', 'last_name', 'email_id', 'mobile_no', 'is_activated']
    });

    if (!user) return 0; // Admin data not found
    if (user.is_activated) return -1; // Already activated

    const uuid = randomUUID();
    const link_data = { page: 'admin_invite', token: uuid.toString() };
    const encoded_data = encodeURIComponent(Buffer.from(JSON.stringify(link_data), 'utf8').toString('base64'));
    const activation_link = process.env.FRONT_SITE_URL + 'email/' + encoded_data;

    const linkRecord = await AdmLinkAct.create({
        unique_id: uuid,
        admin_id: admin_id,
        sent_date: db.get_ist_current_date()
    });

    if (!linkRecord?.activation_id) return -2; // Unable to add invite link uuid

    const result = await sendEmailWithTemplate(
        EmailTemplates.ADMIN_USER_ACTIVATION_LINK.value,
        user,
        { [process.env.EMAIL_TAG_ACTIVATION_LINK]: activation_link }
    );

    return result.code;
};

const send_reset_link = async (admin_id) => {
    const { AdmUser, AdmLinkReset } = getModels();

    const user = await AdmUser.findOne({
        where: { admin_id, is_deleted: false },
        attributes: ['first_name', 'last_name', 'email_id', 'mobile_no', 'is_activated']
    });

    if (!user) return 0; // Admin data not found
    if (!user.is_activated) return -1; // Account not activated

    const uuid = randomUUID();
    const link_data = { page: 'admin_reset', token: uuid.toString() };
    const encoded_data = encodeURIComponent(Buffer.from(JSON.stringify(link_data), 'utf8').toString('base64'));
    const reset_link = process.env.FRONT_SITE_URL + 'email/' + encoded_data;

    const linkRecord = await AdmLinkReset.create({
        unique_id: uuid,
        admin_id: admin_id,
        sent_date: db.get_ist_current_date()
    });

    if (!linkRecord?.reset_id) return -2; // Unable to add reset link uuid

    const result = await sendEmailWithTemplate(
        EmailTemplates.ADMIN_USER_RESET_PASS_LINK.value,
        user,
        { [process.env.EMAIL_TAG_RESET_PASS_LINK]: reset_link }
    );

    return result.code;
};

const admin_user_list = async (req, res, next) => {
    const { page_no, search_text } = req.body;
    try {
        const { AdmUser, AdmRole } = getModels();
        const _page_no = Math.max(1, parseNumericWithDefault(page_no, 1));
        const _search_text = search_text?.length > 0 ? search_text : "";
        const formatDate = (date) => date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(date)) : "";

        const searchCondition = _search_text.length > 0 ? {
            [Op.or]: [
                { first_name: { [Op.iLike]: `${_search_text}%` } },
                { last_name: { [Op.iLike]: `${_search_text}%` } },
                { email_id: { [Op.iLike]: `${_search_text}%` } },
                { mobile_no: { [Op.iLike]: `${_search_text}%` } }
            ]
        } : {};

        const whereClause = { is_deleted: false, ...searchCondition };
        const total_record = await AdmUser.count({ where: whereClause });
        const offset = (_page_no - 1) * parseInt(process.env.PAGINATION_SIZE);

        const users = await AdmUser.findAll({
            where: whereClause,
            attributes: ['admin_id', 'first_name', 'last_name', 'email_id', 'mobile_no',
                'login_name', 'is_master', 'is_enabled', 'added_date', 'modify_date', 'is_activated', 'activate_date'],
            include: [{ model: AdmRole, as: 'role', attributes: ['role_name'], required: true }],
            order: [['admin_id', 'DESC']],
            limit: parseInt(process.env.PAGINATION_SIZE),
            offset
        });

        const list = (users || []).map((item, index) => ({
            sr_no: offset + index + 1,
            admin_id: item.admin_id,
            first_name: item.first_name,
            last_name: item.last_name,
            email_id: item.email_id,
            mobile_no: item.mobile_no,
            login_name: item.login_name,
            role_name: item.role?.role_name || '',
            enabled: item.is_enabled,
            is_master: item.is_master,
            is_activated: item.is_activated,
            added_on: formatDate(item.added_date),
            modify_on: formatDate(item.modify_date),
            activate_date: formatDate(item.activate_date)
        }));

        const results = {
            current_page: _page_no,
            total_pages: Math.ceil(total_record / process.env.PAGINATION_SIZE),
            data: list
        };
        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const admin_user_get = async (req, res, next) => {
    const { admin_id } = req.body;
    const { AdmUser } = getModels();
    try {
        const row1 = await AdmUser.findOne({
            where: {
                admin_id,
                is_deleted: false
            },
            attributes: [
                'admin_id',
                'first_name',
                'last_name',
                'email_id',
                'mobile_no',
                'login_name',
                'login_pass',
                'is_master',
                'is_enabled',
                'is_deleted',
                'added_by',
                'modify_by',
                'added_date',
                'modify_date',
                'role_id',
                'is_activated',
                'activate_date'
            ]
        });

        if (!row1) {
            return res.status(200).json(success(false, res.statusCode, "admin details not found.", null));
        }
        const results = {
            admin_id: row1.admin_id,
            role_id: row1.role_id,
            first_name: row1.first_name,
            last_name: row1.last_name,
            email_id: row1.email_id,
            mobile_no: row1.mobile_no,
            login_name: row1.login_name,
            is_enabled: row1.is_enabled,
            added_date: dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(row1.added_date)),
            modify_date: dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(row1.modify_date)),
        };

        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const admin_user_set = async (req, res, next) => {
    const { AdmUser } = getModels();
    const { first_name, last_name, email_id, mobile_no, role_id } = req.body;
    try {
        const _role_id = parseNumericWithDefault(role_id);

        // Validation checks
        if (!first_name?.length) return res.status(200).json(success(false, res.statusCode, "Please enter first name.", null));
        if (first_name.length > 30) return res.status(200).json(success(false, res.statusCode, "First name should not be more than 30 character", null));
        if (!last_name?.length) return res.status(200).json(success(false, res.statusCode, "Please enter last name.", null));
        if (last_name.length > 30) return res.status(200).json(success(false, res.statusCode, "Last name should not be more than 30 character", null));
        if (!email_id?.length) return res.status(200).json(success(false, res.statusCode, "Please enter email id.", null));
        if (!validator.isEmail(email_id)) return res.status(200).json(success(false, res.statusCode, "Please enter correct email address.", null));
        if (!mobile_no?.length) return res.status(200).json(success(false, res.statusCode, "Please enter mobile no.", null));
        if (!validator.isNumeric(mobile_no) || mobile_no.length !== 10) return res.status(200).json(success(false, res.statusCode, "Invalid mobile number.", null));

        // Check duplicates
        const emailExists = await AdmUser.findOne({ where: { email_id, is_deleted: false }, attributes: ['admin_id'] });
        if (emailExists) return res.status(200).json(success(false, res.statusCode, "Email address is already registered.", null));

        const mobileExists = await AdmUser.findOne({ where: { mobile_no, is_deleted: false }, attributes: ['admin_id'] });
        if (mobileExists) return res.status(200).json(success(false, res.statusCode, "Mobile number is already registered.", null));

        // Create new admin user
        const newUser = await AdmUser.create({
            first_name, last_name, email_id, mobile_no,
            login_name: email_id, login_pass: '',
            is_master: false, is_enabled: true, is_deleted: false,
            added_by: 1, added_date: db.get_ist_current_date(),
            role_id: _role_id, is_activated: false,
            modify_by: req.token_data.account_id
        });

        if (!newUser?.admin_id) {
            return res.status(200).json(success(false, res.statusCode, "Unable to save, Please try again", null));
        }

        await send_invite_link(newUser.admin_id);
        logAction(req, 'New admin user added and sent invite link. User email = ' + email_id, 'ORM create AdmUser');
        return res.status(200).json(success(true, res.statusCode, "Saved successfully.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const admin_user_toggle = async (req, res, next) => {
    const { admin_id } = req.body;
    try {
        const { AdmUser } = getModels();

        // Get admin details - Using ORM
        const row1 = await AdmUser.findOne({
            where: { admin_id: admin_id, is_deleted: false },
            attributes: ['admin_id', 'is_enabled', 'email_id']
        });
        if (!row1) {
            return res.status(200).json(success(false, res.statusCode, "admin details not found.", null));
        }

        // Check if master admin - Using ORM
        const row3 = await AdmUser.findOne({
            where: { admin_id: admin_id, is_deleted: false },
            attributes: ['admin_id', 'is_master']
        });
        if (row3) {
            const is_master = row3.is_master;
            if (is_master) {
                return res.status(200).json(success(false, res.statusCode, "Master administrator status can not be change", null));
            }
        }

        // Toggle is_enabled - Using ORM
        const newEnabledStatus = !row1.is_enabled;
        const [affectedRows] = await AdmUser.update({
            is_enabled: newEnabledStatus,
            modify_date: db.get_ist_current_date(),
            modify_by: req.token_data.account_id
        }, {
            where: { admin_id: admin_id }
        });

        if (affectedRows > 0) {
            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: 'Admin user ' + (row1.is_enabled ? 'disabled' : 'enabled') + ' User email id ' + row1.email_id,
                    query: 'ORM update AdmUser',
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

const admin_user_delete = async (req, res, next) => {
    const { admin_id } = req.body;
    try {
        const { AdmUser, AdmToken } = getModels();

        let _admin_id = admin_id && validator.isNumeric(admin_id.toString()) ? parseInt(admin_id) : 0;

        // Get admin details - Using ORM
        const row3 = await AdmUser.findOne({
            where: { admin_id: _admin_id, is_deleted: false },
            attributes: ['admin_id', 'is_master', 'email_id']
        });
        if (!row3) {
            return res.status(200).json(success(false, res.statusCode, "Admin user details not found.", null));
        }
        if (row3.is_master) {
            return res.status(200).json(success(false, res.statusCode, "Master administrator can not be deleted directly.", null));
        }

        // Soft delete admin user - Using ORM
        const [affectedRows] = await AdmUser.update({
            is_deleted: true,
            modify_date: db.get_ist_current_date(),
            modify_by: req.token_data.account_id
        }, {
            where: { admin_id: _admin_id }
        });

        if (affectedRows > 0) {
            // Logout all sessions - Using ORM
            await AdmToken.update({
                is_logout: true,
                logout_time: db.get_ist_current_date()
            }, {
                where: { admin_id: _admin_id, is_logout: false }
            });

            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: 'Admin user deleted. User email id = ' + row3.email_id,
                    query: 'ORM update AdmUser',
                    date_time: db.get_ist_current_date(),
                };
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }

            return res.status(200).json(success(true, res.statusCode, "User account deleted successfully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to delete user, please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const user_send_invite = async (req, res, next) => {
    const { admin_id } = req.body;

    try {
        const { AdmUser } = getModels();

        let _admin_id = admin_id && validator.isNumeric(admin_id.toString()) ? parseInt(admin_id) : 0;

        // Get admin details - Using ORM
        const row3 = await AdmUser.findOne({
            where: { admin_id: _admin_id, is_deleted: false },
            attributes: ['admin_id', 'is_master', 'email_id']
        });

        if (row3) {
            let i = await send_invite_link(row3.admin_id);
            if (i > 0) {
                try {
                    let data_to_log = {
                        correlation_id: correlator.getId(),
                        token_id: req.token_data.token_id,
                        account_id: req.token_data.account_id,
                        user_type: 1,
                        user_id: req.token_data.admin_id,
                        narration: 'Invite link sent to admin user. User email id = ' + row3.email_id,
                        query: 'ORM findOne AdmUser',
                        date_time: db.get_ist_current_date(),
                    };
                    action_logger.info(JSON.stringify(data_to_log));
                } catch (_) { }

                return res.status(200).json(success(true, res.statusCode, "Invite link has been sent on email address.", null));
            } else {
                return res.status(200).json(success(false, res.statusCode, "Invite link sending failure, Please try again.", null));
            }
        } else {
            return res.status(200).json(success(false, res.statusCode, "Account details not found, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const all_users_excel = async (req, res, next) => {
    const { search_text } = req.body;
    try {
        const { AdmUser, AdmRole } = getModels();
        const _search_text = search_text?.length > 0 ? search_text : "";
        const formatDate = (date) => date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(date)) : "";

        const searchCondition = _search_text.length > 0 ? {
            [Op.or]: [
                { first_name: { [Op.iLike]: `${_search_text}%` } },
                { last_name: { [Op.iLike]: `${_search_text}%` } },
                { email_id: { [Op.iLike]: `${_search_text}%` } },
                { mobile_no: { [Op.iLike]: `${_search_text}%` } }
            ]
        } : {};

        const users = await AdmUser.findAll({
            where: { is_deleted: false, ...searchCondition },
            attributes: ['first_name', 'last_name', 'email_id', 'mobile_no', 'is_enabled', 'is_activated', 'added_date', 'activate_date'],
            include: [{ model: AdmRole, as: 'role', where: { is_deleted: false }, attributes: ['role_name'], required: true }],
            order: [['admin_id', 'DESC']]
        });

        const list = (users || []).map((item, index) => ({
            sr_no: index + 1,
            first_name: item.first_name,
            last_name: item.last_name,
            email_id: item.email_id,
            mobile_no: item.mobile_no,
            role_name: item.role?.role_name || '',
            is_enabled: item.is_enabled ? 'Enable' : 'Disable',
            register_date: formatDate(item.added_date),
            is_activated: item.is_activated ? 'Activated' : 'Not Activated',
            activated_date: formatDate(item.activate_date)
        }));

        const workbook = new excel.Workbook();
        const worksheet = workbook.addWorksheet('Sheet 1');
        const headers = ['Sr No', 'First Name', 'Last Name', 'Email', 'Mobile No', 'Role Name', 'Is Enabled', 'Register Date', 'Is Activated', 'Activated Date'];
        const columnWidths = [7, 15, 15, 25, 15, 20, 10, 15, 15, 15];

        const headerRow = worksheet.addRow(headers);
        headerRow.eachCell((cell) => { cell.font = { bold: true }; });
        columnWidths.forEach((width, i) => { worksheet.getColumn(i + 1).width = width; });
        list.forEach((item) => worksheet.addRow(Object.values(item)));

        const excelBuffer = await workbook.xlsx.writeBuffer();
        res.setHeader('Content-Length', excelBuffer.length);
        res.send(excelBuffer);
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

export default {
    send_invite_link,
    send_reset_link,
    admin_user_list,
    admin_user_get,
    admin_user_set,
    admin_user_toggle,
    admin_user_delete,
    user_send_invite,
    all_users_excel
};
