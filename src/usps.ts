/* eslint-disable
	@typescript-eslint/restrict-template-expressions,
	@typescript-eslint/no-unsafe-member-access,
	@typescript-eslint/no-unsafe-assignment,
	@typescript-eslint/no-unsafe-return,
	@typescript-eslint/no-unsafe-call,
	node/no-callback-literal
*/
/* eslint-disable
    constructor-super,
    no-constant-condition,
    no-eval,
    no-this-before-super,
    no-unused-vars,
    no-useless-escape,
*/
// TODO: This file was created by bulk-decaffeinate.
// Fix any style issues and re-enable lint.
/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS206: Consider reworking classes to avoid initClass
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import { AxiosRequestConfig } from "axios";
import { Builder, Parser } from "xml2js";
import {
  IShipmentActivities,
  IShipperClientOptions,
  IShipperResponse,
  ShipperClient,
  STATUS_TYPES,
} from "./shipper";

interface IUspsClientOptions extends IShipperClientOptions {
  userId: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface IUspsShipment {}

interface IUspsRequestOptions extends IShipperClientOptions {
  trackingNumber: string;
  clientIp?: string;
  test?: boolean;
}

class UspsClient extends ShipperClient<IUspsShipment, IUspsRequestOptions> {
  private STATUS_MAP = new Map<string, STATUS_TYPES>([
    ["Accept", STATUS_TYPES.EN_ROUTE],
    ["Processed", STATUS_TYPES.EN_ROUTE],
    ["Depart", STATUS_TYPES.EN_ROUTE],
    ["Picked Up", STATUS_TYPES.EN_ROUTE],
    ["Arrival", STATUS_TYPES.EN_ROUTE],
    ["Sorting Complete", STATUS_TYPES.EN_ROUTE],
    ["Customs clearance", STATUS_TYPES.EN_ROUTE],
    ["Dispatch", STATUS_TYPES.EN_ROUTE],
    ["Arrive", STATUS_TYPES.EN_ROUTE],
    ["In Transit", STATUS_TYPES.EN_ROUTE],
    ["Inbound Out of Customs", STATUS_TYPES.EN_ROUTE],
    ["Inbound Into Customs", STATUS_TYPES.EN_ROUTE],
    ["Forwarded", STATUS_TYPES.EN_ROUTE],
    ["Out for Delivery", STATUS_TYPES.OUT_FOR_DELIVERY],
    ["Delivered", STATUS_TYPES.DELIVERED],
    ["Notice Left", STATUS_TYPES.DELAYED],
    ["Refused", STATUS_TYPES.DELAYED],
    ["Item being held", STATUS_TYPES.DELAYED],
    ["Missed delivery", STATUS_TYPES.DELAYED],
    ["Addressee not available", STATUS_TYPES.DELAYED],
    ["Undeliverable as Addressed", STATUS_TYPES.DELAYED],
    ["Tendered to Military Agent", STATUS_TYPES.DELIVERED],
    ["USPS Awaiting Item", STATUS_TYPES.SHIPPING],
    ["USPS in possession of item", STATUS_TYPES.EN_ROUTE],
  ]);

  get userId(): string {
    return this.options.userId;
  }

  public options: IUspsClientOptions;
  parser: Parser;
  builder: Builder;

  constructor(options: IUspsClientOptions) {
    super(options);
    // Todo: Check if this works
    // this.options = options;
    this.parser = new Parser();
    this.builder = new Builder({ renderOpts: { pretty: false } });
  }

  generateRequest(trk, clientIp) {
    if (clientIp == null) {
      clientIp = "127.0.0.1";
    }
    return this.builder.buildObject({
      TrackFieldRequest: {
        $: { USERID: this.userId },
        Revision: "1",
        ClientIp: clientIp,
        SourceId: "shipit",
        TrackID: {
          $: { ID: trk },
        },
      },
    });
  }

  async validateResponse(
    response: any
  ): Promise<IShipperResponse<IUspsShipment>> {
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

      const trackInfo = trackResult?.TrackResponse?.TrackInfo?.[0];
      if (trackInfo == null) {
        return { err: new Error("No Tracking Info") };
      }
      return { shipment: trackInfo };
    } catch (e) {
      return { err: e };
    }
  }

  getEta(shipment) {
    const rawEta =
      (shipment.PredictedDeliveryDate != null
        ? shipment.PredictedDeliveryDate[0]
        : undefined) ||
      (shipment.ExpectedDeliveryDate != null
        ? shipment.ExpectedDeliveryDate[0]
        : undefined);
    if (rawEta != null) {
      return new Date(`${rawEta} 00:00:00Z`);
    }
  }

  getService(shipment) {
    const service = shipment.Class != null ? shipment.Class[0] : undefined;
    if (service != null) {
      return service.replace(/\<SUP\>.*\<\/SUP\>/, "");
    }
  }

  getWeight(shipment) {
    return undefined;
  }

  presentTimestamp(dateString, timeString) {
    if (dateString == null) {
      return;
    }
    timeString = (timeString != null ? timeString.length : undefined)
      ? timeString
      : "12:00 am";
    return new Date(`${dateString} ${timeString} +0000`);
  }

  findStatusFromMap(statusText) {
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

  presentStatus(details: string) {
    return this.findStatusFromMap(details);
  }

  getDestination(shipment) {
    const city =
      shipment.DestinationCity != null
        ? shipment.DestinationCity[0]
        : undefined;
    const stateCode =
      shipment.DestinationState != null
        ? shipment.DestinationState[0]
        : undefined;
    const postalCode =
      shipment.DestinationZip != null ? shipment.DestinationZip[0] : undefined;
    return this.presentLocation({
      city,
      stateCode,
      postalCode,
      countryCode: null,
    });
  }

  getStatus(shipment) {
    const statusCategory = shipment?.StatusCategory?.[0];
    switch (statusCategory) {
      case "Pre-Shipment":
        return STATUS_TYPES.SHIPPING;
      case "Delivered":
        return STATUS_TYPES.DELIVERED;
      default:
        return this.presentStatus(shipment?.Status?.[0]);
    }
  }

  presentActivity(rawActivity) {
    let countryCode, postalCode, stateCode;
    if (rawActivity == null) {
      return;
    }
    let activity = null;
    const city =
      rawActivity.EventCity != null ? rawActivity.EventCity[0] : undefined;
    if (rawActivity?.EventState?.[0]?.length) {
      stateCode = rawActivity?.EventState?.[0] || undefined;
    }
    if (rawActivity?.EventZIPCode?.[0]?.length) {
      postalCode =
        rawActivity.EventZIPCode != null
          ? rawActivity.EventZIPCode[0]
          : undefined;
    }
    if (rawActivity?.EventCountry?.[0]?.length) {
      countryCode =
        rawActivity.EventCountry != null
          ? rawActivity.EventCountry[0]
          : undefined;
    }
    const location = this.presentLocation({
      city,
      stateCode,
      countryCode,
      postalCode,
    });
    const timestamp = this.presentTimestamp(
      rawActivity?.EventDate?.[0],
      rawActivity?.EventTime?.[0]
    );
    const details = rawActivity?.Event?.[0];
    if (details != null && timestamp != null) {
      activity = { timestamp, location, details };
    }
    return activity;
  }

  getActivitiesAndStatus(shipment): IShipmentActivities {
    const activities = [];
    const trackSummary = this.presentActivity(shipment?.TrackSummary?.[0]);
    if (trackSummary != null) {
      activities.push(trackSummary);
    }
    for (const rawActivity of Array.from(
      (shipment != null ? shipment.TrackDetail : undefined) || []
    )) {
      const activity = this.presentActivity(rawActivity);
      if (activity != null) {
        activities.push(activity);
      }
    }
    return { activities, status: this.getStatus(shipment) };
  }

  requestOptions({
    trackingNumber,
    clientIp,
    test,
  }: IUspsRequestOptions): AxiosRequestConfig {
    const endpoint = test ? "ShippingAPITest.dll" : "ShippingAPI.dll";
    const xml = this.generateRequest(trackingNumber, clientIp);
    return {
      method: "GET",
      url: `http://production.shippingapis.com/${endpoint}?API=TrackV2&XML=${xml}`,
    };
  }
}

export { UspsClient };
