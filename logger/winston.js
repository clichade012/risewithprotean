import winston from 'winston';
import 'winston-mongodb';
import winstonRotator from 'winston-daily-rotate-file';
import correlator from 'express-correlation-id';

const { combine, timestamp, json } = winston.format;

const fileRotateTransport = new winston.transports.DailyRotateFile({
    filename: 'logs/%DATE%.log',
    datePattern: 'yyyy-MM-DD',
    maxFiles: '90d',
});

export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: combine(
        winston.format((data) => {
            data.correlation_id = correlator.getId();
            return data;
        })(),
        timestamp(),
        json()
    ),
    transports: [fileRotateTransport],
});

const createMongoDBTransport = (collection) => {
    if (!process.env.MONGO_DB_URL) {
        return null;
    }
    return new winston.transports.MongoDB({
        db: process.env.MONGO_DB_URL,
        dbName: process.env.MONGO_DB_NAME,
        collection: collection,
        options: {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        },
        level: 'info'
    });
};

const createLoggerWithMongo = (collection) => {
    const transports = [];
    const mongoTransport = createMongoDBTransport(collection);
    if (mongoTransport) {
        transports.push(mongoTransport);
    } else {
        // Fallback to file transport if MongoDB is not configured
        transports.push(fileRotateTransport);
    }
    return winston.createLogger({
        format: combine(timestamp(), json()),
        transports: transports
    });
};

export const api_logger = createLoggerWithMongo('api_call_logs');

export const action_logger = createLoggerWithMongo('user_action_logs');

export const log_payment = createLoggerWithMongo('PaymentLog');

export default { logger, api_logger, action_logger, log_payment };
