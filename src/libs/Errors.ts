// HTTP status codes — used when sending responses back to the browser
export enum HttpCode {
  OK = 200, // success
  CREATED = 201, // something was created successfully
  NOT_MODIFIED = 304, // nothing changed
  BAD_REQUEST = 400, // client sent wrong/invalid data
  UNAUTHORIZED = 401, // not logged in
  FORBIDDEN = 403, // logged in but no permission
  NOT_FOUND = 404, // resource doesn't exist
  TOO_MANY_REQUESTS = 429, // rate limit hit
  INTERNAL_SERVER_ERROR = 500, // something broke on the server
}

// Reusable error messages
export enum Message {
  SOMETHING_WENT_WRONG = "Something went wrong!",
  NO_DATA_FOUND = "No data found!",
  CREATE_FAILED = "Create failed!",
  UPDATE_FAILED = "Update failed!",

  USED_NICK_PHONE = "You are inserting already used nick or phone!",
  TOKEN_CREATION_FAILED = "Token creation failed!",
  NO_MEMBER_NICK = "No member with that member nick",
  BLOCKED_USER = "You have been blocked, contact the admin!",
  GOOGLE_ACCOUNT = "This account signs in with Google — use the Google button.",
  GOOGLE_FAILED = "Google sign-in failed, please try again.",
  GOOGLE_OFF = "Google sign-in isn't set up yet.",

  AI_OFF = "AI Beauty isn't set up yet.",
  AI_FAILED = "We couldn't build your routine just now, please try again.",
  AI_CHAT_FAILED = "We couldn't answer just now, please try again.",
  AI_LIMIT = "You've used today's AI answers. Come back tomorrow!",
  WRONG_PASSWORD = "Wrong password, please try again!",
  NOT_AUTHENTICATED = "You are not authenticated, please login first!",
  TOO_MANY_ATTEMPTS = "Too many attempts, please try again later!",

  INVALID_TUTORIAL_LINK = "Please paste a valid YouTube or Instagram link!",

  REJECT_NEEDS_REASON = "Please write why this order is being rejected!",
  PRODUCT_NEEDS_IMAGE = "A product needs at least one image!",
  DUPLICATE_PRODUCT = "A product with this brand, name and volume already exists!",
  INVALID_PRODUCT_NUMBERS = "Price and stock cannot be negative!",

  INVALID_DISCOUNT_PERCENT = "The discount must be between 0 and 100!",
  INVALID_DISCOUNT_DATE = "Please pick a valid end date!",
  PRODUCT_UNAVAILABLE = "One of the products is no longer available!",
  NOT_ENOUGH_STOCK = "Sorry, there isn't enough stock left for one of the products!",

  INVALID_IMAGE_FILE = "Please upload an image (jpg, png, webp, avif or heic) under 10 MB!",

  INVALID_INPUT = "Please check your input and try again!",
  NICK_LENGTH = "Your name must be 2 to 30 characters!",
  INVALID_PHONE = "Please enter a valid phone number!",
  PASSWORD_LENGTH = "Password must be 6 to 72 characters!",
  TEXT_TOO_LONG = "That text is too long, please shorten it!",
  INVALID_ORDER_ITEMS = "Something is wrong with your basket, please refresh and try again!",
}

// Custom error class — combines an HTTP code + a message into one object
class Errors extends Error {
  public code: HttpCode;
  public message: Message;

  static standart = {
    code: HttpCode.INTERNAL_SERVER_ERROR,
    message: Message.SOMETHING_WENT_WRONG,
  };

  constructor(statusCode: HttpCode, statusMessage: Message) {
    super();
    this.code = statusCode;
    this.message = statusMessage;
  }
}

export default Errors;
