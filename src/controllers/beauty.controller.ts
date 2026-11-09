import { Request, Response } from "express";
import { T } from "../libs/types/common";
import BeautyService from "../models/Beauty.service";
import { parseInput, routineInput } from "../libs/validation";
import { sendError } from "../libs/utils/monitoring";
import { HttpCode } from "../libs/Errors";

const beautyService = new BeautyService();

const beautyController: T = {};

/** AI Beauty: quiz answers in, a routine of in-stock products out. Open to
 *  guests — the rate limit on the route is what keeps it affordable. */
beautyController.buildRoutine = async (req: Request, res: Response) => {
  try {
    console.log("buildRoutine");
    const input = parseInput(routineInput, req.body);
    const routine = await beautyService.buildRoutine(input);
    res.status(HttpCode.OK).json(routine);
  } catch (err) {
    console.log("Error on buildRoutine", err);
    sendError(res, err);
  }
};

export default beautyController;
