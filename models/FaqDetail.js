/**
 * FaqDetail Model - Sequelize ORM
 * Table: faq_detail
 */

import { DataTypes } from 'sequelize';

export default (sequelize) => {

    const FaqDetail = sequelize.define('FaqDetail', {

        faq_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
            allowNull: false,
        },

        unique_id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
        },

        type_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: 'faq_type',
                key: 'type_id',
            },
        },

        question: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },

        answer: {
            type: DataTypes.STRING(4000),
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
        tableName: 'faq_detail',
        timestamps: false,
        freezeTableName: true,
    });

    return FaqDetail;
};
