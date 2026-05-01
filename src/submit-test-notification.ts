import { faker } from "@faker-js/faker";
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

export type PersonName = {
  firstname: string;
  surname: string;
};

// The declaration payload shape (string keys like OpenCRVS form fields)
export type BirthDeclaration = {
  "child.name": PersonName;
  "child.gender": Gender;
  "child.dob": string;
  "child.placeOfBirth": PlaceOfBirth;
  "child.birthLocation"?: string; // hospital id (Location.id) when placeOfBirth = HEALTH_FACILITY
  "informant.relation": InformantRelation;
  "informant.email"?: string;
  "mother.detailsNotAvailable"?: boolean;
  "mother.reason"?: string;
  "mother.name"?: PersonName;
};

type NotifyRequest = {
  eventId: string;
  transactionId: string;
  declaration: BirthDeclaration;
  annotation: Record<string, unknown>;
  createdAtLocation: string;
  type: "NOTIFY";
};

let AUTH_BASE = "https://auth.farajaland-integration.opencrvs.dev";
let EVENTS_BASE = "https://register.farajaland-integration.opencrvs.dev";
let LOCATIONS_BASE = "https://gateway.farajaland-integration.opencrvs.dev";

if (process.env.LOCALHOST) {
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
      identifier?: Array<{ system?: string; value?: string }>;
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
  console.log('Fetching locations from:', url);
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(
      `Failed to fetch locations: ${res.status} ${await res.text()}`
    );
  }

  const data = (await res.json()) as LocationBundle;

  let match;
  !useStatisticalId
    ? (match = data.entry?.find((e) => e.resource?.name === searchString))
    : (match = data.entry?.find((e) => {
        const r = e.resource;
        if (!r) {
          throw new Error("Location resource missing");
        }
        return (r.identifier ?? []).some((id) => {
          const value = id.value ?? "";
          return value === searchString || value.endsWith(`_${searchString}`);
          // e.g. "CRVS_OFFICE_BRB_Office_1" endsWith "_BRB_Office_1"
        });
      }));

  if (!match?.resource?.id) {
    throw new Error(`CRVS office not found: "${searchString}"`);
  }

  return match.resource.id;
}

async function main() {
  const officeId = await getLocationIdByNameOrStatisticalId(
    "Ibombo District Office",
    "CRVS_OFFICE"
  );
  console.log("Using officeId:", officeId);
  const hospitalId = await getLocationIdByNameOrStatisticalId(
    "Ibombo District Hospital",
    "HEALTH_FACILITY"
  );
  const districtId = await getLocationIdByNameOrStatisticalId(
    "Ibombo",
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
        .between({ from: "2023-12-01", to: "2024-12-15" })
        .toISOString()
        .slice(0, 10),
      "child.placeOfBirth": "HEALTH_FACILITY",
      "child.birthLocation": hospitalId,
      "informant.relation": "MOTHER",
      "informant.email": faker.internet
        .email({
          firstName: informantFirstName,
          lastName: sharedSurname,
          provider: "example.com",
        })
        .toLowerCase(),
      "mother.detailsNotAvailable": false,
      "mother.name": {
        firstname: faker.person.firstName("female"),
        surname: sharedSurname,
      }
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
