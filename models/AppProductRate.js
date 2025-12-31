/**
 * AppProductRate Model - Sequelize ORM
 * Table: app_product_rate
 */

import { DataTypes } from 'sequelize';

export default (sequelize) => {

    const AppProductRate = sequelize.define('AppProductRate', {

        ap_rate_id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },

        app_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },

        customer_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },

        product_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },

        rate_plan_value: {
            type: DataTypes.TEXT,
            allowNull: true,
        },

        rate_plan_json_data: {
            type: DataTypes.TEXT,
            allowNull: true,
        },

        added_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },

        added_by: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },

        is_rate_plan_approved: {
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

        is_rate_plan_rejected: {
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

        is_deleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },

    }, {
        tableName: 'app_product_rate',
        timestamps: false,
        freezeTableName: true,
    });

    return AppProductRate;
};
