import jwt from "jsonwebtoken";
const { TokenExpiredError, JsonWebTokenError } = jwt;
import { User } from "../db/schema/user.js";
import { db } from "../db/index.js";
import { eq } from "drizzle-orm";

const auth = async (req, res, next) => {
    try {
        const authHeader = req.header("Authorization");
        if (!authHeader) {
            return res
                .status(400)
                .send({ message: "Authorization token is required" });
        }
        const token = authHeader.replace("Bearer ", "");

        const decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        const [user] = await db
            .select()
            .from(User)
            .where(eq(User.id, decoded.id));

        if (!user) {
            return res.status(400).send({ message: "User not found" });
        }

        req.user = user;
        next();
    } catch (error) {
        if (error instanceof TokenExpiredError) {
            return res.status(401).send({ message: "Token expired" });
        } else if (error instanceof JsonWebTokenError) {
            return res.status(401).send({ message: "Invalid Token" });
        }

        console.log(error);
        res.status(500).send({ message: "An error occurred" });
    }
};

export default auth;
