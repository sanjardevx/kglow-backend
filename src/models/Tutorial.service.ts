import { shapeIntoMongooseObjectId } from "../libs/config";
import { TutorialStatus } from "../libs/enums/tutorial.enum";
import Errors, { HttpCode, Message } from "../libs/Errors";
import { T } from "../libs/types/common";
import {
  Tutorial,
  TutorialInput,
  TutorialInquiry,
  TutorialUpdateInput,
} from "../libs/types/tutorial";
import TutorialModel from "../schema/Tutorial.model";
import {
  fetchTutorialThumbnail,
  parseTutorialLink,
} from "../libs/utils/tutorialLink";

class TutorialService {
  private readonly tutorialModel;

  constructor() {
    this.tutorialModel = TutorialModel;
  }

  /** SPA */
  public async getTutorials(inquiry: TutorialInquiry): Promise<Tutorial[]> {
    const match: T = { tutorialStatus: TutorialStatus.ACTIVE };

    const result = await this.tutorialModel
      .aggregate([
        { $match: match },
        { $sort: { createdAt: -1 } },
        { $skip: (inquiry.page * 1 - 1) * inquiry.limit },
        { $limit: inquiry.limit },
      ])
      .exec();

    if (!result) throw new Errors(HttpCode.NOT_FOUND, Message.NO_DATA_FOUND);
    return result;
  }

  public async getTutorial(id: string): Promise<Tutorial> {
    const tutorialId = shapeIntoMongooseObjectId(id);

    const result = await this.tutorialModel
      .findOneAndUpdate(
        { _id: tutorialId, tutorialStatus: TutorialStatus.ACTIVE },
        { $inc: { tutorialViews: 1 } },
        { new: true },
      )
      .exec();

    if (!result) throw new Errors(HttpCode.NOT_FOUND, Message.NO_DATA_FOUND);
    return result;
  }

  /** SSR */

  public async getAllTutorials(): Promise<Tutorial[]> {
    const result = await this.tutorialModel
      .find()
      .sort({ createdAt: -1 })
      .exec();
    if (!result) throw new Errors(HttpCode.NOT_FOUND, Message.NO_DATA_FOUND);

    return result;
  }

  public async createNewTutorial(input: TutorialInput): Promise<Tutorial> {
    const parsed = parseTutorialLink(input.tutorialUrl);
    if (!parsed)
      throw new Errors(HttpCode.BAD_REQUEST, Message.INVALID_TUTORIAL_LINK);

    const tutorialThumbnail = await fetchTutorialThumbnail(
      parsed,
      input.tutorialUrl,
    );

    try {
      return await this.tutorialModel.create({
        ...input,
        tutorialPlatform: parsed.platform,
        tutorialEmbedId: parsed.embedId,
        tutorialThumbnail,
      });
    } catch (err) {
      console.log("Error, model:createNewTutorial:", err);
      throw new Errors(HttpCode.BAD_REQUEST, Message.CREATE_FAILED);
    }
  }

  public async updateChosenTutorial(
    id: string,
    input: TutorialUpdateInput,
  ): Promise<Tutorial> {
    id = shapeIntoMongooseObjectId(id);

    // The link itself can be edited (not just the title/status), so if it
    // changed, re-derive platform/embed id/thumbnail the same way creation
    // does — otherwise the card would keep pointing at the old video.
    if (input.tutorialUrl) {
      const parsed = parseTutorialLink(input.tutorialUrl);
      if (!parsed)
        throw new Errors(HttpCode.BAD_REQUEST, Message.INVALID_TUTORIAL_LINK);

      const tutorialThumbnail = await fetchTutorialThumbnail(
        parsed,
        input.tutorialUrl,
      );

      Object.assign(input, {
        tutorialPlatform: parsed.platform,
        tutorialEmbedId: parsed.embedId,
        tutorialThumbnail,
      });
    }

    const result = await this.tutorialModel
      .findByIdAndUpdate({ _id: id }, input, { new: true })
      .exec();
    if (!result)
      throw new Errors(HttpCode.NOT_MODIFIED, Message.UPDATE_FAILED);

    return result;
  }

  /** Hard delete — unlike Product/Review, nothing else references a
   * Tutorial (no orders, no reviews), so there's no soft-delete status to
   * preserve referential integrity for. */
  public async deleteTutorial(id: string): Promise<Tutorial> {
    id = shapeIntoMongooseObjectId(id);
    const result = await this.tutorialModel.findByIdAndDelete(id).exec();
    if (!result) throw new Errors(HttpCode.NOT_FOUND, Message.NO_DATA_FOUND);

    return result;
  }
}
export default TutorialService;
