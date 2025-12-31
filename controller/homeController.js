import * as homeService from '../services/homeService.js';
import admAnalyticsReportsService from '../services/admin/admAnalyticsReportsService.js';
import admProductCategoryService from '../services/admin/admProductCategoryService.js';

export default ({ config }) => {
    const router = config.express.Router();
    router.get('/home', async (req, res, next) => {
        return homeService.home(req, res, next);
    });
    router.get('/signup_data', async (req, res, next) => {
        return homeService.signup_data(req, res, next);
    });
    router.post('/signup_new', async (req, res, next) => {
        return homeService.signup_new(req, res, next);
    });
    router.post('/success_get', async (req, res, next) => {
        return homeService.success_get(req, res, next);
    });
    router.post('/verify_email_link', async (req, res, next) => {
        return homeService.verify_email_link(req, res, next);
    });
    router.post('/resend_email_link', async (req, res, next) => {
        return homeService.resend_email_link(req, res, next);
    });
    router.post('/login', async (req, res, next) => {
        return homeService.login(req, res, next);
    });
    router.get('/faqs', async (req, res, next) => {
        return homeService.faqs(req, res, next);
    });

    router.get('/contact_us_form', async (req, res, next) => {
        return homeService.contact_us_form(req, res, next);
    });

    router.post('/contact_us_save', async (req, res, next) => {
        return homeService.contact_us_save(req, res, next);
    });

    router.post('/send_reset_link', async (req, res, next) => {
        return homeService.send_reset_link(req, res, next);
    });

    router.post('/verify_reset_pass', async (req, res, next) => {
        return homeService.verify_reset_pass(req, res, next);
    });

    router.post('/reset_link_check', async (req, res, next) => {
        return homeService.reset_link_check(req, res, next);
    });
    router.post('/catalog_get', async (req, res, next) => {
        return homeService.catalog_get(req, res, next);
    });

    router.post("/product_detais", (req, res, next) => {
        return homeService.product_details(req, res, next);
    });

    router.get("/terms_condition", (req, res, next) => {
        return homeService.terms_condition(req, res, next);
    });

    router.post('/product_get', async (req, res, next) => {
        return homeService.product_get(req, res, next);
    });

    router.post('/download_file', async (req, res, next) => {
        return homeService.download_file(req, res, next);
    });

    router.get('/test', async (req, res, next) => {
        return homeService.test(req, res, next);
    })

    /** this is for cron job to get daily mis data and send the report on mail at 11.30 AM */
    router.post('/fetchDailyApiUsageReport', async (req, res, next) => {
        return admAnalyticsReportsService.fetchDailyApiUsageReport(req, res, next);
    })

    router.post('/getFYYearDataCron', async (req, res, next) => {
        return admAnalyticsReportsService.getFYYearDataCron(req, res, next);
    })

    router.post('/getDailyMisDataCron', async (req, res, next) => {
        return admAnalyticsReportsService.getDailyMisDataCron(req, res, next);
    })

    router.post('/createCSVAndUploadSFTP', async (req, res, next) => {
        return admAnalyticsReportsService.createCSVAndUploadSFTP(req, res, next);
    })



    router.post("/loadFilterCategory", (req, res, next) => {
        return admProductCategoryService.productCategoryDropdown(req, res, next);
    });


    return router;
};
