import { AxiosRequestConfig } from "axios";
import moment from "moment-timezone";
import { Parser } from "xml2js";
import {
  IActivitiesAndStatus,
  ICarrierResponse,
  ITrackitClientOptions,
  ITrackitRequestOptions,
  STATUS_TYPES,
  TrackitClient,
} from "../trackitClient";

interface IDhlClientOptions extends ITrackitClientOptions {
  userId: string;
  password: string;
}

interface IDhlRawActivity {
  Date: string[];
  Time: string[];
  ServiceEvent: {
    Description: string[];
    EventCode: string[];
  }[];
  ServiceArea: {
    Description: string[];
  }[];
}

interface IDhlShipment {
  EstDlvyDate: string[];
  Weight: string[];
  ShipmentEvent: IDhlRawActivity[];
  DestinationServiceArea: {
    Description: string[];
  }[];
}

export interface IDhlRequestOptions extends ITrackitRequestOptions {
  trackingNumber: string;
}

interface IDhlResponse {
  "req:TrackingResponse": {
    AWBInfo: {
      ShipmentInfo: IDhlShipment[];
      Status: { ActionStatus: string }[];
    }[];
  };
}

class DhlClient extends TrackitClient<IDhlShipment, IDhlRequestOptions> {
  private STATUS_MAP = new Map<string, STATUS_TYPES>([
    ["AD", STATUS_TYPES.EN_ROUTE],
    ["AF", STATUS_TYPES.EN_ROUTE],
    ["AR", STATUS_TYPES.EN_ROUTE],
    ["BA", STATUS_TYPES.DELAYED],
    ["BN", STATUS_TYPES.EN_ROUTE],
    ["BR", STATUS_TYPES.EN_ROUTE],
    ["CA", STATUS_TYPES.DELAYED],
    ["CC", STATUS_TYPES.OUT_FOR_DELIVERY],
    ["CD", STATUS_TYPES.DELAYED],
    ["CM", STATUS_TYPES.DELAYED],
    ["CR", STATUS_TYPES.EN_ROUTE],
    ["CS", STATUS_TYPES.DELAYED],
    ["DD", STATUS_TYPES.DELIVERED],
    ["DF", STATUS_TYPES.EN_ROUTE],
    ["DS", STATUS_TYPES.DELAYED],
    ["FD", STATUS_TYPES.EN_ROUTE],
    ["HP", STATUS_TYPES.DELAYED],
    ["IC", STATUS_TYPES.EN_ROUTE],
    ["MC", STATUS_TYPES.DELAYED],
    ["MD", STATUS_TYPES.EN_ROUTE],
    ["MS", STATUS_TYPES.DELAYED],
    ["ND", STATUS_TYPES.DELAYED],
    ["NH", STATUS_TYPES.DELAYED],
    ["OH", STATUS_TYPES.DELAYED],
    ["OK", STATUS_TYPES.DELIVERED],
    ["PD", STATUS_TYPES.EN_ROUTE],
    ["PL", STATUS_TYPES.EN_ROUTE],
    ["PO", STATUS_TYPES.EN_ROUTE],
    ["PU", STATUS_TYPES.EN_ROUTE],
    ["RD", STATUS_TYPES.DELAYED],
    ["RR", STATUS_TYPES.DELAYED],
    ["RT", STATUS_TYPES.DELAYED],
    ["SA", STATUS_TYPES.SHIPPING],
    ["SC", STATUS_TYPES.DELAYED],
    ["SS", STATUS_TYPES.DELAYED],
    ["TD", STATUS_TYPES.DELAYED],
    ["TP", STATUS_TYPES.OUT_FOR_DELIVERY],
    ["TR", STATUS_TYPES.EN_ROUTE],
    ["UD", STATUS_TYPES.DELAYED],
    ["WC", STATUS_TYPES.OUT_FOR_DELIVERY],
    ["WX", STATUS_TYPES.DELAYED],
  ]);

  get userId(): string {
    return this.options.userId;
  }

  get password(): string {
    return this.options.password;
  }

  options: IDhlClientOptions;
  parser: Parser;

  constructor(options: IDhlClientOptions) {
    super(options);
    this.parser = new Parser();
  }

  generateRequest(trk: string): string {
    return `\
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<req:KnownTrackingRequest xmlns:req="http://www.dhl.com">
  <Request>
    <ServiceHeader>
      <SiteID>${this.userId}</SiteID>
      <Password>${this.password}</Password>
    </ServiceHeader>
  </Request>
  <LanguageCode>en</LanguageCode>
  <AWBNumber>${trk}</AWBNumber>
  <LevelOfDetails>ALL_CHECK_POINTS</LevelOfDetails>
</req:KnownTrackingRequest>\
`;
  }

  async validateResponse(response: string): Promise<ICarrierResponse<IDhlShipment>> {
    this.parser.reset();
    try {
      const trackResult = await new Promise<IDhlResponse>((resolve, reject) => {
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

      const trackingResponse = trackResult["req:TrackingResponse"];
      if (trackingResponse == null) {
        return { err: new Error("no tracking response") };
      }
      const awbInfo = trackingResponse.AWBInfo != null ? trackingResponse.AWBInfo[0] : undefined;
      if (awbInfo == null) {
        return { err: new Error("no AWBInfo in response") };
      }
      const shipment = awbInfo.ShipmentInfo != null ? awbInfo.ShipmentInfo[0] : undefined;
      if (shipment == null) {
        return { err: new Error("could not find shipment") };
      }
      const trackStatus = awbInfo.Status != null ? awbInfo.Status[0] : undefined;
      const statusCode = trackStatus != null ? trackStatus.ActionStatus : undefined;
      if (statusCode.toString() !== "success") {
        return { err: new Error(`unexpected track status code=${statusCode}`) };
      }
      return { shipment: shipment };
    } catch (e) {
      return { err: new Error(e) };
    }
  }

  getEta(shipment: IDhlShipment): Date {
    const eta = shipment.EstDlvyDate != null ? shipment.EstDlvyDate[0] : undefined;
    const formatSpec = "YYYYMMDD HHmmss ZZ";
    if (eta != null) {
      return moment(eta, formatSpec).toDate();
    }
  }

  getService(_: IDhlShipment): undefined {
    return undefined;
  }

  getWeight(shipment: IDhlShipment): string {
    const weight = shipment.Weight != null ? shipment.Weight[0] : undefined;
    if (weight != null) {
      return `${weight} LB`;
    }
  }

  presentTimestamp(dateString: string, timeString: string): Date {
    if (dateString == null) {
      return;
    }
    if (timeString == null) {
      timeString = "00:00";
    }
    const inputString = `${dateString} ${timeString} +0000`;
    const formatSpec = "YYYYMMDD HHmmss ZZ";
    return moment(inputString, formatSpec).toDate();
  }

  presentAddress(rawAddress: string): string {
    let city: string, countryCode: string, stateCode: string;
    if (rawAddress == null) {
      return;
    }
    const firstComma = rawAddress.indexOf(",");
    const firstDash = rawAddress.indexOf("-", firstComma);
    if (firstComma > -1 && firstDash > -1) {
      city = rawAddress.substring(0, firstComma).trim();
      stateCode = rawAddress.substring(firstComma + 1, firstDash).trim();
      countryCode = rawAddress.substring(firstDash + 1).trim();
    } else if (firstComma < 0 && firstDash > -1) {
      city = rawAddress.substring(0, firstDash).trim();
      stateCode = null;
      countryCode = rawAddress.substring(firstDash + 1).trim();
    } else {
      return rawAddress;
    }
    city = city.replace(" HUB", "");
    city = city.replace(" GATEWAY", "");
    return this.presentLocation({
      city,
      stateCode,
      countryCode,
      postalCode: null,
    });
  }

  presentDetails(rawAddress: string, rawDetails: string): string {
    if (rawDetails == null) {
      return;
    }
    if (rawAddress == null) {
      return rawDetails;
    }
    return rawDetails
      .replace(/\s\s+/, " ")
      .trim()
      .replace(new RegExp(`(?: at| in)? ${rawAddress.trim()}$`), "");
  }

  presentStatus(status: string): STATUS_TYPES {
    return this.STATUS_MAP.get(status) || STATUS_TYPES.UNKNOWN;
  }

  getActivitiesAndStatus(shipment: IDhlShipment): IActivitiesAndStatus {
    const activities = [];
    let status = STATUS_TYPES.UNKNOWN;
    let rawActivities: IDhlRawActivity[] = shipment.ShipmentEvent;
    if (rawActivities == null) {
      rawActivities = [];
    }
    rawActivities.reverse();
    for (const rawActivity of Array.from(rawActivities || [])) {
      const rawLocation = rawActivity?.ServiceArea?.[0]?.Description?.[0];
      const location = this.presentAddress(rawLocation);
      const timestamp = this.presentTimestamp(
        rawActivity.Date != null ? rawActivity.Date[0] : undefined,
        rawActivity.Time != null ? rawActivity.Time[0] : undefined
      );
      let details = this.presentDetails(rawLocation, rawActivity?.ServiceEvent?.[0]?.Description?.[0]);
      if (details != null && timestamp != null) {
        details = details.slice(-1) === "." ? details.slice(0, +-2 + 1 || undefined) : details;
        const activity = { timestamp, location, details };
        activities.push(activity);
      }
      if (!status) {
        status = this.presentStatus(rawActivity?.ServiceEvent?.[0]?.EventCode?.[0]);
      }
    }
    return { activities, status };
  }

  getDestination(shipment: IDhlShipment): string {
    const destination = shipment?.DestinationServiceArea?.[0]?.Description?.[0];
    if (destination == null) {
      return;
    }
    return this.presentAddress(destination);
  }

  requestOptions(options: IDhlRequestOptions): AxiosRequestConfig {
    const { trackingNumber } = options;
    return {
      method: "POST",
      url: "http://xmlpi-ea.dhl.com/XMLShippingServlet",
      data: this.generateRequest(trackingNumber),
    };
  }
}

export { DhlClient };
