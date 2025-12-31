import { logger as _logger } from '../logger/winston.js';
import db from '../database/db_helper.js';
import { Sequelize } from 'sequelize';
import { success } from "../model/responseModel.js";
import validator from 'validator';
import * as apigeeService from "../services/apigeeService.js";
const getModels = () => db.models;

const apigee_api_request = async (req, res, next) => {
    const { endpoint, json_body } = req.body;
    try {
        const { cst_customer ,Endpoint,Proxies,CstCredits ,CstCreditsUsed } = getModels();

        const row0 = await cst_customer.findOne({
            where:{
                customer_id:req.token_data.customer_id,
                is_deleted:false
            },
            attributes:['customer_id','total_credits','developer_id','is_enabled','email_id','is_live_sandbox']
        });

        
        // const _query0 = `SELECT customer_id, total_credits, developer_id, is_enabled, email_id, is_live_sandbox FROM cst_customer WHERE customer_id = ? AND is_deleted = false`;
        // const row0 = await db.sequelize.query(_query0, { replacements: [req.token_data.customer_id], type: QueryTypes.SELECT, });
        if (!row0) {
            return res.status(200).json(success(false, res.statusCode, "Customer details not found, Please try again.", null));
        }
        if (!row0.is_live_sandbox ) {
            return res.status(200).json(success(false, res.statusCode, "Sandbox functionality is available only for sandbox customer .", null));
        }
        if (row0.total_credits && row0.total_credits <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Exceeded Available Credits. Please Contact Admin.", null));
        }

        let endpoint_id = endpoint && validator.isNumeric(endpoint.toString()) ? parseInt(endpoint) : 0;

        const row1 = await Endpoint.findOne({
            where:{
               endpoint_id,
                is_deleted:false,
                [Sequelize.Op.or]:[
                    {is_published:true},
                    {is_product_published:true}
                ]
            },
            attributes:[
                'display_name',
                'endpoint_url',
                'updated_endpoint',
                'methods',
                'path_params',
                'header_param',
                'request_schema',
                'request_sample'
            ],
            include:[
                {
                    model:Proxies,
                    required:true,
                    where:{
                        is_published:true,
                        is_deleted:false
                    },
                    attributes:[
                        'proxy_id',
                        'product_id',
                        'proxy_name'
                    ]
                }
            ]
        })
        // const _query1 = `SELECT p.proxy_id, p.product_id, p.proxy_name, e.display_name, e.endpoint_url, e.updated_endpoint, e.methods, e.path_params, e.header_param, e.request_schema, e.request_sample
        // FROM endpoint e INNER JOIN proxies p ON e.proxy_id = p.proxy_id WHERE e.endpoint_id = ? AND (e.is_published = true OR e.is_product_published = true) AND e.is_deleted = false
        // AND p.is_published = true AND p.is_deleted = false `;
        // const row1 = await db.sequelize.query(_query1, { replacements: [endpoint_id], type: QueryTypes.SELECT });

        if(!row1){
            return res.status(200).json(
                success(false, res.statusCode, "unable to process, please try again after sometime.", null
                )
            )
        }
      
            let endpoint_url = row1.updated_endpoint && row1.updated_endpoint.toString().length > 0 ? row1.updated_endpoint : row1.endpoint_url;
            let methods = row1.methods;
            console.log("---------endpoint_url---------------------", endpoint_url);
            const res_data = await apigeeService.apigee_api_request_call(endpoint_url, methods, json_body);
            console.log("res_data: ", res_data);
            try {
                const total_credit = row0.total_credits;
                const updatedCredits = parseInt(total_credit) - 1;

                // if debited entry transaction maintain
                const description = (
                    (row1 && (row1.display_name || row1.proxy_name))
                        ? `API: ${row1.display_name || row1.proxy_name}`
                        : null
                );

                const _replacements2 = await CstCredits.create(
                    {
                        customer_id: req.token_data.customer_id,
                        credits: 1,
                        added_by: req.token_data.account_id,
                        added_date: db.get_ist_current_date(),
                        description: description,
                        transaction_type: 2
                    }
                )
                // const credit_id = _replacements2.credit_id;
                // const _query1 = `INSERT INTO cst_credits(customer_id, credits, added_by, added_date, description,transaction_type) VALUES (?, ?, ?, ?, ?, ?)RETURNING "credit_id"`;
                // const _replacements2 = [req.token_data.customer_id, 1, req.token_data.account_id, db.get_ist_current_date(), description, 2];
                // const [rowOut] = await db.sequelize.query(_query1, { replacements: _replacements2, type: QueryTypes.INSERT });
                //     const credit_id = (rowOut && rowOut.length > 0 && rowOut[0] ? rowOut[0].credit_id : 0);
                //     if (credit_id > 0) {
                //    // await customerService.send_activation_link(customer_id);
                //     try {
                //         let data_to_log = {
                //             correlation_id: correlator.getId(),
                //             token_id: 0,
                //             account_id: (req.token_data.account_id),
                //             user_type: 2,
                //             user_id: req.token_data.customer_id,
                //             narration: 'credits add & credit add mail sent sent.',
                //             query: db.buildQuery_Array(_query1, _replacements2),
                //         }
                //         action_logger.info(JSON.stringify(data_to_log));
                //     } catch (_) { }
                //     }


                const [affectedRows] = await cst_customer.update(
                    {
                        total_credits: updatedCredits
                    },
                    {
                        where: {
                            customer_id: req.token_data.customer_id
                        }
                    }
                )
                // const _query3 = `UPDATE cst_customer SET total_credits = ? WHERE customer_id = ?`;
                // const _replacements3 = [updatedCredits, req.token_data.customer_id];
                // const [, i] = await db.sequelize.query(_query3, { replacements: _replacements3, type: QueryTypes.UPDATE, });
                if (affectedRows > 0) {
                    console.log("Credit deducted successfully. New total credits: " + updatedCredits);
                } else {
                    console.log("Failed to deduct credit.");
                }
                const request_body = JSON.stringify(json_body);
                const response_body = JSON.stringify(res_data);
                // const _query2 = `INSERT INTO cst_credits_used(customer_id, product_id, proxy_id, endpoint_id, added_date, api_url, request_body, response_body)
                // VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING "credit_used_id"`;
                // const [row2] = await db.sequelize.query(_query2, {
                //     replacements: [req.token_data.customer_id, row1[0].product_id, row1[0].proxy_id, endpoint_id, db.get_ist_current_date(), endpoint_url, request_body, response_body], type: QueryTypes.INSERT
                // });

                 await CstCreditsUsed.create(
                    {
                        customer_id: req.token_data.customer_id,
                        product_id: row1.Proxies.product_id,
                        proxy_id: row1.Proxies.proxy_id,
                        endpoint_id: endpoint_id,
                        added_date: db.get_ist_current_date(),
                        api_url: endpoint_url,
                        request_body: request_body,
                        response_body: response_body
                    }
                )

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
