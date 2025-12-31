import { DataTypes } from 'sequelize';

const EndpointModel = (sequelize) => {
    const Endpoint = sequelize.define('Endpoint', {
        endpoint_id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
        },
        endpoint_url: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },
        display_name: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        proxy_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        product_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        is_published: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        is_product_published: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
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
        tableName: 'endpoint',
        timestamps: false,
    });

    return Endpoint;
};

export default EndpointModel;
