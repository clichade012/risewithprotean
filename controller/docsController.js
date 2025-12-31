import * as docsService from '../services/docsService.js';

export default ({ config }) => {
    const router = config.express.Router();

    router.post('/home', async (req, res, next) => {
        return docsService.home(req, res, next);
    });

    router.post('/product', async (req, res, next) => {
        return docsService.product(req, res, next);
    });

    router.post('/page_data', async (req, res, next) => {
        return docsService.page_data(req, res, next);
    });

    router.post('/ref_data', async (req, res, next) => {
        return docsService.ref_data(req, res, next);
    });

    router.post('/curl_convert', async (req, res, next) => {
        return docsService.curl_convert(req, res, next);
    });

    router.post('/sandbox_product', async (req, res, next) => {
        return docsService.sandbox_product(req, res, next);
    });

    router.post('/sandbox_proxies', async (req, res, next) => {
        return docsService.sandbox_proxies(req, res, next);
    });

    router.post('/proxy_data', async (req, res, next) => {
        return docsService.proxy_data(req, res, next);
    });
    router.post('/play_api', async (req, res, next) => {
        return docsService.play_api(req, res, next);
    });


    return router;
};
