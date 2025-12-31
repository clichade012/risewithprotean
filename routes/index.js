import express from 'express';
import customerController from '../controller/customerController.js';
import homeController from '../controller/homeController.js';
import adminController from '../controller/adminController.js';
import docsController from '../controller/docsController.js';

const routerInitialize = (config) => {
    const router = express.Router();
    router.use('/docs', docsController({ config }));
    router.use('/customer', customerController({ config }));
    router.use('/home', homeController({ config }));
    router.use('/admin', adminController({ config }));
    return router;
};

export default routerInitialize;
