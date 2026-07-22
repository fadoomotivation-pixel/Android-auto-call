import { createClient } from "@/lib/supabase/server";
import { CompanyPicker } from "../whatsapp/CompanyPicker";
import { AttendanceTable } from "./AttendanceTable";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: { month?: string; company?: string };
}) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // The super admin serves EVERY company equally — never pin them to the
  // company their own profile happens to sit in. They pick via ?company=.
  const [{ data: profile }, { data: pa }] = await Promise.all([
    supabase.from("profiles").select("company_id").eq("id", user.id).maybeSingle<{ company_id: string | null }>(),
    supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);
  const isSuper = !!pa;

  const { data: companies } = isSuper
    ? await supabase.from("companies").select("id, name").order("name").returns<{ id: string; name: string | null }[]>()
    : { data: null };
  const companyId = isSuper
    ? (searchParams.company ?? companies?.[0]?.id ?? null)
    : (profile?.company_id ?? null);
  if (!companyId) return <div>No company</div>;

  // Determine month to show (default to current month)
  const now = new Date();
  const yearMonth = searchParams.month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  // Format dates for Supabase query (e.g. '2026-06-01' to '2026-06-30')
  const startDate = `${yearMonth}-01`;
  const [y, m] = yearMonth.split("-");
  const endDay = new Date(parseInt(y), parseInt(m), 0).getDate();
  const endDate = `${yearMonth}-${endDay}`;

  // Fetch all attendance for the company in this month
  const { data: attendanceData, error } = await supabase
    .from("attendance")
    .select("*, profiles(full_name)")
    .eq("company_id", companyId)
    .gte("work_date", startDate)
    .lte("work_date", endDate)
    .order("work_date", { ascending: false })
    .order("punch_in_at", { ascending: false });

  if (error) {
    console.error(error);
  }

  const attendanceList = attendanceData || [];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div>
          <h2>📅 Attendance Dashboard</h2>
          <p className="subtitle">View team punch-ins, selfies, and locations.</p>
        </div>
      </div>

      {isSuper && <CompanyPicker companies={companies ?? []} selected={companyId} />}
      <AttendanceTable key={companyId} initialData={attendanceList} currentMonth={yearMonth} />
    </div>
  );
}
