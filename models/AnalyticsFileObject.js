import { DataTypes } from 'sequelize';

const AnalyticsFileObjectModel = (sequelize) => {
    const AnalyticsFileObject = sequelize.define('AnalyticsFileObject', {
        file_id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
        },
        request_id: {
            type: DataTypes.STRING(100),
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
        status: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
    }, {
        tableName: 'analytics_file_object',
        timestamps: false,
    });

    return AnalyticsFileObject;
};

export default AnalyticsFileObjectModel;
