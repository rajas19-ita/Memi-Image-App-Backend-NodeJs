import express from "express";
import Joi from "joi";
import bcrypt from "bcryptjs";
import { db } from "../db/index.js";
import { User } from "../db/schema/user.js";
import { eq } from "drizzle-orm";
import pg from "pg";
import jwt from "jsonwebtoken";
import auth from "../middleware/auth.js";
const { DatabaseError } = pg;

const userRouter = express();

const generateAuthToken = (user) => {
    const token = jwt.sign({ id: user.id }, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1d",
    });
    return token;
};

const userSchema = Joi.object({
    username: Joi.string().alphanum().min(3).max(30).required(),
    password: Joi.string().min(8).required(),
});

userRouter.post("/signup", async (req, res) => {
    try {
        const { error, value: userData } = userSchema.validate(req.body);

        if (error) {
            return res.status(400).send({
                message: error.details[0].message,
                path: error.details[0].path,
            });
        }

        userData.password = await bcrypt.hash(userData.password, 8);

        const [user] = await db.insert(User).values(userData).returning({
            id: User.id,
            username: User.username,
        });

        const token = generateAuthToken(user);

        res.status(201).send({ user, token });
    } catch (error) {
        if (error instanceof DatabaseError) {
            if (
                error.constraint &&
                error.constraint === "users_username_unique"
            ) {
                return res
                    .status(400)
                    .send({ message: "username already exists." });
            }
        }
        console.log(error);
        res.status(500).send({ message: "An error occurred" });
    }
});

userRouter.post("/login", async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res
                .status(400)
                .send({ message: "username and password are required" });
        }

        const [user] = await db
            .select()
            .from(User)
            .where(eq(User.username, username));

        if (!user) {
            return res.status(401).send({ message: "Invalid credentials." });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(401).send({ message: "Invalid credentials." });
        }

        const token = generateAuthToken(user);

        res.status(200).send({
            user: { id: user.id, username: user.username },
            token,
        });
    } catch (error) {
        console.log(error);
        res.status(500).send({ message: "An error occurred" });
    }
});

userRouter.get("/", auth, async (req, res) => {
    res.status(200).send({ message: "Welcome to '/' route" });
});

export default userRouter;
