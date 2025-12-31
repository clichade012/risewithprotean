import { DataTypes } from 'sequelize';

const AdmLinkActModel = (sequelize) => {
    const AdmLinkAct = sequelize.define('AdmLinkAct', {
        activation_id: {
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
            allowNull: false,
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
        tableName: 'adm_link_act',
        timestamps: false,
    });

    return AdmLinkAct;
};

export default AdmLinkActModel;
