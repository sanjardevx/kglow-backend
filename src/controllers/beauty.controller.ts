import { Response } from "express";
import { T } from "../libs/types/common";
import { ExtendenRequest } from "../libs/types/member";
import BeautyService from "../models/Beauty.service";
import { chatInput, parseInput, routineInput } from "../libs/validation";
import { sendError } from "../libs/utils/monitoring";
import Errors, { HttpCode, Message } from "../libs/Errors";

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

/**
 * The same chat, streamed: one JSON event per line while the answer is
 * written ({"type":"reply","text":…} with the reply so far, "tools" while
 * products are looked up), then {"type":"done", …the usual answer}.
 * Problems found before anything is sent (not signed in, no tries left, a
 * bad question) still come back as an ordinary error response; one that
 * happens mid-answer arrives as {"type":"error","message":…} and the try is
 * given back.
 */
beautyController.chatStream = async (req: ExtendenRequest, res: Response) => {
  let started = false;
  const send = (event: object) => {
    if (!started) {
      started = true;
      res.status(HttpCode.OK).set({
        "Content-Type": "application/x-ndjson; charset=utf-8",
        // no-transform keeps compression from holding the lines back;
        // X-Accel-Buffering does the same for nginx.
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders();
    }
    res.write(`${JSON.stringify(event)}\n`);
  };

  try {
    console.log("aiChatStream");
    const input = parseInput(chatInput, req.body);
    const answer = await beautyService.chat(req.member._id, input, send);
    send({ type: "done", ...answer });
    res.end();
  } catch (err) {
    console.log("Error on aiChatStream", err);
    if (!started) return sendError(res, err);
    const message = err instanceof Errors ? err.message : Message.AI_CHAT_FAILED;
    send({ type: "error", message });
    res.end();
  }
};

export default beautyController;
