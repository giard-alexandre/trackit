import fs from "fs";
import { IActivity, ITrackitResponseData, STATUS_TYPES } from "../src/trackitClient";
import { IUpsmiRequestOptions, UpsMiClient } from "../src/upsmi";

const handleError = (e: unknown) => {
  if (e) {
    throw new Error("This should never have been reached");
  }
};

const verifyActivity = (act: IActivity, ts: number, loc: string, details: string) => {
  expect(act.timestamp.getTime()).toBe(ts);
  expect(act.location).toBe(loc);
  expect(act.details).toBe(details);
};

describe("ups mi client", () => {
  let _upsMiClient: UpsMiClient;

  beforeAll(() => (_upsMiClient = new UpsMiClient()));

  describe("integration tests", () => {
    describe("delivered package", () => {
      let _package: ITrackitResponseData<IUpsmiRequestOptions> = null;
      beforeAll(async () => {
        const promise = new Promise((resolve, reject) => {
          fs.readFile("test/stub_data/upsmi_delivered.html", "utf8", (err, docs) => {
            handleError(err);
            _upsMiClient.presentResponse(docs, { trackingNumber: "trk" }).then(({ err: respErr, data: resp }) => {
              expect(respErr).toBeFalsy();
              _package = resp;
              return resolve();
            }, handleError);
          });
        });
        return promise;
      });

      it("has non-null package", () => expect(_package).not.toBeNull());

      it("has a status of delivered", () => expect(_package.status).toBe(STATUS_TYPES.DELIVERED));

      it("has an eta of Mar 25 2014", () => expect(_package.eta).toEqual(new Date("Mar 25 2014")));

      it("has a weight of 0.3050 lbs.", () => expect(_package.weight).toBe("0.3050 lbs."));

      it("has destination of 11218", () => expect(_package.destination).toBe("11218"));

      it("has 11 activities with timestamp, location and details", () => {
        expect(_package.activities).toHaveLength(11);
        verifyActivity(_package.activities[0], 1395770820000, "Brooklyn, NY", "Package delivered by local post office");
        return verifyActivity(
          _package.activities[10],
          1395273600000,
          "Kansas City, MO",
          "Package received for processing"
        );
      });
    });

    describe("about to ship package", () => {
      let _package: ITrackitResponseData<IUpsmiRequestOptions> = null;
      beforeEach((done) =>
        fs.readFile("test/stub_data/upsmi_shipping.html", "utf8", (err, docs) => {
          handleError(err);
          _upsMiClient.presentResponse(docs, { trackingNumber: "trk" }).then(({ err: respErr, data: resp }) => {
            expect(respErr).toBeFalsy();
            _package = resp;
            done();
          }, handleError);
        })
      );

      it("has a status of shipping", () => expect(_package.status).toBe(STATUS_TYPES.SHIPPING));

      it("does not have an eta", () => {
        if (_package.eta != null) {
          expect(_package.eta).toEqual(new Date("Invalid Date"));
        }
      });

      it("does not have a weight", () => expect(_package.weight).toBeUndefined());

      it("does not have a destination", () => expect(_package.destination).toBeUndefined());

      it("has 1 activity with timestamp, location and details", () => {
        expect(_package.activities).toHaveLength(1);
        return verifyActivity(_package.activities[0], 1395619200000, "", "Shipment information received");
      });
    });
  });
});
