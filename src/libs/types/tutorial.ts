import { ObjectId } from "mongoose";
import { TutorialPlatform, TutorialStatus } from "../enums/tutorial.enum";
import { Product } from "./product";

export interface Tutorial {
  _id: ObjectId;
  tutorialTitle: string;
  tutorialPlatform: TutorialPlatform;
  tutorialUrl: string;
  tutorialEmbedId: string;
  tutorialThumbnail?: string;
  tutorialBrand: string;
  tutorialProductId?: ObjectId;
  tutorialStatus: TutorialStatus;
  tutorialViews: number;
  createdAt: Date;
  updatedAt: Date;
  /** From the SPA feed's $lookup — empty when no product is linked, or when
   *  the linked one has since been deleted. */
  productData?: Product[];
}

export interface TutorialInquiry {
  page: number;
  limit: number;
}

export interface TutorialInput {
  tutorialTitle: string;
  tutorialUrl: string;
  tutorialBrand: string;
  tutorialProductId?: ObjectId | string;
  tutorialStatus?: TutorialStatus;
}

export interface TutorialUpdateInput {
  _id?: ObjectId;
  tutorialTitle?: string;
  tutorialUrl?: string;
  tutorialBrand?: string;
  tutorialProductId?: ObjectId | string;
  tutorialStatus?: TutorialStatus;
}
