import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import userRouter from "./routes/user.routes.js";

const app = express();

//Middlewares
app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true })); //connect backend to frontend
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" })); //url encoder
app.use(express.static("public")); //to access static data
app.use(cookieParser()); //to set and access cookies from our server(CRUD)

//Routes
app.use("/api/v1/users", userRouter);

export { app };
