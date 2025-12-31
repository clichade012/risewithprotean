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


const send_invite_link = async (admin_id) => {
    const { AdmUser, AdmLinkAct, EmailTemplate } = getModels();

    const row4 = await AdmUser.findOne({
        where: {
            admin_id,
            is_deleted: false
        },
        attributes: [
            'first_name',
            'last_name',
            'email_id',
            'mobile_no',
            'login_name',
            'is_enabled',
            'added_date',
            'modify_date',
            'role_id',
            'is_activated'
        ]
    });

    if (row4) {
        if (row4.is_activated && row4.is_activated == true) {
            return -1;      /*Already activated*/
        }
        const uuid = randomUUID();
        const link_data = { page: 'admin_invite', token: uuid.toString(), };
        const encoded_data = encodeURIComponent(Buffer.from(JSON.stringify(link_data), 'utf8').toString('base64'));
        let activation_link = process.env.FRONT_SITE_URL + 'email/' + encoded_data;

        const row1 = await AdmLinkAct.create({
            unique_id: uuid,
            admin_id: admin_id,
            sent_date: db.get_ist_current_date()
        });

        const activation_id = (row1 ? row1.activation_id : 0);
        if (activation_id > 0) {
            const rowT = await EmailTemplate.findOne({
                where: {
                    template_id: EmailTemplates.ADMIN_USER_ACTIVATION_LINK.value
                },
                attributes: [
                    'subject',
                    'body_text',
                    'is_enabled'
                ]
            });

            if (rowT) {
                if (rowT.is_enabled) {
                    let subject = rowT.subject ? rowT.subject : "";
                    let body_text = rowT.body_text ? rowT.body_text : "";

                    subject = subject.replaceAll(process.env.EMAIL_TAG_FIRST_NAME, row4.first_name);
                    subject = subject.replaceAll(process.env.EMAIL_TAG_LAST_NAME, row4.last_name);
                    subject = subject.replaceAll(process.env.EMAIL_TAG_EMAIL_ID, row4.email_id);
                    subject = subject.replaceAll(process.env.EMAIL_TAG_MOBILE_NO, row4.mobile_no);
                    subject = subject.replaceAll(process.env.SITE_URL_TAG, process.env.FRONT_SITE_URL);

                    body_text = body_text.replaceAll(process.env.EMAIL_TAG_FIRST_NAME, row4.first_name);
                    body_text = body_text.replaceAll(process.env.EMAIL_TAG_LAST_NAME, row4.last_name);
                    body_text = body_text.replaceAll(process.env.EMAIL_TAG_EMAIL_ID, row4.email_id);
                    body_text = body_text.replaceAll(process.env.EMAIL_TAG_MOBILE_NO, row4.mobile_no);
                    body_text = body_text.replaceAll(process.env.EMAIL_TAG_ACTIVATION_LINK, activation_link);
                    body_text = body_text.replaceAll(process.env.SITE_URL_TAG, process.env.FRONT_SITE_URL);

                    let mailOptions = {
                        from: process.env.EMAIL_CONFIG_SENDER,
                        to: row4.email_id,
                        subject: subject,
                        html: body_text,
                    };
                    let is_success = false;
                    try {
                        await emailTransporter.sendMail(mailOptions);
                        is_success = true;
                    } catch (err) {
                        _logger.error(err.stack);
                    }
                    if (is_success) {
                        return 1;
                    } else {
                        return 0; /* Sending fail*/
                    }
                } else {
                    return -4;      /*Templete is disabled*/
                }
            } else {
                return -3;      /*Templete not found*/
            }
        }
        else {
            return -2;     /*Unable to add invite link uuid*/
        }
    }
    return 0;       /*admin data not found*/
};

const send_reset_link = async (admin_id) => {
    const { AdmUser, AdmLinkReset, EmailTemplate } = getModels();

    const row4 = await AdmUser.findOne({
        where: {
            admin_id,
            is_deleted: false
        },
        attributes: [
            'first_name',
            'last_name',
            'email_id',
            'mobile_no',
            'login_name',
            'is_enabled',
            'added_date',
            'modify_date',
            'role_id',
            'is_activated'
        ]
    });

    if (!row4) {
        return 0;       /*admin data not found*/
    }

    if (!row4.is_activated) {
        return -1;      /*account not activated*/
    }

    if (row4) {
        if (row4.is_activated && row4.is_activated == true) {
            const uuid = randomUUID();
            const link_data = { page: 'admin_reset', token: uuid.toString(), };
            const encoded_data = encodeURIComponent(Buffer.from(JSON.stringify(link_data), 'utf8').toString('base64'));
            let activation_link = process.env.FRONT_SITE_URL + 'email/' + encoded_data;

            const row1 = await AdmLinkReset.create({
                unique_id: uuid,
                admin_id: admin_id,
                sent_date: db.get_ist_current_date()
            });

            const reset_id = (row1 ? row1.reset_id : 0);
            if (reset_id > 0) {
                const rowT = await EmailTemplate.findOne({
                    where: {
                        template_id: EmailTemplates.ADMIN_USER_RESET_PASS_LINK.value
                    },
                    attributes: [
                        'subject',
                        'body_text',
                        'is_enabled'
                    ]
                });

                if (rowT) {
                    if (rowT.is_enabled) {
                        let subject = rowT.subject ? rowT.subject : "";
                        let body_text = rowT.body_text ? rowT.body_text : "";

                        subject = subject.replaceAll(process.env.EMAIL_TAG_FIRST_NAME, row4.first_name);
                        subject = subject.replaceAll(process.env.EMAIL_TAG_LAST_NAME, row4.last_name);
                        subject = subject.replaceAll(process.env.EMAIL_TAG_EMAIL_ID, row4.email_id);
                        subject = subject.replaceAll(process.env.EMAIL_TAG_MOBILE_NO, row4.mobile_no);
                        subject = subject.replaceAll(process.env.SITE_URL_TAG, process.env.FRONT_SITE_URL);

                        body_text = body_text.replaceAll(process.env.EMAIL_TAG_FIRST_NAME, row4.first_name);
                        body_text = body_text.replaceAll(process.env.EMAIL_TAG_LAST_NAME, row4.last_name);
                        body_text = body_text.replaceAll(process.env.EMAIL_TAG_EMAIL_ID, row4.email_id);
                        body_text = body_text.replaceAll(process.env.EMAIL_TAG_MOBILE_NO, row4.mobile_no);
                        body_text = body_text.replaceAll(process.env.EMAIL_TAG_RESET_PASS_LINK, activation_link);
                        body_text = body_text.replaceAll(process.env.SITE_URL_TAG, process.env.FRONT_SITE_URL);

                        let mailOptions = {
                            from: process.env.EMAIL_CONFIG_SENDER,
                            to: row4.email_id,
                            subject: subject,
                            html: body_text,
                        };
                        let is_success = false;
                        try {
                            await emailTransporter.sendMail(mailOptions);
                            is_success = true;
                        } catch (err) {
                            _logger.error(err.stack);
                        }
                        if (is_success) {
                            return 1;
                        } else {
                            return 0; /* Sending fail*/
                        }
                    } else {
                        return -4;      /*Templete is disabled*/
                    }
                } else {
                    return -3;      /*Templete not found*/
                }
            }
            else {
                return -2;     /*Unable to add reset link uuid*/
            }
        } else {
            return -1;      /*account not activated*/
        }
    }
    return 0;       /*admin data not found*/
};

const admin_user_list = async (req, res, next) => {
    const { page_no, role_id, search_text } = req.body;
    try {
        const { AdmUser, AdmRole } = getModels();

        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0; if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";
        let _role_id = role_id && validator.isNumeric(role_id.toString()) ? parseInt(role_id) : 0;

        // Build search condition
        const searchCondition = _search_text.length > 0 ? {
            [Op.or]: [
                { first_name: { [Op.iLike]: `${_search_text}%` } },
                { last_name: { [Op.iLike]: `${_search_text}%` } },
                { email_id: { [Op.iLike]: `${_search_text}%` } },
                { mobile_no: { [Op.iLike]: `${_search_text}%` } }
            ]
        } : {};

        // Count total records - Using ORM
        const total_record = await AdmUser.count({
            where: {
                is_deleted: false,
                ...searchCondition
            }
        });

        // Get paginated list with role - Using ORM
        const offset = (_page_no - 1) * parseInt(process.env.PAGINATION_SIZE);
        const row1 = await AdmUser.findAll({
            where: {
                is_deleted: false,
                ...searchCondition
            },
            attributes: [
                'admin_id', 'first_name', 'last_name', 'email_id', 'mobile_no',
                'login_name', 'login_pass', 'is_master', 'is_enabled', 'is_deleted',
                'added_by', 'modify_by', 'added_date', 'modify_date', 'role_id',
                'is_activated', 'activate_date'
            ],
            include: [{
                model: AdmRole,
                as: 'role',
                attributes: ['role_name'],
                required: true
            }],
            order: [['admin_id', 'DESC']],
            limit: parseInt(process.env.PAGINATION_SIZE),
            offset: offset
        });

        let list = [];
        if (row1) {
            let sr_no = offset;
            for (const item of row1) {
                sr_no++;
                list.push({
                    sr_no: sr_no,
                    admin_id: item.admin_id,
                    first_name: item.first_name,
                    last_name: item.last_name,
                    email_id: item.email_id,
                    mobile_no: item.mobile_no,
                    login_name: item.login_name,
                    role_name: item.role ? item.role.role_name : '',
                    enabled: item.is_enabled,
                    is_master: item.is_master,
                    is_activated: item.is_activated,
                    added_on: item.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.added_date)) : "",
                    modify_on: item.modify_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.modify_date)) : "",
                    activate_date: item.activate_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.activate_date)) : "",
                });
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
        let _admin_id = 1;
        let _role_id = role_id && validator.isNumeric(role_id.toString()) ? parseInt(role_id) : 0;
        if (!first_name || first_name.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter first name.", null));
        }
        if (first_name.length > 30) {
            return res.status(200).json(success(false, res.statusCode, "First name should not be more than 30 character", null));
        }
        if (!last_name || last_name.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter last name.", null));
        }
        if (last_name.length > 30) {
            return res.status(200).json(success(false, res.statusCode, "Last name should not be more than 30 character", null));
        }
        if (!email_id || email_id.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter email id.", null));
        }
        if (email_id && email_id.length > 0 && !validator.isEmail(email_id)) {
            return res.status(200).json(success(false, res.statusCode, "Please enter correct email address.", null));
        }
        if (!mobile_no || mobile_no.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter mobile no.", null));
        }
        if ((mobile_no && mobile_no.length > 0 && !validator.isNumeric(mobile_no)) || mobile_no.length != 10) {
            return res.status(200).json(success(false, res.statusCode, "Invalid mobile number.", null));
        }
        let _login_name = email_id;

        // Check email exists - Using ORM
        const row1 = await AdmUser.findOne({
            where: {
                email_id,
                is_deleted: false
            },
            attributes: ['admin_id']
        });
        let emailExists = row1 ? true : false;
        if (emailExists) {
            return res.status(200).json(success(false, res.statusCode, "Email address is already registered.", null));
        }

        // Check mobile exists - Using ORM
        const row3 = await AdmUser.findOne({
            where: {
                mobile_no,
                is_deleted: false
            },
            attributes: ['admin_id']
        });
        let mobileExists = row3 ? true : false;
        if (mobileExists) {
            return res.status(200).json(success(false, res.statusCode, "Mobile number is already registered.", null));
        }

        // Create new admin user - Using ORM
        const rowOut = await AdmUser.create({
            first_name: first_name,
            last_name: last_name,
            email_id: email_id,
            mobile_no: mobile_no,
            login_name: _login_name,
            login_pass: '',
            is_master: false,
            is_enabled: true,
            is_deleted: false,
            added_by: _admin_id,
            added_date: db.get_ist_current_date(),
            role_id: _role_id,
            is_activated: false,
            modify_by: req.token_data.account_id
        });

        const admin_id = (rowOut ? rowOut.admin_id : 0);
        if (admin_id > 0) {
            await send_invite_link(admin_id);
            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: 'New admin user added and sent invite link. User email = ' + email_id,
                    query: 'ORM create AdmUser',
                    date_time: db.get_ist_current_date(),
                };
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }

            return res.status(200).json(success(true, res.statusCode, "Saved successfully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to save, Please try again", null));
        }
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
                    narration: 'Admin user ' + (row1.is_enabled == true ? 'disabled' : 'enabled') + ' User email id ' + row1.email_id,
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

        let _search_text = search_text && search_text.length > 0 ? search_text : "";

        // Build search condition
        const searchCondition = _search_text.length > 0 ? {
            [Op.or]: [
                { first_name: { [Op.iLike]: `${_search_text}%` } },
                { last_name: { [Op.iLike]: `${_search_text}%` } },
                { email_id: { [Op.iLike]: `${_search_text}%` } },
                { mobile_no: { [Op.iLike]: `${_search_text}%` } }
            ]
        } : {};

        // Get all users with role - Using ORM
        const row1 = await AdmUser.findAll({
            where: {
                is_deleted: false,
                ...searchCondition
            },
            attributes: [
                'first_name', 'last_name', 'email_id', 'mobile_no', 'is_enabled',
                'is_activated', 'added_date', 'modify_date', 'role_id', 'activate_date'
            ],
            include: [{
                model: AdmRole,
                as: 'role',
                where: { is_deleted: false },
                attributes: ['role_name'],
                required: true
            }],
            order: [['admin_id', 'DESC']]
        });

        let list = [];
        if (row1) {
            let sr_no = 0;
            for (const item of row1) {
                sr_no++;
                list.push({
                    sr_no: sr_no,
                    first_name: item.first_name,
                    last_name: item.last_name,
                    email_id: item.email_id,
                    mobile_no: item.mobile_no,
                    role_name: item.role ? item.role.role_name : '',
                    is_enabled: item.is_enabled ? 'Enable' : 'Disable',
                    register_date: item.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.added_date)) : "",
                    is_activated: item.is_activated ? 'Activated' : 'Not Activated',
                    activated_date: item.activate_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.activate_date)) : "",
                });
            }
        }
        const workbook = new excel.Workbook();
        const worksheet = workbook.addWorksheet('Sheet 1');
        const headers = ['Sr No', 'First Name', 'Last Name', 'Email', 'Mobile No', 'Role Name', 'Is Enabled', 'Register Date', 'Is Activated', 'Activated Date'];
        const headerRow = worksheet.addRow(headers);
        headerRow.eachCell((cell, colNumber) => {
            cell.font = { bold: true };
        });
        worksheet.getColumn(1).width = 7;
        worksheet.getColumn(2).width = 15;
        worksheet.getColumn(3).width = 15;
        worksheet.getColumn(4).width = 25;
        worksheet.getColumn(5).width = 15;
        worksheet.getColumn(6).width = 20;
        worksheet.getColumn(7).width = 10;
        worksheet.getColumn(8).width = 15;
        worksheet.getColumn(9).width = 15;
        worksheet.getColumn(10).width = 15;

        for (const item of list) {
            const rowValues = Object.values(item);
            worksheet.addRow(rowValues);
        }
        const excelBuffer = await workbook.xlsx.writeBuffer();
        res.setHeader('Content-Length', excelBuffer.length);
        res.send(excelBuffer);
    }
    catch (err) {
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
