import { DataTypes } from 'sequelize';

const CstTokenModel = (sequelize) => {
    const CstToken = sequelize.define('CstToken', {
        token_id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
        },
        unique_id: {
            type: DataTypes.UUID,
            allowNull: true,
        },
        customer_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        is_logout: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        login_time: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        logout_time: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        device_name: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },
        ip_location: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
    }, {
        tableName: 'cst_token',
        timestamps: false,
    });

    return CstToken;
};

export default CstTokenModel;
