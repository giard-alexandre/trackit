import fs from "fs";
import { DhlClient, IDhlRequestOptions } from "../src/dhl";
import { ITrackitResponseData, STATUS_TYPES } from "../src/shipper";

const handleError = (e: any) => {
  if (e) {
    throw new Error("This should never have been reached");
  }
};

describe("dhl client", () => {
  let _dhlClient: DhlClient = null;

  beforeAll(
    () =>
      (_dhlClient = new DhlClient({
        userId: "dhl-user",
        password: "dhl-pw",
      }))
  );

  describe("generateRequest", () => {
    it("generates an accurate track request", () => {
      const trackXml = _dhlClient.generateRequest("1Z5678");
      expect(trackXml).toBe(`\
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<req:KnownTrackingRequest xmlns:req="http://www.dhl.com">
  <Request>
    <ServiceHeader>
      <SiteID>dhl-user</SiteID>
      <Password>dhl-pw</Password>
    </ServiceHeader>
  </Request>
  <LanguageCode>en</LanguageCode>
  <AWBNumber>1Z5678</AWBNumber>
  <LevelOfDetails>ALL_CHECK_POINTS</LevelOfDetails>
</req:KnownTrackingRequest>`);
    });
  });

  describe("integration tests", () => {
    let _package: ITrackitResponseData<IDhlRequestOptions> = null;

    describe("delivered package", () => {
      beforeAll((done) =>
        fs.readFile("test/stub_data/dhl_delivered.xml", "utf8", (err, doc) => {
          handleError(err);
          _dhlClient.presentResponse(doc, { trackingNumber: "trk" }).then(({ err: respErr, data: resp }) => {
            expect(respErr).toBeFalsy();
            _package = resp;
            done();
          }, handleError);
        })
      );

      it("has a status of delivered", () => expect(_package.status).toBe(STATUS_TYPES.DELIVERED));

      it("has a destination of Woodside, NY, USA", () => expect(_package.destination).toBe("Woodside, NY, USA"));

      it("has a weight of 2.42 LB", () => expect(_package.weight).toBe("2.42 LB"));

      it("has 14 activities with timestamp, location and details", () => {
        expect(_package.activities).toHaveLength(14);
        let act = _package.activities[0];
        expect(act.location).toBe("Woodside, NY, USA");
        expect(act.details).toBe("Delivered - Signed for by");
        expect(act.timestamp).toEqual(new Date("2015-10-01T13:44:37Z"));
        act = _package.activities[13];
        expect(act.location).toBe("London, Heathrow United Kingdom");
        expect(act.details).toBe("Processed");
        expect(act.timestamp).toEqual(new Date("2015-09-29T21:10:34Z"));
      });
    });

    describe("delayed package", () => {
      beforeAll((done) =>
        fs.readFile("test/stub_data/dhl_delayed.xml", "utf8", (err, doc) => {
          handleError(err);
          _dhlClient.presentResponse(doc, { trackingNumber: "trk" }).then(({ err: respErr, data: resp }) => {
            expect(respErr).toBeFalsy();
            _package = resp;
            done();
          }, handleError);
        })
      );

      it("has a status of delayed", () => expect(_package.status).toBe(STATUS_TYPES.DELAYED));

      it("has a destination of Auckland, New Zealand", () =>
        expect(_package.destination).toBe("Auckland, New Zealand"));

      it("has a weight of 14.66 LB", () => expect(_package.weight).toBe("14.66 LB"));

      it("has 24 activities with timestamp, location and details", () => {
        expect(_package.activities).toHaveLength(24);
        let act = _package.activities[0];
        expect(act.location).toBe("Auckland, New Zealand");
        expect(act.details).toBe("Clearance event");
        expect(act.timestamp).toEqual(new Date("2015-10-08T02:33:00Z"));
        act = _package.activities[23];
        expect(act.location).toBe("London, Heathrow United Kingdom");
        expect(act.details).toBe("Processed");
        expect(act.timestamp).toEqual(new Date("2015-09-18T20:18:58Z"));
      });
    });

    describe("package with estimated delivery", () => {
      beforeAll((done) =>
        fs.readFile("test/stub_data/dhl_eta.xml", "utf8", (err, doc) => {
          handleError(err);
          _dhlClient.presentResponse(doc, { trackingNumber: "trk" }).then(({ err: respErr, data: resp }) => {
            expect(respErr).toBeFalsy();
            _package = resp;
            done();
          }, handleError);
        })
      );

      it("has an estimated delivery date", () => expect(_package.eta).toEqual(new Date("2019-02-05T07:59:00.000Z")));
    });
  });
});
