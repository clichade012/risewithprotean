import { logger as _logger, action_logger } from "../../logger/winston.js";
import db from "../../database/db_helper.js";
import { success } from "../../model/responseModel.js";
import { Op, literal } from "sequelize";
import dateFormat from "date-format";
import validator from "validator";
import { fetch } from 'cross-fetch';
import correlator from 'express-correlation-id';
import { API_STATUS } from "../../model/enumModel.js";
import { Constants } from "../../model/constantModel.js";
import commonModule from "../../modules/commonModule.js";
import generateSchema from 'generate-schema';
import cloudStorage from "../cloudStorage.js";

const api_products_list = async (req, res, next) => {
    const { page_no, search_text, order_by_filter } = req.body;
    const { Product, AdmUser } = db.models;
    try {
        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0;
        let _order_by_filter = order_by_filter && validator.isNumeric(order_by_filter.toString()) ? parseInt(order_by_filter) : 0;
        if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";

        // Build where clause with case-insensitive search
        const whereClause = {
            is_deleted: false,
            ...(_search_text && {
                [Op.or]: [
                    db.sequelize.where(
                        db.sequelize.fn('LOWER', db.sequelize.col('product_name')),
                        { [Op.like]: db.sequelize.fn('LOWER', `%${_search_text}%`) }
                    ),
                    db.sequelize.where(
                        db.sequelize.fn('LOWER', db.sequelize.col('description')),
                        { [Op.like]: db.sequelize.fn('LOWER', `%${_search_text}%`) }
                    )
                ]
            })
        };

        // Count total records
        const total_record = await Product.count({ where: whereClause });
        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);

        // For complex ROW_NUMBER() OVER() with CASE WHEN, using raw query with ORM models
        const _query1 = ` SELECT ROW_NUMBER() OVER(ORDER BY CASE WHEN  :order_by_filter = 0 THEN p.product_id END DESC,
        CASE WHEN  :order_by_filter = 1 THEN CASE WHEN COALESCE(p.sort_order, 0) <= 0 THEN 9223372036854775807 ELSE COALESCE(p.sort_order, 0) END END ASC,
        CASE WHEN  :order_by_filter = 2  THEN CASE WHEN COALESCE(p.product_sort_order, 0) <= 0 THEN 9223372036854775807 ELSE COALESCE(p.product_sort_order, 0) END END ASC) AS sr_no,
        p.product_id, p.unique_id, p.product_name, p.is_published,p.description, p.page_text, p.key_features, p.flow_chart,
        p.added_date, p.modify_date, p.added_by, p.modify_by, p.json_data, CONCAT(a.first_name, ' ', a.last_name) AS admin_name,
        p.is_manual, p.is_product_published, p.display_name, p.sort_order, p.product_sort_order, p.is_routing_applicable, p.rate_plan_value, p.monitization_rate_id
        FROM product p INNER JOIN adm_user a ON p.added_by = a.admin_id
        WHERE p.is_deleted = false AND (LOWER(p.product_name) LIKE LOWER(:search_text) OR LOWER(p.description) LIKE LOWER(:search_text)) ORDER BY
        CASE WHEN  :order_by_filter = 0 THEN p.product_id END DESC,
        CASE WHEN  :order_by_filter = 1 THEN CASE WHEN COALESCE(p.sort_order, 0) <= 0 THEN 9223372036854775807 ELSE COALESCE(p.sort_order, 0) END END ASC,
        CASE WHEN  :order_by_filter = 2  THEN CASE WHEN COALESCE(p.product_sort_order, 0) <= 0 THEN 9223372036854775807 ELSE COALESCE(p.product_sort_order, 0) END END ASC
        LIMIT :page_size OFFSET ((:page_no - 1) * :page_size)  `;

        const row1 = await db.sequelize.query(_query1, {
            replacements: {
                search_text: "%" + _search_text + "%",
                page_size: process.env.PAGINATION_SIZE,
                page_no: _page_no,
                order_by_filter: _order_by_filter
            },
            type: QueryTypes.SELECT,
        });

        let list = [];
        if (row1) {
            for (const item of row1) {
                list.push({
                    sr_no: item.sr_no,
                    product_id: item.product_id,
                    rate_id: item.monitization_rate_id,
                    product_name: item.product_name,
                    display_name: item.display_name,
                    is_published: item.is_published,
                    admin_name: item.admin_name,
                    description: item.description,
                    page_text: item.page_text,
                    key_features: item.key_features,
                    flow_chart: item.flow_chart,
                    is_manual: item.is_manual,
                    is_product_published: item.is_product_published,
                    is_routing_applicable: item.is_routing_applicable,
                    sort_order: item.sort_order,
                    product_sort_order: item.product_sort_order,
                    added_date: item.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.added_date)) : "",
                    modify_date: item.modify_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.modify_date)) : "",
                    json_data: item.json_data,
                    rate_plan_value: item.rate_plan_value,
                });
            }
        }

        const results = {
            current_page: _page_no,
            total_pages: Math.ceil(total_record / process.env.PAGINATION_SIZE),
            data: list,
            is_admin: is_admin,
            is_maker: is_maker,
            is_checker: is_checker,
        };
        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const product_get = async (req, res, next) => {
    const { product_id } = req.body;
    const { Product, ProductPages, Proxies, Endpoint } = db.models;
    try {
        let _product_id = product_id && validator.isNumeric(product_id.toString()) ? parseInt(product_id) : 0;

        const row0 = await Product.findOne({
            where: {
                product_id: _product_id,
                is_deleted: false
            },
            attributes: ['product_id', 'product_name', 'is_published', 'description', 'page_text', 'flow_chart', 'key_features',
                'added_date', 'modify_date', 'product_note', 'product_icon', 'product_open_spec', 'product_open_spec_json',
                'product_documentation_pdf', 'is_manual', 'api_doc_version', 'display_name', 'sort_order', 'product_sort_order',
                'monitization_rate_id', 'rate_plan_value', 'category_id'],
            raw: true
        });

        if (row0) {
            let product_pages = [];
            const row23 = await ProductPages.findAll({
                where: {
                    product_id: _product_id,
                    is_deleted: false
                },
                attributes: ['page_id', 'product_id', 'menu_name', 'show_api_method', 'sort_order', 'is_published', 'is_deleted',
                    'added_date', 'modify_date', 'show_helpful_box', 'page_contents', 'show_page_header_nav',
                    'is_integration_page', 'is_overview_page', 'is_api_reference_page'],
                order: [
                    [db.sequelize.literal('CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 9223372036854775807 ELSE COALESCE(sort_order, 0) END'), 'ASC'],
                    ['page_id', 'ASC']
                ],
                raw: true
            });

            if (row23) {
                for (const pp of row23) {
                    product_pages.push({
                        page_id: pp.page_id,
                        product_id: pp.product_id,
                        rate_id: pp.monitization_rate_id,
                        rate_plan_value: pp.rate_plan_value,
                        menu_name: pp.menu_name,
                        show_api_method: pp.show_api_method,
                        sort_order: pp.sort_order,
                        is_published: pp.is_published,
                        show_helpful_box: pp.show_helpful_box,
                        page_contents: pp.page_contents,
                        show_page_header_nav: pp.show_page_header_nav,
                        is_integration_page: pp.is_integration_page,
                        is_overview_page: pp.is_overview_page,
                        is_api_reference_page: pp.is_api_reference_page,
                        added_on: pp.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(pp.added_date)) : "",
                        modify_on: pp.modify_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(pp.modify_date)) : "",
                    });
                }
            }

            let proxies = [];
            const row1 = await Proxies.findAll({
                where: {
                    product_id: _product_id,
                    is_deleted: false
                },
                attributes: ['proxy_id', 'proxy_name', 'is_published', 'description', 'added_date', 'modify_date', 'is_manual', 'display_name'],
                order: [['proxy_id', 'DESC']],
                raw: true
            });

            if (row1) {
                for (const ps of row1) {
                    let endpoint = [];
                    const row2 = await Endpoint.findAll({
                        where: {
                            proxy_id: ps.proxy_id,
                            is_deleted: false
                        },
                        attributes: ['endpoint_id', 'product_id', 'endpoint_url', 'display_name', 'description', 'is_published',
                            'is_product_published', 'added_date', 'modify_date', 'sort_order', 'redirect_url', 'is_manual', 'category_id'],
                        order: [
                            [db.sequelize.literal('CASE WHEN COALESCE(sort_order, 0) <= 0 THEN 9223372036854775807 ELSE COALESCE(sort_order, 0) END'), 'ASC'],
                            ['endpoint_id', 'ASC']
                        ],
                        raw: true
                    });

                    if (row2) {
                        for (const e of row2) {
                            endpoint.push({
                                endpoint_id: e.endpoint_id,
                                product_id: e.product_id,
                                endpoint_url: e.endpoint_url,
                                display_name: e.display_name,
                                description: e.description,
                                is_published: e.is_published,
                                is_product_published: e.is_product_published,
                                sort_order: e.sort_order,
                                is_manual: e.is_manual,
                                redirect_url: e.redirect_url,
                                category_id: e.category_id,
                                added_on: e.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(e.added_date)) : "",
                                modify_on: e.modify_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(e.modify_date)) : "",
                            });
                        }
                    }
                    proxies.push({
                        proxy_id: ps.proxy_id,
                        proxy_name: ps.proxy_name,
                        is_published: ps.is_published,
                        display_name: ps.display_name,
                        description: ps.description,
                        is_manual: ps.is_manual,
                        added_on: ps.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(ps.added_date)) : "",
                        modify_on: ps.modify_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(ps.modify_date)) : "",
                        endpoint: endpoint,
                    });
                }
            }

            let product_open_spec = row0.product_open_spec && row0.product_open_spec.length > 0 ? row0.product_open_spec : '';
            let flow_chart = row0.flow_chart && row0.flow_chart.length > 0 ? row0.flow_chart : '';
            let product_icon = row0.product_icon && row0.product_icon.length > 0 ? row0.product_icon : '';
            let product_open_spec_json = row0.product_open_spec_json && row0.product_open_spec_json.length > 0 ? row0.product_open_spec_json : '';
            let product_documentation_pdf = row0.product_documentation_pdf && row0.product_documentation_pdf.length > 0 ? row0.product_documentation_pdf : '';

            const results = {
                product_id: row0.product_id,
                product_name: row0.product_name,
                display_name: row0.display_name,
                is_published: row0.is_published,
                description: (row0.description ? row0.description : ''),
                page_text: (row0.page_text ? row0.page_text : ''),
                api_doc_version: row0.api_doc_version,
                product_icon: product_icon,
                flow_chart: flow_chart,
                product_open_spec: product_open_spec,
                product_open_spec_json: product_open_spec_json,
                product_documentation_pdf: product_documentation_pdf,
                key_features: (row0.key_features ? row0.key_features : ''),
                added_on: row0.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(row0.added_date)) : "",
                modify_on: row0.modify_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(row0.modify_date)) : "",
                product_note: (row0.product_note ? row0.product_note : ''),
                is_manual: row0.is_manual,
                sort_order: row0.sort_order,
                product_sort_order: row0.product_sort_order,
                category_id: row0.category_id,
                product_pages: product_pages,
                proxies: proxies,
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

const api_products_publish = async (req, res, next) => {
    const { product_id } = req.body;
    const { Product } = db.models;
    try {
        let _product_id = product_id && validator.isNumeric(product_id.toString()) ? parseInt(product_id) : 0;

        const row1 = await Product.findOne({
            where: {
                product_id: _product_id,
                is_deleted: false
            },
            attributes: ['product_id', 'is_published', 'product_name'],
            raw: true
        });

        if (!row1) {
            return res.status(200).json(success(false, res.statusCode, "Product details not found, Please try again.", null));
        }

        const [affectedRows] = await Product.update(
            {
                is_published: db.sequelize.literal('CASE WHEN is_published = true THEN false ELSE true END'),
                modify_date: db.get_ist_current_date(),
                modify_by: req.token_data.account_id
            },
            {
                where: { product_id: _product_id }
            }
        );

        if (affectedRows > 0) {
            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: 'Product ' + (row1.is_published == true ? 'unpublish' : 'publish') + ' from website. Product name = ' + row1.product_name,
                    query: JSON.stringify({
                        product_id: _product_id,
                        is_published_toggled: true
                    }),
                    date_time: db.get_ist_current_date(),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }
            return res.status(200).json(success(true, res.statusCode, "Product status change successfully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to change, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const api_products_update = async (req, res, next) => {
    const { Product } = db.models;
    try {
        const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/apiproducts`;
        const apigeeAuth = await db.get_apigee_token();
        const response = await fetch(product_URL, {
            method: "GET", headers: { Authorization: `Bearer ${apigeeAuth}`, },
        });
        const data = await response.json();
        if (response.status == 200) {
            for (const product of data.apiProduct) {
                const product_name = product.name;
                const response = JSON.stringify(data.apiProduct);

                const row1 = await Product.findOne({
                    where: {
                        product_name: product_name,
                        is_deleted: false,
                        is_manual: false
                    },
                    attributes: ['product_id', 'product_name'],
                    raw: true
                });

                if (row1) {
                    console.log(`${product_name} is already exists.`);
                    const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/apiproducts/${product_name}`;
                    const apigeeAuth = await db.get_apigee_token();
                    const response1 = await fetch(product_URL, {
                        method: "GET", headers: { Authorization: `Bearer ${apigeeAuth}`, },
                    });
                    const data1 = await response1.json();
                    if (response1.status == 200) {
                        await Product.update(
                            { display_name: data1.displayName },
                            { where: { product_id: row1.product_id } }
                        );
                    }
                }
                else {
                    const newProduct = await Product.create({
                        product_name: product_name,
                        added_by: req.token_data.account_id,
                        modify_by: req.token_data.account_id,
                        added_date: db.get_ist_current_date(),
                        modify_date: db.get_ist_current_date(),
                        json_data: response,
                        is_manual: false
                    });

                    const product_id = newProduct?.product_id ?? 0;
                    if (product_id > 0) {
                        console.log(`${product_name} saved successfully.`);
                        const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/apiproducts/${product_name}`;
                        const apigeeAuth = await db.get_apigee_token();
                        const response2 = await fetch(product_URL, {
                            method: "GET", headers: { Authorization: `Bearer ${apigeeAuth}`, },
                        });
                        const data2 = await response2.json();
                        if (response2.status == 200) {
                            await Product.update(
                                { display_name: data2.displayName },
                                { where: { product_id: product_id } }
                            );
                        }
                    } else {
                        console.log(`Unable to save ${product_name}, please try again.`);
                    }
                }
            }
            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: 'Product pull from apigee.',
                    query: '',
                    date_time: db.get_ist_current_date(),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }
            return res.status(200).json(success(true, res.statusCode, "Products saved successfully.", null));
        }
        else if (data.error && data.error.message && data.error.message.length > 0) {
            return res.status(200).json(success(false, res.statusCode, "Apigee response : " + data.error.message, null));
        }
        else {
            return res.status(200).json(success(false, res.statusCode, "Apigee response : " + data.error.message, null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const proxy_products_update = async (req, res, next) => {
    const { product_id } = req.body;
    const { Product, Proxies, Endpoint } = db.models;
    try {
        let _product_id = product_id && validator.isNumeric(product_id.toString()) ? parseInt(product_id) : 0;

        const productRow = await Product.findOne({
            where: { product_id: _product_id, is_deleted: false },
            attributes: ['product_id', 'product_name'],
            raw: true
        });
        if (!productRow) {
            return res.status(200).json(success(false, res.statusCode, "Product details not found, Please try again.", null));
        }
        const product_name = productRow.product_name;

        const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/apiproducts/${product_name}`;
        const apigeeAuth = await db.get_apigee_token();
        const responseMain = await fetch(product_URL, {
            method: "GET", headers: { Authorization: `Bearer ${apigeeAuth}`, },
        });
        const data = await responseMain.json();
        if (responseMain.status == 200) {
            if (data && data.operationGroup && data.operationGroup.operationConfigs) {
                let proxy_database_list = [];

                for (const product of data.operationGroup.operationConfigs) {
                    const response = JSON.stringify(data.operationGroup.operationConfigs);
                    const proxy_name = product.apiSource;
                    const proxyRow = await Proxies.findOne({
                        where: { proxy_name: proxy_name, product_id: product_id },
                        attributes: ['proxy_id', 'proxy_name', 'is_deleted'],
                        raw: true
                    });
                    if (proxyRow) {
                        const proxy_id = proxyRow.proxy_id;
                        let proxy_exist = false;
                        for (const element of proxy_database_list) {
                            if (element.id && element.id == proxy_id) {
                                proxy_exist = true; break;
                            }
                        }
                        if (!proxy_exist) {
                            proxy_database_list.push({ id: proxy_id, ids: [] });
                        }

                        if (proxyRow.is_deleted && proxyRow.is_deleted === true) {
                            await Proxies.update(
                                { is_deleted: false },
                                { where: { proxy_id: proxy_id } }
                            );
                        }

                        const endpoint_url = product.operations[0].resource;
                        console.log(product);
                        const endpoint_methods = product.operations[0].methods;
                        const endpointRow = await Endpoint.findOne({
                            where: { endpoint_url: endpoint_url, proxy_id: proxy_id },
                            attributes: ['proxy_id', 'endpoint_url', 'endpoint_id', 'is_deleted'],
                            raw: true
                        });
                        if (endpointRow) {
                            for (let k = 0; k < proxy_database_list.length; k++) {
                                if (proxy_database_list[k].id && proxy_database_list[k].id == proxy_id) {
                                    let endpoint_exist = false;
                                    for (let m = 0; proxy_database_list[k].ids && m < proxy_database_list[k].ids.length; m++) {
                                        if (proxy_database_list[k].ids[m] == endpointRow.endpoint_id) {
                                            endpoint_exist = true;
                                            break;
                                        }
                                    }
                                    if (!endpoint_exist) {
                                        proxy_database_list[k].ids.push(endpointRow.endpoint_id);
                                    }
                                    break;
                                }
                            }
                            if (endpointRow.endpoint_id && endpointRow.endpoint_id > 0) {
                                await Endpoint.update(
                                    { methods: endpoint_methods },
                                    { where: { endpoint_id: endpointRow.endpoint_id } }
                                );
                            }

                            if (endpointRow.is_deleted && endpointRow.is_deleted == true) {
                                await Endpoint.update(
                                    { is_deleted: false },
                                    { where: { endpoint_id: endpointRow.endpoint_id } }
                                );
                            }
                            console.log(`${proxy_name} is already exists.`);
                        }
                        else {
                            const newEndpoint = await Endpoint.create({
                                product_id: product_id,
                                proxy_id: proxy_id,
                                endpoint_url: endpoint_url,
                                json_data: response,
                                added_by: req.token_data.account_id,
                                added_date: db.get_ist_current_date(),
                                methods: endpoint_methods
                            });
                            const endpoint_id = newEndpoint?.endpoint_id ?? 0;
                            if (endpoint_id > 0) {
                                for (let k = 0; k < proxy_database_list.length; k++) {
                                    if (proxy_database_list[k].id && proxy_database_list[k].id == proxy_id) {
                                        let endpoint_exist = false;
                                        for (let m = 0; proxy_database_list[k].ids && m < proxy_database_list[k].ids.length; m++) {
                                            if (proxy_database_list[k].ids[m] == endpoint_id) {
                                                endpoint_exist = true;
                                                break;
                                            }
                                        }
                                        if (!endpoint_exist) {
                                            proxy_database_list[k].ids.push(endpoint_id);
                                        }
                                        break;
                                    }
                                }
                                console.log(`${endpoint_url} saved successfully.`);
                            } else {
                                console.log(`Unable to save ${endpoint_url}, please try again.`);
                            }
                        }
                    }
                    else {
                        const newProxy = await Proxies.create({
                            product_id: product_id,
                            proxy_name: proxy_name,
                            added_by: req.token_data.account_id,
                            added_date: db.get_ist_current_date(),
                            json_data: response
                        });
                        const proxy_id = newProxy?.proxy_id ?? 0;
                        if (proxy_id > 0) {
                            proxy_database_list.push({ id: proxy_id, ids: [] });
                            const endpoint_url = product.operations[0].resource;
                            const _methods = product.operations[0].methods;
                            const endpoint_methods = _methods.join("|");
                            const endpointRow2 = await Endpoint.findOne({
                                where: { endpoint_url: endpoint_url, proxy_id: proxy_id },
                                attributes: ['proxy_id', 'endpoint_url', 'endpoint_id', 'is_deleted'],
                                raw: true
                            });
                            if (endpointRow2) {
                                for (let k = 0; k < proxy_database_list.length; k++) {
                                    if (proxy_database_list[k].id && proxy_database_list[k].id == proxy_id) {
                                        let endpoint_exist = false;
                                        for (let m = 0; proxy_database_list[k].ids && m < proxy_database_list[k].ids.length; m++) {
                                            if (proxy_database_list[k].ids[m] == endpointRow2.endpoint_id) {
                                                endpoint_exist = true;
                                                break;
                                            }
                                        }
                                        if (!endpoint_exist) {
                                            proxy_database_list[k].ids.push(endpointRow2.endpoint_id);
                                        }
                                        break;
                                    }
                                }
                                if (endpointRow2.endpoint_id && endpointRow2.endpoint_id > 0) {
                                    await Endpoint.update(
                                        { methods: endpoint_methods },
                                        { where: { endpoint_id: endpointRow2.endpoint_id } }
                                    );
                                }

                                if (endpointRow2.is_deleted && endpointRow2.is_deleted == true) {
                                    await Endpoint.update(
                                        { is_deleted: false },
                                        { where: { endpoint_id: endpointRow2.endpoint_id } }
                                    );
                                }

                                console.log(`${proxy_name} is already exists.`);
                            }
                            else {
                                const newEndpoint2 = await Endpoint.create({
                                    product_id: product_id,
                                    proxy_id: proxy_id,
                                    endpoint_url: endpoint_url,
                                    json_data: response,
                                    added_by: req.token_data.account_id,
                                    added_date: db.get_ist_current_date(),
                                    methods: endpoint_methods
                                });
                                const endpoint_id = newEndpoint2?.endpoint_id ?? 0;
                                if (endpoint_id > 0) {

                                    for (let k = 0; k < proxy_database_list.length; k++) {
                                        if (proxy_database_list[k].id && proxy_database_list[k].id == proxy_id) {
                                            let endpoint_exist = false;
                                            for (let m = 0; proxy_database_list[k].ids && m < proxy_database_list[k].ids.length; m++) {
                                                if (proxy_database_list[k].ids[m] == endpoint_id) {
                                                    endpoint_exist = true;
                                                    break;
                                                }
                                            }
                                            if (!endpoint_exist) {
                                                proxy_database_list[k].ids.push(endpoint_id);
                                            }
                                            break;
                                        }
                                    }

                                    console.log(`${endpoint_url} saved successfully.`);
                                } else {
                                    console.log(`Unable to save ${endpoint_url}, please try again.`);
                                }
                            }
                        } else {
                            console.log(`Unable to save ${proxy_name}, please try again.`);
                        }
                    }
                }

                let tmp_proxies = [];
                for (let h = 0; h < proxy_database_list.length; h++) {
                    tmp_proxies.push(proxy_database_list[h].id);
                }
                if (tmp_proxies && tmp_proxies.length > 0) {
                    await Proxies.update(
                        { is_published: false, is_deleted: true },
                        { where: { product_id: _product_id, proxy_id: { [Op.notIn]: tmp_proxies } } }
                    );
                } else {
                    await Proxies.update(
                        { is_published: false, is_deleted: true },
                        { where: { product_id: _product_id } }
                    );
                }
                for (let h = 0; h < proxy_database_list.length; h++) {
                    const _tmpID = proxy_database_list[h].id;
                    const _tmpIDs = proxy_database_list[h].ids;
                    if (_tmpIDs && _tmpIDs.length > 0) {
                        await Endpoint.update(
                            { is_published: false, is_deleted: true },
                            { where: { proxy_id: _tmpID, endpoint_id: { [Op.notIn]: _tmpIDs } } }
                        );
                    } else {
                        await Endpoint.update(
                            { is_published: false, is_deleted: true },
                            { where: { proxy_id: _tmpID } }
                        );
                    }
                }
                try {
                    let data_to_log = {
                        correlation_id: correlator.getId(),
                        token_id: req.token_data.token_id,
                        account_id: req.token_data.account_id,
                        user_type: 1,
                        user_id: req.token_data.admin_id,
                        narration: 'Product proxies pull from apigee ' + product_name,
                        query: '',
                        date_time: db.get_ist_current_date(),
                    }
                    action_logger.info(JSON.stringify(data_to_log));
                } catch (_) { }
                return res.status(200).json(success(true, res.statusCode, "Product proxies saved successfully.", null));
            }
            else {
                return res.status(200).json(success(false, res.statusCode, "Proxy not found for this product.", null));
            }
        }
        else if (data.error && data.error.message && data.error.message.length > 0) {
            return res.status(200).json(success(false, res.statusCode, "Apigee response : " + data.error.message, null));
        }
        else {
            return res.status(200).json(success(false, res.statusCode, "Apigee response : " + data.error.message, null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const proxy_description_set = async (req, res, next) => {
    const { proxy_id, description, display_name } = req.body;
    const { Proxies } = db.models;
    try {
        let _proxy_id = proxy_id && validator.isNumeric(proxy_id.toString()) ? parseInt(proxy_id) : 0;

        const proxyRow = await Proxies.findOne({
            where: { proxy_id: _proxy_id },
            attributes: ['proxy_name', 'is_published'],
            raw: true
        });
        if (!proxyRow) {
            return res.status(200).json(success(false, res.statusCode, "Proxy details not found, Please try again.", null));
        }
        if (!display_name || display_name.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter display name.", null));
        }
        const [affectedRows] = await Proxies.update(
            {
                description: description,
                display_name: display_name,
                modify_date: db.get_ist_current_date(),
                modify_by: req.token_data.account_id
            },
            { where: { proxy_id: _proxy_id } }
        );
        if (affectedRows > 0) {

            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: 'Proxy description updated. Proxy name = ' + proxyRow.proxy_name,
                    query: `Proxies.update({ description, display_name }, { where: { proxy_id: ${_proxy_id} }})`,
                    date_time: db.get_ist_current_date(),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }

            return res.status(200).json(success(true, res.statusCode, "Description saved successfully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to save, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const proxy_publish_toggle = async (req, res, next) => {
    const { proxy_id } = req.body;
    const { Proxies } = db.models;
    try {
        let _proxy_id = proxy_id && validator.isNumeric(proxy_id.toString()) ? parseInt(proxy_id) : 0;

        const proxyRow = await Proxies.findOne({
            where: { proxy_id: _proxy_id },
            attributes: ['proxy_name', 'is_published'],
            raw: true
        });
        if (!proxyRow) {
            return res.status(200).json(success(false, res.statusCode, "Proxy details not found, Please try again.", null));
        }

        const newPublishedStatus = !proxyRow.is_published;
        const [affectedRows] = await Proxies.update(
            {
                is_published: newPublishedStatus,
                modify_date: db.get_ist_current_date(),
                modify_by: req.token_data.account_id
            },
            { where: { proxy_id: _proxy_id } }
        );
        if (affectedRows > 0) {
            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: 'Proxy ' + (proxyRow.is_published == true ? 'unpublish' : 'publish') + '. Proxy name = ' + proxyRow.proxy_name,
                    query: `Proxies.update({ is_published: ${newPublishedStatus} }, { where: { proxy_id: ${_proxy_id} }})`,
                    date_time: db.get_ist_current_date(),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }

            return res.status(200).json(success(true, res.statusCode, "Status changed successfully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to change status, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const product_detail_update = async (req, res, next) => {
    const { Product } = db.models;
    try {
        res.on('finish', () => {
            db.delete_uploaded_files(req);
        });
        const { product_id } = req.body;
        const { key_featurs, product_note, description, api_doc_version, catalogue_sort_order, product_sort_order, category_id } = req.body;
        let _product_id = product_id && validator.isNumeric(product_id.toString()) ? parseInt(product_id) : 0;
        let _category_id = category_id && validator.isNumeric(category_id.toString()) ? parseInt(category_id) : 0;
        if (_category_id <= 0) {
            return res.status(500).json(success(false, res.statusCode, "Please select Category.", null));
        }
        if (_product_id <= 0) {
            return res.status(500).json(success(false, res.statusCode, "Invalid product id.", null));
        } else {

            const productRow = await Product.findOne({
                where: { product_id: _product_id, is_deleted: false },
                attributes: ['product_name'],
                raw: true
            });
            if (!productRow) {
                return res.status(200).json(success(false, res.statusCode, "Product details not found, Please try again.", null));
            }

            let icon_res = ""; let product_iconFilename = "";
            if (req.files['product_icon']) {
                try {
                    const fi = req.files['product_icon'][0];
                    icon_res = await cloudStorage.UploadFile(fi.path, 'product_icon/' + fi.filename, true);
                    product_iconFilename = `${process.env.BUCKET_URL}/${icon_res.bucket}/${icon_res.name}`;
                } catch (_) { }
            }

            let spec_res = ""; let product_open_specname = "";
            if (req.files['product_open_spec']) {
                try {
                    const fi = req.files['product_open_spec'][0];
                    spec_res = await cloudStorage.UploadFile(fi.path, 'product_data/' + fi.filename, true);
                    product_open_specname = `${process.env.BUCKET_URL}/${spec_res.bucket}/${spec_res.name}`;
                } catch (_) { }
            }

            let flow_chart_res = ""; let flow_chartFilename = "";
            if (req.files['flow_chart']) {
                try {
                    const fi = req.files['flow_chart'][0];
                    flow_chart_res = await cloudStorage.UploadFile(fi.path, 'product_data/' + fi.filename, true);
                    flow_chartFilename = `${process.env.BUCKET_URL}/${flow_chart_res.bucket}/${flow_chart_res.name}`;
                } catch (_) { }
            }
            let json_res = ""; let product_open_api_json = "";
            if (req.files['product_open_spec_json']) {
                try {
                    const fi_json = req.files['product_open_spec_json'][0];
                    json_res = await cloudStorage.UploadFile(fi_json.path, 'product_data/' + fi_json.filename, true);
                    product_open_api_json = `${process.env.BUCKET_URL}/${json_res.bucket}/${json_res.name}`;
                } catch (_) { }
            }

            let pdf_res = ""; let product_documentation_pdf_name = "";
            if (req.files['product_documentation_pdf']) {
                try {
                    const fi_pdf = req.files['product_documentation_pdf'][0];
                    pdf_res = await cloudStorage.UploadFile(fi_pdf.path, 'product_data/' + fi_pdf.filename, true);
                    product_documentation_pdf_name = `${process.env.BUCKET_URL}/${pdf_res.bucket}/${pdf_res.name}`;
                } catch (_) { }
            }

            let _catalogue_sort_order = catalogue_sort_order.trim().length > 0 ? catalogue_sort_order.trim() : 0;
            let _product_sort_order = product_sort_order.trim() && product_sort_order.trim().length > 0 ? product_sort_order.trim() : 0;

            // Build update object conditionally
            const updateData = {
                product_note: product_note,
                api_doc_version: api_doc_version,
                sort_order: _catalogue_sort_order,
                product_sort_order: _product_sort_order,
                modify_by: req.token_data.account_id,
                modify_date: db.get_ist_current_date(),
                category_id: _category_id
            };

            // Only update file fields if new files were uploaded
            if (product_iconFilename && product_iconFilename.length > 0) {
                updateData.product_icon = product_iconFilename;
            }
            if (product_open_specname && product_open_specname.length > 0) {
                updateData.product_open_spec = product_open_specname;
            }
            if (product_open_api_json && product_open_api_json.length > 0) {
                updateData.product_open_spec_json = product_open_api_json;
            }
            if (product_documentation_pdf_name && product_documentation_pdf_name.length > 0) {
                updateData.product_documentation_pdf = product_documentation_pdf_name;
            }

            const [affectedRows] = await Product.update(updateData, { where: { product_id: _product_id } });
            _logger.error("i==" + affectedRows);
            if (affectedRows > 0) {
                try {
                    let data_to_log = {
                        correlation_id: correlator.getId(),
                        token_id: req.token_data.token_id,
                        account_id: req.token_data.account_id,
                        user_type: 1,
                        user_id: req.token_data.admin_id,
                        narration: 'Product details updated. product name = ' + productRow.product_name,
                        query: `Product.update(${JSON.stringify(updateData)}, { where: { product_id: ${_product_id} }})`,
                        date_time: db.get_ist_current_date(),
                    }
                    action_logger.info(JSON.stringify(data_to_log));
                } catch (_) { }

                return res.status(200).json(success(true, res.statusCode, "Product details saved successfully.", null));
            } else {
                return res.status(200).json(success(false, res.statusCode, "Unable to save, Please try again.", null));
            }
        }
    } catch (err) {
        _logger.error(err.stack);

    }
};

const product_page_text_update = async (req, res, next) => {
    const { Product } = db.models;
    try {
        const { product_id } = req.body;
        const { page_text } = req.body;

        let _product_id = product_id && validator.isNumeric(product_id.toString()) ? parseInt(product_id) : 0;
        if (_product_id <= 0) {
            return res.status(500).json(success(false, res.statusCode, "Invalid product id..", null));
        } else {

            const productRow = await Product.findOne({
                where: { product_id: _product_id, is_deleted: false },
                attributes: ['product_name'],
                raw: true
            });
            if (!productRow) {
                return res.status(200).json(success(false, res.statusCode, "Product details not found, Please try again.", null));
            }

            const updateData = {
                modify_date: db.get_ist_current_date(),
                modify_by: req.token_data.account_id
            };
            if (page_text) {
                updateData.page_text = page_text;
            }

            const [affectedRows] = await Product.update(updateData, { where: { product_id: _product_id } });

            if (affectedRows > 0) {
                try {
                    let data_to_log = {
                        correlation_id: correlator.getId(),
                        token_id: req.token_data.token_id,
                        account_id: req.token_data.account_id,
                        user_type: 1,
                        user_id: req.token_data.admin_id,
                        narration: 'Product cms page content updated. Product name = ' + productRow.product_name,
                        query: `Product.update(${JSON.stringify(updateData)}, { where: { product_id: ${_product_id} }})`,
                        date_time: db.get_ist_current_date(),
                    }
                    action_logger.info(JSON.stringify(data_to_log));
                } catch (_) { }

                return res.status(200).json(success(true, res.statusCode, "Update successfully.", null));
            } else {
                return res.status(200).json(success(false, res.statusCode, "Unable to update, Please try again.", null));
            }
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const product_url_check = async (req, res, next) => {
    const { product_id, url_text } = req.body;
    const { UrlRewrite } = db.models;
    try {
        let _product_id = product_id && validator.isNumeric(product_id.toString()) ? parseInt(product_id) : 0;
        if (_product_id <= 0) {
            return res.status(500).json(success(false, res.statusCode, "Invalid product id.", null));
        }
        if (!url_text || url_text.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter url text.", null));
        }
        let new_url = db.slugify_url(url_text);
        if (new_url != url_text) {
            return res.status(200).json(success(false, API_STATUS.PRODUCT_URL_INVALID.value, "Url text is not valid.", {
                valid_url: new_url,
            }));
        }
        let url_is_valid = true;
        const urlRow = await UrlRewrite.findOne({
            where: { url_text: url_text },
            attributes: ['type_id', 'table_id'],
            raw: true
        });
        if (urlRow) {
            if (urlRow.type_id == Constants.url_type_product
                && urlRow.table_id == _product_id) {
                url_is_valid = true;
            } else {
                url_is_valid = false;
            }
        }
        if (!url_is_valid) {
            return res.status(200).json(success(false, res.statusCode, "Url is already in use.", null));
        }
        return res.status(200).json(success(true, res.statusCode, "Url is available.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const product_image_delete = async (req, res, next) => {
    const { product_id, type_id } = req.body;
    const { Product } = db.models;
    try {
        let _product_id = product_id && validator.isNumeric(product_id.toString()) ? parseInt(product_id) : 0;

        const productRow = await Product.findOne({
            where: { product_id: _product_id, is_deleted: false },
            attributes: ['product_name'],
            raw: true
        });
        if (!productRow) {
            return res.status(200).json(success(false, res.statusCode, "Product details not found, Please try again.", null));
        }

        let _type_id = type_id && validator.isNumeric(type_id.toString()) ? parseInt(type_id) : 0;
        let file_type = '';
        const updateData = {};
        switch (_type_id) {
            case 1: file_type = 'YAML'; updateData.product_open_spec = ''; break;
            case 2: file_type = 'JSON'; updateData.product_open_spec_json = ''; break;
            case 3: file_type = 'API Documentation'; updateData.product_documentation_pdf = ''; break;
        }

        const [affectedRows] = await Product.update(updateData, { where: { product_id: _product_id } });
        if (affectedRows > 0) {
            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: 'Product "' + file_type + '" files deleted. Product name = ' + productRow.product_name,
                    query: `Product.update(${JSON.stringify(updateData)}, { where: { product_id: ${_product_id} }})`,
                    date_time: db.get_ist_current_date(),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }
            return res.status(200).json(success(true, res.statusCode, "Image Deleted successfully.", null));
        }
        else {
            return res.status(200).json(success(false, res.statusCode, "Unable to delete, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const product_set_new = async (req, res, next) => {
    const { product_id, product_name } = req.body;
    const { Product, Proxies } = db.models;
    try {
        let _product_id = product_id && validator.isNumeric(product_id.toString()) ? parseInt(product_id) : 0;
        if (!product_name || product_name.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter Product name.", null));
        }
        const existingProduct = await Product.findOne({
            where: { product_id: { [Op.ne]: _product_id }, product_name: product_name, is_deleted: false },
            attributes: ['product_id'],
            raw: true
        });
        if (existingProduct) {
            return res.status(200).json(success(false, API_STATUS.ALREADY_EXISTS.value, "Product name is already exists.", null));
        }
        if (_product_id > 0) {
            const productRow = await Product.findOne({
                where: { product_id: _product_id, is_deleted: false },
                attributes: ['product_id', 'is_manual', 'product_name'],
                raw: true
            });
            if (!productRow) {
                return res.status(200).json(success(false, res.statusCode, "Product details not found, Please try again.", null));
            }
            const is_manual = productRow.is_manual && productRow.is_manual == true ? true : false;
            if (!is_manual) {
                return res.status(200).json(success(false, res.statusCode, "Only manually added product can be edited.", null));
            }
            const [affectedRows] = await Product.update(
                {
                    product_name: product_name,
                    modify_by: req.token_data.account_id,
                    modify_date: db.get_ist_current_date()
                },
                { where: { product_id: _product_id } }
            );
            if (affectedRows > 0) {
                try {
                    let data_to_log = {
                        correlation_id: correlator.getId(),
                        token_id: req.token_data.token_id,
                        account_id: req.token_data.account_id,
                        user_type: 1,
                        user_id: req.token_data.admin_id,
                        narration: 'API product updated. Product name: ' + (productRow.product_name == product_name ? product_name : productRow.product_name + ' to ' + product_name),
                        query: `Product.update({ product_name: '${product_name}' }, { where: { product_id: ${_product_id} }})`,
                        date_time: db.get_ist_current_date(),
                    }
                    action_logger.info(JSON.stringify(data_to_log));
                } catch (_) { }

                return res.status(200).json(success(true, res.statusCode, "Updated successfully.", null));
            } else {
                return res.status(200).json(success(false, res.statusCode, "Unable to update, Please try again", null));
            }
        } else {
            const newProduct = await Product.create({
                product_name: product_name,
                added_by: req.token_data.account_id,
                modify_by: req.token_data.account_id,
                added_date: db.get_ist_current_date(),
                modify_date: db.get_ist_current_date(),
                is_manual: true
            });
            const new_product_id = newProduct?.product_id ?? 0;
            if (new_product_id > 0) {

                const newProxy = await Proxies.create({
                    product_id: new_product_id,
                    proxy_name: product_name,
                    added_by: req.token_data.account_id,
                    added_date: db.get_ist_current_date(),
                    is_manual: true
                });
                const proxy_id = newProxy?.proxy_id ?? 0;
                if (proxy_id > 0) {
                    try {
                        let data_to_log = {
                            correlation_id: correlator.getId(),
                            token_id: req.token_data.token_id,
                            account_id: req.token_data.account_id,
                            user_type: 1,
                            user_id: req.token_data.admin_id,
                            narration: 'New product added. Product name: ' + product_name,
                            query: `Product.create({ product_name: '${product_name}' })`,
                            date_time: db.get_ist_current_date(),
                        }
                        action_logger.info(JSON.stringify(data_to_log));
                    } catch (_) { }
                }
                return res.status(200).json(success(true, res.statusCode, "Added Successfully.", null));

            } else {
                return res.status(200).json(success(false, res.statusCode, "Unable to save, Please try again", null));
            }
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const product_delete = async (req, res, next) => {
    const { product_id } = req.body;
    const { Product } = db.models;
    try {
        let _product_id = product_id && validator.isNumeric(product_id.toString()) ? parseInt(product_id) : 0;
        const productRow = await Product.findOne({
            where: { product_id: _product_id, is_deleted: false },
            attributes: ['product_id', 'is_manual', 'product_name'],
            raw: true
        });
        if (!productRow) {
            return res.status(200).json(success(false, res.statusCode, "Product details not found.", null));
        }
        const is_manual = productRow.is_manual;
        if (is_manual && is_manual === true) {
            const [affectedRows] = await Product.update(
                {
                    is_deleted: true,
                    modify_date: db.get_ist_current_date(),
                    modify_by: req.token_data.account_id
                },
                { where: { product_id: _product_id } }
            );
            if (affectedRows > 0) {
                try {
                    let data_to_log = {
                        correlation_id: correlator.getId(),
                        token_id: req.token_data.token_id,
                        account_id: req.token_data.account_id,
                        user_type: 1,
                        user_id: req.token_data.admin_id,
                        narration: 'Product deleted. Product name = ' + productRow.product_name,
                        query: `Product.update({ is_deleted: true }, { where: { product_id: ${_product_id} }})`,
                        date_time: db.get_ist_current_date(),
                    }
                    action_logger.info(JSON.stringify(data_to_log));
                } catch (_) { }

                return res.status(200).json(success(true, res.statusCode, "Product deleted successfully.", null));
            }
            else {
                return res.status(200).json(success(false, res.statusCode, "Unable to delete Product, please try again.", null));
            }
        }
        else {
            return res.status(200).json(success(false, res.statusCode, "Only manually added product can be deleted. You can only unpublish this product.", null));
        }
    }
    catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
}

const proxy_endpoint_publish_toggle = async (req, res, next) => {
    const { endpoint_id } = req.body;
    const { Endpoint } = db.models;
    try {
        let _endpoint_id = endpoint_id && validator.isNumeric(endpoint_id.toString()) ? parseInt(endpoint_id) : 0;

        const endpointRow = await Endpoint.findOne({
            where: { endpoint_id: _endpoint_id },
            attributes: ['endpoint_url', 'display_name', 'is_published'],
            raw: true
        });
        if (!endpointRow) {
            return res.status(200).json(success(false, res.statusCode, "Proxy End-points details not found, Please try again.", null));
        }

        const newPublishedStatus = !endpointRow.is_published;
        const [affectedRows] = await Endpoint.update(
            {
                is_published: newPublishedStatus,
                modify_date: db.get_ist_current_date(),
                modify_by: req.token_data.account_id
            },
            { where: { endpoint_id: _endpoint_id } }
        );
        if (affectedRows > 0) {
            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: 'Proxy End-points ' + (endpointRow.is_published == true ? 'unpublish' : 'publish') + '. Proxy End-point name = ' + endpointRow.display_name,
                    query: `Endpoint.update({ is_published: ${newPublishedStatus} }, { where: { endpoint_id: ${_endpoint_id} }})`,
                    date_time: db.get_ist_current_date(),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }

            return res.status(200).json(success(true, res.statusCode, "Status changed successfully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to change status, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const proxy_endpoint_details_update = async (req, res, next) => {
    const { endpoint_id, display_name, description, sort_order, redirect_url, category_id } = req.body;
    const { Endpoint } = db.models;
    try {
        let _endpoint_id = endpoint_id && validator.isNumeric(endpoint_id.toString()) ? parseInt(endpoint_id) : 0;
        let _sort_order = sort_order && validator.isNumeric(sort_order.toString()) ? parseInt(sort_order) : 0;
        let _category_id = category_id && validator.isNumeric(category_id.toString()) ? parseInt(category_id) : 0;

        if (_category_id <= 0) {
            return res.status(500).json(success(false, res.statusCode, "Please select Category.", null));
        }
        const endpointRow = await Endpoint.findOne({
            where: { endpoint_id: _endpoint_id },
            attributes: ['endpoint_url', 'display_name', 'is_published'],
            raw: true
        });
        if (!endpointRow) {
            return res.status(200).json(success(false, res.statusCode, "Proxy End-points details not found, Please try again.", null));
        }

        if (!display_name || display_name.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter display name.", null));
        }
        // if (!description || description.length <= 0) {
        //     return res.status(200).json(success(false, res.statusCode, "Please enter description.", null));
        // }
        const [affectedRows] = await Endpoint.update(
            {
                display_name: display_name,
                description: description,
                modify_date: db.get_ist_current_date(),
                modify_by: req.token_data.account_id,
                sort_order: _sort_order,
                redirect_url: redirect_url,
                category_id: _category_id
            },
            { where: { endpoint_id: _endpoint_id } }
        );
        if (affectedRows > 0) {

            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: 'Proxy End-point details updated. Proxy Endpoint name = ' + endpointRow.display_name,
                    query: `Endpoint.update({ display_name: '${display_name}' }, { where: { endpoint_id: ${_endpoint_id} }})`,
                    date_time: db.get_ist_current_date(),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }

            return res.status(200).json(success(true, res.statusCode, "Proxy End-Point details saved successfully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to save, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const product_pages_set = async (req, res, next) => {
    const { page_id, product_id, menu_name, show_helpful_box, show_api_method, page_contents, show_page_header_nav, sort_order } = req.body;
    const { ProductPages } = db.models;
    try {
        let _page_id = page_id && validator.isNumeric(page_id.toString()) ? parseInt(page_id) : 0;
        let _product_id = product_id && validator.isNumeric(product_id.toString()) ? parseInt(product_id) : 0;
        let _sort_order = sort_order && validator.isNumeric(sort_order.toString()) ? parseInt(sort_order) : 0;
        if (!menu_name || menu_name.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter Menu name.", null));
        }

        const existingPage = await ProductPages.findOne({
            where: { page_id: { [Op.ne]: _page_id }, product_id: _product_id, menu_name: menu_name.trim(), is_deleted: false },
            attributes: ['product_id', 'page_id'],
            raw: true
        });
        if (existingPage) {
            return res.status(200).json(success(false, API_STATUS.ALREADY_EXISTS.value, "Menu name is already exists.", null));
        }

        if (_page_id > 0 && _product_id > 0) {
            const pageRow = await ProductPages.findOne({
                where: { page_id: _page_id, is_deleted: false },
                attributes: ['product_id', 'page_id', 'menu_name'],
                raw: true
            });
            if (!pageRow) {
                return res.status(200).json(success(false, res.statusCode, "Product Pages details not found, Please try again.", null));
            }
            if (show_api_method && show_api_method == true) {
                const apiMethodPage = await ProductPages.findOne({
                    where: { page_id: { [Op.ne]: _page_id }, product_id: _product_id, show_api_method: true, is_deleted: false },
                    attributes: ['menu_name', 'show_api_method'],
                    raw: true
                });
                if (apiMethodPage) {
                    return res.status(200).json(success(false, API_STATUS.ALREADY_EXISTS.value, "You can add only one api reference page. You have added in menu : \"" + apiMethodPage.menu_name + "\"", null));
                }
            }
            const [affectedRows] = await ProductPages.update(
                {
                    menu_name: menu_name.trim(),
                    show_helpful_box: show_helpful_box,
                    show_api_method: show_api_method,
                    page_contents: page_contents,
                    modify_by: req.token_data.account_id,
                    modify_date: db.get_ist_current_date(),
                    show_page_header_nav: show_page_header_nav,
                    sort_order: _sort_order
                },
                { where: { page_id: _page_id } }
            );
            if (affectedRows > 0) {
                try {
                    let data_to_log = {
                        correlation_id: correlator.getId(),
                        token_id: req.token_data.token_id,
                        account_id: req.token_data.account_id,
                        user_type: 1,
                        user_id: req.token_data.admin_id,
                        narration: 'API product updated. Product Menu name: ' + (pageRow.menu_name == menu_name ? menu_name : pageRow.menu_name + ' to ' + menu_name),
                        query: `ProductPages.update({ menu_name: '${menu_name}' }, { where: { page_id: ${_page_id} }})`,
                        date_time: db.get_ist_current_date(),
                    }
                    action_logger.info(JSON.stringify(data_to_log));
                } catch (_) { }

                return res.status(200).json(success(true, res.statusCode, "Updated successfully.", null));
            } else {
                return res.status(200).json(success(false, res.statusCode, "Unable to update, Please try again", null));
            }
        } else {
            if (show_api_method && show_api_method == true) {
                const apiMethodPage = await ProductPages.findOne({
                    where: { product_id: _product_id, show_api_method: true, is_deleted: false },
                    attributes: ['menu_name'],
                    raw: true
                });
                if (apiMethodPage) {
                    return res.status(200).json(success(false, API_STATUS.ALREADY_EXISTS.value, "You can add only one api reference page. You have added in menu : \"" + apiMethodPage.menu_name + "\"", null));
                }
            }

            const newPage = await ProductPages.create({
                product_id: _product_id,
                menu_name: menu_name,
                show_helpful_box: show_helpful_box,
                show_api_method: show_api_method,
                page_contents: page_contents,
                added_by: req.token_data.account_id,
                added_date: db.get_ist_current_date(),
                is_published: true,
                show_page_header_nav: show_page_header_nav,
                sort_order: _sort_order
            });
            const new_page_id = newPage?.page_id ?? 0;
            if (new_page_id > 0) {
                try {
                    let data_to_log = {
                        correlation_id: correlator.getId(),
                        token_id: req.token_data.token_id,
                        account_id: req.token_data.account_id,
                        user_type: 1,
                        user_id: req.token_data.admin_id,
                        narration: 'New product pages added. Product Menu name: ' + menu_name,
                        query: `ProductPages.create({ menu_name: '${menu_name}' })`,
                        date_time: db.get_ist_current_date(),
                    }
                    action_logger.info(JSON.stringify(data_to_log));
                } catch (_) { }

                return res.status(200).json(success(true, res.statusCode, "Added Successfully.", null));
            } else {
                return res.status(200).json(success(false, res.statusCode, "Unable to save, Please try again", null));
            }
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const product_pages_publish_toggle = async (req, res, next) => {
    const { page_id } = req.body;
    const { ProductPages } = db.models;
    try {
        let _page_id = page_id && validator.isNumeric(page_id.toString()) ? parseInt(page_id) : 0;

        const pageRow = await ProductPages.findOne({
            where: { page_id: _page_id },
            attributes: ['page_id', 'product_id', 'menu_name', 'is_published'],
            raw: true
        });
        if (!pageRow) {
            return res.status(200).json(success(false, res.statusCode, "Product Menu details not found, Please try again.", null));
        }

        const newPublishedStatus = !pageRow.is_published;
        const [affectedRows] = await ProductPages.update(
            {
                is_published: newPublishedStatus,
                modify_date: db.get_ist_current_date(),
                modify_by: req.token_data.account_id
            },
            { where: { page_id: _page_id } }
        );
        if (affectedRows > 0) {
            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: 'Product Menu ' + (pageRow.is_published == true ? 'unpublish' : 'publish') + '. Product Menu name = ' + pageRow.menu_name,
                    query: `ProductPages.update({ is_published: ${newPublishedStatus} }, { where: { page_id: ${_page_id} }})`,
                    date_time: db.get_ist_current_date(),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }

            return res.status(200).json(success(true, res.statusCode, "Status changed successfully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to change status, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const product_pages_menu_delete = async (req, res, next) => {
    const { page_id } = req.body;
    const { ProductPages } = db.models;
    try {
        let _page_id = page_id && validator.isNumeric(page_id.toString()) ? parseInt(page_id) : 0;
        const pageRow = await ProductPages.findOne({
            where: { page_id: _page_id, is_deleted: false },
            attributes: ['page_id', 'product_id', 'menu_name', 'is_integration_page'],
            raw: true
        });
        if (!pageRow) {
            return res.status(200).json(success(false, res.statusCode, "Menu details not found.", null));
        }
        if (pageRow.is_integration_page && pageRow.is_integration_page == true) {
            return res.status(200).json(success(false, res.statusCode, "Integration Page can not be deleted", null));
        }

        const [affectedRows] = await ProductPages.update(
            {
                is_deleted: true,
                modify_date: db.get_ist_current_date(),
                modify_by: req.token_data.account_id
            },
            { where: { page_id: _page_id } }
        );
        if (affectedRows > 0) {
            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: 'Product Menu deleted. Menu name = ' + pageRow.menu_name,
                    query: `ProductPages.update({ is_deleted: true }, { where: { page_id: ${_page_id} }})`,
                    date_time: db.get_ist_current_date(),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }

            return res.status(200).json(success(true, res.statusCode, "Menu deleted successfully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to delete Menu, please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
}

const proxy_schema_set = async (req, res, next) => {
    const { schema_id, endpoint_id, status_code, req_json, res_json } = req.body;
    let { res_schema, req_schema } = req.body;
    const { Endpoint, Proxies, ProxySchema } = db.models;
    try {
        let _schema_id = schema_id && validator.isNumeric(schema_id.toString()) ? parseInt(schema_id) : 0;
        let _endpoint_id = endpoint_id && validator.isNumeric(endpoint_id.toString()) ? parseInt(endpoint_id) : 0;
        let _proxy_id = 0; let _product_id = 0;

        if (!status_code || status_code.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please select status code.", null));
        }

        if (!req_json || req_json.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter request sample json.", null));
        }
        if (!res_json || res_json.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter response sample json.", null));
        }
        try {
            if (!res_schema || res_schema.length <= 0) {
                const _res_json = JSON.parse(res_json);
                const _res_schema = generateSchema.json('res_schema', _res_json);
                delete _res_schema.title;
                res_schema = JSON.stringify(_res_schema);
            }
            if (!req_schema || req_schema.length <= 0) {
                const _req_json = JSON.parse(req_schema);
                const _req_schema = generateSchema.json('req_schema', _req_json);
                delete _req_schema.title;
                req_schema = JSON.stringify(_req_schema);
            }
        } catch (_) { }

        const endpointRow = await Endpoint.findOne({
            where: { endpoint_id: _endpoint_id, is_deleted: false },
            attributes: ['proxy_id', 'product_id'],
            raw: true
        });
        if (endpointRow) {
            _proxy_id = endpointRow.proxy_id; _product_id = endpointRow.product_id;
            if (_product_id && _product_id <= 0 && _proxy_id > 0) {
                const proxyRow = await Proxies.findOne({
                    where: { proxy_id: _proxy_id, is_deleted: false },
                    attributes: ['proxy_id', 'product_id'],
                    raw: true
                });
                if (proxyRow) {
                    _product_id = proxyRow.product_id;
                }
            }
            if (_schema_id > 0) {
                const schemaRow = await ProxySchema.findOne({
                    where: { schema_id: _schema_id, is_deleted: false },
                    attributes: ['schema_id', 'endpoint_id', 'proxy_id', 'product_id', 'status_code'],
                    raw: true
                });
                if (!schemaRow) {
                    return res.status(200).json(success(false, res.statusCode, "schema details not found, Please try again.", null));
                }
                const [affectedRows] = await ProxySchema.update(
                    {
                        status_code: status_code,
                        req_schema: req_schema,
                        req_json: req_json,
                        res_schema: res_schema,
                        res_json: res_json,
                        modify_by: req.token_data.account_id,
                        modify_date: db.get_ist_current_date(),
                        req_schema_updated: false,
                        res_schema_updated: false
                    },
                    { where: { schema_id: _schema_id } }
                );
                if (affectedRows > 0) {
                    try {
                        let data_to_log = {
                            correlation_id: correlator.getId(),
                            token_id: req.token_data.token_id,
                            account_id: req.token_data.account_id,
                            user_type: 1,
                            user_id: req.token_data.admin_id,
                            narration: 'API Proxy schema updated. Proxy Status Code: ' + (schemaRow.status_code == status_code ? status_code : schemaRow.status_code + ' to ' + status_code),
                            query: `ProxySchema.update({ status_code: '${status_code}' }, { where: { schema_id: ${_schema_id} }})`,
                            date_time: db.get_ist_current_date(),
                        }
                        action_logger.info(JSON.stringify(data_to_log));
                    } catch (_) { }

                    return res.status(200).json(success(true, res.statusCode, "Updated successfully.", null));
                } else {
                    return res.status(200).json(success(false, res.statusCode, "Unable to update, Please try again", null));
                }
            } else {
                const newSchema = await ProxySchema.create({
                    endpoint_id: _endpoint_id,
                    proxy_id: _proxy_id,
                    product_id: _product_id,
                    status_code: status_code,
                    req_schema: req_schema,
                    req_json: req_json,
                    res_schema: res_schema,
                    res_json: res_json,
                    is_enabled: true,
                    is_deleted: false,
                    added_by: req.token_data.account_id,
                    added_date: db.get_ist_current_date(),
                    req_schema_updated: true,
                    res_schema_updated: true
                });
                const new_schema_id = newSchema?.schema_id ?? 0;
                if (new_schema_id > 0) {
                    try {
                        let data_to_log = {
                            correlation_id: correlator.getId(),
                            token_id: req.token_data.token_id,
                            account_id: req.token_data.account_id,
                            user_type: 1,
                            user_id: req.token_data.admin_id,
                            narration: 'New Proxy Schema added. Schema Status Code: ' + status_code,
                            query: `ProxySchema.create({ status_code: '${status_code}' })`,
                            date_time: db.get_ist_current_date(),
                        }
                        action_logger.info(JSON.stringify(data_to_log));
                    } catch (_) { }

                    return res.status(200).json(success(true, res.statusCode, "Added Successfully.", null));
                } else {
                    return res.status(200).json(success(false, res.statusCode, "Unable to save, Please try again", null));
                }
            }
        } else {
            return res.status(200).json(success(false, res.statusCode, "Api not found, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const proxy_schema_list = async (req, res, next) => {
    const { endpoint_id } = req.body;
    const { Endpoint, Proxies, ProxySchema } = db.models;
    try {
        let _endpoint_id = endpoint_id && validator.isNumeric(endpoint_id.toString()) ? parseInt(endpoint_id) : 0;

        const endpointRow = await Endpoint.findOne({
            where: { endpoint_id: _endpoint_id },
            include: [{
                model: Proxies,
                as: 'proxy',
                attributes: ['proxy_name', 'product_id']
            }],
            attributes: ['product_id', 'endpoint_url', 'display_name', 'path_params', 'header_param', 'request_schema', 'request_sample', 'updated_endpoint'],
            raw: true,
            nest: true
        });
        if (!endpointRow) {
            return res.status(200).json(success(false, res.statusCode, "Proxy Schema details not found, Please try again.", null));
        }

        const schemas = await ProxySchema.findAll({
            where: { is_deleted: false, endpoint_id: _endpoint_id },
            order: [['schema_id', 'DESC']],
            raw: true
        });

        const list = schemas.map((item, index) => ({
            sr_no: index + 1,
            schema_id: item.schema_id,
            endpoint_id: item.endpoint_id,
            proxy_id: item.proxy_id,
            product_id: item.product_id,
            status_code: item.status_code,
            header_json: item.header_json,
            req_schema: item.req_schema,
            req_json: item.req_json,
            res_schema: item.res_schema,
            res_json: item.res_json,
            is_enabled: item.is_enabled,
            path_params: item.path_params,
            added_date: item.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.added_date)) : "",
            modify_date: item.modify_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.modify_date)) : "",
        }));

        const results = {
            product_id: endpointRow.product_id || endpointRow.proxy?.product_id,
            endpoint_url: endpointRow.endpoint_url,
            display_name: endpointRow.display_name,
            proxy_name: endpointRow.proxy?.proxy_name,
            path_params: endpointRow.path_params,
            header_param: endpointRow.header_param,
            request_schema: endpointRow.request_schema,
            request_sample: endpointRow.request_sample,
            updated_endpoint: endpointRow.updated_endpoint,
            status_code_list: Constants.status_code,
            data: list,
        };
        return res.status(200).json(success(true, res.statusCode, "Proxy schema data.", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const proxy_schema_delete = async (req, res, next) => {
    const { schema_id } = req.body;
    const { ProxySchema } = db.models;
    try {
        let _schema_id = schema_id && validator.isNumeric(schema_id.toString()) ? parseInt(schema_id) : 0;
        const schemaRow = await ProxySchema.findOne({
            where: { schema_id: _schema_id, is_deleted: false },
            attributes: ['schema_id', 'endpoint_id', 'proxy_id', 'status_code'],
            raw: true
        });
        if (!schemaRow) {
            return res.status(200).json(success(false, res.statusCode, "Api schema details not found, Please try again.", null));
        }

        const [affectedRows] = await ProxySchema.update(
            {
                is_deleted: true,
                deleted_date: db.get_ist_current_date(),
                deleted_by: req.token_data.account_id
            },
            { where: { schema_id: _schema_id } }
        );
        if (affectedRows > 0) {
            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: 'Api schema deleted. Schema Status Code = ' + schemaRow.status_code,
                    query: `ProxySchema.update({ is_deleted: true }, { where: { schema_id: ${_schema_id} }})`,
                    date_time: db.get_ist_current_date(),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }

            return res.status(200).json(success(true, res.statusCode, "Schema deleted successfully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to delete Schema, please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
}

const proxy_schema_toggle = async (req, res, next) => {
    const { schema_id } = req.body;
    const { ProxySchema } = db.models;
    try {
        let _schema_id = schema_id && validator.isNumeric(schema_id.toString()) ? parseInt(schema_id) : 0;

        const schemaRow = await ProxySchema.findOne({
            where: { schema_id: _schema_id, is_deleted: false },
            attributes: ['schema_id', 'endpoint_id', 'is_enabled', 'proxy_id', 'status_code'],
            raw: true
        });
        if (!schemaRow) {
            return res.status(200).json(success(false, res.statusCode, "schema details not found, Please try again.", null));
        }

        const newEnabledStatus = !schemaRow.is_enabled;
        const [affectedRows] = await ProxySchema.update(
            {
                is_enabled: newEnabledStatus,
                modify_date: db.get_ist_current_date(),
                modify_by: req.token_data.account_id
            },
            { where: { schema_id: _schema_id } }
        );
        if (affectedRows > 0) {
            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: 'Api schema ' + (schemaRow.is_enabled == true ? 'disabled' : 'enabled') + '.  Api Schema status code = ' + schemaRow.status_code,
                    query: `ProxySchema.update({ is_enabled: ${newEnabledStatus} }, { where: { schema_id: ${_schema_id} }})`,
                    date_time: db.get_ist_current_date(),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }

            return res.status(200).json(success(true, res.statusCode, "Status changed successfully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to change status, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const endpoint_field_update = async (req, res, next) => {
    const { endpoint_id, type_id, value_1, value_2 } = req.body;
    const { Endpoint, Proxies } = db.models;
    try {
        let _endpoint_id = endpoint_id && validator.isNumeric(endpoint_id.toString()) ? parseInt(endpoint_id) : 0;

        const endpointRow = await Endpoint.findOne({
            where: { endpoint_id: _endpoint_id, is_deleted: false },
            include: [{
                model: Proxies,
                as: 'proxy',
                required: true,
                where: { is_deleted: false },
                attributes: []
            }],
            attributes: ['endpoint_id']
        });
        if (!endpointRow) {
            return res.status(200).json(success(false, res.statusCode, "Proxy endpoind details not found, Please try again.", null));
        }
        if (type_id && type_id.length > 0) {
            let updateData = {};
            let ri = 0; let ret_msg = '';
            switch (type_id) {
                case 'updated_endpoint':
                    updateData = { updated_endpoint: value_1, modify_by: req.token_data.account_id, modify_date: db.get_ist_current_date() };
                    break;
                case 'path_params':
                    updateData = { path_params: value_1, modify_by: req.token_data.account_id, modify_date: db.get_ist_current_date() };
                    break;
                case 'header_param':
                    updateData = { header_param: value_1, modify_by: req.token_data.account_id, modify_date: db.get_ist_current_date() };
                    break;
                case 'request_schema_sample':
                    updateData = { request_schema: value_1, request_sample: value_2, modify_by: req.token_data.account_id, modify_date: db.get_ist_current_date() };
                    break;
                default:
                    ri = -1;
                    break;
            }
            if (ri !== -1) {
                const [affectedRows] = await Endpoint.update(updateData, { where: { endpoint_id: _endpoint_id } });
                ri = affectedRows;
            }
            if (ri > 0) {
                return res.status(200).json(success(true, res.statusCode, "Saved successfully.", null));
            } else if (ri == -1) {
                return res.status(200).json(success(false, res.statusCode, "Invalid field type, Please try again.", null));
            } else if (ri == -2) {
                return res.status(200).json(success(false, res.statusCode, ret_msg, null));
            } else {
                return res.status(200).json(success(false, res.statusCode, "Unable to update, Please try again.", null));
            }
        } else {
            return res.status(200).json(success(false, res.statusCode, "Invalid field type, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};


const proxy_endpoint_publish_api_product = async (req, res, next) => {
    const { endpoint_id } = req.body;
    const { Endpoint } = db.models;
    try {
        let _endpoint_id = endpoint_id && validator.isNumeric(endpoint_id.toString()) ? parseInt(endpoint_id) : 0;

        const endpointRow = await Endpoint.findOne({
            where: { endpoint_id: _endpoint_id },
            attributes: ['endpoint_url', 'display_name', 'is_product_published'],
            raw: true
        });
        if (!endpointRow) {
            return res.status(200).json(success(false, res.statusCode, "Proxy End-points details not found, Please try again.", null));
        }

        const newPublishedStatus = !endpointRow.is_product_published;
        const [affectedRows] = await Endpoint.update(
            {
                is_product_published: newPublishedStatus,
                modify_date: db.get_ist_current_date(),
                modify_by: req.token_data.account_id
            },
            { where: { endpoint_id: _endpoint_id } }
        );
        if (affectedRows > 0) {
            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: 'Proxy End-points Api Product ' + (endpointRow.is_product_published == true ? 'unpublish' : 'publish') + '. Proxy End-point name = ' + endpointRow.display_name,
                    query: `Endpoint.update({ is_product_published: ${newPublishedStatus} }, { where: { endpoint_id: ${_endpoint_id} }})`,
                    date_time: db.get_ist_current_date(),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }

            return res.status(200).json(success(true, res.statusCode, "Status changed successfully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to change status, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const products_publish_api_product = async (req, res, next) => {
    const { product_id } = req.body;
    const { Product } = db.models;
    try {
        let _product_id = product_id && validator.isNumeric(product_id.toString()) ? parseInt(product_id) : 0;

        const productRow = await Product.findOne({
            where: { product_id: _product_id, is_deleted: false },
            attributes: ['product_id', 'is_product_published', 'product_name'],
            raw: true
        });
        if (!productRow) {
            return res.status(200).json(success(false, res.statusCode, "Product details not found, Please try again.", null));
        }
        const newPublishedStatus = !productRow.is_product_published;
        const [affectedRows] = await Product.update(
            {
                is_product_published: newPublishedStatus,
                modify_date: db.get_ist_current_date(),
                modify_by: req.token_data.account_id
            },
            { where: { product_id: _product_id } }
        );
        if (affectedRows > 0) {
            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: 'API Product ' + (productRow.is_product_published == true ? 'unpublish' : 'publish') + ' from website. Product name = ' + productRow.product_name,
                    query: `Product.update({ is_product_published: ${newPublishedStatus} }, { where: { product_id: ${_product_id} }})`,
                    date_time: db.get_ist_current_date(),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }
            return res.status(200).json(success(true, res.statusCode, "Product status change successfully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to change, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const manual_endpoint_set = async (req, res, next) => {
    const { product_id, endpoint_id, proxy_id, display_name, redirect_url, description, sort_order } = req.body;
    try {
        let _product_id = product_id && validator.isNumeric(product_id.toString()) ? parseInt(product_id) : 0;
        let _proxy_id = proxy_id && validator.isNumeric(proxy_id.toString()) ? parseInt(proxy_id) : 0;
        let _endpoint_id = endpoint_id && validator.isNumeric(endpoint_id.toString()) ? parseInt(endpoint_id) : 0;
        let _sort_order = sort_order && validator.isNumeric(sort_order.toString()) ? parseInt(sort_order) : 0;
        if (!display_name || display_name.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter endpoint name.", null));
        }
        // const _query1 = `SELECT endpoint_id FROM endpoint WHERE endpoint_id <> ? AND display_name = ? AND is_deleted = false`;
        // const row1 = await db.sequelize.query(_query1, { replacements: [_endpoint_id, display_name], type: QueryTypes.SELECT });
        // if (row1 && row1.length > 0) {
        //     return res.status(200).json(success(false, API_STATUS.ALREADY_EXISTS.value, "endpoint name is already exists.", null));
        // }
        if (_endpoint_id > 0) {
            const _query3 = `SELECT endpoint_id, is_manual, display_name FROM endpoint WHERE endpoint_id = ? AND is_deleted = false AND is_manual = true`;
            const row3 = await db.sequelize.query(_query3, { replacements: [_endpoint_id], type: QueryTypes.SELECT });
            if (!row3 && row3.length <= 0) {
                return res.status(200).json(success(false, res.statusCode, "endpoints details not found, Please try again.", null));
            }
            const is_manual = row3[0].is_manual && row3[0].is_manual == true ? true : false;
            if (!is_manual) {
                return res.status(200).json(success(false, res.statusCode, "Only manually added endpoint can be edited.", null));
            }
            const _query2 = `UPDATE endpoint SET display_name = ?, redirect_url = ?,  modify_by = ?,  modify_date = ? description = ? , _sort_order = ? WHERE endpoint_id = ?`;
            const _replacements2 = [display_name, redirect_url, req.token_data.account_id, db.get_ist_current_date(), description, _sort_order, _endpoint_id];
            const [, i] = await db.sequelize.query(_query2, { replacements: _replacements2, type: QueryTypes.UPDATE });
            if (i > 0) {
                try {
                    let data_to_log = {
                        correlation_id: correlator.getId(),
                        token_id: req.token_data.token_id,
                        account_id: req.token_data.account_id,
                        user_type: 1,
                        user_id: req.token_data.admin_id,
                        narration: 'API product updated. Endpoint name: ' + (row3[0].display_name == display_name ? display_name : row3[0].display_name + ' to ' + display_name),
                        query: db.buildQuery_Array(_query2, _replacements2),
                        date_time: db.get_ist_current_date(),
                    }
                    action_logger.info(JSON.stringify(data_to_log));
                } catch (_) { }

                return res.status(200).json(success(true, res.statusCode, "Updated successfully.", null));
            } else {
                return res.status(200).json(success(false, res.statusCode, "Unable to update, Please try again", null));
            }
        } else {
            const _query2 = `INSERT INTO endpoint(product_id, proxy_id, display_name, redirect_url, added_by, added_date, is_manual, description, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING "endpoint_id"`;
            const _replacements2 = [_product_id, _proxy_id, display_name, redirect_url, req.token_data.account_id, db.get_ist_current_date(), true, description, _sort_order];
            const [rowOut] = await db.sequelize.query(_query2, { replacements: _replacements2, type: QueryTypes.INSERT, });
            const endpoint_id = rowOut && rowOut.length > 0 && rowOut[0] ? rowOut[0].endpoint_id : 0;
            if (endpoint_id > 0) {

                try {
                    let data_to_log = {
                        correlation_id: correlator.getId(),
                        token_id: req.token_data.token_id,
                        account_id: req.token_data.account_id,
                        user_type: 1,
                        user_id: req.token_data.admin_id,
                        narration: 'New product added. Endpoint name: ' + display_name,
                        query: db.buildQuery_Array(_query2, _replacements2),
                        date_time: db.get_ist_current_date(),
                    }
                    action_logger.info(JSON.stringify(data_to_log));
                } catch (_) { }

                return res.status(200).json(success(true, res.statusCode, "Added Successfully.", null));
            } else {
                return res.status(200).json(success(false, res.statusCode, "Unable to save, Please try again", null));
            }
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};


const proxy_endpoint_details_updatess = async (req, res, next) => {
    const { endpoint_id, display_name, description, sort_order, redirect_url } = req.body;
    try {
        res.on('finish', () => {
            db.delete_uploaded_files(req);
        });
        let _endpoint_id = endpoint_id && validator.isNumeric(endpoint_id.toString()) ? parseInt(endpoint_id) : 0;
        let _sort_order = sort_order && validator.isNumeric(sort_order.toString()) ? parseInt(sort_order) : 0;

        if (!display_name || display_name.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter display name.", null));
        }
        // if (!description || description.length <= 0) {
        //     return res.status(200).json(success(false, res.statusCode, "Please enter description.", null));
        // }

        const _query18 = `SELECT endpoint_url, display_name, is_published FROM endpoint WHERE endpoint_id = ?`;
        const row18 = await db.sequelize.query(_query18, { replacements: [_endpoint_id], type: QueryTypes.SELECT, });
        if (!row18 || row18.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Proxy End-points details not found, Please try again.", null));
        }

        let icon_res = ""; let product_iconFilename = "";
        if (req.files['product_icon'] && req.files['product_icon'].length > 0) {
            const fi = req.files['product_icon'][0];
            icon_res = await cloudStorage.UploadFile(fi.path, 'product_icon/' + fi.filename, true);
            product_iconFilename = `${process.env.BUCKET_URL}/${icon_res.bucket}/${icon_res.name}`;
        }

        let spec_res = ""; let product_open_specname = "";
        if (req.files['product_open_spec'] && req.files['product_open_spec'].length > 0) {
            const fi = req.files['product_open_spec'][0];
            spec_res = await cloudStorage.UploadFile(fi.path, 'product_data/' + fi.filename, true);
            product_open_specname = `${process.env.BUCKET_URL}/${spec_res.bucket}/${spec_res.name}`;
        }

        let json_res = ""; let product_open_api_json = "";
        if (req.files['product_open_spec_json'] && req.files['product_open_spec_json'].length > 0) {
            const fi_json = req.files['product_open_spec_json'][0];
            json_res = await cloudStorage.UploadFile(fi_json.path, 'product_data/' + fi_json.filename, true);
            product_open_api_json = `${process.env.BUCKET_URL}/${json_res.bucket}/${json_res.name}`;
        }

        let pdf_res = ""; let product_documentation_pdf_name = "";
        if (req.files['product_documentation_pdf'] && req.files['product_documentation_pdf'].length > 0) {
            const fi_pdf = req.files['product_documentation_pdf'][0];
            pdf_res = await cloudStorage.UploadFile(fi_pdf.path, 'product_data/' + fi_pdf.filename, true);
            product_documentation_pdf_name = `${process.env.BUCKET_URL}/${pdf_res.bucket}/${pdf_res.name}`;
        }

        const _query2 = `UPDATE endpoint SET display_name = :display_name, description = :description, redirect_url = :redirect_url, sort_order= :sort_order,
        endpoint_icon = CASE WHEN LENGTH(:product_icon) > 0 THEN :product_icon ELSE endpoint_icon END,
        product_open_spec_yaml = CASE WHEN LENGTH(:product_api_yaml) > 0 THEN :product_api_yaml ELSE product_open_spec_yaml END
        product_open_spec_json = CASE WHEN LENGTH(:product_api_json) > 0 THEN :product_api_json ELSE product_open_spec_json END
        product_open_spec_pdf = CASE WHEN LENGTH(:product_doc_pdf) > 0 THEN :product_doc_pdf ELSE product_open_spec_pdf END
        modify_by = :modify_by, modify_date = :modify_date WHERE endpoint_id = :endpoint_id`;
        const _replacements2 = {
            display_name: display_name,
            description: description,
            redirect_url: redirect_url,
            sort_order: _sort_order,
            product_icon: product_iconFilename,
            product_api_yaml: product_open_specname,
            product_api_json: product_open_api_json,
            product_doc_pdf: product_documentation_pdf_name,
            modify_by: req.token_data.account_id,
            modify_date: db.get_ist_current_date(),
            endpoint_id: _endpoint_id,
        };
        const [, i] = await db.sequelize.query(_query2, { replacements: _replacements2, type: QueryTypes.UPDATE });
        if (i > 0) {

            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: 'Proxy End-point details updated. Proxy Endpoint name = ' + row18[0].display_name,
                    query: db.buildQuery_Array(_query2, _replacements2),
                    date_time: db.get_ist_current_date(),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }

            return res.status(200).json(success(true, res.statusCode, "Proxy End-Point details saved successfully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to save, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};


const products_routing_set = async (req, res, next) => {
    const { product_id } = req.body;
    try {
        let _product_id = product_id && validator.isNumeric(product_id.toString()) ? parseInt(product_id) : 0;

        const _query1 = `SELECT product_id, is_routing_applicable, product_name FROM product WHERE product_id = ? AND is_deleted = false`;
        const row1 = await db.sequelize.query(_query1, { replacements: [_product_id], type: QueryTypes.SELECT, });
        if (!row1 || row1.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Product details not found, Please try again.", null));
        }
        const _query2 = `UPDATE product SET is_routing_applicable = CASE WHEN is_routing_applicable = true THEN false ELSE true END, modify_date = ?, modify_by = ? WHERE product_id = ?`;
        const _replacements2 = [db.get_ist_current_date(), req.token_data.account_id, _product_id];
        const [, i] = await db.sequelize.query(_query2, { replacements: _replacements2, type: QueryTypes.UPDATE, });
        if (i > 0) {
            try {
                let data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: 'API Product Set for Routing ' + (row1[0].is_product_published == true ? 'Routing Applicable' : 'Not Applicable') + row1[0].product_name,
                    query: db.buildQuery_Array(_query2, _replacements2),
                    date_time: db.get_ist_current_date(),
                }
                action_logger.info(JSON.stringify(data_to_log));
            } catch (_) { }
            return res.status(200).json(success(true, res.statusCode, "Product status change successfully.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Unable to change, Please try again.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};


const product_apigee_rate_add = async (req, res, next) => {
    const { product_id, product_rate_value } = req.body;
    try {
        let _product_id = product_id && validator.isNumeric(product_id.toString()) ? parseInt(product_id) : 0;
        if (!product_rate_value || product_rate_value.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter product rate value.", null));
        }

        const _query1 = `SELECT product_id, product_name FROM product WHERE product_id = ? AND is_deleted = false`;
        const row1 = await db.sequelize.query(_query1, { replacements: [_product_id], type: QueryTypes.SELECT });
        if (!row1 || row1.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Product details not found.ss", null));
        }
        const product_name = row1[0].product_name;
        if (product_name && product_name.length > 0) {
            const data = {
                attribute: [
                    {
                        name: "rateMultiper-" + product_name,
                        value: product_rate_value,
                    },
                ],
            };

            const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/apiproducts/${product_name}/attributes`;
            const apigeeAuth = await db.get_apigee_token();
            const response = await fetch(product_URL, {
                method: "POST",
                headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json", },
                body: JSON.stringify(data),
            });
            const responseData = await response.json();
            if (responseData) {
                const rate_plan_response = JSON.stringify(responseData);

                const _query2 = `UPDATE product SET rate_plan_value = ?, rate_plan_added_by = ?, rate_added_date = ?,  rate_plan_json_data = ?, WHERE product_id = ?`;
                const _replacements2 = [product_rate_value, req.token_data.account_id, db.get_ist_current_date(), rate_plan_response, _product_id];
                const [, i] = await db.sequelize.query(_query2, { replacements: _replacements2, type: QueryTypes.UPDATE });
                if (i > 0) {
                    try {
                        let data_to_log = {
                            correlation_id: correlator.getId(),
                            token_id: req.token_data.token_id,
                            account_id: req.token_data.account_id,
                            user_type: 1,
                            user_id: req.token_data.admin_id,
                            narration: 'Product Rate added  Product name = ' + row1[0].product_name + ', Product Value = ' + product_rate_value,
                            query: db.buildQuery_Array(_query2, _replacements2),
                        }
                        action_logger.info(JSON.stringify(data_to_log));
                    } catch (_) { console.log("---catch----------"); }

                    return res.status(200).json(success(true, res.statusCode, "Product Rate Added successfully.", null));
                } else {
                    return res.status(200).json(success(false, res.statusCode, "Unable to Add Rate, Please try again.", null));
                }
            }
            else if ((responseData?.error?.status === 'ABORTED' && responseData?.error?.code === 409) || responseData?.error?.message?.length > 0) {
                return res.status(200).json(success(false, res.statusCode, `Apigee response : ${responseData?.error?.message ?? 'Unknown error'}`, null));
            }

            return res.status(200).json(success(false, res.statusCode, "Unable to Add Rate, Please try again.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Product details not found.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const dropdown_products = async (req, res, next) => {
    const { Product } = db.models;
    try {
        const rows = await Product.findAll({
            where: { is_published: true },
            attributes: ['product_id', 'product_name'],
            raw: true
        });

        const list = rows.map(item => ({
            product_id: item.product_id,
            product_name: item.product_name,
        }));

        return res.status(200).json(success(true, res.statusCode, "All product list", list));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const apigee_product_rate_add = async (req, res, next) => {
    const { product_id } = req.body;

    try {
        let _product_id = product_id && validator.isNumeric(product_id.toString()) ? parseInt(product_id) : 0;
        if (!product_rate_value || product_rate_value.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter product rate value.", null));
        }

        const _query1 = `SELECT product_id, product_name FROM product WHERE product_id = ? AND is_deleted = false`;
        const row1 = await db.sequelize.query(_query1, { replacements: [_product_id], type: QueryTypes.SELECT });
        if (!row1 || row1.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Product details not found.ss", null));
        }
        const product_name = row1[0].product_name;
        if (product_name && product_name.length > 0) {
            const data = {
                attribute: [
                    {
                        name: "rateMultiper-" + product_name,
                        value: product_rate_value,
                    },
                ],
            };

            const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/apiproducts/${product_name}/attributes`;
            const apigeeAuth = await db.get_apigee_token();
            const response = await fetch(product_URL, {
                method: "POST",
                headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json", },
                body: JSON.stringify(data),
            });
            const responseData = await response.json();
            if (responseData) {
                const rate_plan_response = JSON.stringify(responseData);

                const _query2 = `UPDATE product SET rate_plan_value = ?, rate_plan_added_by = ?, rate_added_date = ?,  rate_plan_json_data = ?, WHERE product_id = ?`;
                const _replacements2 = [product_rate_value, req.token_data.account_id, db.get_ist_current_date(), rate_plan_response, _product_id];
                const [, i] = await db.sequelize.query(_query2, { replacements: _replacements2, type: QueryTypes.UPDATE });
                if (i > 0) {
                    try {
                        let data_to_log = {
                            correlation_id: correlator.getId(),
                            token_id: req.token_data.token_id,
                            account_id: req.token_data.account_id,
                            user_type: 1,
                            user_id: req.token_data.admin_id,
                            narration: 'Product Rate added  Product name = ' + row1[0].product_name + ', Product Value = ' + product_rate_value,
                            query: db.buildQuery_Array(_query2, _replacements2),
                        }
                        action_logger.info(JSON.stringify(data_to_log));
                    } catch (_) { console.log("---catch----------"); }

                    return res.status(200).json(success(true, res.statusCode, "Product Rate Added successfully.", null));
                } else {
                    return res.status(200).json(success(false, res.statusCode, "Unable to Add Rate, Please try again.", null));
                }
            }
            else if ((responseData?.error?.status === 'ABORTED' && responseData?.error?.code === 409) || responseData?.error?.message?.length > 0) {
                return res.status(200).json(success(false, res.statusCode, `Apigee response : ${responseData?.error?.message ?? 'Unknown error'}`, null));
            }

            return res.status(200).json(success(false, res.statusCode, "Unable to Add Rate, Please try again.", null));
        } else {
            return res.status(200).json(success(false, res.statusCode, "Product details not found.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};



export default {
    api_products_list,
    api_products_publish,
    api_products_update,
    product_get,
    proxy_description_set,
    proxy_publish_toggle,
    proxy_products_update,
    product_detail_update,
    product_page_text_update,
    product_url_check,
    product_image_delete,
    product_set_new,
    product_delete,
    proxy_endpoint_publish_toggle,
    proxy_endpoint_details_update,
    endpoint_field_update,
    product_pages_set,
    product_pages_publish_toggle,
    product_pages_menu_delete,
    proxy_schema_set,
    proxy_schema_list,
    proxy_schema_delete,
    proxy_schema_toggle,
    proxy_endpoint_publish_api_product,
    products_publish_api_product,
    manual_endpoint_set,
    products_routing_set,
    product_apigee_rate_add,
    dropdown_products,
    apigee_product_rate_add

};
