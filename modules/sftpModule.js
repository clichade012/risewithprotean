
import * as sftpHelper from '../modules/sftpHelper.js';
import crypto from 'crypto';


const uploadFile = async (org_id, filePath) => {
    let localFileToDelete = [];
    try {
        let filetype ='csv';
        let filesToUpload = [];

        filesToUpload.push({
            id: crypto.randomUUID(),
            name: fileName,
            local: dwnPathRslt.tempPath,
            remote: `/input/${fileName}`,
            db_filepath: _inputPath,
            filetype: filetype
        });
        if (filesToUpload.length <= 0) {
            return;
        }
        const sftpRsp = await sftpHelper.sftpFileUpload(orgData, filesToUpload);
        if (!sftpRsp?.success) {
            utils.logOrgObject(orgData.org_id, `SFTP upload failed: ${sftpRsp.message}`, { id: dtR.id, files: filesToUpload }, utils.OrgLogLevel.ERROR);
            return;
        }
    } catch (err) {
        utils.logOrgError(org_id, err, utils.OrgLogLevel.ERROR);
    }
    cleanupLocalFiles(localFileToDelete);
};

export {
    uploadFile,
};
