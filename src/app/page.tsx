import Chat from "@/components/Chat";

export default function Home() {
  return (
    <main className="flex min-h-screen h-screen flex-col items-center justify-between p-6 md:p-12 bg-[#F7F7F7]">
      <div className="w-full flex-1">
        <Chat />
        <footer className="mt-8 text-center text-[#666666] text-sm border-t border-[#E5E5E5]">
          <p>
            Please note that this content is AI generated and may not be 100%
            accurate.
          </p>
        </footer>
      </div>
    </main>
  );
}
