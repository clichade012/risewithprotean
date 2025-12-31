import { DataTypes } from 'sequelize';

const FeedbackReplyModel = (sequelize) => {
    const FeedbackReply = sequelize.define('FeedbackReply', {
        reply_id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        feedback_id: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        sent_by: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        sent_date: {
            type: DataTypes.DATE,
            allowNull: true,
        },
        content_text: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
    }, {
        tableName: 'feedback_reply',
        timestamps: false,
    });

    return FeedbackReply;
};

export default FeedbackReplyModel;
