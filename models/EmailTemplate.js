import { DataTypes } from 'sequelize';

const EmailTemplateModel = (sequelize) => {
    const EmailTemplate = sequelize.define('EmailTemplate', {
        template_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
        },
        template_name: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        subject: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },
        body_text: {
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
        tableName: 'email_template',
        timestamps: false,
    });

    return EmailTemplate;
};

export default EmailTemplateModel;
