import { logger as _logger } from '../logger/winston.js';
import db from '../database/db_helper.js';
import { QueryTypes, Op, literal } from 'sequelize';
import { success } from "../model/responseModel.js";
import validator from 'validator';
import { Constants } from "../model/constantModel.js";
import curlconverter from 'curlconverter-release';

// Helper function to get models from db
const getModels = () => db.models;

// Helper to parse numeric with default
const parseNumericParam = (value, defaultVal = 0) => {
    return value && validator.isNumeric(value.toString()) ? parseInt(value) : defaultVal;
};

// Helper to get safe string value
const getSafeString = (value, defaultVal = '') => {
    return value?.length > 0 ? value : defaultVal;
};

// Helper to build product info object
const buildProductInfo = (productId, productData) => ({
    id: productId,
    name: productData.product_name,
    display_name: productData.display_name,
    icon: getSafeString(productData.product_icon),
    definition_yaml: getSafeString(productData.product_open_spec),
    definition_json: getSafeString(productData.product_open_spec_json) || null,
    api_doc_version: productData.api_doc_version,
});

// Helper to build page info object
const buildPageInfo = (pageData) => ({
    id: pageData.page_id,
    name: pageData.menu_name,
    contents: pageData.page_contents,
    show_helpful_box: Boolean(pageData.show_helpful_box),
    show_api_method: Boolean(pageData.show_api_method),
    show_page_nav: Boolean(pageData.show_page_header_nav),
    is_integration_page: Boolean(pageData.is_integration_page),
    is_overview_page: Boolean(pageData.is_overview_page),
    is_api_reference_page: Boolean(pageData.is_api_reference_page),
});



const fn_nav_menus = async (req) => {
    const { Product, ProductPages } = getModels();
    let menus = [];
    const row1 = await Product.findAll({
        attributes: ['product_id', 'product_name', 'display_name', 'product_icon'],
        where: {
            is_deleted: false,
            [Op.or]: [{ is_published: true }, { is_product_published: true }]
        },
        order: [
            [literal('CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 9223372036854775807 ELSE COALESCE(sort_order, 0) END'), 'ASC'],
            ['product_id', 'ASC']
        ]
    });
    if (row1) {
        for (const p of row1) {
            const row2 = await ProductPages.findAll({
                attributes: ['page_id', 'menu_name', 'show_api_method'],
                where: { is_deleted: false, is_published: true, product_id: p.product_id },
                order: [
                    [literal('CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 9223372036854775807 ELSE COALESCE(sort_order, 0) END'), 'ASC'],
                    ['page_id', 'ASC']
                ]
            });
            let pages = (row2 || []).map(r => ({
                id: r.page_id,
                name: r.menu_name,
                api_ref_page: r.show_api_method
            }));
            let product_icon = p.product_icon && p.product_icon.length > 0 ? p.product_icon : '';
            if (pages.length > 0) {
                menus.push({
                    id: p.product_id,
                    name: p.product_name,
                    display_name: p.display_name,
                    icon: product_icon,
                    pages: pages,
                });
            }
        }
    }
    return menus;
};

const fn_first_menu = async (product_id) => {
    const { ProductPages } = getModels();
    const row2 = await ProductPages.findOne({
        attributes: ['page_id', 'menu_name', 'show_api_method'],
        where: { is_deleted: false, is_published: true, product_id: product_id },
        order: [
            [literal('CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 9223372036854775807 ELSE COALESCE(sort_order, 0) END'), 'ASC'],
            ['page_id', 'ASC']
        ]
    });
    if (row2) {
        const p = { id: row2.page_id, name: row2.menu_name, api_ref_page: row2.show_api_method, };
        return p;
    }
    return null;
};

const home = async (req, res, next) => {
    try {
        const menus = await fn_nav_menus(req);
        const results = {
            menus: menus
        };
        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const product = async (req, res, next) => {
    const { id } = req.body;
    try {
        const { Product, ProductPages } = getModels();
        let _product_id = id && validator.isNumeric(id.toString()) ? parseInt(id) : 0;
        const row1 = await Product.findOne({
            attributes: ['product_name', 'display_name', 'product_icon'],
            where: {
                product_id: _product_id,
                is_deleted: false,
                [Op.or]: [{ is_published: true }, { is_product_published: true }]
            }
        });
        if (row1) {
            const row2 = await ProductPages.findOne({
                attributes: ['page_id', 'menu_name', 'show_api_method'],
                where: { is_deleted: false, is_published: true, product_id: _product_id },
                order: [
                    [literal('CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 9223372036854775807 ELSE COALESCE(sort_order, 0) END'), 'ASC'],
                    ['page_id', 'ASC']
                ]
            });
            if (row2) {
                const results = { id: row2.page_id, name: row2.menu_name, api_ref_page: row2.show_api_method, };
                return res.status(200).json(success(true, res.statusCode, "", results));
            } else {
                return res.status(200).json(success(false, res.statusCode, "Product details not found, Please try again.", null));
            }
        } else {
            return res.status(200).json(success(false, res.statusCode, "Product details not found, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const page_data = async (req, res, next) => {
    const { id, menu_name } = req.body;
    try {
        const { ProductPages } = getModels();
        const _product_id = parseNumericParam(id);
        const _menu_name = getSafeString(menu_name);

        const productData = await getProductDetails(_product_id);
        if (!productData) {
            return res.status(200).json(success(false, res.statusCode, "Product details not found, Please try again.", null));
        }

        const pageData = await ProductPages.findOne({
            attributes: ['page_id', 'menu_name', 'page_contents', 'show_helpful_box', 'show_api_method', 'show_page_header_nav', 'is_integration_page', 'is_overview_page', 'is_api_reference_page'],
            where: { product_id: _product_id, is_deleted: false, is_published: true, menu_name: { [Op.iLike]: _menu_name } }
        });

        if (!pageData) {
            return res.status(200).json(success(false, res.statusCode, "Product page not found, Please try again.", null));
        }

        const [apis_menu, menus, first_page] = await Promise.all([
            getApisMenu(_product_id),
            fn_nav_menus(req),
            fn_first_menu(_product_id)
        ]);

        const productInfo = buildProductInfo(_product_id, productData);
        productInfo.product_doc_pdf = productData.product_documentation_pdf || null;

        const results = {
            menus,
            product: productInfo,
            page: buildPageInfo(pageData),
            apis_menu,
            first_page,
            uat_portal: process.env.UAT_SITE_URL,
            prod_portal: process.env.PROD_SITE_URL,
        };
        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const ref_data = async (req, res, next) => {
    const { id, menu_name, endpoint } = req.body;
    try {
        const _product_id = parseNumericParam(id);
        const _menu_name = getSafeString(menu_name);
        const _endpoint_id = parseNumericParam(endpoint);

        const product = await getProductDetails(_product_id);
        if (!product) {
            return res.status(200).json(success(false, res.statusCode, "Product details not found, Please try again.", null));
        }

        const page = await getProductPage(_product_id, _menu_name);
        if (!page?.show_api_method) {
            return res.status(200).json(success(false, res.statusCode, "Product page not found, Please try again.", null));
        }

        const endpointDetails = await getEndpointDetails(_endpoint_id, _product_id);
        if (!endpointDetails) {
            return res.status(200).json(success(false, res.statusCode, "Product page not found, Please try again.", null));
        }

        const [schemas, apis_menu, first_page, menus] = await Promise.all([
            getSchemasByEndpoint(_endpoint_id),
            getApisMenu(_product_id),
            fn_first_menu(_product_id),
            fn_nav_menus(req)
        ]);

        const results = {
            menus,
            product: buildProductInfo(_product_id, product),
            page: {
                id: page.page_id,
                name: page.menu_name,
                contents: page.page_contents,
                show_helpful_box: Boolean(page.show_helpful_box),
                show_api_method: Boolean(page.show_api_method),
                show_page_nav: Boolean(page.show_page_header_nav),
            },
            proxy: {
                proxy_name: endpointDetails.proxy_name,
                endpoint_id: endpointDetails.endpoint_id,
                endpoint_url: product.is_manual ? '' : endpointDetails.endpoint_url,
                endpoint_name: product.is_manual ? '' : endpointDetails.display_name,
                endpoint_des: endpointDetails.description,
                methods: endpointDetails.methods,
                path_params: endpointDetails.path_params,
                header_param: endpointDetails.header_param,
                request_schema: endpointDetails.request_schema,
                request_sample: endpointDetails.request_sample,
                updated_endpoint: endpointDetails.updated_endpoint,
            },
            schemas,
            apis_menu,
            first_page,
            uat_portal: product.is_manual ? endpointDetails.updated_endpoint : process.env.UAT_SITE_URL,
            prod_portal: process.env.PROD_SITE_URL,
        };

        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

// Helper to convert curl to different languages
const convertCurl = (curl, type_id) => {
    const converters = {
        'go': () => curlconverter.toGo(curl),
        'python': () => curlconverter.toPython(curl),
        'node': () => curlconverter.toNode(curl),
        'php': () => curlconverter.toPhp(curl),
    };
    return converters[type_id] ? converters[type_id]() : db.curl_to_code(curl, type_id);
};

const curl_convert = async (req, res, next) => {
    const { curl, type_id } = req.body;
    try {
        if (!curl?.length || !type_id?.length) {
            return res.status(200).json(success(false, res.statusCode, "cUrl is empty.", null));
        }
        const result = convertCurl(curl, type_id);
        return res.status(200).json(success(true, res.statusCode, "", { req: result }));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const sandbox_product = async (req, res, next) => {
    const { id } = req.body;
    try {
        const { Product } = getModels();
        let _product_id = id && validator.isNumeric(id.toString()) ? parseInt(id) : 0;
        const row1 = await Product.findOne({
            attributes: ['product_id', 'product_name', 'display_name', 'product_icon', 'product_open_spec', 'product_open_spec_json', 'api_doc_version'],
            where: {
                product_id: _product_id,
                is_deleted: false,
                [Op.or]: [{ is_published: true }, { is_product_published: true }]
            }
        });
        if (row1) {
            const row2 = await Product.findAll({
                attributes: ['product_id', 'product_name', 'display_name', 'product_icon', 'product_open_spec', 'product_open_spec_json', 'api_doc_version'],
                where: {
                    is_deleted: false,
                    [Op.or]: [{ is_published: true }, { is_product_published: true }]
                }
            });
            const _icon = row1.product_icon?.length > 0 ? row1.product_icon : '';
            const products = (row2 || []).map(item => ({
                id: item.product_id,
                name: item.product_name,
                display_name: item.display_name,
                icon: item.product_icon?.length > 0 ? item.product_icon : '',
                definition_yaml: item.product_open_spec?.length > 0 ? item.product_open_spec : '',
                definition_json: item.product_open_spec_json?.length > 0 ? item.product_open_spec_json : '',
                api_doc_version: item.api_doc_version,
            }));
            const menus = await fn_nav_menus(req);
            const first_page = await fn_first_menu(_product_id);
            const results = {
                product_id: row1.product_id,
                name: row1.product_name,
                display_name: row1.display_name,
                icon: _icon,
                products: products,
                menus: menus,
                first_page: first_page,
            };
            return res.status(200).json(success(true, res.statusCode, "", results));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Product details not found, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const sandbox_proxies = async (req, res, next) => {
    const { id } = req.body;
    try {
        const { Product, Endpoint, Proxies } = getModels();
        let _product_id = id && validator.isNumeric(id.toString()) ? parseInt(id) : 0;
        const row1 = await Product.findOne({
            attributes: ['product_name', 'display_name', 'product_icon', 'product_open_spec', 'product_open_spec_json', 'api_doc_version'],
            where: {
                product_id: _product_id,
                is_deleted: false,
                [Op.or]: [{ is_published: true }, { is_product_published: true }]
            }
        });
        if (row1) {
            const row4 = await Endpoint.findAll({
                attributes: ['endpoint_id', 'endpoint_url', 'display_name'],
                include: [{
                    model: Proxies,
                    as: 'proxy',
                    attributes: [],
                    where: { product_id: _product_id, is_deleted: false, is_published: true },
                    required: true
                }],
                where: {
                    is_deleted: false,
                    [Op.or]: [{ is_published: true }, { is_product_published: true }]
                }
            });
            const proxies = (row4 || []).map(item => ({
                id: item.endpoint_id,
                name: item.display_name,
                url: item.endpoint_url,
            }));
            const results = { proxies: proxies };
            return res.status(200).json(success(true, res.statusCode, "", results));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Product details not found, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

// Helper to get endpoint with proxy
const getEndpointWithProxy = async (endpointId) => {
    const { Endpoint, Proxies } = getModels();
    return Endpoint.findOne({
        attributes: ['endpoint_id', 'display_name', 'endpoint_url', 'updated_endpoint', 'methods', 'path_params', 'header_param', 'request_schema', 'request_sample'],
        where: { endpoint_id: endpointId, is_deleted: false, [Op.or]: [{ is_published: true }, { is_product_published: true }] },
        include: [{ model: Proxies, as: 'proxy', attributes: ['proxy_id', 'product_id', 'proxy_name'], where: { is_published: true, is_deleted: false }, required: true }]
    });
};

// Helper to get product by ID for proxy
const getProductForProxy = async (productId) => {
    const { Product } = getModels();
    return Product.findOne({
        attributes: ['product_name', 'is_manual', 'display_name', 'product_icon', 'product_open_spec', 'product_open_spec_json', 'api_doc_version'],
        where: { product_id: productId, is_deleted: false, [Op.or]: [{ is_published: true }, { is_product_published: true }] }
    });
};

// Helper to get first schema for endpoint
const getFirstSchema = async (endpointId) => {
    const query = `SELECT status_code, path_params, header_json, req_schema, req_json, res_schema, res_json
                   FROM proxy_schema WHERE schema_id IN (
                       SELECT MAX(schema_id) AS schema_id FROM proxy_schema WHERE endpoint_id = ? AND is_deleted = false AND is_enabled = true GROUP BY status_code
                   ) ORDER BY CAST(status_code AS INTEGER) LIMIT 1`;
    const rows = await db.sequelize.query(query, { replacements: [endpointId], type: QueryTypes.SELECT });
    return rows?.[0] || null;
};

// Helper to build proxy data results
const buildProxyDataResults = (endpoint, product, schema) => ({
    product: buildProductInfo(endpoint.proxy.product_id, product),
    proxy: {
        proxy_name: endpoint.proxy.proxy_name,
        endpoint_url: endpoint.endpoint_url || '',
        endpoint_name: endpoint.display_name || '',
        methods: endpoint.methods,
        path_params: endpoint.path_params,
        header_param: endpoint.header_param,
        request_schema: endpoint.request_schema,
        request_sample: endpoint.request_sample,
        updated_endpoint: endpoint.updated_endpoint,
    },
    schema: {
        status: schema.status_code,
        path_params: schema.path_params,
        headers: schema.header_json,
        req_schema: schema.req_schema,
        req_json: schema.req_json,
        res_schema: schema.res_schema,
        res_json: schema.res_json,
    },
    uat_portal: product.is_manual ? (endpoint.updated_endpoint || '') : process.env.UAT_SITE_URL,
    prod_portal: process.env.PROD_SITE_URL,
});

const proxy_data = async (req, res, next) => {
    const { endpoint } = req.body;
    try {
        const endpoint_id = parseNumericParam(endpoint);

        const endpointData = await getEndpointWithProxy(endpoint_id);
        if (!endpointData) {
            return res.status(200).json(success(false, res.statusCode, "Api details not found, Please try again.", null));
        }

        const productData = await getProductForProxy(endpointData.proxy.product_id);
        if (!productData) {
            return res.status(200).json(success(false, res.statusCode, "Product details not found, Please try again.", null));
        }

        const schemaData = await getFirstSchema(endpoint_id);
        if (!schemaData) {
            return res.status(200).json(success(false, res.statusCode, "Api details not found, Please try again.", null));
        }

        const results = buildProxyDataResults(endpointData, productData, schemaData);
        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const default_res = { status: 401, data: JSON.stringify({ "status": false, "error_code": 401, "error_description": "Invalid Access Token" }, null, 4), };

// Helper to get 401 schema
const get401Schema = async (endpointId) => {
    const { ProxySchema } = getModels();
    return ProxySchema.findOne({
        attributes: ['status_code', 'res_json'],
        where: { endpoint_id: endpointId, is_deleted: false, is_enabled: true, status_code: '401' },
        order: [['schema_id', 'DESC']]
    });
};

// Helper to validate required params against provided params
const validateRequiredParams = (requiredParams, providedParams) => {
    if (!requiredParams?.length) return { isValid: true };

    const parsed = JSON.parse(requiredParams);
    for (const param of parsed) {
        if (!param.is_required) continue;

        const found = providedParams?.find(p => p.name === param.name);
        if (!found || found.value !== param.value) {
            return { isValid: false };
        }
    }
    return { isValid: true };
};

// Helper to find matching schema by request body
const findMatchingSchema = async (endpointId, jsonBody) => {
    const { ProxySchema } = getModels();
    const schemas = await ProxySchema.findAll({
        attributes: ['status_code', 'req_json', 'res_json'],
        where: { endpoint_id: endpointId, is_deleted: false, is_enabled: true },
        order: [[literal('CAST(status_code AS INTEGER)'), 'ASC'], ['schema_id', 'DESC']]
    });

    if (!schemas?.length) return null;

    const jsonBodyStr = JSON.stringify(jsonBody);
    for (const schema of schemas) {
        try {
            if (JSON.stringify(JSON.parse(schema.req_json)) === jsonBodyStr) {
                return { status: schema.status_code, data: schema.res_json };
            }
        } catch (_) { /* ignore parse errors */ }
    }
    return null;
};

const play_api = async (req, res, next) => {
    const { endpoint, path_param, header_param, json_body } = req.body;
    try {
        const endpoint_id = parseNumericParam(endpoint);
        const endpointData = await getEndpointWithProxy(endpoint_id);

        if (!endpointData) {
            return res.status(200).json(success(true, res.statusCode, "success", default_res));
        }

        // Validate path params
        const pathValidation = validateRequiredParams(endpointData.path_params, path_param);
        if (!pathValidation.isValid) {
            const schema401 = await get401Schema(endpoint_id);
            if (schema401) {
                return res.status(200).json(success(true, res.statusCode, "success", { status: schema401.status_code, data: schema401.res_json }));
            }
        }

        // Validate header params
        const headerValidation = validateRequiredParams(endpointData.header_param, header_param);
        if (!headerValidation.isValid) {
            const schema401 = await get401Schema(endpoint_id);
            if (schema401) {
                return res.status(200).json(success(true, res.statusCode, "success", { status: schema401.status_code, data: schema401.res_json }));
            }
        }

        // Find matching schema by request body
        const matchingSchema = await findMatchingSchema(endpoint_id, json_body);
        if (matchingSchema) {
            return res.status(200).json(success(true, res.statusCode, "success", matchingSchema));
        }

        return res.status(200).json(success(true, res.statusCode, "success", default_res));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};


const getProductDetails = async (productId) => {
    const { Product } = getModels();
    const row = await Product.findOne({
        attributes: ['product_id', 'product_name', 'display_name', 'product_icon', 'product_open_spec', 'product_open_spec_json',
            'api_doc_version', 'product_documentation_pdf', 'is_manual', 'page_text', 'description'],
        where: {
            product_id: productId,
            is_deleted: false,
            [Op.or]: [{ is_published: true }, { is_product_published: true }]
        }
    });
    return row || null;
};

const getProductPage = async (productId, menuName) => {
    const { ProductPages } = getModels();
    const row = await ProductPages.findOne({
        attributes: ['page_id', 'menu_name', 'page_contents', 'show_helpful_box', 'show_api_method', 'show_page_header_nav'],
        where: {
            product_id: productId,
            is_deleted: false,
            is_published: true,
            menu_name: { [Op.iLike]: menuName }
        }
    });
    return row || null;
};

const getEndpointDetails = async (endpointId, productId) => {
    const { Endpoint, Proxies } = getModels();
    const row = await Endpoint.findOne({
        attributes: ['endpoint_id', 'endpoint_url', 'display_name', 'description', 'methods', 'path_params',
            'header_param', 'request_schema', 'request_sample', 'updated_endpoint'],
        where: {
            endpoint_id: endpointId,
            is_deleted: false,
            [Op.or]: [{ is_published: true }, { is_product_published: true }]
        },
        include: [{
            model: Proxies,
            as: 'proxy',
            attributes: ['proxy_name'],
            where: { product_id: productId, is_deleted: false, is_published: true },
            required: true
        }]
    });
    if (row) {
        return {
            proxy_name: row.proxy.proxy_name,
            endpoint_id: row.endpoint_id,
            endpoint_url: row.endpoint_url,
            display_name: row.display_name,
            description: row.description,
            methods: row.methods,
            path_params: row.path_params,
            header_param: row.header_param,
            request_schema: row.request_schema,
            request_sample: row.request_sample,
            updated_endpoint: row.updated_endpoint
        };
    }
    return null;
};

const getApisMenu = async (productId) => {
    const { Proxies, Endpoint } = getModels();
    const proxies = await Proxies.findAll({
        attributes: ['proxy_id', 'proxy_name'],
        where: { product_id: productId, is_deleted: false, is_published: true }
    });
    const apisMenu = [];
    for (const proxy of proxies) {
        const endpoints = await Endpoint.findAll({
            attributes: ['endpoint_id', 'endpoint_url', 'display_name', 'description', 'methods'],
            where: {
                proxy_id: proxy.proxy_id,
                is_deleted: false,
                [Op.or]: [{ is_published: true }, { is_product_published: true }]
            },
            order: [
                [literal('CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 9223372036854775807 ELSE COALESCE(sort_order, 0) END'), 'ASC'],
                ['endpoint_id', 'ASC']
            ]
        });
        if (endpoints.length > 0) {
            apisMenu.push({
                id: proxy.proxy_id,
                name: proxy.proxy_name,
                child: endpoints.map((ep) => ({
                    id: ep.endpoint_id,
                    name: ep.display_name,
                    url: ep.endpoint_url,
                    description: ep.description,
                    methods: ep.methods,
                })),
            });
        }
    }
    return apisMenu;
};

const getSchemasByEndpoint = async (_endpoint_id) => {
    const _query5 = ` SELECT status_code, path_params, header_json, req_schema, req_json, res_schema, res_json, req_schema_updated, res_schema_updated
    FROM proxy_schema WHERE schema_id IN ( SELECT MAX(schema_id) AS schema_id FROM proxy_schema WHERE endpoint_id = ? AND is_deleted = false AND is_enabled = true GROUP BY status_code)
    ORDER BY CAST(status_code AS INTEGER) `;
    const row5 = await db.sequelize.query(_query5, { replacements: [_endpoint_id], type: QueryTypes.SELECT });
    if (!row5 || row5.length === 0) {
        return [];
    }

    const getStatusText = (code) => {
        const found = Constants.status_code.find(el => el.code === code);
        return found ? found.text : '';
    };

    return row5.map(schema => ({
        status: schema.status_code,
        status_text: getStatusText(schema.status_code),
        path_params: schema.path_params,
        headers: schema.header_json,
        req_schema: schema.req_schema,
        req_json: schema.req_json,
        res_schema: schema.res_schema,
        res_json: schema.res_json,
    }));
};


export {
    fn_nav_menus,
    fn_first_menu,
    home,
    product,
    page_data,
    ref_data,
    curl_convert,
    sandbox_product,
    sandbox_proxies,
    proxy_data,
    play_api,
};
