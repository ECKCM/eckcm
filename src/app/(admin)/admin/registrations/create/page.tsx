import { AdminRegistrationForm } from "./admin-registration-form";

export default function AdminRegistrationCreatePage() {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h1 className="text-lg font-semibold">Manual Registration</h1>
      </div>
      <div className="p-6">
        <AdminRegistrationForm />
      </div>
    </div>
  );
}
