import { AxiosRequestConfig } from "axios";
import { load } from "cheerio";
import { addDays, isValid, set, setDay } from "date-fns";
import {
  IShipmentActivities,
  IShipperClientOptions,
  IShipperResponse,
  ShipperClient,
  STATUS_TYPES,
} from "./shipper";

const MONTHS = [
  /JANUARY/,
  /FEBRUARY/,
  /MARCH/,
  /APRIL/,
  /MAY/,
  /JUNE/,
  /JULY/,
  /AUGUST/,
  /SEPTEMBER/,
  /OCTOBER/,
  /NOVEMBER/,
  /DECEMBER/,
];
const DAYS_OF_WEEK = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

interface IAmazonShipment {
  $: cheerio.Root;
  response: {
    toString: () => string;
  };
}

interface IAmazonRequestOptions extends IShipperClientOptions {
  orderID: string;
  orderingShipmentId: string;
}

class AmazonClient extends ShipperClient<
  IAmazonShipment,
  IAmazonRequestOptions
> {
  private STATUS_MAP = new Map<string, STATUS_TYPES>([
    ["ORDERED", STATUS_TYPES.SHIPPING],
    ["SHIPPED", STATUS_TYPES.EN_ROUTE],
    ["IN_TRANSIT", STATUS_TYPES.EN_ROUTE],
    ["OUT_FOR_DELIVERY", STATUS_TYPES.OUT_FOR_DELIVERY],
    ["DELIVERED", STATUS_TYPES.DELIVERED],
  ]);

  async validateResponse(
    response: string
  ): Promise<IShipperResponse<IAmazonShipment>> {
    const $ = load(response, { normalizeWhitespace: true });

    return Promise.resolve({ err: null, shipment: { $, response } });
  }

  getService(): undefined {
    return undefined;
  }

  getWeight(): undefined {
    return undefined;
  }

  getDestination(data: IAmazonShipment): string {
    if (data == null) {
      return;
    }
    const { $ } = data;
    const dest = $(".delivery-address").text();
    if (dest != null ? dest.length : undefined) {
      return this.presentLocationString(dest);
    }
  }

  getEta(data: IAmazonShipment): Date {
    if (data == null) {
      return;
    }
    let eta: Date = null;
    const baseDate = set(new Date(), {
      hours: 20,
      minutes: 0,
      seconds: 0,
      milliseconds: 0,
    });
    const { response } = data;
    // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
    let matchResult = response
      .toString()
      .match('"promiseMessage":"Arriving (.*?)"');
    if (matchResult == null) {
      // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
      matchResult = response
        .toString()
        .match('"promiseMessage":"Now expected (.*?)"');
    }
    let arrival: string = matchResult != null ? matchResult[1] : undefined;
    if (arrival != null ? /today/.exec(arrival) : undefined) {
      eta = baseDate;
    } else if (arrival != null ? /tomorrow/.exec(arrival) : undefined) {
      eta = addDays(baseDate, 1);
    } else {
      if (arrival != null ? /-/.exec(arrival) : undefined) {
        arrival = arrival.split("-")[1]; // Get latest possible ETA
      }
      let foundMonth = false;
      for (const month of Array.from(MONTHS)) {
        if (month.exec(arrival?.toUpperCase())) {
          foundMonth = true;
        }
      }
      if (foundMonth) {
        eta = set(new Date(arrival), {
          year: new Date().getUTCFullYear(),
          hours: 20,
          minutes: 0,
          seconds: 0,
          milliseconds: 0,
        });
      } else {
        for (const dayOfWeek in DAYS_OF_WEEK) {
          const dayNum = DAYS_OF_WEEK[dayOfWeek] as number;
          // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
          if (arrival?.toUpperCase().match(dayOfWeek)) {
            eta = setDay(baseDate, dayNum);
          }
        }
      }
    }
    if (!(eta ? isValid(eta) : undefined)) {
      return;
    }
    return eta != null ? eta : undefined;
  }

  presentStatus(data: IAmazonShipment): STATUS_TYPES {
    const { response } = data;
    // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
    const matches = response.toString().match('"shortStatus":"(.*?)"');
    return matches?.length > 0 ? this.STATUS_MAP.get(matches[1]) : undefined;
  }

  getActivitiesAndStatus(data: IAmazonShipment): IShipmentActivities {
    const activities = [];
    const status = this.presentStatus(data);
    if (data == null) {
      return { activities, status };
    }
    const { $ } = data;
    for (const row of Array.from(
      $("#tracking-events-container")
        .children(".a-container")
        .children(".a-row")
    )) {
      if (!$(row).children(".tracking-event-date-header").length) {
        continue;
      }
      let dateText = "";
      const rows = Array.from($(row).children(".a-row"));
      for (const row of rows) {
        const subrow = $(row);
        const cols = subrow.children(".a-column");
        if (subrow.hasClass("tracking-event-date-header")) {
          dateText = subrow.children(".tracking-event-date").text();
          if (dateText.split(",").length === 2) {
            dateText += `, ${new Date().getUTCFullYear()}`;
          }
        } else if (cols.length === 2) {
          let timestamp: Date;
          const details = $(cols[1]).find(".tracking-event-message").text();
          const location = $(cols[1]).find(".tracking-event-location").text();
          const timeText = $(cols[0]).find(".tracking-event-time").text();
          if (dateText ? dateText.length : undefined) {
            if (timeText != null ? timeText.length : undefined) {
              timestamp = new Date(`${dateText} ${timeText} +0000`);
            } else {
              timestamp = new Date(`${dateText} 00:00:00 +0000`);
            }
          }
          activities.push({ timestamp, location, details });
        }
      }
    }
    return { activities, status };
  }

  public requestOptions(options: IAmazonRequestOptions): AxiosRequestConfig {
    const { orderID, orderingShipmentId } = options;
    return {
      url:
        "https://www.amazon.com/gp/css/shiptrack/view.html" +
        "/ref=pe_385040_121528360_TE_SIMP_typ?ie=UTF8" +
        `&orderID=${orderID}` +
        `&orderingShipmentId=${orderingShipmentId}` +
        "&packageId=1",
      method: "GET",
      headers: {
        accept: "text/html",
        "accept-encoding": "gzip",
      },
    };
  }
}

export { AmazonClient };
