import { DataTypes } from 'sequelize';

const AdmUserModel = (sequelize) => {
    const AdmUser = sequelize.define('AdmUser', {
        admin_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        account_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        unique_id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
        },
        first_name: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        last_name: {
            type: DataTypes.STRING(100),
            allowNull: true,
        },
        email_id: {
            type: DataTypes.STRING(150),
            allowNull: false,
        },
        mobile_no: {
            type: DataTypes.STRING(20),
            allowNull: true,
        },
        login_pass: {
            type: DataTypes.STRING(255),
            allowNull: true,
        },
        is_master: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        is_enabled: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        is_deleted: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        is_activated: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        role_id: {
            type: DataTypes.INTEGER,
            allowNull: true,
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
        tableName: 'adm_user',
        timestamps: false,
    });

    return AdmUser;
};

export default AdmUserModel;
