import { Storage } from '@google-cloud/storage';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger as _logger } from "../logger/winston.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UploadFile = async (filePath, destFileName, is_public = false) => {
    const gcs = new Storage({
        keyFilename: path.join(__dirname, '../oauth2.keys.json'),
    });
    const bucket = gcs.bucket(process.env.GCP_STORAGE_BUCKET);
    const options = {
        destination: destFileName,
        preconditionOpts: { ifGenerationMatch: 0 },
    };
    const [, resp] = await bucket.upload(filePath, options);
    if (resp && is_public == true) {
        try {
            await bucket.file(destFileName).makePublic();
        } catch (err) {
            _logger.error(err.stack);
        }
    }
    return resp;
}

const DeleteFile = async (filePath) => {
    const gcs = new Storage({
        keyFilename: path.join(__dirname, '../oauth2.keys.json'),
    });
    const bucket = gcs.bucket(process.env.GCP_STORAGE_BUCKET);
    const options = {
        preconditionOpts: { ifGenerationMatch: 0 },
    };
    await bucket.file(filePath).delete(options);
}


const MoveFile = async (filePath, destFileName) => {
    const gcs = new Storage({
        keyFilename: path.join(__dirname, '../oauth2.keys.json'),
    });
    const bucket = gcs.bucket(process.env.GCP_STORAGE_BUCKET);
    const options = {
        preconditionOpts: { ifGenerationMatch: 0 },
    };
    const [, resp] = await bucket.file(filePath).move(destFileName, options);
    return resp?.resource;
}

const Download = async (filePath, destFileName) => {
    const gcs = new Storage({ keyFilename: path.join(__dirname, '../oauth2.keys.json'), });
    const storage = new Storage();
    const bucket = gcs.bucket(process.env.GCP_STORAGE_BUCKET);
    const options = { preconditionOpts: { ifGenerationMatch: 0 }, };
    const [contents] = await storage.bucket(process.env.GCP_STORAGE_BUCKET).file(filePath).download(options);
    return contents;
}

const DownloadNew = async (gcp_file_path, destinationPath) => {
    try {
        const gcs = new Storage({
            keyFilename: path.join(__dirname, '../oauth2.keys.json'),
        });
        const bucket = gcs.bucket(process.env.GCP_STORAGE_BUCKET);
    
        await bucket.file(gcp_file_path).download({ destination: destinationPath });

        console.log(`File downloaded successfully to ${destinationPath}`);
    } catch (error) {
        console.log('Error downloading file:', error);
        if (error.code === 403) {
            console.log('Access denied. Verify that the service account has permission to access this file.');
        } else if (error.code === 404) {
            console.log('File not found. Check if the path is correct in the bucket.');
        }
    }
};

const GenerateSignedUrl = async (gcp_file_path) => {
    const gcs = new Storage({
        keyFilename: path.join(__dirname, '../oauth2.keys.json'),
    });
    const bucket = gcs.bucket(process.env.GCP_STORAGE_BUCKET);
    const options = {
        version: 'v2', // defaults to 'v2' if missing.
        action: 'read',
        expires: Date.now() + 1000 * 60 * 60, // one hour
        responseDisposition: 'attachment; filename="analytics_report.xlsx"', // Enforces download
    };
    const [url] = await bucket.file(gcp_file_path).getSignedUrl(options);
    return url;
};

export default {
    UploadFile,
    DeleteFile,
    MoveFile,
    Download,
    DownloadNew,
    GenerateSignedUrl
};