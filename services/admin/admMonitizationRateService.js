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

// Helper: Parse numeric value
const parseNumericValue = (value, defaultVal = 0, isFloat = false) => {
    if (!value || !validator.isNumeric(value.toString())) return defaultVal;
    return isFloat ? parseFloat(value) : parseInt(value);
};

// Helper: Validate monetization input fields
const validateMonitizationInput = (data) => {
    const { displayName, description, consumptionPricingType, _start_type, start_time, _expiry_type, expiry_time } = data;
    if (!displayName?.length) return "Please enter display name.";
    if (_start_type === 2 && !start_time) return "Please select Start Time.";
    if (_expiry_type === 3 && !expiry_time) return "Please select Expiry Time.";
    if (!description?.length) return "Please enter description.";
    if (!consumptionPricingType?.length) return "Please select consumption pricing type.";
    return null;
};

// Helper: Calculate end time (replaces nested ternary)
const calculateEndTime = (expiryType, expiryTime, currentTime) => {
    if (expiryType === 3) {
        return new Date(expiryTime).getTime().toString();
    }
    if (expiryType === 2) {
        return currentTime.toString();
    }
    return 0;
};

// Helper: Process fixed per unit consumption pricing
const processFixedPerUnitPricing = (rate, currencyCode) => {
    const units = Math.floor(rate);
    const nanos = Math.round((rate - units) * 1e9);
    return [{
        fee: { currencyCode, nanos, units: units || 0 },
        start: 0,
        end: 0,
    }];
};

// Helper: Validate banded consumption pricing rates
const validateBandedPricingRates = (rates) => {
    if (!Array.isArray(rates)) return "consumptionPricingRates must be an array";

    const requiredFields = {
        fee: { currencyCode: 'string', nanos: 'number', units: 'number' },
        start: 'number',
        end: 'number'
    };

    for (let i = 0; i < rates.length; i++) {
        const rate = rates[i];
        for (const key in requiredFields) {
            if (!rate.hasOwnProperty(key)) {
                return `Missing field '${key}' in rate at index ${i}`;
            }
            if (typeof requiredFields[key] === 'object') {
                for (const nestedKey in requiredFields[key]) {
                    if (!rate[key].hasOwnProperty(nestedKey) || typeof rate[key][nestedKey] !== requiredFields[key][nestedKey]) {
                        return `Invalid or missing field '${nestedKey}' in fee object at index ${i}`;
                    }
                }
            } else if (typeof rate[key] !== requiredFields[key]) {
                return `Field '${key}' must be of type ${requiredFields[key]} at index ${i}`;
            }
        }
    }
    return null;
};

// Helper: Build rate record data for database
const buildRateRecordData = (params) => {
    const { productId, tokenData, productName, displayName, description, billingPeriod, currencyCode,
        oneTimeSetupFee, fixedFeeFrequency, fixedRecurringFee, consumptionPricingType,
        consumptionPricingRates, state, startType, startTime, expiryType, expiryTime,
        startTimeCalc, endTimeCalc, activityType, resRateName } = params;

    return {
        product_id: productId,
        added_date: db.get_ist_current_date(),
        added_by: tokenData.account_id,
        product_name: productName,
        apiproduct: productName,
        display_name: displayName,
        description: description,
        billing_period: billingPeriod,
        currency_code: currencyCode,
        one_time_setup_fee: oneTimeSetupFee,
        fixed_fee_frequency: fixedFeeFrequency,
        fixed_recurring_fee: fixedRecurringFee,
        consumption_pricing_type: consumptionPricingType,
        consumption_pricing_rates: JSON.stringify(consumptionPricingRates),
        state: state,
        start_date_type: startType,
        start_date: startTime,
        expiry_date_type: expiryType,
        expiry_date: expiryTime,
        start_time: startTimeCalc,
        end_time: endTimeCalc,
        ...(activityType !== undefined && { activity_type: activityType }),
        ...(resRateName && { res_rate_name: resRateName })
    };
};

// Helper: Build Apigee rate plan payload
const buildApigeeRatePlanPayload = (params) => {
    const { productName, displayName, description, billingPeriod, currencyCode, fixedFeeFrequency,
        oneTimeSetupFee, fixedRecurringFee, consumptionPricingType, consumptionPricingRates,
        startTime, endTime, state } = params;

    return {
        apiproduct: productName,
        displayName: displayName,
        description: description || '',
        billingPeriod: billingPeriod || '',
        currencyCode: currencyCode,
        fixedFeeFrequency: fixedFeeFrequency || 0,
        setup_fee: { currencyCode: currencyCode, units: oneTimeSetupFee || 0, nanos: 0 },
        fixedRecurringFee: { currencyCode: currencyCode, nanos: 0, units: fixedRecurringFee || 0 },
        consumptionPricingType: consumptionPricingType || '',
        consumptionPricingRates: consumptionPricingRates,
        startTime: startTime,
        endTime: endTime,
        state: state,
    };
};

// Helper: Call Apigee rate plan API
const callApigeeRatePlanApi = async (productName, ratePlanName, payload, method = 'POST') => {
    const baseUrl = `https://${process.env.API_PRODUCT_HOST}/v1/organizations/${process.env.API_PRODUCT_ORGANIZATION}/apiproducts/${productName}/rateplans`;
    const url = ratePlanName ? `${baseUrl}/${ratePlanName}` : baseUrl;
    const apigeeAuth = await db.get_apigee_token();

    const response = await fetch(url, {
        method: method,
        headers: { Authorization: `Bearer ${apigeeAuth}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    const responseData = await response.json();
    return { ok: response.ok, data: responseData };
};

// Helper: Handle Apigee API response errors
const getApigeeErrorMessage = (responseData) => {
    if (responseData?.error?.status === 'ABORTED' && responseData?.error?.code === 409) {
        return `Apigee response : ${responseData.error.message}`;
    }
    if (responseData?.error?.message?.length > 0) {
        return `Apigee response : ${responseData.error.message}`;
    }
    return null;
};

// Helper: Update rate plan after successful Apigee response
const updateRatePlanAfterApigee = async (ProductMonitazationRate, Product, rateId, productId, responseData, payload) => {
    await ProductMonitazationRate.update(
        {
            is_rate_plan_approved: true,
            rate_plan_json_res_data: JSON.stringify(responseData),
            rate_plan_json_send_data: JSON.stringify(payload),
            res_rate_name: responseData.name
        },
        { where: { rate_id: rateId } }
    );

    const [affectedRows] = await Product.update(
        { monitization_rate_id: rateId },
        { where: { product_id: productId } }
    );
    return affectedRows;
};

// Helper: Log monetization rate action
const logMonitizationAction = (tokenData, narration, queryData) => {
    try {
        const data_to_log = {
            correlation_id: correlator.getId(),
            token_id: tokenData.token_id,
            account_id: tokenData.account_id,
            user_type: 1,
            user_id: tokenData.admin_id,
            narration,
            query: JSON.stringify(queryData),
            date_time: db.get_ist_current_date(),
        };
        action_logger.info(JSON.stringify(data_to_log));
    } catch (_) { /* ignore logging errors */ }
};

// Helper: Handle admin rate creation with Apigee call
const handleAdminRateCreation = async (params) => {
    const { ProductMonitazationRate, Product, recordData, apigeePayload, productName, productId, tokenData, res, isUpdate, ratePlanName } = params;

    const newRate = await ProductMonitazationRate.create(recordData);
    const rateId = newRate?.rate_id ?? 0;

    const method = isUpdate ? 'PUT' : 'POST';
    const { ok, data: responseData } = await callApigeeRatePlanApi(productName, isUpdate ? ratePlanName : null, apigeePayload, method);

    if (ok && responseData?.name && responseData?.displayName) {
        const affectedRows = await updateRatePlanAfterApigee(ProductMonitazationRate, Product, rateId, productId, responseData, apigeePayload);

        if (affectedRows > 0) {
            logMonitizationAction(tokenData, `Product Monetization Rate ${isUpdate ? 'Updated' : 'Added'}. Product Name = ${productName}`,
                { product_id: productId, monitization_rate_id: rateId });
            return { success: true, message: `Product Monetization Rate ${isUpdate ? 'Updated' : 'Added'} successfully.` };
        }
        return { success: false, message: "Unable to approve, Please try again." };
    }

    const errorMsg = getApigeeErrorMessage(responseData);
    return { success: false, message: errorMsg || "Unable to Add Product Monetization Rate, Please try again." };
};

// Helper: Handle maker rate creation (no Apigee call)
const handleMakerRateCreation = async (params) => {
    const { ProductMonitazationRate, recordData, productName, productId, tokenData, isUpdate } = params;

    const newRate = await ProductMonitazationRate.create(recordData);
    const rateId = newRate?.rate_id ?? 0;

    if (rateId > 0) {
        logMonitizationAction(tokenData, `Product Monetization Rate ${isUpdate ? 'Update' : 'Added'}. Product Name = ${productName}`,
            { product_id: productId, rate_id: rateId });
        return { success: true, message: isUpdate ? "Updated successfully." : "Product Monetization Rate Saved successfully." };
    }
    return { success: false, message: "Unable to save, Please try again" };
};

// Helper: Validate rate plan status for rejection
const validateRatePlanForRejection = (row) => {
    if (row.ckr_rate_plan_is_rejected || row.is_rate_plan_rejected) {
        return "Product Monetization Rate is already rejected.";
    }
    if (row.is_rate_plan_approved) {
        return "Product Monetization Rate is approved, can not reject";
    }
    return null;
};

// Helper: Validate rate plan status for approval
const validateRatePlanForApproval = (row) => {
    if (row.is_rate_plan_approved || row.ckr_is_rate_plan_approved) {
        return " Product Monetization Rate is already approved.";
    }
    if (row.is_rate_plan_rejected) {
        return " Product Monetization Rate is rejected, can not approve.";
    }
    if (row.ckr_rate_plan_is_rejected) {
        return "Product Monetization Rate is rejected, can not approve.";
    }
    return null;
};

// Helper: Reject rate plan record
const rejectRatePlan = async (ProductMonitazationRate, rateId, productId, tokenData, remark) => {
    const [affectedRows] = await ProductMonitazationRate.update(
        {
            ckr_rate_plan_is_rejected: true,
            ckr_rate_plan_rejected_by: tokenData.account_id,
            ckr_rate_plan_rejected_date: db.get_ist_current_date(),
            ckr_rate_plan_rejected_rmk: remark
        },
        { where: { rate_id: rateId, product_id: productId } }
    );
    return affectedRows;
};

// Helper: Approve rate plan record
const approveRatePlan = async (ProductMonitazationRate, Product, rateId, productId, tokenData, remark, responseData, payload) => {
    await ProductMonitazationRate.update(
        {
            is_rate_plan_approved: true,
            ckr_is_rate_plan_approved: true,
            ckr_rate_plan_approved_by: tokenData.account_id,
            ckr_rate_plan_approved_date: db.get_ist_current_date(),
            ckr_rate_plan_approved_rmk: remark,
            rate_plan_json_res_data: JSON.stringify(responseData),
            rate_plan_json_send_data: JSON.stringify(payload),
            res_rate_name: responseData.name
        },
        { where: { rate_id: rateId } }
    );

    const [affectedRows] = await Product.update(
        { monitization_rate_id: rateId },
        { where: { product_id: productId } }
    );
    return affectedRows;
};

// Helper: Build approve payload from row data
const buildApprovePayloadFromRow = (row) => {
    const currencyCode = 'INR';
    const billingPeriod = 'MONTHLY';
    const state = 'PUBLISHED';

    const _startTime = row.start_date_type === 1 ? row.start_time : new Date(row.start_date).getTime().toString();
    const _endTime = calculateEndTime(row.expiry_date_type, row.expiry_date, row.start_date_type === 2 ? row.end_time : 0);

    return {
        apiproduct: row.product_name,
        displayName: row.display_name,
        description: row.description || '',
        billingPeriod: billingPeriod,
        currencyCode: currencyCode,
        fixedFeeFrequency: row.fixed_fee_frequency || 0,
        setup_fee: { currencyCode: currencyCode, units: row.one_time_setup_fee || 0, nanos: 0 },
        fixedRecurringFee: { currencyCode: currencyCode, nanos: 0, units: row.fixed_recurring_fee || 0 },
        consumptionPricingType: row.consumption_pricing_type || '',
        consumptionPricingRates: JSON.parse(row.consumption_pricing_rates),
        startTime: _startTime,
        endTime: _endTime,
        state: state,
    };
};

// Helper: Format user full name from user object
const formatUserFullName = (userObj) => {
    if (!userObj) return '';
    return `${userObj.first_name || ''} ${userObj.last_name || ''}`.trim();
};

// Helper: Format date using dateFormat
const formatDateField = (dateValue) => {
    if (!dateValue) return '';
    return dateFormat(process.env.DATE_FORMAT, db.convert_db_date_to_ist(dateValue));
};

// Helper: Format date as ISO date string (YYYY-MM-DD)
const formatDateString = (dateValue) => {
    if (!dateValue) return '';
    return new Date(dateValue).toISOString().split('T')[0];
};

// Helper: Build view detail results object
const buildViewDetailResults = (row, roleInfo) => {
    const ckr_name = formatUserFullName(row.added_by_user);
    const mkr_name = formatUserFullName(row.ckr_approved_by_user);

    return {
        rate_id: row.rate_id,
        product_id: row.product_id,
        product_name: row.product_name,
        apiproduct: row.apiproduct,
        added_date: formatDateField(row.added_date),
        ckr_full_name: ckr_name,
        display_name: row.display_name,
        description: row.description,
        billing_period: row.billing_period,
        currency_code: row.currency_code,
        one_time_setup_fee: row.one_time_setup_fee,
        fixed_fee_frequency: row.fixed_fee_frequency,
        fixed_recurring_fee: row.fixed_recurring_fee,
        consumption_pricing_type: row.consumption_pricing_type,
        consumption_pricing_rates: row.consumption_pricing_rates ? JSON.parse(row.consumption_pricing_rates) : [],
        state: row.state,
        start_date_type: row.start_date_type,
        start_date: formatDateString(row.start_date),
        expiry_date_type: row.expiry_date_type,
        expiry_date: formatDateString(row.expiry_date),
        activity_type: row.activity_type,
        start_time: row.start_time,
        end_time: row.end_time,
        revenue_share_type: row.revenue_share_type,
        revenue_share_rates: row.revenue_share_rates,
        approve_date: formatDateField(row.ckr_rate_plan_approved_date),
        approve_remark: row.ckr_rate_plan_approved_rmk,
        mkr_name: mkr_name,
        ckr_name: ckr_name,
        is_admin: roleInfo.is_admin,
        is_maker: roleInfo.is_maker,
        is_checker: roleInfo.is_checker,
    };
};

const product_monitization_rate_update = async (req, res, next) => {
    const { rate_id, product_id, displayName, description, one_time_setup_fee, fixedFeeFrequency,
        fixedRecurringFee, consumptionPricingType, consumptionPricingRates, start_type, start_time,
        expiry_type, expiry_time } = req.body;
    const { Product, ProductMonitazationRate } = db.models;

    try {
        // Parse input values
        const _rate_id = parseNumericValue(rate_id);
        const _product_id = parseNumericValue(product_id);
        const _one_time_setup_fee = parseNumericValue(one_time_setup_fee, 0, true);
        const _fixedFeeFrequency = parseNumericValue(fixedFeeFrequency);
        const _fixedRecurringFee = parseNumericValue(fixedRecurringFee, 0, true);
        const _start_type = parseNumericValue(start_type, 1);
        const _expiry_type = parseNumericValue(expiry_type, 1);

        // Validate input
        const validationError = validateMonitizationInput({
            displayName, description, consumptionPricingType, _start_type, start_time, _expiry_type, expiry_time
        });
        if (validationError) {
            return res.status(200).json(success(false, res.statusCode, validationError, null));
        }

        // Get product details
        const row1 = await Product.findOne({
            where: { product_id: _product_id, is_deleted: false },
            attributes: ['product_id', 'product_name']
        });
        if (!row1) {
            return res.status(200).json(success(false, res.statusCode, "Product details not found.", null));
        }

        // Calculate times
        const currentTime = Date.now();
        const _startTime = _start_type === 1 ? currentTime.toString() : new Date(start_time).getTime().toString();
        const _endTime = calculateEndTime(_expiry_type, expiry_time, currentTime);

        // Process consumption pricing rates
        let consumptionPricingRates_new;
        const currencyCode = 'INR';
        if (consumptionPricingType === "FIXED_PER_UNIT") {
            consumptionPricingRates_new = processFixedPerUnitPricing(consumptionPricingRates, currencyCode);
        } else {
            const ratesError = validateBandedPricingRates(consumptionPricingRates);
            if (ratesError) {
                return res.status(200).json(success(false, res.statusCode, ratesError, null));
            }
            consumptionPricingRates_new = consumptionPricingRates;
        }

        // Check user roles
        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);
        if (is_checker) {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have authority.", null));
        }

        // Get existing rate info
        const row3 = await ProductMonitazationRate.findOne({
            where: { rate_id: _rate_id, is_deleted: false },
            attributes: ['rate_id', 'activity_type', 'res_rate_name']
        });
        const res_rate_name = row3?.res_rate_name || '';

        // Common parameters for record building
        const billingPeriod = 'MONTHLY';
        const state = 'PUBLISHED';
        const product_name = row1.product_name;

        const commonParams = {
            productId: _product_id, tokenData: req.token_data, productName: product_name,
            displayName, description, billingPeriod, currencyCode, oneTimeSetupFee: _one_time_setup_fee,
            fixedFeeFrequency: _fixedFeeFrequency, fixedRecurringFee: _fixedRecurringFee,
            consumptionPricingType, consumptionPricingRates: consumptionPricingRates_new,
            state, startType: _start_type, startTime: start_time, expiryType: _expiry_type,
            expiryTime: expiry_time, startTimeCalc: _startTime, endTimeCalc: _endTime
        };

        const apigeeParams = {
            productName: product_name, displayName, description, billingPeriod, currencyCode,
            fixedFeeFrequency: _fixedFeeFrequency, oneTimeSetupFee: _one_time_setup_fee,
            fixedRecurringFee: _fixedRecurringFee, consumptionPricingType,
            consumptionPricingRates: consumptionPricingRates_new, startTime: _startTime,
            endTime: _endTime, state
        };

        // Handle new creation (rate_id == 0)
        if (_rate_id === 0) {
            const recordData = buildRateRecordData(commonParams);
            const apigeePayload = buildApigeeRatePlanPayload(apigeeParams);

            if (is_admin) {
                const result = await handleAdminRateCreation({
                    ProductMonitazationRate, Product, recordData, apigeePayload,
                    productName: product_name, productId: _product_id, tokenData: req.token_data,
                    isUpdate: false
                });
                return res.status(200).json(success(result.success, res.statusCode, result.message, null));
            }

            if (is_maker) {
                const result = await handleMakerRateCreation({
                    ProductMonitazationRate, recordData, productName: product_name,
                    productId: _product_id, tokenData: req.token_data, isUpdate: false
                });
                return res.status(200).json(success(result.success, res.statusCode, result.message, null));
            }
        }

        // Handle update (rate_id > 0)
        const updateRecordData = buildRateRecordData({ ...commonParams, activityType: 1, resRateName: res_rate_name });
        const updateApigeePayload = buildApigeeRatePlanPayload(apigeeParams);

        if (is_admin && row3?.rate_id && res_rate_name?.length > 0) {
            const result = await handleAdminRateCreation({
                ProductMonitazationRate, Product, recordData: updateRecordData,
                apigeePayload: updateApigeePayload, productName: product_name,
                productId: _product_id, tokenData: req.token_data, isUpdate: true,
                ratePlanName: res_rate_name
            });
            return res.status(200).json(success(result.success, res.statusCode, result.message, null));
        }

        // Maker update
        const result = await handleMakerRateCreation({
            ProductMonitazationRate, recordData: updateRecordData, productName: product_name,
            productId: _product_id, tokenData: req.token_data, isUpdate: true
        });
        return res.status(200).json(success(result.success, res.statusCode, result.message, null));

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
        const _rate_id = parseNumericValue(rate_id);
        const _product_id = parseNumericValue(product_id);

        if (!remark || remark.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter remark.", null));
        }

        const [is_admin, is_checker] = await commonModule.getUserRoles(req);

        if (!is_admin && !is_checker) {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have checker/maker authority.", null));
        }

        const row1 = await ProductMonitazationRate.findOne({
            where: { rate_id: _rate_id, product_id: _product_id, is_deleted: false },
            include: [{ model: Product, as: 'product', where: { is_deleted: false }, attributes: ['product_name'] }],
            attributes: ['rate_id', 'product_id', 'is_rate_plan_rejected', 'ckr_rate_plan_rejected_by', 'is_rate_plan_approved', 'ckr_is_rate_plan_approved', 'ckr_rate_plan_is_rejected']
        });

        if (!row1) {
            return res.status(200).json(success(false, res.statusCode, "Product Monetization Rate details not found.", null));
        }

        const validationError = validateRatePlanForRejection(row1);
        if (validationError) {
            return res.status(200).json(success(false, res.statusCode, validationError, null));
        }

        const affectedRows = await rejectRatePlan(ProductMonitazationRate, _rate_id, _product_id, req.token_data, remark);

        if (affectedRows <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Unable to reject, Please try again.", null));
        }

        const userRole = is_admin ? 'admin' : 'checker';
        logMonitizationAction(req.token_data, `App Product Monitazation Rate rejected by ${userRole}. Product Name = ${row1.product.product_name}`,
            { rate_id: _rate_id, product_id: _product_id, rejected_by: req.token_data.account_id });

        return res.status(200).json(success(true, res.statusCode, "Product Monetization Rate Value rejected successfully.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const product_monitization_rate_approve = async (req, res, next) => {
    const { rate_id, product_id, remark } = req.body;
    const { Product, ProductMonitazationRate } = db.models;
    try {
        const _rate_id = parseNumericValue(rate_id);
        const _product_id = parseNumericValue(product_id);

        if (!remark || remark.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter remark.", null));
        }

        const [is_admin, is_checker] = await commonModule.getUserRoles(req);

        if (!is_admin && !is_checker) {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have checker/maker authority.", null));
        }

        const row1 = await ProductMonitazationRate.findOne({
            where: { rate_id: _rate_id, product_id: _product_id, is_deleted: false },
            include: [{ model: Product, as: 'product', where: { is_deleted: false }, attributes: [] }],
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

        const validationError = validateRatePlanForApproval(row1);
        if (validationError) {
            return res.status(200).json(success(false, res.statusCode, validationError, null));
        }

        const payload = buildApprovePayloadFromRow(row1);
        const isUpdate = row1.activity_type === 1 && row1.res_rate_name?.length > 0;
        const method = isUpdate ? 'PUT' : 'POST';
        const ratePlanName = isUpdate ? row1.res_rate_name : null;

        const { ok, data: responseData } = await callApigeeRatePlanApi(row1.product_name, ratePlanName, payload, method);

        if (!ok || !responseData?.name || !responseData?.displayName) {
            const errorMsg = getApigeeErrorMessage(responseData);
            return res.status(200).json(success(false, res.statusCode, errorMsg || "Unable to Add Product Monetization Rate, Please try again.", null));
        }

        const affectedRows = await approveRatePlan(ProductMonitazationRate, Product, _rate_id, _product_id, req.token_data, remark, responseData, payload);

        if (affectedRows <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Unable to Add Product Monetization Rate, Please try again.", null));
        }

        logMonitizationAction(req.token_data, `Product Monetization Rate added. Product name = ${row1.product_name}`,
            { product_id: _product_id, monitization_rate_id: _rate_id });

        return res.status(200).json(success(true, res.statusCode, "Product Monetization Rate Added successfully.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

const product_monitization_rate_req_view_detail = async (req, res, next) => {
    const { rate_id } = req.body;
    const { Product, ProductMonitazationRate, AdmUser } = db.models;
    try {
        const _rate_id = parseNumericValue(rate_id);
        const [is_admin, is_checker, is_maker] = await commonModule.getUserRoles(req);

        if (!is_admin && !is_checker && !is_maker) {
            return res.status(500).json(success(false, API_STATUS.BACK_TO_DASHBOARD.value, "You do not have checker/maker authority.", null));
        }

        const row1 = await ProductMonitazationRate.findOne({
            where: { rate_id: _rate_id, is_deleted: false },
            include: [
                { model: Product, as: 'product', where: { is_deleted: false }, attributes: [] },
                { model: AdmUser, as: 'added_by_user', required: false, attributes: ['first_name', 'last_name'] },
                { model: AdmUser, as: 'ckr_approved_by_user', required: false, attributes: ['first_name', 'last_name'] }
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

        const results = buildViewDetailResults(row1, { is_admin, is_maker, is_checker });
        return res.status(200).json(success(true, res.statusCode, "Product Monitazation Details Data.", results));
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
