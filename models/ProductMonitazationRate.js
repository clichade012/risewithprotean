import { DataTypes } from 'sequelize';

const ProductMonitazationRateModel = (sequelize) => {
    const ProductMonitazationRate = sequelize.define('ProductMonitazationRate', {
        rate_id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
        },
        product_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        rate_name: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        rate_value: {
            type: DataTypes.DECIMAL(18, 4),
            allowNull: true,
        },
        product_name: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        apiproduct: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        display_name: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        description: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        billing_period: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        currency_code: {
            type: DataTypes.STRING(10),
            allowNull: true,
        },
        one_time_setup_fee: {
            type: DataTypes.DECIMAL(18, 4),
            allowNull: true,
            defaultValue: 0,
        },
        fixed_fee_frequency: {
            type: DataTypes.INTEGER,
            allowNull: true,
            defaultValue: 0,
        },
        fixed_recurring_fee: {
            type: DataTypes.DECIMAL(18, 4),
            allowNull: true,
            defaultValue: 0,
        },
        consumption_pricing_type: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        consumption_pricing_rates: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        state: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        revenue_share_type: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        revenue_share_rates: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        rate_plan_json_data: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        rate_plan_json_send_data: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        rate_plan_json_res_data: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        res_rate_name: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        is_rate_plan_approved: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        is_rate_plan_rejected: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        ckr_is_rate_plan_approved: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        ckr_rate_plan_approved_by: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        ckr_rate_plan_approved_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        ckr_rate_plan_approved_rmk: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        ckr_rate_plan_is_rejected: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        ckr_rate_plan_rejected_by: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        ckr_rate_plan_rejected_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        ckr_rate_plan_rejected_rmk: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        start_date_type: {
            type: DataTypes.INTEGER,
            allowNull: true,
            defaultValue: 1,
        },
        start_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        expiry_date_type: {
            type: DataTypes.INTEGER,
            allowNull: true,
            defaultValue: 1,
        },
        expiry_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        start_time: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        end_time: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        activity_type: {
            type: DataTypes.INTEGER,
            allowNull: true,
            defaultValue: 0,
        },
        added_by: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        modify_by: {
            type: DataTypes.BIGINT,
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
        added_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        modify_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    }, {
        tableName: 'product_monitazation_rate',
        timestamps: false,
    });

    return ProductMonitazationRate;
};

export default ProductMonitazationRateModel;
