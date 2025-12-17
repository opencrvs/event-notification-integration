import { faker, ne } from "@faker-js/faker";
import { v4 as uuidv4 } from "uuid";

type TokenResponse = { access_token: string; token_type: string };

type CreateEventRequest = {
  type: "birth";
  transactionId: string;
  dateOfEvent: { fieldId: string };
};

type CreateEventResponse = {
  id: string;
  type: string;
  createdAt: string;
  updatedAt: string;
  trackingId: string;
  actions: Array<unknown>;
};

// Reusable building blocks
export type Gender = "male" | "female" | "unknown";

export type PlaceOfBirth = "HEALTH_FACILITY" | "PRIVATE_HOME" | "OTHER";

export type InformantRelation =
  | "FATHER"
  | "MOTHER"
  | "GRANDFATHER"
  | "GRANDMOTHER"
  | "BROTHER"
  | "SISTER"
  | "LEGAL_GUARDIAN"
  | "OTHER";

export type IdType =
  | "NATIONAL_ID"
  | "PASSPORT"
  | "BIRTH_REGISTRATION_NUMBER"
  | "NONE";

export type DomesticAddress = {
  addressType: "DOMESTIC";
  country: "BRB" | string;
  administrativeArea: string; // parish id (or name, depending on your config)
  town?: string;
  street?: string;
  number?: string;
  zipCode?: string;
};

export type PersonName = {
  firstname: string;
  surname: string;
};

// The declaration payload shape (string keys like OpenCRVS form fields)
export type BirthDeclaration = {
  "child.name": PersonName;
  "child.gender": Gender;
  "child.dob": string;
  "child.reason"?: string; // Reason for delayed registration
  "child.placeOfBirth": PlaceOfBirth;
  "child.birthLocation"?: string; // hospital id (Location.id) when placeOfBirth = HEALTH_FACILITY
  "child.birthLocation.privateHome"?: DomesticAddress; // address when placeOfBirth = PRIVATE_HOME

  "informant.relation": InformantRelation;
  "informant.other.relation"?: string;
  "informant.name"?: PersonName;
  "informant.dob"?: string; // YYYY-MM-DD
  "informant.nationality"?: string; // Alpha 3 country code e.g. BRB
  "informant.idType"?: IdType;
  "informant.nid"?: string;
  "informant.passport"?: string;
  "informant.brn"?: string;
  "informant.address"?: DomesticAddress;
  "informant.email"?: string;

  "mother.detailsNotAvailable"?: boolean;
  "mother.reason"?: string;
  "mother.name"?: PersonName;
  "mother.dob"?: string; // YYYY-MM-DD
  "mother.nationality"?: string;
  "mother.idType"?: IdType;
  "mother.nid"?: string;
  "mother.passport"?: string;
  "mother.brn"?: string;
  "mother.address"?: DomesticAddress;

  "father.detailsNotAvailable"?: boolean;
  "father.reason"?: string;
  "father.name"?: PersonName;
  "father.dob"?: string; // YYYY-MM-DD
  "father.nationality"?: string;
  "father.idType"?: IdType;
  "father.nid"?: string;
  "father.passport"?: string;
  "father.brn"?: string;
  "father.addressSameAs"?: string; // if true, use mother's address
  "father.address"?: DomesticAddress;
};

type NotifyRequest = {
  eventId: string;
  transactionId: string;
  declaration: BirthDeclaration;
  annotation: Record<string, unknown>;
  createdAtLocation: string;
  type: "NOTIFY";
};

let AUTH_BASE = "https://auth.barbados-qa.opencrvs.org";
let EVENTS_BASE = "https://register.barbados-qa.opencrvs.org";
let LOCATIONS_BASE = "https://gateway.barbados-qa.opencrvs.org";

if(process.env.LOCALHOST) {
    AUTH_BASE = "http://localhost:4040";
    EVENTS_BASE = "http://localhost:3000";
    LOCATIONS_BASE = "http://localhost:7070";
}

async function getAccessToken(): Promise<string> {
  const clientId = process.env.CLIENT_ID;
  const clientSecret = process.env.CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("CLIENT_ID or CLIENT_SECRET not set in environment");
  }

  const url = new URL("/token", AUTH_BASE);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("grant_type", "client_credentials");

  console.log("Requesting access token from:", url.toString());
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!res.ok)
    throw new Error(`Token request failed: ${res.status} ${await res.text()}`);

  const data = (await res.json()) as TokenResponse;
  if (!data.access_token)
    throw new Error("Token response missing access_token");
  return data.access_token;
}

async function createEvent(
  accessToken: string,
  payload: CreateEventRequest
): Promise<string> {
  const res = await fetch(`${EVENTS_BASE}/api/events/events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok)
    throw new Error(`Create event failed: ${res.status} ${await res.text()}`);

  const data = (await res.json()) as CreateEventResponse;
  if (!data.id) throw new Error("Create event response missing id");

  return data.id; // <-- eventId
}

async function notifyEvent(
  accessToken: string,
  payload: NotifyRequest
): Promise<unknown> {
  const res = await fetch(`${EVENTS_BASE}/api/events/events/notifications`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok)
    throw new Error(`Notify failed: ${res.status} ${await res.text()}`);
  return res.json();
}

type LocationBundle = {
  entry?: Array<{
    resource?: {
      id?: string;
      identifier?: Array<{ system?: string; value?: string }>
      name?: string;
    };
  }>;
};

export async function getLocationIdByNameOrStatisticalId(
  searchString: string,
  locationType: string,
  useStatisticalId: boolean = false
): Promise<string> {
  const url = `${LOCATIONS_BASE}/location?type=${locationType}`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(
      `Failed to fetch locations: ${res.status} ${await res.text()}`
    );
  }

  const data = (await res.json()) as LocationBundle;

  let match
  !useStatisticalId ? match = data.entry?.find((e) => e.resource?.name === searchString) : match = data.entry?.find(e => {
    const r = e.resource
    if(!r){
        throw new Error("Location resource missing");
    }
    return (r.identifier ?? []).some(id => {
      const value = id.value ?? ''
      return value === searchString || value.endsWith(`_${searchString}`)
      // e.g. "CRVS_OFFICE_BRB_Office_1" endsWith "_BRB_Office_1"
    })
  })

  if (!match?.resource?.id) {
    throw new Error(`CRVS office not found: "${searchString}"`);
  }

  return match.resource.id;
}

async function main() {
  const officeId = await getLocationIdByNameOrStatisticalId(
    "Registration District A",
    "CRVS_OFFICE"
  );
  console.log("Using officeId:", officeId);
  const hospitalId = await getLocationIdByNameOrStatisticalId(
    "Queen Elizabeth Hospital",
    "HEALTH_FACILITY"
  );
  const parishId = await getLocationIdByNameOrStatisticalId(
    "Christ Church",
    "ADMIN_STRUCTURE"
  );

  // you can also query using an id if you are concerned about spelling differences:
  /*const statisticalIdExampleForAnOffice = await getLocationIdByNameOrStatisticalId("BRB_Office_1",
    "CRVS_OFFICE",
    true
  );
  console.log("Statistical ID example for an office:", statisticalIdExampleForAnOffice);*/
  const accessToken = await getAccessToken();

  // 1) Create event -> capture eventId
  const createPayload: CreateEventRequest = {
    type: "birth",
    transactionId: uuidv4(),
    dateOfEvent: { fieldId: "child.dob" },
  };

  const eventId = await createEvent(accessToken, createPayload);
  console.log("Created eventId:", eventId);

  // 2) Notify using eventId
  const sharedSurname = faker.person.lastName("male");
  const informantFirstName = faker.person.firstName("male");

  const notifyPayload: NotifyRequest = {
    eventId,
    transactionId: uuidv4(),
    declaration: {
      "child.name": {
        firstname: faker.person.firstName("male"),
        surname: sharedSurname,
      },
      "child.gender": "male",
      "child.dob": faker.date
        .between({ from: "2025-12-01", to: "2025-12-15" })
        .toISOString()
        .slice(0, 10),
      "child.placeOfBirth": "HEALTH_FACILITY",
      "child.birthLocation": hospitalId,
      "informant.relation": "GRANDFATHER",
      "informant.name": {
        firstname: informantFirstName,
        surname: sharedSurname,
      },
      "informant.dob": faker.date
        .between({ from: "1970-01-01", to: "1977-12-30" })
        .toISOString()
        .slice(0, 10),
      "informant.nationality": "BRB",
      "informant.idType": "PASSPORT",
      "informant.passport":
        faker.string.alpha({ length: 1, casing: "upper" }) +
        faker.string.numeric(7),
      "informant.address": {
        addressType: "DOMESTIC",
        country: "BRB",
        administrativeArea: parishId,
        town: faker.location.city(),
        street: faker.location.street(),
        number: faker.location.buildingNumber(),
        zipCode: faker.location.zipCode(),
      },
      "informant.email": faker.internet
        .email({
          firstName: informantFirstName,
          lastName: sharedSurname,
          provider: "example.com",
        })
        .toLowerCase(),
      "mother.detailsNotAvailable": false,
      "mother.reason": "",
      "mother.name": {
        firstname: faker.person.firstName("female"),
        surname: sharedSurname,
      },
      "mother.dob": faker.date
        .between({ from: "2000-01-01", to: "2005-12-30" })
        .toISOString()
        .slice(0, 10),
      "mother.nationality": "BRB",
      "mother.idType": "PASSPORT",
      "mother.passport":
        faker.string.alpha({ length: 1, casing: "upper" }) +
        faker.string.numeric(7),
      "mother.address": {
        addressType: "DOMESTIC",
        country: "BRB",
        administrativeArea: parishId,
        town: faker.location.city(),
        street: faker.location.street(),
        number: faker.location.buildingNumber(),
        zipCode: faker.location.zipCode(),
      },

      "father.reason": "",
      "father.name": {
        firstname: faker.person.firstName("male"),
        surname: sharedSurname,
      },
      "father.dob": faker.date
        .between({ from: "2000-01-01", to: "2005-12-30" })
        .toISOString()
        .slice(0, 10),
      "father.nationality": "BRB",
      "father.idType": "PASSPORT",
      "father.passport":
        faker.string.alpha({ length: 1, casing: "upper" }) +
        faker.string.numeric(7),
      "father.addressSameAs": "YES", // set to true if address is same as mother
    },
    annotation: {},
    createdAtLocation: officeId,
    type: "NOTIFY",
  };

  const notifyRes = await notifyEvent(accessToken, notifyPayload);
  console.log("Notify response:", notifyRes);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
