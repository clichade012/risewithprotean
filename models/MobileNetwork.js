import { DataTypes } from 'sequelize';

const MobileNetworkModel = (sequelize) => {
    const MobileNetwork = sequelize.define('MobileNetwork', {
        network_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        unique_id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
        },
        network_code: {
            type: DataTypes.STRING(50),
            allowNull: false,
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
        tableName: 'mobile_network',
        timestamps: false,
    });

    return MobileNetwork;
};

export default MobileNetworkModel;
