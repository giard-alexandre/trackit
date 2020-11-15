import { AxiosRequestConfig } from "axios";
import moment from "moment-timezone";
/* eslint-disable
	@typescript-eslint/restrict-template-expressions,
	@typescript-eslint/no-unsafe-member-access,
	@typescript-eslint/no-unsafe-assignment,
	@typescript-eslint/no-unsafe-return,
	@typescript-eslint/no-unsafe-call,
	node/no-callback-literal
*/
// TODO: Fix any style issues and re-enable lint.
import { Parser } from "xml2js";
import {
  IShipmentActivities,
  IShipperClientOptions,
  IShipperResponse,
  ShipperClient,
  STATUS_TYPES,
} from "./shipper";

interface ICanadaPostClientOptions extends IShipperClientOptions {
  username: string;
  password: string;
}

interface ICanadaPostShipment {
  $: cheerio.Root;
  response: any;
}

interface ICanadaPostRequestOptions extends IShipperClientOptions {
  trackingNumber: string;
}

class CanadaPostClient extends ShipperClient<
  ICanadaPostShipment,
  ICanadaPostRequestOptions
> {
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
    // Todo: Check if this works
    // this.options = options;
    this.parser = new Parser();
  }

  async validateResponse(
    response: any
  ): Promise<IShipperResponse<ICanadaPostShipment>> {
    this.parser.reset();
    try {
      const trackResult = await new Promise<any>((resolve, reject) => {
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
      return { err: e };
    }
  }

  findStatusFromMap(statusText): STATUS_TYPES {
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

  getStatus(lastEvent): STATUS_TYPES {
    return this.findStatusFromMap(
      lastEvent != null ? lastEvent.details : undefined
    );
  }

  getActivitiesAndStatus(shipment: ICanadaPostShipment): IShipmentActivities {
    const activities = [];
    const events = shipment?.["significant-events"]?.[0]?.occurrence;
    for (const event of events || []) {
      const city =
        event["event-site"] != null ? event["event-site"][0] : undefined;
      const stateCode =
        event["event-province"] != null
          ? event["event-province"][0]
          : undefined;
      const location = this.presentLocation({
        city,
        stateCode,
        countryCode: null,
        postalCode: null,
      });
      const timestampString = `${
        event["event-date"] != null ? event["event-date"][0] : undefined
      }T${event["event-time"] != null ? event["event-time"][0] : undefined}Z`;
      const timestamp = moment(timestampString).toDate();
      const details =
        event["event-description"] != null
          ? event["event-description"][0]
          : undefined;
      if (details != null && timestamp != null) {
        const activity = { timestamp, location, details };
        activities.push(activity);
      }
    }
    return {
      activities,
      status: this.getStatus(activities != null ? activities[0] : undefined),
    };
  }

  getEta(shipment) {
    const ts =
      (shipment["changed-expected-date"] != null
        ? shipment["changed-expected-date"][0]
        : undefined) ||
      (shipment["expected-delivery-date"] != null
        ? shipment["expected-delivery-date"][0]
        : undefined);
    if (!(ts != null ? ts.length : undefined)) {
      return;
    }
    if (ts != null ? ts.length : undefined) {
      return moment(`${ts}T00:00:00Z`).toDate();
    }
  }

  getService(shipment) {
    return shipment["service-name"] != null
      ? shipment["service-name"][0]
      : undefined;
  }

  getWeight() {
    return undefined;
  }

  getDestination(shipment) {
    return shipment["destination-postal-id"] != null
      ? shipment["destination-postal-id"][0]
      : undefined;
  }

  public requestOptions(
    options: ICanadaPostRequestOptions
  ): AxiosRequestConfig {
    const { trackingNumber } = options;
    return {
      url: `https://soa-gw.canadapost.ca/vis/track/pin/${trackingNumber}/detail.xml`,
      method: "GET",
      auth: { username: this.username, password: this.password },
    };
  }
}

export { CanadaPostClient };
