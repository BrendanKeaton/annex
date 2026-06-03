import { Particles } from "@/components/ui_imports/particles";

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="min-h-screen w-full flex items-center justify-center p-4">
      <div className="flex w-full max-w-300 min-h-[92vh] rounded-2xl overflow-hidden border border-annex-border-light/30 bg-annex-background">
        <div className="overflow-hidden relative hidden md:flex md:w-[42%] bg-annex-background-light m-3 rounded-xl">
          <h2 className="absolute bottom-10 left-10 text-annex-light-white font-mono text-3xl max-w-sm">
            Some things <span className=" ">aren&apos;t</span> meant to be
            shared.
          </h2>
          <div className="absolute top-10 left-10">
            <p className="font-mono text-2xl leading-none">Annex</p>
          </div>
          <Particles
            quantity={300}
            color="#4e4352"
            vx={0.25}
            vy={0.25}
            refresh={true}
            ease={30}
          />
        </div>
        <div className="flex-1 min-h-full">{children}</div>
      </div>
    </main>
  );
}
