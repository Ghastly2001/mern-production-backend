import mongoose, { Schema } from "mongoose";

const subscriptionSchema = new Schema(
  {
    subscriber: {
      types: Schema.types.ObjectId, //one who is subscribing
      ref: "User",
    },
    channel: {
      types: Schema.types.ObjectId, //one to who 'subscriber' is subscribing
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

export const Subscription = mongoose.model("Subscription", subscriptionSchema);
