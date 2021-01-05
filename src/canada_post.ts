import { AxiosRequestConfig } from "axios";
import moment from "moment-timezone";
import { Parser } from "xml2js";
import {
  IActivitiesAndStatus,
  IActivity,
  IShipperClientOptions,
  IShipperResponse,
  ShipperClient,
  STATUS_TYPES,
} from "./shipper";

interface ICanadaPostClientOptions extends IShipperClientOptions {
  username: string;
  password: string;
}

interface ICanadaPostRequestOptions extends IShipperClientOptions {
  trackingNumber: string;
}

interface ICanadaPostEvent {
  "event-site": string[];
  "event-province": string[];
  "event-date": string[];
  "event-time": string[];
  "event-description": string[];
}

interface ICanadaPostShipment {
  "significant-events": {
    occurrence: ICanadaPostEvent[];
  }[];
  "changed-expected-date": string[];
  "expected-delivery-date": string[];
  "service-name": string[];
  "destination-postal-id": string[];
}

interface ICanadaPostResponse {
  "tracking-detail": ICanadaPostShipment;
}

class CanadaPostClient extends ShipperClient<ICanadaPostShipment, ICanadaPostRequestOptions> {
  private STATUS_MAP = new Map<string, STATUS_TYPES>([
    ["in transit", STATUS_TYPES.EN_ROUTE],
    ["processed", STATUS_TYPES.EN_ROUTE],
    ["information submitted", STATUS_TYPES.SHIPPING],
    ["Shipment picked up", STATUS_TYPES.SHIPPING],
    ["Shipment received", STATUS_TYPES.EN_ROUTE],
    ["delivered", STATUS_TYPES.DELIVERED],
    ["out for delivery", STATUS_TYPES.OUT_FOR_DELIVERY],
    ["item released", STATUS_TYPES.EN_ROUTE],
    ["arrived", STATUS_TYPES.EN_ROUTE],
    ["departed", STATUS_TYPES.EN_ROUTE],
    ["is en route", STATUS_TYPES.EN_ROUTE],
    ["item mailed", STATUS_TYPES.SHIPPING],
    ["available for pickup", STATUS_TYPES.DELAYED],
    ["Attempted delivery", STATUS_TYPES.DELAYED],
  ]);

  get username(): string {
    return this.options.username;
  }

  get password(): string {
    return this.options.password;
  }

  options: ICanadaPostClientOptions;
  parser: Parser;

  constructor(options: ICanadaPostClientOptions) {
    super(options);
    this.parser = new Parser();
  }

  async validateResponse(response: string): Promise<IShipperResponse<ICanadaPostShipment>> {
    this.parser.reset();
    try {
      const trackResult = await new Promise<ICanadaPostResponse>((resolve, reject) => {
        this.parser.parseString(response, (xmlErr, trackResult) => {
          if (xmlErr) {
            reject(xmlErr);
          } else {
            resolve(trackResult);
          }
        });
      });

      if (trackResult == null) {
        return { err: new Error("TrackResult is empty") };
      }
      const details = trackResult["tracking-detail"];
      if (details == null) {
        return { err: new Error("response not recognized") };
      }
      return { shipment: details };
    } catch (e) {
      return { err: new Error(e) };
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

  getStatus(lastEvent: IActivity): STATUS_TYPES {
    return this.findStatusFromMap(lastEvent != null ? lastEvent.details : undefined);
  }

  getActivitiesAndStatus(shipment: ICanadaPostShipment): IActivitiesAndStatus {
    const activities: IActivity[] = [];
    const events = shipment?.["significant-events"]?.[0]?.occurrence;
    for (const event of events || []) {
      const city = event["event-site"] != null ? event["event-site"][0] : undefined;
      const stateCode = event["event-province"] != null ? event["event-province"][0] : undefined;
      const location = this.presentLocation({
        city,
        stateCode,
        countryCode: null,
        postalCode: null,
      });
      const timestampString = `${event["event-date"] != null ? event["event-date"][0] : undefined}T${
        event["event-time"] != null ? event["event-time"][0] : undefined
      }Z`;
      const timestamp = moment(timestampString).toDate();
      const details = event["event-description"] != null ? event["event-description"][0] : undefined;
      if (details != null && timestamp != null) {
        const activity: IActivity = {
          timestamp,
          location,
          details: details,
        };
        activities.push(activity);
      }
    }
    return {
      activities,
      status: this.getStatus(activities != null ? activities[0] : undefined),
    };
  }

  getEta(shipment: ICanadaPostShipment): Date {
    const ts =
      (shipment["changed-expected-date"] != null ? shipment["changed-expected-date"][0] : undefined) ||
      (shipment["expected-delivery-date"] != null ? shipment["expected-delivery-date"][0] : undefined);
    if (!(ts != null ? ts.length : undefined)) {
      return;
    }
    if (ts != null ? ts.length : undefined) {
      return moment(`${ts}T00:00:00Z`).toDate();
    }
  }

  getService(shipment: ICanadaPostShipment): string {
    return shipment["service-name"] != null ? shipment["service-name"][0] : undefined;
  }

  getWeight(): undefined {
    return undefined;
  }

  getDestination(shipment: ICanadaPostShipment): string {
    return shipment["destination-postal-id"] != null ? shipment["destination-postal-id"][0] : undefined;
  }

  public requestOptions(options: ICanadaPostRequestOptions): AxiosRequestConfig {
    const { trackingNumber } = options;
    return {
      url: `https://soa-gw.canadapost.ca/vis/track/pin/${trackingNumber}/detail.xml`,
      method: "GET",
      auth: { username: this.username, password: this.password },
    };
  }
}

export { CanadaPostClient };
