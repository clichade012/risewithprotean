import { DataTypes } from 'sequelize';

const SmsTemplateModel = (sequelize) => {
    const SmsTemplate = sequelize.define('SmsTemplate', {
        template_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
        },
        template_name: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        message_text: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        is_enabled: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        sort_order: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        added_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        modify_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        added_by: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        modify_by: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
    }, {
        tableName: 'sms_template',
        timestamps: false,
    });

    return SmsTemplate;
};

export default SmsTemplateModel;
