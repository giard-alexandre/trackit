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

interface IA1Address {
  City: string[];
  StateProvince: string[];
  CountryCode: string[];
  PostalCode: string[];
}

interface ITrackingEventDetail {
  EventCode: string[];
  EstimatedDeliveryDate: string[];
  EventLocation: IA1Address[];
  EventDateTime: string[];
  EventCodeDesc: string[];
}

interface ITrackingEventHistory {
  TrackingEventDetail: ITrackingEventDetail[];
}

interface IA1Shipment {
  TrackingEventHistory: ITrackingEventHistory[];
  PackageDestinationLocation: IA1Address[];
  TrackingNumber: string;
}

interface IA1RequestOptions extends IShipperClientOptions {
  trackingNumber: string;
}

interface IA1TrackResult {
  AmazonTrackingResponse: {
    PackageTrackingInfo: IA1Shipment[];
    TrackingErrorInfo: {
      TrackingErrorDetail: {
        ErrorDetailCodeDesc: string[];
      }[];
    }[];
  };
}

class A1Client extends ShipperClient<IA1Shipment, IA1RequestOptions> {
  private STATUS_MAP = new Map<string, STATUS_TYPES>([
    ["101", STATUS_TYPES.EN_ROUTE],
    ["102", STATUS_TYPES.EN_ROUTE],
    ["302", STATUS_TYPES.OUT_FOR_DELIVERY],
    ["304", STATUS_TYPES.DELAYED],
    ["301", STATUS_TYPES.DELIVERED],
  ]);

  parser: Parser;

  constructor(options: IShipperClientOptions) {
    super(options);
    this.parser = new Parser();
  }

  async validateResponse(response: string): Promise<IShipperResponse<IA1Shipment>> {
    this.parser.reset();
    try {
      const trackResult = await new Promise<IA1TrackResult>((resolve, reject) => {
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
      const trackingInfo = trackResult?.AmazonTrackingResponse?.PackageTrackingInfo?.[0];
      if (trackingInfo?.TrackingNumber == null) {
        const error =
          trackResult?.AmazonTrackingResponse?.TrackingErrorInfo?.[0]?.TrackingErrorDetail?.[0]
            ?.ErrorDetailCodeDesc?.[0];
        if (error != null) {
          return { err: new Error(error) };
        }
        return { err: new Error("unknown error") };
      }
      return { shipment: trackingInfo };
    } catch (e) {
      return { err: new Error(e) };
    }
  }

  presentAddress(address: IA1Address): string {
    if (address == null) {
      return;
    }
    const city = address?.City?.[0];
    const stateCode = address?.StateProvince?.[0];
    const countryCode = address?.CountryCode?.[0];
    const postalCode = address?.PostalCode?.[0];
    return this.presentLocation({
      city,
      stateCode,
      countryCode,
      postalCode,
    });
  }

  getStatus(shipment: IA1Shipment): STATUS_TYPES {
    const lastActivity = shipment?.TrackingEventHistory?.[0]?.TrackingEventDetail?.[0];
    const statusCode = lastActivity?.EventCode?.[0];
    if (statusCode == null) {
      return;
    }
    const eventPattern = /EVENT_(.*)$/;
    const code = +eventPattern.exec(statusCode)?.[1];
    if (isNaN(code)) {
      return;
    }
    if (this.STATUS_MAP.has(code.toString())) {
      return this.STATUS_MAP.get(code.toString());
    } else {
      if (code < 300) {
        return STATUS_TYPES.EN_ROUTE;
      } else {
        return STATUS_TYPES.UNKNOWN;
      }
    }
  }

  getActivitiesAndStatus(shipment: IA1Shipment): IActivitiesAndStatus {
    const activities: Array<IActivity> = [];
    const status = this.getStatus(shipment);
    let rawActivities: ITrackingEventDetail[] = shipment?.TrackingEventHistory?.[0]?.TrackingEventDetail;
    rawActivities = rawActivities ?? [];
    for (const rawActivity of rawActivities) {
      let datetime: string, timestamp: Date;
      const location = this.presentAddress(rawActivity?.EventLocation?.[0]);
      const rawTimestamp = rawActivity?.EventDateTime?.[0];
      if (rawTimestamp != null) {
        const eventTime = moment(rawTimestamp);
        timestamp = eventTime.toDate();
        datetime = rawTimestamp.slice(0, 19);
      }
      const details = rawActivity?.EventCodeDesc?.[0];

      if (details != null && timestamp != null) {
        const activity = { timestamp, datetime, location, details };
        activities.push(activity);
      }
    }
    return { activities, status };
  }

  getEta(shipment: IA1Shipment): Date {
    const activities = shipment?.TrackingEventHistory?.[0]?.TrackingEventDetail || [];
    const firstActivity = activities[activities.length - 1];
    if (firstActivity?.EstimatedDeliveryDate?.[0] == null) {
      return;
    }
    return moment(`${firstActivity?.EstimatedDeliveryDate?.[0]}T00:00:00Z`).toDate();
  }

  getService(_: IA1Shipment): null {
    return null;
  }

  getWeight(_: IA1Shipment): null {
    return null;
  }

  getDestination(shipment: IA1Shipment): string {
    return this.presentAddress(shipment?.PackageDestinationLocation?.[0]);
  }

  public requestOptions(options: IA1RequestOptions): AxiosRequestConfig {
    const { trackingNumber } = options;
    return {
      url: `http://www.aoneonline.com/pages/customers/trackingrequest.php?tracking_number=${trackingNumber}`,
      method: "GET",
    };
  }
}

export { A1Client };
