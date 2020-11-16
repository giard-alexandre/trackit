import { AxiosRequestConfig } from "axios";
import { upperCaseFirst } from "change-case";
import { load } from "cheerio";
import moment from "moment-timezone";
import {
  IShipmentActivities,
  IShipperClientOptions,
  IShipperResponse,
  ShipperClient,
  STATUS_TYPES,
} from "./shipper";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface IDhlgmShipment {}

interface IDhlgmRequestOptions extends IShipperClientOptions {
  trackingNumber: string;
}

class DhlGmClient extends ShipperClient<IDhlgmShipment, IDhlgmRequestOptions> {
  private STATUS_MAP = new Map<string, STATUS_TYPES>([
    ["electronic notification received", STATUS_TYPES.SHIPPING],
    ["out for delivery", STATUS_TYPES.OUT_FOR_DELIVERY],
    ["departure origin", STATUS_TYPES.EN_ROUTE],
    ["transferred", STATUS_TYPES.EN_ROUTE],
    ["cleared", STATUS_TYPES.EN_ROUTE],
    ["received", STATUS_TYPES.EN_ROUTE],
    ["processed", STATUS_TYPES.EN_ROUTE],
    ["sorted", STATUS_TYPES.EN_ROUTE],
    ["sorting complete", STATUS_TYPES.EN_ROUTE],
    ["arrival", STATUS_TYPES.EN_ROUTE],
    ["tendered", STATUS_TYPES.EN_ROUTE],
    ["delivered", STATUS_TYPES.DELIVERED],
  ]);

  validateResponse(
    response: string
  ): Promise<IShipperResponse<IDhlgmShipment>> {
    try {
      response = response.replace(/<br>/gi, " ");
      return Promise.resolve({
        shipment: load(response, { normalizeWhitespace: true }),
      });
    } catch (error) {
      return Promise.resolve({ err: new Error(error) });
    }
  }

  extractSummaryField(data: cheerio.Root, regex: RegExp): string {
    if (data == null) {
      return;
    }
    const $ = data;
    let value: string;
    $(".card-info > dl")
      .children()
      .each((_, field) => {
        if (regex.test($(field).text())) {
          value = $(field)?.next()?.text()?.trim();
        }
        if (value != null) {
          return false;
        }
      });
    return value;
  }

  extractHeaderField(data: cheerio.Root, regex: RegExp): string {
    if (data == null) {
      return;
    }
    const $ = data;
    let value: string;
    $(".card > .row")
      .children()
      .each((_, field) => {
        $(field)
          .children()
          .each((_, col) =>
            $(col)
              .find("dt")
              .each((_, element) => {
                if (regex.test($(element).text())) {
                  return (value = $(element)?.next()?.text()?.trim());
                }
              })
          );
        if (value != null) {
          return false;
        }
      });
    return value;
  }

  getEta(data: cheerio.Root): Date {
    if (data == null) {
      return;
    }
    const $ = data;
    const eta = $(".status-info > .row .est-delivery > p").text();
    if (!(eta != null ? eta.length : undefined)) {
      return;
    }
    return moment(new Date(`${eta} 23:59:59 +00:00`)).toDate();
  }

  getService(data: cheerio.Root): string {
    return this.extractSummaryField(data, /Service/);
  }

  getWeight(data: cheerio.Root): string {
    return this.extractSummaryField(data, /Weight/);
  }

  findStatusFromMap(statusText: string): STATUS_TYPES {
    let status: STATUS_TYPES = null;
    if (statusText && statusText.length > 0) {
      for (const [key, value] of this.STATUS_MAP) {
        if (statusText?.toLowerCase().includes(key?.toLowerCase())) {
          status = value;
          break;
        }
      }
    }
    return status;
  }

  presentStatus(details: string): STATUS_TYPES {
    return this.findStatusFromMap(details);
  }

  getActivitiesAndStatus(data: cheerio.Root): IShipmentActivities {
    let status: STATUS_TYPES = null;
    const activities = [];
    if (data == null) {
      return { activities, status };
    }
    const $ = data;
    let currentDate: string;
    for (const rowData of Array.from($(".timeline").children() || [])) {
      const row = $(rowData);
      if (row.hasClass("timeline-date")) {
        currentDate = row.text();
      }
      if (row.hasClass("timeline-event")) {
        let timestamp: Date;
        let currentTime = row.find(".timeline-time").text();
        if (currentTime != null ? currentTime.length : undefined) {
          if (currentTime != null ? currentTime.length : undefined) {
            currentTime = currentTime?.trim()?.split(" ")?.[0];
          }
          currentTime = currentTime.replace("AM", " AM").replace("PM", " PM");
          timestamp = moment(
            new Date(`${currentDate} ${currentTime}`)
          ).toDate();
        }
        let location = row.find(".timeline-location-responsive").text();
        location = location != null ? location.trim() : undefined;
        if (location != null ? location.length : undefined) {
          location = upperCaseFirst(location);
        }
        const details: string = row
          ?.find(".timeline-description")
          ?.text()
          ?.trim();
        if (details != null && timestamp != null) {
          if (status == null) {
            status = this.presentStatus(details);
          }
          activities.push({ details, location, timestamp });
        }
      }
    }
    return { activities, status };
  }

  getDestination(data: cheerio.Root): string {
    return this.extractHeaderField(data, /To:/);
  }

  requestOptions(options: IDhlgmRequestOptions): AxiosRequestConfig {
    const { trackingNumber } = options;
    return {
      method: "GET",
      url: `http://webtrack.dhlglobalmail.com/?trackingnumber=${trackingNumber}`,
    };
  }
}

export { DhlGmClient };
