import { LinksManager } from "./links-manager";

export default function LinksPage() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Links</h1>
      </div>
      <div className="p-6">
        <LinksManager />
      </div>
    </div>
  );
}
