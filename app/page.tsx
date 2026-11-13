
"use client";

import { useState } from "react";
import SepaMandateForm from "./components/SepaMandateForm";

export default function Home() {
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);

  async function startMandateSetup() {
    if (!customerId) return;

    setSetupLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/setup-intents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ customerId }),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || "Unable to initialize mandate setup.");
        return;
      }

      setClientSecret(result.clientSecret);
    } catch (error) {
      console.error("Mandate initialization error:", error);
      setMessage("Unable to connect to Stripe.");
    } finally {
      setSetupLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const form = e.currentTarget;
    const formData = new FormData(form);

    setLoading(true);
    setMessage("");

    const payload = {
      name: formData.get("name"),
      email: formData.get("email"),
      phone: formData.get("phone"),
      country: formData.get("country"),
      addressLine1: formData.get("addressLine1"),
      addressLine2: formData.get("addressLine2"),
      city: formData.get("city"),
      postalCode: formData.get("postalCode"),
    };

    try {
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        setMessage(result.error || "Registration failed.");
        return;
      }

      setCustomerId(result.customer.id);
      setMessage("Customer details saved successfully.");
      form.reset();
      setShowForm(false);
    } catch (error) {
      console.error("Customer registration error:", error);
      setMessage("Unable to connect to the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-sm border p-8">

        <h1 className="text-2xl font-semibold text-gray-900">
          SEPA Mandate Registration
        </h1>

        <p className="text-sm text-gray-500 mt-2">
          Register your details to set up your SEPA Direct Debit payment
          authorization.
        </p>

        {!showForm ? (
          <button
            onClick={() => {
              setShowForm(true);
              setMessage("");
            }}
            className="mt-8 w-full rounded-lg bg-blue-600 px-5 py-3 text-white font-medium hover:bg-blue-700"
          >
            Create SEPA Mandate
          </button>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-5">

            <h2 className="text-lg font-semibold text-gray-900">
              Customer Details
            </h2>

            <div>
              <label className="block text-sm font-medium mb-1">
                Full Name
              </label>
              <input
                type="text"
                name="name"
                required
                autoComplete="name"
                className="w-full rounded-lg border px-3 py-2"
                placeholder="Your full name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Email Address
              </label>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                className="w-full rounded-lg border px-3 py-2"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                name="phone"
                autoComplete="tel"
                className="w-full rounded-lg border px-3 py-2"
                placeholder="+44..."
              />
            </div>

            <h2 className="text-lg font-semibold text-gray-900 pt-2">
              Billing Address
            </h2>

            <div>
              <label className="block text-sm font-medium mb-1">
                Country
              </label>
              <input
                type="text"
                name="country"
                required
                autoComplete="country-name"
                className="w-full rounded-lg border px-3 py-2"
                placeholder="Country"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Address Line 1
              </label>
              <input
                type="text"
                name="addressLine1"
                required
                autoComplete="address-line1"
                className="w-full rounded-lg border px-3 py-2"
                placeholder="Street address"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Address Line 2 (Optional)
              </label>
              <input
                type="text"
                name="addressLine2"
                autoComplete="address-line2"
                className="w-full rounded-lg border px-3 py-2"
                placeholder="Apartment, suite, etc."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                City
              </label>
              <input
                type="text"
                name="city"
                required
                autoComplete="address-level2"
                className="w-full rounded-lg border px-3 py-2"
                placeholder="City"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Postal Code
              </label>
              <input
                type="text"
                name="postalCode"
                required
                autoComplete="postal-code"
                className="w-full rounded-lg border px-3 py-2"
                placeholder="Postal code"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 px-5 py-3 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Submitting..." : "Continue"}
            </button>

            {message && (
              <p
                className={`text-sm text-center ${
                  message.includes("successfully")
                    ? "text-green-600"
                    : "text-red-600"
                }`}
              >
                {message}
              </p>
            )}

            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setMessage("");
              }}
              className="w-full text-sm text-gray-600 underline"
            >
              Go Back
            </button>

          </form>
        )}

        {customerId && (
          <div className="mt-6 space-y-4">
            {!clientSecret ? (
              <button
                type="button"
                onClick={startMandateSetup}
                disabled={setupLoading}
                className="w-full rounded-lg bg-blue-600 px-5 py-3 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {setupLoading ? "Preparing..." : "Continue to Bank Authorization"}
              </button>
            ) : (
              <SepaMandateForm clientSecret={clientSecret} />
            )}
          </div>
        )}
      </div>
    </main>
  );
}
