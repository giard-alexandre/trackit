/* eslint-disable
	@typescript-eslint/restrict-template-expressions,
	@typescript-eslint/no-unsafe-member-access,
	@typescript-eslint/no-unsafe-assignment,
	@typescript-eslint/no-unsafe-return,
	@typescript-eslint/no-unsafe-call,
	node/no-callback-literal
*/
import { AxiosRequestConfig } from "axios";
import moment from "moment-timezone";
/* eslint-disable
    constructor-super,
    no-constant-condition,
    no-eval,
    no-this-before-super,
    no-unused-vars,
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
import { reduce } from "underscore";
import {
  IShipperClientOptions,
  IShipperResponse,
  ShipperClient,
  STATUS_TYPES,
} from "./shipper";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface IPrestigeShipment {}

interface IPrestigeRequestOptions extends IShipperClientOptions {
  trackingNumber: string;
}

const ADDR_ATTRS = ["City", "State", "Zip"];

class PrestigeClient extends ShipperClient<
  IPrestigeShipment,
  IPrestigeRequestOptions
> {
  private STATUS_MAP = new Map<string, STATUS_TYPES>([
    ["301", STATUS_TYPES.DELIVERED],
    ["302", STATUS_TYPES.OUT_FOR_DELIVERY],
    ["101", STATUS_TYPES.SHIPPING],
  ]);

  async validateResponse(
    response: any
  ): Promise<IShipperResponse<IPrestigeShipment>> {
    response = JSON.parse(response);
    if (!(response != null ? response.length : undefined)) {
      return Promise.resolve({ err: new Error("no tracking info found") });
    }
    response = response[0];
    if (response.TrackingEventHistory == null) {
      return Promise.resolve({ err: new Error("missing events") });
    }
    return Promise.resolve({ shipment: response });
  }

  presentAddress(prefix, event) {
    if (event == null) {
      return;
    }
    const address = reduce(
      ADDR_ATTRS,
      function (d, v) {
        d[v] = event[`${prefix}${v}`];
        return d;
      },
      {}
    );
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

  presentStatus(eventType) {
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

  getActivitiesAndStatus(shipment) {
    const activities = [];
    let status = null;
    // TODO: remove all rawActivities weirdness with nullchecks
    let rawActivities =
      shipment != null ? shipment.TrackingEventHistory : undefined;
    rawActivities = Array.from(rawActivities || []);
    for (const rawActivity of rawActivities) {
      const location = this.presentAddress("EL", rawActivity);
      const dateTime = `${
        rawActivity != null ? rawActivity.serverDate : undefined
      } ${rawActivity != null ? rawActivity.serverTime : undefined}`;
      const timestamp = new Date(`${dateTime} +00:00`);
      const details =
        rawActivity != null ? rawActivity.EventCodeDesc : undefined;
      if (details != null && timestamp != null) {
        const activity = { timestamp, location, details };
        activities.push(activity);
      }
      if (!status) {
        status = this.presentStatus(
          rawActivity != null ? rawActivity.EventCode : undefined
        );
      }
    }
    return { activities, status };
  }

  getEta(shipment) {
    let eta = shipment?.TrackingEventHistory?.[0]?.EstimatedDeliveryDate;
    if (!(eta != null ? eta.length : undefined)) {
      return;
    }
    eta = `${eta} 00:00 +00:00`;
    return moment(eta, "MM/DD/YYYY HH:mm ZZ").toDate();
  }

  getService() {
    return undefined;
  }

  getWeight(shipment) {
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

  getDestination(shipment) {
    return this.presentAddress("PD", shipment?.TrackingEventHistory?.[0]);
  }

  requestOptions({
    trackingNumber,
  }: IPrestigeRequestOptions): AxiosRequestConfig {
    return {
      method: "GET",
      url: `http://www.prestigedelivery.com/TrackingHandler.ashx?trackingNumbers=${trackingNumber}`,
    };
  }
}

export { PrestigeClient };
