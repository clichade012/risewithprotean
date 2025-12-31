import { logger as _logger, action_logger } from '../logger/winston.js';
import db from '../database/db_helper.js';
import { Op, fn, col, literal } from 'sequelize';
import { success } from '../model/responseModel.js';
import { API_STATUS } from '../model/enumModel.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import redisDB from '../database/redis_cache.js';
import dateFormat from 'date-format';
import { rsa_decrypt } from './rsaEncryption.js';
import validator from 'validator';
import requestIp from 'request-ip';
import admUsersService from './admin/admUsersService.js';
import supportTransporter from './supportService.js';
import excel from 'exceljs';
import correlator from 'express-correlation-id';

// Helper to get models
const getModels = () => db.models;

const login = async (req, res, next) => {
    const { post_data } = req.body;
    try {
        let jsonData = JSON.parse(rsa_decrypt(post_data));

        let user_name = jsonData.user_name;
        let password = jsonData.password;

        console.log("Admin Login attempt for user:", password);

        if (!user_name || user_name.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter username.", null));
        }
        if (!password || password.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter password.", null));
        }

        const { AdmUser, AdmToken, AdmPermission, AdmRolePermission, AdmRole } = getModels();

        // Find user by email with role
        const user = await AdmUser.findOne({
            where: {
                email_id: user_name,
                is_deleted: false
            },
            include: [{
                model: AdmRole,
                as: 'role',
                attributes: ['role_id', 'role_name']
            }]
        });

        if (!user) {
            return res.status(200).json(success(false, res.statusCode, "Invalid username or password.", null));
        }

        if (user.is_deleted) {
            return res.status(200).json(success(false, res.statusCode, "Your account does not exist.", null));
        }

        const isValidPass = await bcrypt.compare(password, user.login_pass);
        if (!isValidPass) {
            return res.status(200).json(success(false, res.statusCode, "Invalid username or password.", null));
        }

        if (!user.is_master) {
            if (!user.is_enabled) {
                return res.status(200).json(success(false, res.statusCode, "Your account has been blocked, contact system administrator.", null));
            }
        }

        const jwtUser = { id: user.admin_id }

        const accessToken = jwt.sign(jwtUser, process.env.JWT_ACCESS_TOKEN_KEY,
            { algorithm: 'HS256', allowInsecureKeySizes: true, expiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRES * 1000, }
        );
        const refreshToken = jwt.sign(jwtUser, process.env.JWT_REFRESH_TOKEN_KEY,
            { algorithm: 'HS256', allowInsecureKeySizes: true, expiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRES * 1000, }
        );

        let ip = ''; try { const clientIp = requestIp.getClientIp(req); ip = clientIp; } catch { }

        let user_agent = req.headers['user-agent'];

        // Create token using ORM
        const newToken = await AdmToken.create({
            admin_id: user.admin_id,
            added_date: db.get_ist_current_date(),
            last_action: db.get_ist_current_date(),
            ip_address: ip,
            is_logout: false,
            logout_time: null,
            user_agent: user_agent
        });

        const token_id = newToken.token_id;
        const unique_id = newToken.unique_id;

        if (process.env.REDIS_ENABLED > 0) {
            await redisDB.set(unique_id, refreshToken, { EX: process.env.REDIS_CACHE_EXPIRY });
        }

        let permissions = [];
        if (user.is_master && user.is_master == true) {
            // Master user gets all permissions
            const allPermissions = await AdmPermission.findAll({
                attributes: ['permission_id']
            });
            permissions = allPermissions.map(p => ({
                id: p.permission_id,
                status: true
            }));
        } else {
            // Get permissions based on role
            const allPermissions = await AdmPermission.findAll({
                attributes: ['permission_id'],
                include: [{
                    model: AdmRolePermission,
                    as: 'rolePermissions',
                    where: { role_id: user.role_id },
                    required: false,
                    attributes: ['is_allowed']
                }]
            });
            permissions = allPermissions.map(p => ({
                id: p.permission_id,
                status: p.rolePermissions && p.rolePermissions.length > 0 ? p.rolePermissions[0].is_allowed : false
            }));
        }

        const results = {
            first_name: user.first_name,
            last_name: user.last_name,
            email_id: user.email_id,
            mobile_no: user.mobile_no,
            is_master: user.is_master,
            access_token: accessToken,
            refresh_token: refreshToken,
            token_expiry: process.env.JWT_ACCESS_TOKEN_EXPIRES,
            token_issued_at: dateFormat(process.env.DATE_FORMAT, db.get_ist_current_date()),
            auth_key: unique_id,
            permissions: permissions,
            role: user.role ? user.role.role_name : ""
        };
        res.setHeader('x-auth-key', unique_id);

        return res.status(200).json(success(true, res.statusCode, "Logged in successfully.", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(200).json(success(false, res.statusCode, err.message, null));
    }
};

const refresh_token = async (req, res, next) => {
    const authKey = req.headers["x-auth-key"];
    if (!authKey) {
        return res.status(200).json(success(false, res.statusCode, "Auth key is required for authentication.", null));
    }
    const { refresh_token } = req.body;
    try {
        if (!refresh_token || refresh_token.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Invalid request.", null));
        }
        try {
            const decoded = jwt.verify(refresh_token, process.env.JWT_REFRESH_TOKEN_KEY);
            const jwtUser = { id: decoded.id };

            let dbKey = null;
            if (process.env.REDIS_ENABLED > 0) {
                dbKey = await redisDB.get(authKey);
            }
            if (dbKey && refresh_token === dbKey) {

                const accessToken = jwt.sign(jwtUser, process.env.JWT_ACCESS_TOKEN_KEY,
                    { algorithm: 'HS256', allowInsecureKeySizes: true, expiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRES * 1000, }
                );
                const refreshToken = jwt.sign(jwtUser, process.env.JWT_REFRESH_TOKEN_KEY,
                    { algorithm: 'HS256', allowInsecureKeySizes: true, expiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRES * 1000, }
                );
                if (process.env.REDIS_ENABLED > 0) {
                    await redisDB.set(authKey, refreshToken, { EX: process.env.REDIS_CACHE_EXPIRY });
                }
                const results = {
                    access_token: accessToken,
                    refresh_token: refreshToken,
                    token_expiry: process.env.JWT_ACCESS_TOKEN_EXPIRES,
                    token_issued_at: dateFormat(process.env.DATE_FORMAT, db.get_ist_current_date()),
                };

                return res.status(200).json(success(true, res.statusCode, "Success.", results));

            } else {
                return res.status(200).json(success(false, res.statusCode, "Invalid request.", null));
            }
        } catch (err) {
            _logger.error(err.stack);
            return res.status(200).json(success(false, res.statusCode, "Invalid request.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const token_data = async (unique_id) => {
    const { AdmToken, AdmUser } = getModels();

    const token = await AdmToken.findOne({
        where: { unique_id: unique_id },
        include: [{
            model: AdmUser,
            as: 'user',
            attributes: ['account_id', 'admin_id', 'is_enabled', 'is_deleted', 'is_master']
        }]
    });

    if (!token || !token.user) return [];

    return [{
        token_id: token.token_id,
        account_id: token.user.account_id,
        admin_id: token.admin_id,
        is_logout: token.is_logout,
        is_enabled: token.user.is_enabled,
        is_deleted: token.user.is_deleted,
        is_master: token.user.is_master
    }];
}

const logout = async (req, res, next) => {
    try {
        const auth_key = req.token_data.auth_key;
        const { AdmToken } = getModels();

        await AdmToken.update(
            {
                is_logout: true,
                logout_time: db.get_ist_current_date()
            },
            {
                where: { unique_id: auth_key }
            }
        );

        if (process.env.REDIS_ENABLED > 0) {
            await redisDB.del(auth_key);
        }

        return res.status(200).json(success(true, res.statusCode, "Logout successfully.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const reset_pass = async (req, res, next) => {
    const { email_id } = req.body;
    try {
        const { AdmUser } = getModels();

        const user = await AdmUser.findOne({
            where: {
                email_id: email_id,
                is_deleted: false
            },
            attributes: ['admin_id', 'is_activated']
        });

        if (user) {
            if (user.is_activated && user.is_activated == true) {
                const i = await admUsersService.send_reset_link(user.admin_id);
                if (i > 0) {
                    return res.status(200).json(success(true, res.statusCode, "Reset password link has been sent on your email address.", null));
                } else {
                    return res.status(200).json(success(false, res.statusCode, "Reset password link sending failure, Please try again.", null));
                }
            } else {
                return res.status(200).json(success(false, res.statusCode, "Your account is not yet activated, Please contact to administrator.", null));
            }
        } else {
            return res.status(200).json(success(false, res.statusCode, "Email id/User name is not registered with us.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const dashboard = async (req, res, next) => {
    try {
        const { FaqDetail, FaqType, CstCustomer } = getModels();

        // Get total customer count using ORM
        const total_customer = await CstCustomer.count({
            where: { is_deleted: false }
        });

        // Get customers pending approval using ORM
        const total_customer_to_approve = await CstCustomer.count({
            where: {
                is_deleted: false,
                is_approved: { [Op.lte]: 0 }
            }
        });

        // Get customers pending activation using ORM
        const total_customer_to_activate = await CstCustomer.count({
            where: {
                is_deleted: false,
                is_activated: { [Op.lte]: 0 }
            }
        });

        // Get FAQ count using ORM
        const faqCount = await FaqDetail.count({
            include: [{
                model: FaqType,
                as: 'faqType',
                where: { is_deleted: false },
                required: true
            }],
            where: { is_deleted: false }
        });

        const results = {
            total_customer: total_customer,
            total_customer_to_approve: total_customer_to_approve,
            total_customer_to_activate: total_customer_to_activate,
            total_faq_detail_list: faqCount,
        };
        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};


/************************CONTACT US  START   *************************/

const contact_us_delete = async (req, res, next) => {
    const { feedback_id } = req.body;
    try {
        let _feedback_id = feedback_id && validator.isNumeric(feedback_id.toString()) ? parseInt(feedback_id) : 0;
        const { FeedbackData } = getModels();

        const feedback = await FeedbackData.findOne({
            where: {
                feedback_id: _feedback_id,
                is_deleted: false
            },
            attributes: ['feedback_id', 'email_id', 'subject']
        });

        if (!feedback) {
            return res.status(200).json(success(false, res.statusCode, "Contact us issue details not found, Please try again.", null));
        }

        const [affectedRows] = await FeedbackData.update(
            { is_deleted: true },
            { where: { feedback_id: _feedback_id } }
        );

        if (affectedRows > 0) {
            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: 'Contact us issue deleted. customer email = ' + feedback.email_id + ', Subject = ' + feedback.subject,
                    query: 'ORM Update',
                    date_time: db.get_ist_current_date(),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }

            return res.status(200).json(success(true, res.statusCode, "Issue deleted successfully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to delete issue, please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
}

const contact_us_data = async (req, res, next) => {
    const { page_no, search_text } = req.body;
    try {
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0; if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";
        const pageSize = parseInt(process.env.PAGINATION_SIZE);

        const { FeedbackData, FeedbackCategory } = getModels();

        // Build search condition
        const searchCondition = _search_text ? {
            [Op.or]: [
                { email_id: { [Op.iLike]: `${_search_text}%` } },
                { mobile_no: { [Op.iLike]: `${_search_text}%` } },
                db.sequelize.where(
                    db.sequelize.cast(db.sequelize.col('ticket_id'), 'TEXT'),
                    { [Op.like]: `${_search_text}%` }
                )
            ]
        } : {};

        // Get total count
        const total_record = await FeedbackData.count({
            where: {
                is_deleted: false,
                ...searchCondition
            }
        });

        // Get paginated data
        const feedbacks = await FeedbackData.findAll({
            where: {
                is_deleted: false,
                ...searchCondition
            },
            include: [{
                model: FeedbackCategory,
                as: 'category',
                attributes: ['category_name'],
                required: false
            }],
            order: [['feedback_id', 'DESC']],
            limit: pageSize,
            offset: (_page_no - 1) * pageSize
        });

        let list = feedbacks.map((item, index) => ({
            sr_no: ((_page_no - 1) * pageSize) + index + 1,
            ticket_id: item.ticket_id,
            id: item.feedback_id,
            customer_id: item.customer_id,
            first_name: item.first_name,
            last_name: item.last_name,
            email_id: item.email_id,
            company_name: item.company_name,
            category_name: item.category ? item.category.category_name : '',
            network_code: '',
            mobile_no: item.mobile_no,
            subject: item.subject,
            message: item.message,
            admin_name: '',
            added_date: item.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.added_date)) : "",
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

const contact_us_reply_by_id = async (req, res, next) => {
    const { feedback_id } = req.body;
    try {
        let _feedback_id = feedback_id && validator.isNumeric(feedback_id.toString()) ? parseInt(feedback_id) : 0;
        const { FeedbackData, FeedbackReply, AdmUser } = getModels();

        const feedbackExists = await FeedbackData.findOne({
            where: {
                feedback_id: _feedback_id,
                is_deleted: false
            },
            attributes: ['feedback_id', 'ticket_id']
        });

        if (!feedbackExists) {
            return res.status(200).json(success(false, res.statusCode, "Contact us issue details not found, Please try again.", null));
        }

        const replies = await FeedbackReply.findAll({
            where: { feedback_id: _feedback_id },
            include: [{
                model: AdmUser,
                as: 'sender',
                attributes: ['first_name', 'last_name'],
                required: false
            }],
            order: [['reply_id', 'ASC']]
        });

        let list = replies.map(item => ({
            reply_id: item.reply_id,
            feedback_id: item.feedback_id,
            sent_by: item.sent_by,
            sent_date: item.sent_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.sent_date)) : "",
            content_text: item.content_text,
            sender: item.sender ? `${item.sender.first_name} ${item.sender.last_name}` : '',
        }));

        const results = { data: list };
        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        console.log(err.stack)
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const contact_us_add_reply = async (req, res, next) => {
    const { feedback_id, message } = req.body;
    try {
        if (!message || message.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter message.", null));
        }

        const { FeedbackData, FeedbackReply } = getModels();

        const feedback = await FeedbackData.findOne({
            where: {
                feedback_id: feedback_id,
                is_deleted: false
            },
            attributes: ['ticket_id', 'first_name', 'last_name', 'email_id', 'subject', 'message', 'added_date']
        });

        if (!feedback) {
            return res.status(200).json(success(false, res.statusCode, "Contact us issue details not found.", null));
        }

        const newReply = await FeedbackReply.create({
            feedback_id: feedback_id,
            sent_by: req.token_data.account_id,
            sent_date: db.get_ist_current_date(),
            content_text: message
        });

        if (newReply.feedback_id > 0) {
            const formattedDate = feedback.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(feedback.added_date)).toString() : "";

            let body_text = `<div style=\"width: 100%; line-height: 20px;  margin: 0 auto; padding: 15px; font-size: 13px; color: #353434;\">
             Hi ${feedback.first_name},<br />  ${message} <br/> <br/> <div>Thank you.</div> <div>The Protean Team </div> </div>
             <div style=\"width: 100%; line-height: 20px;  margin: 0 auto; border-top: 1px dotted black; padding: 15px; font-family: Trebuchet MS; font-size: 13px; color: #353434;\">
             ${feedback.first_name} wrote on ${formattedDate} <br/>  <br/> ${feedback.message} . <br/>  <br/> </div>`;

            let _subject = "Ticket: " + feedback.ticket_id + "- Re: " + feedback.subject;
            let mailOptions = {
                from: process.env.EMAIL_SUPPORT_EMAIL,
                to: feedback.email_id,
                subject: _subject,
                html: body_text,
            }
            try {
                await supportTransporter.sendMail(mailOptions);
            } catch (err) {
                _logger.error(err.stack);
            }
            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: 'Reply sent to contact us issue. Customer email id = ' + feedback.email_id,
                    query: 'ORM Create',
                    date_time: db.get_ist_current_date(),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }
            return res.status(200).json(success(true, res.statusCode, "Message sent successfully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to save, Please try again", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const contact_us_category = async (req, res, next) => {
    const { page_no, search_text } = req.body;
    try {
        const { FeedbackCategory } = getModels();

        const categories = await FeedbackCategory.findAll({
            where: { is_deleted: false },
            order: [['category_id', 'DESC']]
        });

        let issue_type = categories.map((item, index) => ({
            sr_no: index + 1,
            id: item.category_id,
            name: item.category_name,
            is_enabled: item.is_enabled,
            added_on: dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.added_date)),
            modify_on: dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.modify_date)),
        }));

        const results = { data: issue_type };
        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const contact_us_category_toggle = async (req, res, next) => {
    const { category_id } = req.body;
    try {
        const { FeedbackCategory } = getModels();

        const category = await FeedbackCategory.findOne({
            where: {
                category_id: category_id,
                is_deleted: false
            },
            attributes: ['category_id', 'category_name', 'is_enabled']
        });

        if (!category) {
            return res.status(200).json(success(false, res.statusCode, "category not found.", null));
        }

        const [affectedRows] = await FeedbackCategory.update(
            {
                is_enabled: !category.is_enabled,
                modify_date: db.get_ist_current_date(),
                modify_by: req.token_data.account_id
            },
            { where: { category_id: category_id } }
        );

        if (affectedRows > 0) {
            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: 'Contact us Category ' + (category.is_enabled == true ? 'disabled' : 'enabled') + '. Category name = ' + category.category_name,
                    query: 'ORM Update',
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

const contact_us_category_delete = async (req, res, next) => {
    const { category_id } = req.body;
    try {
        let _category_id = category_id && validator.isNumeric(category_id.toString()) ? parseInt(category_id) : 0;
        const { FeedbackCategory } = getModels();

        const category = await FeedbackCategory.findOne({
            where: {
                category_id: _category_id,
                is_deleted: false
            },
            attributes: ['category_id', 'category_name']
        });

        if (!category) {
            return res.status(200).json(success(false, res.statusCode, "category details not found.", null));
        }

        const [affectedRows] = await FeedbackCategory.update(
            {
                is_deleted: true,
                modify_date: db.get_ist_current_date(),
                modify_by: req.token_data.account_id
            },
            { where: { category_id: _category_id } }
        );

        if (affectedRows > 0) {
            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: 'Category deleted. category name = ' + category.category_name,
                    query: 'ORM Update',
                    date_time: db.get_ist_current_date(),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }

            return res.status(200).json(success(true, res.statusCode, "category deleted successfully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to delete category, please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
}

const contact_us_category_set = async (req, res, next) => {
    const { category_id, category_name, sort_order } = req.body;
    try {
        let _category_id = category_id && validator.isNumeric(category_id.toString()) ? parseInt(category_id) : 0;
        const { FeedbackCategory } = getModels();

        if (!category_name || category_name.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter category name.", null));
        }

        // Check if category name already exists
        const existingCategory = await FeedbackCategory.findOne({
            where: {
                category_id: { [Op.ne]: _category_id },
                category_name: category_name,
                is_deleted: false
            }
        });

        if (existingCategory) {
            return res.status(200).json(success(false, res.statusCode, "category name is already exists.", null));
        }

        if (_category_id > 0) {
            // Update existing category
            const [affectedRows] = await FeedbackCategory.update(
                {
                    category_name: category_name,
                    modify_by: req.token_data.account_id,
                    modify_date: db.get_ist_current_date()
                },
                { where: { category_id: _category_id } }
            );

            if (affectedRows > 0) {
                try {
                    let data_to_log = {
                        correlation_id: correlator.getId(),
                        token_id: req.token_data.token_id,
                        account_id: req.token_data.account_id,
                        user_type: 1,
                        user_id: req.token_data.admin_id,
                        narration: 'category updated. category name = ' + category_name,
                        query: 'ORM Update',
                        date_time: db.get_ist_current_date(),
                    }
                    action_logger.info(JSON.stringify(data_to_log));
                } catch (_) { }

                return res.status(200).json(success(true, res.statusCode, "Updated successfully.", null));
            } else {
                return res.status(200).json(success(false, res.statusCode, "Unable to update, Please try again", null));
            }
        } else {
            // Create new category
            const newCategory = await FeedbackCategory.create({
                category_name: category_name,
                is_enabled: true,
                is_deleted: false,
                added_by: req.token_data.account_id,
                modify_by: req.token_data.account_id,
                added_date: db.get_ist_current_date(),
                modify_date: db.get_ist_current_date()
            });

            if (newCategory.category_id > 0) {
                try {
                    let data_to_log = {
                        correlation_id: correlator.getId(),
                        token_id: req.token_data.token_id,
                        account_id: req.token_data.account_id,
                        user_type: 1,
                        user_id: req.token_data.admin_id,
                        narration: 'New category added. Category name ' + category_name,
                        query: 'ORM Create',
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

/************************ CONTACT US END    *************************/

/************************* settings *************************/

const settings_get = async (req, res, next) => {
    try {
        const { Settings } = getModels();

        const settings = await Settings.findOne({
            attributes: ['logo_path', 'copyright']
        });

        const setting = {};
        if (settings) {
            setting.logo_path = settings.logo_path && settings.logo_path.length > 0 ? db.get_uploads_url(req) + settings.logo_path : '';
            setting.copyright = settings.copyright;
        }
        const results = { data: setting };
        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const settings_update = async (req, res, next) => {
    try {
        const logo_image = req.files['logo_image'];
        const copyright = req.body.copyright;
        const { Settings } = getModels();

        let logo_image_filename = "";
        if (logo_image) {
            logo_image_filename = req.files['logo_image'][0].filename;
        }

        const existingSettings = await Settings.findOne();

        if (existingSettings) {
            const updateData = {
                copyright: copyright,
                modify_by: req.token_data.account_id,
                modify_date: db.get_ist_current_date()
            };
            if (logo_image_filename.length > 0) {
                updateData.logo_path = logo_image_filename;
            }

            const [affectedRows] = await Settings.update(updateData, {
                where: { table_id: existingSettings.table_id }
            });

            if (affectedRows > 0) {
                try {
                    let data_to_log = {
                        correlation_id: correlator.getId(),
                        token_id: req.token_data.token_id,
                        account_id: req.token_data.account_id,
                        user_type: 1,
                        user_id: req.token_data.admin_id,
                        narration: 'Setting updated.',
                        query: 'ORM Update',
                        date_time: db.get_ist_current_date(),
                    }
                    action_logger.info(JSON.stringify(data_to_log));
                } catch (_) { }
                return res.status(200).json(success(true, res.statusCode, "Settings updated successfully.", null));
            } else {
                return res.status(200).json(success(false, res.statusCode, "Unable to save, Please try again.", null));
            }
        } else {
            const newSettings = await Settings.create({
                logo_path: logo_image_filename,
                copyright: copyright,
                modify_by: req.token_data.account_id,
                modify_date: db.get_ist_current_date()
            });

            if (newSettings) {
                try {
                    let data_to_log = {
                        correlation_id: correlator.getId(),
                        token_id: req.token_data.token_id,
                        account_id: req.token_data.account_id,
                        user_type: 1,
                        user_id: req.token_data.admin_id,
                        narration: 'Setting updated.',
                        query: 'ORM Create',
                        date_time: db.get_ist_current_date(),
                    }
                    action_logger.info(JSON.stringify(data_to_log));
                } catch (_) { }
                return res.status(200).json(success(true, res.statusCode, "Settings added successfully.", null));
            } else {
                return res.status(200).json(success(false, res.statusCode, "Unable to save, Please try again.", null));
            }
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const live_auto_approve = async (req, res, next) => {
    try {
        const { Settings } = getModels();

        const settings = await Settings.findOne();
        if (settings) {
            await Settings.update(
                { is_live_auto_approve: !settings.is_live_auto_approve },
                { where: { table_id: settings.table_id } }
            );
            return res.status(200).json(success(true, res.statusCode, "Status changed successfully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to change, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const sandbox_auto_approve = async (req, res, next) => {
    try {
        const { Settings } = getModels();

        const settings = await Settings.findOne();
        if (settings) {
            await Settings.update(
                { is_sandbox_auto_approve: !settings.is_sandbox_auto_approve },
                { where: { table_id: settings.table_id } }
            );
            return res.status(200).json(success(true, res.statusCode, "Status changed successfully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to change, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const settings_get_status = async (req, res, next) => {
    try {
        const { Settings } = getModels();

        const settings = await Settings.findOne({
            attributes: ['is_live_auto_approve', 'is_sandbox_auto_approve', 'is_auto_approve_customer']
        });

        const setting = {};
        if (settings) {
            setting.is_live_auto_approve = settings.is_live_auto_approve;
            setting.is_sandbox_auto_approve = settings.is_sandbox_auto_approve;
            setting.is_auto_approve_customer = settings.is_auto_approve_customer;
        }
        const results = { data: setting };
        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const customer_auto_approve = async (req, res, next) => {
    try {
        const { Settings } = getModels();

        const settings = await Settings.findOne({
            attributes: ['table_id', 'is_auto_approve_customer']
        });

        if (!settings) {
            return res.status(200).json(success(false, res.statusCode, "Settings details not found.", null));
        }

        const [affectedRows] = await Settings.update(
            {
                is_auto_approve_customer: !settings.is_auto_approve_customer,
                auto_approve_customer_modify_by: req.token_data.account_id,
                auto_approve_customer_modify_date: db.get_ist_current_date()
            },
            { where: { table_id: settings.table_id } }
        );

        if (affectedRows > 0) {
            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: 'Customer auto approved ' + (settings.is_auto_approve_customer == true ? 'disabled' : 'enabled') + '.',
                    query: 'ORM Update',
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


/************************ Admin Roles START   *************************/

const admin_reset_link_check = async (req, res, next) => {
    const { token } = req.body;
    try {
        if (!token || token.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Invalid reset password link or expired.", null));
        }
        const uuid_decode = Buffer.from(decodeURIComponent(token), 'base64').toString('utf8');
        const { AdmLinkReset } = getModels();

        const resetLink = await AdmLinkReset.findOne({
            where: {
                unique_id: uuid_decode,
                is_used: false
            }
        });

        if (resetLink) {
            let addMlSeconds = process.env.CUSTOMER_RESET_LINK_EXPIRY * 1000;
            let newDateObj = new Date(db.convert_db_date_to_ist(resetLink.sent_date).getTime() + addMlSeconds);
            if (newDateObj >= db.get_ist_current_date()) {
                return res.status(200).json(success(true, res.statusCode, "Success.", null));
            } else {
                return res.status(200).json(success(false, res.statusCode, "Invalid reset password link or expired.", null));
            }
        } else {
            return res.status(200).json(success(false, res.statusCode, "Invalid reset password link or expired.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const verify_reset_pass = async (req, res, next) => {
    const { token, password } = req.body;
    try {
        if (!token || token.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Invalid attempt..", null));
        }
        if (!password || password.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter password.", null));
        }
        if (password.length < 8) {
            return res.status(200).json(success(false, res.statusCode, "The password must contain atleast 8 characters.", null));
        }
        const hasNumber = /\d/;
        if (!hasNumber.test(password)) {
            return res.status(200).json(success(false, res.statusCode, "The password must contain a number.", null));
        }
        const specialChars = /[`!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]/;
        if (!specialChars.test(password)) {
            return res.status(200).json(success(false, res.statusCode, "The password must contain a special character.", null));
        }

        const uuid_decode = Buffer.from(decodeURIComponent(token), 'base64').toString('utf8');
        const { AdmUser, AdmLinkReset } = getModels();

        const resetLink = await AdmLinkReset.findOne({
            where: {
                unique_id: uuid_decode,
                is_used: false
            }
        });

        if (!resetLink) {
            return res.status(200).json(success(false, API_STATUS.RESET_LINK_EXPIRED.value, "Invalid reset password link or expired.", null));
        }

        const admin_id = resetLink.admin_id;
        let addMlSeconds = process.env.CUSTOMER_RESET_LINK_EXPIRY * 1000;
        let newDateObj = new Date(db.convert_db_date_to_ist(resetLink.sent_date).getTime() + addMlSeconds);

        if (newDateObj >= db.get_ist_current_date()) {
            let password_hash = await bcrypt.hash(password, 10);

            await AdmLinkReset.update(
                {
                    is_used: true,
                    used_date: db.get_ist_current_date()
                },
                { where: { unique_id: uuid_decode } }
            );

            await AdmUser.update(
                { login_pass: password_hash },
                { where: { admin_id: admin_id } }
            );

            return res.status(200).json(success(true, res.statusCode, "Reset password successfully. ", null));
        } else {
            return res.status(200).json(success(false, API_STATUS.RESET_LINK_EXPIRED.value, "Invalid reset password link or expired.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const admin_set_pass_link_check = async (req, res, next) => {
    const { token } = req.body;
    try {
        if (!token || token.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Invalid reset password link or expired.", null));
        }
        const uuid_decode = Buffer.from(decodeURIComponent(token), 'base64').toString('utf8');
        const { AdmLinkAct } = getModels();

        const actLink = await AdmLinkAct.findOne({
            where: {
                unique_id: uuid_decode,
                is_used: false
            }
        });

        if (actLink) {
            let addMlSeconds = process.env.CUSTOMER_RESET_LINK_EXPIRY * 1000;
            let newDateObj = new Date(db.convert_db_date_to_ist(actLink.sent_date).getTime() + addMlSeconds);
            if (newDateObj >= db.get_ist_current_date()) {
                return res.status(200).json(success(true, res.statusCode, "Success.", null));
            } else {
                return res.status(200).json(success(false, res.statusCode, "Invalid reset password link or expired.", null));
            }
        } else {
            return res.status(200).json(success(false, res.statusCode, "Invalid reset password link or expired.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const set_new_pass = async (req, res, next) => {
    const { token, password } = req.body;
    try {
        if (!token || token.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Invalid attempt..", null));
        }
        if (!password || password.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter password.", null));
        }
        if (password.length < 8) {
            return res.status(200).json(success(false, res.statusCode, "The password must contain atleast 8 characters.", null));
        }
        const hasNumber = /\d/;
        if (!hasNumber.test(password)) {
            return res.status(200).json(success(false, res.statusCode, "The password must contain a number.", null));
        }
        const specialChars = /[`!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~]/;
        if (!specialChars.test(password)) {
            return res.status(200).json(success(false, res.statusCode, "The password must contain a special character.", null));
        }

        const uuid_decode = Buffer.from(decodeURIComponent(token), 'base64').toString('utf8');
        const { AdmUser, AdmLinkAct } = getModels();

        const actLink = await AdmLinkAct.findOne({
            where: {
                unique_id: uuid_decode,
                is_used: false
            }
        });

        if (!actLink) {
            return res.status(200).json(success(false, API_STATUS.RESET_LINK_EXPIRED.value, "Invalid reset password link or expired.", null));
        }

        const admin_id = actLink.admin_id;
        let addMlSeconds = process.env.CUSTOMER_RESET_LINK_EXPIRY * 1000;
        let newDateObj = new Date(db.convert_db_date_to_ist(actLink.sent_date).getTime() + addMlSeconds);

        if (newDateObj >= db.get_ist_current_date()) {
            let password_hash = await bcrypt.hash(password, 10);

            await AdmLinkAct.update(
                {
                    is_used: true,
                    used_date: db.get_ist_current_date()
                },
                { where: { unique_id: uuid_decode } }
            );

            await AdmUser.update(
                { login_pass: password_hash, is_activated: true },
                { where: { admin_id: admin_id } }
            );

            return res.status(200).json(success(true, res.statusCode, "New password set successfully. ", null));
        } else {
            return res.status(200).json(success(false, API_STATUS.RESET_LINK_EXPIRED.value, "Invalid reset password link or expired.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

/************************ Admin Roles END   *************************/


/******************************* Label Info ***********************************/
const lable_info_get = async (req, res, next) => {
    try {
        const { PageLabelInfo } = getModels();

        const labels = await PageLabelInfo.findAll({
            attributes: ['label_id', 'pages_name', 'label_name', 'info_text'],
            order: [['label_id', 'ASC']]
        });

        const results = {
            data: labels
        };
        return res.status(200).json(success(true, res.statusCode, "label info.", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const lable_info_set = async (req, res, next) => {
    try {
        const update_data = req.body;
        const { PageLabelInfo } = getModels();

        if (update_data.length > 0) {
            let isUpdate = false;
            await Promise.all(update_data.map(async (val) => {
                const [affectedRows] = await PageLabelInfo.update(
                    {
                        info_text: val.info_text,
                        modify_by: req.token_data.account_id,
                        modify_date: db.get_ist_current_date()
                    },
                    { where: { label_id: val.label_id } }
                );
                if (affectedRows > 0) {
                    isUpdate = true;
                }
            }));
            if (isUpdate) {
                try {
                    let data_to_log = {
                        correlation_id: correlator.getId(),
                        token_id: req.token_data.token_id,
                        account_id: req.token_data.account_id,
                        user_type: 1,
                        user_id: req.token_data.admin_id,
                        narration: 'Page label info updated.',
                        query: 'ORM Update',
                        date_time: db.get_ist_current_date(),
                    }
                    action_logger.info(JSON.stringify(data_to_log));
                } catch (_) { }

                return res.status(200).json(success(true, res.statusCode, "Updated successfully.", null));
            } else {
                return res.status(200).json(success(false, res.statusCode, "Unable to update label info, Please try again.", null));
            }
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to update label info, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const Api_Check = async (req, res, next) => {
    try {
        let _subject = "This is test subject";
        let body_text = "This is test Message";
        let mailOptions = {
            from: process.env.EMAIL_SUPPORT_EMAIL,
            to: "nitin@velociters.com",
            subject: _subject,
            html: body_text,
        }
        let is_success = false;
        try {
            await supportTransporter.sendMail(mailOptions);
            is_success = true;
        } catch (err) {
            _logger.error(err.stack);
            return res.status(500).json(success(false, res.statusCode, err.message, null));
        }
        return res.status(200).json(success(true, res.statusCode, "Massage sent successfully.", null));

    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

export default {
    login,
    refresh_token,
    token_data,
    logout,
    reset_pass,
    dashboard,

    /**************API COONTACT US START  *************************/
    contact_us_data,
    contact_us_delete,
    contact_us_reply_by_id,
    contact_us_add_reply,
    contact_us_category,
    contact_us_category_set,
    contact_us_category_delete,
    contact_us_category_toggle,

    /**************API COONTACT US END  *************************/
    /************** SETTINGS *************************/
    settings_get,
    settings_update,
    sandbox_auto_approve,
    live_auto_approve,
    settings_get_status,
    customer_auto_approve,

    /************** ADMIN ROLE START *************************/

    admin_reset_link_check,
    verify_reset_pass,
    admin_set_pass_link_check,
    set_new_pass,
    /************** ADMIN ROLE END *************************/
    lable_info_get,
    lable_info_set,
    Api_Check
};
