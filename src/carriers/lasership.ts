import { AxiosRequestConfig } from "axios";
import {
  IActivitiesAndStatus,
  ICarrierResponse,
  ITrackitRequestOptions,
  STATUS_TYPES,
  TrackitClient,
} from "../trackitClient";

interface ILasershipAddress {
  City: string;
  State: string;
  PostalCode: string;
  Country: string;
}

interface ILasershipRawActivity extends ILasershipAddress {
  DateTime: string;
  EventShortText: string;
  EventType: string;
}

interface ILasershipShipmentPiece {
  Weight: number;
  WeightUnit: string;
}

interface ILasershipShipment {
  Destination: ILasershipAddress;
  Events: ILasershipRawActivity[];
  EstimatedDeliveryDate: string;
  Pieces: ILasershipShipmentPiece[];
}

export interface ILasershipRequestOptions extends ITrackitRequestOptions {
  trackingNumber: string;
}

class LasershipClient extends TrackitClient<ILasershipShipment, ILasershipRequestOptions> {
  private STATUS_MAP = new Map<string, STATUS_TYPES>([
    ["Released", STATUS_TYPES.DELIVERED],
    ["Delivered", STATUS_TYPES.DELIVERED],
    ["OutForDelivery", STATUS_TYPES.OUT_FOR_DELIVERY],
    ["Arrived", STATUS_TYPES.EN_ROUTE],
    ["Received", STATUS_TYPES.EN_ROUTE],
    ["OrderReceived", STATUS_TYPES.SHIPPING],
    ["OrderCreated", STATUS_TYPES.SHIPPING],
  ]);

  validateResponse(responseString: string): Promise<ICarrierResponse<ILasershipShipment>> {
    try {
      const response = JSON.parse(responseString) as ILasershipShipment;
      if (response.Events == null) {
        return Promise.resolve({ err: new Error("missing events") });
      }
      return Promise.resolve({ shipment: response });
    } catch (error) {
      return Promise.resolve({ err: new Error(error) });
    }
  }

  presentAddress(address: ILasershipAddress): string {
    const city = address.City;
    const stateCode = address.State;
    const postalCode = address.PostalCode;
    const countryCode = address.Country;
    return this.presentLocation({
      city,
      stateCode,
      countryCode,
      postalCode,
    });
  }

  presentStatus(eventType: string): STATUS_TYPES {
    if (eventType != null) {
      return this.STATUS_MAP.get(eventType);
    }
  }

  getActivitiesAndStatus(shipment: ILasershipShipment): IActivitiesAndStatus {
    const activities = [];
    let status: STATUS_TYPES = null;
    let rawActivities = shipment != null ? shipment.Events : undefined;
    rawActivities = Array.from(rawActivities || []);
    for (const rawActivity of rawActivities) {
      let timestamp: Date;
      const location = this.presentAddress(rawActivity);
      const dateTime = rawActivity != null ? rawActivity.DateTime : undefined;
      if (dateTime != null) {
        timestamp = new Date(`${dateTime}Z`);
      }
      const details = rawActivity != null ? rawActivity.EventShortText : undefined;
      if (details != null && timestamp != null) {
        const activity = { timestamp, location, details };
        activities.push(activity);
      }
      if (!status) {
        status = this.presentStatus(rawActivity != null ? rawActivity.EventType : undefined);
      }
    }
    return { activities, status };
  }

  getEta(shipment: ILasershipShipment): Date {
    if ((shipment != null ? shipment.EstimatedDeliveryDate : undefined) == null) {
      return;
    }
    return new Date(`${shipment.EstimatedDeliveryDate}T00:00:00Z`);
  }

  getService(): undefined {
    return undefined;
  }

  getWeight(shipment: ILasershipShipment): string {
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

  getDestination(shipment: ILasershipShipment): string {
    const destination = shipment != null ? shipment.Destination : undefined;
    if (destination == null) {
      return;
    }
    return this.presentAddress(destination);
  }

  requestOptions({ trackingNumber }: ILasershipRequestOptions): AxiosRequestConfig {
    return {
      method: "GET",
      url: `http://www.lasership.com/track/${trackingNumber}/json`,
    };
  }
}

export { LasershipClient };
