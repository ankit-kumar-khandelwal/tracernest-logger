# Production Debugging Playbook: Solving Issues Without Guesswork

When an API fails in production, standard logs rarely contain enough information to reproduce the failure locally. This playbook demonstrates how to use TracerNest to isolate, diagnose, and resolve unrepeatable production bugs.

---

## The Scenario: The Mysterious 500 Internal Server Error

A payment processing endpoint (`POST /api/checkout`) runs cleanly for 99.8% of requests. Suddenly, the operations channel alerts on a 500 error:
```text
Error: Cannot read properties of undefined (reading 'taxRate')
    at calculateTaxes (/app/dist/services/tax.js:42:18)
    at checkout (/app/dist/controllers/checkout.js:89:12)
```

In a traditional setup, you would ask:
- What was the customer's cart payload?
- What was the country code, currency, or billing address submitted?
- What was the client IP? Was it an automated bot or a legitimate user?
- What other logs occurred in the same second?

---

## Step-by-Step Investigation with TracerNest

### Step 1: Filter by Status Code and Severity
1. Open the TracerNest dashboard (`/tracernest`).
2. Set the severity filter pill to **ERROR**.
3. In the search bar, filter by `status:500` or search `/api/checkout`.

### Step 2: Inspect the Exact Request Metadata
Click on the failed request log entry to open the **Request & Response Inspector**:
- **HTTP Method & Path:** `POST /api/checkout`
- **Status Code:** `500 Internal Server Error`
- **Execution Duration:** `84ms`
- **Client IP:** `198.51.100.42`
- **Headers:** Inspected safe headers (e.g., `User-Agent: Mozilla/5.0...`, `Content-Type: application/json`).

### Step 3: Examine the Request Body
Inspect the captured `requestBody` tab:
```json
{
  "cartId": "cart_99120",
  "items": [
    { "sku": "WIDGET-01", "qty": 1, "price": 49.99 }
  ],
  "shippingAddress": {
    "country": "US",
    "state": null,
    "postalCode": "90210"
  }
}
```
**The Discovery:** The customer submitted `"state": null` instead of omitting the property or passing a valid string. The tax calculation module expected either an omitted key or a valid two-letter state code.

### Step 4: Examine the Response Body
Inspect the `responseBody` tab to verify what error payload was returned to the client:
```json
{
  "error": "Internal Server Error",
  "message": "An unexpected error occurred while processing checkout."
}
```

### Step 5: Correlate Application Logs by Timestamp
Using the timestamp from the HTTP request (`12:42:15.892`), switch to the **Terminal Logs** view:
- Search logs between `12:42:15.800` and `12:42:15.950`.
- Observe application database queries and tax service warning logs emitted during that exact execution window.

---

## Safe Reproduction Workflow

Once the exact request payload is extracted from TracerNest:

1. **Copy the Sanitized Payload:** Copy the JSON payload directly from the dashboard inspector.
2. **Write a Failing Regression Test:**
   ```typescript
   test('Checkout handles null shipping state gracefully', async () => {
     const res = await request(app)
       .post('/api/checkout')
       .send({
         cartId: 'cart_test_1',
         items: [{ sku: 'WIDGET-01', qty: 1, price: 49.99 }],
         shippingAddress: { country: 'US', state: null, postalCode: '90210' }
       });

     assert.strictEqual(res.status, 400);
     assert.strictEqual(res.body.message, 'Invalid shipping state provided');
   });
   ```
3. **Deploy the Patch with Confidence:** Verify the fix locally, deploy to production, and monitor the TracerNest dashboard to confirm zero subsequent 500 errors.

---

## Current Correlation Capabilities vs. Future Enhancements

### What TracerNest Currently Provides:
- **Timestamp-Based Correlation:** Millisecond timestamps on all HTTP requests and console logs.
- **Client IP Association:** Associating requests and errors originating from the same client IP.
- **Full Payload Capture:** Request bodies, response bodies, and sanitized headers.
- **Log Source Tagging:** Distinguishing `'http'`, `'stdout'`, `'stderr'`, and `'api'` log entries.

### Planned Enhancements (Roadmap):
- **Request Correlation IDs (`X-Request-Id`):** Automatically injecting and propagating request IDs through Node.js `AsyncLocalStorage` to associate all `console.log` statements within an HTTP execution context directly with the parent request entry.

