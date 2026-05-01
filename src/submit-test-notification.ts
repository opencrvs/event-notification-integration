import { faker } from "@faker-js/faker";
import { v4 as uuidv4 } from "uuid";

type TokenResponse = { access_token: string; token_type: string };

type CreateEventRequest = {
  type: "birth";
  transactionId: string;
  createdAtLocation: string;
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
  transactionId: string;
  declaration: BirthDeclaration;
  annotation: Record<string, unknown>;
  createdAtLocation: string;
  type: "NOTIFY";
};

let AUTH_BASE = "https://auth.farajaland-integration.opencrvs.dev";
let EVENTS_BASE = "https://register.farajaland-integration.opencrvs.dev";
let LOCATIONS_BASE = "https://countryconfig.farajaland-integration.opencrvs.dev/";

if (process.env.LOCALHOST) {
  AUTH_BASE = "http://localhost:4040";
  EVENTS_BASE = "http://localhost:3000";
  LOCATIONS_BASE = "http://localhost:3040";
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
  payload: NotifyRequest,
  eventId: string
): Promise<unknown> {
  const res = await fetch(`${EVENTS_BASE}/api/events/events/${eventId}/notify`, {
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

type Location = {
  id: string;
  name?: string;
  alias?: string;
  [key: string]: any;
};

export async function getLocationIdByName(
  name: string,
  locations: Location[]
): Promise<string | undefined> {

  const match = locations.find(
    (loc) =>
      loc.name?.toLowerCase() === name.toLowerCase() ||
      loc.alias?.toLowerCase() === name.toLowerCase()
  );

  console.log(match)

  return match?.id;
}

export async function getLocations(
  accessToken:  string
): Promise<Location[] | undefined> {
 
  const res = await fetch(`${EVENTS_BASE}/api/events/locations`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch locations: ${res.status}`);
  }

  return await res.json() as Location[];

}



async function main() {

  const accessToken = await getAccessToken();
  const locations = await getLocations(accessToken);

  if (!locations) {
    throw new Error(`Failed to fetch locations`);
  }
  const officeId = await getLocationIdByName(
    "Ibombo District Office", locations
  );

  const hospitalId = await getLocationIdByName(
    "Ibombo District Hospital", locations
  );

  // 1) Create event -> capture eventId
  const createPayload: CreateEventRequest = {
    type: "birth",
    transactionId: uuidv4(),
    createdAtLocation: officeId as string,
  };

  const eventId = await createEvent(accessToken, createPayload);
  console.log("Created eventId:", eventId);

  // 2) Notify using eventId
  const sharedSurname = faker.person.lastName("male");
  const informantFirstName = faker.person.firstName("male");

  const notifyPayload: NotifyRequest = {
    transactionId: uuidv4(),
    createdAtLocation: officeId as string,
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
    type: "NOTIFY",
  };


  const notifyRes = await notifyEvent(accessToken, notifyPayload, eventId);
  console.log("Notify response:", notifyRes);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
