import { Response } from "express";
import { T } from "../libs/types/common";
import { ExtendenRequest } from "../libs/types/member";
import BeautyService from "../models/Beauty.service";
import { chatInput, parseInput, routineInput } from "../libs/validation";
import { sendError } from "../libs/utils/monitoring";
import { HttpCode } from "../libs/Errors";

const beautyService = new BeautyService();

const beautyController: T = {};

/** AI Beauty is members-only (verifyAuth runs first on every route here). */

/** Answers left today, and the member's saved routine. */
beautyController.getStatus = async (req: ExtendenRequest, res: Response) => {
  try {
    const status = await beautyService.getStatus(req.member._id);
    res.status(HttpCode.OK).json(status);
  } catch (err) {
    console.log("Error on getStatus", err);
    sendError(res, err);
  }
};

/** Quiz answers in, a routine of in-stock products out. */
beautyController.buildRoutine = async (req: ExtendenRequest, res: Response) => {
  try {
    console.log("buildRoutine");
    const input = parseInput(routineInput, req.body);
    const routine = await beautyService.buildRoutine(req.member._id, input);
    res.status(HttpCode.OK).json(routine);
  } catch (err) {
    console.log("Error on buildRoutine", err);
    sendError(res, err);
  }
};

/** A direct question in, a short answer and up to four products out. */
beautyController.chat = async (req: ExtendenRequest, res: Response) => {
  try {
    console.log("aiChat");
    const input = parseInput(chatInput, req.body);
    const answer = await beautyService.chat(req.member._id, input);
    res.status(HttpCode.OK).json(answer);
  } catch (err) {
    console.log("Error on aiChat", err);
    sendError(res, err);
  }
};

export default beautyController;
