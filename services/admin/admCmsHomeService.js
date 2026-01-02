import { logger as _logger, action_logger } from '../../logger/winston.js';
import db from '../../database/db_helper.js';
import { success } from "../../model/responseModel.js";
import validator from 'validator';
import correlator from 'express-correlation-id';
import redisDB from '../../database/redis_cache.js';

const cacheKey = "home_page_data";

// Helper: Validate home page section input fields
const validateHomePageSectionInput = (title, heading, contents) => {
    if (!title || title.length <= 0) {
        return { valid: false, message: "Please enter title." };
    }
    if (!heading || heading.length <= 0) {
        return { valid: false, message: "Please enter heading." };
    }
    if (!contents || contents.length <= 0) {
        return { valid: false, message: "Please enter contents." };
    }
    return { valid: true };
};

// Helper: Extract image filenames from request files
const extractImageFiles = (files) => ({
    image_1: files?.['desktop']?.[0]?.filename || '',
    image_2: files?.['mobile']?.[0]?.filename || '',
    image_3: files?.['bottom']?.[0]?.filename || ''
});

// Helper: Build update payload with optional images
const buildSectionUpdatePayload = (title, heading, contents, images, tokenData) => {
    const payload = {
        title_text: title,
        heading_text: heading,
        contents: contents,
        modify_by: tokenData.account_id,
        modify_date: db.get_ist_current_date()
    };
    if (images.image_1) payload.image_1 = images.image_1;
    if (images.image_2) payload.image_2 = images.image_2;
    if (images.image_3) payload.image_3 = images.image_3;
    return payload;
};

// Helper: Clear Redis cache if enabled
const clearHomePageCache = async () => {
    if (process.env.REDIS_ENABLED > 0) {
        await redisDB.del(cacheKey);
    }
};

// Helper: Log home page section update
const logHomePageSectionUpdate = (tokenData, sectionName, payload) => {
    try {
        const data_to_log = {
            correlation_id: correlator.getId(),
            token_id: tokenData.token_id,
            account_id: tokenData.account_id,
            user_type: 1,
            user_id: tokenData.admin_id,
            narration: `Update contents for "Home Page" (section = ${sectionName})`,
            query: JSON.stringify(payload),
            date_time: db.get_ist_current_date(),
        };
        action_logger.info(JSON.stringify(data_to_log));
    } catch (_) { /* ignore logging errors */ }
};

const cms_home_get = async (req, res, next) => {
    try {
        const { HomePage } =db.models;
        let scroll_strip = '';
        const buildImageUrl = (file) => file?.length > 0 ? db.get_uploads_url(req) + file : '';
         const row1 = await HomePage.findOne({
            where:{table_id:1},
            attributes:['contents']
         })
         scroll_strip = row1 ? row1.contents : '';

         const getSection = async(table_id) =>{
            const row = await HomePage.findOne({
                where:{table_id:table_id},
                attributes:['title_text','heading_text','contents','image_1','image_2','image_3']
                });

                if(!row){
                    return null;
                }

                return {
                    title: row.title_text,
                    heading: row.heading_text,
                    contents: row.contents,
                    image1: buildImageUrl(row.image_1),
                    image2: buildImageUrl(row.image_2),
                    image3: buildImageUrl(row.image_3),
                }
         };

        const section_1 = await getSection(2);
        const section_2 = await getSection(3);
        const section_3 = await getSection(4);
        const section_4 = await getSection(5);

        const section5Rows = await HomePage.findAll({
            where:{
                table_id: [6,7,8]
            },
            attributes:['table_id','heading_text','contents'],
            order:[['table_id','ASC']]
        })

        const section_5 = section5Rows.map(row =>({
            id: row.table_id,
            title: row.heading_text,
            contents: row.contents,
        }));
        let results = {
            scroll_strip: scroll_strip,
            section_1: section_1,
            section_2: section_2,
            section_3: section_3,
            section_4: section_4,
            section_5: section_5,
        };
        return res.status(200).json(success(true, res.statusCode, "", results));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
}

const cms_home_set_strip = async (req, res, next) => {
    const { contents } = req.body;
    const { HomePage } = db.models;
    try {
        if (!contents || contents.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter scrolling strip contents.", null));
        }
        const [ affectedRows ] = await HomePage.update(
            {
                contents: contents,
                modify_by: req.token_data.account_id,
                modify_date: db.get_ist_current_date()
            },
            {
                where: {
                    table_id: 1
                }
            }
        );

        if (affectedRows > 0) {
            try {
                if(process.env.REDIS_ENABLED > 0){
                    await redisDB.del(cacheKey);
                }

                const data_to_log = {
                    correlation_id: correlator.getId(),
                    token_id: req.token_data.token_id,
                    account_id: req.token_data.account_id,
                    user_type: 1,
                    user_id: req.token_data.admin_id,
                    narration: 'Update contents for "Home Page" (section = Scrolling Strip)',
                    query: `UPDATE home_page SET contents = '${contents}' WHERE table_id = 1`,
                    date_time: db.get_ist_current_date(),
                }

                action_logger.info(JSON.stringify(data_to_log));

            } catch (_) { }

            return res
                .status(200)
                .json(success(true, res.statusCode, "Updated successfully.", null));
        } else {
            return res
                .status(200)
                .json(success(false, res.statusCode, "Unable to updated, Please try again.", null));
        }
        
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
}

// const cms_home_set_section_1 = async (req, res, next) => {
//     const { title, heading, contents } = req.body;
//     try {
//         if (!title || title.length <= 0) {
//             return res.status(200).json(success(false, res.statusCode, "Please enter title.", null));
//         }
//         if (!heading || heading.length <= 0) {
//             return res.status(200).json(success(false, res.statusCode, "Please enter heading.", null));
//         }
//         if (!contents || contents.length <= 0) {
//             return res.status(200).json(success(false, res.statusCode, "Please enter contents.", null));
//         }
//         let image_1 = req.files['desktop'] && req.files['desktop'].length > 0 ? req.files['desktop'][0].filename : '';
//         let image_2 = req.files['mobile'] && req.files['mobile'].length > 0 ? req.files['mobile'][0].filename : '';
//         let image_3 = req.files['bottom'] && req.files['bottom'].length > 0 ? req.files['bottom'][0].filename : '';

//         const _query2 = `UPDATE home_page SET title_text = :title, heading_text = :heading, contents = :content, 
//         image_1 = CASE WHEN LENGTH(:image_1) > 0 THEN :image_1 ELSE image_1 END,
//         image_2 = CASE WHEN LENGTH(:image_2) > 0 THEN :image_2 ELSE image_2 END,
//         image_3 = CASE WHEN LENGTH(:image_3) > 0 THEN :image_3 ELSE image_3 END,        
//         modify_by = :modify_by, modify_date = :modify_date WHERE table_id = 2`;
//         const _replacements2 = {
//             title: title,
//             heading: heading,
//             content: contents,
//             image_1: image_1,
//             image_2: image_2,
//             image_3: image_3,
//             modify_by: req.token_data.account_id,
//             modify_date: db.get_ist_current_date(),
//         };
//         const [, i] = await db.sequelize.query(_query2, { replacements: _replacements2, type: QueryTypes.UPDATE });
//         if (i > 0) {
//             try {
//                 if (process.env.REDIS_ENABLED > 0) {
//                     await redisDB.del(cacheKey);
//                 }

//                 let data_to_log = {
//                     correlation_id: correlator.getId(),
//                     token_id: req.token_data.token_id,
//                     account_id: req.token_data.account_id,
//                     user_type: 1,
//                     user_id: req.token_data.admin_id,
//                     narration: 'Update contents for "Home Page" (section = Section 1)',
//                     query: db.buildQuery_Obj(_query2, _replacements2),
//                     date_time: db.get_ist_current_date(),
//                 }
//                 action_logger.info(JSON.stringify(data_to_log));
//             } catch (_) { }

//             return res.status(200).json(success(true, res.statusCode, "Updated successfully.", null));
//         } else {
//             return res.status(200).json(success(false, res.statusCode, "Unable to updated, Please try again.", null));
//         }
//     } catch (err) {
//         _logger.error(err.stack);
//         return res.status(500).json(success(false, res.statusCode, err.message, null));
//     }
// }


const cms_home_set_section_1 = async (req, res, next) => {
    const { title, heading, contents } = req.body;
    const { HomePage } = db.models;
    try {
        const validation = validateHomePageSectionInput(title, heading, contents);
        if (!validation.valid) {
            return res.status(200).json(success(false, res.statusCode, validation.message, null));
        }

        const images = extractImageFiles(req.files);
        const uploadPayload = buildSectionUpdatePayload(title, heading, contents, images, req.token_data);

        const [affectedRows] = await HomePage.update(uploadPayload, { where: { table_id: 2 } });

        if (affectedRows <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Unable to updated, Please try again.", null));
        }

        await clearHomePageCache();
        logHomePageSectionUpdate(req.token_data, 'Section 1', uploadPayload);
        return res.status(200).json(success(true, res.statusCode, "Updated successfully.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
}

const cms_home_set_section_2 = async (req, res, next) => {
    const { title, heading, contents } = req.body;
    const { HomePage } = db.models;
    try {
        const validation = validateHomePageSectionInput(title, heading, contents);
        if (!validation.valid) {
            return res.status(200).json(success(false, res.statusCode, validation.message, null));
        }

        const images = extractImageFiles(req.files);
        const uploadPayload = buildSectionUpdatePayload(title, heading, contents, images, req.token_data);

        const [affectedRows] = await HomePage.update(uploadPayload, { where: { table_id: 3 } });

        if (affectedRows <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Unable to update, Please try again.", null));
        }

        await clearHomePageCache();
        logHomePageSectionUpdate(req.token_data, 'Section 2', uploadPayload);
        return res.status(200).json(success(true, res.statusCode, "Updated successfully.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
}
const cms_home_set_section_3 = async (req, res, next) => {
    const { title, heading, contents } = req.body;
    const { HomePage } = db.models;
    try {
        const validation = validateHomePageSectionInput(title, heading, contents);
        if (!validation.valid) {
            return res.status(200).json(success(false, res.statusCode, validation.message, null));
        }

        const images = extractImageFiles(req.files);
        const updatePayload = buildSectionUpdatePayload(title, heading, contents, images, req.token_data);

        const [affectedRows] = await HomePage.update(updatePayload, { where: { table_id: 4 } });

        if (affectedRows <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Unable to updated, Please try again.", null));
        }

        await clearHomePageCache();
        logHomePageSectionUpdate(req.token_data, 'Section 3', updatePayload);
        return res.status(200).json(success(true, res.statusCode, "Updated successfully.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
}

const cms_home_set_section_4 = async (req, res, next) => {
    const { title, heading, contents } = req.body;
    const { HomePage } = db.models;
    try {
        const validation = validateHomePageSectionInput(title, heading, contents);
        if (!validation.valid) {
            return res.status(200).json(success(false, res.statusCode, validation.message, null));
        }

        const images = extractImageFiles(req.files);
        const uploadPayload = buildSectionUpdatePayload(title, heading, contents, images, req.token_data);

        const [affectedRows] = await HomePage.update(uploadPayload, { where: { table_id: 5 } });

        if (affectedRows <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Unable to updated, Please try again.", null));
        }

        await clearHomePageCache();
        logHomePageSectionUpdate(req.token_data, 'Section 4', uploadPayload);
        return res.status(200).json(success(true, res.statusCode, "Updated successfully.", null));
    } catch (err) {
        _logger.error(err.stack);
        return res.status(500).json(success(false, res.statusCode, err.message, null));
    }
}

const cms_home_set_section_5 = async (req, res, next) => {
    const { id, title, contents } = req.body;
      const { HomePage } = db.models;
    try {
        let _id = id && validator.isNumeric(id.toString()) ? parseInt(id) : 0;

        if (!title || title.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter title.", null));
        }
        if (!contents || contents.length <= 0) {
            return res.status(200).json(success(false, res.statusCode, "Please enter contents.", null));
        }

        const updatePayload = {
            heading_text:title,
            contents:contents,
            modify_by:req.token_data.account_id,
            modify_date:db.get_ist_current_date()
        }

        const [affectedRows] = await HomePage.update(updatePayload,{
            where:{table_id:_id}
        });

        if(affectedRows > 0){
            try{
                if(process.env.REDIS_ENABLED > 0){
                    await redisDB.del(cacheKey);
                }

                const data_to_log = {
                    correlation_id:correlator.getId(),
                    token_id:req.token_data.token_id,
                    account_id:req.token_data.account_id,
                    user_type:1,
                    user_id:req.token_data.admin_id,
                    narration: 'Update contents for "Home Page" (section = Section 5)',
                    query: JSON.stringify(updatePayload),
                    date_time: db.get_ist_current_date(),
                }

                action_logger.info(JSON.stringify(data_to_log));

            }catch(_){}
            return res
                .status(200)
                .json(success(true,res.statusCode,"Updated successfully.",null));
        }
        return res
            .status(200)
            .json(success(false,res.statusCode,"Unable to update, Please try again.",null));
    } catch (err) {
        _logger.error(err.stack);
        return res
        .status(500)
        .json(success(false, res.statusCode, err.message, null));
    }
}

export default {
    cms_home_get,
    cms_home_set_strip,
    cms_home_set_section_1,
    cms_home_set_section_2,
    cms_home_set_section_3,
    cms_home_set_section_4,
    cms_home_set_section_5,
}
