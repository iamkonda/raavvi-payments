
"use client";

import { useState } from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import { stripePromise } from "@/lib/stripe-client";

interface SepaMandateFormProps {
  clientSecret: string;
}

function MandateForm({ clientSecret }: SepaMandateFormProps) {
  const stripe = useStripe();
  const elements = useElements();

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!stripe || !elements) {
      setMessage("Stripe is still loading. Please try again.");
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const { error, setupIntent } = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/?mandate=complete`,
        },
        redirect: "if_required",
      });

      if (error) {
        setMessage(error.message || "Unable to set up your bank account.");
        return;
      }

      if (setupIntent?.status === "succeeded") {
        setMessage("Your bank account authorization was completed.");
      } else {
        setMessage(
          "Your authorization is being processed. Please wait for confirmation."
        );
      }
    } catch (error) {
      console.error("SEPA setup error:", error);
      setMessage("Unable to complete authorization. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">
          Bank Account Authorization
        </h2>

        <p className="text-sm text-gray-500 mt-1">
          Enter your bank account details to authorize future SEPA Direct
          Debit payments.
        </p>
      </div>

      <div className="rounded-lg border p-4">
        <PaymentElement />
      </div>

      <button
        type="submit"
        disabled={!stripe || !elements || loading}
        className="w-full rounded-lg bg-blue-600 px-5 py-3 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {loading ? "Processing..." : "Authorize SEPA Mandate"}
      </button>

      {message && (
        <p className="text-sm text-center text-gray-700" role="status">
          {message}
        </p>
      )}
    </form>
  );
}

export default function SepaMandateForm({
  clientSecret,
}: SepaMandateFormProps) {
  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: "stripe",
        },
      }}
    >
      <MandateForm clientSecret={clientSecret} />
    </Elements>
  );
}
