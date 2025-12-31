/**
 * ProductCategory Model - Sequelize ORM
 * Table: product_category
 */

import { DataTypes } from 'sequelize';

export default (sequelize) => {

    const ProductCategory = sequelize.define('ProductCategory', {

        category_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },

        category_name: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },

        order_by: {
            type: DataTypes.INTEGER,
            allowNull: true,
            defaultValue: 0,
        },

        group_type: {
            type: DataTypes.INTEGER,
            allowNull: true,
            defaultValue: 1, // 1 = catalogue, 2 = product
        },

        is_enabled: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },

        is_deleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },

        added_by: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },

        modify_by: {
            type: DataTypes.BIGINT,
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

    }, {
        tableName: 'product_category',
        timestamps: false,
        freezeTableName: true,
    });

    return ProductCategory;
};
