import { ObjectId } from "mongoose";
import { TutorialPlatform, TutorialStatus } from "../enums/tutorial.enum";

export interface Tutorial {
  _id: ObjectId;
  tutorialTitle: string;
  tutorialDescription?: string;
  tutorialPlatform: TutorialPlatform;
  tutorialUrl: string;
  tutorialEmbedId: string;
  tutorialThumbnail?: string;
  tutorialCategory?: string;
  tutorialStatus: TutorialStatus;
  tutorialViews: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TutorialInquiry {
  page: number;
  limit: number;
  tutorialCategory?: string;
}

export interface TutorialInput {
  tutorialTitle: string;
  tutorialDescription?: string;
  tutorialUrl: string;
  tutorialCategory?: string;
  tutorialStatus?: TutorialStatus;
}

export interface TutorialUpdateInput {
  _id?: ObjectId;
  tutorialTitle?: string;
  tutorialDescription?: string;
  tutorialCategory?: string;
  tutorialStatus?: TutorialStatus;
}
