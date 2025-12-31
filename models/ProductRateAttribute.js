import { DataTypes } from 'sequelize';

const ProductRateAttributeModel = (sequelize) => {
    const ProductRateAttribute = sequelize.define('ProductRateAttribute', {
        arate_id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
        },
        product_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        rate_plan_value: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        rate_plan_json_data: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        is_rate_plan_approved: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
            defaultValue: false,
        },
        ckr_is_rate_plan_approved: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
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
        is_rate_plan_rejected: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
            defaultValue: false,
        },
        ckr_rate_plan_is_rejected: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
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
        added_by: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        added_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        is_deleted: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
            defaultValue: false,
        },
    }, {
        tableName: 'product_rate_attribute',
        timestamps: false,
    });

    return ProductRateAttribute;
};

export default ProductRateAttributeModel;
