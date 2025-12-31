import { DataTypes } from 'sequelize';

const TermConditionsModel = (sequelize) => {
    const TermConditions = sequelize.define('TermConditions', {
        table_id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
        },
        sidebar_title: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        term_content: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        sort_order: {
            type: DataTypes.INTEGER,
            allowNull: true,
            defaultValue: 0,
        },
        is_enabled: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
            defaultValue: true,
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
        is_deleted: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
            defaultValue: false,
        },
    }, {
        tableName: 'term_conditions',
        timestamps: false,
    });

    return TermConditions;
};

export default TermConditionsModel;
