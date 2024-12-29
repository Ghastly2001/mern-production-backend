import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadOnCloudinary = async (filePath) => {
  try {
    if (!filePath) return null;

    //upload image on cloud
    const uploadResult = await cloudinary.uploader
      .upload(filePath, {
        format: "auto",
      })
      .catch((error) => {
        console.log(error);
      });

    console.log("File uploaded successfully", uploadResult.url);
    fs.unlinkSync(filePath);
    return uploadResult;
  } catch (error) {
    fs.unlinkSync(filePath); //remove the locally saved file as the upload operation got failed
    return null;
  }
};

export { uploadOnCloudinary };
