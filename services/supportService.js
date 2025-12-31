import nodemailer from 'nodemailer';

const emailTransporter = nodemailer.createTransport({
    host: process.env.EMAIL_SUPPORT_SMTP,
    port: process.env.EMAIL_SUPPORT_PORT,
    secure: false,//process.env.EMAIL_SUPPORT_SSL_ENABLE,
    auth: {
        user: process.env.EMAIL_SUPPORT_EMAIL,
        pass: process.env.EMAIL_SUPPORT_PASSWORD
    },
    requireTLS: true,
    // logger: true,
    // debug: true
});

export default emailTransporter;
