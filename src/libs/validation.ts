import { z } from "zod";
import Errors, { HttpCode, Message } from "./Errors";
import { ProductCategory } from "./enums/product.enum";
import { OrderStatus } from "./enums/order.enum";

const OWN_MESSAGES = new Set<string>(Object.values(Message));

/**
 * Checks what arrived against a schema and returns only the fields the schema
 * names — anything extra is dropped. A failure is a 400 carrying the first
 * problem's message when it is one of ours, so the shopper reads what to fix;
 * zod's own wording never reaches them.
 */
export function parseInput<S extends z.ZodType>(
  schema: S,
  data: unknown,
): z.infer<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const first = result.error.issues[0]?.message ?? "";
  throw new Errors(
    HttpCode.BAD_REQUEST,
    OWN_MESSAGES.has(first) ? (first as Message) : Message.INVALID_INPUT,
  );
}

/** A route's `:id` that can't be an id can't name anything either. */
export function parseIdParam(value: unknown): string {
  if (typeof value === "string" && OBJECT_ID.test(value)) return value;
  throw new Errors(HttpCode.NOT_FOUND, Message.NO_DATA_FOUND);
}

const OBJECT_ID = /^[0-9a-f]{24}$/i;

// Plain strings only: an object here is how `{ "$ne": null }` would slip a
// query operator into a database filter.
const text = (max: number) => z.string().max(max, Message.TEXT_TOO_LONG);

// A blank field in the profile form means "leave it", not "erase it" — an
// empty nick can't sign in again, and empty phones collide on the unique index.
const blankAsMissing = (v: unknown) => (v === "" ? undefined : v);

const memberNick = z
  .string()
  .refine((v) => v.trim().length >= 2 && v.length <= 30, Message.NICK_LENGTH);
const memberPhone = z
  .string()
  .regex(/^\+?[0-9\s\-()]{7,20}$/, Message.INVALID_PHONE);

/** Members **/
export const signupInput = z.object({
  memberNick,
  memberPhone,
  // bcrypt only reads the first 72 bytes.
  memberPassword: z
    .string()
    .min(6, Message.PASSWORD_LENGTH)
    .max(72, Message.PASSWORD_LENGTH),
});

export const loginInput = z.object({
  memberNick: z.string().min(1).max(100),
  memberPassword: z.string().min(1).max(200),
});

export const memberUpdateInput = z.object({
  memberNick: z.preprocess(blankAsMissing, memberNick.optional()),
  memberPhone: z.preprocess(blankAsMissing, memberPhone.optional()),
  memberAddress: text(300).optional(),
  memberDesc: text(500).optional(),
});

/** Lists **/
const page = z.coerce.number().int().min(1).default(1);
// Over-asking is clamped rather than refused: 100 is the most the shop asks for.
const limit = (fallback: number) =>
  z.coerce
    .number()
    .int()
    .min(1)
    .default(fallback)
    .transform((n) => Math.min(n, 100));

export const productInquiry = z.object({
  page,
  limit: limit(10),
  // Only fields there's a reason to sort the catalog by; anything else sorts newest first.
  order: z.enum(["createdAt", "productViews", "productPrice"]).catch("createdAt"),
  productCategory: z.enum(ProductCategory).optional(),
  search: z.string().trim().max(50, Message.TEXT_TOO_LONG).optional(),
});

export const listInquiry = z.object({ page, limit: limit(12) });

export const orderInquiry = z.object({
  page,
  limit: limit(10),
  orderStatus: z.enum(OrderStatus),
});

/** Orders **/
// The admin's two buttons. Anything else — back to waiting, an unknown
// status — isn't a decision the order page can make.
export const orderDecisionInput = z.object({
  orderId: z.string().regex(OBJECT_ID),
  orderStatus: z.enum([OrderStatus.CONFIRMED, OrderStatus.REJECTED]),
  rejectReason: text(500).optional(),
});

// Multipart can't carry an array, so the basket arrives as a JSON string.
const parseJson = (v: unknown) => {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};

export const orderCreateInput = z.object({
  items: z.preprocess(
    parseJson,
    z
      .array(
        z.object({
          productId: z
            .string(Message.INVALID_ORDER_ITEMS)
            .regex(OBJECT_ID, Message.INVALID_ORDER_ITEMS),
          itemQuantity: z.coerce
            .number(Message.INVALID_ORDER_ITEMS)
            .int(Message.INVALID_ORDER_ITEMS)
            .min(1, Message.INVALID_ORDER_ITEMS)
            .max(99, Message.INVALID_ORDER_ITEMS),
        }),
        Message.INVALID_ORDER_ITEMS,
      )
      .min(1, Message.INVALID_ORDER_ITEMS)
      .max(50, Message.INVALID_ORDER_ITEMS),
  ),
  deliveryAddress: text(300).optional(),
  transferNote: text(500).optional(),
});
