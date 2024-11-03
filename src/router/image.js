import express from "express";
import auth from "../middleware/auth.js";
import multer from "multer";
import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { MulterError } from "multer";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import { Image } from "../db/schema/image.js";
import { Tag, ImageTags } from "../db/schema/tag.js";
import { db } from "../db/index.js";
import { eq, inArray, sql } from "drizzle-orm";
import Joi from "joi";

const imageRouter = express.Router();

const s3Client = new S3Client({
    region: "ap-south-1",
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY,
    },
});

const upload = multer({
    limits: {
        fileSize: 2097152,
    },
    fileFilter(req, file, cb) {
        if (file.mimetype !== "image/jpeg" && file.mimetype !== "image/png") {
            return cb(new MulterError("LIMIT_UNEXPECTED_FILE"));
        }

        cb(null, true);
    },
});

const imageSchema = Joi.object({
    title: Joi.string().trim().min(3).max(60).required(),
    tags: Joi.array().items(Joi.number()).min(1).max(5).required(),
});

imageRouter.post(
    "/add",
    auth,
    upload.single("image"),
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).send({
                    message:
                        "Please provide an image file for upload (jpg or png).",
                });
            }
            let tags;
            try {
                tags = req.body.tags
                    ? JSON.parse(req.body.tags)
                    : req.body.tags;
            } catch (parseError) {
                return res
                    .status(400)
                    .send({ message: "Invalid JSON format for tags" });
            }

            const { error, value: imageData } = imageSchema.validate({
                title: req.body.title,
                tags,
            });

            if (error) {
                return res.status(400).send({
                    message: error.details[0].message,
                    path: error.details[0].path,
                });
            }

            const selectedTags = await db
                .select()
                .from(Tag)
                .where(inArray(Tag.id, tags));

            if (selectedTags.length === 0) {
                return res.status(400).send({ message: "Invalid tag ID's" });
            }

            const imgKey = uuidv4() + ".jpg";
            const { buffer } = req.file;

            const newBuffer = await sharp(buffer)
                .resize(800)
                .jpeg({ quality: 80 })
                .toBuffer();

            const metaData = await sharp(newBuffer).metadata();

            await s3Client.send(
                new PutObjectCommand({
                    Bucket: "memi-app",
                    Key: `image-uploads/${req.user.username}/${imgKey}`,
                    Body: newBuffer,
                    ContentType: "image/jpeg",
                })
            );

            const [image] = await db
                .insert(Image)
                .values({
                    title: imageData.title,
                    key: imgKey,
                    mimeType: "image/jpeg",
                    width: metaData.width,
                    height: metaData.height,
                    fileSize: metaData.size,
                    userId: req.user.id,
                })
                .returning();

            const url = await getSignedUrl(
                s3Client,
                new GetObjectCommand({
                    Bucket: "memi-app",
                    Key: `image-uploads/${req.user.username}/${imgKey}`,
                }),
                { expiresIn: 900 }
            );

            await db.insert(ImageTags).values(
                selectedTags.map((tag) => ({
                    imageId: image.id,
                    tagId: tag.id,
                }))
            );

            res.status(201).send({
                image: {
                    ...image,
                    url,
                    tags: [...selectedTags],
                },
            });
        } catch (error) {
            res.status(500).send({ message: "An error occurred." });
        }
    },
    (error, req, res, next) => {
        if (error instanceof MulterError) {
            if (error.code === "LIMIT_FILE_SIZE") {
                return res
                    .status(400)
                    .send({ message: "File size exceeds the limit of 2 MB." });
            } else if (error.code === "LIMIT_UNEXPECTED_FILE") {
                return res.status(400).send({
                    message:
                        "Invalid file type. Please upload an image (jpg or png).",
                });
            }
        }
        res.status(500).send({ message: "An error occurred." });
    }
);

const queryBuilder = ({
    userId,
    tagId,
    title,
    sortBy,
    order,
    page,
    pageSize,
}) => {
    const countQuery = sql`select count(*) from image`;
    const imageQuery = sql`
        select image.id as id, 
               image.title as title, 
               image.key as key,
               image.mime_type as "mimeType", 
               image.width as width, 
               image.height as height,
               image.file_size as "fileSize", 
               image.user_id as "userId", 
               image.upload_at as "uploadAt", 
               array_agg(json_build_object('id', tag.id, 'tagName', ${Tag.tagName})) as "allTags"
        from image 
        inner join image_tags on image.id = image_tags.image_id
        inner join tag on image_tags.tag_id = tag.id 
        where image.user_id = ${userId}`;

    if (tagId) {
        countQuery.append(sql` inner join image_tags on image.id = image_tags.image_id
             where image.user_id = ${userId} 
             and image_tags.tag_id = ${tagId}`);
    } else {
        countQuery.append(sql` where image.user_id = ${userId}`);
    }

    if (title) {
        const likeTitle = `%${title}%`;

        countQuery.append(sql` and image.title ilike ${likeTitle}`);
        imageQuery.append(sql` and image.title ilike ${likeTitle}`);
    }

    imageQuery.append(sql` group by image.id`);

    if (tagId) {
        imageQuery.append(
            sql` having array_agg(tag.id) @> array[${tagId}]::integer[]`
        );
    }

    const orderByField = sortBy === "title" ? "image.title" : "image.upload_at";
    const orderDirection = order === "asc" ? "asc" : "desc";

    imageQuery.append(
        sql` order by ${sql.raw(orderByField)} ${sql.raw(orderDirection)}`
    );

    imageQuery.append(sql` limit ${pageSize} offset ${(page - 1) * pageSize}`);

    return { imageQuery, countQuery };
};

const paginationSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).default(8),
    title: Joi.string().trim().lowercase().default(""),
    sortBy: Joi.string().valid("date", "title"),
    order: Joi.string().valid("asc", "desc"),
    tagId: Joi.number(),
}).with("sortBy", "order");

imageRouter.get("/", auth, async (req, res) => {
    try {
        const { error, value } = paginationSchema.validate(req.query);

        if (error) {
            return res.status(400).send({ message: error.details[0].message });
        }

        const { page, pageSize, title, sortBy, order, tagId } = value;

        if (tagId) {
            const [tag] = await db.select().from(Tag).where(eq(Tag.id, tagId));
            if (!tag)
                return res.status(400).send({ message: "Invalid tag id" });
        }

        const { imageQuery, countQuery } = queryBuilder({
            userId: req.user.id,
            page,
            pageSize,
            title,
            sortBy,
            order,
            tagId,
        });

        let {
            rows: [{ count: totalImages }],
        } = await db.execute(countQuery);

        totalImages = Number.parseInt(totalImages);

        if (totalImages === 0) {
            return res.status(200).send({
                currentPage: 1,
                totalPages: 0,
                pageSize,
                totalImages: 0,
                images: [],
            });
        }

        const totalPages = Math.ceil(totalImages / pageSize);

        if (page > totalPages) {
            return res
                .status(400)
                .send({ message: "Page number exceeds total pages." });
        }

        const { rows: images } = await db.execute(imageQuery);

        const signedUrlPromises = images.map(async (img) => {
            const url = await getSignedUrl(
                s3Client,
                new GetObjectCommand({
                    Bucket: "memi-app",
                    Key: `image-uploads/${req.user.username}/${img.key}`,
                }),
                { expiresIn: 900 }
            );
            return { ...img, url };
        });

        const imagesWithUrl = await Promise.all(signedUrlPromises);

        res.status(200).send({
            currentPage: page,
            totalPages,
            pageSize,
            totalImages,
            images: imagesWithUrl,
        });
    } catch (error) {
        res.status(500).send({
            message: "An error occurred while fetching images.",
        });
    }
});

export default imageRouter;
