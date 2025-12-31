import { DataTypes } from 'sequelize';

const AdmRoleModel = (sequelize) => {
    const AdmRole = sequelize.define('AdmRole', {
        role_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        unique_id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
        },
        role_name: {
            type: DataTypes.STRING(100),
            allowNull: false,
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
        tableName: 'adm_role',
        timestamps: false,
    });

    return AdmRole;
};

export default AdmRoleModel;
