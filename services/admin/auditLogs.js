import { logger as _logger, api_logger as _api_logger } from '../../logger/winston.js';
import db from '../../database/db_helper.js';
import { success } from "../../model/responseModel.js";
import dateFormat from 'date-format';
import validator from 'validator';
import { MongoClient } from 'mongodb';

// Helper function to get models - must be called after db is initialized
const getModels = () => db.models;

const api_history_logs = async (req, res, next) => {
    const { page_no, userType, search_text, from_date, upto_date } = req.body;
    let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0; if (_page_no <= 0) { _page_no = 1; }
    let _userType = userType && validator.isNumeric(userType.toString()) ? parseInt(userType) : 0;
    let _search_text = ''; if (search_text && search_text.length > 0) { _search_text = search_text; }
    // const client = new MongoClient(process.env.MONGO_DB_URL, { useNewUrlParser: true, useUnifiedTopology: true });
    const client = new MongoClient(process.env.MONGO_DB_URL, {
        serverSelectionTimeoutMS: 10000, // Increase timeout
    });
    try {
        const { AdmUser, CstCustomer } = getModels();

        await client.connect();
        const database = client.db(process.env.MONGO_DB_NAME);
        const collection = database.collection('api_call_logs');

        const tmpDate = new Date();
        const currDate = new Date(tmpDate.getFullYear(), tmpDate.getMonth(), tmpDate.getDate(), 0, 0, 0, 0);
        let newDate = dateFormat('yyyy-MM-dd hh:mm:ss', currDate);

        const filter = {};
        filter.timestamp = {
            $gte: db.string_to_date(from_date && from_date.length > 0 ? from_date : newDate),
            $lt: db.upto_date(db.string_to_date(upto_date && upto_date.length > 0 ? upto_date : newDate))
        };
        if (_userType > 0 || _search_text.length > 0) {
            filter.$and = [];
            if (_userType > 0) {
                filter.$and.push({ message: { $regex: '"user_type":' + _userType + ',', $options: 'i' } });
            }
            if (_search_text.length > 0) {
                filter.$and.push({ message: { $regex: _search_text, $options: 'i' } });
            }
        }
        const documentCount = await collection.countDocuments(filter);
        const documents = await collection.find(filter).skip((_page_no - 1) * parseInt(process.env.PAGINATION_SIZE)).limit(parseInt(process.env.PAGINATION_SIZE)).toArray();

        let log_data = [];
        if (documents) {
            for (let i = 0; i < documents.length; i++) {
                const item = documents[i];
                const log_object = db.convertStringToJson(item.message);
                if (log_object != null) {
                    let full_name = ""; let email_id = "";
                    if (log_object.user_type && log_object.user_type == 1) {
                        // SELECT FROM adm_user - Using ORM
                        const row1 = await AdmUser.findOne({
                            where: { admin_id: log_object.table_id },
                            attributes: ['first_name', 'last_name', 'email_id']
                        });
                        if (row1) {
                            full_name = `${row1.first_name || ''} ${row1.last_name || ''}`.trim();
                            email_id = row1.email_id;
                        }
                    }
                    if (log_object.user_type && log_object.user_type == 2) {
                        // SELECT FROM cst_customer - Using ORM
                        const row1 = await CstCustomer.findOne({
                            where: { customer_id: log_object.table_id },
                            attributes: ['first_name', 'last_name', 'email_id']
                        });
                        if (row1) {
                            full_name = `${row1.first_name || ''} ${row1.last_name || ''}`.trim();
                            email_id = row1.email_id;
                        }
                    }
                    log_data.push({
                        seq_no: ((_page_no - 1) * parseInt(process.env.PAGINATION_SIZE) + (i + 1)),
                        correlation_id: log_object.correlation_id,
                        full_name: full_name,
                        email_id: email_id,
                        url: log_object.url,
                        method: log_object.method,
                        ip_address: log_object.ip_address,
                        date_time: log_object.date_time ? db.convert_dateformat(log_object.date_time) : '',
                        user_type: log_object.user_type,
                        payload: log_object.payload,
                        response: log_object.response,
                    });
                } else {
                    log_data.push({
                        seq_no: ((_page_no - 1) * parseInt(process.env.PAGINATION_SIZE) + (i + 1)),
                        correlation_id: '',
                        full_name: '',
                        email_id: '',
                        url: '',
                        method: '',
                        ip_address: '',
                        date_time: '',
                        user_type: '',
                        payload: '',
                        response: '',
                    });
                }
            }
        }
        let results = {
            total_record: documentCount,
            current_page: _page_no,
            page_size: parseInt(process.env.PAGINATION_SIZE),
            log_data: log_data,
        }
        return res.status(200).json(success(true, res.statusCode, "Audit Logs.", results));
    } catch (err) {
        console.log(err.stack)
        _logger.error(err.stack);
        await client.close();
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};





const user_history_logs = async (req, res, next) => {
    const { page_no, userType, search_text, from_date, upto_date } = req.body;
    let _page_no = page_no && validator.isNumeric(page_no.toString()) ? parseInt(page_no) : 0; if (_page_no <= 0) { _page_no = 1; }
    let _userType = userType && validator.isNumeric(userType.toString()) ? parseInt(userType) : 0;
    let _search_text = ''; if (search_text && search_text.length > 0) { _search_text = search_text; }
    // const client = new MongoClient(process.env.MONGO_DB_URL, { useNewUrlParser: true, useUnifiedTopology: true });
    const client = new MongoClient(process.env.MONGO_DB_URL, {
        serverSelectionTimeoutMS: 10000, // Increase timeout
    });
    try {
        const { AdmUser, CstCustomer } = getModels();

        await client.connect();
        const database = client.db(process.env.MONGO_DB_NAME);
        const collection = database.collection('user_action_logs');

        const tmpDate = new Date();
        const currDate = new Date(tmpDate.getFullYear(), tmpDate.getMonth(), tmpDate.getDate(), 0, 0, 0, 0);
        let newDate = dateFormat('yyyy-MM-dd hh:mm:ss', currDate);

        const filter = {};
        filter.timestamp = {
            $gte: db.string_to_date(from_date && from_date.length > 0 ? from_date : newDate),
            $lt: db.upto_date(db.string_to_date(upto_date && upto_date.length > 0 ? upto_date : newDate))
        };
        if (_userType > 0 || _search_text.length > 0) {
            filter.$and = [];
            if (_userType > 0) {
                filter.$and.push({ message: { $regex: '"user_type":' + _userType + ',', $options: 'i' } });
            }
            if (_search_text.length > 0) {
                filter.$and.push({ message: { $regex: _search_text, $options: 'i' } });
            }
        }
        const documentCount = await collection.countDocuments(filter);
        const documents = await collection.find(filter).skip((_page_no - 1) * parseInt(process.env.PAGINATION_SIZE)).limit(parseInt(process.env.PAGINATION_SIZE)).toArray();

        let log_data = [];
        const collection_api_call_logs = database.collection('api_call_logs');
        if (documents) {
            for (let i = 0; i < documents.length; i++) {
                const item = documents[i];
                const log_object = db.convertStringToJson(item.message);
                if (log_object != null) {
                    let full_name = ""; let email_id = "";
                    if (log_object.user_type && log_object.user_type == 1) {
                        // SELECT FROM adm_user - Using ORM
                        const row1 = await AdmUser.findOne({
                            where: { admin_id: log_object.user_id },
                            attributes: ['first_name', 'last_name', 'email_id']
                        });
                        if (row1) {
                            full_name = `${row1.first_name || ''} ${row1.last_name || ''}`.trim();
                            email_id = row1.email_id;
                        }
                    }
                    if (log_object.user_type && log_object.user_type == 2) {
                        // SELECT FROM cst_customer - Using ORM
                        const row1 = await CstCustomer.findOne({
                            where: { customer_id: log_object.user_id },
                            attributes: ['first_name', 'last_name', 'email_id']
                        });
                        if (row1) {
                            full_name = `${row1.first_name || ''} ${row1.last_name || ''}`.trim();
                            email_id = row1.email_id;
                        }
                    }
                    const regexPattern = new RegExp(log_object.correlation_id, 'i');
                    const documents_api_history = await collection_api_call_logs.findOne({ message: { $regex: regexPattern } });
                    const api_history_obj = documents_api_history.message ? db.convertStringToJson(documents_api_history.message) : {};
                    log_data.push({
                        seq_no: ((_page_no - 1) * parseInt(process.env.PAGINATION_SIZE) + (i + 1)),
                        correlation_id: log_object.correlation_id,
                        full_name: full_name,
                        email_id: email_id,
                        narration: log_object.narration,
                        date_time: log_object.date_time ? db.convert_dateformat(log_object.date_time) : '',
                        payload: api_history_obj.payload,
                        response: api_history_obj.response,
                        url: api_history_obj.url,
                        method: api_history_obj.method,
                        ip_address: api_history_obj.ip_address,
                    });
                } else {
                    log_data.push({
                        seq_no: ((_page_no - 1) * parseInt(process.env.PAGINATION_SIZE) + (i + 1)),
                        correlation_id: '',
                        full_name: '',
                        email_id: '',
                        narration: '',
                        date_time: '',
                        payload: '',
                        response: '',
                        url: '',
                        method: '',
                        ip_address: '',
                    });
                }
            }
        }
        let results = {
            total_record: documentCount,
            current_page: _page_no,
            page_size: parseInt(process.env.PAGINATION_SIZE),
            log_data: log_data,
        }
        return res.status(200).json(success(true, res.statusCode, "Audit Logs.", results));
    } catch (err) {
        console.log(err.stack)
        _logger.error(err.stack);
        await client.close();
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
};


export default {
    api_history_logs,
    user_history_logs,
};
