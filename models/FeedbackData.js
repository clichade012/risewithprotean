import { DataTypes } from 'sequelize';

const FeedbackDataModel = (sequelize) => {
    const FeedbackData = sequelize.define('FeedbackData', {
        feedback_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        ticket_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        customer_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        category_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        first_name: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        last_name: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        email_id: {
            type: DataTypes.STRING(150),
            allowNull: true,
        },
        company_name: {
            type: DataTypes.STRING(200),
            allowNull: true,
        },
        network_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        mobile_no: {
            type: DataTypes.STRING(20),
            allowNull: true,
        },
        subject: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        message: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        is_deleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        added_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    }, {
        tableName: 'feedback_data',
        timestamps: false,
    });

    return FeedbackData;
};

export default FeedbackDataModel;
