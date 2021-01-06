import { AxiosRequestConfig } from "axios";
import { lowerCase, titleCase, upperCaseFirst } from "change-case";
import { load } from "cheerio";
import moment from "moment-timezone";
import {
  IActivitiesAndStatus,
  ICarrierResponse,
  ITrackitClientOptions,
  STATUS_TYPES,
  TrackitClient,
} from "./trackitClient";

const LOCATION_STATES: Map<string, string> = new Map([
  ["Ontario", "CA"],
  ["Bakersfield", "CA"],
  ["Denver", "CO"],
  ["Vancouver", "WA"],
  ["Orange", "CA"],
  ["Hayward", "CA"],
  ["Phoenix", "AZ"],
  ["Sacramento", "CA"],
  ["Vegas", "NV"],
  ["Los Angeles", "CA"],
  ["Santa Maria", "CA"],
  ["Eugene", "OR"],
  ["Commerce", "CA"],
  ["Kettleman City", "CA"],
  ["Menlo Park", "CA"],
  ["San Jose", "CA"],
  ["Burbank", "CA"],
  ["Ventura", "CA"],
  ["Petaluma", "CA"],
  ["Corporate", "CA"],
  ["Medford", "OR"],
  ["Monterey", "CA"],
  ["San Francisco", "CA"],
  ["Stockton", "CA"],
  ["San Diego", "CA"],
  ["Fresno", "CA"],
  ["Salt Lake", "UT"],
  ["SaltLake", "UT"],
  ["Concord", "CA"],
  ["Tucson", "AZ"],
  ["Reno", "NV"],
  ["Seattle", "WA"],
]);

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface IOnTracShipment {}

export interface IOnTracRequestOptions extends ITrackitClientOptions {
  trackingNumber: string;
}

class OnTracClient extends TrackitClient<IOnTracShipment, IOnTracRequestOptions> {
  private STATUS_MAP = new Map<string, STATUS_TYPES>([
    ["DELIVERED", STATUS_TYPES.DELIVERED],
    ["OUT FOR DELIVERY", STATUS_TYPES.OUT_FOR_DELIVERY],
    ["PACKAGE RECEIVED AT FACILITY", STATUS_TYPES.EN_ROUTE],
    ["IN TRANSIT", STATUS_TYPES.EN_ROUTE],
    ["DATA ENTRY", STATUS_TYPES.SHIPPING],
  ]);

  async validateResponse(response: string): Promise<ICarrierResponse<IOnTracShipment>> {
    const data = load(response, { normalizeWhitespace: true });
    return Promise.resolve({ shipment: data });
  }

  extractSummaryField(shipment: cheerio.Root, regex: RegExp): string {
    let value: string = null;
    const $ = shipment;
    if ($ == null) {
      return;
    }
    $('td[bgcolor="#ffd204"]').each((_, element) => {
      if (!regex.test($(element).text())) {
        return;
      }
      value = $(element)?.next()?.text()?.trim();
      return false;
    });

    return value;
  }

  getEta(shipment: cheerio.Root): Date {
    let eta = this.extractSummaryField(shipment, /Service Commitment/);
    if (eta == null) {
      return;
    }
    const regexMatch = /(.*) by (.*)/.exec(eta);
    if ((regexMatch != null ? regexMatch.length : undefined) > 1) {
      eta = `${regexMatch[1]} 23:59:59 +00:00`;
    }
    return new Date(eta);
  }

  getService(shipment: cheerio.Root): string {
    const service = this.extractSummaryField(shipment, /Service Code/);
    if (service == null) {
      return;
    }
    return titleCase(service);
  }

  getWeight(shipment: cheerio.Root): string {
    return this.extractSummaryField(shipment, /Weight/);
  }

  presentAddress(location: string): string {
    const addressState = LOCATION_STATES.get(location);
    if (addressState != null) {
      return `${location}, ${addressState}`;
    } else {
      return location;
    }
  }

  presentStatus(status: string): STATUS_TYPES {
    status = status?.replace("DETAILS", "")?.trim();
    if (!(status != null ? status.length : undefined)) {
      return STATUS_TYPES.UNKNOWN;
    }
    const statusType = this.STATUS_MAP.get(status);
    if (statusType != null) {
      return statusType;
    } else {
      return STATUS_TYPES.UNKNOWN;
    }
  }

  presentTimestamp(ts: string): Date {
    if (ts == null) {
      return;
    }
    ts = ts.replace(/AM$/, " AM").replace(/PM$/, " PM");
    return moment(new Date(`${ts} +0000`)).toDate();
  }

  getActivitiesAndStatus(shipment: cheerio.Root): IActivitiesAndStatus {
    const activities = [];
    const status = this.presentStatus(this.extractSummaryField(shipment, /Delivery Status/));
    const $ = shipment;
    if ($ == null) {
      return { activities, status };
    }
    $("#trkdetail table table")
      .children("tr")
      .each((rowIndex, row) => {
        if (!(rowIndex > 0)) {
          return;
        }
        const fields: string[] = [];
        $(row)
          .find("td")
          .each((_, col) => fields.push($(col).text().trim()));
        if (fields.length) {
          let details: string, location: string;
          if (fields[0].length) {
            details = upperCaseFirst(lowerCase(fields[0]));
          }
          const timestamp = this.presentTimestamp(fields[1]);
          if (fields[2].length) {
            location = this.presentAddress(fields[2]);
          }
          if (details != null && timestamp != null) {
            return activities.unshift({ details, timestamp, location });
          }
        }
      });
    return { activities, status };
  }

  getDestination(shipment: cheerio.Root): string {
    const destination = this.extractSummaryField(shipment, /Deliver To/);
    return this.presentLocationString(destination);
  }

  requestOptions({ trackingNumber }: IOnTracRequestOptions): AxiosRequestConfig {
    return {
      method: "GET",
      url: `https://www.ontrac.com/trackingdetail.asp?tracking=${trackingNumber}&run=0`,
    };
  }
}

export { OnTracClient };
