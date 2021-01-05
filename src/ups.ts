import { AxiosRequestConfig } from "axios";
import { lowerCase, titleCase, upperCaseFirst } from "change-case";
import moment from "moment-timezone";
import { Builder, Parser } from "xml2js";
import { IActivitiesAndStatus, IShipperClientOptions, IShipperResponse, ShipperClient, STATUS_TYPES } from "./shipper";

interface IUpsClientOptions extends IShipperClientOptions {
  userId: string;
  password: string;
  licenseNumber: string;
}

export interface IUpsLocation {
  City: string[];
  StateProvinceCode: string[];
  CountryCode: string[];
  PostalCode: string[];
}

export interface IUpsStatus {
  StatusType?: {
    Code?: string[];
    Description?: string[];
  }[];
  StatusCode?: {
    Code?: string[];
  }[];
}

interface IUpsShipmentActivity {
  ActivityLocation: { Address: IUpsLocation[] }[];
  Date: string[];
  Time: string[];
  Status: IUpsStatus[];
}

export interface IUpsShipment {
  Package?: {
    RescheduledDeliveryDate?: string[];
    PackageWeight?: {
      UnitOfMeasurement?: {
        Code?: string[];
      }[];
      Weight?: string[];
    }[];
    Activity?: IUpsShipmentActivity[];
  }[];
  ShipTo?: {
    Address?: IUpsLocation[];
  }[];
  ScheduledDeliveryDate?: string[];
  Service?: {
    Description: string[];
  }[];
}

export interface IUpsActivity {
  statusType?: string;
  statusCode?: string;
  timestamp: Date;
  location: string;
  details: string;
}

export interface IUpsTrackResult {
  TrackResponse: {
    Response: {
      ResponseStatusDescription: string;
      Error: {
        ErrorDescription: string[];
      }[];
    }[];
    Shipment: IUpsShipment[];
  };
}

interface IUpsRequestOptions extends IShipperClientOptions {
  trackingNumber: string;
  reference?: string;
  test?: boolean;
}

class UpsClient extends ShipperClient<IUpsShipment, IUpsRequestOptions> {
  private STATUS_MAP = new Map<string, STATUS_TYPES>([
    ["D", STATUS_TYPES.DELIVERED],
    ["P", STATUS_TYPES.EN_ROUTE],
    ["M", STATUS_TYPES.SHIPPING],
  ]);

  get licenseNumber(): string {
    return this.options.licenseNumber;
  }

  get userId(): string {
    return this.options.userId;
  }

  get password(): string {
    return this.options.password;
  }

  public options: IUpsClientOptions;
  parser: Parser;
  builder: Builder;

  /**
   * Instantiates a Ups Client
   * @param options licenseNumber, userId, password are required
   */
  constructor(options: IUpsClientOptions) {
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
    const accessRequest = this.builder.buildObject({
      AccessRequest: {
        AccessLicenseNumber: this.licenseNumber,
        UserId: this.userId,
        Password: this.password,
      },
    });

    const trackRequest = this.builder.buildObject({
      TrackRequest: {
        Request: {
          TransactionReference: { CustomerContext: reference },
          RequestAction: "track",
          RequestOption: 3,
        },
        TrackingNumber: trk,
      },
    });

    return `${accessRequest}${trackRequest}`;
  }

  async validateResponse(response: string): Promise<IShipperResponse<IUpsShipment>> {
    this.parser.reset();
    try {
      const trackResult = await new Promise<IUpsTrackResult>((resolve, reject) => {
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
      let errorMsg: string, shipment: IUpsShipment;
      const responseStatus = trackResult?.TrackResponse?.Response?.[0]?.ResponseStatusDescription?.[0];
      if (responseStatus !== "Success") {
        const error = trackResult?.TrackResponse?.Response?.[0]?.Error?.[0]?.ErrorDescription?.[0];
        errorMsg = error || "unknown error";
        shipment = null;
      } else {
        shipment = trackResult.TrackResponse.Shipment != null ? trackResult.TrackResponse.Shipment[0] : undefined;
        if (shipment == null) {
          errorMsg = "missing shipment data";
        }
      }
      if (errorMsg != null) {
        return { err: new Error(errorMsg) };
      }
      return { shipment: shipment };
    } catch (e) {
      return { err: new Error(e) };
    }
  }

  getEta(shipment: IUpsShipment): Date {
    return this.presentTimestamp(
      shipment?.Package?.[0]?.RescheduledDeliveryDate?.[0] || shipment?.ScheduledDeliveryDate?.[0] || undefined
    );
  }

  getService(shipment: IUpsShipment): string {
    const service = shipment?.Service?.[0]?.Description?.[0];
    if (service) {
      return titleCase(service);
    }
  }

  getWeight(shipment: IUpsShipment): string {
    const weightData = shipment?.Package?.[0]?.PackageWeight?.[0];
    let weight: string = null;
    if (weightData) {
      const units = weightData?.UnitOfMeasurement?.[0]?.Code?.[0];
      weight = weightData.Weight != null ? weightData?.Weight?.[0] : undefined;
      if (weight != null && units) {
        weight = `${weight} ${units}`;
      }
    }
    return weight;
  }

  presentTimestamp(dateString?: string, timeString?: string): Date {
    if (dateString == null) {
      return;
    }
    if (timeString == null) {
      timeString = "00:00:00";
    }
    const formatSpec = "YYYYMMDD HHmmss ZZ";
    return moment(`${dateString} ${timeString} +0000`, formatSpec).toDate();
  }

  presentAddress(rawAddress: IUpsLocation): string {
    if (!rawAddress) {
      return;
    }
    const city = rawAddress.City != null ? rawAddress.City[0] : undefined;
    const stateCode = rawAddress.StateProvinceCode != null ? rawAddress.StateProvinceCode[0] : undefined;
    const countryCode = rawAddress.CountryCode != null ? rawAddress.CountryCode[0] : undefined;
    const postalCode = rawAddress.PostalCode != null ? rawAddress.PostalCode[0] : undefined;
    return this.presentLocation({
      city,
      stateCode,
      countryCode,
      postalCode,
    });
  }

  presentStatus(status: IUpsStatus): STATUS_TYPES {
    if (status == null) {
      return STATUS_TYPES.UNKNOWN;
    }

    const statusType = status?.StatusType?.[0]?.Code?.[0];
    const statusCode = status?.StatusCode?.[0]?.Code?.[0];
    if (this.STATUS_MAP.has(statusType)) {
      return this.STATUS_MAP.get(statusType);
    }

    switch (statusType) {
      case "I":
        switch (statusCode) {
          case "OF":
            return STATUS_TYPES.OUT_FOR_DELIVERY;
          default:
            return STATUS_TYPES.EN_ROUTE;
        }
      case "X":
        switch (statusCode) {
          case "U2":
            return STATUS_TYPES.EN_ROUTE;
          default:
            return STATUS_TYPES.DELAYED;
        }
      default:
        return STATUS_TYPES.UNKNOWN;
    }
  }

  getDestination(shipment: IUpsShipment): string {
    return this.presentAddress(shipment?.ShipTo?.[0]?.Address?.[0]);
  }

  getActivitiesAndStatus(shipment: IUpsShipment): IActivitiesAndStatus {
    const activities = [];
    let status: STATUS_TYPES = null;
    const rawActivities = shipment?.Package?.[0]?.Activity;
    for (const rawActivity of Array.from(rawActivities || [])) {
      const location = this.presentAddress(rawActivity?.ActivityLocation?.[0]?.Address?.[0]);
      const timestamp = this.presentTimestamp(rawActivity?.Date?.[0], rawActivity?.Time?.[0]);
      const lastStatus = rawActivity?.Status?.[0];
      let details = lastStatus?.StatusType?.[0]?.Description?.[0];
      if (details != null && timestamp != null) {
        const statusObj = rawActivity.Status[0];
        details = upperCaseFirst(lowerCase(details));
        const activity: IUpsActivity = { timestamp, location, details };
        if (statusObj != null) {
          activity.statusType = statusObj?.StatusType?.[0]?.Code?.[0];
          activity.statusCode = statusObj?.StatusCode?.[0]?.Code?.[0];
        }
        activities.push(activity);
      }
      if (!status) {
        status = this.presentStatus(rawActivity?.Status[0]);
      }
    }
    return { activities, status };
  }

  requestOptions({ trackingNumber, reference, test }: IUpsRequestOptions): AxiosRequestConfig {
    const hostname = test ? "wwwcie.ups.com" : "onlinetools.ups.com";
    return {
      method: "POST",
      url: `https://${hostname}/ups.app/xml/Track`,
      data: this.generateRequest(trackingNumber, reference),
    };
  }
}

export { UpsClient };
