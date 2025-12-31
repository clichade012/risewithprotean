/**
 * @swagger
 * tags:
 *   - name: Admin Authentication
 *     description: Admin login, logout, and token management
 *   - name: Admin Dashboard
 *     description: Admin dashboard and statistics
 *   - name: Admin Settings
 *     description: Application settings management
 *   - name: Contact Us
 *     description: Contact us/Feedback management
 *   - name: Admin Customer
 *     description: Customer management by admin
 *   - name: Admin FAQ
 *     description: FAQ management
 *   - name: Admin Users
 *     description: Admin user management
 *   - name: Admin Roles
 *     description: Admin role and permission management
 *   - name: CMS Home Page
 *     description: Home page content management system
 *   - name: Customer Wallet Management
 *     description: Customer wallet balance and transaction management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     StandardResponse:
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
 *
 *     DashboardResponse:
 *       type: object
 *       properties:
 *         total_customer:
 *           type: integer
 *         total_customer_to_approve:
 *           type: integer
 *         total_customer_to_activate:
 *           type: integer
 *         total_faq_detail_list:
 *           type: integer
 *
 *     ContactUsData:
 *       type: object
 *       properties:
 *         sr_no:
 *           type: integer
 *         ticket_id:
 *           type: integer
 *         id:
 *           type: integer
 *         customer_id:
 *           type: integer
 *         first_name:
 *           type: string
 *         last_name:
 *           type: string
 *         email_id:
 *           type: string
 *         company_name:
 *           type: string
 *         category_name:
 *           type: string
 *         mobile_no:
 *           type: string
 *         subject:
 *           type: string
 *         message:
 *           type: string
 *         added_date:
 *           type: string
 *
 *     FeedbackCategory:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         name:
 *           type: string
 *         is_enabled:
 *           type: boolean
 *         added_on:
 *           type: string
 *         modify_on:
 *           type: string
 *
 *     SettingsData:
 *       type: object
 *       properties:
 *         logo_path:
 *           type: string
 *         copyright:
 *           type: string
 *         is_live_auto_approve:
 *           type: boolean
 *         is_sandbox_auto_approve:
 *           type: boolean
 *         is_auto_approve_customer:
 *           type: boolean
 */

/**
 * @swagger
 * /admin/reset_pass:
 *   post:
 *     summary: Request password reset
 *     description: Send password reset link to admin email
 *     tags: [Admin Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email_id:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Reset link sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 */

/**
 * @swagger
 * /admin/dashboard:
 *   post:
 *     summary: Get admin dashboard statistics
 *     description: Retrieve dashboard counts for customers, FAQs, etc.
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     responses:
 *       200:
 *         description: Dashboard data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     results:
 *                       $ref: '#/components/schemas/DashboardResponse'
 */

/**
 * @swagger
 * /admin/contact_us_data:
 *   post:
 *     summary: Get contact us/feedback list
 *     description: Retrieve paginated list of contact us submissions
 *     tags: [Contact Us]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page_no:
 *                 type: integer
 *                 default: 1
 *               search_text:
 *                 type: string
 *     responses:
 *       200:
 *         description: Contact us data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     results:
 *                       type: object
 *                       properties:
 *                         current_page:
 *                           type: integer
 *                         total_pages:
 *                           type: integer
 *                         data:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/ContactUsData'
 */

/**
 * @swagger
 * /admin/contact_us_delete:
 *   post:
 *     summary: Delete contact us entry
 *     description: Soft delete a contact us submission
 *     tags: [Contact Us]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - feedback_id
 *             properties:
 *               feedback_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Entry deleted successfully
 */

/**
 * @swagger
 * /admin/contact_us_reply_by_id:
 *   post:
 *     summary: Get replies for a feedback
 *     description: Retrieve all replies for a specific feedback entry
 *     tags: [Contact Us]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - feedback_id
 *             properties:
 *               feedback_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Replies retrieved successfully
 */

/**
 * @swagger
 * /admin/contact_us_add_reply:
 *   post:
 *     summary: Add reply to feedback
 *     description: Add a new reply to a contact us entry and send email notification
 *     tags: [Contact Us]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - feedback_id
 *               - message
 *             properties:
 *               feedback_id:
 *                 type: integer
 *               message:
 *                 type: string
 *     responses:
 *       200:
 *         description: Reply sent successfully
 */

/**
 * @swagger
 * /admin/contact_us_category:
 *   post:
 *     summary: Get feedback categories
 *     description: Retrieve all feedback/contact us categories
 *     tags: [Contact Us]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     responses:
 *       200:
 *         description: Categories retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     results:
 *                       type: object
 *                       properties:
 *                         data:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/FeedbackCategory'
 */

/**
 * @swagger
 * /admin/contact_us_category_set:
 *   post:
 *     summary: Create or update feedback category
 *     description: Add new category or update existing one
 *     tags: [Contact Us]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - category_name
 *             properties:
 *               category_id:
 *                 type: integer
 *                 description: Pass 0 for new category
 *               category_name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Category saved successfully
 */

/**
 * @swagger
 * /admin/contact_us_category_toggle:
 *   post:
 *     summary: Toggle category status
 *     description: Enable or disable a feedback category
 *     tags: [Contact Us]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - category_id
 *             properties:
 *               category_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Status changed successfully
 */

/**
 * @swagger
 * /admin/contact_us_category_delete:
 *   post:
 *     summary: Delete feedback category
 *     description: Soft delete a feedback category
 *     tags: [Contact Us]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - category_id
 *             properties:
 *               category_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Category deleted successfully
 */

/**
 * @swagger
 * /admin/settings_get:
 *   post:
 *     summary: Get application settings
 *     description: Retrieve logo and copyright settings
 *     tags: [Admin Settings]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     responses:
 *       200:
 *         description: Settings retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     results:
 *                       type: object
 *                       properties:
 *                         data:
 *                           $ref: '#/components/schemas/SettingsData'
 */

/**
 * @swagger
 * /admin/settings_update:
 *   post:
 *     summary: Update application settings
 *     description: Update logo and copyright settings
 *     tags: [Admin Settings]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               logo_image:
 *                 type: string
 *                 format: binary
 *               copyright:
 *                 type: string
 *     responses:
 *       200:
 *         description: Settings updated successfully
 */

/**
 * @swagger
 * /admin/settings_get_status:
 *   post:
 *     summary: Get auto-approve status settings
 *     description: Retrieve auto-approve flags for sandbox, live, and customer
 *     tags: [Admin Settings]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     responses:
 *       200:
 *         description: Status settings retrieved
 */

/**
 * @swagger
 * /admin/sandbox_auto_approve:
 *   post:
 *     summary: Toggle sandbox auto-approve
 *     description: Enable or disable automatic approval for sandbox apps
 *     tags: [Admin Settings]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     responses:
 *       200:
 *         description: Status changed successfully
 */

/**
 * @swagger
 * /admin/live_auto_approve:
 *   post:
 *     summary: Toggle live auto-approve
 *     description: Enable or disable automatic approval for live apps
 *     tags: [Admin Settings]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     responses:
 *       200:
 *         description: Status changed successfully
 */

/**
 * @swagger
 * /admin/customer_auto_approve:
 *   post:
 *     summary: Toggle customer auto-approve
 *     description: Enable or disable automatic approval for new customers
 *     tags: [Admin Settings]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     responses:
 *       200:
 *         description: Status changed successfully
 */

/**
 * @swagger
 * /admin/customer_search_list:
 *   post:
 *     summary: Search customers
 *     description: Get paginated list of customers with search
 *     tags: [Admin Customer]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page_no:
 *                 type: integer
 *               search_text:
 *                 type: string
 *     responses:
 *       200:
 *         description: Customer list retrieved
 */

/**
 * @swagger
 * /admin/customer_to_approve:
 *   post:
 *     summary: Get customers pending approval
 *     description: List customers waiting for admin approval
 *     tags: [Admin Customer]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page_no:
 *                 type: integer
 *               search_text:
 *                 type: string
 *     responses:
 *       200:
 *         description: Pending customers list retrieved
 */

/**
 * @swagger
 * /admin/customer_approve:
 *   post:
 *     summary: Approve customer
 *     description: Approve a pending customer registration
 *     tags: [Admin Customer]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customer_id
 *             properties:
 *               customer_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Customer approved successfully
 */

/**
 * @swagger
 * /admin/faq_type_list:
 *   post:
 *     summary: Get FAQ type list
 *     description: Retrieve all FAQ categories/types
 *     tags: [Admin FAQ]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     responses:
 *       200:
 *         description: FAQ types retrieved
 */

/**
 * @swagger
 * /admin/faq_detail_list:
 *   post:
 *     summary: Get FAQ details
 *     description: Retrieve FAQ questions and answers for a type
 *     tags: [Admin FAQ]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: FAQ details retrieved
 */

/**
 * @swagger
 * /admin/admin_reset_link_check:
 *   post:
 *     summary: Verify reset password link
 *     description: Check if password reset link is valid and not expired
 *     tags: [Admin Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Link validation result
 */

/**
 * @swagger
 * /admin/verify_reset_pass:
 *   post:
 *     summary: Reset password with token
 *     description: Set new password using reset token
 *     tags: [Admin Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - password
 *             properties:
 *               token:
 *                 type: string
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 description: Must contain number and special character
 *     responses:
 *       200:
 *         description: Password reset result
 */

/**
 * @swagger
 * /admin/users_list:
 *   post:
 *     summary: Get admin users list
 *     description: Retrieve list of admin users
 *     tags: [Admin Users]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page_no:
 *                 type: integer
 *               search_text:
 *                 type: string
 *     responses:
 *       200:
 *         description: Admin users list retrieved
 */

/**
 * @swagger
 * /admin/roles_list:
 *   post:
 *     summary: Get admin roles list
 *     description: Retrieve list of admin roles
 *     tags: [Admin Roles]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     responses:
 *       200:
 *         description: Roles list retrieved
 */

/**
 * @swagger
 * /admin/permissions_list:
 *   post:
 *     summary: Get permissions list
 *     description: Retrieve list of available permissions
 *     tags: [Admin Roles]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     responses:
 *       200:
 *         description: Permissions list retrieved
 */

/**
 * @swagger
 * /admin/customer_to_activate:
 *   post:
 *     summary: Get customers pending activation
 *     description: List customers waiting for activation
 *     tags: [Admin Customer]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page_no:
 *                 type: integer
 *               search_text:
 *                 type: string
 *     responses:
 *       200:
 *         description: Pending activation customers list retrieved
 */

/**
 * @swagger
 * /admin/customer_activate:
 *   post:
 *     summary: Activate customer
 *     description: Activate a pending customer
 *     tags: [Admin Customer]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customer_id
 *             properties:
 *               customer_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Customer activated successfully
 */

/**
 * @swagger
 * /admin/customer_toggle:
 *   post:
 *     summary: Toggle customer status
 *     description: Enable or disable a customer
 *     tags: [Admin Customer]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customer_id
 *             properties:
 *               customer_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Customer status toggled
 */

/**
 * @swagger
 * /admin/customer_delete:
 *   post:
 *     summary: Delete customer
 *     description: Soft delete a customer
 *     tags: [Admin Customer]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customer_id
 *             properties:
 *               customer_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Customer deleted successfully
 */

/**
 * @swagger
 * /admin/all_customer_excel:
 *   post:
 *     summary: Export all customers to Excel
 *     description: Generate Excel file with all customers data
 *     tags: [Admin Customer]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     responses:
 *       200:
 *         description: Excel file generated
 */

/**
 * @swagger
 * /admin/pending_customer_excel:
 *   post:
 *     summary: Export pending customers to Excel
 *     description: Generate Excel file with pending customers
 *     tags: [Admin Customer]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     responses:
 *       200:
 *         description: Excel file generated
 */

/**
 * @swagger
 * /admin/activation_customer_excel:
 *   post:
 *     summary: Export activation pending customers to Excel
 *     description: Generate Excel file with customers pending activation
 *     tags: [Admin Customer]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     responses:
 *       200:
 *         description: Excel file generated
 */

/**
 * @swagger
 * /admin/sandbox_customer_add:
 *   post:
 *     summary: Add sandbox customer
 *     description: Create a new sandbox customer
 *     tags: [Admin Customer]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               company_name:
 *                 type: string
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               email_id:
 *                 type: string
 *               mobile_no:
 *                 type: string
 *     responses:
 *       200:
 *         description: Sandbox customer created
 */

/**
 * @swagger
 * /admin/customer_credit_details_get:
 *   post:
 *     summary: Get customer credit details
 *     description: Retrieve credit details for a customer
 *     tags: [Admin Customer]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customer_id
 *             properties:
 *               customer_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Credit details retrieved
 */

/**
 * @swagger
 * /admin/customer_credit_add:
 *   post:
 *     summary: Add customer credits
 *     description: Add credits to customer account
 *     tags: [Admin Customer]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customer_id
 *               - credits
 *             properties:
 *               customer_id:
 *                 type: integer
 *               credits:
 *                 type: number
 *     responses:
 *       200:
 *         description: Credits added successfully
 */

/**
 * @swagger
 * /admin/customer_search_list_sandbox:
 *   post:
 *     summary: Search sandbox customers
 *     description: Get paginated list of sandbox customers
 *     tags: [Admin Customer]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page_no:
 *                 type: integer
 *               search_text:
 *                 type: string
 *     responses:
 *       200:
 *         description: Sandbox customers list retrieved
 */

/**
 * @swagger
 * /admin/sandbox_customer_excel:
 *   post:
 *     summary: Export sandbox customers to Excel
 *     description: Generate Excel file with sandbox customers
 *     tags: [Admin Customer]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     responses:
 *       200:
 *         description: Excel file generated
 */

/**
 * @swagger
 * /admin/all_customer_dropdown:
 *   post:
 *     summary: Get all customers dropdown
 *     description: Get customers list for dropdown selection
 *     tags: [Admin Customer]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     responses:
 *       200:
 *         description: Customers dropdown retrieved
 */

/**
 * @swagger
 * /admin/sandbox_customer_add_existing:
 *   post:
 *     summary: Add existing customer to sandbox
 *     description: Link existing customer to sandbox environment
 *     tags: [Admin Customer]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customer_id
 *             properties:
 *               customer_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Customer added to sandbox
 */

/**
 * @swagger
 * /admin/customer_toggle_sandbox:
 *   post:
 *     summary: Toggle sandbox customer status
 *     description: Enable or disable sandbox customer
 *     tags: [Admin Customer]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customer_id
 *             properties:
 *               customer_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Status toggled
 */

/**
 * @swagger
 * /admin/credits_transaction_export:
 *   post:
 *     summary: Export credits transactions
 *     description: Generate Excel file with credit transactions
 *     tags: [Admin Customer]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               customer_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Export generated
 */

/**
 * @swagger
 * /admin/customer_app_list_get:
 *   post:
 *     summary: Get customer app list
 *     description: Retrieve list of apps for a customer
 *     tags: [Admin Customer]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customer_id
 *             properties:
 *               customer_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: App list retrieved
 */

/**
 * @swagger
 * /admin/customer_wallets_balance_add:
 *   post:
 *     summary: Add wallet balance
 *     description: Add balance to customer wallet
 *     tags: [Admin Customer]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customer_id
 *               - amount
 *             properties:
 *               customer_id:
 *                 type: integer
 *               amount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Balance added
 */

/**
 * @swagger
 * /admin/customer_wallets_balance_details_get:
 *   post:
 *     summary: Get wallet balance details
 *     description: Retrieve wallet balance for customer
 *     tags: [Admin Customer]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customer_id
 *             properties:
 *               customer_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Balance details retrieved
 */

/**
 * @swagger
 * /admin/customer_billing_type_toggle:
 *   post:
 *     summary: Toggle billing type
 *     description: Toggle customer billing type
 *     tags: [Admin Customer]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customer_id
 *             properties:
 *               customer_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Billing type toggled
 */

/**
 * @swagger
 * /admin/approve_customer_dropdown:
 *   post:
 *     summary: Get approved customers dropdown
 *     description: Get approved customers for dropdown
 *     tags: [Admin Customer]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     responses:
 *       200:
 *         description: Dropdown retrieved
 */

/**
 * @swagger
 * tags:
 *   - name: CMS Home
 *     description: CMS Home page management
 *   - name: CMS Get Started
 *     description: CMS Get Started page management
 *   - name: Terms & Conditions
 *     description: Terms and Conditions management
 *   - name: Email Templates
 *     description: Email template management
 *   - name: SMS Templates
 *     description: SMS template management
 *   - name: Business Email
 *     description: Business email management
 *   - name: Product Category
 *     description: Product category management
 *   - name: API Products
 *     description: API products management
 *   - name: App Requests
 *     description: App request management
 *   - name: Label Info
 *     description: Page label information management
 *   - name: Audit Logs
 *     description: System audit logs
 *   - name: Product Rate
 *     description: Product rate attribute management
 *   - name: App Product Rate
 *     description: App product rate management
 *   - name: Monetization Rate
 *     description: Product monetization rate management
 *   - name: Wallet
 *     description: Customer wallet management
 *   - name: Analytics Reports
 *     description: Analytics and reports
 */

/**
 * @swagger
 * /admin/cms_home_get:
 *   post:
 *     summary: Get CMS home page content
 *     description: Retrieve home page CMS content
 *     tags: [CMS Home]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     responses:
 *       200:
 *         description: CMS content retrieved
 */

/**
 * @swagger
 * /admin/cms_home_set_strip:
 *   post:
 *     summary: Set CMS home strip content
 *     description: Update home page strip section
 *     tags: [CMS Home]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               strip_text:
 *                 type: string
 *               is_enabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Strip content updated
 */

/**
 * @swagger
 * /admin/cms_home_set_section_1:
 *   post:
 *     summary: Set CMS home section 1
 *     description: Update home page section 1 with images
 *     tags: [CMS Home]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               desktop:
 *                 type: string
 *                 format: binary
 *               mobile:
 *                 type: string
 *                 format: binary
 *               bottom:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Section updated
 */

/**
 * @swagger
 * /admin/cms_get_started_get:
 *   post:
 *     summary: Get CMS get started content
 *     description: Retrieve get started page CMS content
 *     tags: [CMS Get Started]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     responses:
 *       200:
 *         description: Content retrieved
 */

/**
 * @swagger
 * /admin/cms_get_started_set:
 *   post:
 *     summary: Set CMS get started content
 *     description: Update get started page with image
 *     tags: [CMS Get Started]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               desktop:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Content updated
 */

/**
 * @swagger
 * /admin/faq_type_get:
 *   post:
 *     summary: Get FAQ type details
 *     description: Retrieve specific FAQ type
 *     tags: [Admin FAQ]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type_id
 *             properties:
 *               type_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: FAQ type retrieved
 */

/**
 * @swagger
 * /admin/faq_type_set:
 *   post:
 *     summary: Create or update FAQ type
 *     description: Add new FAQ type or update existing
 *     tags: [Admin FAQ]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type_id:
 *                 type: integer
 *               type_name:
 *                 type: string
 *     responses:
 *       200:
 *         description: FAQ type saved
 */

/**
 * @swagger
 * /admin/faq_type_toggle:
 *   post:
 *     summary: Toggle FAQ type status
 *     description: Enable or disable FAQ type
 *     tags: [Admin FAQ]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type_id
 *             properties:
 *               type_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Status toggled
 */

/**
 * @swagger
 * /admin/faq_type_dropdown:
 *   post:
 *     summary: Get FAQ types dropdown
 *     description: Get FAQ types for dropdown
 *     tags: [Admin FAQ]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     responses:
 *       200:
 *         description: Dropdown retrieved
 */

/**
 * @swagger
 * /admin/faq_detail_get:
 *   post:
 *     summary: Get FAQ detail
 *     description: Retrieve specific FAQ question/answer
 *     tags: [Admin FAQ]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - faq_id
 *             properties:
 *               faq_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: FAQ detail retrieved
 */

/**
 * @swagger
 * /admin/faq_detail_set:
 *   post:
 *     summary: Create or update FAQ detail
 *     description: Add new FAQ or update existing
 *     tags: [Admin FAQ]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               faq_id:
 *                 type: integer
 *               type_id:
 *                 type: integer
 *               question:
 *                 type: string
 *               answer:
 *                 type: string
 *     responses:
 *       200:
 *         description: FAQ saved
 */

/**
 * @swagger
 * /admin/faq_detail_toggle:
 *   post:
 *     summary: Toggle FAQ detail status
 *     description: Enable or disable FAQ
 *     tags: [Admin FAQ]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - faq_id
 *             properties:
 *               faq_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Status toggled
 */

/**
 * @swagger
 * /admin/term_condition_list:
 *   post:
 *     summary: Get terms and conditions list
 *     description: Retrieve paginated list of all terms and conditions with search functionality
 *     tags: [Terms & Conditions]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page_no:
 *                 type: integer
 *                 description: Page number for pagination
 *                 example: 1
 *               search_text:
 *                 type: string
 *                 description: Search text to filter by sidebar title
 *                 example: "Privacy"
 *     responses:
 *       200:
 *         description: Terms and conditions list retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 result:
 *                   type: object
 *                   properties:
 *                     current_page:
 *                       type: integer
 *                     total_pages:
 *                       type: integer
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           sr_no:
 *                             type: integer
 *                           id:
 *                             type: integer
 *                           title:
 *                             type: string
 *                           content:
 *                             type: string
 *                           order:
 *                             type: integer
 *                           enabled:
 *                             type: boolean
 *                           added_on:
 *                             type: string
 *                           modify_on:
 *                             type: string
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /admin/term_condition_set:
 *   post:
 *     summary: Create or update terms and conditions
 *     description: Add new term & conditions entry or update existing one. Pass id=0 for new entry.
 *     tags: [Terms & Conditions]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - content
 *             properties:
 *               id:
 *                 type: integer
 *                 description: Term ID (0 for new, existing ID for update)
 *                 example: 0
 *               title:
 *                 type: string
 *                 description: Sidebar menu title
 *                 example: "Privacy Policy"
 *               content:
 *                 type: string
 *                 description: HTML content of the term and conditions
 *                 example: "<h1>Privacy Policy</h1><p>Your privacy is important...</p>"
 *               order:
 *                 type: integer
 *                 description: Sort order for display
 *                 example: 1
 *               enabled:
 *                 type: boolean
 *                 description: Enable/disable this term
 *                 example: true
 *     responses:
 *       200:
 *         description: Term and conditions saved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /admin/term_condition_toggle:
 *   post:
 *     summary: Toggle term and conditions status
 *     description: Enable or disable a term and conditions entry
 *     tags: [Terms & Conditions]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: integer
 *                 description: Term and conditions ID
 *                 example: 1
 *     responses:
 *       200:
 *         description: Status changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /admin/term_condition_delete:
 *   post:
 *     summary: Delete terms and conditions
 *     description: Soft delete a term and conditions entry (sets is_deleted flag)
 *     tags: [Terms & Conditions]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: integer
 *                 description: Term and conditions ID to delete
 *                 example: 1
 *     responses:
 *       200:
 *         description: Term and conditions deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /admin/email_template_list:
 *   post:
 *     summary: Get email templates list
 *     description: Retrieve all email templates
 *     tags: [Email Templates]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     responses:
 *       200:
 *         description: List retrieved
 */

/**
 * @swagger
 * /admin/email_template_get:
 *   post:
 *     summary: Get email template
 *     description: Retrieve specific email template
 *     tags: [Email Templates]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - template_id
 *             properties:
 *               template_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Template retrieved
 */

/**
 * @swagger
 * /admin/email_template_set:
 *   post:
 *     summary: Update email template
 *     description: Update email template content
 *     tags: [Email Templates]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               template_id:
 *                 type: integer
 *               subject:
 *                 type: string
 *               body:
 *                 type: string
 *     responses:
 *       200:
 *         description: Template updated
 */

/**
 * @swagger
 * /admin/sms_template_list:
 *   post:
 *     summary: Get SMS templates list
 *     description: Retrieve all SMS templates
 *     tags: [SMS Templates]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     responses:
 *       200:
 *         description: List retrieved
 */

/**
 * @swagger
 * /admin/sms_template_get:
 *   post:
 *     summary: Get SMS template
 *     description: Retrieve specific SMS template
 *     tags: [SMS Templates]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - template_id
 *             properties:
 *               template_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Template retrieved
 */

/**
 * @swagger
 * /admin/sms_template_set:
 *   post:
 *     summary: Update SMS template
 *     description: Update SMS template content
 *     tags: [SMS Templates]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               template_id:
 *                 type: integer
 *               content:
 *                 type: string
 *     responses:
 *       200:
 *         description: Template updated
 */

/**
 * @swagger
 * /admin/businessEmailList:
 *   post:
 *     summary: Get business email list
 *     description: Retrieve paginated list of all business emails with search functionality
 *     tags: [Business Email]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page_no:
 *                 type: integer
 *                 description: Page number for pagination
 *                 example: 1
 *               search_text:
 *                 type: string
 *                 description: Search text to filter by email_id or first_name
 *                 example: "john"
 *     responses:
 *       200:
 *         description: Business email list retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 result:
 *                   type: object
 *                   properties:
 *                     current_page:
 *                       type: integer
 *                     total_pages:
 *                       type: integer
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           sr_no:
 *                             type: integer
 *                           id:
 *                             type: integer
 *                           email_id:
 *                             type: string
 *                           first_name:
 *                             type: string
 *                           last_name:
 *                             type: string
 *                           mobile_no:
 *                             type: string
 *                           enabled:
 *                             type: boolean
 *                           type_id:
 *                             type: integer
 *                           added_on:
 *                             type: string
 *                           modify_on:
 *                             type: string
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /admin/businessEmailSet:
 *   post:
 *     summary: Create or update business email
 *     description: Add new business email or update existing one. Pass id=0 for new entry.
 *     tags: [Business Email]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email_id
 *             properties:
 *               id:
 *                 type: integer
 *                 description: Business email ID (0 for new, existing ID for update)
 *                 example: 0
 *               email_id:
 *                 type: string
 *                 description: Email address
 *                 example: "john.doe@example.com"
 *               first_name:
 *                 type: string
 *                 description: First name
 *                 example: "John"
 *               last_name:
 *                 type: string
 *                 description: Last name
 *                 example: "Doe"
 *               mobile_no:
 *                 type: string
 *                 description: Mobile number
 *                 example: "9876543210"
 *               type_id:
 *                 type: integer
 *                 description: Email type ID
 *                 example: 1
 *     responses:
 *       200:
 *         description: Business email saved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /admin/businessEmailToggle:
 *   post:
 *     summary: Toggle business email status
 *     description: Enable or disable a business email entry
 *     tags: [Business Email]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: integer
 *                 description: Business email ID
 *                 example: 1
 *     responses:
 *       200:
 *         description: Status changed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /admin/businessEmailDropdown:
 *   post:
 *     summary: Get business emails dropdown
 *     description: Get list of enabled business emails for dropdown/select options
 *     tags: [Business Email]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     responses:
 *       200:
 *         description: Dropdown data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 result:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       email_id:
 *                         type: string
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /admin/businessEmailDelete:
 *   post:
 *     summary: Delete business email
 *     description: Soft delete a business email entry (sets is_deleted flag)
 *     tags: [Business Email]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: integer
 *                 description: Business email ID to delete
 *                 example: 1
 *     responses:
 *       200:
 *         description: Business email deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /admin/productCategoryList:
 *   post:
 *     summary: Get product categories
 *     description: Retrieve all product categories
 *     tags: [Product Category]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     responses:
 *       200:
 *         description: List retrieved
 */

/**
 * @swagger
 * /admin/productCategoryGet:
 *   post:
 *     summary: Get product category
 *     description: Retrieve specific product category
 *     tags: [Product Category]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - category_id
 *             properties:
 *               category_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Category retrieved
 */

/**
 * @swagger
 * /admin/productCategorySet:
 *   post:
 *     summary: Create or update product category
 *     description: Add new or update product category
 *     tags: [Product Category]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               category_id:
 *                 type: integer
 *               category_name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Category saved
 */

/**
 * @swagger
 * /admin/productCategoryToggle:
 *   post:
 *     summary: Toggle product category status
 *     description: Enable or disable product category
 *     tags: [Product Category]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - category_id
 *             properties:
 *               category_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Status toggled
 */

/**
 * @swagger
 * /admin/productCategoryDropdown:
 *   post:
 *     summary: Get product categories dropdown
 *     description: Get categories for dropdown
 *     tags: [Product Category]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     responses:
 *       200:
 *         description: Dropdown retrieved
 */

/**
 * @swagger
 * /admin/productCategoryDelete:
 *   post:
 *     summary: Delete product category
 *     description: Delete a product category
 *     tags: [Product Category]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - category_id
 *             properties:
 *               category_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Category deleted
 */

/**
 * @swagger
 * /admin/api_products_list:
 *   post:
 *     summary: Get API products list
 *     description: Retrieve all API products
 *     tags: [API Products]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     responses:
 *       200:
 *         description: Products list retrieved
 */

/**
 * @swagger
 * /admin/product_get:
 *   post:
 *     summary: Get product details
 *     description: Retrieve specific product details
 *     tags: [API Products]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - product_id
 *             properties:
 *               product_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Product retrieved
 */

/**
 * @swagger
 * /admin/product_detail_update:
 *   post:
 *     summary: Update product details
 *     description: Update product with files
 *     tags: [API Products]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               product_icon:
 *                 type: string
 *                 format: binary
 *               flow_chart:
 *                 type: string
 *                 format: binary
 *               product_open_spec:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Product updated
 */

/**
 * @swagger
 * /admin/product_delete:
 *   post:
 *     summary: Delete product
 *     description: Delete an API product
 *     tags: [API Products]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - product_id
 *             properties:
 *               product_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Product deleted
 */

/**
 * @swagger
 * /admin/dropdown_products:
 *   post:
 *     summary: Get products dropdown
 *     description: Get products for dropdown
 *     tags: [API Products]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     responses:
 *       200:
 *         description: Dropdown retrieved
 */

/**
 * @swagger
 * /admin/product_rate_attribute_add:
 *   post:
 *     summary: Add product rate attribute
 *     description: Create a new product rate attribute. Admin users can directly approve, while makers need checker approval.
 *     tags: [Product Rate]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - product_id
 *               - product_rate_value
 *             properties:
 *               product_id:
 *                 type: integer
 *                 description: ID of the product
 *                 example: 1
 *               product_rate_value:
 *                 type: string
 *                 description: Rate value to set for the product
 *                 example: "1.5"
 *     responses:
 *       200:
 *         description: Product rate attribute added successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *       500:
 *         description: Server error or insufficient authority
 */

/**
 * @swagger
 * /admin/product_rate_attribute_pending_list:
 *   post:
 *     summary: Get pending product rate attributes
 *     description: Retrieve paginated list of product rate attributes pending approval
 *     tags: [Product Rate]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page_no:
 *                 type: integer
 *                 description: Page number for pagination (defaults to 1)
 *                 example: 1
 *               search_text:
 *                 type: string
 *                 description: Search text to filter by product name
 *                 example: "API"
 *     responses:
 *       200:
 *         description: Pending list retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 result:
 *                   type: object
 *                   properties:
 *                     current_page:
 *                       type: integer
 *                     total_pages:
 *                       type: integer
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           sr_no:
 *                             type: integer
 *                           product_rate_id:
 *                             type: integer
 *                           product_id:
 *                             type: integer
 *                           product_name:
 *                             type: string
 *                           rate_plan_value:
 *                             type: string
 *                           added_date:
 *                             type: string
 *                           ckr_full_name:
 *                             type: string
 *                     is_admin:
 *                       type: boolean
 *                     is_maker:
 *                       type: boolean
 *                     is_checker:
 *                       type: boolean
 *       500:
 *         description: Insufficient authority or server error
 */

/**
 * @swagger
 * /admin/product_rate_attribute_approve_list:
 *   post:
 *     summary: Get approved product rate attributes
 *     description: Retrieve paginated list of approved product rate attributes
 *     tags: [Product Rate]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page_no:
 *                 type: integer
 *                 description: Page number for pagination (defaults to 1)
 *                 example: 1
 *               search_text:
 *                 type: string
 *                 description: Search text to filter by product name
 *                 example: "API"
 *     responses:
 *       200:
 *         description: Approved list retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 result:
 *                   type: object
 *                   properties:
 *                     current_page:
 *                       type: integer
 *                     total_pages:
 *                       type: integer
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           sr_no:
 *                             type: integer
 *                           product_rate_id:
 *                             type: integer
 *                           product_id:
 *                             type: integer
 *                           product_name:
 *                             type: string
 *                           rate_plan_value:
 *                             type: string
 *                           mkr_name:
 *                             type: string
 *                           added_date:
 *                             type: string
 *                           ckr_full_name:
 *                             type: string
 *                           ckr_approve_date:
 *                             type: string
 *                           ckr_remark:
 *                             type: string
 *                     is_admin:
 *                       type: boolean
 *                     is_maker:
 *                       type: boolean
 *                     is_checker:
 *                       type: boolean
 *       500:
 *         description: Insufficient authority or server error
 */

/**
 * @swagger
 * /admin/product_rate_attribute_rejected_list:
 *   post:
 *     summary: Get rejected product rate attributes
 *     description: Retrieve paginated list of rejected product rate attributes
 *     tags: [Product Rate]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page_no:
 *                 type: integer
 *                 description: Page number for pagination (defaults to 1)
 *                 example: 1
 *               search_text:
 *                 type: string
 *                 description: Search text to filter by product name
 *                 example: "API"
 *     responses:
 *       200:
 *         description: Rejected list retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 result:
 *                   type: object
 *                   properties:
 *                     current_page:
 *                       type: integer
 *                     total_pages:
 *                       type: integer
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           sr_no:
 *                             type: integer
 *                           product_rate_id:
 *                             type: integer
 *                           product_id:
 *                             type: integer
 *                           product_name:
 *                             type: string
 *                           mkr_name:
 *                             type: string
 *                           added_date:
 *                             type: string
 *                           rejected_date:
 *                             type: string
 *                           ckr_full_name:
 *                             type: string
 *                           ckr_remark:
 *                             type: string
 *                           ckr_rate_plan_is_rejected:
 *                             type: boolean
 *                     is_admin:
 *                       type: boolean
 *                     is_maker:
 *                       type: boolean
 *                     is_checker:
 *                       type: boolean
 *       500:
 *         description: Insufficient authority or server error
 */

/**
 * @swagger
 * /admin/product_rate_attribute_reject:
 *   post:
 *     summary: Reject product rate attribute
 *     description: Reject a pending product rate attribute with remark. Requires admin or checker authority.
 *     tags: [Product Rate]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - product_rate_id
 *               - product_id
 *               - remark
 *             properties:
 *               product_rate_id:
 *                 type: integer
 *                 description: ID of the product rate attribute
 *                 example: 1
 *               product_id:
 *                 type: integer
 *                 description: ID of the product
 *                 example: 1
 *               remark:
 *                 type: string
 *                 description: Reason for rejection
 *                 example: "Rate value is too high"
 *     responses:
 *       200:
 *         description: Product rate attribute rejected successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *       500:
 *         description: Insufficient authority or server error
 */

/**
 * @swagger
 * /admin/product_rate_attribute_approve:
 *   post:
 *     summary: Approve product rate attribute
 *     description: Approve a pending product rate attribute and sync with Apigee. Requires admin or checker authority.
 *     tags: [Product Rate]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - product_rate_id
 *               - product_id
 *               - remark
 *             properties:
 *               product_rate_id:
 *                 type: integer
 *                 description: ID of the product rate attribute
 *                 example: 1
 *               product_id:
 *                 type: integer
 *                 description: ID of the product
 *                 example: 1
 *               remark:
 *                 type: string
 *                 description: Approval remark/comment
 *                 example: "Rate value approved"
 *     responses:
 *       200:
 *         description: Product rate attribute approved successfully and synced with Apigee
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *       400:
 *         description: Apigee sync error
 *       500:
 *         description: Insufficient authority or server error
 */

/**
 * @swagger
 * /admin/admin_role_list:
 *   post:
 *     summary: Get admin roles list with pagination
 *     description: Retrieve paginated list of admin roles with search functionality
 *     tags: [Admin Roles]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page_no:
 *                 type: integer
 *                 description: Page number for pagination (defaults to 1)
 *                 example: 1
 *               search_text:
 *                 type: string
 *                 description: Search text to filter role names (case-insensitive)
 *                 example: "Admin"
 *               role_level:
 *                 type: integer
 *                 description: Role level filter
 *                 example: 1
 *     responses:
 *       200:
 *         description: Roles list retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: ""
 *                 data:
 *                   type: object
 *                   properties:
 *                     current_page:
 *                       type: integer
 *                       example: 1
 *                     total_pages:
 *                       type: integer
 *                       example: 5
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           sr_no:
 *                             type: integer
 *                             example: 1
 *                           role_id:
 *                             type: integer
 *                             example: 101
 *                           role_name:
 *                             type: string
 *                             example: "Administrator"
 *                           role_level:
 *                             type: integer
 *                             example: 1
 *                           is_editable:
 *                             type: boolean
 *                             example: false
 *                           checker_maker:
 *                             type: integer
 *                             example: 0
 *                           enabled:
 *                             type: boolean
 *                             example: true
 *                           added_on:
 *                             type: string
 *                             example: "15-03-2024"
 *                           modify_on:
 *                             type: string
 *                             example: "20-03-2024"
 */

/**
 * @swagger
 * /admin/admin_role_get:
 *   post:
 *     summary: Get admin role details by ID
 *     description: Retrieve detailed information about a specific admin role including its properties and timestamps
 *     tags: [Admin Roles]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role_id
 *             properties:
 *               role_id:
 *                 type: integer
 *                 description: ID of the role to retrieve
 *                 example: 101
 *     responses:
 *       200:
 *         description: Role details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: ""
 *                 data:
 *                   type: object
 *                   properties:
 *                     role_id:
 *                       type: integer
 *                       example: 101
 *                     role_name:
 *                       type: string
 *                       example: "Administrator"
 *                     role_level:
 *                       type: integer
 *                       example: 1
 *                     is_enabled:
 *                       type: boolean
 *                       example: true
 *                     is_editable:
 *                       type: boolean
 *                       example: false
 *                     checker_maker:
 *                       type: integer
 *                       example: 0
 *                     added_date:
 *                       type: string
 *                       example: "15-03-2024"
 *                     modify_date:
 *                       type: string
 *                       example: "20-03-2024"
 */

/**
 * @swagger
 * /admin/admin_role_set:
 *   post:
 *     summary: Create or update admin role
 *     description: Add a new admin role or update an existing role. If role_id is 0, a new role will be created. If role_id is provided and exists, the role will be updated. Administrator roles cannot be edited.
 *     tags: [Admin Roles]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role_name
 *             properties:
 *               role_id:
 *                 type: integer
 *                 description: Role ID (0 for new role, existing ID for update)
 *                 example: 0
 *               role_name:
 *                 type: string
 *                 description: Name of the role
 *                 example: "Content Manager"
 *               role_level:
 *                 type: integer
 *                 description: Role level/hierarchy
 *                 example: 2
 *               checker_maker:
 *                 type: integer
 *                 description: Checker-maker flag (0 or 1)
 *                 example: 0
 *     responses:
 *       200:
 *         description: Role saved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "Saved successfully."
 *                 data:
 *                   type: null
 *                   example: null
 */

/**
 * @swagger
 * /admin/admin_role_toggle:
 *   post:
 *     summary: Toggle admin role enabled/disabled status
 *     description: Enable or disable an admin role. Administrator roles (is_editable=false) cannot be toggled. This action is logged in the audit trail.
 *     tags: [Admin Roles]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role_id
 *             properties:
 *               role_id:
 *                 type: integer
 *                 description: ID of the role to toggle
 *                 example: 102
 *     responses:
 *       200:
 *         description: Role status toggled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "Status changed successfully."
 *                 data:
 *                   type: null
 *                   example: null
 */

/**
 * @swagger
 * /admin/admin_role_delete:
 *   post:
 *     summary: Soft delete an admin role
 *     description: Perform soft delete on an admin role (sets is_deleted=true). Cannot delete Administrator roles (is_editable=false) or roles that are assigned to users. This action is logged in the audit trail.
 *     tags: [Admin Roles]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role_id
 *             properties:
 *               role_id:
 *                 type: integer
 *                 description: ID of the role to delete
 *                 example: 103
 *     responses:
 *       200:
 *         description: Role deleted successfully or error if deletion is not allowed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "Role deleted successfully."
 *                 data:
 *                   type: null
 *                   example: null
 */

/**
 * @swagger
 * /admin/admin_role_dropdown:
 *   post:
 *     summary: Get admin roles dropdown list
 *     description: Retrieve list of all enabled admin roles for use in dropdown selections. Returns only non-deleted and enabled roles.
 *     tags: [Admin Roles]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     responses:
 *       200:
 *         description: Dropdown list retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: ""
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       role_id:
 *                         type: integer
 *                         example: 101
 *                       role_name:
 *                         type: string
 *                         example: "Administrator"
 */

/**
 * @swagger
 * /admin/role_permission_list:
 *   post:
 *     summary: Get all permissions with role assignments
 *     description: Retrieve complete list of system permissions with their assignment status for a specific role. Shows which permissions are allowed for the role and which are not.
 *     tags: [Admin Roles]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role_id
 *             properties:
 *               role_id:
 *                 type: integer
 *                 description: ID of the role to retrieve permissions for
 *                 example: 101
 *     responses:
 *       200:
 *         description: Permissions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "Roles Permission Data."
 *                 data:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       example: "Administrator"
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           menu_id:
 *                             type: integer
 *                             example: 1
 *                           menu_name:
 *                             type: string
 *                             example: "Dashboard"
 *                           has_submenu:
 *                             type: boolean
 *                             example: false
 *                           parent_id:
 *                             type: integer
 *                             example: 0
 *                           is_allowed:
 *                             type: boolean
 *                             example: true
 */

/**
 * @swagger
 * /admin/role_permission_update:
 *   post:
 *     summary: Update permissions for a specific role
 *     description: Bulk update permissions for a role. For each permission in the array, creates or updates the role-permission assignment. Permissions not included in the array will be set to is_allowed=false. This action is logged in the audit trail.
 *     tags: [Admin Roles]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role_id
 *               - permissions
 *             properties:
 *               role_id:
 *                 type: integer
 *                 description: ID of the role to update permissions for
 *                 example: 102
 *               permissions:
 *                 type: array
 *                 description: Array of permission objects to allow for this role
 *                 items:
 *                   type: object
 *                   properties:
 *                     menu_id:
 *                       type: integer
 *                       description: Permission/Menu ID
 *                       example: 1
 *                     is_allowed:
 *                       type: boolean
 *                       description: Whether this permission is allowed
 *                       example: true
 *                 example:
 *                   - menu_id: 1
 *                     is_allowed: true
 *                   - menu_id: 2
 *                     is_allowed: true
 *                   - menu_id: 5
 *                     is_allowed: false
 *     responses:
 *       200:
 *         description: Permissions updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: "Permission saved successfully."
 *                 data:
 *                   type: null
 *                   example: null
 */

/**
 * @swagger
 * /admin/admin_user_list:
 *   post:
 *     summary: Get admin users list
 *     description: Retrieve all admin users
 *     tags: [Admin Users]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page_no:
 *                 type: integer
 *               search_text:
 *                 type: string
 *     responses:
 *       200:
 *         description: Users list retrieved
 */

/**
 * @swagger
 * /admin/admin_user_get:
 *   post:
 *     summary: Get admin user details
 *     description: Retrieve specific admin user
 *     tags: [Admin Users]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - admin_id
 *             properties:
 *               admin_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: User retrieved
 */

/**
 * @swagger
 * /admin/admin_user_set:
 *   post:
 *     summary: Create or update admin user
 *     description: Add new or update admin user
 *     tags: [Admin Users]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               admin_id:
 *                 type: integer
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               email_id:
 *                 type: string
 *               mobile_no:
 *                 type: string
 *               role_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: User saved
 */

/**
 * @swagger
 * /admin/admin_user_toggle:
 *   post:
 *     summary: Toggle admin user status
 *     description: Enable or disable admin user
 *     tags: [Admin Users]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - admin_id
 *             properties:
 *               admin_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Status toggled
 */

/**
 * @swagger
 * /admin/admin_user_delete:
 *   post:
 *     summary: Delete admin user
 *     description: Delete an admin user
 *     tags: [Admin Users]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - admin_id
 *             properties:
 *               admin_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: User deleted
 */

/**
 * @swagger
 * /admin/user_send_invite:
 *   post:
 *     summary: Send invite to admin user
 *     description: Send activation invite email
 *     tags: [Admin Users]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - admin_id
 *             properties:
 *               admin_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Invite sent
 */

/**
 * @swagger
 * /admin/all_users_excel:
 *   post:
 *     summary: Export admin users to Excel
 *     description: Generate Excel file with admin users
 *     tags: [Admin Users]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     responses:
 *       200:
 *         description: Excel file generated
 */

/**
 * @swagger
 * /admin/admin_set_pass_link_check:
 *   post:
 *     summary: Verify set password link
 *     description: Check if activation link is valid
 *     tags: [Admin Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Link validation result
 */

/**
 * @swagger
 * /admin/set_new_pass:
 *   post:
 *     summary: Set new password
 *     description: Set password for new admin user
 *     tags: [Admin Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - password
 *             properties:
 *               token:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password set result
 */

/**
 * @swagger
 * /admin/lable_info_get:
 *   post:
 *     summary: Get label info
 *     description: Retrieve page label information
 *     tags: [Label Info]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     responses:
 *       200:
 *         description: Label info retrieved
 */

/**
 * @swagger
 * /admin/lable_info_set:
 *   post:
 *     summary: Update label info
 *     description: Update page label information
 *     tags: [Label Info]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *               properties:
 *                 label_id:
 *                   type: integer
 *                 info_text:
 *                   type: string
 *     responses:
 *       200:
 *         description: Label info updated
 */

/**
 * @swagger
 * /admin/api_history_logs:
 *   post:
 *     summary: Get API history logs
 *     description: Retrieve API call history
 *     tags: [Audit Logs]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page_no:
 *                 type: integer
 *               from_date:
 *                 type: string
 *               to_date:
 *                 type: string
 *     responses:
 *       200:
 *         description: Logs retrieved
 */

/**
 * @swagger
 * /admin/user_history_logs:
 *   post:
 *     summary: Get user history logs
 *     description: Retrieve user activity history
 *     tags: [Audit Logs]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page_no:
 *                 type: integer
 *               from_date:
 *                 type: string
 *               to_date:
 *                 type: string
 *     responses:
 *       200:
 *         description: Logs retrieved
 */

/**
 * @swagger
 * /admin/app_req_pending:
 *   post:
 *     summary: Get pending app requests
 *     description: Retrieve pending app requests
 *     tags: [App Requests]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page_no:
 *                 type: integer
 *               search_text:
 *                 type: string
 *     responses:
 *       200:
 *         description: Requests retrieved
 */

/**
 * @swagger
 * /admin/app_req_approved:
 *   post:
 *     summary: Get approved app requests
 *     description: Retrieve approved app requests
 *     tags: [App Requests]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page_no:
 *                 type: integer
 *               search_text:
 *                 type: string
 *     responses:
 *       200:
 *         description: Requests retrieved
 */

/**
 * @swagger
 * /admin/app_req_rejected:
 *   post:
 *     summary: Get rejected app requests
 *     description: Retrieve rejected app requests
 *     tags: [App Requests]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page_no:
 *                 type: integer
 *               search_text:
 *                 type: string
 *     responses:
 *       200:
 *         description: Requests retrieved
 */

/**
 * @swagger
 * /admin/app_req_view_detail:
 *   post:
 *     summary: View app request details
 *     description: Retrieve detailed app request info
 *     tags: [App Requests]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - app_id
 *             properties:
 *               app_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Details retrieved
 */

/**
 * @swagger
 * /admin/app_req_approve:
 *   post:
 *     summary: Approve app request
 *     description: Approve an app request
 *     tags: [App Requests]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - app_id
 *             properties:
 *               app_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Request approved
 */

/**
 * @swagger
 * /admin/app_req_reject:
 *   post:
 *     summary: Reject app request
 *     description: Reject an app request
 *     tags: [App Requests]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - app_id
 *             properties:
 *               app_id:
 *                 type: integer
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Request rejected
 */

/**
 * @swagger
 * /admin/app_req_live:
 *   post:
 *     summary: Get live app requests
 *     description: Retrieve live app requests
 *     tags: [App Requests]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page_no:
 *                 type: integer
 *               search_text:
 *                 type: string
 *     responses:
 *       200:
 *         description: Requests retrieved
 */

/**
 * @swagger
 * /admin/wallet_balance_add:
 *   post:
 *     summary: Add wallet balance request
 *     description: Create wallet balance add request
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               customer_id:
 *                 type: integer
 *               amount:
 *                 type: number
 *     responses:
 *       200:
 *         description: Request created
 */

/**
 * @swagger
 * /admin/wallet_balance_pending_list:
 *   post:
 *     summary: Get pending wallet requests
 *     description: Retrieve pending wallet balance requests
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page_no:
 *                 type: integer
 *     responses:
 *       200:
 *         description: List retrieved
 */

/**
 * @swagger
 * /admin/wallet_balance_approve_list:
 *   post:
 *     summary: Get approved wallet requests
 *     description: Retrieve approved wallet balance requests
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page_no:
 *                 type: integer
 *     responses:
 *       200:
 *         description: List retrieved
 */

/**
 * @swagger
 * /admin/wallet_balance_rejected_list:
 *   post:
 *     summary: Get rejected wallet requests
 *     description: Retrieve rejected wallet balance requests
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page_no:
 *                 type: integer
 *     responses:
 *       200:
 *         description: List retrieved
 */

/**
 * @swagger
 * /admin/wallet_balance_approve:
 *   post:
 *     summary: Approve wallet balance request
 *     description: Approve a wallet balance request
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - request_id
 *             properties:
 *               request_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Request approved
 */

/**
 * @swagger
 * /admin/wallet_balance_reject:
 *   post:
 *     summary: Reject wallet balance request
 *     description: Reject a wallet balance request
 *     tags: [Wallet]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - request_id
 *             properties:
 *               request_id:
 *                 type: integer
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Request rejected
 */

/**
 * @swagger
 * /admin/customer_analytics_reports_get:
 *   post:
 *     summary: Get customer analytics reports
 *     description: Retrieve analytics reports for customers
 *     tags: [Analytics Reports]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               customer_id:
 *                 type: integer
 *               from_date:
 *                 type: string
 *               to_date:
 *                 type: string
 *     responses:
 *       200:
 *         description: Reports retrieved
 */

/**
 * @swagger
 * /admin/report_list:
 *   post:
 *     summary: Get reports list
 *     description: Retrieve list of generated reports
 *     tags: [Analytics Reports]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     responses:
 *       200:
 *         description: Reports list retrieved
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     HomePageSection:
 *       type: object
 *       properties:
 *         title:
 *           type: string
 *         heading:
 *           type: string
 *         contents:
 *           type: string
 *         image1:
 *           type: string
 *         image2:
 *           type: string
 *         image3:
 *           type: string
 *
 *     HomePageData:
 *       type: object
 *       properties:
 *         scroll_strip:
 *           type: string
 *         section_1:
 *           $ref: '#/components/schemas/HomePageSection'
 *         section_2:
 *           $ref: '#/components/schemas/HomePageSection'
 *         section_3:
 *           $ref: '#/components/schemas/HomePageSection'
 *         section_4:
 *           $ref: '#/components/schemas/HomePageSection'
 *         section_5:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: integer
 *               title:
 *                 type: string
 *               contents:
 *                 type: string
 */

/**
 * @swagger
 * /admin/cms_home_get:
 *   post:
 *     summary: Get home page content
 *     description: Retrieve all sections and content from the home page CMS
 *     tags: [CMS Home Page]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     responses:
 *       200:
 *         description: Home page content retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     results:
 *                       $ref: '#/components/schemas/HomePageData'
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /admin/cms_home_set_strip:
 *   post:
 *     summary: Update scrolling strip content
 *     description: Update the scrolling strip/ticker content on the home page
 *     tags: [CMS Home Page]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - contents
 *             properties:
 *               contents:
 *                 type: string
 *                 description: Scrolling strip text content
 *     responses:
 *       200:
 *         description: Scrolling strip updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /admin/cms_home_set_section_1:
 *   post:
 *     summary: Update home page section 1
 *     description: Update title, heading, contents and images for home page section 1
 *     tags: [CMS Home Page]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - heading
 *               - contents
 *             properties:
 *               title:
 *                 type: string
 *                 description: Section title
 *               heading:
 *                 type: string
 *                 description: Section heading
 *               contents:
 *                 type: string
 *                 description: Section content
 *               desktop:
 *                 type: string
 *                 format: binary
 *                 description: Desktop image (jpeg, jpg, png, gif, svg)
 *               mobile:
 *                 type: string
 *                 format: binary
 *                 description: Mobile image (jpeg, jpg, png, gif, svg)
 *               bottom:
 *                 type: string
 *                 format: binary
 *                 description: Bottom image (jpeg, jpg, png, gif, svg)
 *     responses:
 *       200:
 *         description: Section 1 updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /admin/cms_home_set_section_2:
 *   post:
 *     summary: Update home page section 2
 *     description: Update title, heading, contents and images for home page section 2
 *     tags: [CMS Home Page]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - heading
 *               - contents
 *             properties:
 *               title:
 *                 type: string
 *                 description: Section title
 *               heading:
 *                 type: string
 *                 description: Section heading
 *               contents:
 *                 type: string
 *                 description: Section content
 *               desktop:
 *                 type: string
 *                 format: binary
 *                 description: Desktop image (jpeg, jpg, png, gif, svg)
 *               mobile:
 *                 type: string
 *                 format: binary
 *                 description: Mobile image (jpeg, jpg, png, gif, svg)
 *               bottom:
 *                 type: string
 *                 format: binary
 *                 description: Bottom image (jpeg, jpg, png, gif, svg)
 *     responses:
 *       200:
 *         description: Section 2 updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /admin/cms_home_set_section_3:
 *   post:
 *     summary: Update home page section 3
 *     description: Update title, heading, contents and images for home page section 3
 *     tags: [CMS Home Page]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - heading
 *               - contents
 *             properties:
 *               title:
 *                 type: string
 *                 description: Section title
 *               heading:
 *                 type: string
 *                 description: Section heading
 *               contents:
 *                 type: string
 *                 description: Section content
 *               desktop:
 *                 type: string
 *                 format: binary
 *                 description: Desktop image (jpeg, jpg, png, gif, svg)
 *               mobile:
 *                 type: string
 *                 format: binary
 *                 description: Mobile image (jpeg, jpg, png, gif, svg)
 *               bottom:
 *                 type: string
 *                 format: binary
 *                 description: Bottom image (jpeg, jpg, png, gif, svg)
 *     responses:
 *       200:
 *         description: Section 3 updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /admin/cms_home_set_section_4:
 *   post:
 *     summary: Update home page section 4
 *     description: Update title, heading, contents and images for home page section 4
 *     tags: [CMS Home Page]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - heading
 *               - contents
 *             properties:
 *               title:
 *                 type: string
 *                 description: Section title
 *               heading:
 *                 type: string
 *                 description: Section heading
 *               contents:
 *                 type: string
 *                 description: Section content
 *               desktop:
 *                 type: string
 *                 format: binary
 *                 description: Desktop image (jpeg, jpg, png, gif, svg)
 *               mobile:
 *                 type: string
 *                 format: binary
 *                 description: Mobile image (jpeg, jpg, png, gif, svg)
 *               bottom:
 *                 type: string
 *                 format: binary
 *                 description: Bottom image (jpeg, jpg, png, gif, svg)
 *     responses:
 *       200:
 *         description: Section 4 updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /admin/cms_home_set_section_5:
 *   post:
 *     summary: Update home page section 5
 *     description: Update a specific item in section 5 (cards/features section)
 *     tags: [CMS Home Page]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *               - title
 *               - contents
 *             properties:
 *               id:
 *                 type: integer
 *                 description: Section 5 item ID (6, 7, or 8)
 *                 enum: [6, 7, 8]
 *               title:
 *                 type: string
 *                 description: Item title
 *               contents:
 *                 type: string
 *                 description: Item content
 *     responses:
 *       200:
 *         description: Section 5 updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /admin/wallet_balance_add:
 *   post:
 *     summary: Add wallet balance transaction
 *     description: Add a credit or debit transaction to customer wallet (admin/maker creates request)
 *     tags: [Customer Wallet Management]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customer_id
 *               - wallets_amount
 *               - transaction_type
 *               - description
 *             properties:
 *               customer_id:
 *                 type: integer
 *                 description: Customer ID
 *               wallets_amount:
 *                 type: number
 *                 format: double
 *                 description: Amount to credit/debit
 *               transaction_type:
 *                 type: integer
 *                 description: Transaction type (1 = Credit, 2 = Debit)
 *                 enum: [1, 2]
 *               description:
 *                 type: string
 *                 description: Transaction description
 *     responses:
 *       200:
 *         description: Transaction added/saved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /admin/wallet_balance_pending_list:
 *   post:
 *     summary: Get pending wallet balance requests
 *     description: Retrieve paginated list of pending wallet balance requests awaiting approval
 *     tags: [Customer Wallet Management]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page_no:
 *                 type: integer
 *                 default: 1
 *                 description: Page number
 *               search_text:
 *                 type: string
 *                 description: Search text (searches in description)
 *     responses:
 *       200:
 *         description: Pending requests retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     results:
 *                       type: object
 *                       properties:
 *                         current_page:
 *                           type: integer
 *                         total_pages:
 *                           type: integer
 *                         is_admin:
 *                           type: boolean
 *                         is_maker:
 *                           type: boolean
 *                         is_checker:
 *                           type: boolean
 *                         data:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               sr_no:
 *                                 type: integer
 *                               cust_wallet_id:
 *                                 type: integer
 *                               customer_id:
 *                                 type: integer
 *                               full_name:
 *                                 type: string
 *                               email_id:
 *                                 type: string
 *                               amount:
 *                                 type: number
 *                               description:
 *                                 type: string
 *                               transaction_type:
 *                                 type: string
 *                               previous_amount:
 *                                 type: number
 *                               added_date:
 *                                 type: string
 *                               mkr_name:
 *                                 type: string
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /admin/wallet_balance_approve_list:
 *   post:
 *     summary: Get approved wallet balance requests
 *     description: Retrieve paginated list of approved wallet balance requests
 *     tags: [Customer Wallet Management]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page_no:
 *                 type: integer
 *                 default: 1
 *               search_text:
 *                 type: string
 *     responses:
 *       200:
 *         description: Approved requests retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     results:
 *                       type: object
 *                       properties:
 *                         current_page:
 *                           type: integer
 *                         total_pages:
 *                           type: integer
 *                         data:
 *                           type: array
 *                           items:
 *                             type: object
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /admin/wallet_balance_rejected_list:
 *   post:
 *     summary: Get rejected wallet balance requests
 *     description: Retrieve paginated list of rejected wallet balance requests
 *     tags: [Customer Wallet Management]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page_no:
 *                 type: integer
 *                 default: 1
 *               search_text:
 *                 type: string
 *     responses:
 *       200:
 *         description: Rejected requests retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardResponse'
 *                 - type: object
 *                   properties:
 *                     results:
 *                       type: object
 *                       properties:
 *                         current_page:
 *                           type: integer
 *                         total_pages:
 *                           type: integer
 *                         data:
 *                           type: array
 *                           items:
 *                             type: object
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /admin/wallet_balance_reject:
 *   post:
 *     summary: Reject wallet balance request
 *     description: Reject a pending wallet balance request (admin/checker action)
 *     tags: [Customer Wallet Management]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - cust_wallet_id
 *               - customer_id
 *               - remark
 *             properties:
 *               cust_wallet_id:
 *                 type: integer
 *                 description: Wallet checker record ID
 *               customer_id:
 *                 type: integer
 *                 description: Customer ID
 *               remark:
 *                 type: string
 *                 description: Rejection remark
 *     responses:
 *       200:
 *         description: Request rejected successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /admin/wallet_balance_approve:
 *   post:
 *     summary: Approve wallet balance request
 *     description: Approve a pending wallet balance request and update Apigee wallet (admin/checker action)
 *     tags: [Customer Wallet Management]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - cust_wallet_id
 *               - customer_id
 *               - remark
 *             properties:
 *               cust_wallet_id:
 *                 type: integer
 *                 description: Wallet checker record ID
 *               customer_id:
 *                 type: integer
 *                 description: Customer ID
 *               remark:
 *                 type: string
 *                 description: Approval remark
 *     responses:
 *       200:
 *         description: Request approved and wallet updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /admin/product_monitization_rate_add:
 *   post:
 *     summary: Add or update product monetization rate plan
 *     description: Create new or update existing monetization rate plan for a product. Supports both admin (direct approval) and maker-checker workflow.
 *     tags: [Monetization Rate]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - product_id
 *               - displayName
 *               - description
 *               - consumptionPricingType
 *               - start_type
 *               - expiry_type
 *             properties:
 *               rate_id:
 *                 type: integer
 *                 description: Rate ID (0 for new, existing ID for update)
 *                 example: 0
 *               product_id:
 *                 type: integer
 *                 description: Product ID
 *                 example: 1
 *               displayName:
 *                 type: string
 *                 description: Display name for the rate plan
 *                 example: "Standard API Plan"
 *               description:
 *                 type: string
 *                 description: Description of the rate plan
 *                 example: "Standard pricing for API usage"
 *               one_time_setup_fee:
 *                 type: number
 *                 description: One-time setup fee
 *                 example: 100
 *               fixedFeeFrequency:
 *                 type: integer
 *                 description: Fixed fee frequency (e.g., monthly)
 *                 example: 1
 *               fixedRecurringFee:
 *                 type: number
 *                 description: Fixed recurring fee amount
 *                 example: 50
 *               consumptionPricingType:
 *                 type: string
 *                 description: Type of consumption pricing (FIXED_PER_UNIT or BANDED)
 *                 enum: [FIXED_PER_UNIT, BANDED]
 *                 example: "FIXED_PER_UNIT"
 *               consumptionPricingRates:
 *                 oneOf:
 *                   - type: number
 *                     description: For FIXED_PER_UNIT, a single rate value
 *                     example: 0.01
 *                   - type: array
 *                     description: For BANDED pricing, array of rate bands
 *                     items:
 *                       type: object
 *                       properties:
 *                         fee:
 *                           type: object
 *                           properties:
 *                             currencyCode:
 *                               type: string
 *                               example: "INR"
 *                             nanos:
 *                               type: integer
 *                               example: 0
 *                             units:
 *                               type: integer
 *                               example: 1
 *                         start:
 *                           type: integer
 *                           example: 0
 *                         end:
 *                           type: integer
 *                           example: 1000
 *               start_type:
 *                 type: integer
 *                 description: Start type (1=Immediately, 2=Future date)
 *                 enum: [1, 2]
 *                 example: 1
 *               start_time:
 *                 type: string
 *                 format: date-time
 *                 description: Start date/time (required if start_type=2)
 *               expiry_type:
 *                 type: integer
 *                 description: Expiry type (1=Never, 2=Immediately, 3=Future date)
 *                 enum: [1, 2, 3]
 *                 example: 1
 *               expiry_time:
 *                 type: string
 *                 format: date-time
 *                 description: Expiry date/time (required if expiry_type=3)
 *     responses:
 *       200:
 *         description: Rate plan created/updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /admin/product_monitization_rate_pending_list:
 *   post:
 *     summary: Get pending monetization rate requests
 *     description: Retrieve list of pending product monetization rate requests awaiting approval
 *     tags: [Monetization Rate]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page_no:
 *                 type: integer
 *                 description: Page number for pagination
 *                 example: 1
 *               search_text:
 *                 type: string
 *                 description: Search text to filter by product name
 *                 example: "API"
 *     responses:
 *       200:
 *         description: Pending rate requests retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 result:
 *                   type: object
 *                   properties:
 *                     current_page:
 *                       type: integer
 *                     total_pages:
 *                       type: integer
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           sr_no:
 *                             type: integer
 *                           rate_id:
 *                             type: integer
 *                           product_id:
 *                             type: integer
 *                           product_name:
 *                             type: string
 *                           display_name:
 *                             type: string
 *                           description:
 *                             type: string
 *                           activity_type:
 *                             type: string
 *                             enum: [CREATED, UPDATED]
 *                           added_date:
 *                             type: string
 *                           ckr_full_name:
 *                             type: string
 *                     is_admin:
 *                       type: boolean
 *                     is_maker:
 *                       type: boolean
 *                     is_checker:
 *                       type: boolean
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /admin/product_monitization_rate_approve_list:
 *   post:
 *     summary: Get approved monetization rate plans
 *     description: Retrieve list of approved product monetization rate plans
 *     tags: [Monetization Rate]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page_no:
 *                 type: integer
 *                 description: Page number for pagination
 *                 example: 1
 *               search_text:
 *                 type: string
 *                 description: Search text to filter by product name
 *                 example: "API"
 *     responses:
 *       200:
 *         description: Approved rate plans retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 result:
 *                   type: object
 *                   properties:
 *                     current_page:
 *                       type: integer
 *                     total_pages:
 *                       type: integer
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           sr_no:
 *                             type: integer
 *                           rate_id:
 *                             type: integer
 *                           product_id:
 *                             type: integer
 *                           product_name:
 *                             type: string
 *                           display_name:
 *                             type: string
 *                           activity_type:
 *                             type: string
 *                           ckr_full_name:
 *                             type: string
 *                           mkr_name:
 *                             type: string
 *                           ckr_approve_date:
 *                             type: string
 *                     is_admin:
 *                       type: boolean
 *                     is_maker:
 *                       type: boolean
 *                     is_checker:
 *                       type: boolean
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /admin/product_monitization_rate_rejected_list:
 *   post:
 *     summary: Get rejected monetization rate requests
 *     description: Retrieve list of rejected product monetization rate requests
 *     tags: [Monetization Rate]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               page_no:
 *                 type: integer
 *                 description: Page number for pagination
 *                 example: 1
 *               search_text:
 *                 type: string
 *                 description: Search text to filter by product name
 *                 example: "API"
 *     responses:
 *       200:
 *         description: Rejected rate requests retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 result:
 *                   type: object
 *                   properties:
 *                     current_page:
 *                       type: integer
 *                     total_pages:
 *                       type: integer
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           sr_no:
 *                             type: integer
 *                           rate_id:
 *                             type: integer
 *                           product_id:
 *                             type: integer
 *                           product_name:
 *                             type: string
 *                           display_name:
 *                             type: string
 *                           activity_type:
 *                             type: string
 *                           ckr_full_name:
 *                             type: string
 *                           mkr_name:
 *                             type: string
 *                           rejected_date:
 *                             type: string
 *                           ckr_remark:
 *                             type: string
 *                     is_admin:
 *                       type: boolean
 *                     is_maker:
 *                       type: boolean
 *                     is_checker:
 *                       type: boolean
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /admin/product_monitization_rate_reject:
 *   post:
 *     summary: Reject monetization rate request
 *     description: Reject a pending product monetization rate request (admin/checker action)
 *     tags: [Monetization Rate]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rate_id
 *               - product_id
 *               - remark
 *             properties:
 *               rate_id:
 *                 type: integer
 *                 description: Rate plan ID to reject
 *                 example: 1
 *               product_id:
 *                 type: integer
 *                 description: Product ID
 *                 example: 1
 *               remark:
 *                 type: string
 *                 description: Rejection remark/reason
 *                 example: "Pricing structure needs review"
 *     responses:
 *       200:
 *         description: Rate plan rejected successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /admin/product_monitization_rate_approve:
 *   post:
 *     summary: Approve monetization rate request
 *     description: Approve a pending product monetization rate request and sync with Apigee (admin/checker action)
 *     tags: [Monetization Rate]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rate_id
 *               - product_id
 *               - remark
 *             properties:
 *               rate_id:
 *                 type: integer
 *                 description: Rate plan ID to approve
 *                 example: 1
 *               product_id:
 *                 type: integer
 *                 description: Product ID
 *                 example: 1
 *               remark:
 *                 type: string
 *                 description: Approval remark
 *                 example: "Approved for production"
 *     responses:
 *       200:
 *         description: Rate plan approved and synced to Apigee successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardResponse'
 *       500:
 *         description: Server error
 */

/**
 * @swagger
 * /admin/product_monitization_rate_req_view_detail:
 *   post:
 *     summary: Get monetization rate request details
 *     description: Retrieve detailed information about a specific monetization rate request
 *     tags: [Monetization Rate]
 *     security:
 *       - bearerAuth: []
 *       - authKey: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rate_id
 *             properties:
 *               rate_id:
 *                 type: integer
 *                 description: Rate plan ID
 *                 example: 1
 *     responses:
 *       200:
 *         description: Rate plan details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statusCode:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 result:
 *                   type: object
 *                   properties:
 *                     rate_id:
 *                       type: integer
 *                     product_id:
 *                       type: integer
 *                     product_name:
 *                       type: string
 *                     display_name:
 *                       type: string
 *                     description:
 *                       type: string
 *                     billing_period:
 *                       type: string
 *                     currency_code:
 *                       type: string
 *                     one_time_setup_fee:
 *                       type: number
 *                     fixed_fee_frequency:
 *                       type: integer
 *                     fixed_recurring_fee:
 *                       type: number
 *                     consumption_pricing_type:
 *                       type: string
 *                     consumption_pricing_rates:
 *                       type: array
 *                     state:
 *                       type: string
 *                     activity_type:
 *                       type: integer
 *                     start_date_type:
 *                       type: integer
 *                     start_date:
 *                       type: string
 *                     expiry_date_type:
 *                       type: integer
 *                     expiry_date:
 *                       type: string
 *                     ckr_full_name:
 *                       type: string
 *                     mkr_name:
 *                       type: string
 *                     added_date:
 *                       type: string
 *                     approve_date:
 *                       type: string
 *                     approve_remark:
 *                       type: string
 *                     is_admin:
 *                       type: boolean
 *                     is_maker:
 *                       type: boolean
 *                     is_checker:
 *                       type: boolean
 *       400:
 *         description: Rate plan not found
 *       500:
 *         description: Server error
 */

export default {};
