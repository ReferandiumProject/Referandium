export default function AboutPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-12 text-[#111827] sm:py-16">
      <div className="mx-auto max-w-3xl">
        <div className="mb-10 text-center sm:mb-14">
          <h1 className="text-3xl font-bold tracking-tight text-[#111827] sm:text-4xl">
            About Referandium
          </h1>
          <p className="mt-4 text-base text-[#6B7280]">
            What it is, who it is for, and where it is today.
          </p>
        </div>

        <div className="space-y-8">
          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-semibold text-[#111827] sm:text-2xl">
              What Referandium is
            </h2>
            <p className="mt-4 text-[#6B7280]">
              Referandium is a platform where early-stage startups are evaluated by a crowd before they can raise money.
            </p>
            <p className="mt-4 text-[#6B7280]">
              Anyone can back or reject a listed startup using free daily voting tokens. These tokens carry no monetary value: they cannot be bought, sold, withdrawn, or converted into anything else. They exist only to let people signal whether they believe a startup should advance.
            </p>
            <p className="mt-4 text-[#6B7280]">
              A startup that reaches the vote threshold it set for itself opens a capital raise, where supporters can buy in with real funds. Reaching the capital target it set completes the raise.
            </p>
          </section>

          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-semibold text-[#111827] sm:text-2xl">
              Who it is for
            </h2>
            <p className="mt-4 text-[#6B7280]">
              The platform is designed for small and local ventures: solo founders, small teams, and businesses solving a specific local problem. It is not aimed at startups chasing global scale.
            </p>
            <p className="mt-4 text-[#6B7280]">
              This is a deliberate choice about the size of raise the platform can realistically support, not a limitation to work around. The model works best for ventures that can be understood and evaluated by the communities they serve.
            </p>
          </section>

          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-semibold text-[#111827] sm:text-2xl">
              What makes it different
            </h2>
            <p className="mt-4 text-[#6B7280]">
              Money follows validation rather than preceding it. Nobody can put real funds into a startup the crowd has not already endorsed, and the validation stage costs participants nothing.
            </p>
          </section>

          <section className="rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-sm sm:p-8">
            <h2 className="text-xl font-semibold text-[#111827] sm:text-2xl">
              Current status
            </h2>
            <p className="mt-4 text-[#6B7280]">
              The platform currently runs on Solana&apos;s devnet for testing. Voting and capital raises work today. On-chain token issuance for graduated startups is still in development.
            </p>
          </section>

          {/*
            PLACEHOLDER: Team or founder background.
            Add the people behind Referandium here — names, roles, and short
            background only. Do not invent anything.
          */}
          <section className="rounded-2xl border border-dashed border-[#E5E7EB] bg-[#F9FAFB] p-6 sm:p-8">
            <h2 className="text-xl font-semibold text-[#111827] sm:text-2xl">
              [TEAM — to be written]
            </h2>
            <p className="mt-4 text-[#6B7280]">
              [Founder or team background to be added by the founders.]
            </p>
          </section>

          {/*
            PLACEHOLDER: Why the platform was built.
            Add the origin story or motivation for building Referandium here.
            Keep it factual and specific to the founders' own experience.
          */}
          <section className="rounded-2xl border border-dashed border-[#E5E7EB] bg-[#F9FAFB] p-6 sm:p-8">
            <h2 className="text-xl font-semibold text-[#111827] sm:text-2xl">
              [STORY — to be written]
            </h2>
            <p className="mt-4 text-[#6B7280]">
              [The story of why Referandium was built, to be added by the founders.]
            </p>
          </section>

          {/*
            PLACEHOLDER: Contact details.
            Add a real contact email, social link, or support channel here.
            Do not use placeholder text that looks real, and do not invent any
            address that does not exist.
          */}
          <section className="rounded-2xl border border-dashed border-[#E5E7EB] bg-[#F9FAFB] p-6 sm:p-8">
            <h2 className="text-xl font-semibold text-[#111827] sm:text-2xl">
              [CONTACT — to be written]
            </h2>
            <p className="mt-4 text-[#6B7280]">
              [Contact information to be added by the founders.]
            </p>
          </section>

          {/*
            PLACEHOLDER: Company entity information.
            Add legal entity name, registration country, or any other company
            details here. Do not invent or assume any of this information.
          */}
          <section className="rounded-2xl border border-dashed border-[#E5E7EB] bg-[#F9FAFB] p-6 sm:p-8">
            <h2 className="text-xl font-semibold text-[#111827] sm:text-2xl">
              [COMPANY — to be written]
            </h2>
            <p className="mt-4 text-[#6B7280]">
              [Company or entity information to be added by the founders.]
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
