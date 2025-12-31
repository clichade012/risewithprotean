import nodemailer from 'nodemailer';

const emailTransporter = nodemailer.createTransport({
    host: process.env.EMAIL_CONFIG_SMTP,
    port: process.env.EMAIL_CONFIG_PORT,
    secure: false,//process.env.EMAIL_CONFIG_SSL_ENABLE,
    auth: {
        user: process.env.EMAIL_CONFIG_EMAIL,
        pass: process.env.EMAIL_CONFIG_PASSWORD
    },
    requireTLS: true,
    // logger: true,
    // debug: true
});

export default emailTransporter;
