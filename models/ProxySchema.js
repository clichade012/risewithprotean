import { DataTypes } from 'sequelize';

const ProxySchemaModel = (sequelize) => {
    const ProxySchema = sequelize.define('ProxySchema', {
        schema_id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
        },
        endpoint_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        status_code: {
            type: DataTypes.STRING(10),
            allowNull: true,
        },
        response_schema: {
            type: DataTypes.TEXT,
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
        added_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        modify_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    }, {
        tableName: 'proxy_schema',
        timestamps: false,
    });

    return ProxySchema;
};

export default ProxySchemaModel;
