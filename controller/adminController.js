import adminService from '../services/adminService.js';
import admFaqsService from '../services/admin/admFaqsService.js';
import admTermConditionService from '../services/admin/admTermConditionService.js';
import admTemplatesService from '../services/admin/admTemplatesService.js';
import admUsersService from '../services/admin/admUsersService.js';
import admRolesService from '../services/admin/admRolesService.js';
import admAppRequestService from '../services/admin/admAppRequestService.js';
import admCmsHomeService from '../services/admin/admCmsHomeService.js';
import admCmsGetStartedService from '../services/admin/admCmsGetStartedService.js';
import admAuditLogsService from '../services/admin/auditLogs.js';
import admCustomerService from '../services/admin/admCustomerService.js';
import admAnalyticsReportsService from '../services/admin/admAnalyticsReportsService.js';
import admProductService from '../services/admin/admProductService.js';
import admProductRateAttributeService from '../services/admin/admProductRateAttributeService.js';
import admAppProductRateService from '../services/admin/admAppProductRateService.js';
import admMonitizationRateService from '../services/admin/admMonitizationRateService.js';
import admCustmerWalletService from '../services/admin/admCustmerWalletService.js';
import admProductCategoryService from '../services/admin/admProductCategoryService.js';
import jwtAdmin from '../middleware/jwtAdmin.js';
import multer from 'multer';
import path from 'path';
import timeout from 'connect-timeout';

/**
 * @swagger
 * components:
 *   schemas:
 *     LoginRequest:
 *       type: object
 *       required:
 *         - post_data
 *       properties:
 *         post_data:
 *           type: string
 *           description: RSA encrypted JSON containing user_name and password
 *     LoginResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *         status:
 *           type: boolean
 *         code:
 *           type: integer
 *         results:
 *           type: object
 *           properties:
 *             first_name:
 *               type: string
 *             last_name:
 *               type: string
 *             email_id:
 *               type: string
 *             mobile_no:
 *               type: string
 *             is_master:
 *               type: boolean
 *             access_token:
 *               type: string
 *             refresh_token:
 *               type: string
 *             token_expiry:
 *               type: string
 *             token_issued_at:
 *               type: string
 *             auth_key:
 *               type: string
 *             permissions:
 *               type: array
 *               items:
 *                 type: object
 *             role:
 *               type: string
 */

const adminController = ({ config }) => {
    const router = config.express.Router();
    const storage = multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, 'uploads/');
        },
        filename: function (req, file, cb) {

            cb(null, Date.now() + path.extname(file.originalname));
        },
    });
    function fileFilter(req, file, cb) {
        const allowedExtensions = [".jpeg", ".jpg", ".png", ".yaml", ".json", ".pdf"];
        const fileExtension = path.extname(file.originalname).toLowerCase();

        if (allowedExtensions.includes(fileExtension)) {
            cb(null, true);
        } else {
            cb(new Error("Invalid file extension."), false);
        }
    }
    const upload = multer({ storage: storage, fileFilter: fileFilter, });


    /**
     * @swagger
     * /admin/login:
     *   post:
     *     summary: Admin login
     *     description: Authenticate admin user and get access tokens
     *     tags: [Admin Authentication]
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/LoginRequest'
     *     responses:
     *       200:
     *         description: Login successful
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/LoginResponse'
     */
    router.post('/login', (req, res, next) => {
        return adminService.login(req, res, next);
    });

    /**
     * @swagger
     * /admin/refresh_token:
     *   post:
     *     summary: Refresh access token
     *     description: Get new access token using refresh token
     *     tags: [Admin Authentication]
     *     parameters:
     *       - in: header
     *         name: x-auth-key
     *         required: true
     *         schema:
     *           type: string
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               refresh_token:
     *                 type: string
     *     responses:
     *       200:
     *         description: Token refreshed successfully
     */
    router.post('/refresh_token', (req, res, next) => {
        return adminService.refresh_token(req, res, next);
    });

    /**
     * @swagger
     * /admin/logout:
     *   post:
     *     summary: Admin logout
     *     description: Logout admin user and invalidate tokens
     *     tags: [Admin Authentication]
     *     security:
     *       - bearerAuth: []
     *       - authKey: []
     *     responses:
     *       200:
     *         description: Logout successful
     */
    router.post('/logout', jwtAdmin, (req, res, next) => {
        return adminService.logout(req, res, next);
    });

    router.post('/reset_pass', (req, res, next) => {
        return adminService.reset_pass(req, res, next);
    });

    router.post('/dashboard', jwtAdmin, (req, res, next) => {
        return adminService.dashboard(req, res, next);
    });

    /*************************    MANAGE CUSTOMER */

    router.post('/customer_search_list', jwtAdmin, (req, res, next) => {
        return admCustomerService.customer_search_list(req, res, next);
    });

    router.post('/customer_to_approve', jwtAdmin, (req, res, next) => {
        return admCustomerService.customer_to_approve(req, res, next);
    });

    router.post('/customer_to_activate', jwtAdmin, (req, res, next) => {
        return admCustomerService.customer_to_activate(req, res, next);
    });

    router.post('/customer_approve', jwtAdmin, (req, res, next) => {
        return admCustomerService.customer_approve(req, res, next);
    });

    router.post('/customer_activate', jwtAdmin, (req, res, next) => {
        return admCustomerService.customer_activate(req, res, next);
    });

    router.post('/customer_toggle', jwtAdmin, (req, res, next) => {
        return admCustomerService.customer_toggle(req, res, next);
    });

    router.post('/customer_delete', jwtAdmin, (req, res, next) => {
        return admCustomerService.customer_delete(req, res, next);
    });

    router.post('/all_customer_excel', jwtAdmin, (req, res, next) => {
        return admCustomerService.all_customer_excel(req, res, next);
    });

    router.post('/pending_customer_excel', jwtAdmin, (req, res, next) => {
        return admCustomerService.pending_customer_excel(req, res, next);
    });

    router.post('/activation_customer_excel', jwtAdmin, (req, res, next) => {
        return admCustomerService.activation_customer_excel(req, res, next);
    });
    router.post('/sandbox_customer_add', jwtAdmin, (req, res, next) => {
        return admCustomerService.sandbox_customer_add(req, res, next);
    });
    router.post('/customer_credit_details_get', jwtAdmin, (req, res, next) => {
        return admCustomerService.customer_credit_details_get(req, res, next);
    });

    router.post('/customer_credit_add', jwtAdmin, (req, res, next) => {
        return admCustomerService.customer_credit_add(req, res, next);
    });

    router.post('/customer_search_list_sandbox', jwtAdmin, (req, res, next) => {
        return admCustomerService.customer_search_list_sandbox(req, res, next);
    });

    router.post('/sandbox_customer_excel', jwtAdmin, (req, res, next) => {
        return admCustomerService.sandbox_customer_excel(req, res, next);
    });

    router.post('/all_customer_dropdown', jwtAdmin, (req, res, next) => {
        return admCustomerService.all_customer_dropdown(req, res, next);
    });

    router.post('/sandbox_customer_add_existing', jwtAdmin, (req, res, next) => {
        return admCustomerService.sandbox_customer_add_existing(req, res, next);
    });

    router.post('/customer_toggle_sandbox', jwtAdmin, (req, res, next) => {
        return admCustomerService.customer_toggle_sandbox(req, res, next);
    });

    router.post('/credits_transaction_export', jwtAdmin, (req, res, next) => {
        return admCustomerService.credits_transaction_export(req, res, next);
    });
    router.post('/customer_app_list_get', jwtAdmin, (req, res, next) => {
        return admCustomerService.customer_app_list_get(req, res, next);
    });

    router.post('/customer_analytics_reports_get', (req, res, next) => {
        return admAnalyticsReportsService.customer_analytics_reports_get(req, res, next);
    });

    router.post('/customer_analytics_reports_export', jwtAdmin, timeout('5m'), (req, res, next) => {
        return admCustomerService.customer_analytics_reports_export(req, res, next);
    });

    router.post('/approve_customer_dropdown', jwtAdmin, (req, res, next) => {
        return admCustomerService.approve_customer_dropdown(req, res, next);
    });

    router.post('/analytics_reports_generate_excel', jwtAdmin, (req, res, next) => {
        return admAnalyticsReportsService.analytics_reports_generate_excel(req, res, next);
    });

    router.post('/customer_analytics_reports_download', jwtAdmin, (req, res, next) => {
        return admAnalyticsReportsService.customer_analytics_reports_download(req, res, next);
    });

    router.post('/customer_wallets_balance_add', jwtAdmin, (req, res, next) => {
        return admCustomerService.customer_wallets_balance_add(req, res, next);
    });

    router.post('/customer_wallets_balance_details_get', jwtAdmin, (req, res, next) => {
        return admCustomerService.customer_wallets_balance_details_get(req, res, next);
    });

    router.post('/customer_wallets_balance_history_export', jwtAdmin, (req, res, next) => {
        return admCustomerService.customer_wallets_balance_history_export(req, res, next);
    });

    router.post('/customer_billing_type_toggle', jwtAdmin, (req, res, next) => {
        return admCustomerService.customer_billing_type_toggle(req, res, next);
    });

    router.post('/customer_apigee_balance_update', jwtAdmin, (req, res, next) => {
        return admCustomerService.customer_apigee_balance_update(req, res, next);
    });


    router.post('/report_list', jwtAdmin, (req, res, next) => {
        return admAnalyticsReportsService.report_list(req, res, next);
    });

    router.post('/delete_file_after_3days', (req, res, next) => {
        return admAnalyticsReportsService.delete_file_after_3days(req, res, next);
    });


    /*********************   MANAGE CUSTOMER    *************************/

    /*************************    Home Page's ***************************/

    function cms_file_filter(req, file, cb) {
        const allowedExtensions = ['.jpeg', '.jpg', '.png', '.gif', '.svg'];
        const fileExtension = path.extname(file.originalname).toLowerCase();
        if (allowedExtensions.includes(fileExtension)) {
            cb(null, true); // Accept the file
        } else {
            cb(new Error('Invalid file extension.'), false); // Reject the file
        }
    }

    const cms_image_uploader = multer({ storage: storage, fileFilter: cms_file_filter, });

    router.post('/cms_home_get', jwtAdmin, (req, res, next) => {
        return admCmsHomeService.cms_home_get(req, res, next);
    });
    router.post('/cms_home_set_strip', jwtAdmin, (req, res, next) => {
        return admCmsHomeService.cms_home_set_strip(req, res, next);
    });
    router.post('/cms_home_set_section_1', jwtAdmin, cms_image_uploader.fields([{ name: 'desktop' }, { name: 'mobile' }, { name: 'bottom' },]),
        (req, res, next) => {
            return admCmsHomeService.cms_home_set_section_1(req, res, next);
        });
    router.post('/cms_home_set_section_2', jwtAdmin, cms_image_uploader.fields([{ name: 'desktop' }, { name: 'mobile' }, { name: 'bottom' },]),
        (req, res, next) => {
            return admCmsHomeService.cms_home_set_section_2(req, res, next);
        });
    router.post('/cms_home_set_section_3', jwtAdmin, cms_image_uploader.fields([{ name: 'desktop' }, { name: 'mobile' }, { name: 'bottom' },]),
        (req, res, next) => {
            return admCmsHomeService.cms_home_set_section_3(req, res, next);
        });
    router.post('/cms_home_set_section_4', jwtAdmin, cms_image_uploader.fields([{ name: 'desktop' }, { name: 'mobile' }, { name: 'bottom' },]),
        (req, res, next) => {
            return admCmsHomeService.cms_home_set_section_4(req, res, next);
        });
    router.post('/cms_home_set_section_5', jwtAdmin, (req, res, next) => {
        return admCmsHomeService.cms_home_set_section_5(req, res, next);
    });
    /*************************    Home Page's */
    /*************************    Get Started Page's */
    router.post('/cms_get_started_get', jwtAdmin, (req, res, next) => {
        return admCmsGetStartedService.cms_get_started_get(req, res, next);
    });

    router.post('/cms_get_started_set', jwtAdmin, cms_image_uploader.fields([{ name: 'desktop' },]),
        (req, res, next) => {
            return admCmsGetStartedService.cms_get_started_set(req, res, next);
        });
    /*************************    Get Started Page's */
    /*************************    FAQ's */
    router.post('/faq_type_list', jwtAdmin, (req, res, next) => {
        return admFaqsService.faq_type_list(req, res, next);
    });
    router.post('/faq_type_get', jwtAdmin, (req, res, next) => {
        return admFaqsService.faq_type_get(req, res, next);
    });
    router.post('/faq_type_set', jwtAdmin, (req, res, next) => {
        return admFaqsService.faq_type_set(req, res, next);
    });
    router.post('/faq_type_toggle', jwtAdmin, (req, res, next) => {
        return admFaqsService.faq_type_toggle(req, res, next);
    });
    router.post('/faq_type_dropdown', jwtAdmin, (req, res, next) => {
        return admFaqsService.faq_type_dropdown(req, res, next);
    });
    router.post('/faq_detail_list', jwtAdmin, (req, res, next) => {
        return admFaqsService.faq_detail_list(req, res, next);
    });
    router.post('/faq_detail_get', jwtAdmin, (req, res, next) => {
        return admFaqsService.faq_detail_get(req, res, next);
    });
    router.post('/faq_detail_set', jwtAdmin, (req, res, next) => {
        return admFaqsService.faq_detail_set(req, res, next);
    });
    router.post('/faq_detail_toggle', jwtAdmin, (req, res, next) => {
        return admFaqsService.faq_detail_toggle(req, res, next);
    });
    /* FAQ's    *************************/

    /*************************    T&C's */

    router.post('/term_condition_list', jwtAdmin, (req, res, next) => {
        return admTermConditionService.term_condition_list(req, res, next);
    });
    router.post('/term_condition_set', jwtAdmin, (req, res, next) => {
        return admTermConditionService.term_condition_set(req, res, next);
    });
    router.post('/term_condition_toggle', jwtAdmin, (req, res, next) => {
        return admTermConditionService.term_condition_toggle(req, res, next);
    });
    router.post('/term_condition_delete', jwtAdmin, (req, res, next) => {
        return admTermConditionService.term_condition_delete(req, res, next);
    });

    /* T&C's    *************************/


    router.post('/email_template_list', jwtAdmin, (req, res, next) => {
        return admTemplatesService.email_template_list(req, res, next);
    });
    router.post('/email_template_get', jwtAdmin, (req, res, next) => {
        return admTemplatesService.email_template_get(req, res, next);
    });
    router.post('/email_template_set', jwtAdmin, (req, res, next) => {
        return admTemplatesService.email_template_set(req, res, next);
    });

    router.post('/sms_template_list', jwtAdmin, (req, res, next) => {
        return admTemplatesService.sms_template_list(req, res, next);
    });
    router.post('/sms_template_get', jwtAdmin, (req, res, next) => {
        return admTemplatesService.sms_template_get(req, res, next);
    });
    router.post('/sms_template_set', jwtAdmin, (req, res, next) => {
        return admTemplatesService.sms_template_set(req, res, next);
    });


    /** ***********this is for business email list ************ */
    router.post('/businessEmailList', jwtAdmin, (req, res, next) => {
        return admTemplatesService.businessEmailList(req, res, next);
    });
    router.post('/businessEmailSet', jwtAdmin, (req, res, next) => {
        return admTemplatesService.businessEmailSet(req, res, next);
    });
    router.post('/businessEmailToggle', jwtAdmin, (req, res, next) => {
        return admTemplatesService.businessEmailToggle(req, res, next);
    });
    router.post('/businessEmailDropdown', jwtAdmin, (req, res, next) => {
        return admTemplatesService.businessEmailDropdown(req, res, next);
    });
    router.post('/businessEmailDelete', jwtAdmin, (req, res, next) => {
        return admTemplatesService.businessEmailDelete(req, res, next);
    });



    /*****************************Product Category Start********************************** */
    router.post("/productCategoryList", jwtAdmin, (req, res, next) => {
        return admProductCategoryService.productCategoryList(req, res, next);
    });
    router.post("/productCategoryGet", jwtAdmin, (req, res, next) => {
        return admProductCategoryService.productCategoryGet(req, res, next);
    });
    router.post("/productCategorySet", jwtAdmin, (req, res, next) => {
        return admProductCategoryService.productCategorySet(req, res, next);
    });
    router.post("/productCategoryToggle", jwtAdmin, (req, res, next) => {
        return admProductCategoryService.productCategoryToggle(req, res, next);
    });
    router.post("/productCategoryDropdown", jwtAdmin, (req, res, next) => {
        return admProductCategoryService.productCategoryDropdown(req, res, next);
    });

    router.post("/productCategoryDelete", jwtAdmin, (req, res, next) => {
        return admProductCategoryService.productCategoryDelete(req, res, next);
    });
    /*****************************Product Category END*************************** */

    /*************************Api Product    *************************/

    router.post("/api_products_list", jwtAdmin, (req, res, next) => {
        return admProductService.api_products_list(req, res, next);
    });
    router.post("/api_products_publish", jwtAdmin, (req, res, next) => {
        return admProductService.api_products_publish(req, res, next);
    });
    router.post("/api_products_update", jwtAdmin, (req, res, next) => {
        return admProductService.api_products_update(req, res, next);
    });

    router.post("/product_get", jwtAdmin, (req, res, next) => {
        return admProductService.product_get(req, res, next);
    });
    router.post("/proxy_description_set", jwtAdmin, (req, res, next) => {
        return admProductService.proxy_description_set(req, res, next);
    });
    router.post("/proxy_publish_toggle", jwtAdmin, (req, res, next) => {
        return admProductService.proxy_publish_toggle(req, res, next);
    });

    router.post("/proxy_products_update", jwtAdmin, (req, res, next) => {
        return admProductService.proxy_products_update(req, res, next);
    });

    router.post('/product_detail_update', jwtAdmin, upload.fields([
        { name: 'product_icon' },
        { name: 'flow_chart' },
        { name: 'product_open_spec' },
        { name: 'product_open_spec_json' },
        { name: 'product_documentation_pdf' },

    ]), (req, res, next) => {
        return admProductService.product_detail_update(req, res, next);
    });

    router.post('/product_page_text_update', jwtAdmin, (req, res, next) => {
        return admProductService.product_page_text_update(req, res, next);
    });

    router.post("/product_image_delete", jwtAdmin, (req, res, next) => {
        return admProductService.product_image_delete(req, res, next);
    });

    router.post("/product_set_new", jwtAdmin, (req, res, next) => {
        return admProductService.product_set_new(req, res, next);
    });
    router.post('/product_delete', jwtAdmin, (req, res, next) => {
        return admProductService.product_delete(req, res, next);
    });

    router.post('/proxy_endpoint_publish_toggle', jwtAdmin, (req, res, next) => {
        return admProductService.proxy_endpoint_publish_toggle(req, res, next);
    });

    router.post('/proxy_endpoint_details_update', jwtAdmin, (req, res, next) => {
        return admProductService.proxy_endpoint_details_update(req, res, next);
    });

    router.post('/endpoint_field_update', jwtAdmin, (req, res, next) => {
        return admProductService.endpoint_field_update(req, res, next);
    });

    router.post('/product_pages_set', jwtAdmin, (req, res, next) => {
        return admProductService.product_pages_set(req, res, next);
    });

    router.post('/product_pages_publish_toggle', jwtAdmin, (req, res, next) => {
        return admProductService.product_pages_publish_toggle(req, res, next);
    });

    router.post('/product_pages_menu_delete', jwtAdmin, (req, res, next) => {
        return admProductService.product_pages_menu_delete(req, res, next);
    });

    router.post('/proxy_schema_set', jwtAdmin, (req, res, next) => {
        return admProductService.proxy_schema_set(req, res, next);
    });

    router.post('/proxy_schema_list', jwtAdmin, (req, res, next) => {
        return admProductService.proxy_schema_list(req, res, next);
    });

    router.post('/proxy_schema_delete', jwtAdmin, (req, res, next) => {
        return admProductService.proxy_schema_delete(req, res, next);
    });

    router.post('/proxy_schema_toggle', jwtAdmin, (req, res, next) => {
        return admProductService.proxy_schema_toggle(req, res, next);
    });

    router.post('/products_publish_api_product', jwtAdmin, (req, res, next) => {
        return admProductService.products_publish_api_product(req, res, next);
    });

    router.post('/proxy_endpoint_publish_api_product', jwtAdmin, (req, res, next) => {
        return admProductService.proxy_endpoint_publish_api_product(req, res, next);
    });

    router.post('/manual_endpoint_set', jwtAdmin, (req, res, next) => {
        return admProductService.manual_endpoint_set(req, res, next);
    });


    router.post('/products_routing_set', jwtAdmin, (req, res, next) => {
        return admProductService.products_routing_set(req, res, next);
    });

    router.post('/product_apigee_rate_add', jwtAdmin, (req, res, next) => {
        return admProductService.product_apigee_rate_add(req, res, next);
    });

    router.post('/dropdown_products', jwtAdmin, (req, res, next) => {
        return admProductService.dropdown_products(req, res, next);
    });







    /*************************Api CONTACT US   START *************************/

    router.post('/contact_us_delete', jwtAdmin, (req, res, next) => {
        return adminService.contact_us_delete(req, res, next);
    });

    router.post('/contact_us_data', jwtAdmin, (req, res, next) => {
        return adminService.contact_us_data(req, res, next);
    });
    router.post('/contact_us_reply_by_id', jwtAdmin, (req, res, next) => {
        return adminService.contact_us_reply_by_id(req, res, next);
    });

    router.post('/contact_us_add_reply', jwtAdmin, (req, res, next) => {
        return adminService.contact_us_add_reply(req, res, next);
    });

    router.post('/contact_us_category', jwtAdmin, (req, res, next) => {
        return adminService.contact_us_category(req, res, next);
    });
    router.post('/contact_us_category_set', jwtAdmin, (req, res, next) => {
        return adminService.contact_us_category_set(req, res, next);
    });
    router.post('/contact_us_category_delete', jwtAdmin, (req, res, next) => {
        return adminService.contact_us_category_delete(req, res, next);
    });
    router.post('/contact_us_category_toggle', jwtAdmin, (req, res, next) => {
        return adminService.contact_us_category_toggle(req, res, next);
    });
    /*************************Api CONTACT US   END *************************/



    /************************* settings *************************/
    router.post('/settings_get', jwtAdmin, (req, res, next) => {
        return adminService.settings_get(req, res, next);
    });

    router.post('/settings_update', upload.fields([{ name: 'logo_image' }]), jwtAdmin, (req, res, next) => {
        return adminService.settings_update(req, res, next);
    });
    router.post('/sandbox_auto_approve', jwtAdmin, (req, res, next) => {
        return adminService.sandbox_auto_approve(req, res, next);
    });
    router.post('/live_auto_approve', jwtAdmin, (req, res, next) => {
        return adminService.live_auto_approve(req, res, next);
    });
    router.post('/settings_get_status', jwtAdmin, (req, res, next) => {
        return adminService.settings_get_status(req, res, next);
    });
    router.post('/customer_auto_approve', jwtAdmin, (req, res, next) => {
        return adminService.customer_auto_approve(req, res, next);
    });

    /************************* ROLE START *************************/


    router.post('/admin_role_list', jwtAdmin, (req, res, next) => {
        return admRolesService.role_list(req, res, next);
    });

    router.post('/admin_role_get', jwtAdmin, (req, res, next) => {
        return admRolesService.role_get(req, res, next);
    });

    router.post('/admin_role_set', jwtAdmin, (req, res, next) => {
        return admRolesService.role_set(req, res, next);
    });

    router.post('/admin_role_toggle', jwtAdmin, (req, res, next) => {
        return admRolesService.role_toggle(req, res, next);
    });

    router.post('/admin_role_delete', jwtAdmin, (req, res, next) => {
        return admRolesService.role_delete(req, res, next);
    });

    router.post('/admin_role_dropdown', jwtAdmin, (req, res, next) => {
        return admRolesService.role_dropdown(req, res, next);
    });

    router.post('/role_permission_list', jwtAdmin, (req, res, next) => {
        return admRolesService.permission_list(req, res, next);
    });

    router.post('/role_permission_update', jwtAdmin, (req, res, next) => {
        return admRolesService.permission_update(req, res, next);
    });


    /************************* ROLE END *************************/

    /************************* ADMIN USER START *************************/

    router.post('/admin_user_set', jwtAdmin, (req, res, next) => {
        return admUsersService.admin_user_set(req, res, next);
    });

    router.post('/admin_user_list', jwtAdmin, (req, res, next) => {
        return admUsersService.admin_user_list(req, res, next);
    });

    router.post('/admin_user_get', jwtAdmin, (req, res, next) => {
        return admUsersService.admin_user_get(req, res, next);
    });

    router.post('/admin_user_toggle', jwtAdmin, (req, res, next) => {
        return admUsersService.admin_user_toggle(req, res, next);
    });

    router.post('/admin_user_delete', jwtAdmin, (req, res, next) => {
        return admUsersService.admin_user_delete(req, res, next);
    });

    router.post('/user_send_invite', jwtAdmin, (req, res, next) => {
        return admUsersService.user_send_invite(req, res, next);
    });


    /************************* ADMIN USER END *************************/

    /************************* ADMIN App Start *************************/
    router.post('/app_req_pending', jwtAdmin, (req, res, next) => {
        return admAppRequestService.app_req_pending(req, res, next);
    });

    router.post('/app_req_approved', jwtAdmin, (req, res, next) => {
        return admAppRequestService.app_req_approved(req, res, next);
    });

    router.post('/app_req_rejected', jwtAdmin, (req, res, next) => {
        return admAppRequestService.app_req_rejected(req, res, next);
    });

    router.post('/app_req_view_detail', jwtAdmin, (req, res, next) => {
        return admAppRequestService.app_req_view_detail(req, res, next);
    });
    router.post('/app_req_approve', jwtAdmin, (req, res, next) => {
        return admAppRequestService.app_req_approve(req, res, next);
    });
    router.post('/app_req_reject', jwtAdmin, (req, res, next) => {
        return admAppRequestService.app_req_reject(req, res, next);
    });

    router.post('/app_req_move_live', jwtAdmin, (req, res, next) => {
        return admAppRequestService.app_req_move_live(req, res, next);
    });

    // router.post('/app_req_live', jwtAdmin, (req, res, next) => {
    //     return admAppRequestService.app_req_live(req, res, next);
    // });
    router.post('/app_req_status_change', jwtAdmin, (req, res, next) => {
        return admAppRequestService.app_req_status_change(req, res, next);
    });

    router.post('/app_req_live', jwtAdmin, async (req, res, next) => {
        return admAppRequestService.app_req_live(req, res, next);
    });

    router.post('/app_product_list_get', jwtAdmin, async (req, res, next) => {
        return admAppRequestService.app_product_list_get(req, res, next);
    });

    router.post('/app_routing_logic_kvm_update', jwtAdmin, async (req, res, next) => {
        return admAppRequestService.app_routing_logic_kvm_update(req, res, next);
    });

    router.post('/app_product_apigee_rate_add', jwtAdmin, async (req, res, next) => {
        return admAppRequestService.app_product_apigee_rate_add(req, res, next);
    });

    router.post('/app_monitization_toggle', jwtAdmin, async (req, res, next) => {
        return admAppRequestService.app_monitization_toggle(req, res, next);
    });
    router.post('/app_rate_subscription', jwtAdmin, async (req, res, next) => {
        return admAppRequestService.app_rate_subscription(req, res, next);
    });

    router.post('/app_monitization_toggle_uat_prod', jwtAdmin, async (req, res, next) => {
        return admAppRequestService.app_monitization_toggle_uat_prod(req, res, next);
    });



    /************************* ADMIN App END *************************/


    router.post('/admin_reset_link_check', async (req, res, next) => {
        return adminService.admin_reset_link_check(req, res, next);
    });

    router.post('/verify_reset_pass', async (req, res, next) => {
        return adminService.verify_reset_pass(req, res, next);
    });


    router.post('/admin_set_pass_link_check', async (req, res, next) => {
        return adminService.admin_set_pass_link_check(req, res, next);
    });
    router.post('/set_new_pass', async (req, res, next) => {
        return adminService.set_new_pass(req, res, next);
    });

    /************************* LABEL INFO *************************/
    router.post('/lable_info_get', jwtAdmin, async (req, res, next) => {
        return adminService.lable_info_get(req, res, next);
    });
    router.post('/lable_info_set', jwtAdmin, async (req, res, next) => {
        return adminService.lable_info_set(req, res, next);
    });
    router.post('/Api_Check', async (req, res, next) => {
        return adminService.Api_Check(req, res, next);
    });
    router.post('/all_users_excel', jwtAdmin, async (req, res, next) => {
        return admUsersService.all_users_excel(req, res, next);
    });

    /************************* Audit Logs *************************/
    router.post('/api_history_logs', jwtAdmin, (req, res, next) => {
        return admAuditLogsService.api_history_logs(req, res, next);
    });
    router.post('/user_history_logs', jwtAdmin, (req, res, next) => {
        return admAuditLogsService.user_history_logs(req, res, next);
    });

    /************************* End Audit Logs *************************/

    /************************* Product Attribute Rate Start *************************/
    router.post('/product_rate_attribute_add', jwtAdmin, (req, res, next) => {
        return admProductRateAttributeService.product_rate_attribute_add(req, res, next);
    });
    router.post('/product_rate_attribute_pending_list', jwtAdmin, (req, res, next) => {
        return admProductRateAttributeService.product_rate_attribute_pending_list(req, res, next);
    });
    router.post('/product_rate_attribute_approve_list', jwtAdmin, (req, res, next) => {
        return admProductRateAttributeService.product_rate_attribute_approve_list(req, res, next);
    });
    router.post('/product_rate_attribute_rejected_list', jwtAdmin, (req, res, next) => {
        return admProductRateAttributeService.product_rate_attribute_rejected_list(req, res, next);
    });
    router.post('/product_rate_attribute_reject', jwtAdmin, (req, res, next) => {
        return admProductRateAttributeService.product_rate_attribute_reject(req, res, next);
    });
    router.post('/product_rate_attribute_approve', jwtAdmin, (req, res, next) => {
        return admProductRateAttributeService.product_rate_attribute_approve(req, res, next);
    });
    /************************* Product Attribute Rate Start *************************/

    /************************* App Product Rate Start *************************/
    router.post('/app_product_rate_add', jwtAdmin, (req, res, next) => {
        return admAppProductRateService.app_product_rate_add(req, res, next);
    });
    router.post('/app_product_rate_pending_list', jwtAdmin, (req, res, next) => {
        return admAppProductRateService.app_product_rate_pending_list(req, res, next);
    });

    router.post('/app_product_rate_approve_list', jwtAdmin, (req, res, next) => {
        return admAppProductRateService.app_product_rate_approve_list(req, res, next);
    });
    router.post('/app_product_rate_rejected_list', jwtAdmin, (req, res, next) => {
        return admAppProductRateService.app_product_rate_rejected_list(req, res, next);
    });
    router.post('/app_product_rate_reject', jwtAdmin, (req, res, next) => {
        return admAppProductRateService.app_product_rate_reject(req, res, next);
    });
    router.post('/app_product_rate_approve', jwtAdmin, (req, res, next) => {
        return admAppProductRateService.app_product_rate_approve(req, res, next);
    });

    /************************* App Product Rate Start *************************/
    /************************* Product Monitazation Rate Start *************************/
    router.post('/product_monitization_rate_add', jwtAdmin, (req, res, next) => {
        return admMonitizationRateService.product_monitization_rate_update(req, res, next);
    });
    router.post('/product_monitization_rate_pending_list', jwtAdmin, (req, res, next) => {
        return admMonitizationRateService.product_monitization_rate_pending_list(req, res, next);
    });
    router.post('/product_monitization_rate_approve_list', jwtAdmin, (req, res, next) => {
        return admMonitizationRateService.product_monitization_rate_approve_list(req, res, next);
    });
    router.post('/product_monitization_rate_rejected_list', jwtAdmin, (req, res, next) => {
        return admMonitizationRateService.product_monitization_rate_rejected_list(req, res, next);
    });
    router.post('/product_monitization_rate_reject', jwtAdmin, (req, res, next) => {
        return admMonitizationRateService.product_monitization_rate_reject(req, res, next);
    });
    router.post('/product_monitization_rate_approve', jwtAdmin, (req, res, next) => {
        return admMonitizationRateService.product_monitization_rate_approve(req, res, next);
    });
    router.post('/product_monitization_rate_req_view_detail', jwtAdmin, (req, res, next) => {
        return admMonitizationRateService.product_monitization_rate_req_view_detail(req, res, next);
    });

    /************************* Product Monitazation Rate End *************************/

    /************************* Customer Wallet Amount Details Start *************************/

    router.post('/wallet_balance_add', jwtAdmin, (req, res, next) => {
        return admCustmerWalletService.wallet_balance_add(req, res, next);
    });
    router.post('/wallet_balance_pending_list', jwtAdmin, (req, res, next) => {
        return admCustmerWalletService.wallet_balance_pending_list(req, res, next);
    });
    router.post('/wallet_balance_approve_list', jwtAdmin, (req, res, next) => {
        return admCustmerWalletService.wallet_balance_approve_list(req, res, next);
    });
    router.post('/wallet_balance_rejected_list', jwtAdmin, (req, res, next) => {
        return admCustmerWalletService.wallet_balance_rejected_list(req, res, next);
    });
    router.post('/wallet_balance_reject', jwtAdmin, (req, res, next) => {
        return admCustmerWalletService.wallet_balance_reject(req, res, next);
    });
    router.post('/wallet_balance_approve', jwtAdmin, (req, res, next) => {
        return admCustmerWalletService.wallet_balance_approve(req, res, next);
    });

    return router;
};

export default adminController;
