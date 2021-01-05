import { AxiosRequestConfig } from "axios";
import moment from "moment-timezone";
import { Builder, Parser } from "xml2js";
import { IActivitiesAndStatus, IShipperClientOptions, IShipperResponse, ShipperClient, STATUS_TYPES } from "./shipper";

interface IFedexAddress {
  City: string[];
  StateOrProvinceCode: string[];
  CountryCode: string[];
  PostalCode: string[];
}

interface IFedexClientOptions extends IShipperClientOptions {
  account: string;
  password: string;
  key: string;
  meter: string;
}

interface IFedexShipment {
  StatusCode: string[];
  DestinationAddress: IFedexAddress[];
  EstimatedDeliveryTimestamp: string[];
  ServiceInfo: string[];
  PackageWeight: {
    Units: string[];
    Value: number[];
  }[];
  Events: {
    Address: IFedexAddress[];
    Timestamp: string[];
    EventDescription: string[];
  }[];
}

interface IFedexNotification {
  Code: string[];
}

interface IFedexTrackResult {
  TrackReply: {
    Notifications: IFedexNotification[];
    TrackDetails: IFedexShipment[];
  };
}

interface IFedexRequestOptions extends IShipperClientOptions {
  trackingNumber: string;
  reference: string;
}

export class FedexClient extends ShipperClient<IFedexShipment, IFedexRequestOptions> {
  private STATUS_MAP = new Map<string, STATUS_TYPES>([
    ["AA", STATUS_TYPES.EN_ROUTE],
    ["AD", STATUS_TYPES.EN_ROUTE],
    ["AF", STATUS_TYPES.EN_ROUTE],
    ["AP", STATUS_TYPES.SHIPPING],
    ["EO", STATUS_TYPES.EN_ROUTE],
    ["EP", STATUS_TYPES.SHIPPING],
    ["FD", STATUS_TYPES.EN_ROUTE],
    ["HL", STATUS_TYPES.DELIVERED],
    ["IT", STATUS_TYPES.EN_ROUTE],
    ["LO", STATUS_TYPES.EN_ROUTE],
    ["OC", STATUS_TYPES.SHIPPING],
    ["DL", STATUS_TYPES.DELIVERED],
    ["DP", STATUS_TYPES.EN_ROUTE],
    ["DS", STATUS_TYPES.EN_ROUTE],
    ["ED", STATUS_TYPES.OUT_FOR_DELIVERY],
    ["OD", STATUS_TYPES.OUT_FOR_DELIVERY],
    ["PF", STATUS_TYPES.EN_ROUTE],
    ["PL", STATUS_TYPES.EN_ROUTE],
    ["PU", STATUS_TYPES.EN_ROUTE],
    ["SF", STATUS_TYPES.EN_ROUTE],
    ["AR", STATUS_TYPES.EN_ROUTE],
    ["CD", STATUS_TYPES.EN_ROUTE],
    ["CC", STATUS_TYPES.EN_ROUTE],
    ["DE", STATUS_TYPES.DELAYED],
    ["CA", STATUS_TYPES.DELAYED],
    ["CH", STATUS_TYPES.DELAYED],
    ["DY", STATUS_TYPES.DELAYED],
    ["SE", STATUS_TYPES.DELAYED],
    ["AX", STATUS_TYPES.EN_ROUTE],
    ["OF", STATUS_TYPES.EN_ROUTE],
    ["RR", STATUS_TYPES.EN_ROUTE],
    ["OX", STATUS_TYPES.EN_ROUTE],
    ["CP", STATUS_TYPES.EN_ROUTE],
  ]);

  get key(): string {
    return this.options.key;
  }

  get password(): string {
    return this.options.password;
  }

  get account(): string {
    return this.options.account;
  }

  get meter(): string {
    return this.options.meter;
  }

  options: IFedexClientOptions;
  parser: Parser;
  builder: Builder;

  constructor(options: IFedexClientOptions) {
    super(options);
    // Todo: Check if this works
    // this.options = options;
    this.parser = new Parser();
    this.builder = new Builder({ renderOpts: { pretty: false } });
  }

  generateRequest(trk: string, reference: string): string {
    if (reference == null) {
      reference = "n/a";
    }
    return this.builder.buildObject({
      "ns:TrackRequest": {
        $: {
          "xmlns:ns": "http://fedex.com/ws/track/v5",
          "xmlns:xsi": "http://www.w3.org/2001/XMLSchema-instance",
          "xsi:schemaLocation": "http://fedex.com/ws/track/v4 TrackService_v4.xsd",
        },
        "ns:WebAuthenticationDetail": {
          "ns:UserCredential": {
            "ns:Key": this.key,
            "ns:Password": this.password,
          },
        },
        "ns:ClientDetail": {
          "ns:AccountNumber": this.account,
          "ns:MeterNumber": this.meter,
        },
        "ns:TransactionDetail": {
          "ns:CustomerTransactionId": reference,
        },
        "ns:Version": {
          "ns:ServiceId": "trck",
          "ns:Major": 5,
          "ns:Intermediate": 0,
          "ns:Minor": 0,
        },
        "ns:PackageIdentifier": {
          "ns:Value": trk,
          "ns:Type": "TRACKING_NUMBER_OR_DOORTAG",
        },
        "ns:IncludeDetailedScans": true,
      },
    });
  }

  async validateResponse(response: string): Promise<IShipperResponse<IFedexShipment>> {
    this.parser.reset();
    try {
      const trackResult = await new Promise<IFedexTrackResult>((resolve, reject) => {
        this.parser.parseString(
          response,
          (xmlErr: Error, trackResult: IFedexTrackResult | PromiseLike<IFedexTrackResult>) => {
            if (xmlErr) {
              reject(xmlErr);
            } else {
              resolve(trackResult);
            }
          }
        );
      });

      if (trackResult == null) {
        return { err: new Error("TrackResult is empty") };
      }
      const notifications = trackResult.TrackReply != null ? trackResult.TrackReply.Notifications : undefined;
      const success = notifications.find((notif) => notif?.Code?.[0] === "0");
      if (!success) {
        return { err: new Error(notifications.toString() || "invalid reply") };
      }
      return { shipment: trackResult?.TrackReply?.TrackDetails?.[0] };
    } catch (e) {
      return { err: new Error(e) };
    }
  }

  presentAddress(address: IFedexAddress): string {
    if (address == null) {
      return;
    }
    let city = address.City != null ? address.City[0] : undefined;
    if (city != null) {
      city = city.replace("FEDEX SMARTPOST ", "");
    }
    const stateCode = address.StateOrProvinceCode != null ? address.StateOrProvinceCode[0] : undefined;
    const countryCode = address.CountryCode != null ? address.CountryCode[0] : undefined;
    const postalCode = address.PostalCode != null ? address.PostalCode[0] : undefined;
    return this.presentLocation({
      city,
      stateCode,
      countryCode,
      postalCode,
    });
  }

  getStatus(shipment: IFedexShipment): STATUS_TYPES {
    const statusCode = shipment?.StatusCode?.[0];
    if (statusCode == null) {
      return;
    }
    return this.STATUS_MAP.has(statusCode) ? this.STATUS_MAP.get(statusCode) : STATUS_TYPES.UNKNOWN;
  }

  getActivitiesAndStatus(shipment: IFedexShipment): IActivitiesAndStatus {
    const activities = [];
    for (const rawActivity of shipment?.Events || []) {
      let datetime: string, timestamp: Date;
      const location = this.presentAddress(rawActivity.Address != null ? rawActivity.Address[0] : undefined);
      const rawTimestamp = rawActivity.Timestamp != null ? rawActivity.Timestamp[0] : undefined;
      if (rawTimestamp != null) {
        const eventTime = moment(rawTimestamp);
        timestamp = eventTime.toDate();
        datetime = rawTimestamp.slice(0, 19);
      }
      const details = rawActivity.EventDescription != null ? rawActivity.EventDescription[0] : undefined;
      if (details != null && timestamp != null) {
        const activity = { timestamp, datetime, location, details };
        activities.push(activity);
      }
    }
    return { activities, status: this.getStatus(shipment) };
  }

  getEta(shipment: IFedexShipment): Date {
    const ts = shipment?.EstimatedDeliveryTimestamp?.[0];
    if (ts == null) {
      return;
    }
    return moment(`${ts.slice(0, 19)}Z`).toDate();
  }

  getService(shipment: IFedexShipment): string {
    return shipment?.ServiceInfo ? shipment?.ServiceInfo[0] : undefined;
  }

  getWeight(shipment: IFedexShipment): string {
    const weightData = shipment?.PackageWeight?.[0];
    if (weightData == null) {
      return;
    }
    const units = weightData?.Units?.[0];
    const value = weightData?.Value?.[0];
    if (units != null && value != null) {
      return `${value} ${units}`;
    }
  }

  getDestination(shipment: IFedexShipment): string {
    return this.presentAddress(shipment.DestinationAddress != null ? shipment.DestinationAddress[0] : undefined);
  }

  requestOptions({ trackingNumber, reference }: IFedexRequestOptions): AxiosRequestConfig {
    return {
      method: "POST",
      url: "https://ws.fedex.com/xml",
      data: this.generateRequest(trackingNumber, reference),
    };
  }
}
