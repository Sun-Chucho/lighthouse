type NgeniusAmount = {
  currencyCode: string;
  value: number;
};

type NgeniusOrderInput = {
  amount: NgeniusAmount;
  emailAddress: string;
  bookingReference: string;
  description: string;
  redirectUrl: string;
  cancelUrl: string;
};

type NgeniusOrderResult = {
  orderReference: string;
  paymentUrl: string;
  raw: Record<string, unknown>;
};

const PAYMENT_CONTENT_TYPE = "application/vnd.ni-payment.v2+json";
const IDENTITY_CONTENT_TYPE = "application/vnd.ni-identity.v1+json";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

function getGatewayBaseUrl() {
  return trimTrailingSlash(process.env.NGENIUS_GATEWAY_URL?.trim() || "https://api-gateway.sandbox.nbc.ngenius-payments.com");
}

function getIdentityEndpoint() {
  const explicit = process.env.NGENIUS_IDENTITY_URL?.trim();
  if (explicit) {
    const cleaned = trimTrailingSlash(explicit);
    return cleaned.endsWith("/identity/auth/access-token") ? cleaned : `${cleaned}/identity/auth/access-token`;
  }

  return `${getGatewayBaseUrl()}/identity/auth/access-token`;
}

function getOrderEndpoint() {
  const outletRef = getRequiredEnv("NGENIUS_OUTLET_REF");
  return `${getGatewayBaseUrl()}/transactions/outlets/${outletRef}/orders`;
}

async function readGatewayJson(response: Response) {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

function extractGatewayError(payload: Record<string, unknown>, fallback: string) {
  const candidates = [
    payload.message,
    payload.error,
    payload.error_description,
    payload.description,
  ];

  const text = candidates.find((value) => typeof value === "string" && value.trim().length > 0);
  return typeof text === "string" ? text : fallback;
}

export async function getNgeniusAccessToken() {
  const apiKey = getRequiredEnv("NGENIUS_API_KEY");
  const realmName = process.env.NGENIUS_REALM?.trim() || "NBCsandbox";
  const endpoint = getIdentityEndpoint();

  const attempts = [
    {
      headers: {
        Authorization: `Basic ${apiKey}`,
        Accept: IDENTITY_CONTENT_TYPE,
        "Content-Type": IDENTITY_CONTENT_TYPE,
      },
      body: JSON.stringify({ realmName }),
    },
    {
      headers: {
        Authorization: `Basic ${apiKey}`,
        Accept: IDENTITY_CONTENT_TYPE,
        "Content-Type": IDENTITY_CONTENT_TYPE,
      },
      body: JSON.stringify({ grant_type: "client_credentials", realm: realmName }),
    },
    {
      headers: {
        Authorization: `Basic ${apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
    },
  ];

  let lastError = "Could not authenticate payment gateway.";
  for (const attempt of attempts) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: attempt.headers,
      body: attempt.body,
      cache: "no-store",
    });
    const payload = await readGatewayJson(response);

    if (response.ok && typeof payload.access_token === "string" && payload.access_token.length > 0) {
      return payload.access_token;
    }

    lastError = extractGatewayError(payload, `Payment gateway authentication failed with status ${response.status}.`);
  }

  throw new Error(lastError);
}

export async function createNgeniusPayPageOrder(input: NgeniusOrderInput): Promise<NgeniusOrderResult> {
  const accessToken = await getNgeniusAccessToken();
  const response = await fetch(getOrderEndpoint(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: PAYMENT_CONTENT_TYPE,
      "Content-Type": PAYMENT_CONTENT_TYPE,
    },
    body: JSON.stringify({
      action: process.env.NGENIUS_ACTION?.trim() || "PURCHASE",
      amount: input.amount,
      emailAddress: input.emailAddress,
      merchantAttributes: {
        redirectUrl: input.redirectUrl,
        cancelUrl: input.cancelUrl,
      },
      merchantDefinedData: {
        bookingReference: input.bookingReference,
        description: input.description,
      },
    }),
    cache: "no-store",
  });

  const payload = await readGatewayJson(response);
  const paymentLink = payload._links && typeof payload._links === "object"
    ? (payload._links as Record<string, unknown>).payment
    : null;
  const paymentUrl = paymentLink && typeof paymentLink === "object"
    ? (paymentLink as Record<string, unknown>).href
    : null;
  const orderReference = typeof payload.reference === "string" ? payload.reference : "";

  if (!response.ok || typeof paymentUrl !== "string" || paymentUrl.length === 0 || !orderReference) {
    throw new Error(extractGatewayError(payload, `Payment order creation failed with status ${response.status}.`));
  }

  return {
    orderReference,
    paymentUrl,
    raw: payload,
  };
}

export async function getNgeniusOrderStatus(orderReference: string) {
  const accessToken = await getNgeniusAccessToken();
  const outletRef = getRequiredEnv("NGENIUS_OUTLET_REF");
  const response = await fetch(`${getGatewayBaseUrl()}/transactions/outlets/${outletRef}/orders/${orderReference}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: PAYMENT_CONTENT_TYPE,
    },
    cache: "no-store",
  });
  const payload = await readGatewayJson(response);

  if (!response.ok) {
    throw new Error(extractGatewayError(payload, `Payment status lookup failed with status ${response.status}.`));
  }

  return payload;
}
