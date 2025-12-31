import customerService from '../services/customerService.js';
import * as paymentService from '../services/paymentService.js';
import * as sandboxApiService from '../services/sandboxApiService.js';
import jwtCustomer from '../middleware/jwtCustomer.js';
import multer from 'multer';
import path from 'path';

export default ({ config }) => {
    const router = config.express.Router();
    const storage = multer.diskStorage({
        destination: function (req, file, cb) { cb(null, 'uploads/'); },
        filename: function (req, file, cb) { cb(null, Date.now() + path.extname(file.originalname)); },
    });

    function fileFilter(req, file, cb) {
        const allowedExtensions = ['.cer', '.pem', '.crt', '.png'];
        const fileExtension = path.extname(file.originalname).toLowerCase();
        if (allowedExtensions.includes(fileExtension)) {
            cb(null, true); // Accept the file
        } else {
            cb(new Error('Invalid file extension.'), false); // Reject the file
        }
    }
    const upload = multer({ storage: storage, fileFilter: fileFilter, });

    router.post('/login', (req, res, next) => {
        return customerService.login(req, res, next);
    });

    router.post('/refresh_token', (req, res, next) => {
        return customerService.refresh_token(req, res, next);
    });

    router.post('/logout', jwtCustomer, (req, res, next) => {
        return customerService.logout(req, res, next);
    });

    router.post('/dashboard', jwtCustomer, (req, res, next) => {
        return customerService.dashboard(req, res, next);
    });

    router.post('/my_profile', jwtCustomer, (req, res, next) => {
        return customerService.my_profile(req, res, next);
    });

    router.post('/profile_get', jwtCustomer, (req, res, next) => {
        return customerService.profile_get(req, res, next);
    });

    router.post('/profile_set', jwtCustomer, (req, res, next) => {
        return customerService.profile_set(req, res, next);
    });

    router.post('/change_password', jwtCustomer, (req, res, next) => {
        return customerService.change_password(req, res, next);
    });
    router.post('/logout_all_sessions', jwtCustomer, (req, res, next) => {
        return customerService.logout_all_sessions(req, res, next);
    });
    router.get('/contact_us_form', jwtCustomer, async (req, res, next) => {
        return customerService.contact_us_form(req, res, next);
    });

    router.post('/contact_us_save', jwtCustomer, async (req, res, next) => {
        return customerService.contact_us_save(req, res, next);
    });

    router.post('/sessions_get', jwtCustomer, (req, res, next) => {
        return customerService.sessions_get(req, res, next);
    });
    router.post('/live_mode_toggle', jwtCustomer, (req, res, next) => {
        return customerService.live_mode_toggle(req, res, next);
    });
    router.post('/live_mode_get', jwtCustomer, (req, res, next) => {
        return customerService.live_mode_get(req, res, next);
    });
    router.post('/app_set', jwtCustomer, upload.fields([{ name: 'certificate' },]), (req, res, next) => {
        return customerService.app_new(req, res, next);
    });
    router.post('/app_products', jwtCustomer, (req, res, next) => {
        return customerService.app_products(req, res, next);
    });

    router.post('/my_app_list_get', jwtCustomer, (req, res, next) => {
        return customerService.my_app_list_get(req, res, next);
    });
    router.post('/app_update', jwtCustomer, upload.fields([{ name: 'certificate' },]), (req, res, next) => {
        return customerService.app_update(req, res, next);
    });

    router.post('/cust_app_del', jwtCustomer, (req, res, next) => {
        return customerService.cust_app_del(req, res, next);
    });
    router.post('/my_app_edit_get', jwtCustomer, (req, res, next) => {
        return customerService.my_app_edit_get(req, res, next);
    });
    router.post('/create_app_data', jwtCustomer, (req, res, next) => {
        return customerService.create_app_data(req, res, next);
    });

    router.post('/get_started_get', jwtCustomer, (req, res, next) => {
        return customerService.get_started_get(req, res, next);
    });

    router.post('/move_to_production', jwtCustomer, upload.fields([{ name: 'certificate' },]), (req, res, next) => {
        return customerService.move_to_production(req, res, next);
    });
    router.post('/test_upload',  upload.fields([{ name: 'certificate' },]), async (req, res, next) => {
        return customerService.test_upload(req, res, next);
    });

    router.post('/test_uploadss', upload.fields([{ name: 'certificate' },]), async (req, res, next) => {
        return customerService.test_upload(req, res, next);
    })

    router.post('/analytics', jwtCustomer, (req, res, next) => {
        return customerService.analytics(req, res, next);
    });


    router.post('/live_sandbox_product', jwtCustomer, (req, res, next) => {
        return customerService.live_sandbox_product(req, res, next);
    });

    router.post('/live_sandbox_proxies',jwtCustomer, async (req, res, next) => {
        return customerService.live_sandbox_proxies(req, res, next);
    });

    router.post('/live_proxy_data', jwtCustomer, async (req, res, next) => {
        return customerService.live_proxy_data(req, res, next);
    });

    router.post('/live_play_api', jwtCustomer, async (req, res, next) => {
        return customerService.live_play_api(req, res, next);
    });

    router.post('/credit_details_get', jwtCustomer, async (req, res, next) => {
        return customerService.credit_details_get(req, res, next);
    });

    router.post('/apigee_api_request', jwtCustomer, async (req, res, next) => {
        return sandboxApiService.apigee_api_request(req, res, next);
    });

    router.post('/user_details', jwtCustomer, (req, res, next) => {
        return customerService.user_details(req, res, next);
    });

    router.post('/credit_details_export', jwtCustomer, async (req, res, next) => {
        return customerService.credit_details_export(req, res, next);
    });

    router.post('/analytics_reports_get', jwtCustomer, async (req, res, next) => {
        return customerService.analytics_reports_get(req, res, next);
    });

    router.post('/analytics_reports_export', jwtCustomer, async (req, res, next) => {
        return customerService.analytics_reports_export(req, res, next);
    });

    router.post('/cst_analytics_reports_generate_excel', jwtCustomer, (req, res, next) => {
        return customerService.cst_analytics_reports_generate_excel(req, res, next);
    });

    router.post('/cst_analytics_reports_download', jwtCustomer, (req, res, next) => {
        return customerService.cst_analytics_reports_download(req, res, next);
    });

    router.post('/bill_desk_response', async (req, res, next) => {
        return paymentService.bill_desk_response(req, res, next);
    });

    router.post('/wallet_balance_pay_get', jwtCustomer, (req, res, next) => {
        return customerService.wallet_balance_pay_get(req, res, next);
    });

    router.post('/wallet_balance_pay_chk', jwtCustomer, (req, res, next) => {
        return customerService.wallet_balance_pay_chk(req, res, next);
    });

    router.post('/cst_wallets_balance_details_get', jwtCustomer, (req, res, next) => {
        return customerService.cst_wallets_balance_details_get(req, res, next);
    });

    router.post('/cst_wallets_balance_get', (req, res, next) => {
        return customerService.cst_wallets_balance_get(req, res, next);
    });

    router.post('/wallets_details_export', jwtCustomer, (req, res, next) => {
        return customerService.wallets_details_export(req, res, next);
    });

    router.post('/customer_apigee_balance_update', jwtCustomer, (req, res, next) => {
        return customerService.customer_apigee_balance_update(req, res, next);
    });

    router.post('/app_list_rate_get', jwtCustomer, (req, res, next) => {
        return customerService.app_list_rate_get(req, res, next);
    });

    return router;

};
