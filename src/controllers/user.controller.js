import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken";

const generateAccessAndRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId);

    //methods are always accessible by "user" instance not my "User" model
    const accessToken = user.generateRefreshToken();
    const refreshToken = user.generateAccessToken();

    //Save refresh token to Databse
    user.refreshToken = refreshToken;
    user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating refresh and access tokens"
    );
  }
};

const registerUser = asyncHandler(async (req, res) => {
  //1. get user details from frontend
  const { username, email, fullName, password } = req.body;

  //2. validation for those details
  if (
    [fullName, email, username, password].some((field) => field?.trim() === "")
  ) {
    throw new ApiError(400, "All fields are required");
  }

  //3. check if user already exists
  const user = await User.findOne({
    $or: [{ username }, { email }],
  });

  if (user) {
    throw new ApiError(409, "User already exists");
  }

  //4. check for images, check for avatar
  const avatarLocalPath = req.files?.avatar[0]?.path;
  const coverImageLocalPath = req.files?.coverImage[0]?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar is required");
  }

  //5. upload them to cloudinary, avatar check
  const avatar = await uploadOnCloudinary(avatarLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!avatar) {
    throw new ApiError(400, "Avatar is required");
  }

  //6. create user object - create enrty call in db
  const data = await User.create({
    fullName,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    email,
    password,
    username: username.toLowerCase(),
  });

  //7. remove password and refresh token from response
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken" //fields which we don't want to send
  );

  //8. check for user creation
  if (!createdUser) {
    throw new ApiError(500, "Something went wrong required");
  }

  //9. return res
  return res
    .status(201)
    .json(new ApiResponse(200, "User registered succesfully", createdUser));
});

const loginUser = asyncHandler(async (req, res) => {
  //1. get user from frontend
  const { username, email, password } = req.body;

  //2. validate user
  if (!username && !email) {
    throw new ApiError(400, "Username or email is required.");
  }

  //3. check for user avaliblity in database
  const user = await User.findOne({
    $or: [{ username }, { email }],
  });
  if (!user) {
    throw new ApiError(404, "User doesn't exist");
  }

  //4. password check
  const isValidPassword = user.isPasswordCorrect(password);
  if (!isValidPassword) {
    throw new ApiError(401, "Invalid User credentials");
  }

  //5. generate access and refresh token
  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
    user._id
  );

  //6. send cookies
  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  const cookieOptions = {
    //These cookies are only modifiable by server
    httpOnly: true,
    secure: true,
  };

  return res
    .staus(200)
    .cookie("accessToken", accessToken, cookieOptions)
    .cookie("refreshToken", refreshToken, cookieOptions)
    .json(
      new ApiResponse(200, "User logged in successfully", {
        user: loggedInUser,
        accessToken,
        refreshToken,
      })
    );
});

const logoutUser = asyncHandler(async (req, res) => {
  //1. We have access of user in req. Clear refresh token in database
  User.findByIdAndUpdate(
    req.user._id,
    {
      $set: {
        refreshToken: undefined,
      },
    },
    {
      new: true,
    }
  );

  //2. Clear cookies in database
  const cookieOptions = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", cookieOptions)
    .clearCookie("refreshToken", cookieOptions)
    .json(new ApiResponse(200, "User logged out !", {}));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  //1. get the incoming token
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    new ApiError(401, "Unauthorized request");
  }

  try {
    //2. Decode that token using jwt
    const decodedToken = jwt.verify(incomingRefreshToken, REFRESH_TOKEN_SECRET);

    if (!decodedToken) {
      throw new ApiError(400, "No decoded token");
    }

    //3. Get user details based on decodedToken._id
    const user = User.findById(decodedToken?._id);
    if (!user) {
      throw new ApiError(400, "Invalid refresh token");
    }

    //4. Match the incoming token and current token
    if (incomingRefreshToken !== user.refreshToken) {
      throw new ApiError(400, "Refresh token is expired or used");
    }

    //5. Generate new tokens and set them again in cookies
    const cookieOptions = {
      httpOnly: true,
      secure: true,
    };

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
      user._id
    );
    return res
      .status(200)
      .cookie("refreshToken", refreshToken, cookieOptions)
      .cookie("accessToken", accessToken, cookieOptions)
      .json(new ApiResponse(201, "Tokens created again", {}));
  } catch (error) {
    throw new ApiError(400, "Error occured while refreshing tokens");
  }
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  const user = await User.findById(req.user?._id);
  const isPasswordValid = await user.isPasswordCorrect(oldPassword);

  if (!isPasswordValid) {
    throw new ApiError(400, "Invalid old password");
  }

  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, "Password changed successfully", {}));
});

const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(201, "Fetched successful", req.user));
});

const updateAccountDetails = asyncHandler(async (req, res) => {
  const { fullName, email } = req.body;

  if (!fullName || !email) {
    throw new ApiError(400, "Details required");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        fullName,
        email,
      },
    },
    {
      new: true,
    }
  ).select("-password");

  return res.status(200).json(new ApiResponse(200, "Account Updated!!", user));
});

const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avtar doesn't exist");
  }

  const uploadedPath = await uploadOnCloudinary(avatarLocalPath);

  if (!uploadedPath.url) {
    throw new ApiError(400, "Error while uploading avatar");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        avatar: uploadedPath.url,
      },
    },
    {
      new: true,
    }
  ).select("-password");

  if (!user) {
    throw new ApiError(400, "Unable to update avatar");
  }

  return res
    .status(200)
    .json(new ApiResponse(201, "Avtar updated successfully", {}));
});

const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImageLocalPath = req.file?.path;

  if (!coverImageLocalPath) {
    throw new ApiError(400, "Avtar doesn't exist");
  }

  const uploadedPath = await uploadOnCloudinary(coverImageLocalPath);

  if (!uploadedPath.url) {
    throw new ApiError(400, "Error while uploading cover");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        coverImage: uploadedPath.url,
      },
    },
    {
      new: true,
    }
  ).select("-password");

  if (!user) {
    throw new ApiError(400, "Unable to update cover image");
  }

  return res
    .status(200)
    .json(new ApiResponse(201, "Avtar updated successfully", {}));
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
};
