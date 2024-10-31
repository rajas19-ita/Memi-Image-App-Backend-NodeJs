import express from "express";
import auth from "../middleware/auth.js";
import Joi from "joi";
import { Tag } from "../db/schema/tag.js";
import { db } from "../db/index.js";
import pg from "pg";
import { ilike } from "drizzle-orm";
const { DatabaseError } = pg;

export const tagRouter = express.Router();

const tagSchema = Joi.object({
    tagName: Joi.string().trim().lowercase().min(3).max(25).required(),
});

tagRouter.post("/add", auth, async (req, res) => {
    try {
        const { error, value: tagData } = tagSchema.validate(req.body);
        if (error) {
            return res.status(400).send({
                message: error.details[0].message,
                path: error.details[0].path,
            });
        }

        const [tag] = await db
            .insert(Tag)
            .values({ tagName: tagData.tagName })
            .returning({
                id: Tag.id,
                tagName: Tag.tagName,
            });

        res.status(201).send(tag);
    } catch (error) {
        if (error instanceof DatabaseError) {
            if (
                error.constraint &&
                error.constraint === "tag_tag_name_unique"
            ) {
                return res.status(400).send({ message: "tag already exists" });
            }
        }

        res.status(500).send({ message: "An error occurred" });
    }
});

const tagFetchSchema = Joi.object({
    tagName: Joi.string().trim().lowercase().default(""),
    page: Joi.number().min(1).default(1),
    pageSize: Joi.number().min(1).default(10),
});

tagRouter.get("/", auth, async (req, res) => {
    try {
        const { error, value } = tagFetchSchema.validate(req.query);

        if (error) {
            return res.status(400).send({ message: error.details[0].message });
        }

        const { page, pageSize, tagName } = value;

        const tags = await db
            .select()
            .from(Tag)
            .where(ilike(Tag.tagName, `%${tagName}%`))
            .limit(pageSize)
            .offset((page - 1) * pageSize);

        return res.status(200).send(tags);
    } catch (error) {
        res.status(500).send({ message: "An error occurred" });
    }
});
