/** Errors that carry a friendly message the assistant can speak to the user. */
export class GatewayError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly userMessage: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class AccountNotLinkedError extends GatewayError {
  constructor() {
    super(
      'ACCOUNT_NOT_LINKED',
      'No user matched the supplied token / platform id.',
      'Please link your account in the assistant app to use this skill.',
    );
  }
}

export class UnmappedIntentError extends GatewayError {
  constructor(intent: string) {
    super('UNMAPPED_INTENT', `No canonical action for intent "${intent}".`,
      "Sorry, I can't do that yet.");
  }
}

export class SiteNotFoundError extends GatewayError {
  constructor(spoken: string) {
    super('SITE_NOT_FOUND', `No site matched "${spoken}".`,
      `I couldn't find a site called ${spoken}.`);
  }
}

export class SceneNotFoundError extends GatewayError {
  constructor(spoken: string) {
    super('SCENE_NOT_FOUND', `No scene matched "${spoken}".`,
      `I couldn't find ${spoken} at your place.`);
  }
}

export class ApplianceNotFoundError extends GatewayError {
  constructor(appliance: string, scene: string) {
    super('APPLIANCE_NOT_FOUND', `No "${appliance}" in scene "${scene}".`,
      `I couldn't find a ${appliance} in the ${scene}.`);
  }
}

export class IotTimeoutError extends GatewayError {
  constructor(ms: number) {
    super(
      'IOT_TIMEOUT',
      `IoT command timed out after ${ms}ms.`,
      "Sorry, the device didn't respond in time. Please try again.",
    );
  }
}

export class CircuitOpenError extends GatewayError {
  constructor() {
    super(
      'IOT_CIRCUIT_OPEN',
      'IoT circuit breaker is OPEN — service temporarily unavailable.',
      'Sorry, the device service is temporarily unavailable. Please try again in a moment.',
    );
  }
}
