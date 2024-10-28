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
import { db } from "../db/index.js";
import { count, desc, eq } from "drizzle-orm";
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

            res.status(201).send({
                image: {
                    ...image,
                    url,
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

const paginationSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).default(8),
});

imageRouter.get("/", auth, async (req, res) => {
    try {
        const { error, value } = paginationSchema.validate(req.query);

        if (error) {
            return res.status(400).send({ message: error.details[0].message });
        }
        const { page, pageSize } = value;

        const [{ count: totalImages }] = await db
            .select({ count: count() })
            .from(Image)
            .where(eq(Image.userId, req.user.id));

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

        const images = await db
            .select()
            .from(Image)
            .where(eq(Image.userId, req.user.id))
            .orderBy(desc(Image.uploadAt))
            .limit(pageSize)
            .offset((page - 1) * pageSize);

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
