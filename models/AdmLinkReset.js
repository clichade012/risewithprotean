import { DataTypes } from 'sequelize';

const AdmLinkResetModel = (sequelize) => {
    const AdmLinkReset = sequelize.define('AdmLinkReset', {
        reset_id: {
            type: DataTypes.BIGINT,
            primaryKey: true,
            autoIncrement: true,
        },
        unique_id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
        },
        admin_id: {
            type: DataTypes.BIGINT,
            allowNull: true,
        },
        sent_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        is_used: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        used_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    }, {
        tableName: 'adm_link_reset',
        timestamps: false,
    });

    return AdmLinkReset;
};

export default AdmLinkResetModel;
