import { logger as _logger, action_logger } from "../../logger/winston.js";
import db from "../../database/db_helper.js";
import { success } from "../../model/responseModel.js";
import { Op } from "sequelize";
import dateFormat from "date-format";
import validator from "validator";
import { fetch } from 'cross-fetch';
import correlator from 'express-correlation-id';
import { API_STATUS } from "../../model/enumModel.js";
import commonModule from "../../modules/commonModule.js";

const product_monitization_rate_update = async (req, res, next) => {
    const { rate_id, product_id, displayName, description, one_time_setup_fee, fixedFeeFrequency, fixedRecurringFee, consumptionPricingType, consumptionPricingRates, start_type, start_time, expiry_type, expiry_time } = req.body;
    const { Product, ProductMonitazationRate } = db.models;
    try {
        const _rate_id = rate_id && validator.isNumeric(rate_id.toString()) ? parseInt(rate_id) : 0;
        const _product_id = product_id && validator.isNumeric(product_id.toString()) ? parseInt(product_id) : 0;
        const _one_time_setup_fee = one_time_setup_fee && validator.isNumeric(one_time_setup_fee.toString()) ? parseFloat(one_time_setup_fee) : 0;
        const _fixedFeeFrequency = fixedFeeFrequency && validator.isNumeric(fixedFeeFrequency.toString()) ? parseInt(fixedFeeFrequency) : 0;
        const _fixedRecurringFee = fixedRecurringFee && validator.isNumeric(fixedRecurringFee.toString()) ? parseFloat(fixedRecurringFee) : 0;
        const _start_type = start_type && validator.isNumeric(start_type.toString()) ? parseInt(start_type) : 1;//1 means Immediatley otherwise 2 future startTime date get
        const _expiry_type = expiry_type && validator.isNumeric(expiry_type.toString()) ? parseInt(expiry_type) : 1;//1 means Never 2 means Immediatley otherwise 3 future expiry_time get
        if (!displayName || displayName.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter display name.", null));
        }
        if (_start_type == 2 && !start_time) {
            return res.status(200).json(success(false, res.statusCode, "Please select Start Time.", null));
        }
        if (_expiry_type == 3 && !expiry_time) {
            return res.status(200).json(success(false, res.statusCode, "Please select Expiry Time.", null));
        }

        if (!description || description.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter description.", null));
        }

        if (!consumptionPricingType || consumptionPricingType.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please select consumption pricing type.", null));
        }

        const row1 = await Product.findOne({
            where: {
                product_id: _product_id,
                is_deleted: false
            },
            attributes: ['product_id', 'product_name']
        });

        if (!row1) {
            return res.status(200).json(success(false, res.statusCode, "Product details not found.", null));
        }
        const product_name = row1.product_name;
        const CurrentTime = Date.now();
        let s_time = new Date(start_time);
        let e_time = new Date(expiry_time);
        let _startTime = _start_type == 1 ? CurrentTime.toString() : s_time.getTime().toString();
        let _endTime = _expiry_type == 3 ? e_time.getTime().toString() : _expiry_type == 2 ? CurrentTime.toString() : 0;
        let state = 'PUBLISHED';
        let billingPeriod = 'MONTHLY';
        let currencyCode = 'INR';
        let consumptionPricingRates_new;
        if (consumptionPricingType === "FIXED_PER_UNIT") {
            let units = Math.floor(consumptionPricingRates); // Get the integer part
            let nanos = Math.round((consumptionPricingRates - units) * 1e9);
            consumptionPricingRates_new = [{
                fee: {
                    currencyCode: currencyCode,
                    nanos: nanos,
                    units: units || 0,
                },
                start: 0,
                end: 0,
            }]
        } else {
            if (!Array.isArray(consumptionPricingRates)) {
                return res.status(200).json(success(false, res.statusCode, "consumptionPricingRates must be an array", null));
            }
            const requiredFields = {
                fee: {
                    currencyCode: 'string',
                    nanos: 'number',
                    units: 'number'
                },
                start: 'number',
                end: 'number'
            };
            for (let i = 0; i < consumptionPricingRates.length; i++) {
                const rate = consumptionPricingRates[i];
                for (const key in requiredFields) {
                    if (!rate.hasOwnProperty(key)) {
                        return res.status(200).json(success(false, res.statusCode, `Missing field '${key}' in rate at index ${i}`, null));
                    }
                    if (typeof requiredFields[key] === 'object') {
                        for (const nestedKey in requiredFields[key]) {
                            if (!rate[key].hasOwnProperty(nestedKey) || typeof rate[key][nestedKey] !== requiredFields[key][nestedKey]) {
                                return res.status(200).json(success(false, res.statusCode, `Invalid or missing field '${nestedKey}' in fee object at index ${i}`, null));
                            }
                        }
                    } else if (typeof rate[key] !== requiredFields[key]) {
                        return res.status(200).json(success(false, res.statusCode, `Field '${key}' must be of type ${requiredFields[key]} at index ${i}`, null));
                    }
                }
            }
            consumptionPricingRates_new = consumptionPricingRates;
        }

        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);

        if (is_checker) {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have authority.", null));
        }
        let res_rate_name;
        let _activity_type;

        const row3 = await ProductMonitazationRate.findOne({
            where: {
                rate_id: _rate_id,
                is_deleted: false
            },
            attributes: ['rate_id', 'activity_type', 'res_rate_name']
        });

        if (row3) {
            _activity_type = row3.activity_type && validator.isNumeric(row3.activity_type.toString()) ? parseInt(row3.activity_type) : 0;
            res_rate_name = row3.res_rate_name || '';
        }
        console.log("re=================sssss: ", _rate_id);
        /******************************START Create Rate Monitization Rate*********************************/
        if (is_admin && _rate_id == 0) {
            console.log("=============admin new add====");

            const newRate = await ProductMonitazationRate.create({
                product_id: _product_id,
                added_date: db.get_ist_current_date(),
                added_by: req.token_data.account_id,
                product_name: product_name,
                apiproduct: product_name,
                display_name: displayName,
                description: description,
                billing_period: billingPeriod,
                currency_code: currencyCode,
                one_time_setup_fee: _one_time_setup_fee,
                fixed_fee_frequency: _fixedFeeFrequency,
                fixed_recurring_fee: _fixedRecurringFee,
                consumption_pricing_type: consumptionPricingType,
                consumption_pricing_rates: JSON.stringify(consumptionPricingRates_new),
                state: state,
                start_date_type: _start_type,
                start_date: start_time,
                expiry_date_type: _expiry_type,
                expiry_date: expiry_time,
                start_time: _startTime,
                end_time: _endTime
            });

            const rate_id = newRate?.rate_id ?? 0;
            const monitization_product_rate_data = {
                apiproduct: product_name,
                displayName: displayName,
                description: description || '',
                billingPeriod: billingPeriod || '',
                currencyCode: currencyCode,
                fixedFeeFrequency: _fixedFeeFrequency || 0,
                setup_fee: {
                    currencyCode: currencyCode,
                    units: _one_time_setup_fee || 0,
                    nanos: 0
                },
                fixedRecurringFee: {
                    currencyCode: currencyCode,
                    nanos: 0,
                    units: _fixedRecurringFee || 0,
                },
                consumptionPricingType: consumptionPricingType || '',
                consumptionPricingRates: consumptionPricingRates_new,
                startTime: _startTime,
                endTime: _endTime,
                state: state,
            };
            console.log("resssss", monitization_product_rate_data);

            const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/apiproducts/${product_name}/rateplans`;
            const apigeeAuth = await db.get_apigee_token();
            const response = await fetch(product_URL, {
                method: "POST",
                headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json", },
                body: JSON.stringify(monitization_product_rate_data),
            });
            const responseData = await response.json();
            if (response.ok && responseData && responseData.name && responseData.displayName) {
                console.log("-----responseData---------", JSON.stringify(responseData));
                const rate_response = JSON.stringify(responseData);

                await ProductMonitazationRate.update(
                    {
                        is_rate_plan_approved: true,
                        rate_plan_json_res_data: rate_response,
                        rate_plan_json_send_data: JSON.stringify(monitization_product_rate_data),
                        res_rate_name: responseData.name
                    },
                    {
                        where: { rate_id: rate_id }
                    }
                );

                const [affectedRows] = await Product.update(
                    { monitization_rate_id: rate_id },
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
                            narration: ' Product Monetization Rate added. Product Name = ' + product_name,
                            query: JSON.stringify({
                                product_id: _product_id,
                                monitization_rate_id: rate_id
                            }),
                        }
                        action_logger.info(JSON.stringify(data_to_log));
                    } catch (_) { console.log("---catch----------", _.stack); }
                    return res.status(200).json(success(true, res.statusCode, "Product Monetization Rate Added successfully.", null));
                } else {
                    return res.status(200).json(success(false, res.statusCode, "Unable to approve, Please try again.", null));
                }
            }
            else if (responseData.error.status == 'ABORTED' && responseData.error.code == 409) {
                return res.status(200).json(success(false, res.statusCode, 'Apigee response : ' + responseData.error.message, null));
            }
            else {
                if (responseData.error && responseData.error.message && responseData.error.message.length > 0) {
                    return res.status(200).json(success(false, res.statusCode, "Apigee response : " + responseData.error.message, null));
                }
                return res.status(200).json(success(false, res.statusCode, "Unable to Add Product Monetization Rate, Please try again.", null));
            }
        }

        if (is_maker && _rate_id == 0) {
            console.log("=============maker new add====");

            const newRate = await ProductMonitazationRate.create({
                product_id: _product_id,
                added_date: db.get_ist_current_date(),
                added_by: req.token_data.account_id,
                product_name: product_name,
                apiproduct: product_name,
                display_name: displayName,
                description: description,
                billing_period: billingPeriod,
                currency_code: currencyCode,
                one_time_setup_fee: _one_time_setup_fee,
                fixed_fee_frequency: _fixedFeeFrequency,
                fixed_recurring_fee: _fixedRecurringFee,
                consumption_pricing_type: consumptionPricingType,
                consumption_pricing_rates: JSON.stringify(consumptionPricingRates_new),
                state: state,
                start_date_type: _start_type,
                start_date: start_time,
                expiry_date_type: _expiry_type,
                expiry_date: expiry_time,
                start_time: _startTime,
                end_time: _endTime
            });

            const rate_id = newRate?.rate_id ?? 0;
            if (rate_id > 0) {
                try {
                    let data_to_log = {
                        correlation_id: correlator.getId(),
                        token_id: req.token_data.token_id,
                        account_id: req.token_data.account_id,
                        user_type: 1,
                        user_id: req.token_data.admin_id,
                        narration: ' Product Monetization Rate added. Product Name = ' + product_name,
                        query: JSON.stringify({
                            product_id: _product_id,
                            rate_id: rate_id
                        }),
                        date_time: db.get_ist_current_date(),
                    }
                    action_logger.info(JSON.stringify(data_to_log));
                } catch (_) { }
                return res.status(200).json(success(true, res.statusCode, "Product Monetization Rate Saved successfully.", null));
            } else {
                return res.status(200).json(success(false, res.statusCode, "Unable to save, Please try again", null));
            }
        }
        /******************************END Create Rate Monitization Rate*********************************/

        /******************************START UPDATE Rate Monitization Rate*********************************/

        if (is_admin && row3 && row3.rate_id && res_rate_name && res_rate_name.length > 0) {
            console.log("=============admin update====");

            const newRate = await ProductMonitazationRate.create({
                product_id: _product_id,
                added_date: db.get_ist_current_date(),
                added_by: req.token_data.account_id,
                product_name: product_name,
                apiproduct: product_name,
                display_name: displayName,
                description: description,
                billing_period: billingPeriod,
                currency_code: currencyCode,
                one_time_setup_fee: _one_time_setup_fee,
                fixed_fee_frequency: _fixedFeeFrequency,
                fixed_recurring_fee: _fixedRecurringFee,
                consumption_pricing_type: consumptionPricingType,
                consumption_pricing_rates: JSON.stringify(consumptionPricingRates_new),
                state: state,
                start_date_type: _start_type,
                start_date: start_time,
                expiry_date_type: _expiry_type,
                expiry_date: expiry_time,
                activity_type: 1,
                start_time: _startTime,
                end_time: _endTime,
                res_rate_name: res_rate_name
            });

            const rate_id = newRate?.rate_id ?? 0;
            const monitization_product_rate_data = {
                apiproduct: product_name,
                displayName: displayName,
                description: description || '',
                billingPeriod: billingPeriod || '',
                currencyCode: currencyCode,
                fixedFeeFrequency: _fixedFeeFrequency || 0,
                setup_fee: {
                    currencyCode: currencyCode,
                    units: _one_time_setup_fee || 0,
                    nanos: 0
                },
                fixedRecurringFee: {
                    currencyCode: currencyCode,
                    nanos: 0,
                    units: _fixedRecurringFee || 0,
                },
                consumptionPricingType: consumptionPricingType || '',
                consumptionPricingRates: consumptionPricingRates_new,
                startTime: _startTime,
                endTime: _endTime,
                state: state,
            };
            console.log("resssss", monitization_product_rate_data);
            const product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/apiproducts/${product_name}/rateplans/${res_rate_name}`;
            const apigeeAuth = await db.get_apigee_token();
            const response = await fetch(product_URL, {
                method: "PUT",
                headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json", },
                body: JSON.stringify(monitization_product_rate_data),
            });
            const responseData = await response.json();
            if (response.ok && responseData && responseData.name && responseData.displayName) {
                console.log("-----responseData---------", JSON.stringify(responseData));
                const rate_response = JSON.stringify(responseData);

                await ProductMonitazationRate.update(
                    {
                        is_rate_plan_approved: true,
                        rate_plan_json_res_data: rate_response,
                        rate_plan_json_send_data: JSON.stringify(monitization_product_rate_data),
                        res_rate_name: responseData.name
                    },
                    {
                        where: { rate_id: rate_id }
                    }
                );

                const [affectedRows] = await Product.update(
                    { monitization_rate_id: rate_id },
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
                            narration: ' Product Monetization Rate added. Product Name = ' + product_name,
                            query: JSON.stringify({
                                product_id: _product_id,
                                monitization_rate_id: rate_id
                            }),
                        }
                        action_logger.info(JSON.stringify(data_to_log));
                    } catch (_) { console.log("---catch----------", _.stack); }
                    return res.status(200).json(success(true, res.statusCode, "Product Monetization Rate Updated successfully.", null));
                } else {
                    return res.status(200).json(success(false, res.statusCode, "Unable to approve, Please try again.", null));
                }
            }
            else if (responseData.error.status == 'ABORTED' && responseData.error.code == 409) {
                return res.status(200).json(success(false, res.statusCode, 'Apigee response : ' + responseData.error.message, null));
            }
            else {
                if (responseData.error && responseData.error.message && responseData.error.message.length > 0) {
                    return res.status(200).json(success(false, res.statusCode, "Apigee response : " + responseData.error.message, null));
                }
                return res.status(200).json(success(false, res.statusCode, "Unable to Add Product Monetization Rate, Please try again.", null));
            }
        } else {
            console.log("=============maker update====");

            const newRate = await ProductMonitazationRate.create({
                product_id: _product_id,
                added_date: db.get_ist_current_date(),
                added_by: req.token_data.account_id,
                product_name: product_name,
                apiproduct: product_name,
                display_name: displayName,
                description: description,
                billing_period: billingPeriod,
                currency_code: currencyCode,
                one_time_setup_fee: _one_time_setup_fee,
                fixed_fee_frequency: _fixedFeeFrequency,
                fixed_recurring_fee: _fixedRecurringFee,
                consumption_pricing_type: consumptionPricingType,
                consumption_pricing_rates: JSON.stringify(consumptionPricingRates_new),
                state: state,
                start_date_type: _start_type,
                start_date: start_time,
                expiry_date_type: _expiry_type,
                expiry_date: expiry_time,
                activity_type: 1,
                start_time: _startTime,
                end_time: _endTime,
                res_rate_name: res_rate_name
            });

            const rate_id = newRate?.rate_id ?? 0;
            if (rate_id > 0) {
                try {
                    let data_to_log = {
                        correlation_id: correlator.getId(),
                        token_id: req.token_data.token_id,
                        account_id: req.token_data.account_id,
                        user_type: 1,
                        user_id: req.token_data.admin_id,
                        narration: ' Product Monetization Rate Update. Product Name = ' + product_name,
                        query: JSON.stringify({
                            product_id: _product_id,
                            rate_id: rate_id
                        }),
                        date_time: db.get_ist_current_date(),
                    }
                    action_logger.info(JSON.stringify(data_to_log));
                } catch (_) { }
                return res.status(200).json(success(true, res.statusCode, "Updated  successfully.", null));
            } else {
                return res.status(200).json(success(false, res.statusCode, "Unable to save, Please try again", null));
            }
        }

        /******************************START UPDATE Rate Monitization Rate*********************************/
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};


const product_monitization_rate_pending_list = async (req, res, next) => {
    const { page_no, search_text } = req.body;
    try {
        const { ProductMonitazationRate, Product, AdmUser } = db.models;

        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0;
        if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";

        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);

        if (is_maker || is_checker || is_admin) {
            const pageSize = parseInt(process.env.PAGINATION_SIZE);
            const offset = (_page_no - 1) * pageSize;

            // Build where clause for pending items
            const whereClause = {
                is_deleted: false,
                is_rate_plan_approved: false,
                ckr_is_rate_plan_approved: false,
                ckr_rate_plan_is_rejected: false,
                is_rate_plan_rejected: false,
                ..._search_text && {
                    product_name: {
                        [Op.iLike]: `${_search_text}%`
                    }
                }
            };

            // Get total count
            const total_record = await ProductMonitazationRate.count({ where: whereClause });

            // Get paginated list with associations
            const rows = await ProductMonitazationRate.findAll({
                where: whereClause,
                include: [
                    {
                        model: Product,
                        as: 'product',
                        where: { is_deleted: false },
                        attributes: ['product_name'],
                        required: true
                    },
                    {
                        model: AdmUser,
                        as: 'added_by_user',
                        attributes: ['first_name', 'last_name'],
                        required: false
                    }
                ],
                order: [['rate_id', 'DESC']],
                limit: pageSize,
                offset: offset
            });

            const list = rows.map((item, index) => ({
                sr_no: offset + index + 1,
                rate_id: item.rate_id,
                product_id: item.product_id,
                product_name: item.product?.product_name || item.product_name,
                apiproduct: item.apiproduct,
                added_date: item.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.added_date)) : "",
                ckr_full_name: item.added_by_user ? `${item.added_by_user.first_name || ''} ${item.added_by_user.last_name || ''}`.trim() : '',
                display_name: item.display_name,
                description: item.description,
                billing_period: item.billing_period,
                currency_code: item.currency_code,
                activity_type: item.activity_type == 0 ? "CREATED" : "UPDATED",
                start_date: new Date(Number(item.start_time)),
                expiry_date: item.expiry_date_type == 3 ? item.expiry_date : new Date(Number(item.end_time)),
                start_date_type: item.start_date_type,
                expiry_date_type: item.expiry_date_type,
                one_time_setup_fee: item.one_time_setup_fee,
                fixed_fee_frequency: item.fixed_fee_frequency,
                fixed_recurring_fee: item.fixed_recurring_fee,
                consumption_pricing_type: item.consumption_pricing_type,
                consumption_pricing_rates: item.consumption_pricing_rates ? JSON.parse(item.consumption_pricing_rates) : [],
                state: item.state,
                revenue_share_type: item.revenue_share_type,
                revenue_share_rates: item.revenue_share_rates,
            }));

            const results = {
                current_page: _page_no,
                total_pages: Math.ceil(total_record / pageSize),
                data: list,
                is_admin: is_admin,
                is_maker: is_maker,
                is_checker: is_checker,
            };
            return res.status(200).json(success(true, res.statusCode, "", results));
        } else {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have checker/maker authority.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const product_monitization_rate_approve_list = async (req, res, next) => {
    const { page_no, search_text } = req.body;
    try {
        const { ProductMonitazationRate, Product, AdmUser } = db.models;

        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0;
        if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";

        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);

        if (is_maker || is_checker || is_admin) {
            const pageSize = parseInt(process.env.PAGINATION_SIZE);
            const offset = (_page_no - 1) * pageSize;

            // Build where clause for approved items
            const whereClause = {
                is_deleted: false,
                [Op.or]: [
                    { ckr_is_rate_plan_approved: true },
                    { is_rate_plan_approved: true }
                ],
                ckr_rate_plan_is_rejected: false,
                is_rate_plan_rejected: false,
                ..._search_text && {
                    product_name: {
                        [Op.iLike]: `%${_search_text}%`
                    }
                }
            };

            // Get total count
            const total_record = await ProductMonitazationRate.count({ where: whereClause });

            // Get paginated list with associations
            const rows = await ProductMonitazationRate.findAll({
                where: whereClause,
                include: [
                    {
                        model: Product,
                        as: 'product',
                        where: { is_deleted: false },
                        attributes: ['product_name'],
                        required: true
                    },
                    {
                        model: AdmUser,
                        as: 'ckr_approved_by_user',
                        attributes: ['first_name', 'last_name'],
                        required: false
                    },
                    {
                        model: AdmUser,
                        as: 'added_by_user',
                        attributes: ['first_name', 'last_name'],
                        required: false
                    }
                ],
                order: [['rate_id', 'DESC']],
                limit: pageSize,
                offset: offset
            });

            const list = rows.map((item, index) => ({
                sr_no: offset + index + 1,
                rate_id: item.rate_id,
                product_id: item.product_id,
                product_name: item.product?.product_name || item.product_name,
                apiproduct: item.apiproduct,
                display_name: item.display_name,
                description: item.description,
                billing_period: item.billing_period,
                currency_code: item.currency_code,
                one_time_setup_fee: item.one_time_setup_fee,
                fixed_fee_frequency: item.fixed_fee_frequency,
                fixed_recurring_fee: item.fixed_recurring_fee,
                consumption_pricing_type: item.consumption_pricing_type,
                consumption_pricing_rates: item.consumption_pricing_rates ? JSON.parse(item.consumption_pricing_rates) : [],
                state: item.state,
                activity_type: item.activity_type == 0 ? "CREATED" : "UPDATED",
                start_date: new Date(Number(item.start_time)),
                expiry_date: item.expiry_date_type == 3 ? item.expiry_date : new Date(Number(item.end_time)),
                start_date_type: item.start_date_type,
                expiry_date_type: item.expiry_date_type,
                revenue_share_type: item.revenue_share_type,
                revenue_share_rates: item.revenue_share_rates,
                ckr_full_name: item.ckr_approved_by_user ? `${item.ckr_approved_by_user.first_name || ''} ${item.ckr_approved_by_user.last_name || ''}`.trim() : '',
                added_date: item.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.added_date)) : "",
                mkr_name: item.added_by_user ? `${item.added_by_user.first_name || ''} ${item.added_by_user.last_name || ''}`.trim() : '',
                ckr_approved: item.ckr_is_rate_plan_approved,
                ckr_approve_date: item.ckr_rate_plan_approved_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.ckr_rate_plan_approved_date)) : "",
                ckr_remark: item.ckr_rate_plan_approved_rmk,
            }));

            const results = {
                current_page: _page_no,
                total_pages: Math.ceil(total_record / pageSize),
                data: list,
                is_admin: is_admin,
                is_maker: is_maker,
                is_checker: is_checker,
            };
            return res.status(200).json(success(true, res.statusCode, "", results));
        }
        else {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have checker/maker authority.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const product_monitization_rate_rejected_list = async (req, res, next) => {
    const { page_no, search_text } = req.body;
    try {
        const { ProductMonitazationRate, Product, AdmUser } = db.models;

        let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0;
        if (_page_no <= 0) { _page_no = 1; }
        let _search_text = search_text && search_text.length > 0 ? search_text : "";

        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);

        if (is_maker || is_checker || is_admin) {
            const pageSize = parseInt(process.env.PAGINATION_SIZE);
            const offset = (_page_no - 1) * pageSize;

            // Build where clause for rejected items
            const whereClause = {
                is_deleted: false,
                [Op.or]: [
                    { ckr_rate_plan_is_rejected: true },
                    { is_rate_plan_rejected: true }
                ],
                ckr_is_rate_plan_approved: false,
                is_rate_plan_approved: false,
                ..._search_text && {
                    product_name: {
                        [Op.iLike]: `${_search_text}%`
                    }
                }
            };

            // Get total count
            const total_record = await ProductMonitazationRate.count({ where: whereClause });

            // Get paginated list with associations
            const rows = await ProductMonitazationRate.findAll({
                where: whereClause,
                include: [
                    {
                        model: Product,
                        as: 'product',
                        where: { is_deleted: false },
                        attributes: ['product_name'],
                        required: true
                    },
                    {
                        model: AdmUser,
                        as: 'rejected_by_user',
                        attributes: ['first_name', 'last_name'],
                        required: false
                    },
                    {
                        model: AdmUser,
                        as: 'added_by_user',
                        attributes: ['first_name', 'last_name'],
                        required: false
                    }
                ],
                order: [['rate_id', 'DESC']],
                limit: pageSize,
                offset: offset
            });

            const list = rows.map((item, index) => ({
                sr_no: offset + index + 1,
                rate_id: item.rate_id,
                product_id: item.product_id,
                product_name: item.product?.product_name || item.product_name,
                apiproduct: item.apiproduct,
                display_name: item.display_name,
                description: item.description,
                billing_period: item.billing_period,
                currency_code: item.currency_code,
                one_time_setup_fee: item.one_time_setup_fee,
                fixed_fee_frequency: item.fixed_fee_frequency,
                fixed_recurring_fee: item.fixed_recurring_fee,
                consumption_pricing_type: item.consumption_pricing_type,
                consumption_pricing_rates: item.consumption_pricing_rates ? JSON.parse(item.consumption_pricing_rates) : [],
                state: item.state,
                activity_type: item.activity_type == 0 ? "CREATED" : "UPDATED",
                start_date: new Date(Number(item.start_time)),
                expiry_date: item.expiry_date_type == 3 ? item.expiry_date : new Date(Number(item.end_time)),
                start_date_type: item.start_date_type,
                expiry_date_type: item.expiry_date_type,
                revenue_share_type: item.revenue_share_type,
                revenue_share_rates: item.revenue_share_rates,
                mkr_name: item.added_by_user ? `${item.added_by_user.first_name || ''} ${item.added_by_user.last_name || ''}`.trim() : '',
                added_date: item.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.added_date)) : "",
                ckr_full_name: item.rejected_by_user ? `${item.rejected_by_user.first_name || ''} ${item.rejected_by_user.last_name || ''}`.trim() : '',
                rejected_date: item.ckr_rate_plan_rejected_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(item.ckr_rate_plan_rejected_date)) : "",
                ckr_remark: item.ckr_rate_plan_rejected_rmk,
            }));

            const results = {
                current_page: _page_no,
                total_pages: Math.ceil(total_record / pageSize),
                data: list,
                is_admin: is_admin,
                is_maker: is_maker,
                is_checker: is_checker,
            };
            return res.status(200).json(success(true, res.statusCode, "", results));
        } else {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have checker/maker authority.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const product_monitization_rate_reject = async (req, res, next) => {
    const { rate_id, product_id, remark } = req.body;
    const { Product, ProductMonitazationRate } = db.models;
    try {
        let _rate_id = rate_id && validator.isNumeric(rate_id.toString()) ? parseInt(rate_id) : 0;
        let _product_id = product_id && validator.isNumeric(product_id.toString()) ? parseInt(product_id) : 0;
        if (!remark || remark.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter remark.", null));
        }
        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);
        console.log(is_admin, is_checker, is_maker);
        if (is_admin || is_checker) {
            const row1 = await ProductMonitazationRate.findOne({
                where: {
                    rate_id: _rate_id,
                    product_id: _product_id,
                    is_deleted: false
                },
                include: [{
                    model: Product,
                    as: 'product',
                    where: { is_deleted: false },
                    attributes: ['product_name']
                }],
                attributes: ['rate_id', 'product_id', 'is_rate_plan_rejected', 'ckr_rate_plan_rejected_by', 'is_rate_plan_approved', 'ckr_is_rate_plan_approved', 'ckr_rate_plan_is_rejected']
            });

            if (!row1) {
                return res.status(200).json(success(false, res.statusCode, "Product Monetization Rate details not found.", null));
            }
            if ((row1.ckr_rate_plan_is_rejected && row1.ckr_rate_plan_is_rejected == true) ||
                (row1.is_rate_plan_rejected && row1.is_rate_plan_rejected == true)) {
                return res.status(200).json(success(false, res.statusCode, "Product Monetization Rate is already rejected.", null));
            }
            if (row1.is_rate_plan_approved && row1.is_rate_plan_approved == true) {
                return res.status(200).json(success(false, res.statusCode, "Product Monetization Rate is approved, can not reject", null));
            }

            const [affectedRows] = await ProductMonitazationRate.update(
                {
                    ckr_rate_plan_is_rejected: true,
                    ckr_rate_plan_rejected_by: req.token_data.account_id,
                    ckr_rate_plan_rejected_date: db.get_ist_current_date(),
                    ckr_rate_plan_rejected_rmk: remark
                },
                {
                    where: {
                        rate_id: _rate_id,
                        product_id: _product_id
                    }
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
                        narration: ' App Product Monitazation Rate rejected by ' + (is_admin ? 'admin' : 'checker') + '. Product Name = ' + row1.product.product_name,
                        query: JSON.stringify({
                            rate_id: _rate_id,
                            product_id: _product_id,
                            rejected_by: req.token_data.account_id
                        }),
                    }
                    action_logger.info(JSON.stringify(data_to_log));
                } catch (_) {
                }
                return res.status(200).json(success(true, res.statusCode, "Product Monetization Rate Value rejected successfully.", null));
            } else {
                return res.status(200).json(success(false, res.statusCode, "Unable to reject, Please try again.", null));
            }
        } else {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have checker/maker authority.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const product_monitization_rate_approve = async (req, res, next) => {
    const { rate_id, product_id, remark } = req.body;
    const { Product, ProductMonitazationRate } = db.models;
    try {
        let _rate_id = rate_id && validator.isNumeric(rate_id.toString()) ? parseInt(rate_id) : 0;
        let _product_id = product_id && validator.isNumeric(product_id.toString()) ? parseInt(product_id) : 0;

        if (!remark || remark.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter remark.", null));
        }
        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);
        console.log(is_admin, is_checker, is_maker);
        if (is_admin || is_checker) {
            const row1 = await ProductMonitazationRate.findOne({
                where: {
                    rate_id: _rate_id,
                    product_id: _product_id,
                    is_deleted: false
                },
                include: [{
                    model: Product,
                    as: 'product',
                    where: { is_deleted: false },
                    attributes: []
                }],
                attributes: [
                    'rate_id', 'product_id', 'added_date', 'product_name', 'apiproduct',
                    'display_name', 'description', 'billing_period', 'currency_code', 'one_time_setup_fee', 'fixed_fee_frequency',
                    'fixed_recurring_fee', 'consumption_pricing_type', 'consumption_pricing_rates', 'state', 'start_time', 'end_time',
                    'revenue_share_type', 'revenue_share_rates', 'rate_plan_json_data', 'is_rate_plan_approved', 'is_rate_plan_rejected',
                    'ckr_is_rate_plan_approved', 'ckr_rate_plan_approved_date', 'ckr_rate_plan_approved_rmk',
                    'ckr_rate_plan_is_rejected', 'ckr_rate_plan_rejected_rmk', 'ckr_rate_plan_rejected_by', 'ckr_rate_plan_rejected_date',
                    'rate_plan_json_send_data', 'rate_plan_json_res_data', 'activity_type', 'res_rate_name',
                    'start_date_type', 'start_date', 'expiry_date_type', 'expiry_date'
                ]
            });

            if (!row1) {
                return res.status(200).json(success(false, res.statusCode, " Product Monetization Rate details not found.", null));
            }
            if (row1.is_rate_plan_approved && row1.is_rate_plan_approved == true) {
                return res.status(200).json(success(false, res.statusCode, " Product Monetization Rate is already approved.", null));
            }
            if (row1.ckr_is_rate_plan_approved && row1.ckr_is_rate_plan_approved == true) {
                return res.status(200).json(success(false, res.statusCode, " Product Monetization Rate is already approved.", null));
            }
            if (row1.is_rate_plan_rejected && row1.is_rate_plan_rejected == true) {
                return res.status(200).json(success(false, res.statusCode, " Product Monetization Rate is rejected, can not approve.", null));
            }
            if (row1.ckr_rate_plan_is_rejected && row1.ckr_rate_plan_is_rejected == true) {
                return res.status(200).json(success(false, res.statusCode, "Product Monetization Rate is rejected, can not approve.", null));
            }

            const product_name = row1.product_name;
            let res_rate_name = row1.res_rate_name || '';
            let s_time = new Date(row1.start_date);
            let e_time = new Date(row1.expiry_date);
            let _startTime = row1.start_date_type == 1 ? row1.start_time : s_time.getTime().toString();
            let _endTime = row1.expiry_date_type == 3 ? e_time.getTime().toString() : row1.start_date_type == 2 ? row1.end_time : 0;
            let state = 'PUBLISHED';
            let billingPeriod = 'MONTHLY';
            let currencyCode = 'INR';
            const monitization_product_rate_data = {
                apiproduct: product_name,
                displayName: row1.display_name,
                description: row1.description || '',
                billingPeriod: billingPeriod,
                currencyCode: currencyCode,
                fixedFeeFrequency: row1.fixed_fee_frequency || 0,
                setup_fee: {
                    currencyCode: currencyCode,
                    units: row1.one_time_setup_fee || 0,
                    nanos: 0
                },
                fixedRecurringFee: {
                    currencyCode: currencyCode,
                    nanos: 0,
                    units: row1.fixed_recurring_fee || 0,
                },
                consumptionPricingType: row1.consumption_pricing_type || '',
                consumptionPricingRates: JSON.parse(row1.consumption_pricing_rates),
                startTime: _startTime,
                endTime: _endTime,
                state: state,
            };
            console.log("monitization_product_rate_data=======", monitization_product_rate_data);

            let product_URL = '';
            let method = '';
            if (row1.activity_type == 1 && res_rate_name && res_rate_name.length > 0) {
                product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/apiproducts/${product_name}/rateplans/${res_rate_name}`;
                method = 'PUT';
            } else {
                product_URL = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/apiproducts/${product_name}/rateplans`;
                method = 'POST';
            }
            console.log(product_URL);
            console.log(method);
            const apigeeAuth = await db.get_apigee_token();
            const response = await fetch(product_URL, {
                method: method,
                headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json", },
                body: JSON.stringify(monitization_product_rate_data),
            });
            const responseData = await response.json();
            console.log("========responseData=============", responseData);

            if (response.ok && responseData && responseData.name && responseData.displayName) {
                const rate_response = JSON.stringify(responseData);

                await ProductMonitazationRate.update(
                    {
                        is_rate_plan_approved: true,
                        ckr_is_rate_plan_approved: true,
                        ckr_rate_plan_approved_by: req.token_data.account_id,
                        ckr_rate_plan_approved_date: db.get_ist_current_date(),
                        ckr_rate_plan_approved_rmk: remark,
                        rate_plan_json_res_data: rate_response,
                        rate_plan_json_send_data: JSON.stringify(monitization_product_rate_data),
                        res_rate_name: responseData.name
                    },
                    {
                        where: { rate_id: _rate_id }
                    }
                );

                const [affectedRows] = await Product.update(
                    { monitization_rate_id: _rate_id },
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
                            narration: 'Product Monetization Rate added  Product name = ' + product_name,
                            query: JSON.stringify({
                                product_id: _product_id,
                                monitization_rate_id: _rate_id
                            }),
                        }
                        action_logger.info(JSON.stringify(data_to_log));
                    } catch (_) { console.log("---catch----------"); }

                    return res.status(200).json(success(true, res.statusCode, "Product Monetization Rate Added successfully.", null));
                } else {
                    return res.status(200).json(success(false, res.statusCode, "Unable to Add Product Monetization Rate, Please try again.", null));
                }
            }
            else if (responseData?.error?.status == 'ABORTED' && responseData?.error?.code === 409) {
                return res.status(200).json(success(false, res.statusCode, `Apigee response : ${responseData?.error?.message ?? 'Unknown error'}`, null));
            }
            else if (responseData?.error?.message?.length > 0) {
                return res.status(200).json(success(false, res.statusCode, `Apigee response : ${responseData.error.message}`, null));
            }

            return res.status(200).json(success(false, res.statusCode, "Unable to Add Product Monetization Rate, Please try again.", null));

        } else {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have checker/maker authority.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const product_monitization_rate_req_view_detail = async (req, res, next) => {
    const { rate_id } = req.body;
    const { Product, ProductMonitazationRate, AdmUser } = db.models;
    try {
        let _rate_id = rate_id && validator.isNumeric(rate_id.toString()) ? parseInt(rate_id) : 0;
        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);

        if (is_admin || is_checker || is_maker) {
            const row1 = await ProductMonitazationRate.findOne({
                where: {
                    rate_id: _rate_id,
                    is_deleted: false
                },
                include: [
                    {
                        model: Product,
                        as: 'product',
                        where: { is_deleted: false },
                        attributes: []
                    },
                    {
                        model: AdmUser,
                        as: 'added_by_user',
                        required: false,
                        attributes: ['first_name', 'last_name']
                    },
                    {
                        model: AdmUser,
                        as: 'ckr_approved_by_user',
                        required: false,
                        attributes: ['first_name', 'last_name']
                    }
                ],
                attributes: [
                    'rate_id', 'product_id', 'added_date', 'product_name', 'apiproduct',
                    'display_name', 'description', 'billing_period', 'currency_code', 'one_time_setup_fee', 'fixed_fee_frequency',
                    'fixed_recurring_fee', 'consumption_pricing_type', 'consumption_pricing_rates', 'state', 'start_time', 'end_time',
                    'revenue_share_type', 'revenue_share_rates', 'rate_plan_json_data', 'is_rate_plan_approved', 'is_rate_plan_rejected',
                    'ckr_is_rate_plan_approved', 'ckr_rate_plan_approved_date', 'ckr_rate_plan_approved_rmk',
                    'ckr_rate_plan_is_rejected', 'ckr_rate_plan_rejected_rmk', 'ckr_rate_plan_rejected_by', 'ckr_rate_plan_rejected_date',
                    'rate_plan_json_send_data', 'rate_plan_json_res_data',
                    'start_date_type', 'start_date', 'expiry_date_type', 'expiry_date', 'activity_type'
                ]
            });

            if (!row1) {
                return res.status(400).json(success(false, res.statusCode, "Product Monetization Rate details not found.", null));
            }

            const ckr_name = row1.added_by_user
                ? `${row1.added_by_user.first_name || ''} ${row1.added_by_user.last_name || ''}`.trim()
                : '';
            const mkr_name = row1.ckr_approved_by_user
                ? `${row1.ckr_approved_by_user.first_name || ''} ${row1.ckr_approved_by_user.last_name || ''}`.trim()
                : '';

            const results = {
                rate_id: row1.rate_id,
                product_id: row1.product_id,
                product_name: row1.product_name,
                apiproduct: row1.apiproduct,
                added_date: row1.added_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(row1.added_date)) : "",
                ckr_full_name: ckr_name,
                display_name: row1.display_name,
                description: row1.description,
                billing_period: row1.billing_period,
                currency_code: row1.currency_code,
                one_time_setup_fee: row1.one_time_setup_fee,
                fixed_fee_frequency: row1.fixed_fee_frequency,
                fixed_recurring_fee: row1.fixed_recurring_fee,
                consumption_pricing_type: row1.consumption_pricing_type,
                consumption_pricing_rates: row1.consumption_pricing_rates ? JSON.parse(row1.consumption_pricing_rates) : [],
                state: row1.state,
                start_date_type: row1.start_date_type,
                start_date: row1.start_date ? new Date(row1.start_date).toISOString().split('T')[0] : '',
                expiry_date_type: row1.expiry_date_type,
                expiry_date: row1.expiry_date ? new Date(row1.expiry_date).toISOString().split('T')[0] : '',
                activity_type: row1.activity_type,
                start_time: row1.start_time,
                end_time: row1.end_time,
                revenue_share_type: row1.revenue_share_type,
                revenue_share_rates: row1.revenue_share_rates,
                approve_date: row1.ckr_rate_plan_approved_date ? dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(row1.ckr_rate_plan_approved_date)) : "",
                approve_remark: row1.ckr_rate_plan_approved_rmk,
                mkr_name: mkr_name,
                ckr_name: ckr_name,
                is_admin: is_admin,
                is_maker: is_maker,
                is_checker: is_checker,
            };
            return res.status(200).json(success(true, res.statusCode, "Product Monitazation Details Data.", results));
        } else {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have checker/maker authority.", null));
        }
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};



export default {
    product_monitization_rate_pending_list,
    product_monitization_rate_approve_list,
    product_monitization_rate_rejected_list,
    product_monitization_rate_reject,
    product_monitization_rate_approve,
    product_monitization_rate_req_view_detail,
    product_monitization_rate_update
};
