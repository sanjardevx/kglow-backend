import { MemberStatus, MemberType } from "./../libs/enums/member.enum";
import Errors, { HttpCode, Message } from "../libs/Errors";
import {
  LoginInput,
  Member,
  MemberInput,
  MemberUpdateInput,
} from "../libs/types/member";
import MemberModel from "../schema/Member.model";
import { T } from "../libs/types/common";
import * as bcrypt from "bcryptjs";
import { shapeIntoMongooseObjectId } from "../libs/config";
import { skipFor } from "../libs/utils/paging";
import { GoogleProfile } from "../libs/utils/google";
import crypto from "crypto";

/** A nickname from a Google profile: the name they go by, else the part of
 *  their email before the @, trimmed to what the nickname rules allow. */
function nickFromGoogle(profile: GoogleProfile): string {
  const fromName = (profile.name ?? "").replace(/\s+/g, " ").trim();
  const fromEmail = (profile.email ?? "").split("@")[0];
  const base = fromName.length >= 2 ? fromName : fromEmail;
  return (base.length >= 2 ? base : "K-Glow member").slice(0, 24);
}

class MemberService {
  private readonly memberModel; // holds the MongoDB model (used to query the DB)

  constructor() {
    this.memberModel = MemberModel; // connect to the Member collection in MongoDB
  }

  /**
   * ==================================================
   *                     SPA
   * ==================================================
   */

  public async signup(input: MemberInput): Promise<Member> {
    const salt = await bcrypt.genSalt();
    input.memberPassword = await bcrypt.hash(input.memberPassword, salt);

    try {
      const result = await this.memberModel.create(input);
      result.memberPassword = "";
      return result.toJSON();
    } catch (error) {
      throw new Errors(HttpCode.BAD_REQUEST, Message.USED_NICK_PHONE);
    }
  }

  public async login(input: LoginInput): Promise<Member> {
    // TODO: Consider member status later
    const member = await this.memberModel
      .findOne(
        {
          memberNick: input.memberNick,
          memberStatus: { $ne: MemberStatus.DELETE },
        },
        { memberNick: 1, memberPassword: 1, memberStatus: 1 },
      )
      .exec();

    if (!member) throw new Errors(HttpCode.NOT_FOUND, Message.NO_MEMBER_NICK);
    else if (member.memberStatus === MemberStatus.BLOCK) {
      throw new Errors(HttpCode.FORBIDDEN, Message.BLOCKED_USER);
    }
    // Joined with Google, so there is no password to compare against.
    if (!member.memberPassword)
      throw new Errors(HttpCode.UNAUTHORIZED, Message.GOOGLE_ACCOUNT);

    const isMatch = await bcrypt.compare(
      input.memberPassword,
      member.memberPassword,
    );

    if (!isMatch) {
      throw new Errors(HttpCode.UNAUTHORIZED, Message.WRONG_PASSWORD);
    }

    return await this.memberModel.findById(member._id).lean().exec();
  }

  /**
   * Signs a Google account in, creating the member the first time. One
   * button covers both: the shopper doesn't have to know whether they've
   * been here before.
   */
  public async googleSignIn(
    profile: GoogleProfile,
  ): Promise<{ member: Member; isNew: boolean }> {
    const existing = await this.memberModel
      .findOne({ memberGoogleId: profile.googleId })
      .lean()
      .exec();

    if (existing && existing.memberStatus === MemberStatus.BLOCK)
      throw new Errors(HttpCode.FORBIDDEN, Message.BLOCKED_USER);
    if (existing && existing.memberStatus !== MemberStatus.DELETE)
      return { member: existing, isNew: false };
    // A deleted account gives up its link, so the same Google account can
    // start over as a new member.
    if (existing)
      await this.memberModel
        .updateOne({ _id: existing._id }, { $unset: { memberGoogleId: 1 } })
        .exec();

    // Nicknames are unique and Google names are not: on a clash, try again
    // with a short number on the end.
    const base = nickFromGoogle(profile);
    for (let attempt = 0; attempt < 5; attempt++) {
      const memberNick =
        attempt === 0 ? base : `${base.slice(0, 24)} ${crypto.randomInt(100, 10000)}`;
      try {
        const created = await this.memberModel.create({
          memberNick,
          memberType: MemberType.USER,
          memberGoogleId: profile.googleId,
          memberEmail: profile.email,
        });
        const member = created.toJSON();
        delete member.memberGoogleId;
        return { member, isNew: true };
      } catch (err) {
        const duplicateNick =
          (err as { code?: number; keyPattern?: T }).code === 11000 &&
          (err as { keyPattern?: T }).keyPattern?.memberNick;
        if (!duplicateNick) {
          console.log("Error, model:googleSignIn:", err);
          throw new Errors(HttpCode.BAD_REQUEST, Message.CREATE_FAILED);
        }
      }
    }
    throw new Errors(HttpCode.BAD_REQUEST, Message.USED_NICK_PHONE);
  }

  /** Who a token belongs to, as long as they may still sign in. */
  public async findActiveMember(id: string): Promise<Member | null> {
    return await this.memberModel
      .findOne({
        _id: shapeIntoMongooseObjectId(id),
        memberStatus: MemberStatus.ACTIVE,
      })
      .lean()
      .exec();
  }

  public async getMemberDetails(member: Member): Promise<Member> {
    const memberId = shapeIntoMongooseObjectId(member._id);
    const result = await this.memberModel
      .findOne({ _id: memberId, memberStatus: MemberStatus.ACTIVE })
      .exec();

    if (!result) throw new Errors(HttpCode.NOT_FOUND, Message.NO_DATA_FOUND);

    return result;
  }

  public async updateMember(
    member: Member,
    input: Partial<MemberUpdateInput>,
  ): Promise<Member> {
    const memberId = shapeIntoMongooseObjectId(member._id);
    const result = await this.memberModel
      .findOneAndUpdate({ _id: memberId }, input, { new: true })
      .exec();

    if (!result) throw new Errors(HttpCode.NOT_MODIFIED, Message.UPDATE_FAILED);

    return result;
  }

  public async getTopUsers(): Promise<Member[]> {
    const result = await this.memberModel
      .find({
        memberStatus: MemberStatus.ACTIVE,
        memberPoints: { $gt: 1 },
      })
      .sort({ memberPoints: -1 })
      .limit(4)
      .exec();
    if (!result) throw new Errors(HttpCode.NOT_FOUND, Message.NO_DATA_FOUND);

    return result;
  }

  public async addUserPoint(member: Member, point: number): Promise<Member> {
    const memberId = shapeIntoMongooseObjectId(member._id);

    return await this.memberModel
      .findOneAndUpdate(
        {
          _id: memberId,
          memberType: MemberType.USER,
          memberStatus: MemberStatus.ACTIVE,
        },
        { $inc: { memberPoints: point } },
        { new: true },
      )
      .exec();
  }

  /**
   * ==================================================
   *                     SSR
   * ==================================================
   */

  public async processSignup(input: MemberInput): Promise<Member> {
    const exist = await this.memberModel
      .findOne({ memberType: MemberType.ADVISOR })
      .exec();
    if (exist) throw new Errors(HttpCode.BAD_REQUEST, Message.CREATE_FAILED); // block if already exists

    const salt = await bcrypt.genSalt();
    input.memberPassword = await bcrypt.hash(input.memberPassword, salt);

    try {
      const result = await this.memberModel.create(input); // save new member to MongoDB
      result.memberPassword = ""; // hide the password before returning
      return result;
    } catch (error) {
      throw new Errors(HttpCode.BAD_REQUEST, Message.CREATE_FAILED);
    }
  }

  public async processLogin(input: LoginInput): Promise<Member> {
    const member = await this.memberModel
      .findOne(
        // Only an advisor can sign in here: a shopper's correct password must
        // never open the admin panel.
        { memberNick: input.memberNick, memberType: MemberType.ADVISOR },
        { memberNick: 1, memberPassword: 1 },
      )
      .exec();

    if (!member) throw new Errors(HttpCode.NOT_FOUND, Message.NO_MEMBER_NICK);

    // const isMatch = input.memberPassword === member.memberPassword;
    const isMatch = await bcrypt.compare(
      input.memberPassword,
      member.memberPassword!,
    );

    if (!isMatch) {
      throw new Errors(HttpCode.UNAUTHORIZED, Message.WRONG_PASSWORD);
    }

    return await this.memberModel.findById(member._id).exec();
  }

  /** SSR: one page of the admin's user list, newest first. */
  public async getUsers(
    page: number,
    size: number,
  ): Promise<{ list: Member[]; total: number }> {
    const filter = { memberType: MemberType.USER };
    const total = await this.memberModel.countDocuments(filter).exec();
    const result = await this.memberModel
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skipFor(page, size))
      .limit(size)
      .exec();
    if (!result) throw new Errors(HttpCode.NOT_FOUND, Message.NO_DATA_FOUND);

    return { list: result, total };
  }

  public async updateChosenUser(input: MemberUpdateInput): Promise<Member[]> {
    input._id = shapeIntoMongooseObjectId(input._id);
    const result = await this.memberModel
      .findByIdAndUpdate({ _id: input._id }, input, { new: true })
      .exec();
    if (!result) throw new Errors(HttpCode.NOT_MODIFIED, Message.UPDATE_FAILED);

    return result;
  }
}

export default MemberService;
