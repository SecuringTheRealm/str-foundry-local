import Chat from '@/components/Chat';

export default function Home() {
  return (
    <main className="flex min-h-screen h-screen flex-col items-center justify-between p-6 md:p-12 lg:p-24 bg-[#F7F7F7]">
      <div className="w-full flex-1">
        <Chat />
      </div>
    </main>
  );
}
