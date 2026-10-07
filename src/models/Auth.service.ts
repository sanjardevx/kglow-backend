import { AUTH_TIMER } from "../libs/config";
import Errors, { HttpCode, Message } from "../libs/Errors";
import { Member } from "../libs/types/member";
import jwt from "jsonwebtoken";

/**
 * The token only says who someone is. Everything else — type, status — is read
 * fresh from the database on each request, so a block takes effect at once
 * rather than when the token runs out. Older tokens carried the whole member;
 * they still hold `_id`, so they keep working until they expire.
 */
export interface TokenPayload {
  _id: string;
}

class AuthService {
  private readonly secretToken;

  constructor() {
    this.secretToken = process.env.SECTER_TOKEN as string;
  }

  public async createToken(member: Member): Promise<string> {
    return new Promise((resolve, reject) => {
      const payload: TokenPayload = { _id: String(member._id) };
      const duration = `${AUTH_TIMER}h`;
      jwt.sign(
        payload,
        this.secretToken,
        { expiresIn: duration, algorithm: "HS256" },
        (err, token) => {
          if (err)
            reject(
              new Errors(HttpCode.UNAUTHORIZED, Message.TOKEN_CREATION_FAILED),
            );
          else resolve(token as string);
        },
      );
    });
  }

  public checkAuth(token: string): TokenPayload {
    return jwt.verify(token, this.secretToken, {
      algorithms: ["HS256"],
    }) as TokenPayload;
  }
}

export default AuthService;
