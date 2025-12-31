import { DataTypes } from 'sequelize';

const FeedbackCategoryModel = (sequelize) => {
    const FeedbackCategory = sequelize.define('FeedbackCategory', {
        category_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        category_name: {
            type: DataTypes.STRING(150),
            allowNull: false,
        },
        sort_order: {
            type: DataTypes.INTEGER,
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
        added_by: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        modify_by: {
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
        tableName: 'feedback_cat',
        timestamps: false,
    });

    return FeedbackCategory;
};

export default FeedbackCategoryModel;
