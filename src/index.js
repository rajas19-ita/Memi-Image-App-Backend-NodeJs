import "dotenv/config";
import express from "express";
import bodyParser from "body-parser";
import imageRouter from "./router/image.js";
import userRouter from "./router/user.js";
import cors from "cors";
import { tagRouter } from "./router/tag.js";

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use("/users", userRouter);
app.use("/images", imageRouter);
app.use("/tags", tagRouter);

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}...`);
});
