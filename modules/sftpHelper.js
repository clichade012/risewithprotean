import FormData from 'form-data';
import fs from 'fs';
import fetch from 'cross-fetch';
import db from '../database/db_helper.js';
// const Client = require('ssh2-sftp-client');
import * as ftp from "basic-ftp";
// const sftp = new Client();
const sftpFileUpload = async (fileJson) => {
    const client = new ftp.Client();
    const host = process.env.SFTP_HOST_URL;
    const port = process.env.SFTP_PORT_NO;
    const username = process.env.SFTP_USERNAME;
    const password = process.env.SFTP_PASSWORD;
    const remoteFilePath = process.env.SFTP_REMOTE_FILE_PATH;
    console.log(host, port, username, password);
    const localFilePath = fileJson[0]?.local;
    try {
        client.ftp.verbose = true; // Enable logging
        await client.access({
            host,
            port,
            user: username,
            password,
            secure: false, // Set to true if using FTPS
            passive: true,
        });
        console.log(`Connected to FTP: ${host}`);
        if (!localFilePath) throw new Error("Local file path is missing.");
        // Upload the file
        // await client.uploadFrom(localFilePath, "/httpdocs/testftp/");
        await client.uploadFrom(localFilePath, remoteFilePath);

        // await client.uploadFrom(localFilePath, remoteFilePath);
        console.log(`File uploaded to: ${remoteFilePath}`);

        return true;
    } catch (error) {
        console.log(`SFTP Upload Error: ${error}`);
        return false;
    } finally {
        client.close();
        console.log("SFTP connection closed.");
    }
};

const sftpFileDownload = async (fileJson) => {
    const formDwn = new FormData();
    formDwn.append('host', `${process.env.SFTP_HOST_URL}`);
    formDwn.append('port', `${process.env.SFTP_PORT_NO}`);
    formDwn.append('username', `${oprocess.env.SFTP_USERNAME}`);
    formDwn.append('password', `${process.env.SFTP_PASSWORD}`);
    formDwn.append('file_json', JSON.stringify(fileJson));

    const dwnResult = await fetch(`${addTrailingSlashIfMissing(process.env.SFTP_MICRO_SERVICE_URL)}apis/SftpFileDownload`, {
        method: 'POST',
        body: formDwn,
        headers: formDwn.getHeaders(),
    });
    if (dwnResult.status == 200) {
        const result = await dwnResult.json();
        return result;
    } else {
        return { success: false, message: dwnResult.statusText };
    }
};

const CheckApiStatus = async (micro_service_url) => {
    let result = { status: false, msg: '' };
    try {
        const form = new FormData();
        form.append('message', 'ping');
        const response = await fetch(`${addTrailingSlashIfMissing(micro_service_url)}apis/CheckApi`, {
            method: 'POST',
            body: form,
            headers: form.getHeaders(),
        });
        const apiResult = await response.json();
        if (apiResult.success) {
            result.status = true;
        }
        result.msg = apiResult.message;
    } catch (err) {
        result.msg = err?.message || '';
    }
    return result;
};

const CheckSftpStatus = async (orgData) => {
    let result = { status: false, msg: '' };
    try {
        const formSftpChk = new FormData();
        formSftpChk.append('host', `${orgData.sftp_host_url}`);
        formSftpChk.append('port', `${db.tryParseInt(orgData.sftp_port_no)}`);
        formSftpChk.append('username', `${orgData.sftp_username}`);
        formSftpChk.append('password', `${orgData.sftp_password}`);

        const response = await fetch(`${addTrailingSlashIfMissing(orgData?.micro_service_url)}apis/CheckSftp`, {
            method: 'POST',
            body: formSftpChk,
            headers: formSftpChk.getHeaders(),
        });
        const apiResult = await response.json();
        if (apiResult.success) {
            result.status = true;
        }
        result.msg = apiResult?.message;
    } catch (err) {
        result.msg = err?.message || '';
    }
    return result;
};


function addTrailingSlashIfMissing(url) {
    return url?.endsWith('/') ? url?.trim() : `${url?.trim()}/`;
};

export {
    sftpFileUpload,
    sftpFileDownload,
    CheckApiStatus,
    CheckSftpStatus,
};
