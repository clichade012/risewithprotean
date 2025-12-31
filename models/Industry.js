import { DataTypes } from 'sequelize';

const IndustryModel = (sequelize) => {
    const Industry = sequelize.define('Industry', {
        industry_id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
        },
        industry_name: {
            type: DataTypes.STRING(100),
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
    }, {
        tableName: 'industry',
        timestamps: false,
    });

    return Industry;
};

export default IndustryModel;
