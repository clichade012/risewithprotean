import { logger as _logger } from '../../logger/winston.js';
import db from '../../database/db_helper.js';
import { success } from "../../model/responseModel.js";
import dateFormat from 'date-format';
import validator from 'validator';
import { MongoClient } from 'mongodb';

// Helper function to get models - must be called after db is initialized
const getModels = () => db.models;

// Helper: Parse numeric value with default
const parseNumericWithDefault = (value, defaultVal = 0) => {
    return value && validator.isNumeric(value.toString()) ? parseInt(value) : defaultVal;
};

// Helper: Get current date string
const getCurrentDateString = () => {
    const tmpDate = new Date();
    const currDate = new Date(tmpDate.getFullYear(), tmpDate.getMonth(), tmpDate.getDate(), 0, 0, 0, 0);
    return dateFormat('yyyy-MM-dd hh:mm:ss', currDate);
};

// Helper: Build date filter for MongoDB
const buildDateFilter = (from_date, upto_date) => {
    const defaultDate = getCurrentDateString();
    return {
        $gte: db.string_to_date(from_date?.length > 0 ? from_date : defaultDate),
        $lt: db.upto_date(db.string_to_date(upto_date?.length > 0 ? upto_date : defaultDate))
    };
};

// Helper: Build search filter conditions
const buildSearchConditions = (userType, searchText) => {
    const conditions = [];
    if (userType > 0) {
        conditions.push({ message: { $regex: '"user_type":' + userType + ',', $options: 'i' } });
    }
    if (searchText.length > 0) {
        conditions.push({ message: { $regex: searchText, $options: 'i' } });
    }
    return conditions.length > 0 ? { $and: conditions } : {};
};

// Helper: Get user info by type
const getUserInfo = async (userType, userId) => {
    const { AdmUser, CstCustomer } = getModels();
    let row = null;

    if (userType === 1) {
        row = await AdmUser.findOne({
            where: { admin_id: userId },
            attributes: ['first_name', 'last_name', 'email_id']
        });
    } else if (userType === 2) {
        row = await CstCustomer.findOne({
            where: { customer_id: userId },
            attributes: ['first_name', 'last_name', 'email_id']
        });
    }

    if (!row) return { full_name: '', email_id: '' };
    return {
        full_name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
        email_id: row.email_id || ''
    };
};

// Helper: Create empty log entry
const createEmptyLogEntry = (seq_no, extraFields = {}) => ({
    seq_no,
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
    ...extraFields
});

// Helper: Fetch API history by correlation ID
const fetchApiHistory = async (collection, correlationId) => {
    if (!correlationId) return {};
    const regexPattern = new RegExp(correlationId, 'i');
    const doc = await collection.findOne({ message: { $regex: regexPattern } });
    return doc?.message ? db.convertStringToJson(doc.message) : {};
};

// Helper: Process single user log document
const processUserLogDocument = async (item, index, pageNo, pageSize, apiCollection) => {
    const seq_no = (pageNo - 1) * pageSize + (index + 1);
    const log_object = db.convertStringToJson(item.message);

    if (!log_object) {
        return createEmptyLogEntry(seq_no, { narration: '' });
    }

    const userInfo = await getUserInfo(log_object.user_type, log_object.user_id);
    const apiHistory = await fetchApiHistory(apiCollection, log_object.correlation_id);

    return {
        seq_no,
        correlation_id: log_object.correlation_id || '',
        full_name: userInfo.full_name,
        email_id: userInfo.email_id,
        narration: log_object.narration || '',
        date_time: log_object.date_time ? db.convert_dateformat(log_object.date_time) : '',
        payload: apiHistory.payload || '',
        response: apiHistory.response || '',
        url: apiHistory.url || '',
        method: apiHistory.method || '',
        ip_address: apiHistory.ip_address || ''
    };
};



const api_history_logs = async (req, res, next) => {
    const { page_no, userType, search_text, from_date, upto_date } = req.body;
    const _page_no = Math.max(1, parseNumericWithDefault(page_no, 1));
    const _userType = parseNumericWithDefault(userType);
    const _search_text = search_text?.length > 0 ? search_text : '';
    const pageSize = parseInt(process.env.PAGINATION_SIZE);

    const client = new MongoClient(process.env.MONGO_DB_URL, { serverSelectionTimeoutMS: 10000 });

    try {
        await client.connect();
        const collection = client.db(process.env.MONGO_DB_NAME).collection('api_call_logs');

        const filter = {
            timestamp: buildDateFilter(from_date, upto_date),
            ...buildSearchConditions(_userType, _search_text)
        };

        const documentCount = await collection.countDocuments(filter);
        const documents = await collection.find(filter).skip((_page_no - 1) * pageSize).limit(pageSize).toArray();

        const log_data = await Promise.all((documents || []).map(async (item, i) => {
            const seq_no = (_page_no - 1) * pageSize + (i + 1);
            const log_object = db.convertStringToJson(item.message);

            if (!log_object) return createEmptyLogEntry(seq_no);

            const userInfo = await getUserInfo(log_object.user_type, log_object.table_id);

            return {
                seq_no,
                correlation_id: log_object.correlation_id,
                full_name: userInfo.full_name,
                email_id: userInfo.email_id,
                url: log_object.url,
                method: log_object.method,
                ip_address: log_object.ip_address,
                date_time: log_object.date_time ? db.convert_dateformat(log_object.date_time) : '',
                user_type: log_object.user_type,
                payload: log_object.payload,
                response: log_object.response
            };
        }));

        const results = {
            total_record: documentCount,
            current_page: _page_no,
            page_size: pageSize,
            log_data
        };
        return res.status(200).json(success(true, res.statusCode, "Audit Logs.", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    } finally {
        await client.close();
    }
};

const user_history_logs = async (req, res, next) => {
    const { page_no, userType, search_text, from_date, upto_date } = req.body;
    const _page_no = Math.max(1, parseNumericWithDefault(page_no, 1));
    const _userType = parseNumericWithDefault(userType);
    const _search_text = search_text?.length > 0 ? search_text : '';
    const pageSize = parseInt(process.env.PAGINATION_SIZE);

    const client = new MongoClient(process.env.MONGO_DB_URL, { serverSelectionTimeoutMS: 10000 });

    try {
        await client.connect();
        const database = client.db(process.env.MONGO_DB_NAME);
        const collection = database.collection('user_action_logs');
        const apiCollection = database.collection('api_call_logs');

        const filter = {
            timestamp: buildDateFilter(from_date, upto_date),
            ...buildSearchConditions(_userType, _search_text)
        };

        const documentCount = await collection.countDocuments(filter);
        const documents = await collection.find(filter)
            .skip((_page_no - 1) * pageSize)
            .limit(pageSize)
            .toArray();

        const log_data = await Promise.all(
            (documents || []).map((item, index) =>
                processUserLogDocument(item, index, _page_no, pageSize, apiCollection)
            )
        );

        const results = {
            total_record: documentCount,
            current_page: _page_no,
            page_size: pageSize,
            log_data
        };
        return res.status(200).json(success(true, res.statusCode, "Audit Logs.", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    } finally {
        await client.close();
    }
};


export default {
    api_history_logs,
    user_history_logs,
};
