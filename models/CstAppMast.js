import { DataTypes } from 'sequelize';

const CstAppMastModel = (sequelize) => {
    const CstAppMast = sequelize.define('CstAppMast', {
        app_id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
        },
        customer_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        app_name: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        display_name: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        expected_volume: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        callback_url: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },
        ip_addresses: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        certificate_file: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },
        cert_public_key: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        is_enabled: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        is_deleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        is_approved: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        approved_by: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        approve_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        approve_remark: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        is_rejected: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        rejected_by: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        rejected_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        reject_remark: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        in_live_env: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        is_live_app_created: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        live_app_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        live_by: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        live_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        live_remark: {
            type: DataTypes.TEXT,
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
        mkr_is_approved: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        mkr_approved_by: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        mkr_approved_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        mkr_approved_rmk: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        mkr_is_rejected: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        mkr_rejected_by: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        mkr_rejected_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        mkr_rejected_rmk: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        api_key: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        api_secret: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        key_issued_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        key_expiry_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        apigee_app_id: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        apigee_status: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        json_data: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        kvm_json_data: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        app_wallet_rate_added_by: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        app_wallet_rate_added_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        app_wallet_rate_data: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        app_wallet_rate_kvm_json_data: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        app_routing_logic: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        app_routing_logic_added_by: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        app_routing_logic_added_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        app_kvm_json_data: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        is_monetization_enabled: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        is_monetization_added: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        monetization_kvm_json_data: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        monetization_enabled_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        is_monetization_rate_appliacable: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
    }, {
        tableName: 'cst_app_mast',
        timestamps: false,
    });

    return CstAppMast;
};

export default CstAppMastModel;
