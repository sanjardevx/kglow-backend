import { Request, Response } from "express";
import Errors, { HttpCode, Message } from "../libs/Errors";
import { T } from "../libs/types/common";
import TutorialService from "../models/Tutorial.service";
import { AdminRequest } from "../libs/types/member";
import { TutorialInput, TutorialInquiry } from "../libs/types/tutorial";

const tutorialService = new TutorialService();

const tutorialController: T = {};

/** SPA */
tutorialController.getTutorials = async (req: Request, res: Response) => {
  try {
    console.log("getTutorials");
    const { page, limit } = req.query;
    const inquiry: TutorialInquiry = {
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 12,
    };

    const result = await tutorialService.getTutorials(inquiry);

    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error on getTutorials", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standart.code).json(Errors.standart);
  }
};

tutorialController.getTutorial = async (req: Request, res: Response) => {
  try {
    console.log("getTutorial");
    const { id } = req.params;

    const result = await tutorialService.getTutorial(id);

    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error on getTutorial", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standart.code).json(Errors.standart);
  }
};

/** SSR */
tutorialController.getAllTutorials = async (req: Request, res: Response) => {
  try {
    console.log("getAllTutorials");
    const data = await tutorialService.getAllTutorials();

    res.render("tutorials", { tutorials: data });
  } catch (err) {
    console.log("Error on getAllTutorials", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standart.code).json(Errors.standart);
  }
};

tutorialController.createNewTutorial = async (
  req: AdminRequest,
  res: Response,
) => {
  try {
    console.log("createNewTutorial");
    console.log("req.body:", req.body);

    const data: TutorialInput = req.body;

    await tutorialService.createNewTutorial(data);
    res.send(
      `<script>alert("Successful creation"); window.location.replace('/admin/tutorial/all') </script>`,
    );
  } catch (err) {
    console.log("Error on createNewTutorial", err);
    const message =
      err instanceof Errors ? err.message : Message.SOMETHING_WENT_WRONG;
    res.send(
      `<script>alert("${message}"); window.location.replace('/admin/tutorial/all') </script>`,
    );
  }
};

tutorialController.updateChosenTutorial = async (
  req: Request,
  res: Response,
) => {
  try {
    console.log("updateChosenTutorial");
    const id = req.params.id;

    const result = await tutorialService.updateChosenTutorial(id, req.body);

    res.status(HttpCode.OK).json({ data: result });
  } catch (err) {
    console.log("Error on updateChosenTutorial", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standart.code).json(Errors.standart);
  }
};

tutorialController.deleteTutorial = async (req: Request, res: Response) => {
  try {
    console.log("deleteTutorial");
    const id = req.params.id;

    const result = await tutorialService.deleteTutorial(id);

    res.status(HttpCode.OK).json({ data: result });
  } catch (err) {
    console.log("Error on deleteTutorial", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standart.code).json(Errors.standart);
  }
};

export default tutorialController;
