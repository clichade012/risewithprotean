import { DataTypes } from 'sequelize';

const AdmPermissionModel = (sequelize) => {
    const AdmPermission = sequelize.define('AdmPermission', {
        permission_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        permission_name: {
            type: DataTypes.STRING(100),
            allowNull: false,
        },
        permission_key: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        is_enabled: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
    }, {
        tableName: 'adm_permission',
        timestamps: false,
    });

    return AdmPermission;
};

export default AdmPermissionModel;
