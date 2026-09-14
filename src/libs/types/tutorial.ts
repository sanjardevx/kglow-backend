import { ObjectId } from "mongoose";
import { TutorialPlatform, TutorialStatus } from "../enums/tutorial.enum";

export interface Tutorial {
  _id: ObjectId;
  tutorialTitle: string;
  tutorialPlatform: TutorialPlatform;
  tutorialUrl: string;
  tutorialEmbedId: string;
  tutorialThumbnail?: string;
  tutorialStatus: TutorialStatus;
  tutorialViews: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TutorialInquiry {
  page: number;
  limit: number;
}

export interface TutorialInput {
  tutorialTitle: string;
  tutorialUrl: string;
  tutorialStatus?: TutorialStatus;
}

export interface TutorialUpdateInput {
  _id?: ObjectId;
  tutorialTitle?: string;
  tutorialUrl?: string;
  tutorialStatus?: TutorialStatus;
}
