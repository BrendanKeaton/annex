export default function SubscriptionPage() {
  return (
    <div className="flex flex-col items-center px-6 py-12 sm:px-12 lg:px-24">
      <div className="w-full max-w-3xl flex flex-col gap-10">
        <div>
          <h1 className="text-2xl font-mono font-semibold text-white">
            Subscription
          </h1>
          <p className="text-sm text-annex-dark-gray mt-1">
            Manage your plan and billing.
          </p>
        </div>

        <section className="flex flex-col gap-3">
          <div className="rounded-lg border border-white/8 bg-white/2 p-10 flex items-center justify-center">
            <p className="text-sm text-annex-dark-gray font-mono">
              Coming soon.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
