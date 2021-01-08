# Shipping APIs Adapter

`trackit` is a node module that allows you to retrieve data from shipping
carriers like UPS and FedEx in a common format. It interfaces with tracking APIs
when available, and falls back to screen scraping. For carriers that expose
tracking APIs, user is expected to acquire and provide credentials like license
numbers, meter numbers, user IDs and passwords.

### Carrier Guessing

Really, why do users have to know that a tracking number was provided by a
particular carrier. That step is just totally unnecessary, given that we can
guess the carrier from the tracking number in 90% of the cases. `trackit`
provides a convenience function for this.

### Carriers supported

* UPS
* FedEx
* FedEx Smartpost
* USPS
* Canada Post
* DHL
* UPS Mail Innovations
* DHL Global Mail
* LaserShip
* OnTrac
* Amazon
* A1 International
* Prestige

## Usage

Add trackit to your `package.json` and install it.

```
npm install @heuristical/trackit
```

### Using the trackit Clients

Initialize the shipper clients with your account credentials.

```typescript
import {
	UpsClient,
	FedexClient,
	UspsClient,
	DhlClient,
	LasershipClient,
	OnTracClient,
	UpsMiClient,
	DhlGmClient,
	CanadaPostClient,
	AmazonClient,
	PrestigeClient
} from 'trackit';

const ups = new UpsClient({
	licenseNumber: '1C999A999B999999',
	userId: 'trackit-user',
	password: 'shhh-secret'
});

const fedex = new FedexClient({
	key: 'xyxyxyxyabababab',
	password: 'asdfawasfdasdfasdf1',
	account: '123456789',
	meter: '99999999'
});

const usps = new UspsClient({
	userId: "590XABCR3210",
	clientIp: "10.5.5.1"
});

const lsClient = new LasershipClient();

const dhlClient = new DhlClient({
	userId: "SHIPI_79999",
	password: "trackit"
});

const dhlgmClient = new DhlGmClient();

const canadaPostClient = new CanadaPostClient({
	username: "maple-leafs",
	password: "zamboni"
});

const onTrac = new OnTracClient();

const upsmi = new UpsMiClient();

const amazonClient = new AmazonClient();

const prestige = new PrestigeClient();
```

Use an initialized client to request tracking data.

```typescript
const {
	err,
	data
} = await ups.requestData({ trackingNumber: '1Z1234567890123456' });

if (err) console.error("[ERROR] error retrieving tracking data", err);
if (data) console.log("[DEBUG] new tracking data received.", data);
```

You can use the Amazon client to query status of an item by its order ID and
shipment ID (packageIndex defaults to 1 - trackit does not yet support multiple
shipments per order).

```typescript
const orderID = '106-9151392-7203433';
const orderingShipmentId = 'DmZd0KS8k';
const {
	err,
	data
} = await amazonClient.requestData({ orderID, orderingShipmentId });
if (err) console.error("[ERROR] error retrieving tracking data", err);
if (data) console.log("[DEBUG] new tracking data received.", data);
```

Note that `orderId` and `shipmentId` can be found in the URL embedded in the *"
Track your package"* yellow button. Here's the format of that URL:

```
https://www.amazon.com/gp/css/shiptrack/view.html
/ref=pe_385040_121528360_TE_SIMP_typ?ie=UTF8
&orderID={orderID}
&orderingShipmentId={orderingShipmentId}
&packageId=1
```

Example response returned:

```
{
    "status": 2,
    "activities": [
        {
            "location": "Memphis, TN 38118",
            "timestamp": "2014-02-16T22:19:00.000Z",
            "datetime": "2014-02-16T17:19:00",
            "details": "Departed FedEx location"
        },
        {
            "location": "East Hanover, NJ 07936",
            "timestamp": "2014-02-15T23:57:00.000Z",
            "datetime": "2014-02-15T18:57:00",
            "details": "Left FedEx origin facility"
        },
        {
            "location": "East Hanover, NJ 07936",
            "timestamp": "2014-02-15T15:57:00.000Z",
            "datetime": "2014-02-15T10:57:00",
            "details": "Picked up"
        }
    ],
    "weight": "0.2 LB",
    "service": "FedEx Priority Overnight",
    "eta": "2014-02-17T15:30:00.000Z",
    "destination": "US",
    "request": {
      "trackingNumber": "9400110200881269505160"
    }
}
```

#### A Note on `timestamp` and `datetime`

There are two types of shipping carriers - one that provide a date and time in
their shipping activities that represents the local time at the location
indicated. And another that provide a timestamp, which includes a UTC offset. In
the first case, since a timezone is not known, trackit just assumes UTC, and
returns a `timestamp` attribute in the `activity` objects. In the second case,
trackit returns a `timestamp` attribute which has a UTC offset embedded in it,
and also a `datetime` attribute which represents the local time.

#### Optional parameters for trackit clients

Trackit clients parameters must be an options object that extends the
`ITrackitClientOptions` interface. This means that you can optionally set some
default request parameters that will then be automatically included for every
request that that client performs. These can also be passed manually when
calling the
`requestData()` method.

```typescript
// Set for all requests performed by upsClient
const upsClient = new UpsClient({
	...otherClientOptions,
	raw: true,
	timeout: 1000
});

// Alternatively, you can specify these parameters on a per-request basis.
const { err, data } = await upsClient.requestData({
	...otherClientOptions,
	raw: true,
	timeout: 1000
});
```

Valid options:

* `raw` - response includes the raw response received from the shipping carrier
  API.<br/>
  Default Value: `false`

* `timeout` - how many milliseconds to wait for a shipping carrier API response
  before returning a timeout error. This option can be overridden by a `timeout`
  attribute in the object passed on to the `requestData()` call.<br/>
  Default Value: `2000`

### Using the Carrier Guesser

There's usually only one carrier that matches a tracking number (UPS is the only
carrier that uses '1Z' prefix for its tracking numbers), but there are several
cases, where there are multiple matches. For example, FedEx uses a service
called SmartPost, where it relies on USPS to deliver the package at the last
mile. In such cases, FedEx provides tracking through most of the package's
journey, and then USPS either takes over, or provides duplicate tracking in the
last leg. The tracking number used is the same between the two carriers. Similar
situation with UPS Mail Innovations as well. Therefore, the `guessCarrier()`
function returns an array, and we leave it up to the user to decide manually or
through other automated means which carrier is the real one or provides more
accurate tracking.

```typescript
import { guessCarrier } from 'trackit';

let possibleCarriers = guessCarrier('1Z6V86420323794365');
// ['ups']
possibleCarriers = guessCarrier('9274899992136003821767');
// ['fedex', 'usps']
possibleCarriers = guessCarrier('EC207920162US');
// ['usps']
```

## Building

Clone this repo (or first fork it)

```
git clone git@github.com:heuristicAL/trackit.git
```

Install dependencies

```
npm install
```

Build

```
npm run build
```

## Adding new shipping carriers

* Extend the common
  class `TrackitClient<TShipment, TRequestOptions extends ITrackitRequestOptions>`
* Implement necessary methods:
	- `requestOptions(options: TRequestOptions extends ITrackitRequestOptions)`
	- `validateResponse(response: string)`

## Credits

> trackit was originally forked from [shipit](https://github.com/sailrish/shipit)
> and then the code went through some heavy changes:
> - The code was converted from [Coffeescript](https://coffeescript.org/) to [Typescript](https://www.typescriptlang.org/)
> - The callback-based code was replaced by promise-based code.
> - [moment](https://momentjs.com/) was replaced by [date-fns](https://date-fns.org/)
> - Finally, the original [Chai](https://www.chaijs.com/) and [Mocha](https://mochajs.org/) tests were replaced by [Jest](https://jestjs.io/).
>
> Due to the extensive changes that these changes introduced, I decided to
> unlink this from the original forked repo as, realistically, they will never be in sync.

1. [Rishi Arora](https://github.com/sailrish) for creating the original project
   that trackit was forked from [shipit](https://github.com/sailrish/shipit)

