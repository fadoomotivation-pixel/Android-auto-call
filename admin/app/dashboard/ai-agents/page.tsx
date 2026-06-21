import AgentDashboard from './AgentDashboard';

export const metadata = {
  title: 'AI Employees | Telecaller CRM',
};

export default function AIAgentsPage() {
  return (
    <div className="p-6">
      <AgentDashboard />
    </div>
  );
}
