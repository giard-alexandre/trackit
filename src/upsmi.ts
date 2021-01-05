import { AxiosRequestConfig } from "axios";
import cheerio, { load } from "cheerio";
import moment from "moment-timezone";
import {
  IActivitiesAndStatus,
  IActivity,
  IShipperClientOptions,
  IShipperResponse,
  ShipperClient,
  STATUS_TYPES,
} from "./shipper";

interface IUpsmiShipment {
  $: cheerio.Root;
  summary: cheerio.Element;
  uspsDetails: cheerio.Cheerio;
  miDetails: cheerio.Cheerio;
}

export interface IUpsmiRequestOptions extends IShipperClientOptions {
  trackingNumber: string;
}

class UpsMiClient extends ShipperClient<IUpsmiShipment, IUpsmiRequestOptions> {
  private STATUS_MAP = new Map<string, STATUS_TYPES>([
    ["post office entry", STATUS_TYPES.EN_ROUTE],
    ["out for post office delivery", STATUS_TYPES.OUT_FOR_DELIVERY],
    ["shipment information received", STATUS_TYPES.SHIPPING], // This has to stay first so as to overrice the `['received', STATUS_TYPES.EN_ROUTE]` status
    ["delivered", STATUS_TYPES.DELIVERED],
    ["transferred", STATUS_TYPES.EN_ROUTE],
    ["received", STATUS_TYPES.EN_ROUTE],
    ["processed", STATUS_TYPES.EN_ROUTE],
    ["sorted", STATUS_TYPES.EN_ROUTE],
  ]);

  validateResponse(response: string): Promise<IShipperResponse<IUpsmiShipment>> {
    const $ = load(response, { normalizeWhitespace: true });
    const summary = $("#Table6")?.find("table")?.[0];
    const uspsDetails = $("#ctl00_mainContent_ctl00_pnlUSPS > table");
    const miDetails = $("#ctl00_mainContent_ctl00_pnlMI > table");
    return Promise.resolve({
      shipment: {
        $,
        summary,
        uspsDetails,
        miDetails,
      },
    });
  }

  extractSummaryField(data: IUpsmiShipment, name: string): string | undefined {
    let value: string = null;
    const { $, summary } = data;
    if (summary == null) {
      return;
    }
    $(summary)
      .children("tr")
      .each((rindex, row) => {
        $(row)
          .children("td")
          .each((cindex, col) => {
            const regex = new RegExp(name);
            if (regex.test($(col).text())) {
              value = $(col)?.next()?.text()?.trim();
            }
            if (value != null) {
              return false;
            }
          });
        if (value != null) {
          return false;
        }
      });
    return value;
  }

  getEta(data: IUpsmiShipment): Date {
    let formattedEta: moment.Moment;
    const eta = this.extractSummaryField(data, "Projected Delivery Date");
    if (eta != null) {
      formattedEta = moment(new Date(eta));
    }
    if (formattedEta != null ? formattedEta.isValid() : undefined) {
      return formattedEta.toDate();
    } else {
      return undefined;
    }
  }

  getService(): undefined {
    return undefined;
  }

  getWeight(data: IUpsmiShipment): string {
    const weight = this.extractSummaryField(data, "Weight");
    if (weight != null ? weight.length : undefined) {
      return `${weight} lbs.`;
    }
  }

  findStatusFromMap(statusText: string): STATUS_TYPES {
    let status = STATUS_TYPES.UNKNOWN;
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

  extractTimestamp(tsString: string): Date {
    // Check id there is a colon present, this should tell us if the time is included in the TS
    if (/:/.exec(tsString)) {
      return new Date(`${tsString} +0000`);
    } else {
      return new Date(`${tsString} 00:00 +0000`);
    }
  }

  extractActivities($: cheerio.Root, table: cheerio.Cheerio): IActivity[] | undefined {
    const activities: IActivity[] = [];
    $(table)
      .children("tr")
      .each((rindex, row) => {
        let location: string, timestamp: Date;
        if (rindex === 0) {
          return;
        }
        let details: string = (location = timestamp = null);
        $(row)
          .children("td")
          .each((cindex, col) => {
            const value = $(col)?.text()?.trim();
            switch (cindex) {
              case 0:
                return (timestamp = this.extractTimestamp(value));
              case 1:
                return (details = value);
              case 2:
                return (location = this.presentLocationString(value));
            }
          });
        if (details != null && timestamp != null) {
          return activities.push({ details, location, timestamp });
        }
      });
    return activities;
  }

  getActivitiesAndStatus(data: IUpsmiShipment): IActivitiesAndStatus {
    let status: STATUS_TYPES = null;
    const { $, uspsDetails, miDetails } = data;
    const set1 = this.extractActivities($, uspsDetails);
    const set2 = this.extractActivities($, miDetails);
    const activities = set1.concat(set2);
    for (const activity of Array.from(activities || [])) {
      if (status != null) {
        break;
      }
      status = this.presentStatus(activity != null ? activity.details : undefined);
    }

    return { activities, status };
  }

  getDestination(data: IUpsmiShipment): string {
    const destination = this.extractSummaryField(data, "Zip Code");
    if (destination != null ? destination.length : undefined) {
      return destination;
    }
  }

  requestOptions({ trackingNumber }: IUpsmiRequestOptions): AxiosRequestConfig {
    return {
      method: "GET",
      url: `http://www.ups-mi.net/packageID/PackageID.aspx?PID=${trackingNumber}`,
    };
  }
}

export { UpsMiClient };
