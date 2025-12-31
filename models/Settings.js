import { DataTypes } from 'sequelize';

const SettingsModel = (sequelize) => {
    const Settings = sequelize.define('Settings', {
        table_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        logo_path: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        copyright: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        apigee_access_token: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        apigee_token_expiry: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        apigee_cst_access_token: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        apigee_cst_token_expiry: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        is_sandbox_auto_approve: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        is_live_auto_approve: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        is_auto_approve_customer: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        auto_approve_customer_modify_by: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        auto_approve_customer_modify_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        modify_by: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        modify_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    }, {
        tableName: 'settings',
        timestamps: false,
    });

    return Settings;
};

export default SettingsModel;
