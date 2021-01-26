import { AxiosRequestConfig } from "axios";
import { parse } from "date-fns";
import {
  IActivitiesAndStatus,
  ICarrierResponse,
  ITrackitRequestOptions,
  STATUS_TYPES,
  TrackitClient,
} from "../trackitClient";

interface IPrestigeRawActivity {
  CountryCode: string;
  ELCity: string;
  ELState: string;
  ELZip: string;
  EstimatedDeliveryDate: string;
  EventCode: string;
  EventCodeDesc: string;
  PDCity: string;
  PDState: string;
  PDZip: string;
  SchdDateTime: string;
  serverDate: string;
  serverTime: string;
  TrackingNumber: string;
}

interface IPrestigeShipmentPiece {
  Weight: number;
  WeightUnit: string;
}

interface IPrestigeShipment {
  TrackingEventHistory: IPrestigeRawActivity[];
  TrackingNumber: string;
  Pieces?: IPrestigeShipmentPiece[];
}

export interface IPrestigeRequestOptions extends ITrackitRequestOptions {
  trackingNumber: string;
}

const ADDR_ATTRS = ["City", "State", "Zip"];

class PrestigeClient extends TrackitClient<IPrestigeShipment, IPrestigeRequestOptions> {
  private STATUS_MAP = new Map<string, STATUS_TYPES>([
    ["301", STATUS_TYPES.DELIVERED],
    ["302", STATUS_TYPES.OUT_FOR_DELIVERY],
    ["101", STATUS_TYPES.SHIPPING],
  ]);

  async validateResponse(responseString: string): Promise<ICarrierResponse<IPrestigeShipment>> {
    const responseArray = JSON.parse(responseString) as IPrestigeShipment[];
    if (!(responseArray != null ? responseArray.length : undefined)) {
      return await Promise.resolve({
        err: new Error("no tracking info found"),
      });
    }
    const response = responseArray[0];
    if (response.TrackingEventHistory == null) {
      return await Promise.resolve({ err: new Error("missing events") });
    }
    return await Promise.resolve({ shipment: response });
  }

  presentAddress(prefix: string, event: IPrestigeRawActivity): string {
    if (event == null) {
      return;
    }
    const address: { [key: string]: string } = {};
    ADDR_ATTRS.forEach((attr) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      address[attr] = event[`${prefix}${attr}`];
    });
    const city = address.City;
    const stateCode = address.State;
    const postalCode = address.Zip;
    return this.presentLocation({
      city,
      stateCode,
      postalCode,
      countryCode: null,
    });
  }

  presentStatus(eventType: string): STATUS_TYPES {
    // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
    const codeStr = eventType?.match("EVENT_(.*)$")?.[1];
    if (!(codeStr != null ? codeStr.length : undefined)) {
      return;
    }
    const eventCode = parseInt(codeStr);
    if (isNaN(eventCode)) {
      return;
    }
    const status = this.STATUS_MAP.get(eventCode?.toString());
    if (status != null) {
      return status;
    }
    if (eventCode < 300 && eventCode > 101) {
      return STATUS_TYPES.EN_ROUTE;
    }
  }

  getActivitiesAndStatus(shipment: IPrestigeShipment): IActivitiesAndStatus {
    const activities = [];
    let status: STATUS_TYPES = null;
    const rawActivities = shipment != null ? shipment.TrackingEventHistory : undefined;
    for (const rawActivity of rawActivities || []) {
      const location = this.presentAddress("EL", rawActivity);
      const dateTime = `${rawActivity != null ? rawActivity.serverDate : undefined} ${
        rawActivity != null ? rawActivity.serverTime : undefined
      }`;
      const timestamp = new Date(`${dateTime} +00:00`);
      const details = rawActivity != null ? rawActivity.EventCodeDesc : undefined;
      if (details != null && timestamp != null) {
        const activity = { timestamp, location, details };
        activities.push(activity);
      }
      if (!status) {
        status = this.presentStatus(rawActivity != null ? rawActivity.EventCode : undefined);
      }
    }
    return { activities, status };
  }

  getEta(shipment: IPrestigeShipment): Date {
    let eta = shipment?.TrackingEventHistory?.[0]?.EstimatedDeliveryDate;
    if (!(eta != null ? eta.length : undefined)) {
      return;
    }
    eta = `${eta} 00:00 +00:00`;
    return new Date(eta);
  }

  getService(): undefined {
    return undefined;
  }

  getWeight(shipment: IPrestigeShipment): string {
    if (!shipment?.Pieces?.length) {
      return;
    }
    const piece = shipment.Pieces[0];
    let weight = `${piece.Weight}`;
    const units = piece.WeightUnit;
    if (units != null) {
      weight = `${weight} ${units}`;
    }
    return weight;
  }

  getDestination(shipment: IPrestigeShipment): string {
    return this.presentAddress("PD", shipment?.TrackingEventHistory?.[0]);
  }

  requestOptions({ trackingNumber }: IPrestigeRequestOptions): AxiosRequestConfig {
    return {
      method: "GET",
      url: `http://www.prestigedelivery.com/TrackingHandler.ashx?trackingNumbers=${trackingNumber}`,
    };
  }
}

export { PrestigeClient };
