import { logger as _logger } from '../logger/winston.js';
import db from '../database/db_helper.js';
import { Sequelize } from 'sequelize';
import { success } from "../model/responseModel.js";
import validator from 'validator';
import * as apigeeService from "../services/apigeeService.js";
const getModels = () => db.models;

// Helper: Validate customer for sandbox access
const validateCustomerForSandbox = (customer) => {
    if (!customer) return "Customer details not found, Please try again.";
    if (!customer.is_live_sandbox) return "Sandbox functionality is available only for sandbox customer.";
    if (customer.total_credits && customer.total_credits <= 0) return "Exceeded Available Credits. Please Contact Admin.";
    return null;
};

// Helper: Handle credit deduction and logging
const handleCreditDeduction = async (customer, endpointData, endpoint_id, json_body, res_data, token_data) => {
    const { cst_customer, CstCredits, CstCreditsUsed } = getModels();
    const updatedCredits = parseInt(customer.total_credits) - 1;
    const displayName = endpointData?.display_name || endpointData?.Proxies?.proxy_name;
    const description = displayName ? "API: " + displayName : null;

    await CstCredits.create({
        customer_id: token_data.customer_id,
        credits: 1,
        added_by: token_data.account_id,
        added_date: db.get_ist_current_date(),
        description,
        transaction_type: 2
    });

    const [affectedRows] = await cst_customer.update(
        { total_credits: updatedCredits },
        { where: { customer_id: token_data.customer_id } }
    );

    if (affectedRows > 0) {
        console.log("Credit deducted successfully. New total credits: " + updatedCredits);
    } else {
        console.log("Failed to deduct credit.");
    }

    const endpoint_url = endpointData.updated_endpoint?.length > 0 ? endpointData.updated_endpoint : endpointData.endpoint_url;

    await CstCreditsUsed.create({
        customer_id: token_data.customer_id,
        product_id: endpointData.Proxies.product_id,
        proxy_id: endpointData.Proxies.proxy_id,
        endpoint_id,
        added_date: db.get_ist_current_date(),
        api_url: endpoint_url,
        request_body: JSON.stringify(json_body),
        response_body: JSON.stringify(res_data)
    });
};

const apigee_api_request = async (req, res, next) => {
    const { endpoint, json_body } = req.body;
    try {
        const { cst_customer, Endpoint, Proxies } = getModels();

        const row0 = await cst_customer.findOne({
            where: { customer_id: req.token_data.customer_id, is_deleted: false },
            attributes: ['customer_id', 'total_credits', 'developer_id', 'is_enabled', 'email_id', 'is_live_sandbox']
        });

        const validationError = validateCustomerForSandbox(row0);
        if (validationError) {
            return res.status(200).json(success(false, res.statusCode, validationError, null));
        }

        const endpoint_id = endpoint && validator.isNumeric(endpoint.toString()) ? parseInt(endpoint) : 0;

        const row1 = await Endpoint.findOne({
            where: {
                endpoint_id,
                is_deleted: false,
                [Sequelize.Op.or]: [{ is_published: true }, { is_product_published: true }]
            },
            attributes: ['display_name', 'endpoint_url', 'updated_endpoint', 'methods', 'path_params', 'header_param', 'request_schema', 'request_sample'],
            include: [{
                model: Proxies,
                required: true,
                where: { is_published: true, is_deleted: false },
                attributes: ['proxy_id', 'product_id', 'proxy_name']
            }]
        });

        if (!row1) {
            return res.status(200).json(success(false, res.statusCode, "unable to process, please try again after sometime.", null));
        }

        const endpoint_url = row1.updated_endpoint?.length > 0 ? row1.updated_endpoint : row1.endpoint_url;
        console.log("---------endpoint_url---------------------", endpoint_url);

        const res_data = await apigeeService.apigee_api_request_call(endpoint_url, row1.methods, json_body);
        console.log("res_data: ", res_data);

        try {
            await handleCreditDeduction(row0, row1, endpoint_id, json_body, res_data, req.token_data);
        } catch (err) {
            console.log(err);
            _logger.error(err.stack);
        }

        return res.status(200).json(success(true, res.statusCode, "success", res_data));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};

export {
    apigee_api_request,
};
