import { DataTypes } from 'sequelize';

const AdmRolePermissionModel = (sequelize) => {
    const AdmRolePermission = sequelize.define('AdmRolePermission', {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        role_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        permission_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        is_allowed: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
    }, {
        tableName: 'adm_role_permission',
        timestamps: false,
    });

    return AdmRolePermission;
};

export default AdmRolePermissionModel;
