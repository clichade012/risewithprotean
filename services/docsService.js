import { logger as _logger } from '../logger/winston.js';
import db from '../database/db_helper.js';
import { QueryTypes, Op, literal } from 'sequelize';
import { success } from "../model/responseModel.js";
import validator from 'validator';
import { Constants } from "../model/constantModel.js";
import curlconverter from 'curlconverter-release';

// Helper function to get models from db
const getModels = () => db.models;



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
        let _product_id = id && validator.isNumeric(id.toString()) ? parseInt(id) : 0;
        let _menu_name = ''; if (menu_name && menu_name.length > 0) { _menu_name = menu_name; }
        const productData = await getProductDetails(_product_id);
        if (!productData) {
            return res.status(200).json(success(false, res.statusCode, "Product details not found, Please try again.", null));
        }
        const row2 = await ProductPages.findOne({
            attributes: ['page_id', 'menu_name', 'page_contents', 'show_helpful_box', 'show_api_method', 'show_page_header_nav', 'is_integration_page', 'is_overview_page', 'is_api_reference_page'],
            where: {
                product_id: _product_id,
                is_deleted: false,
                is_published: true,
                menu_name: { [Op.iLike]: _menu_name }
            }
        });
        if (row2) {
            let product_icon = productData.product_icon && productData.product_icon.length > 0 ? productData.product_icon : '';
            let product_open_spec = productData.product_open_spec && productData.product_open_spec.length > 0 ? productData.product_open_spec : '';
            let product_open_spec_json = productData.product_open_spec_json && productData.product_open_spec_json.length > 0 ? productData.product_open_spec_json : '';
            const apis_menu = await getApisMenu(_product_id);
            const menus = await fn_nav_menus(req);
            const first_page = await fn_first_menu(_product_id);
            const results = {
                menus: menus,
                product: {
                    id: _product_id,
                    name: productData.product_name,
                    display_name: productData.display_name,
                    icon: product_icon,
                    definition_yaml: product_open_spec,
                    definition_json: product_open_spec_json || null,
                    api_doc_version: productData.api_doc_version,
                    product_doc_pdf: productData.product_documentation_pdf || null,
                },
                page: {
                    id: row2.page_id,
                    name: row2.menu_name,
                    contents: row2.page_contents,
                    show_helpful_box: (row2.show_helpful_box && row2.show_helpful_box == true ? true : false),
                    show_api_method: (row2.show_api_method && row2.show_api_method == true ? true : false),
                    show_page_nav: (row2.show_page_header_nav && row2.show_page_header_nav == true ? true : false),
                    is_integration_page: (row2.is_integration_page && row2.is_integration_page == true ? true : false),
                    is_overview_page: (row2.is_overview_page && row2.is_overview_page == true ? true : false),
                    is_api_reference_page: (row2.is_api_reference_page && row2.is_api_reference_page == true ? true : false),
                },
                apis_menu: apis_menu,
                first_page: first_page,
                uat_portal: process.env.UAT_SITE_URL,
                prod_portal: process.env.PROD_SITE_URL,
            };
            return res.status(200).json(success(true, res.statusCode, "", results));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Product page not found, Please try again.", null));
        }

    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const ref_data = async (req, res, next) => {
    const { id, menu_name, endpoint } = req.body;
    try {
        let _product_id = id && validator.isNumeric(id.toString()) ? parseInt(id) : 0;
        let _menu_name = ''; if (menu_name && menu_name.length > 0) { _menu_name = menu_name; }
        let _endpoint_id = endpoint && validator.isNumeric(endpoint.toString()) ? parseInt(endpoint) : 0;

        const product = await getProductDetails(_product_id);
        if (!product) {
            return res.status(200).json(success(false, res.statusCode, "Product details not found, Please try again.", null));
        }
        const page = await getProductPage(_product_id, _menu_name);
        if (!page) {
            return res.status(200).json(success(false, res.statusCode, "Product page not found, Please try again.", null));
        }
        if (!page.show_api_method) {
            return res.status(200).json(success(false, res.statusCode, "Product page not found, Please try again.", null));
        }
        const endpointDetails = await getEndpointDetails(_endpoint_id, _product_id);
        if (!endpointDetails) {
            return res.status(200).json(success(false, res.statusCode, "Product page not found, Please try again.", null));
        }

        let product_icon = product.product_icon && product.product_icon.length > 0 ? product.product_icon : '';
        let product_open_spec = product.product_open_spec && product.product_open_spec.length > 0 ? product.product_open_spec : '';
        let product_open_spec_json = product.product_open_spec_json && product.product_open_spec_json.length > 0 ? product.product_open_spec_json : '';

        const schemas = await getSchemasByEndpoint(_endpoint_id);
        const apis_menu = await getApisMenu(_product_id);
        const first_page = await fn_first_menu(_product_id);
        const menus = await fn_nav_menus(req);

        const results = {
            menus: menus,
            product: {
                id: _product_id,
                name: product.product_name,
                display_name: product.display_name,
                icon: product_icon,
                definition_yaml: product_open_spec,
                definition_json: product_open_spec_json,
                api_doc_version: product.api_doc_version,
            },
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
            schemas: schemas,
            apis_menu: apis_menu,
            first_page: first_page,
            uat_portal: !product.is_manual ? process.env.UAT_SITE_URL : endpointDetails.updated_endpoint,
            prod_portal: process.env.PROD_SITE_URL,
        };

        return res.status(200).json(success(true, res.statusCode, "", results));


    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const curl_convert = async (req, res, next) => {
    const { curl, type_id } = req.body;
    try {
        if (curl && curl.length > 0 && type_id && type_id.length > 0) {
            let r = curl;
            switch (type_id) {
                case 'go':
                    r = curlconverter.toGo(curl);
                    break;
                case 'python':
                    r = curlconverter.toPython(curl);
                    break;
                case 'node':
                    r = curlconverter.toNode(curl);
                    break;
                case 'php':
                    r = curlconverter.toPhp(curl);
                    break;
                default:
                    r = db.curl_to_code(curl, type_id);
            }
            return res.status(200).json(success(true, res.statusCode, "", { req: r }));
        } else {
            return res.status(200).json(success(false, res.statusCode, "cUrl is empty.", null));
        }
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

const proxy_data = async (req, res, next) => {
    const { endpoint } = req.body;
    try {
        const { Product, Endpoint, Proxies } = getModels();
        let endpoint_id = endpoint && validator.isNumeric(endpoint.toString()) ? parseInt(endpoint) : 0;

        const row1 = await Endpoint.findOne({
            attributes: ['endpoint_id', 'display_name', 'endpoint_url', 'updated_endpoint', 'methods', 'path_params', 'header_param', 'request_schema', 'request_sample'],
            where: {
                endpoint_id: endpoint_id,
                is_deleted: false,
                [Op.or]: [{ is_published: true }, { is_product_published: true }]
            },
            include: [{
                model: Proxies,
                as: 'proxy',
                attributes: ['proxy_id', 'product_id', 'proxy_name'],
                where: { is_published: true, is_deleted: false },
                required: true
            }]
        });
        if (row1) {
            const row2 = await Product.findOne({
                attributes: ['product_name', 'is_manual', 'display_name', 'product_icon', 'product_open_spec', 'product_open_spec_json', 'api_doc_version'],
                where: {
                    product_id: row1.proxy.product_id,
                    is_deleted: false,
                    [Op.or]: [{ is_published: true }, { is_product_published: true }]
                }
            });
            if (row2) {
                // Complex subquery with MAX and GROUP BY - keeping as raw SQL
                const _query3 = `SELECT status_code, path_params, header_json, req_schema, req_json, res_schema, res_json, req_schema_updated, res_schema_updated
                                FROM proxy_schema WHERE schema_id IN (
                                    SELECT MAX(schema_id) AS schema_id FROM proxy_schema WHERE endpoint_id = ? AND is_deleted = false AND is_enabled = true GROUP BY status_code
                                )
                                ORDER BY CAST (status_code AS INTEGER) LIMIT 1`;
                const row3 = await db.sequelize.query(_query3, { replacements: [endpoint_id], type: QueryTypes.SELECT });
                if (row3 && row3.length > 0) {
                    let product_icon = row2.product_icon && row2.product_icon.length > 0 ? row2.product_icon : '';
                    let product_open_spec = row2.product_open_spec && row2.product_open_spec.length > 0 ? row2.product_open_spec : '';
                    let product_open_spec_json = row2.product_open_spec_json && row2.product_open_spec_json.length > 0 ? row2.product_open_spec_json : '';

                    const results = {
                        product: {
                            id: row1.proxy.product_id,
                            name: row2.product_name,
                            display_name: row2.display_name,
                            icon: product_icon,
                            definition_yaml: product_open_spec,
                            definition_json: product_open_spec_json,
                            api_doc_version: row2.api_doc_version,
                        },
                        proxy: {
                            proxy_name: row1.proxy.proxy_name,
                            endpoint_url: row1.endpoint_url || '',
                            endpoint_name: row1.display_name || '',
                            methods: row1.methods,
                            path_params: row1.path_params,
                            header_param: row1.header_param,
                            request_schema: row1.request_schema,
                            request_sample: row1.request_sample,
                            updated_endpoint: row1.updated_endpoint,
                        },
                        schema: {
                            status: row3[0].status_code,
                            path_params: row3[0].path_params,
                            headers: row3[0].header_json,
                            req_schema: row3[0].req_schema,
                            req_json: row3[0].req_json,
                            res_schema: row3[0].res_schema,
                            res_json: row3[0].res_json,
                        },
                        uat_portal: !row2.is_manual ? process.env.UAT_SITE_URL : row1.updated_endpoint || '',
                        prod_portal: process.env.PROD_SITE_URL,
                    };
                    return res.status(200).json(success(true, res.statusCode, "", results));
                } else {
                    return res.status(200).json(success(false, res.statusCode, "Api details not found, Please try again.", null));
                }
            } else {
                return res.status(200).json(success(false, res.statusCode, "Product details not found, Please try again.", null));
            }
        } else {
            return res.status(200).json(success(false, res.statusCode, "Api details not found, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const default_res = { status: 401, data: JSON.stringify({ "status": false, "error_code": 401, "error_description": "Invalid Access Token" }, null, 4), };

const play_api = async (req, res, next) => {
    const { endpoint, method, url, path_param, header_param, json_body } = req.body;
    try {
        const { Endpoint, Proxies, ProxySchema } = getModels();
        let endpoint_id = endpoint && validator.isNumeric(endpoint.toString()) ? parseInt(endpoint) : 0;

        const row1 = await Endpoint.findOne({
            attributes: ['endpoint_id', 'display_name', 'endpoint_url', 'updated_endpoint', 'methods', 'path_params', 'header_param', 'request_schema', 'request_sample'],
            where: {
                endpoint_id: endpoint_id,
                is_deleted: false,
                [Op.or]: [{ is_published: true }, { is_product_published: true }]
            },
            include: [{
                model: Proxies,
                as: 'proxy',
                attributes: ['proxy_id', 'product_id', 'proxy_name'],
                where: { is_published: true, is_deleted: false },
                required: true
            }]
        });
        if (row1) {
            if (row1.path_params && row1.path_params.length > 0) {
                let ptemp = JSON.parse(row1.path_params);
                for (let i = 0; ptemp && i < ptemp.length; i++) {
                    if (ptemp[i].is_required && ptemp[i].is_required == true) {
                        let is_exists = false; let value_matched = false;
                        for (const element of path_param) {
                            if (ptemp[i].name == element.name) {
                                is_exists = true;
                                if (ptemp[i].value == element.value) {
                                    value_matched = true;
                                }
                                break;
                            }
                        }
                        if (!is_exists) { // path parameter is missing


                        }
                        if (!value_matched) {// path value is mismatch

                        }

                        if (!is_exists || !value_matched) {
                            const row_p1 = await ProxySchema.findOne({
                                attributes: ['status_code', 'path_params', 'header_json', 'req_schema', 'req_json', 'res_schema', 'res_json'],
                                where: { endpoint_id: endpoint_id, is_deleted: false, is_enabled: true, status_code: '401' },
                                order: [['schema_id', 'DESC']]
                            });
                            if (row_p1) {
                                const results = { status: row_p1.status_code, data: row_p1.res_json, };
                                return res.status(200).json(success(true, res.statusCode, "success", results));
                            }
                        }

                    }
                }
            }
            if (row1.header_param && row1.header_param.length > 0) {
                let htemp = JSON.parse(row1.header_param);
                for (let i = 0; htemp && i < htemp.length; i++) {
                    if (htemp[i].is_required && htemp[i].is_required == true) {
                        let is_exists = false; let value_matched = false;
                        for (const element of header_param) {
                            if (htemp[i].name == element.name) {
                                is_exists = true;
                                if (htemp[i].value == element.value) {
                                    value_matched = true;
                                }
                                break;
                            }
                        }
                        if (!is_exists) { // header parameter is missing

                        }
                        if (!value_matched) {// header value is mismatch

                        }
                        if (!is_exists || !value_matched) {
                            const row_h1 = await ProxySchema.findOne({
                                attributes: ['status_code', 'path_params', 'header_json', 'req_schema', 'req_json', 'res_schema', 'res_json'],
                                where: { endpoint_id: endpoint_id, is_deleted: false, is_enabled: true, status_code: '401' },
                                order: [['schema_id', 'DESC']]
                            });
                            if (row_h1) {
                                const results = { status: row_h1.status_code, data: row_h1.res_json, };
                                return res.status(200).json(success(true, res.statusCode, "success", results));
                            }
                        }
                    }
                }
            }

            const row3 = await ProxySchema.findAll({
                attributes: ['status_code', 'path_params', 'header_json', 'req_schema', 'req_json', 'res_schema', 'res_json'],
                where: { endpoint_id: endpoint_id, is_deleted: false, is_enabled: true },
                order: [
                    [literal('CAST(status_code AS INTEGER)'), 'ASC'],
                    ['schema_id', 'DESC']
                ]
            });
            if (row3 && row3.length > 0) {
                for (const element of row3) {
                    try {
                        if (JSON.stringify(JSON.parse(element.req_json)) == JSON.stringify(json_body)) {
                            const results = {
                                status: element.status_code,
                                data: element.res_json,
                            };
                            return res.status(200).json(success(true, res.statusCode, "success", results));
                        }
                    } catch (_) {

                    }
                }

                // no match found
                return res.status(200).json(success(true, res.statusCode, "success", default_res));
            } else {
                // no entry found...
                return res.status(200).json(success(true, res.statusCode, "success", default_res));
            }
        } else {
            //Api details not found
            return res.status(200).json(success(true, res.statusCode, "success", default_res));
        }
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
