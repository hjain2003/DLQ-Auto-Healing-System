// consumer/index.mjs

export const handler = async (event) => {
  for (const record of event.Records) {
    const body = JSON.parse(record.body);

    console.log("Processing message:", body);

    // -------- REAL VALIDATION --------
    if (!body.orderId) {
      throw new Error("BAD_PAYLOAD: orderId missing");
    }

    if (
      body.amount === undefined ||
      typeof body.amount !== "number" ||
      Number.isNaN(body.amount)
    ) {
      throw new Error("VALIDATION_ERROR: amount must be a number");
    }

    if (body.amount < 0) {
      throw new Error("VALIDATION_ERROR: amount cannot be negative");
    }

    // -------- SIMULATED FAILURE MODES --------
    if (body.simulateError === "TIMEOUT" && !body._healed) {
      console.log("Simulating timeout...");
      await new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Simulated timeout")), 12000)
      );
    }

    if (body.simulateError === "AUTH") {
      throw new Error("AUTH_ERROR: token expired");
    }

    if (body.simulateError === "BUG") {
      throw new Error("Unhandled null reference");
    }

    // -------- SUCCESS PATH --------
    console.log("Order processed successfully:", body.orderId);
  }
};
