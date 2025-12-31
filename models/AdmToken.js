import { DataTypes } from 'sequelize';

const AdmTokenModel = (sequelize) => {
    const AdmToken = sequelize.define('AdmToken', {
        token_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        unique_id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
        },
        admin_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        added_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        last_action: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        ip_address: {
            type: DataTypes.STRING(50),
            allowNull: true,
        },
        is_logout: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        logout_time: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        user_agent: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
    }, {
        tableName: 'adm_token',
        timestamps: false,
    });

    return AdmToken;
};

export default AdmTokenModel;
