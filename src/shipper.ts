import { titleCase } from "change-case";
import { endOfDay, startOfDay } from "date-fns";
import Axios, { AxiosRequestConfig } from "axios";

export enum STATUS_TYPES {
  UNKNOWN = 0,
  SHIPPING = 1,
  EN_ROUTE = 2,
  OUT_FOR_DELIVERY = 3,
  DELIVERED = 4,
  DELAYED = 5,
}

export interface IShipperClientOptions {
  /**
   * Response includes the raw response received from the shipping carrier API.
   */
  raw?: boolean;
  /**
   * Number of milliseconds before requests to carriers timeout.
   * This option can be overridden by a `timeout` attribute in the object passed on to the `requestData()` call.
   */
  timeout?: number;
}

export interface IShipperResponse<T> {
  err?: Error;
  shipment?: T;
}

export interface ILocation {
  city: string;
  stateCode: string;
  countryCode: string;
  postalCode: string;
}

export interface IActivity {
  timestamp?: Date;
  datetime?: string;
  location?: string;
  details?: string;
}

/**
 * @param TShipment The type of the shipment activity
 * @param TRequestOptions The structure of the request options used to build the request to the carrier.
 */
export abstract class ShipperClient<
  TShipment,
  TRequestOptions extends IShipperClientOptions
> {
  public abstract async validateResponse(
    response: string
  ): Promise<IShipperResponse<TShipment>>;

  public abstract getActivitiesAndStatus(
    shipment: TShipment
  ): { activities: Array<IActivity>; status: STATUS_TYPES };

  public abstract getEta(shipment: TShipment): Date;

  public abstract getService(shipment: TShipment): string;

  public abstract getWeight(shipment: TShipment): string;

  public abstract getDestination(shipment: TShipment): string;

  public abstract requestOptions(options: TRequestOptions): AxiosRequestConfig;

  public options: IShipperClientOptions = { timeout: 2000 };

  constructor(options?: IShipperClientOptions) {
    this.options = {
      ...this.options,
      ...options,
    };
  }

  private presentPostalCode(rawCode: string): string {
    rawCode = rawCode?.trim() || undefined;
    if (/^\d{9}$/.test(rawCode)) {
      return `${rawCode.slice(0, 5)}-${rawCode.slice(5)}`;
    } else {
      return rawCode;
    }
  }

  public presentLocationString(location: string): string {
    const newFields = [];
    for (let field of location?.split(",") || []) {
      field = field.trim();
      if (field.length > 2) {
        field = titleCase(field);
      }
      newFields.push(field);
    }

    return newFields.join(", ");
  }

  public presentLocation({
    city,
    stateCode,
    countryCode,
    postalCode,
  }: ILocation): string {
    let address: string;
    if (city?.length) {
      city = titleCase(city);
    }
    if (stateCode != null ? stateCode.length : undefined) {
      stateCode = stateCode.trim();
      if (stateCode.length > 3) {
        stateCode = titleCase(stateCode);
      }
      if (city?.length) {
        city = city.trim();
        address = `${city}, ${stateCode}`;
      } else {
        address = stateCode;
      }
    } else {
      address = city;
    }
    postalCode = this.presentPostalCode(postalCode);
    if (countryCode?.length) {
      countryCode = countryCode.trim();
      if (countryCode.length > 3) {
        countryCode = titleCase(countryCode);
      }
      if (address?.length) {
        address = countryCode !== "US" ? `${address}, ${countryCode}` : address;
      } else {
        address = countryCode;
      }
    }
    if (postalCode?.length) {
      address = address != null ? `${address} ${postalCode}` : postalCode;
    }
    return address;
  }

  public async presentResponse(
    response: string,
    requestData?: TRequestOptions
  ): Promise<{ err?: Error; presentedResponse?: any }> {
    const { err, shipment } = await this.validateResponse(response);
    let adjustedEta: Date;
    if (err != null || shipment == null) {
      return { err };
    }
    const { activities, status } = this.getActivitiesAndStatus(shipment);
    const eta = this.getEta(shipment);
    if (eta && startOfDay(eta) === eta) {
      adjustedEta = endOfDay(eta);
    }
    if (adjustedEta === null) {
      adjustedEta = eta;
    }
    const presentedResponse = {
      eta: adjustedEta || eta,
      service: this.getService(shipment),
      weight: this.getWeight(shipment),
      destination: this.getDestination(shipment),
      activities,
      status,
      raw: undefined,
      request: undefined,
    };
    if (requestData?.raw || this.options?.raw) {
      presentedResponse.raw = response;
    }
    presentedResponse.request = requestData;
    return { err: null, presentedResponse: presentedResponse };
  }

  public async requestData(
    requestData: TRequestOptions
  ): Promise<{ err?: Error; data?: any }> {
    const req = this.requestOptions(requestData);
    req.responseType = "text";
    req.timeout = requestData?.timeout || this.options?.timeout;
    try {
      const response = await Axios(req);
      const body = (await response.data) as string;
      if (body == null) {
        return { err: new Error("Empty response") };
      }
      if (response.status !== 200) {
        return { err: new Error(`response status ${response.status}`) };
      }
      const presentedResponse = await this.presentResponse(body, requestData);
      return { data: presentedResponse };
    } catch (e) {
      return { err: e as Error };
    }
  }
}
