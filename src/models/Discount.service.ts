import Errors, { HttpCode, Message } from "../libs/Errors";
import {
  ActiveDiscount,
  Discount,
  DiscountUpdateInput,
} from "../libs/types/discount";
import DiscountModel from "../schema/Discount.model";

/**
 * Today's calendar date in Tashkent, as "YYYY-MM-DD".
 *
 * This server runs in Singapore, three hours ahead of the shop's customers,
 * so a sale set to end on the 31st would stop selling at 9pm on the 30th
 * their time. Comparing calendar dates as text avoids timezone arithmetic
 * altogether — "en-CA" formats as YYYY-MM-DD, which sorts correctly as a
 * plain string, so `today > endsOn` is all the comparison needed.
 */
function todayInTashkent(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tashkent" });
}

class DiscountService {
  private readonly discountModel;

  constructor() {
    this.discountModel = DiscountModel;
  }

  /** Created on first use, so nothing has to handle "never configured". */
  public async getSettings(): Promise<Discount> {
    const existing = await this.discountModel.findOne().exec();
    if (existing) return existing as unknown as Discount;

    return (await this.discountModel.create({})) as unknown as Discount;
  }

  /**
   * Everything that touches money asks here rather than reading the document,
   * so the switch, the end date and the percentage can never be interpreted
   * differently by two callers.
   */
  private runningPercent(settings: Discount): number {
    if (!settings.discountIsActive) return 0;
    if (settings.discountPercent <= 0) return 0;
    if (settings.discountEndsOn && todayInTashkent() > settings.discountEndsOn)
      return 0;

    return settings.discountPercent;
  }

  /** The percentage an order placed right now earns — 0 when no sale is on. */
  public async getActivePercent(): Promise<number> {
    return this.runningPercent(await this.getSettings());
  }

  /** What the storefront is told — the offer, never the switch behind it. */
  public async getActiveDiscount(): Promise<ActiveDiscount> {
    const settings = await this.getSettings();
    const percent = this.runningPercent(settings);
    if (!percent) return { percent: 0, label: "", endsOn: "" };

    return {
      percent,
      label: settings.discountLabel,
      endsOn: settings.discountEndsOn,
    };
  }

  /** SSR — the admin form posts here. */
  public async updateSettings(
    input: DiscountUpdateInput,
  ): Promise<Discount> {
    const percent = Number(input.discountPercent);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100)
      throw new Errors(HttpCode.BAD_REQUEST, Message.INVALID_DISCOUNT_PERCENT);

    // A malformed date would silently behave as "no end date" and leave a
    // sale running for ever, which is the one failure worth being strict about.
    const endsOn = (input.discountEndsOn || "").trim();
    if (endsOn && !/^\d{4}-\d{2}-\d{2}$/.test(endsOn))
      throw new Errors(HttpCode.BAD_REQUEST, Message.INVALID_DISCOUNT_DATE);

    const settings = await this.getSettings();
    const result = await this.discountModel
      .findByIdAndUpdate(
        settings._id,
        {
          discountPercent: percent,
          discountIsActive: Boolean(input.discountIsActive),
          discountEndsOn: endsOn,
          discountLabel: (input.discountLabel || "").trim(),
        },
        { new: true },
      )
      .exec();

    if (!result) throw new Errors(HttpCode.NOT_MODIFIED, Message.UPDATE_FAILED);
    return result as unknown as Discount;
  }
}

export default DiscountService;
