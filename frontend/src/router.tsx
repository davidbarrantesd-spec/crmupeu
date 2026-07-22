import { lazy } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from './layouts/AppLayout'

const LoginPage = lazy(() => import('./pages/Login'))
const DashboardPage = lazy(() => import('./pages/Dashboard'))
const ContactsPage = lazy(() => import('./pages/contacts/Contacts'))
const ContactDetailPage = lazy(() => import('./pages/contacts/ContactDetail'))
const ContactImportPage = lazy(() => import('./pages/contacts/ContactImport'))
const DebtsPage = lazy(() => import('./pages/Debts'))
const CampaignsPage = lazy(() => import('./pages/campaigns/Campaigns'))
const CampaignWizardPage = lazy(() => import('./pages/campaigns/CampaignWizard'))
const CampaignDetailPage = lazy(() => import('./pages/campaigns/CampaignDetail'))
const CallsPage = lazy(() => import('./pages/Calls'))
const PromptsPage = lazy(() => import('./pages/Prompts'))
const AgreementsPage = lazy(() => import('./pages/Agreements'))
const FollowUpsPage = lazy(() => import('./pages/FollowUps'))
const WhatsAppPage = lazy(() => import('./pages/WhatsApp'))
const ReportsPage = lazy(() => import('./pages/Reports'))
const UsersPage = lazy(() => import('./pages/Users'))
const RolesPage = lazy(() => import('./pages/Roles'))
const SettingsPage = lazy(() => import('./pages/Settings'))
const AuditPage = lazy(() => import('./pages/Audit'))

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'contacts', element: <ContactsPage /> },
      { path: 'contacts/import', element: <ContactImportPage /> },
      { path: 'contacts/:uuid', element: <ContactDetailPage /> },
      { path: 'debts', element: <DebtsPage /> },
      { path: 'campaigns', element: <CampaignsPage /> },
      { path: 'campaigns/new', element: <CampaignWizardPage /> },
      { path: 'campaigns/:uuid/edit', element: <CampaignWizardPage /> },
      { path: 'campaigns/:uuid', element: <CampaignDetailPage /> },
      { path: 'calls', element: <CallsPage /> },
      { path: 'prompts', element: <PromptsPage /> },
      { path: 'agreements', element: <AgreementsPage /> },
      { path: 'follow-ups', element: <FollowUpsPage /> },
      { path: 'whatsapp', element: <WhatsAppPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'users', element: <UsersPage /> },
      { path: 'roles', element: <RolesPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'audit', element: <AuditPage /> },
    ],
  },
])
