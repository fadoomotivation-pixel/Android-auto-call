import { Metadata } from 'next';
import LandingClient from './LandingClient';

export const metadata: Metadata = {
  title: 'Call Pro AI - Real Estate Auto Dialer & CRM',
  description: 'The AI-powered calling CRM built specifically for real estate sales teams. Auto-dial leads, get hot-lead alerts, and close more plots.',
};

export default function LandingPage() {
  return <LandingClient />;
}
