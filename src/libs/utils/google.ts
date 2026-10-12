/**
 * Google sign-in: checks the ID token the shop's Google button hands over.
 *
 * The browser gets a signed JWT straight from Google; nothing in it can be
 * trusted until Google's signature, the expiry and the audience (our own
 * client id — not some other site's token replayed here) are all verified.
 * google-auth-library does all three and caches Google's public keys.
 */
import { OAuth2Client } from "google-auth-library";
import Errors, { HttpCode, Message } from "../Errors";

export interface GoogleProfile {
  googleId: string;
  email?: string;
  name?: string;
}

let client: OAuth2Client | null = null;

export async function verifyGoogleCredential(
  credential: string,
): Promise<GoogleProfile> {
  // Read per call rather than at import, so a deploy that adds the variable
  // (and the tests) don't depend on load order.
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Errors(HttpCode.BAD_REQUEST, Message.GOOGLE_OFF);
  client ??= new OAuth2Client(clientId);

  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: clientId,
    });
    payload = ticket.getPayload();
  } catch (err) {
    console.log("Error, verifyGoogleCredential:", err);
    throw new Errors(HttpCode.UNAUTHORIZED, Message.GOOGLE_FAILED);
  }
  if (!payload?.sub)
    throw new Errors(HttpCode.UNAUTHORIZED, Message.GOOGLE_FAILED);

  return {
    googleId: payload.sub,
    // Only a verified address is worth keeping: an unverified one could be
    // anybody's.
    email: payload.email_verified ? payload.email : undefined,
    name: payload.name ?? payload.given_name,
  };
}
