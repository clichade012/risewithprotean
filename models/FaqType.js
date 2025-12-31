/**
 * FaqType Model - Sequelize ORM
 * Table: faq_type
 */

import { DataTypes } from 'sequelize';

export default (sequelize) => {

    const FaqType = sequelize.define('FaqType', {

        type_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },

        unique_id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
        },

        faq_type: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },

        sort_order: {
            type: DataTypes.INTEGER,
            defaultValue: 0,
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
        tableName: 'faq_type',
        timestamps: false,
        freezeTableName: true,
    });

    return FaqType;
};
