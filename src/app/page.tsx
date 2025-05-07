import Chat from "@/components/Chat";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-6 md:p-12 lg:p-24 bg-[#F7F7F7]">
      <div className="z-10 w-full items-center justify-between font-mono text-sm lg:flex">
        <div className="fixed bottom-0 left-0 flex h-48 w-full items-end justify-center bg-gradient-to-t from-[#F7F7F7] via-[#F7F7F7] lg:static lg:h-auto lg:w-auto lg:bg-none">
          <p className="pointer-events-none flex place-items-center gap-2 p-4 lg:p-0 text-[#FF5800] font-bold">
            Foundry Local Document Generation
          </p>
        </div>
      </div>

      <div className="w-full flex-1">
        <Chat />
      </div>
    </main>
  );
}
