/* eslint-disable @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-return */
import bond from "bondjs";
import * as fs from "fs";
import { Parser } from "xml2js";
import { STATUS_TYPES } from "../src/trackitClient";
import { IUpsLocation, IUpsShipment, UpsClient } from "../src/carriers/ups";

const handleError = (e: unknown) => {
  if (e) {
    throw new Error("This should never have been reached");
  }
};

describe("ups client", () => {
  let _upsClient: UpsClient;
  const _xmlParser = new Parser();
  let _xmlHeader = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

  beforeAll(
    () =>
      (_upsClient = new UpsClient({
        licenseNumber: "12345",
        userId: "shipit",
        password: "password",
      }))
  );

  describe("generateRequest", () => {
    let _xmlDocs: string[] = null;

    beforeAll(() => {
      const trackXml = _upsClient.generateRequest("1Z5678", "eloquent shipit");
      return (_xmlDocs = trackXml.split(_xmlHeader));
    });

    it("generates a track request with two xml documents", () => expect(_xmlDocs).toHaveLength(3));

    it("includes an AccessRequest in the track request", (done) =>
      _xmlParser.parseString(_xmlDocs[1], (err, doc) => {
        handleError(err);
        expect(doc).toHaveProperty("AccessRequest");
        done();
      }));

    it("includes a TrackRequest in the track request", (done) =>
      _xmlParser.parseString(_xmlDocs[2], (err, doc) => {
        handleError(err);
        expect(doc).toHaveProperty("TrackRequest");
        done();
      }));

    it("includes an AccessRequest with license number, user id and password", (done) =>
      _xmlParser.parseString(_xmlDocs[1], (err, doc) => {
        handleError(err);
        const accessReq = doc.AccessRequest;
        expect(accessReq).toHaveProperty("AccessLicenseNumber");
        expect(accessReq).toHaveProperty("UserId");
        expect(accessReq).toHaveProperty("Password");
        expect(accessReq.AccessLicenseNumber[0]).toBe("12345");
        expect(accessReq.UserId[0]).toBe("shipit");
        expect(accessReq.Password[0]).toBe("password");
        done();
      }));

    it("includes a TrackRequest with customer context", (done) =>
      _xmlParser.parseString(_xmlDocs[2], (err, doc) => {
        handleError(err);
        const trackReq = doc.TrackRequest;
        expect(trackReq).toHaveProperty("Request");
        expect(trackReq.Request[0].TransactionReference[0].CustomerContext[0]).toBe("eloquent shipit");
        done();
      }));

    it("includes a TrackRequest with request action and option", (done) =>
      _xmlParser.parseString(_xmlDocs[2], (err, doc) => {
        handleError(err);
        const trackReq = doc.TrackRequest;
        expect(trackReq).toHaveProperty("Request");
        expect(trackReq.Request[0].RequestAction[0]).toBe("track");
        expect(trackReq.Request[0].RequestOption[0]).toBe("3");
        done();
      }));

    it("includes a TrackRequest with the correct tracking number", (done) =>
      _xmlParser.parseString(_xmlDocs[2], (err, doc) => {
        handleError(err);
        const trackReq = doc.TrackRequest;
        expect(trackReq.TrackingNumber[0]).toBe("1Z5678");
        done();
      }));
  });

  describe("validateResponse", () => {
    it("returns an error if response is not an xml document", (done) => {
      let errorReported = false;
      return _upsClient.validateResponse("bad xml").then(({ err, shipment: resp }) => {
        expect(err).toBeDefined();
        if (!errorReported) {
          done();
        }
        return (errorReported = true);
      });
    });

    it("returns an error if xml response does not contain a response status", (done) => {
      let errorReported = false;
      _xmlHeader = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
      const badResponse =
        "<TrackResponse><Response><ResponseStatusCode>1</ResponseStatusCode></Response></TrackResponse>";
      return _upsClient.validateResponse(_xmlHeader + badResponse).then(({ err, shipment: resp }) => {
        expect(err).toBeDefined();
        if (!errorReported) {
          done();
        }
        return (errorReported = true);
      });
    });

    it("returns error description if xml response contains an unsuccessful status", (done) => {
      let errorReported = false;
      _xmlHeader = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
      const failureResponse =
        "<TrackResponse><Response><ResponseStatusCode>1</ResponseStatusCode><ResponseStatusDescription>Exception</ResponseStatusDescription><Error><ErrorDescription>No data</ErrorDescription></Error></Response></TrackResponse>";
      return _upsClient.validateResponse(_xmlHeader + failureResponse).then(({ err, shipment: resp }) => {
        expect(err).toEqual(new Error("No data"));
        if (!errorReported) {
          done();
        }
        return (errorReported = true);
      });
    });

    it("returns an error if xml response does not contain shipment data", (done) => {
      let errorReported = false;
      const noShipmentResponse =
        "<TrackResponse><Response><ResponseStatusCode>1</ResponseStatusCode><ResponseStatusDescription>Success</ResponseStatusDescription></Response></TrackResponse>";
      return _upsClient.validateResponse(_xmlHeader + noShipmentResponse).then(({ err, shipment: resp }) => {
        expect(err).toBeDefined();
        if (!errorReported) {
          done();
        }
        return (errorReported = true);
      });
    });

    it("returns shipment data retrieved from the xml response", (done) => {
      const goodResponse =
        "<TrackResponse><Response><ResponseStatusCode>1</ResponseStatusCode><ResponseStatusDescription>Success</ResponseStatusDescription></Response><Shipment>Smuggled Goods</Shipment></TrackResponse>";
      return _upsClient.validateResponse(_xmlHeader + goodResponse).then(({ err, shipment: resp }) => {
        expect(err).toBeFalsy();
        expect(resp).toBe("Smuggled Goods");
        done();
      });
    });
  });

  describe("getEta", () => {
    let _presentTimestamp = null;

    beforeEach(() => {
      // TODO: replace bond with Jest mocks and use expect(blah).toBeCalledWith().
      // _presentTimestamp = jest
      //   .spyOn(_upsClient, "presentTimestamp")
      //   .mockReturnValue(endOfDay(new Date()));
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      _presentTimestamp = bond(_upsClient, "presentTimestamp").return("at midnight");
    });

    it("uses ScheduledDeliveryDate", () => {
      const shipment: IUpsShipment = { ScheduledDeliveryDate: ["tomorrow"] };
      const eta = _upsClient.getEta(shipment);
      expect(_presentTimestamp.calledWith("tomorrow")).toBe(true);
      expect(eta).toBe("at midnight");
    });

    it("uses RescheduledDeliveryDate if ScheduledDeliveryDate is't available", () => {
      const shipment: IUpsShipment = {
        Package: [{ RescheduledDeliveryDate: ["next week"] }],
      };
      _upsClient.getEta(shipment);
      expect(_presentTimestamp.calledWith("next week")).toBe(true);
    });
  });

  describe("getService", () => {
    it("returns service description converted to title case", () => {
      const shipment = { Service: [{ Description: ["priority overnight"] }] };
      const service = _upsClient.getService(shipment);
      expect(service).toBe("Priority Overnight");
    });

    it("returns undefined if service is not present", () => {
      const shipment: IUpsShipment = { Service: undefined };
      const service = _upsClient.getService(shipment);
      expect(service).toBeUndefined();
    });

    it("returns undefined if service description is not present", () => {
      const shipment = { Service: [] };
      const service = _upsClient.getService(shipment);
      expect(service).toBeUndefined();
    });
  });

  describe("getWeight", () => {
    it("returns package weight along with unit of measurement", () => {
      const shipment = {
        Package: [
          {
            PackageWeight: [
              {
                Weight: ["very heavy"],
                UnitOfMeasurement: [{ Code: ["moon lbs"] }],
              },
            ],
          },
        ],
      };
      const weight = _upsClient.getWeight(shipment);
      expect(weight).toBe("very heavy moon lbs");
    });

    it("returns package weight even when unit of measurement is not available", () => {
      const shipment = {
        Package: [{ PackageWeight: [{ Weight: ["very heavy"] }] }],
      };
      const weight = _upsClient.getWeight(shipment);
      expect(weight).toBe("very heavy");
    });

    it("returns null when weight data is malformed or unavailable", () => {
      const shipment: IUpsShipment = {
        Package: [{ PackageWeight: undefined }],
      };
      const weight = _upsClient.getWeight(shipment);
      expect(weight).toBeNull();
    });
  });

  describe("getDestination", () => {
    let _presentAddress = null;

    beforeEach(() => (_presentAddress = bond(_upsClient, "presentAddress").return("mi casa")));

    it("calls presentAddress with the ship to address", () => {
      const rawAddress: IUpsLocation = {
        City: ["casa blanca"],
        CountryCode: undefined,
        PostalCode: undefined,
        StateProvinceCode: undefined,
      };
      const shipment: IUpsShipment = { ShipTo: [{ Address: [rawAddress] }] };
      const address = _upsClient.getDestination(shipment);
      expect(_presentAddress.calledWith(rawAddress)).toBe(true);
      expect(address).toBe("mi casa");
    });
  });

  describe("getActivitiesAndStatus", () => {
    let _presentAddressSpy = null;
    let _presentTimestampSpy = null;
    let _presentStatusSpy = null;
    let _activity1 = null;
    let _activity2 = null;
    let _activity3 = null;
    let _activity4 = null;
    let _shipment = null;

    beforeEach(() => {
      _presentAddressSpy = bond(_upsClient, "presentAddress");
      _presentTimestampSpy = bond(_upsClient, "presentTimestamp");
      _presentStatusSpy = bond(_upsClient, "presentStatus");
      _activity1 = {
        ActivityLocation: [{ Address: ["middle earth"] }],
        Date: ["yesterday"],
        Time: ["at noon"],
        Status: [{ StatusType: [{ Description: ["almost there"] }] }],
      };
      _activity2 = {
        ActivityLocation: [{ Address: ["middle earth"] }],
        Status: [{ StatusType: [{ Description: ["not there yet"] }] }],
      };
      _activity3 = {
        Date: ["yesterday"],
        Time: ["at noon"],
        Status: [{ StatusType: [{ Description: ["not there yet"] }] }],
      };
      _activity4 = {
        ActivityLocation: [{ Address: ["shire"] }],
        Date: ["two days ago"],
        Time: ["at midnight"],
        Status: [{ StatusType: [{ Description: ["fellowship begins"] }] }],
      };
      return (_shipment = { Package: [{ Activity: [_activity1] }] });
    });

    it("returns an empty array and null status if no package activities are found", () => {
      const { activities, status } = _upsClient.getActivitiesAndStatus({});
      expect(activities).toBeInstanceOf(Array);
      expect(activities).toHaveLength(0);
      expect(status).toBeNull();
    });

    it("calls presentAddress for activity location in package's activities", () => {
      const presentAddress = _presentAddressSpy.return();
      _upsClient.getActivitiesAndStatus(_shipment);
      expect(presentAddress.calledWith("middle earth")).toBe(true);
    });

    it("calls presentTimestamp for activity time and date in package's activities", () => {
      const presentTimestamp = _presentTimestampSpy.return();
      _upsClient.getActivitiesAndStatus(_shipment);
      expect(presentTimestamp.calledWith("yesterday", "at noon")).toBe(true);
    });

    it("calls presentStatus for the first of package's activities", () => {
      _presentAddressSpy.return("rivendell");
      _presentTimestampSpy.return("long long ago");
      const presentStatus = _presentStatusSpy.return("look to the east");
      _shipment.Package[0].Activity.push(_activity4);
      const { activities, status } = _upsClient.getActivitiesAndStatus(_shipment);
      expect(activities).toBeInstanceOf(Array);
      expect(activities).toHaveLength(2);
      expect(status).toBe("look to the east");
    });

    it("sets activity details to upper case first", () => {
      _presentAddressSpy.return("rivendell");
      _presentTimestampSpy.return("long long ago");
      const { activities } = _upsClient.getActivitiesAndStatus(_shipment);
      expect(activities[0].details).toBe("Almost there");
    });

    it("skips activities that don't have a valid timestamp", () => {
      _presentAddressSpy.return("rivendell");
      _presentTimestampSpy.to(function (dateString, timeString) {
        if (dateString != null) {
          return "long long ago";
        }
      });
      _shipment.Package[0].Activity.push(_activity2);
      const { activities } = _upsClient.getActivitiesAndStatus(_shipment);
      expect(activities).toBeInstanceOf(Array);
      expect(activities).toHaveLength(1);
    });

    it("accepts activities that don't have a valid location", () => {
      _presentAddressSpy.to(function (address) {
        if (address != null) {
          return "rivendell";
        }
      });
      _presentTimestampSpy.return("long long ago");
      _shipment.Package[0].Activity.push(_activity3);
      const { activities } = _upsClient.getActivitiesAndStatus(_shipment);
      expect(activities).toBeInstanceOf(Array);
      expect(activities).toHaveLength(2);
      expect(activities[1].timestamp).toBe("long long ago");
      expect(activities[1].details).toBe("Not there yet");
      expect(activities[1].location).toBeFalsy();
    });
  });

  describe("presentTimestamp", () => {
    it("returns undefined if dateString isn't specified", () => {
      const ts = _upsClient.presentTimestamp();
      expect(ts).toBeUndefined();
    });

    it("uses only the date string if time string isn't specified", () => {
      const ts = _upsClient.presentTimestamp("20140704");
      expect(ts).toEqual(new Date("2014-07-04T00:00:00.000Z"));
    });

    it("uses the date and time strings when both are available", () => {
      const ts = _upsClient.presentTimestamp("20140704", "142305");
      expect(ts).toEqual(new Date("2014-07-04T14:23:05.000Z"));
    });
  });

  describe("presentAddress", () => {
    let _presentLocationSpy = null;

    beforeEach(() => (_presentLocationSpy = bond(_upsClient, "presentLocation")));

    it("returns undefined if raw address isn't specified", () => {
      const address = _upsClient.presentAddress(undefined);
      expect(address).toBeUndefined();
    });

    it("calls presentLocation using the city, state, country and postal code", (done) => {
      const address = {
        city: "Chicago",
        stateCode: "IL",
        countryCode: "US",
        postalCode: "60654",
      };
      const rawAddress = {
        City: [address.city],
        StateProvinceCode: [address.stateCode],
        CountryCode: [address.countryCode],
        PostalCode: [address.postalCode],
      };
      _presentLocationSpy.to(function (raw) {
        expect(raw).toEqual(address);
        done();
      });
      return _upsClient.presentAddress(rawAddress);
    });
  });

  describe("presentStatus", () => {
    it("detects delivered status", () => {
      const statusType = { StatusType: [{ Code: ["D"] }] };
      const status = _upsClient.presentStatus(statusType);
      expect(status).toBe(STATUS_TYPES.DELIVERED);
    });

    it("detects en route status after package has been picked up", () => {
      const statusType = { StatusType: [{ Code: ["P"] }] };
      const status = _upsClient.presentStatus(statusType);
      expect(status).toBe(STATUS_TYPES.EN_ROUTE);
    });

    it("detects en route status for packages in transit", () => {
      const statusType = {
        StatusType: [{ Code: ["I"] }],
        StatusCode: [{ Code: ["anything"] }],
      };
      const status = _upsClient.presentStatus(statusType);
      expect(status).toBe(STATUS_TYPES.EN_ROUTE);
    });

    it("detects en route status for packages that have an exception", () => {
      const statusType = {
        StatusType: [{ Code: ["X"] }],
        StatusCode: [{ Code: ["U2"] }],
      };
      const status = _upsClient.presentStatus(statusType);
      expect(status).toBe(STATUS_TYPES.EN_ROUTE);
    });

    it("detects out-for-delivery status", () => {
      const statusType = {
        StatusType: [{ Code: ["I"] }],
        StatusCode: [{ Code: ["OF"] }],
      };
      const status = _upsClient.presentStatus(statusType);
      expect(status).toBe(STATUS_TYPES.OUT_FOR_DELIVERY);
    });

    it("detects delayed status", () => {
      const statusType = {
        StatusType: [{ Code: ["X"] }],
        StatusCode: [{ Code: ["anything else"] }],
      };
      const status = _upsClient.presentStatus(statusType);
      expect(status).toBe(STATUS_TYPES.DELAYED);
    });

    it("returns unknown if status code and type can't be matched", () => {
      const statusType = {
        StatusType: [{ Code: ["G"] }],
        StatusCode: [{ Code: ["W"] }],
      };
      const status = _upsClient.presentStatus(statusType);
      expect(status).toBe(STATUS_TYPES.UNKNOWN);
    });

    it("returns unknown if status code isn't available", () => {
      const status = _upsClient.presentStatus({});
      expect(status).toBe(STATUS_TYPES.UNKNOWN);
    });

    it("returns unknown if status object is undefined", () => {
      const status = _upsClient.presentStatus(undefined);
      expect(status).toBe(STATUS_TYPES.UNKNOWN);
    });
  });

  describe("integration tests", () => {
    let _package = null;

    describe("delivered package", () => {
      beforeAll((done) =>
        fs.readFile("test/stub_data/ups_delivered.xml", "utf8", (err, xmlDoc) => {
          handleError(err);
          _upsClient.presentResponse(xmlDoc, { trackingNumber: "1Z12345E0291980793" }).then(({ err, data: resp }) => {
            expect(err).toBeFalsy();
            _package = resp;
            done();
          }, handleError);
        })
      );

      it("returns the original tracking number", () =>
        expect(_package.request.trackingNumber).toBe("1Z12345E0291980793"));

      it("has a status of delivered", () => expect(_package.status).toBe(STATUS_TYPES.DELIVERED));

      it("has a service of 2nd Day Air", () => expect(_package.service).toBe("2 Nd Day Air"));

      it("has a destination of anytown", () => expect(_package.destination).toBe("Anytown, GA 30340"));

      it("has a weight of 5 lbs", () => expect(_package.weight).toBe("5.00 LBS"));

      it("has two activities with timestamp, location and details", () => {
        expect(_package.activities).toHaveLength(2);
        const act1 = _package.activities[0];
        const act2 = _package.activities[1];
        expect(act1.timestamp).toEqual(new Date("2010-06-10T12:00:00.000Z"));
        expect(act1.location).toBe("Anytown, GA 30340");
        expect(act1.details).toBe("Delivered");
        expect(act2.timestamp).toEqual(new Date("2010-06-08T12:00:00.000Z"));
        expect(act2.location).toBe("US");
        expect(act2.details).toBe("Billing information received. shipment date pending.");
      });
    });

    describe("package in transit", () => {
      beforeAll((done) =>
        fs.readFile("test/stub_data/ups_transit.xml", "utf8", (err, xmlDoc) => {
          handleError(err);
          _upsClient.presentResponse(xmlDoc, { trackingNumber: "trk" }).then(({ err: respErr, data: resp }) => {
            expect(respErr).toBeFalsy();
            _package = resp;
            done();
          }, handleError);
        })
      );

      it("has a status of in-transit", () => expect(_package.status).toBe(STATUS_TYPES.EN_ROUTE));

      it("has a service of Next Day Air Saver", () => expect(_package.service).toBe("Next Day Air Saver"));

      it("has 0.00 weight", () => expect(_package.weight).toBe("0.00 LBS"));

      it("has destination of anytown", () => expect(_package.destination).toBe("Anytown, GA 30304"));

      it("has one activity with timestamp, location and details", () => {
        expect(_package.activities).toHaveLength(1);
        const act = _package.activities[0];
        expect(act.timestamp).toEqual(new Date("2010-05-05T01:00:00.000Z"));
        expect(act.location).toBe("Grand Junction Air S, CO");
        expect(act.details).toBe("Origin scan");
      });
    });

    describe("multiple delivery attempts", () => {
      beforeAll((done) =>
        fs.readFile("test/stub_data/ups_delivery_attempt.xml", "utf8", (err, xmlDoc) => {
          handleError(err);
          _upsClient.presentResponse(xmlDoc, { trackingNumber: "trk" }).then(({ err: respErr, data: resp }) => {
            expect(respErr).toBeFalsy();
            _package = resp;
            done();
          }, handleError);
        })
      );

      it("has a status of delayed", () => expect(_package.status).toBe(STATUS_TYPES.DELAYED));

      it("has a service of Next Day Air Saver", () => expect(_package.service).toBe("Next Day Air Saver"));

      it("has 1.00 weight", () => expect(_package.weight).toBe("1.00 LBS"));

      it("has destination of anytown", () => expect(_package.destination).toBe("Anytown, GA 30340"));

      it("has 6 activities with timestamp, location and details", () => {
        expect(_package.activities).toHaveLength(6);
        let act = _package.activities[0];
        expect(act.timestamp).toEqual(new Date("1998-08-30T10:39:00.000Z"));
        expect(act.location).toBe("Bonn, DE");
        expect(act.details).toBe("Ups internal activity code");
        act = _package.activities[1];
        expect(act.timestamp).toEqual(new Date("2010-08-30T10:32:00.000Z"));
        expect(act.location).toBe("Bonn, DE");
        expect(act.details).toBe("Adverse weather conditions caused this delay");
      });
    });

    describe("rescheduled delivery date", () => {
      beforeAll((done) =>
        fs.readFile("test/stub_data/ups_rescheduled.xml", "utf8", (err, xmlDoc) => {
          handleError(err);
          _upsClient.presentResponse(xmlDoc, { trackingNumber: "trk" }).then(({ err: respErr, data: resp }) => {
            expect(respErr).toBeFalsy();
            _package = resp;
            done();
          }, handleError);
        })
      );

      it("has a status of", () => expect(_package.status).toBe(STATUS_TYPES.EN_ROUTE));

      it("has destination of anytown", () => expect(_package.destination).toBe("Chicago, IL 60607"));

      it("has an eta of Oct 24th", () => expect(_package.eta).toEqual(new Date("2014-10-24T00:00:00.000Z")));
    });

    describe("2nd tracking number", () => {
      beforeAll((done) =>
        fs.readFile("test/stub_data/ups_2nd_trk_number.xml", "utf8", (err, xmlDoc) => {
          handleError(err);
          _upsClient.presentResponse(xmlDoc, { trackingNumber: "trk" }).then(({ err: respErr, data: resp }) => {
            expect(respErr).toBeFalsy();
            _package = resp;
            done();
          }, handleError);
        })
      );

      it("has a status of delivered", () => expect(_package.status).toBe(STATUS_TYPES.DELIVERED));

      it("has a service of Ground", () => expect(_package.service).toBe("Ground"));

      it("has 1.00 weight", () => expect(_package.weight).toBe("20.00 LBS"));

      it("has destination of anytown", () => expect(_package.destination).toBe("Anytown, GA 30304"));

      it("has 6 activities with timestamp, location and details", () => {
        expect(_package.activities).toHaveLength(1);
        const act = _package.activities[0];
        // Todo: Add test for timestamp, location and details
      });
    });
  });
});
