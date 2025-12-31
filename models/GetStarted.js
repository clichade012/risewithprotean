import { DataTypes } from 'sequelize';

const GetStartedModel = (sequelize) => {
    const GetStarted = sequelize.define('GetStarted', {
        table_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
        },
        title_text: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },
        heading_text: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },
        contents: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        image_1: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },
        section_name: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        modify_by: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        modify_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    }, {
        tableName: 'get_started',
        timestamps: false,
    });

    return GetStarted;
};

export default GetStartedModel;
